import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const base = new URL('../problem-statement/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('provenance.json', base)));
const files = readdirSync(new URL('PS1/', base), { recursive: true, withFileTypes: true }).filter(
  (x) => x.isFile(),
);
if (files.length !== Object.keys(manifest.sha256).length)
  throw Error('Reference file count differs from provenance');
for (const [name, expected] of Object.entries(manifest.sha256)) {
  const hash = createHash('sha256')
    .update(readFileSync(new URL('PS1/' + name, base)))
    .digest('hex');
  if (hash !== expected) throw Error('Reference checksum mismatch: ' + name);
}
console.log(`Verified ${files.length} official PS1 files at ${manifest.commit}`);
