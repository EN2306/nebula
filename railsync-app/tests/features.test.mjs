import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createApp } from '../server.mjs';
import {
  FILES,
  inspectInputFiles,
  loadDataset,
  solve,
  validatePlan,
  parseCSV,
  csv,
} from '../ps1.mjs';
import { moveBooking, validateDisruption, planningModel } from '../schedule-edit.mjs';
const files = () =>
  Object.fromEntries(
    FILES.map((f) => [
      f,
      readFileSync(new URL('../../problem-statement/PS1/01_data/' + f, import.meta.url), 'utf8'),
    ]),
  );
async function fixture(t) {
  const app = createApp({ dbPath: ':memory:' });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  t.after(() => app.close());
  const base = 'http://127.0.0.1:' + app.server.address().port;
  const client = () => {
    let cookie = '',
      csrf = '';
    return async (route, body, status = 200) => {
      const r = await fetch(base + '/api' + route, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          cookie,
          ...(body === undefined
            ? {}
            : { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await r.json();
      assert.equal(r.status, status, JSON.stringify(data));
      if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
      if (data.csrf) csrf = data.csrf;
      return data;
    };
  };
  const planner = client(),
    password = 'feature-test-password';
  await planner('/setup', { name: 'Planner', email: 'planner@test.local', password }, 201);
  const roleClients = { planner };
  for (const role of ['manager', 'worker', 'supervisor']) {
    const s = await planner('/state');
    await planner(
      '/users',
      { version: s.version, name: role, email: role + '@test.local', password, role },
      201,
    );
    const c = client();
    await c('/login', { email: role + '@test.local', password });
    roleClients[role] = c;
  }
  return { app, ...roleClients };
}
test('CSV preflight aggregates file, row, column, reference and value errors', () => {
  const f = files();
  assert.deepEqual(inspectInputFiles(f), []);
  const activities = parseCSV(f[FILES[7]]);
  activities.rows[0].total_accesses = '';
  activities.rows[1].planned_start_date = '2027-02-30';
  activities.rows[2].predecessor_activity_id = 'missing';
  f[FILES[7]] = csv(activities.rows, activities.header);
  const issues = inspectInputFiles(f);
  assert(
    issues.some(
      (x) =>
        x.includes('08_ACTIVITY_DETAILS.csv · row 2 · total_accesses') && x.includes('missing'),
    ),
  );
  assert(issues.some((x) => x.includes('row 3 · planned_start_date')));
  assert(issues.some((x) => x.includes('row 4 · predecessor_activity_id')));
  assert.throws(() => parseCSV('a,b\nx"y,z'), /quote/);
  assert.throws(() => parseCSV('a,b\n"x"oops,z'), /closing quote/);
});
test('four roles enforce permissions, private worker reports, manager-reviewed points and emergency decisions', async (t) => {
  const { app, planner, worker, manager, supervisor } = await fixture(t);
  const post = async (c, route, b, status = 200) =>
    c('/team/' + route, { ...b, version: (await c('/team/state')).version }, status);
  await worker('/ps1/state', undefined, 403);
  await manager('/ps1/state');
  await supervisor('/ps1/state');
  for (const reader of [manager, supervisor]) {
    await reader('/ps1/import', { version: 0, sample: true }, 403);
    await reader('/ps1/solve', { version: 0, scenario: 'A' }, 403);
    await reader('/ps1/move', { scenario: 'A' }, 403);
  }
  await post(
    worker,
    'issues',
    { type: 'absence', date: '2027-01-04', description: 'Private reason' },
    200,
  );
  let w = await worker('/team/state');
  assert.equal(w.penalties[0].points, 0);
  assert.equal(w.issues.length, 1);
  assert.equal((await planner('/team/state')).issues.length, 0);
  assert(JSON.stringify(await supervisor('/team/state')).includes('Private reason'));
  assert(!JSON.stringify(await planner('/team/state')).includes('Private reason'));
  await post(planner, 'review', { id: w.issues[0].id, points: 4, decision: 'No' }, 403);
  await post(
    manager,
    'review',
    { id: w.issues[0].id, points: 2, decision: 'Reviewed and explained' },
    200,
  );
  await post(manager, 'review', { id: w.issues[0].id, points: 2, decision: 'Duplicate' }, 409);
  w = await worker('/team/state');
  assert.equal(w.penalties[0].points, 2);
  assert.equal(w.issues[0].decision, 'Reviewed and explained');
  const mstate = await manager('/state');
  await manager(
    '/users',
    {
      version: mstate.version,
      name: 'Bad',
      email: 'bad@test.local',
      password: 'feature-test-password',
      role: 'supervisor',
    },
    403,
  );
  const imported = await planner('/ps1/import', { version: 0, sample: true });
  await planner('/ps1/solve', { version: imported.version, scenario: 'A' });
  for (const reader of [manager, supervisor]) {
    const view = await reader('/ps1/state');
    assert.equal(view.summary.activities, 54);
    await reader('/ps1/insights?scenario=A');
    assert.equal((await reader('/ps1/export?scenario=A&file=VALIDATION.json')).feasible, true);
  }
  const decision = await post(planner, 'escalate', {
    title: 'Power emergency',
    question: 'Approve alternative?',
    scenario: 'A',
  });
  assert.equal((await supervisor('/team/state')).decisions[0].urgent, true);
  await post(worker, 'decide', { id: decision.id, status: 'approved', decision: 'Spoof' }, 403);
  await post(supervisor, 'decide', {
    id: decision.id,
    status: 'approved',
    decision: 'Proceed after checks',
  });
  assert.equal((await planner('/team/state')).decisions[0].status, 'approved');
  const decision2 = await post(planner, 'escalate', {
    title: 'Second request',
    question: 'Review?',
    scenario: 'A',
  });
  await planner('/ps1/solve', { version: imported.version, scenario: 'A' });
  await post(
    supervisor,
    'decide',
    { id: decision2.id, status: 'approved', decision: 'Stale' },
    409,
  );
  assert(
    app.db
      .prepare('SELECT body FROM team_operations')
      .get()
      .body.includes('Reviewed and explained'),
  );
});
test('worker assignments reject reported absence and completion is restricted to the owner', async (t) => {
  const { planner, worker, manager, supervisor } = await fixture(t);
  const imported = await planner('/ps1/import', { version: 0, sample: true });
  const plan = await planner('/ps1/solve', { version: imported.version, scenario: 'A' });
  const r = plan.access[0],
    day = new Date(Date.parse(imported.summary.horizon_start) + (r.week - 1) * 604800000)
      .toISOString()
      .slice(0, 10);
  const wid = (await worker('/state')).user.id;
  const post = async (c, route, b, status = 200) =>
    c('/team/' + route, { ...b, version: (await c('/team/state')).version }, status);
  const task = await post(manager, 'assign', {
    worker_id: wid,
    activity_id: r.activity_id,
    scenario: 'A',
    date: day,
    notes: 'Check in first',
  });
  const plannerView = await planner('/team/state'),
    managerView = await manager('/team/state'),
    supervisorView = await supervisor('/team/state');
  assert.equal(plannerView.assignments[0].notes, undefined);
  assert.equal(managerView.assignments[0].notes, 'Check in first');
  assert.equal(supervisorView.assignments[0].notes, undefined);
  assert.deepEqual(supervisorView.people, []);
  assert.equal(supervisorView.programme.summary.activities, 54);
  await post(supervisor, 'complete-assignment', { id: task.id }, 403);
  await post(worker, 'complete-assignment', { id: task.id });
  assert.equal((await worker('/team/state')).assignments[0].status, 'completed');
  await post(worker, 'issues', { type: 'absence', date: day, description: 'Unavailable' });
  await post(
    manager,
    'assign',
    { worker_id: wid, activity_id: r.activity_id, scenario: 'A', date: day },
    409,
  );
});
test('disruption backup freezes earlier bookings, blocks buffers and survives apply, undo and stale previews', async (t) => {
  const { planner } = await fixture(t);
  const imported = await planner('/ps1/import', { version: 0, sample: true });
  const baseline = await planner('/ps1/solve', { version: imported.version, scenario: 'A' });
  let s = await planner('/ps1/state');
  const b = {
    version: s.version,
    scenario: 'A',
    fingerprint: s.plan_tokens.A,
    type: 'power',
    scope: 'network',
    location: '',
    start_week: 3,
    end_week: 4,
  };
  const quotaRow = baseline.occupancy[0];
  const quotaPreview = await planner('/ps1/disruption', {
    ...b,
    type: 'capacity',
    scope: 'location',
    location: quotaRow.location_id,
    start_week: quotaRow.week,
    end_week: quotaRow.week,
    capacity: 0,
  });
  assert.equal(quotaPreview.outage.capacity, 0);
  assert.equal(quotaPreview.outage.locations[0], quotaRow.location_id);
  const p = await planner('/ps1/disruption', b);
  assert(p.result.report.feasible);
  assert(!p.result.access.some((x) => x.week >= 3 && x.week <= 4));
  assert.deepEqual(
    p.result.access.filter((x) => x.week < 3),
    baseline.access.filter((x) => x.week < 3),
  );
  assert.deepEqual((await planner('/ps1/state')).results.A.access, baseline.access);
  s = await planner('/ps1/apply-preview', { id: p.id });
  assert.equal(s.results.A.disruptions.length, 1);
  assert(
    validatePlan(
      planningModel(files(), s.results.A),
      'A',
      s.results.A.access,
      s.results.A.occupancy,
    ).feasible,
  );
  await planner('/ps1/apply-preview', { id: p.id }, 410);
  s = await planner('/ps1/undo', {
    version: s.version,
    scenario: 'A',
    fingerprint: s.plan_tokens.A,
  });
  assert.deepEqual(s.results.A.access, baseline.access);
  const bad = await planner('/ps1/move', {
    version: s.version,
    scenario: 'A',
    fingerprint: s.plan_tokens.A,
    activity_id: baseline.access.at(-1).activity_id,
    from_week: baseline.access.at(-1).week,
    to_week: 1,
  });
  assert(!bad.result.report.feasible);
  await planner('/ps1/apply-preview', { id: bad.id }, 422);
  const preview = await planner('/ps1/disruption', { ...b, fingerprint: s.plan_tokens.A });
  await planner('/ps1/solve', { version: s.version, scenario: 'A' });
  await planner('/ps1/apply-preview', { id: preview.id }, 409);
  const d = loadDataset(files()),
    job = d.activities.find((x) => x.geometry.envelope.length > x.geometry.occupied.length);
  const loc = job.geometry.envelope.find((x) => !job.geometry.occupied.includes(x));
  const outage = validateDisruption(d, {
    type: 'weather',
    scope: 'location',
    location: loc,
    start_week: 1,
    end_week: 52,
  });
  d.disruptions = [outage];
  assert(
    validatePlan(d, 'A', baseline.access, baseline.occupancy).hard_violations.some(
      (x) => x.rule === 'disruption' && x.detail.includes(job.activity_id),
    ),
  );
  const booked = baseline.occupancy[0];
  d.disruptions = [
    validateDisruption(d, {
      type: 'capacity',
      scope: 'location',
      location: booked.location_id,
      start_week: booked.week,
      end_week: booked.week,
      capacity: 0,
    }),
  ];
  assert(
    validatePlan(d, 'B', baseline.access, baseline.occupancy).hard_violations.some(
      (x) => x.rule === 'capacity' && x.detail.includes('temporary quota'),
    ),
  );
});
