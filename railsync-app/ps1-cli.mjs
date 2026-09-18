import {
  readFileSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  renameSync,
  readdirSync,
  openSync,
  closeSync,
  unlinkSync,
} from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FILES, loadDataset, solve, exportsFor } from './ps1.mjs';
const base = path.dirname(fileURLToPath(import.meta.url));
const artifactNames = ['SCHEDULE_ACCESS.csv', 'SCHEDULE_OCCUPANCY.csv', 'RESULTS.csv'];

export function runSubmission(input, output) {
  input = path.resolve(input);
  output = path.resolve(output);
  if (output === path.parse(output).root || output === input || input.startsWith(output + path.sep))
    throw Error('Output must be a dedicated submission directory, not the input or its parent');
  for (const scenario of ['A', 'B', 'C']) {
    const target = path.join(output, scenario);
    if (existsSync(target) && readdirSync(target).some((name) => !artifactNames.includes(name)))
      throw Error(`Refusing to replace non-submission files in ${target}`);
  }
  mkdirSync(output, { recursive: true });
  const lockPath = path.join(output, 'RUN.lock');
  const lock = openSync(lockPath, 'wx');
  try {
    const runId = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID();
    const manifest = {
      run_id: runId,
      status: 'running',
      started_at: new Date().toISOString(),
      input_sha256: {},
      scenarios: {},
      official_validation: false,
    };
    const publishManifest = () => {
      const temporary = path.join(output, `.RUN-${runId}.json`);
      writeFileSync(temporary, JSON.stringify(manifest, null, 2) + '\n');
      renameSync(temporary, path.join(output, 'RUN.json'));
    };
    publishManifest();
    try {
      // Retire old active artifacts before parsing, including on invalid input.
      for (const name of ['A', 'B', 'C', 'INTERNAL_VALIDATION.json'])
        if (existsSync(path.join(output, name))) {
          const history = path.join(output, '.history', runId);
          mkdirSync(history, { recursive: true });
          renameSync(path.join(output, name), path.join(history, name));
        }
      const files = Object.fromEntries(
        FILES.map((name) => {
          const bytes = readFileSync(path.join(input, name));
          manifest.input_sha256[name] = createHash('sha256').update(bytes).digest('hex');
          return [name, bytes.toString('utf8')];
        }),
      );
      const dataset = loadDataset(files),
        reports = {};
      const staging = path.join(output, '.staging', runId);
      mkdirSync(staging, { recursive: true });
      for (const scenario of ['A', 'B', 'C']) {
        const result = solve(dataset, scenario);
        reports[scenario] = result.report;
        manifest.scenarios[scenario] = {
          feasible: result.report.feasible,
          score: result.report.soft_scores.objective_score,
        };
        if (result.report.feasible) {
          const target = path.join(staging, scenario);
          mkdirSync(target);
          for (const [name, content] of Object.entries(exportsFor(result)))
            writeFileSync(path.join(target, name), content);
        }
        console.log(
          `${scenario}: ${result.report.complete_activities}/${dataset.activities.length} complete; ${result.report.hard_violations.length} internal violations; penalty ${result.report.soft_scores.objective_score ?? 'not feasible'}`,
        );
      }
      writeFileSync(
        path.join(staging, 'INTERNAL_VALIDATION.json'),
        JSON.stringify(reports, null, 2) + '\n',
      );
      for (const name of ['A', 'B', 'C', 'INTERNAL_VALIDATION.json'])
        if (existsSync(path.join(staging, name)))
          renameSync(path.join(staging, name), path.join(output, name));
      manifest.status = Object.values(reports).every((r) => r.feasible) ? 'complete' : 'infeasible';
      manifest.finished_at = new Date().toISOString();
      publishManifest();
      return manifest;
    } catch (error) {
      manifest.status = 'failed';
      manifest.error = error.message;
      publishManifest();
      throw error;
    }
  } finally {
    closeSync(lock);
    unlinkSync(lockPath);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = runSubmission(
      process.argv[2] || path.join(base, '..', 'problem-statement', 'PS1', '01_data'),
      process.argv[3] || path.join(base, '..', 'submissions', 'public'),
    );
    if (result.status !== 'complete') process.exitCode = 1;
    console.log(
      'Independent app checks only; official validator agreement has not been established.',
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
