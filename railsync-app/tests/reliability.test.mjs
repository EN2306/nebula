import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readFileSync,
  mkdtempSync,
  rmSync,
  cpSync,
  writeFileSync,
  existsSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { FILES, loadDataset, solve, validatePlan, exportsFor } from '../ps1.mjs';
import { runSubmission } from '../ps1-cli.mjs';
import { lowerBound } from '../quality.mjs';
const input = new URL('../../problem-statement/PS1/01_data/', import.meta.url);
const dataset = () =>
  loadDataset(Object.fromEntries(FILES.map((f) => [f, readFileSync(new URL(f, input), 'utf8')])));

test('malformed plans cannot bypass checking or produce submission files', () => {
  const d = dataset(),
    r = solve(d, 'A');
  for (const label of ['', ' ', 'x|y', '\n'])
    assert.equal(
      validatePlan(
        d,
        'A',
        r.access,
        r.occupancy.map((row) => ({ ...row, co_share_group: label })),
      ).feasible,
      false,
    );
  for (const patch of [
    { week: NaN },
    { week: Infinity },
    { week: 1041 },
    { access_seq: 0 },
    { activity_id: 'unknown' },
  ]) {
    const access = structuredClone(r.access);
    Object.assign(access[0], patch);
    assert.equal(validatePlan(d, 'A', access, r.occupancy).feasible, false);
  }
  assert.equal(validatePlan(d, 'A', null, []).feasible, false);
  assert.throws(() => validatePlan(d, 'D', [], []), /scenario/);
  assert.throws(() => exportsFor({ ...r, report: { feasible: false } }), /feasible/);
  assert.equal(validatePlan(d, 'A', [...r.access].reverse(), r.occupancy).feasible, true);
  const wrongSequence = structuredClone(r.access);
  wrongSequence.find((row) => row.access_seq === 2).access_seq = 1;
  assert(
    validatePlan(d, 'A', wrongSequence, r.occupancy).hard_violations.some(
      (v) => v.rule === 'sequence',
    ),
  );
});

test('lower bounds expose unavoidable public cost without claiming official optimality', () => {
  const d = dataset();
  assert.equal(lowerBound(d, 'A').score, 25.2);
  assert.equal(lowerBound(d, 'B').score, 30);
  assert.equal(lowerBound(d, 'C').score, 25.2);
});

test('CLI retires old successful artifacts on infeasible and invalid-input runs', (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'trackwork-cli-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const source = path.join(dir, 'input'),
    output = path.join(dir, 'output');
  cpSync(input, source, { recursive: true });
  assert.equal(runSubmission(source, output).status, 'complete');
  assert(existsSync(path.join(output, 'B', 'RESULTS.csv')));
  const projects = path.join(source, FILES[6]);
  writeFileSync(projects, readFileSync(projects, 'utf8').replaceAll('2027-07-04', '2027-01-03'));
  assert.equal(runSubmission(source, output).status, 'infeasible');
  assert(!existsSync(path.join(output, 'B')));
  assert(readdirSync(path.join(output, '.history')).length >= 1);
  writeFileSync(path.join(source, FILES[7]), 'broken');
  assert.throws(() => runSubmission(source, output));
  for (const s of ['A', 'B', 'C']) assert(!existsSync(path.join(output, s)));
  assert.equal(JSON.parse(readFileSync(path.join(output, 'RUN.json'))).status, 'failed');
  writeFileSync(path.join(output, 'RUN.lock'), 'another run');
  assert.throws(() => runSubmission(source, output), { code: 'EEXIST' });
});
