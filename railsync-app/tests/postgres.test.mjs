import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server.mjs';

test(
  'Postgres persists accounts, sessions, plans and previews across replicas; rolls back failed writes',
  {
    skip: !process.env.TRACKWORK_TEST_DATABASE_URL,
  },
  async (t) => {
    const databaseUrl = process.env.TRACKWORK_TEST_DATABASE_URL;
    const initialAccounts = ['scheduler', 'supervisor', 'manager', 'worker'].map((role) => ({
      role,
      name: role,
      email: `${role}-${randomUUID()}@test.local`,
      password: 'postgres-test-password',
    }));
    const start = async () => {
      const app = await createApp({ databaseUrl, databaseSsl: false, initialAccounts });
      await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
      t.after(() => app.close());
      return { app, url: `http://127.0.0.1:${app.server.address().port}` };
    };
    const first = await start(),
      second = await start();
    let cookie = '',
      csrf = '';
    const request = async (instance, route, body, expected = 200) => {
      const response = await fetch(instance.url + '/api' + route, {
        method: body ? 'POST' : 'GET',
        headers: { cookie, 'content-type': 'application/json', 'x-csrf-token': csrf },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json();
      assert.equal(response.status, expected, JSON.stringify(data));
      if (response.headers.get('set-cookie'))
        cookie = response.headers.get('set-cookie').split(';')[0];
      if (data.csrf) csrf = data.csrf;
      return data;
    };
    assert.equal((await request(first, '/health')).storage, 'supabase');
    for (const account of initialAccounts) {
      await request(first, '/login', account);
      assert.equal((await request(second, '/me')).user.role, account.role);
      await request(second, '/team/state');
    }
    await request(first, '/login', initialAccounts[0]);
    let state = await request(second, '/ps1/state');
    state = await request(first, '/ps1/import', { version: state.version, sample: true });
    await request(second, '/ps1/solve', { version: state.version, scenario: 'A' });
    state = await request(first, '/ps1/state');
    assert.equal(state.results.A.report.complete_activities, 54);
    const preview = await request(first, '/ps1/disruption', {
      version: state.version,
      scenario: 'A',
      fingerprint: state.plan_tokens.A,
      type: 'power',
      scope: 'network',
      location: '',
      start_week: 3,
      end_week: 4,
    });
    state = await request(second, '/ps1/apply-preview', { id: preview.id });
    assert.equal(state.results.A.disruptions.length, 1);
    await request(first, '/ps1/apply-preview', { id: preview.id }, 410);
    const version = (await request(first, '/state')).version;
    const body = {
      name: 'Concurrent',
      email: `race-${randomUUID()}@test.local`,
      password: 'race-test-password',
      role: 'worker',
      version,
    };
    const responses = await Promise.all(
      [first, second].map((instance) =>
        fetch(instance.url + '/api/users', {
          method: 'POST',
          headers: { cookie, 'content-type': 'application/json', 'x-csrf-token': csrf },
          body: JSON.stringify(body),
        }),
      ),
    );
    assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
    await assert.rejects(
      first.app.db.transaction(async () => {
        await first.app.db.prepare('DELETE FROM users WHERE email=?').run(body.email);
        throw Error('rollback probe');
      }),
      /rollback probe/,
    );
    assert((await request(second, '/state')).users.some((u) => u.email === body.email));
    const third = await start();
    assert.equal((await request(third, '/me')).user.email, initialAccounts[0].email);
    assert.equal((await request(third, '/ps1/state')).results.A.disruptions.length, 1);
  },
);
