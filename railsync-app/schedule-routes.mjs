import { randomUUID } from 'node:crypto';
import { planFingerprint } from './operations.mjs';
import { planningModel, moveBooking, validateDisruption } from './schedule-edit.mjs';
import { validatePlan } from './ps1.mjs';
import { comparePlans } from './what-if.mjs';
import { runSolver } from './worker-runner.mjs';
const fail = (status, message) => {
  throw Object.assign(Error(message), { status });
};
export function scheduleRoutes({ db, psGet, psSave, psView, auditAction, isBusy, setBusy }) {
  const store = async (u, snapshot, scenario, result, kind) => {
    await db.prepare('DELETE FROM schedule_previews WHERE expires<?').run(Date.now());
    const count = await db.prepare('SELECT COUNT(*) AS count FROM schedule_previews').get();
    if (Number(count.count) >= 100) fail(429, 'Too many previews. Try again in a few minutes.');
    const id = randomUUID();
    const preview = {
      user: u.id,
      version: snapshot.version,
      fingerprint: planFingerprint(snapshot.results[scenario]),
      scenario,
      result,
      kind,
      expires: Date.now() + 15 * 60000,
    };
    await db
      .prepare('INSERT INTO schedule_previews VALUES(?,?,?)')
      .run(id, JSON.stringify(preview), preview.expires);
    return id;
  };
  return async function (route, method, b, u) {
    if (
      !['/api/ps1/move', '/api/ps1/disruption', '/api/ps1/apply-preview', '/api/ps1/undo'].includes(
        route,
      )
    )
      return null;
    if (method !== 'POST') fail(405, 'Use POST for this action.');
    if (u.role !== 'scheduler') fail(403, 'Planner access required.');
    if (isBusy()) fail(409, 'Wait for planning to finish.');
    const snapshot = await psGet();
    if (route === '/api/ps1/apply-preview') {
      const row =
        typeof b.id === 'string'
          ? await db.prepare('SELECT body FROM schedule_previews WHERE id=?').get(b.id)
          : null;
      const p = row ? JSON.parse(row.body) : null;
      if (!p || p.user !== u.id || p.expires < Date.now())
        fail(410, 'Preview expired. Create a new preview.');
      if (
        snapshot.version !== p.version ||
        planFingerprint(snapshot.results[p.scenario]) !== p.fingerprint
      )
        fail(409, 'The plan changed. Create a new preview.');
      const report = validatePlan(
        planningModel(snapshot.files, p.result),
        p.scenario,
        p.result.access,
        p.result.occupancy,
      );
      if (!report.feasible) fail(422, 'This preview has rule violations and cannot be saved.');
      snapshot.history = (snapshot.history || [])
        .concat([{ scenario: p.scenario, result: snapshot.results[p.scenario] }])
        .slice(-10);
      snapshot.results[p.scenario] = p.result;
      await psSave(snapshot);
      await db.prepare('DELETE FROM schedule_previews WHERE id=?').run(b.id);
      await auditAction(u, p.kind, `Scenario ${p.scenario}`);
      return psView(snapshot);
    }
    if (!['A', 'B', 'C'].includes(b.scenario)) fail(400, 'Choose scenario A, B or C.');
    const baseline = snapshot.results[b.scenario];
    if (!baseline) fail(400, 'Build a plan first.');
    if (snapshot.version !== b.version || planFingerprint(baseline) !== b.fingerprint)
      fail(409, 'The plan changed. Refresh and try again.');
    if (route === '/api/ps1/undo') {
      const index = (snapshot.history || []).findLastIndex((x) => x.scenario === b.scenario);
      if (index < 0) fail(404, 'No saved edit to undo for this scenario.');
      snapshot.results[b.scenario] = snapshot.history.splice(index, 1)[0].result;
      await psSave(snapshot);
      await auditAction(u, 'Schedule edit undone', `Scenario ${b.scenario}`);
      return psView(snapshot);
    }
    if (route === '/api/ps1/move') {
      const result = moveBooking(snapshot.files, baseline, b.activity_id, b.from_week, b.to_week);
      return {
        id: await store(u, snapshot, b.scenario, result, 'Manual booking move'),
        result,
        comparison: comparePlans(baseline, result),
      };
    }
    let outage;
    try {
      outage = validateDisruption(planningModel(snapshot.files, baseline), b);
    } catch (error) {
      fail(400, error.message);
    }
    const disruptions = [...(baseline.disruptions || []), outage];
    if (disruptions.length > 20)
      fail(
        400,
        'This plan already has 20 disruption windows. Undo an earlier edit or import a revised programme.',
      );
    const freeze = {
      week: outage.start_week,
      access: baseline.access.filter((r) => r.week < outage.start_week),
      occupancy: baseline.occupancy.filter((r) => r.week < outage.start_week),
    };
    setBusy(true);
    try {
      const result = await runSolver(snapshot.files, b.scenario, { disruptions, freeze });
      const latest = await psGet();
      if (
        latest.version !== snapshot.version ||
        planFingerprint(latest.results[b.scenario]) !== planFingerprint(baseline)
      )
        fail(409, 'The plan changed during preview. Try again.');
      return {
        id: await store(u, snapshot, b.scenario, result, 'Disruption backup adopted'),
        result,
        outage,
        comparison: comparePlans(baseline, result),
        frozen_before_week: outage.start_week,
      };
    } finally {
      setBusy(false);
    }
  };
}
