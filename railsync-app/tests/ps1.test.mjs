import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { FILES, parseCSV, loadDataset, solve, validatePlan, exportsFor } from '../ps1.mjs';
import { createApp } from '../server.mjs';
const files = Object.fromEntries(
  FILES.map((f) => [
    f,
    readFileSync(new URL('../../problem-statement/PS1/01_data/' + f, import.meta.url), 'utf8'),
  ]),
);
const dataset = () => loadDataset(structuredClone(files));
test('public workload: A/B/C deliver every activity, independently check, round-trip exact schemas', () => {
  const d = dataset();
  for (const s of ['A', 'B', 'C']) {
    const r = solve(d, s);
    assert(r.report.feasible, JSON.stringify(r.report.hard_violations));
    assert.equal(r.report.complete_activities, d.activities.length);
    const out = exportsFor(r);
    assert.deepEqual(parseCSV(out['SCHEDULE_ACCESS.csv']).header, [
      'activity_id',
      'access_seq',
      'week',
      'eclo',
      'access_night',
    ]);
    assert.deepEqual(parseCSV(out['SCHEDULE_OCCUPANCY.csv']).header, [
      'activity_id',
      'week',
      'location_id',
      'co_share_group',
    ]);
    const rr = parseCSV(out['RESULTS.csv']).rows;
    assert(rr.every((x) => x.scenario === s));
    assert.equal(rr.length, new Set(d.projects.map((p) => p.contract_number)).size);
    if (s === 'A') {
      assert.equal(r.report.soft_scores.eclo_nights_total, 0);
      assert.equal(r.report.soft_scores.excess_access_nights_total, 0);
    }
    if (s === 'B') assert.equal(r.report.soft_scores.overrun_days_total, 0);
    if (s === 'C')
      for (const range of Object.values(r.report.detail.eclo_windows))
        assert(range[1] - range[0] <= 1);
  }
});
test('independent validator detects deleted workload, missing span, cap, duplicate week and forbidden ECLO', () => {
  const d = dataset(),
    r = solve(d, 'A'),
    first = r.access[0],
    id = first.activity_id;
  let report = validatePlan(
    d,
    'A',
    r.access.filter((x) => x.activity_id !== id),
    r.occupancy.filter((x) => x.activity_id !== id),
  );
  assert(report.hard_violations.some((x) => x.rule === 'workload'));
  report = validatePlan(d, 'A', r.access, r.occupancy.slice(1));
  assert(report.hard_violations.some((x) => x.rule === 'occupancy'));
  const bad = structuredClone(r.access);
  bad[0].eclo = 1;
  bad[0].access_night = 99;
  bad.push({ ...bad[0] });
  report = validatePlan(d, 'A', bad, r.occupancy);
  for (const rule of ['eclo', 'weekly_allocation', 'weekly_activity'])
    assert(report.hard_violations.some((x) => x.rule === rule));
});
test('geometry includes every endpoint platform, opposite-bound Live closures and cross-line interchange only for Live', () => {
  const d = dataset(),
    live = d.am.get('A074').geometry,
    ordinary = d.am.get('A003').geometry;
  assert(live.closed.includes('SEC:ALP:H01_H02:WB'));
  assert(live.closed.includes('PLAT:BET:H01:EB'));
  assert(live.closed.includes('SEC:BET:H01_H02:WB'));
  assert(live.envelope.length > live.closed.length);
  assert(ordinary.envelope.every((x) => x.split(':')[1] === 'BET'));
  assert(ordinary.occupied.includes('PLAT:BET:H01:EB'));
  assert(ordinary.occupied.includes('PLAT:BET:S16:EB'));
});
test('scenario policy checks detect capacity strain, planned overrun, illegal sharing and predecessor regression', () => {
  const d = dataset(),
    r = solve(d, 'A');
  let report = validatePlan(d, 'B', r.access, r.occupancy);
  assert(report.hard_violations.some((x) => x.rule === 'planned_date'));
  for (const loc of d.supply) loc.capacity = 0;
  report = validatePlan(d, 'A', r.access, r.occupancy);
  assert(report.hard_violations.some((x) => x.rule === 'capacity'));
  const fresh = dataset(),
    occ = structuredClone(r.occupancy);
  for (const x of occ) x.co_share_group = 'one';
  report = validatePlan(fresh, 'A', r.access, occ);
  assert(report.hard_violations.some((x) => ['legal_mix', 'closure'].includes(x.rule)));
  const moved = structuredClone(r.access),
    a = fresh.activities.find((a) => a.predecessor_activity_id);
  moved.find((x) => x.activity_id === a.activity_id).week = 1;
  report = validatePlan(fresh, 'A', moved, r.occupancy);
  assert(report.hard_violations.some((x) => x.rule === 'predecessor'));
});
test('bad datasets are rejected before they replace saved work', () => {
  const broken = { ...files };
  delete broken[FILES[0]];
  assert.throws(() => loadDataset(broken), /Missing/);
  assert.throws(
    () => loadDataset({ ...files, [FILES[7]]: files[FILES[7]].replace('A004,C001', 'A003,C001') }),
    /duplicate/,
  );
  assert.throws(
    () =>
      loadDataset({
        ...files,
        [FILES[7]]: files[FILES[7]].replace('2027-05-24,,2', '2027-05-24,A001,2'),
      }),
    /Cyclic/,
  );
  assert.throws(() => parseCSV('a,b\n"unterminated'), /Unclosed/);
  assert.equal(parseCSV('a,b\n"quoted, cell","two""quotes"').rows[0].b, 'two"quotes');
});
test('HTTP: authenticated import/solve/export, CSRF/role restrictions, stale import and SQLite persistence', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ps1-test-')),
    dbPath = path.join(dir, 'test.sqlite'),
    app = createApp({ dbPath });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  t.after(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const url = 'http://127.0.0.1:' + app.server.address().port;
  let cookie = '',
    csrf = '';
  async function req(route, body, status = 200, headers = {}) {
    const res = await fetch(url + '/api' + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        cookie,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    assert.equal(res.status, status);
    if (res.headers.get('set-cookie')) cookie = res.headers.get('set-cookie').split(';')[0];
    const text = await res.text();
    if (res.headers.get('content-type')?.startsWith('text/csv')) return text;
    const result = JSON.parse(text);
    if (result.csrf) csrf = result.csrf;
    return result;
  }
  await req('/ps1/state', undefined, 401);
  await req(
    '/setup',
    { name: 'PS1 QA', email: 'planner@example.test', password: 'test-password-123' },
    201,
  );
  await req('/ps1/import', { version: 0, sample: true }, 403, { 'X-CSRF-Token': 'bad' });
  let state = await req('/ps1/import', { version: 0, sample: true });
  assert.equal(state.summary.activities, dataset().activities.length);
  await req('/ps1/import', { version: 0, sample: true }, 409);
  await req('/ps1/import', { version: state.version, files: {} }, 400);
  const solved = await req('/ps1/solve', { version: state.version, scenario: 'B' });
  assert(solved.report.feasible);
  const output = await req('/ps1/export?scenario=B&file=SCHEDULE_ACCESS.csv');
  assert.equal(parseCSV(output).rows.length, solved.access.length);
  const check = await req('/ps1/export?scenario=B&file=VALIDATION.json');
  assert(check.feasible);
  const second = createApp({ dbPath });
  assert(
    JSON.parse(second.db.prepare('SELECT body FROM ps1_workspace').get().body).results.B.report
      .feasible,
  );
  second.db.close();
  const beforePreview = app.db.prepare('SELECT body FROM ps1_workspace').get().body;
  const location = state.summary.location_supply[0];
  const preview = await req('/ps1/what-if', {
    version: state.version,
    scenario: 'B',
    location: location.location,
    capacity: location.capacity,
  });
  assert.equal(preview.retained_baseline, true);
  assert.equal(preview.comparison.changed_activities, 0);
  await req(
    '/ps1/what-if',
    { version: state.version, scenario: 'B', location: 'unknown', capacity: 0 },
    400,
  );
  await req(
    '/ps1/what-if',
    { version: 0, scenario: 'B', location: location.location, capacity: 0 },
    409,
  );
  assert.equal(app.db.prepare('SELECT body FROM ps1_workspace').get().body, beforePreview);
  const workspace = await req('/state?date=2027-01-04');
  await req(
    '/users',
    {
      version: workspace.version,
      name: 'Requester',
      email: 'worker@example.test',
      password: 'test-password-123',
      role: 'requester',
    },
    400,
  );
  app.db
    .prepare(
      "INSERT INTO users SELECT 'legacy-user','Legacy user','worker@example.test',password,'requester',NULL FROM users LIMIT 1",
    )
    .run();
  await req('/logout', {});
  await req('/login', { email: 'worker@example.test', password: 'test-password-123' });
  await req('/ps1/state', undefined, 403);
  await req('/ps1/export?scenario=B&file=RESULTS.csv', undefined, 403);
});
