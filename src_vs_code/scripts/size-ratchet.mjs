// The size ratchet (tails T3): an exempted file may shrink, never grow.
//
// Reads .size-baseline.json (file -> line count), measures each file, and exits non-zero when
// one is LARGER than its baseline. `--update` rewrites the baseline DOWN to the measured size
// for files that shrank — the only direction the baseline can move without editing it by hand,
// which is the point. The decision itself is src/sizeRatchet.ts, and is unit-tested.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = join(root, '.size-baseline.json');
const { ratchet, tightened } = await import(pathToFileURL(join(root, 'out', 'sizeRatchet.js')).href);

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const actual = Object.fromEntries(
  Object.keys(baseline).map((file) => {
    try {
      // Newlines, like `wc -l` — so a trailing newline is not counted as a phantom line.
      return [file, (readFileSync(join(root, file), 'utf8').match(/\n/g) ?? []).length];
    } catch {
      return [file, undefined];
    }
  }),
);

const verdicts = ratchet(baseline, actual);
let failed = false;
for (const verdict of verdicts) {
  console.log(`${verdict.state === 'ok' ? '  ' : '! '}${verdict.message}`);
  failed ||= verdict.state === 'grew' || verdict.state === 'unlisted';
}

if (process.argv.includes('--update')) {
  writeFileSync(baselinePath, JSON.stringify(tightened(baseline, actual), null, 2) + '\n');
  console.log('baseline tightened');
} else if (verdicts.some((v) => v.state === 'shrank')) {
  console.log('(a file shrank — run `npm run ratchet -- --update` to lock the smaller size in)');
}
process.exit(failed ? 1 : 0);
