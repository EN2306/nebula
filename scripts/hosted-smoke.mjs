// Usage: node scripts/hosted-smoke.mjs https://your-host path/to/private-accounts.json
// The accounts file is an array of {email,password,role}; never commit it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const base = new URL(process.argv[2]);
assert.equal(base.protocol, 'https:');
const accounts = JSON.parse(readFileSync(process.argv[3], 'utf8'));
let cookie = '',
  csrf = '';
async function request(route, body, expected = 200) {
  const response = await fetch(new URL(route, base), {
    method: body ? 'POST' : 'GET',
    redirect: 'error',
    headers: {
      cookie,
      origin: base.origin,
      'content-type': 'application/json',
      'x-csrf-token': csrf,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(90000),
  });
  assert.equal(response.status, expected, `${route}: HTTP ${response.status}`);
  const data = response.headers.get('content-type')?.includes('application/json')
    ? await response.json()
    : await response.text();
  if (response.headers.get('set-cookie')) {
    const setCookie = response.headers.get('set-cookie');
    assert.match(setCookie, /HttpOnly/);
    if (!/Max-Age=0/.test(setCookie)) assert.match(setCookie, /Secure/);
    cookie = setCookie.split(';')[0];
  }
  if (data.csrf) csrf = data.csrf;
  return data;
}
const health = await request('/api/health');
assert(health.ok && health.hosted && !health.ephemeral && !health.setupRequired);
assert.equal(health.storage, 'supabase');
for (const asset of ['/', '/app.js', '/design.css', '/schedule-ui.js', '/overview-ui.js'])
  await request(asset);
for (const secret of ['/.env', '/railsync-app/server.mjs', '/railsync-app/certs/supabase-ca.crt'])
  await request(secret, undefined, 404);
console.log('Public page, assets, private-file exclusions and durable Supabase health verified.');
for (const account of accounts) {
  cookie = '';
  csrf = '';
  const login = await request('/api/login', account);
  assert.equal(login.user.role, account.role);
  assert.equal((await request('/api/me')).user.email, account.email);
  await request('/api/state');
  await request('/api/team/state');
  const state = await request('/api/ps1/state', undefined, account.role === 'worker' ? 403 : 200);
  if (account.role !== 'scheduler')
    await request('/api/ps1/solve', { scenario: 'A', version: state.version || 0 }, 403);
  else {
    assert.equal(state.summary.activities, 54);
    for (const scenario of ['A', 'B', 'C']) {
      assert(state.results[scenario].report.feasible);
      assert.equal(state.results[scenario].report.complete_activities, 54);
      const csv = await request(`/api/ps1/export?scenario=${scenario}&file=SCHEDULE_ACCESS.csv`);
      assert(csv.startsWith('activity_id,'));
    }
    await request('/api/ps1/insights?scenario=A');
  }
  await request('/api/logout', {});
  await request('/api/me', undefined, 401);
  console.log(`Verified ${account.role}: login, workspace, role boundaries and logout.`);
}
console.log('Hosted smoke checks passed.');
