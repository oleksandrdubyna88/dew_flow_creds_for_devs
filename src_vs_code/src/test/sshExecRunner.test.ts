import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runBounded } from '../sshExecRunner';
import { MAX_STREAM_BYTES } from '../brokerProtocol';

/**
 * The three ceilings the broker relies on to run someone else's binary safely: a byte cap
 * so a chatty remote cannot grow the extension host's memory, a wall-clock timeout so a hung
 * child is killed not waited on, and an AbortSignal so nothing outlives the window. Plus the
 * mechanism-failure path: a binary that is not on PATH rejects, never a fake exit code.
 *
 * These spawn real `node` children — the one thing sshExecRunner exists to do and the reason
 * its argv rules live apart in sshExecCommand.ts. Kept short so the suite stays fast.
 */

const node = process.execPath;

function run(script: string, timeoutMs: number, signal?: AbortSignal) {
  return runBounded(node, ['-e', script], false, { env: process.env, timeoutMs, signal });
}

test('output past the byte cap is truncated and the child is stopped', async () => {
  // Print well past the cap; the runner must keep at most the cap and flag truncation.
  const outcome = await run(`process.stdout.write('x'.repeat(${MAX_STREAM_BYTES * 2}))`, 10_000);

  assert.equal(outcome.stdoutTruncated, true);
  assert.ok(
    Buffer.byteLength(outcome.stdout, 'utf8') <= MAX_STREAM_BYTES,
    `kept ${Buffer.byteLength(outcome.stdout, 'utf8')} bytes, cap is ${MAX_STREAM_BYTES}`,
  );
});

test('a hung child is killed at the timeout, not waited on', async () => {
  const outcome = await run('setTimeout(() => {}, 60000)', 500);

  assert.equal(outcome.timedOut, true);
  assert.equal(outcome.exitCode, null, 'killed, so no clean exit code');
  assert.ok(outcome.durationMs < 5_000, `took ${outcome.durationMs}ms, timeout was 500ms`);
});

test('aborting the signal kills the child before it finishes', async () => {
  const controller = new AbortController();
  const p = run('setTimeout(() => {}, 60000)', 60_000, controller.signal);
  setTimeout(() => controller.abort(), 200);

  const outcome = await p;

  assert.ok(outcome.durationMs < 5_000, `took ${outcome.durationMs}ms — abort did not stop it`);
});

test('a binary that is not on PATH rejects, rather than resolving with a fake exit code', async () => {
  await assert.rejects(
    runBounded('creds-for-devs-no-such-binary-xyzzy', [], false, {
      env: process.env,
      timeoutMs: 5_000,
    }),
  );
});

test('a normal child returns its real exit code and output, untruncated', async () => {
  const outcome = await run("process.stdout.write('hello'); process.exit(3)", 10_000);

  assert.equal(outcome.exitCode, 3);
  assert.equal(outcome.stdout, 'hello');
  assert.equal(outcome.stdoutTruncated, false);
  assert.equal(outcome.timedOut, false);
});
