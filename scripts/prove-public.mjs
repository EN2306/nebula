// Exhaustive relaxation certificate for this public instance, not the judges' validator.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { FILES, loadDataset, parseCSV, validatePlan } from '../railsync-app/ps1.mjs';
const d = loadDataset(
  Object.fromEntries(
    FILES.map((f) => [f, readFileSync(`problem-statement/PS1/01_data/${f}`, 'utf8')]),
  ),
);
const weight = (a) =>
  ({ 1: 100, 2: 10, 3: 1 })[a.project.contract_priority] *
  (1 + { 1: 0.3, 2: 0.2, 3: 0 }[a.activity_priority]);
// Enumerate every nonredundant weekly pattern capable of improving the incumbent.
// Omitting later or redundant bookings cannot improve a nonnegative objective.
function patterns(a, scenario, incumbent) {
  const due = (a.project.deadline - d.start + 1) / 7;
  const last = Math.floor(due + (scenario === 'B' ? 0 : incumbent / (7 * weight(a))));
  const out = [];
  function visit(week, units, weeks, eclo) {
    if (units >= a.work) {
      const late = Math.max(0, d.start + weeks.at(-1) * 7 - 1 - a.project.deadline);
      const cost = (scenario === 'B' ? 0 : late * weight(a)) + eclo.length * 5;
      if (cost <= incumbent + 1e-8) out.push({ weeks, cost });
      return;
    }
    if (week > last || weeks.length >= a.work) return;
    visit(week + 1, units, weeks, eclo);
    visit(week + 1, units + 1, [...weeks, week], eclo);
    if (scenario !== 'A' && (scenario !== 'C' || !eclo.length || week - eclo[0] <= 1))
      visit(week + 1, units + 1.5, [...weeks, week], [...eclo, week]);
  }
  visit(a.earliest, 0, [], []);
  return out;
}
const a = d.am.get('A036'),
  b = d.am.get('A075'),
  c = d.am.get('A059');
assert(a && b && c && b.geometry.live);
assert(a.geometry.occupied.some((id) => b.geometry.envelope.includes(id)));
const proof = {};
for (const scenario of ['A', 'B', 'C']) {
  const read = (f) => parseCSV(readFileSync(`submissions/public/${scenario}/${f}`, 'utf8')).rows;
  const access = read('SCHEDULE_ACCESS.csv').map((r) => ({
    ...r,
    week: +r.week,
    access_seq: +r.access_seq,
    access_night: +r.access_night,
    eclo: +r.eclo,
  }));
  const occupancy = read('SCHEDULE_OCCUPANCY.csv').map((r) => ({ ...r, week: +r.week }));
  const report = validatePlan(d, scenario, access, occupancy);
  assert(report.feasible);
  const upper = report.soft_scores.objective_score;
  const pa = patterns(a, scenario, upper),
    pb = patterns(b, scenario, upper),
    pc = patterns(c, scenario, upper);
  let pair = Infinity;
  for (const x of pa)
    for (const y of pb)
      if (!x.weeks.some((w) => y.weeks.includes(w))) pair = Math.min(pair, x.cost + y.cost);
  const independent = Math.min(...pc.map((p) => p.cost));
  const lower = Math.round((pair + independent) * 10) / 10;
  assert.equal(lower, upper);
  proof[scenario] = {
    pair_A036_A075: Math.round(pair * 10) / 10,
    A059: independent,
    lower_bound: lower,
    feasible_score: upper,
    optimal_under_internal_model: true,
    enumerated_patterns: [pa.length, pb.length, pc.length],
  };
}
writeFileSync(
  'submissions/public/OPTIMALITY.json',
  JSON.stringify(
    {
      scope:
        'Public instance and corrected internal weekly closure model only. Official validator acceptance is not certified.',
      scenarios: proof,
    },
    null,
    2,
  ) + '\n',
);
console.log(proof);
