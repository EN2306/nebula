import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.mjs';
import { callAI } from '../ai.mjs';
async function fixture(t, options = {}) {
  const app = await createApp({ dbPath: ':memory:', ...options });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${app.server.address().port}`;
  t.after(() => app.close());
  function client() {
    let cookie = '',
      csrf = '';
    return async (route, body, expect = 200, extra = {}) => {
      const res = await fetch(url + '/api' + route, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          cookie,
          ...(body === undefined
            ? {}
            : { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }),
          ...extra,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const value = await res.json();
      assert.equal(res.status, expect, JSON.stringify(value));
      if (res.headers.get('set-cookie')) cookie = res.headers.get('set-cookie').split(';')[0];
      if (value.csrf) csrf = value.csrf;
      return value;
    };
  }
  return { app, client, url };
}
const credentials = {
  name: 'Planner QA',
  email: 'planner@example.test',
  password: 'qa-only-password-123',
};
test('planner accounts, access controls, retired routes and preserved legacy records', async (t) => {
  const { app, client } = await fixture(t),
    admin = client(),
    other = client();
  await admin('/state', undefined, 401);
  await admin('/setup', credentials, 201);
  app.db.exec(
    'CREATE TABLE workspace(id INTEGER PRIMARY KEY,body TEXT);CREATE TABLE messages(id INTEGER PRIMARY KEY,user_id TEXT,role TEXT,content TEXT,created TEXT)',
  );
  const legacy = JSON.stringify({
    teams: [{ id: 'Charlie' }, { id: 'Delta' }],
    jobs: [{ title: 'Legacy work' }],
  });
  app.db.prepare('INSERT INTO workspace VALUES(1,?)').run(legacy);
  const state = await admin('/state');
  assert.deepEqual(Object.keys(state).sort(), ['ai', 'events', 'user', 'users', 'version']);
  assert(!('teamId' in state.user));
  for (const route of [
    '/profile',
    '/absence',
    '/seed',
    '/jobs',
    '/job/action',
    '/proposals',
    '/approve',
    '/notifications/read',
    '/ai/draft',
  ])
    await admin(route, { version: state.version }, 410);
  assert.equal(app.db.prepare('SELECT body FROM workspace').get().body, legacy);
  await admin(
    '/users',
    { ...credentials, email: 'new@example.test', role: 'scheduler', version: state.version },
    403,
    { 'X-CSRF-Token': 'wrong' },
  );
  await admin(
    '/users',
    { ...credentials, email: 'new@example.test', role: 'engineer', version: state.version },
    400,
  );
  await admin(
    '/users',
    { ...credentials, email: 'new@example.test', role: 'scheduler', version: state.version },
    201,
  );
  await admin(
    '/users',
    { ...credentials, email: 'stale@example.test', role: 'scheduler', version: state.version },
    409,
  );
  await other('/login', { email: 'new@example.test', password: credentials.password });
  assert.equal((await other('/state')).users.length, 2);
  app.db
    .prepare(
      "INSERT INTO users SELECT 'old-worker','Old worker','worker@example.test',password,'engineer','Charlie' FROM users LIMIT 1",
    )
    .run();
  const worker = client();
  await worker('/login', { email: 'worker@example.test', password: credentials.password });
  for (const route of ['/ps1/state', '/chat/history?scenario=A'])
    await worker(route, undefined, 403);
  await worker('/chat', { message: 'Show contracts', scenario: 'A' }, 403);
  assert.equal(
    app.db.prepare("SELECT role FROM users WHERE id='old-worker'").get().role,
    'engineer',
  );
  await admin('/logout', {});
  await admin('/state', undefined, 401);
});
test('chat uses only selected weekly plan, isolates history, and never mutates plans', async (t) => {
  const calls = [];
  const { app, client } = await fixture(t, {
    fetcher: async (url, options) => {
      calls.push(JSON.parse(options.body));
      return {
        ok: true,
        json: async () => ({
          output: [
            { content: [{ type: 'output_text', text: 'Review the imported contract limits.' }] },
          ],
        }),
      };
    },
  });
  const admin = client();
  await admin('/setup', credentials, 201);
  await admin('/ai/config', {
    provider: 'openai',
    model: 'test-model',
    key: 'stub-only-not-a-real-key',
  });
  const imported = await admin('/ps1/import', { version: 0, sample: true });
  const project = imported.summary.projects[0];
  assert(project.workfronts > 0);
  assert(project.weekly_cap > 0);
  assert(project.contract_deadline);
  await admin('/ps1/solve', { version: imported.version, scenario: 'A' });
  app.db.exec(
    'CREATE TABLE messages(id INTEGER PRIMARY KEY,user_id TEXT,role TEXT,content TEXT,created TEXT)',
  );
  app.db
    .prepare(
      "INSERT INTO messages SELECT 1,id,'user','Legacy Charlie secret','old' FROM users LIMIT 1",
    )
    .run();
  const before = app.db.prepare('SELECT body FROM ps1_workspace').get().body;
  await admin('/chat', { message: 'Explain access limits.', scenario: 'A' });
  const snapshot = JSON.parse(calls[0].instructions.split('AUTHORIZED DATA:\n')[1]);
  assert.equal(snapshot.selected_scenario, 'A');
  assert(snapshot.plan.report.feasible);
  assert(snapshot.dataset.projects[0].workfronts > 0);
  assert(!('teams' in snapshot));
  assert(!JSON.stringify(calls[0]).includes('Legacy Charlie secret'));
  assert.equal((await admin('/chat/history?scenario=A')).length, 2);
  assert.equal((await admin('/chat/history?scenario=B')).length, 0);
  await admin('/chat', { message: 'Any result?', scenario: 'B' });
  assert.equal(JSON.parse(calls[1].instructions.split('AUTHORIZED DATA:\n')[1]).plan, null);
  assert.equal(calls[1].input.length, 1);
  assert.equal(app.db.prepare('SELECT body FROM ps1_workspace').get().body, before);
  await admin('/ps1/import', { version: imported.version, sample: true });
  assert.equal((await admin('/chat/history?scenario=A')).length, 0);
});
test('provider error messages do not leak secrets; both transports parse real response shapes', async () => {
  const key = 'stub-secret';
  await assert.rejects(
    callAI({ key, provider: 'openai', model: 'test' }, [], 'system', async () => ({
      ok: false,
      status: 429,
    })),
    (e) => e.message.includes('429') && !e.message.includes(key),
  );
  for (const provider of ['openai', 'anthropic']) {
    let sent;
    const answer = await callAI(
      { key, provider, model: 'test' },
      [{ role: 'user', content: 'Hello' }],
      'system',
      async (url, options) => {
        sent = JSON.parse(options.body);
        return {
          ok: true,
          json: async () =>
            provider === 'openai'
              ? { output: [{ content: [{ type: 'output_text', text: 'OK' }] }] }
              : { content: [{ type: 'text', text: 'OK' }] },
        };
      },
    );
    assert.equal(answer, 'OK');
    assert.equal(sent.model, 'test');
  }
});
