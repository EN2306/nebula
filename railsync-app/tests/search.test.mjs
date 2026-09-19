import test from 'node:test';
import assert from 'node:assert/strict';
import { benchmarkCases } from '../benchmark.mjs';
import { loadDataset, solve, validatePlan } from '../ps1.mjs';
import { changeSupply, comparePlans, checkBaseline } from '../what-if.mjs';
import { buildInsights } from '../insights.mjs';

test('search reaches public bounds with reproducible schedules regardless of input order', () => {
  const cases = benchmarkCases(),
    normal = loadDataset(cases[0].files),
    reversed = loadDataset(cases.find((c) => c.name === 'reversed-input').files);
  for (const scenario of ['A', 'B', 'C']) {
    const a = solve(normal, scenario),
      b = solve(reversed, scenario);
    assert(a.report.feasible);
    assert.equal(a.report.quality.gap, 0);
    assert.deepEqual(a.access, b.access);
    assert.deepEqual(a.occupancy, b.occupancy);
    for (const explanation of a.explanations) assert(explanation.evidence.length >= 2);
  }
});

test('congested and impossible fixtures retain honest completion and feasibility reporting', () => {
  for (const fixture of benchmarkCases().filter((c) =>
    ['single-workfront', 'cross-contract-chain', 'zero-supply', 'tight-deadlines'].includes(c.name),
  )) {
    const d = loadDataset(fixture.files);
    for (const scenario of ['A', 'B', 'C']) {
      const result = solve(d, scenario),
        report = validatePlan(d, scenario, result.access, result.occupancy);
      assert.equal(report.feasible, result.report.feasible);
      if (report.feasible) {
        assert.equal(report.complete_activities, d.activities.length);
        assert(result.report.quality.gap >= 0);
      } else assert.equal(report.soft_scores.objective_score, null);
      if (fixture.name === 'single-workfront' && scenario === 'C')
        assert(report.soft_scores.objective_score <= 1026);
      if (fixture.name === 'zero-supply' && scenario === 'A') {
        assert(!report.feasible);
        assert.equal(report.complete_activities, 0);
      }
    }
  }
});

test('capacity preview quantifies disruption without modifying original inputs or plans', () => {
  const files = benchmarkCases()[0].files,
    before = JSON.stringify(files),
    baseline = solve(loadDataset(files), 'A');
  const changed = changeSupply(files, 'PLAT:BET:H02:EB', 0);
  assert.equal(JSON.stringify(files), before);
  assert(!checkBaseline(changed.files, 'A', baseline).feasible);
  const result = solve(loadDataset(changed.files), 'A');
  assert(!result.report.feasible);
  assert(comparePlans(baseline, result).changed_activities > 0);
  assert.throws(() => changeSupply(files, 'PLAT:BET:H02:EB', -1));
});

test('250-activity instance completes without unnecessary flexible-supply spending', () => {
  const d = loadDataset(benchmarkCases().find((c) => c.name === '250-activities').files);
  for (const scenario of ['A', 'B', 'C']) {
    const result = solve(d, scenario);
    assert(result.report.feasible);
    assert.equal(result.report.complete_activities, 250);
    assert.equal(result.report.soft_scores.objective_score, 0);
  }
});

test('risk insights produce actionable handover and negotiation evidence', () => {
  const dataset = loadDataset(benchmarkCases()[0].files);
  const result = solve(dataset, 'B');
  const insight = buildInsights(dataset, result);
  assert.equal(insight.scenario, 'B');
  assert.equal(insight.overview.completed, '54/54');
  assert(insight.handover.includes('Scenario B'));
  assert(Array.isArray(insight.priority_risks));
  assert(Array.isArray(insight.fragile_locations));
  assert(Array.isArray(insight.negotiation));
  assert(insight.note.includes('official validation'));
});

test('overview retains every risk, flags incomplete work and counts weekly activity bookings', () => {
  const dataset = loadDataset(benchmarkCases()[0].files);
  const result = solve(dataset, 'A');
  const insight = buildInsights(dataset, result);
  assert.equal(insight.deadline_watch.length, dataset.activities.length);
  assert.equal(
    insight.weeks.reduce((sum, week) => sum + week.bookings, 0),
    result.access.length,
  );
  assert.equal(
    insight.weeks.reduce((sum, week) => sum + week.finishing, 0),
    dataset.activities.length,
  );
  for (const row of insight.deadline_watch) {
    const activity = dataset.am.get(row.activity_id);
    assert.equal(
      row.slack_days,
      activity.project.deadline - (dataset.start + row.finish_week * 7 - 1),
    );
  }
  // More than 20 late jobs must all contribute to contractor totals.
  for (const activity of dataset.activities) activity.project.deadline = dataset.start - 1;
  const late = buildInsights(dataset, result);
  assert(late.priority_risks.length > 20);
  assert.equal(
    late.contractor_risks.reduce((sum, contract) => sum + contract.delayed_activities, 0),
    dataset.activities.length,
  );
  const missingId = dataset.activities[0].activity_id;
  const partial = {
    ...result,
    access: result.access.filter((row) => row.activity_id !== missingId),
  };
  const risk = buildInsights(dataset, partial).deadline_watch.find(
    (row) => row.activity_id === missingId,
  );
  assert.equal(risk.status, 'incomplete');
  assert.equal(risk.finish_week, null);
  assert.equal(risk.slack_days, null);
  assert.equal(risk.delay_days, null);
  assert.equal(risk.remaining_work, dataset.am.get(missingId).work);
});
