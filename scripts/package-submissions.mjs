import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { submissionZip } from '../railsync-app/submission-zip.mjs';

const files = ['SCHEDULE_ACCESS.csv', 'SCHEDULE_OCCUPANCY.csv', 'RESULTS.csv'];
for (const scenario of ['A', 'B', 'C']) {
  const source = join('submissions', 'public', scenario);
  const target = join('submissions', 'validator');
  mkdirSync(target, { recursive: true });
  const contents = Object.fromEntries(files.map((file) => [file, readFileSync(join(source, file), 'utf8')]));
  writeFileSync(join(target, `${scenario}.zip`), submissionZip(contents));
}
console.log('Created submissions/validator/A.zip, B.zip and C.zip with exactly three CSV entries each.');
