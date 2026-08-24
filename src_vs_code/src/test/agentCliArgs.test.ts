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
