import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { FILES, parseCSV, csv, loadDataset, solve, validatePlan } from './ps1.mjs';

export function benchmarkCases() {
  const original = Object.fromEntries(
    FILES.map((f) => [
      f,
      readFileSync(new URL('../problem-statement/PS1/01_data/' + f, import.meta.url), 'utf8'),
    ]),
  );
  const mutate = (filename, change) => {
    const files = { ...original },
      table = parseCSV(files[filename]);
    change(table.rows);
    files[filename] = csv(table.rows, table.header);
    return files;
  };
  const cases = [{ name: 'public', files: original }];
  cases.push({
    name: 'reduced-supply',
    files: mutate(FILES[3], (rows) =>
      rows.forEach((r) => {
        r.supply_capacity = String(Math.max(1, +r.supply_capacity - 1));
      }),
    ),
  });
  cases.push({
    name: 'single-workfront',
    files: mutate(FILES[6], (rows) =>
      rows.forEach((r) => {
        r.number_of_workfronts = '1';
        r.number_of_maximum_access_per_week = '1';
      }),
    ),
  });
  cases.push({
    name: 'cross-contract-chain',
    files: mutate(FILES[7], (rows) => {
      for (let i = 1; i < 8; i++) rows[i].predecessor_activity_id = rows[i - 1].activity_id;
    }),
  });
  cases.push({
    name: 'zero-supply',
    files: mutate(FILES[3], (rows) =>
      rows.forEach((r) => {
        r.supply_capacity = '0';
      }),
    ),
  });
  cases.push({
    name: 'tight-deadlines',
    files: mutate(FILES[6], (rows) =>
      rows.forEach((r) => {
        r.planned_completion_date = '2027-05-02';
      }),
    ),
  });
  cases.push({ name: 'reversed-input', files: mutate(FILES[7], (rows) => rows.reverse()) });
  const scaled = mutate(FILES[6], (rows) =>
    rows.forEach((r) => {
      r.planned_completion_date = '2030-12-29';
      r.contract_completion_date = '2030-12-29';
    }),
  );
  const activities = parseCSV(scaled[FILES[7]]);
  activities.rows = Array.from({ length: 250 }, (_, i) => ({
    ...activities.rows[i % activities.rows.length],
    activity_id: 'SCALE' + String(i + 1).padStart(3, '0'),
    predecessor_activity_id: '',
    total_accesses: '5',
  }));
  scaled[FILES[7]] = csv(activities.rows, activities.header);
  cases.push({ name: '250-activities', files: scaled });
  return cases;
}

export function benchmark() {
  const records = [];
  for (const fixture of benchmarkCases())
    for (const scenario of ['A', 'B', 'C']) {
      const dataset = loadDataset(fixture.files),
        start = performance.now(),
        result = solve(dataset, scenario);
      const checked = validatePlan(dataset, scenario, result.access, result.occupancy);
      if (checked.feasible !== result.report.feasible) throw Error('Benchmark validation mismatch');
      const record = {
        instance: fixture.name,
        scenario,
        feasible: checked.feasible,
        complete: checked.complete_activities,
        total: dataset.activities.length,
        violations: checked.hard_violations.length,
        score: checked.soft_scores.objective_score,
        lower_bound: result.report.quality.lower_bound,
        gap: result.report.quality.gap,
        elapsed_ms: Math.round(performance.now() - start),
      };
      records.push(record);
      console.log(JSON.stringify(record));
    }
  return {
    node: process.version,
    generated_at: new Date().toISOString(),
    note: 'Synthetic stress cases, not hidden judge instances. Infeasible cases remain explicit.',
    records,
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = new URL('../submissions/benchmark.json', import.meta.url);
  mkdirSync(new URL('../submissions/', import.meta.url), { recursive: true });
  writeFileSync(output, JSON.stringify(benchmark(), null, 2) + '\n');
}
