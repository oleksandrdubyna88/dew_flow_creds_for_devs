// What the runner's audit says about what it could NOT see (E2.1, CodeRabbit's review of PR #294): a root it cannot list fails the
// run (it saw nothing, which is not "nothing is there"), and a claim it cannot read is named instead of skipped without a word.
//
// Same rules as the other runner files: private roots through the `roots` seam, no real sweep, seams for what cannot be had.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { ENDED, RECORD, exists, lines, nothingSwept, plant, privateRoot, runner, suite } from './runnerWorld';

const posixOnly = process.platform === 'win32' ? { skip: 'POSIX: a root made unlistable by mode or by being a file' } : {};
/** A mode-0 folder is still listable by root, so the scenario that relies on EACCES skips under it. */
const blindOnly = process.platform !== 'win32' && process.getuid?.() !== 0 ? {} : { skip: 'needs a POSIX caller that is not root: mode 0 stops only the others' };

test('a root that cannot be listed (not a folder) is named with its code, nothing is removed from it, and a passing suite fails', posixOnly, async (t) => {
  const { runWithAudit } = await runner();
  const good = privateRoot(t);
  const bad = path.join(privateRoot(t), 'a-file-not-a-folder');
  fs.writeFileSync(bad, 'x');
  const log = lines();
  const code = await runWithAudit([], { spawn: suite(0), roots: [good, bad], confirm: ENDED, sweep: nothingSwept, write: log.write });

  assert.equal(code, 1, 'the audit could not see a whole root: the run does not pass');
  assert.ok(log.seen.some((line) => line.startsWith('run-tests: unlisted:') && line.includes(bad) && line.includes('ENOTDIR')), log.seen.join(' | '));
  assert.ok(exists(bad), 'nothing is removed on that path');
});

test('a root with mode 0 (EACCES) is named and fails the run', blindOnly, async (t) => {
  const { runWithAudit } = await runner();
  const root = privateRoot(t);
  fs.chmodSync(root, 0);
  const log = lines();
  try {
    const code = await runWithAudit([], { spawn: suite(0), roots: [root], confirm: ENDED, sweep: nothingSwept, write: log.write });

    assert.equal(code, 1);
    assert.ok(log.seen.some((line) => line.startsWith('run-tests: unlisted:') && line.includes(root) && line.includes('EACCES')), log.seen.join(' | '));
  } finally {
    fs.chmodSync(root, 0o700); // so the scope can remove it
  }
});

test('a root that is not there stays an empty root: no line, and the suite keeps its own code', async (t) => {
  const { runWithAudit } = await runner();
  const missing = path.join(privateRoot(t), 'not-made');
  const log = lines();

  const code = await runWithAudit([], { spawn: suite(0), roots: [missing], confirm: ENDED, sweep: nothingSwept, write: log.write });

  assert.equal(code, 0);
  assert.deepEqual(log.seen, []);
});

test('a claim that cannot be parsed is listed as unreadable, its folder stays, and the exit code is the suite\'s own', async (t) => {
  const { runWithAudit } = await runner();
  const root = privateRoot(t);
  const log = lines();
  let broken = '';

  const code = await runWithAudit([], {
    spawn: suite(0, () => {
      broken = plant(root, 'broken', RECORD);
      fs.writeFileSync(`${broken}.owner`, 'this is not an owner record\n');
    }),
    roots: [root],
    confirm: ENDED,
    sweep: nothingSwept,
    write: log.write,
  });

  assert.equal(code, 0, 'the exit code does not change');
  assert.ok(exists(broken) && exists(`${broken}.owner`), 'nothing is removed');
  assert.ok(log.seen.some((line) => line.startsWith('run-tests: unreadable:') && line.includes(`${broken}.owner`)), log.seen.join(' | '));
});
