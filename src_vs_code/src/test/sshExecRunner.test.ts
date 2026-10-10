import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
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

/**
 * A caller already gone launches nothing (`PLAN_wsl_bridge_outlives_its_client.md` §5.7, the consultant's
 * check on E4.S1): the runner used to spawn first and subscribe to the abort after, so a request whose
 * client had left still started its child — and killed it a moment later, after it may have done its work.
 * A marker file is what the child would write, so "never launched" is observed rather than inferred.
 */
function marker(): string {
  return path.join(os.tmpdir(), `creds-runner-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

const writes = (file: string): string => `require('fs').writeFileSync(${JSON.stringify(file)}, 'ran')`;

test('an already-aborted signal launches nothing — the child is never spawned', async () => {
  const file = marker();
  const gone = new AbortController();
  gone.abort();

  await assert.rejects(run(writes(file), 10_000, gone.signal), { name: 'AbortError' });
  await new Promise((resolve) => setTimeout(resolve, 300));

  assert.equal(fs.existsSync(file), false, 'a child was launched for a caller already gone');
});

test('a fired start gate launches nothing either', async () => {
  const file = marker();
  const gone = new AbortController();
  gone.abort();

  await assert.rejects(
    runBounded(node, ['-e', writes(file)], false, { env: process.env, timeoutMs: 10_000, startGate: gone.signal }),
    { name: 'AbortError' },
  );
  await new Promise((resolve) => setTimeout(resolve, 300));

  assert.equal(fs.existsSync(file), false);
});

test('a start gate that fires AFTER the launch does not kill the child — that is what it is for', async () => {
  // A rotation's statement: once it runs it may have changed the far side, so the request ending only
  // stops the start, never the run (`useActions.launchGuards`, finishOnceStarted).
  const file = marker();
  const gate = new AbortController();
  const p = runBounded(node, ['-e', `setTimeout(() => { ${writes(file)}; process.exit(0) }, 400)`], false, {
    env: process.env,
    timeoutMs: 10_000,
    startGate: gate.signal,
  });
  setTimeout(() => gate.abort(), 100);

  const outcome = await p;

  assert.equal(outcome.exitCode, 0, 'the started child was killed by the start gate');
  assert.equal(fs.existsSync(file), true);
  fs.rmSync(file, { force: true });
});
