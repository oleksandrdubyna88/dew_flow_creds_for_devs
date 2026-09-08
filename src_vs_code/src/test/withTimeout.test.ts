import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { test } from 'node:test';
import { withTimeout } from '../withTimeout';

/**
 * The bound on a promise — and the one property of it that a normal test cannot observe.
 *
 * <p>This helper was private inside `credsAgentServer`, where it always ran beside a live HTTP
 * server, so its timer was `unref`'d and nothing ever noticed. The locked-vault offer awaits it
 * with nothing else running, and on CI's Node 22 that combination ended the process: an
 * `unref`'d timer does not keep the event loop alive, so the runner exited mid-file and the four
 * tests after it were reported as `cancelledByParent` — not a failure anywhere, and no assertion
 * that could see it. The child process below is what makes the property testable.</p>
 */

test('the bound fires even when nothing else keeps the event loop alive', () => {
  // A promise that never settles and a timer: if the timer does not hold the loop, node simply
  // exits and prints nothing, which is exactly the CI symptom this reproduces.
  const script = `
    const { withTimeout } = require(${JSON.stringify(path.resolve(__dirname, '../withTimeout.js'))});
    void withTimeout(new Promise(() => undefined), 20).then((value) => console.log('settled:' + String(value)));
  `;
  const run = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });

  assert.equal(run.status, 0, run.stderr);
  assert.equal(
    run.stdout.trim(),
    'settled:undefined',
    'the process must live long enough for the timeout to resolve, not exit silently',
  );
});

test('a promise that settles first wins, and the timer stops holding anything', async () => {
  const value = await withTimeout(Promise.resolve('answer'), 50_000);

  assert.equal(value, 'answer', 'and a 50s timer must not delay the process by 50s');
});

test('an unref-ed bound is still available for callers that have their own reason to live', () => {
  // credsAgentServer waits on a person while an HTTP server holds the loop open; there the old
  // behaviour is right, and it stays available rather than being silently changed under it.
  const script = `
    const { withTimeout } = require(${JSON.stringify(path.resolve(__dirname, '../withTimeout.js'))});
    void withTimeout(new Promise(() => undefined), 20, { unref: true }).then(() => console.log('fired'));
  `;
  const run = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });

  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout.trim(), '', 'nothing holds this process open, so it exits instead');
});
