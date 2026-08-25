import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseAgentCliArgs } from '../agentCliArgs';

/**
 * What the agent types. Anything this accepts becomes a remote command, so
 * the accepted shapes are named exhaustively rather than inferred.
 */

test('ssh <token> -- <command> parses into an exec request', () => {
  assert.deepEqual(parseAgentCliArgs(['ssh', '51234.aa', '--', 'uname', '-a']), {
    kind: 'exec',
    token: '51234.aa',
    command: 'uname -a',
  });
});

test('a quoted remote command arrives as one argument and stays whole', () => {
  assert.deepEqual(parseAgentCliArgs(['ssh', 't', '--', 'docker ps | grep web']), {
    kind: 'exec',
    token: 't',
    command: 'docker ps | grep web',
  });
});

test('remote flags after -- are the remote command, never ours', () => {
  const parsed = parseAgentCliArgs(['ssh', 't', '--', 'ls', '--color=never', '-la']);
  assert.equal(parsed.kind === 'exec' && parsed.command, 'ls --color=never -la');
});

test('terminal <token> parses, and takes nothing else', () => {
  assert.deepEqual(parseAgentCliArgs(['terminal', 't']), { kind: 'terminal', token: 't' });
  assert.equal(parseAgentCliArgs(['terminal', 't', 'extra']).kind, 'error');
});

test('the -- separator is required, and must come first', () => {
  // Without it, "uname" could just as well have been meant as our own flag.
  assert.equal(parseAgentCliArgs(['ssh', 't', 'uname']).kind, 'error');
  assert.equal(parseAgentCliArgs(['ssh', 't', 'uname', '--', '-a']).kind, 'error');
});

test('an empty remote command is an error, not an empty ssh call', () => {
  assert.equal(parseAgentCliArgs(['ssh', 't', '--']).kind, 'error');
  assert.equal(parseAgentCliArgs(['ssh', 't', '--', '   ']).kind, 'error');
});

test('a missing verb, a missing token, or an unknown verb all error with usage', () => {
  for (const argv of [[], ['ssh'], ['terminal'], ['scp', 't']]) {
    const parsed = parseAgentCliArgs(argv);
    assert.equal(parsed.kind, 'error', JSON.stringify(argv));
    assert.equal(parsed.kind === 'error' && parsed.message.includes('usage:'), true);
  }
});

/* --- the verbs the other kinds answer to --- */

test('the no-argument verbs parse to their own request kinds', () => {
  // Each of these runs exactly what a human saved, so there is nothing after the token
  // to parse — and anything there is a mistake worth naming rather than ignoring.
  assert.deepEqual(parseAgentCliArgs(['run', 'p.s']), { kind: 'run', token: 'p.s' });
  assert.deepEqual(parseAgentCliArgs(['script', 'p.s']), { kind: 'script', token: 'p.s' });
  assert.deepEqual(parseAgentCliArgs(['env', 'p.s']), { kind: 'env', token: 'p.s' });
  assert.deepEqual(parseAgentCliArgs(['vpn-up', 'p.s']), { kind: 'vpn-up', token: 'p.s' });
  assert.deepEqual(parseAgentCliArgs(['vpn-down', 'p.s']), { kind: 'vpn-down', token: 'p.s' });
});

test('a no-argument verb given arguments is refused, not silently trimmed', () => {
  for (const verb of ['run', 'script', 'env', 'vpn-up', 'vpn-down']) {
    const r = parseAgentCliArgs([verb, 'p.s', 'extra']);
    assert.equal(r.kind, 'error', verb);
  }
});

test('db takes its query after the same mandatory separator ssh uses', () => {
  assert.deepEqual(parseAgentCliArgs(['db', 'p.s', '--', 'select', '1']), {
    kind: 'db',
    token: 'p.s',
    query: 'select 1',
  });
  // Without `--` a query beginning with a dash would be read as our own flag.
  assert.equal(parseAgentCliArgs(['db', 'p.s', 'select 1']).kind, 'error');
  assert.equal(parseAgentCliArgs(['db', 'p.s', '--']).kind, 'error');
});
