import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { rootCertificates } from 'node:tls';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import pg from 'pg';

// This is a private application schema, deliberately outside Supabase's public
// Data API. Browser clients never receive the database credentials.
export async function openDatabase({ dbPath, databaseUrl, databaseSsl }) {
  if (!databaseUrl) {
    if (dbPath !== ':memory:') mkdirSync(path.dirname(dbPath), { recursive: true });
    const db = new DatabaseSync(dbPath);
    db.transaction = (work) => work();
    db.kind = 'sqlite';
    return db;
  }
  const url = new URL(databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(url.protocol))
    throw Error('SUPABASE_DB_URL must be a PostgreSQL connection string.');
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  // Do not allow connection-string sslmode parameters to weaken TLS validation.
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(key);
  const pool = new pg.Pool({
    connectionString: url.toString(),
    ssl:
      databaseSsl ??
      (local
        ? false
        : {
            rejectUnauthorized: true,
            ca: [
              ...rootCertificates,
              readFileSync(new URL('./certs/supabase-ca.crt', import.meta.url), 'utf8'),
            ],
          }),
    max: 3,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 10000,
  });
  pool.on('error', (error) => console.error('Database pool error:', error.code || 'connection'));
  const context = new AsyncLocalStorage();
  const query = async (sql, params = []) => {
    const client = context.getStore();
    if (!client) throw Error('Database operation outside a transaction.');
    if (/sqlite_master/.test(sql)) return { rows: [], rowCount: 0 };
    let index = 0;
    sql = sql
      .replace(/\?/g, () => `$${++index}`)
      .replace(/PRAGMA[^;]+;/g, '')
      .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/g, 'BIGSERIAL PRIMARY KEY')
      .replace(/expires INTEGER/g, 'expires BIGINT');
    if (sql.startsWith('INSERT OR IGNORE'))
      sql = sql.replace('INSERT OR IGNORE', 'INSERT') + ' ON CONFLICT DO NOTHING';
    if (sql === 'BEGIN IMMEDIATE') sql = 'SAVEPOINT team_change';
    else if (sql === 'COMMIT') sql = 'RELEASE SAVEPOINT team_change';
    else if (sql === 'ROLLBACK') sql = 'ROLLBACK TO SAVEPOINT team_change';
    return client.query(sql, params);
  };
  const db = {
    kind: 'supabase',
    exec: (sql) => query(sql),
    prepare: (sql) => ({
      get: async (...args) => (await query(sql, args)).rows[0],
      all: async (...args) => (await query(sql, args)).rows,
      run: async (...args) => ({ changes: (await query(sql, args)).rowCount }),
    }),
    transaction: async (work, { readOnly = false } = {}) => {
      if (context.getStore()) return work();
      const client = await pool.connect();
      try {
        await client.query(readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
        // The app has one shared programme. Serialize its transactions across
        // replicas so JSON workspaces and their audit history update atomically.
        if (!readOnly) await client.query('SELECT pg_advisory_xact_lock(783451029)');
        await client.query('SET LOCAL search_path TO trackwork');
        const result = await context.run(client, work);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
  try {
    await db.transaction(async () => {
      await query('CREATE SCHEMA IF NOT EXISTS trackwork');
      await query('REVOKE ALL ON SCHEMA trackwork FROM PUBLIC');
    });
  } catch (error) {
    await pool.end();
    throw error;
  }
  return db;
}
