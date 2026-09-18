import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.mjs';
import { deploymentConfig } from '../deployment.mjs';
import http from 'node:http';

test('public deployment validates hosts/origins, protects setup and uses secure sessions', async (t) => {
  const app = createApp({
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
