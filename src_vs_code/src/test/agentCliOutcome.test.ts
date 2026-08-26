import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EXIT, interpretSuccess } from '../agentCliOutcome';

/**
 * What the CLI prints and exits with when the broker answered 200.
 *
 * <p>Extracted from `agentCli.main` because it was untestable inside it, and because it is the
 * half of the wire contract a second implementation has to reproduce exactly — an agent reads
 * the exit code, so "success" meaning 0 in one client and 95 in another is not a cosmetic
 * difference.</p>
 *
 * <p>The defect these were written against: every verb whose response has no `exitCode` field
 * fell through to `EXIT.brokerFailure`. `credential:exportEnv` answers `{written}` and
 * `vpn:up`/`down` answer `{opened}`, so all three reported a **successful** call as failure 95
 * and printed nothing at all. Nothing in the suite covered those three verbs.</p>
 */

test('a finished command passes the remote exit code through untouched', () => {
  // The property an agent depends on: `creds ssh host -- false` must exit 1, not "our" 0.
  const outcome = interpretSuccess('exec', {
    exitCode: 3,
    stdout: 'out',
    stderr: 'err',
    stdoutTruncated: false,
    stderrTruncated: false,
    timedOut: false,
    durationMs: 5,
  });

  assert.equal(outcome.exitCode, 3);
  assert.equal(outcome.stdout, 'out');
  assert.equal(outcome.stderr, 'err');
});

test('a successful env export exits 0 and names the variables', () => {
  const outcome = interpretSuccess('env', { written: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'] });

  assert.equal(outcome.exitCode, 0, 'success is not a broker failure');
  assert.match(outcome.stdout, /AWS_ACCESS_KEY_ID/);
  assert.match(outcome.stdout, /AWS_SECRET_ACCESS_KEY/);
});

test('the env export prints NAMES and can never print a value', () => {
  // The whole point of the verb: the agent learns what exists, never what it is.
  const outcome = interpretSuccess('env', { written: ['DB_PASSWORD'], values: ['hunter2'] });

  assert.equal(outcome.stdout.includes('hunter2'), false, outcome.stdout);
});

test('an env export that wrote nothing says so instead of printing an empty line', () => {
  const outcome = interpretSuccess('env', { written: [] });

  assert.equal(outcome.exitCode, 0);
  assert.match(outcome.stdout + outcome.notes.join(' '), /no variables/i);
});

test('vpn-up and vpn-down exit 0 when the tunnel was actually actioned', () => {
  for (const kind of ['vpn-up', 'vpn-down']) {
    const outcome = interpretSuccess(kind, { opened: true });
    assert.equal(outcome.exitCode, 0, kind);
    assert.notEqual(outcome.stdout.trim(), '', `${kind} must say something`);
  }
});

test('a vpn action the human refused is reported as refused, not as success', () => {
  // `opened: false` is a 200 — the call worked, the person declined. Exiting 0 would tell the
  // agent the tunnel is up when it is not, which is worse than any error code.
  const outcome = interpretSuccess('vpn-up', { opened: false });

  assert.notEqual(outcome.exitCode, 0);
  assert.match(outcome.stderr + outcome.notes.join(' '), /not|refus|declin/i);
});

test('an opened terminal exits 0 and says where it opened', () => {
  const outcome = interpretSuccess('terminal', { opened: true });

  assert.equal(outcome.exitCode, 0);
  assert.match(outcome.stdout, /VS Code/);
});

test('a truncated or timed-out command is reported as such', () => {
  const truncated = interpretSuccess('exec', {
    exitCode: 0,
    stdout: 'x',
    stderr: '',
    stdoutTruncated: true,
    stderrTruncated: false,
    timedOut: false,
    durationMs: 1,
  });
  assert.match(truncated.notes.join(' '), /truncated/i);

  const timedOut = interpretSuccess('exec', {
    exitCode: null,
    stdout: '',
    stderr: '',
    stdoutTruncated: false,
    stderrTruncated: false,
    timedOut: true,
    durationMs: 1,
  });
  assert.equal(timedOut.exitCode, EXIT.remoteTimeout);
});

test('an exec-shaped answer with no exitCode is still a broker failure', () => {
  // The original behaviour, kept for the verbs it is actually right for: an exec that came
  // back without a code is a broker that did not do its job.
  const outcome = interpretSuccess('exec', { stdout: '', stderr: '' });

  assert.equal(outcome.exitCode, EXIT.brokerFailure);
});

test('every verb the CLI can send has an interpretation', () => {
  // The table this replaced was a chain of ternaries where a missing verb fell through to
  // failure silently — which is exactly how env and vpn came to report success as 95.
  const EXEC_OK = {
    exitCode: 0,
    stdout: '',
    stderr: '',
    stdoutTruncated: false,
    stderrTruncated: false,
    timedOut: false,
    durationMs: 1,
  };
  const SUCCESSES: Record<string, Record<string, unknown>> = {
    exec: EXEC_OK,
    db: EXEC_OK,
    run: EXEC_OK,
    script: EXEC_OK,
    terminal: { opened: true },
    env: { written: [] },
    'vpn-up': { opened: true },
    'vpn-down': { opened: true },
  };

  for (const [kind, body] of Object.entries(SUCCESSES)) {
    assert.equal(interpretSuccess(kind, body).exitCode, 0, `${kind} must succeed on a success`);
  }
});
