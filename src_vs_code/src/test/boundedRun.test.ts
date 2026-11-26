// `scripts/lib/boundedRun.cjs` (G1 E3.S10, the coai code gate): one program, bounded, whose limit ends its WHOLE process tree. It is the launcher of the probes
// (`itestFeasibility.cjs`, `itestProbeResolver.cjs`); the answer keeps the shape they read: `{ code, signal, timedOut, stdout, stderr }`.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { ownedDir } from '../../scripts/lib/leftovers.cjs';
import { boundedRun } from '../../scripts/lib/boundedRun.cjs';
import { isAlive } from './runnerWorld';

const skip = process.platform === 'linux' ? false : 'the tree check reads a shell and /proc';

test('a program that ends by itself: its code, its output, and stdin closed', { skip }, async () => {
  const done = await boundedRun('sh', ['-c', 'cat; echo out; echo err >&2; exit 3'], { timeoutMs: 20_000 });
  assert.deepEqual(done, { code: 3, signal: null, timedOut: false, stdout: 'out\n', stderr: 'err\n' }, 'cat ended at once: stdin was closed');
  assert.equal((await boundedRun('true', [])).code, 0);
});

test('a program that cannot start answers code null and says why, and never rejects', { skip }, async () => {
  const done = await boundedRun('creds-no-such-program', []);
  assert.equal(done.code, null);
  assert.equal(done.timedOut, false);
  assert.match(done.stderr, /spawn creds-no-such-program ENOENT/);
});

test('the limit ends the program AND the helper it started: timedOut, code null, a signal, and no process left', { skip }, async (t) => {
  const pids = path.join(ownedDir(t, 'bounded'), 'pids');
  t.after(() => {
    for (const pid of fs.existsSync(pids) ? fs.readFileSync(pids, 'utf8').split('\n').filter((line) => /^\d+$/.test(line)).map(Number) : []) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // already gone
      }
    }
  });
  // The program starts a helper whose output is elsewhere (so it holds no pipe of ours), records both pids, and waits for the helper.
  const done = await boundedRun('sh', ['-c', 'sleep 300 >/dev/null 2>&1 & echo "$$" > "$1"; echo "$!" >> "$1"; wait', 'sh', pids], { timeoutMs: 800 });
  assert.equal(done.timedOut, true);
  assert.equal(done.code, null);
  assert.notEqual(done.signal, null);
  const both = fs.readFileSync(pids, 'utf8').split('\n').filter((line) => /^\d+$/.test(line)).map(Number);
  assert.equal(both.length, 2);
  for (let end = Date.now() + 5000; both.some(isAlive) && Date.now() < end; ) await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(both.map(isAlive), [false, false], 'the program and its helper are gone');
});
