import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.mjs';
import { deploymentConfig, hostingOptions } from '../deployment.mjs';
import http from 'node:http';
import { once } from 'node:events';

test('public deployment validates hosts/origins, protects setup and uses secure sessions', async (t) => {
  const app = await createApp({
    dbPath: ':memory:',
    publicOrigin: 'https://judge.example',
    setupToken: 'test-setup-token',
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());
  const base = 'http://127.0.0.1:' + app.server.address().port;
  const credentials = { name: 'Judge', email: 'judge@example.test', password: 'test-password-123' };
  const request = (route, headers, body) =>
    new Promise((resolve, reject) => {
      const req = http.request(base + route, { method: body ? 'POST' : 'GET', headers }, (res) => {
        res.resume();
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers }));
      });
      req.on('error', reject);
      req.end(body ? JSON.stringify(body) : undefined);
    });
  const post = (body, origin = 'https://judge.example') =>
    request(
      '/api/setup',
      { host: 'judge.example', origin, 'content-type': 'application/json' },
      body,
    );
  assert.equal((await request('/api/health', { host: 'evil.example' })).status, 403);
  assert.equal((await post(credentials)).status, 403);
  assert.equal(
    (await post({ ...credentials, setupToken: 'test-setup-token' }, 'https://evil.example')).status,
    403,
  );
  const response = await post({ ...credentials, setupToken: 'test-setup-token' });
  assert.equal(response.status, 201);
  assert.match(response.headers['set-cookie'][0], /; Secure/);
  assert.equal((await post({ ...credentials, setupToken: 'test-setup-token' })).status, 409);
  for (const origin of [
    'http://judge.example',
    'https://judge.example/path',
    'https://user:pass@judge.example',
  ])
    assert.throws(() => deploymentConfig(origin), /HTTPS origin/);
});

test('Docker entrypoint trusts exact Vercel aliases and reports shared storage', async (t) => {
  const options = hostingOptions({
    VERCEL: '1',
    VERCEL_PROJECT_PRODUCTION_URL: 'trackwork.vercel.app',
    VERCEL_URL: 'trackwork-build.vercel.app',
    SUPABASE_DB_URL: 'configured',
  });
  assert.equal(options.ephemeral, false);
  const app = await createApp({ ...options, dbPath: ':memory:' });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());
  for (const host of [
    'trackwork.vercel.app',
    'trackwork-build.vercel.app',
    'attacker.vercel.app',
  ]) {
    const status = await new Promise((resolve, reject) => {
      const request = http.get(
        `http://127.0.0.1:${app.server.address().port}/api/health`,
        {
          headers: { host },
        },
        (response) => {
          response.resume();
          response.on('end', () => resolve(response.statusCode));
        },
      );
      request.on('error', reject);
    });
    assert.equal(status, host.startsWith('attacker') ? 403 : 200);
  }
});

test('serverless adapter handles parsed bodies, sessions, exact aliases and worker assets without listening', async (t) => {
  const app = await createApp({
    dbPath: ':memory:',
    publicOrigin: 'https://trackwork.vercel.app',
    additionalOrigins: ['https://trackwork-build.vercel.app'],
    setupToken: 'serverless-test-setup',
    ephemeral: true,
  });
  const gateway = http.createServer(async (req, res) => {
    if (req.method === 'POST') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      // Simulate Vercel's parsed-body helper consuming the original stream.
      req.body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    }
    app.server.emit('request', req, res);
  });
  gateway.listen(0, '127.0.0.1');
  await once(gateway, 'listening');
  t.after(async () => {
    await new Promise((resolve) => gateway.close(resolve));
    app.db.close();
  });
  const base = 'http://127.0.0.1:' + gateway.address().port;
  let cookie = '',
    csrf = '';
  const request = (route, body, host = 'trackwork-build.vercel.app') =>
    new Promise((resolve, reject) => {
      const req = http.request(
        base + route,
        {
          method: body === undefined ? 'GET' : 'POST',
          headers: {
            host,
            origin: 'https://' + host,
            cookie,
            'content-type': 'application/json',
            'x-csrf-token': csrf,
          },
        },
        (res) => {
          let content = '';
          res.on('data', (chunk) => (content += chunk));
          res.on('end', () => {
            if (res.headers['set-cookie']) cookie = res.headers['set-cookie'][0].split(';')[0];
            const data = res.headers['content-type']?.includes('application/json')
              ? JSON.parse(content)
              : content;
            if (data.csrf) csrf = data.csrf;
            resolve({ status: res.statusCode, data });
          });
        },
      );
      req.on('error', reject);
      req.end(body === undefined ? undefined : JSON.stringify(body));
    });
  assert.equal(app.server.listening, false);
  assert.equal((await request('/api/health')).data.ephemeral, true);
  assert.equal((await request('/api/health', undefined, 'wrong.vercel.app')).status, 403);
  assert.equal(
    (
      await request('/api/setup', {
        setupToken: 'serverless-test-setup',
        name: 'Hosted planner',
        email: 'host@test.local',
        password: 'serverless-test-password',
      })
    ).status,
    201,
  );
  assert.equal((await request('/api/me', undefined, 'trackwork.vercel.app')).status, 200);
  const imported = await request('/api/ps1/import', { version: 0, sample: true });
  assert.equal(imported.status, 200);
  const solved = await request('/api/ps1/solve', { version: imported.data.version, scenario: 'A' });
  assert.equal(solved.status, 200);
  assert(solved.data.report.feasible);
  const insight = await request('/api/ps1/insights?scenario=A');
  assert.equal(insight.data.deadline_watch.length, 54);
  for (const asset of ['/overview-ui.js', '/design.css'])
    assert.equal((await request(asset)).status, 200);
});
