import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildAgentSnippet, buildKindSnippet } from '../agentShareSnippet';

/**
 * The snippet is the whole user interface of this feature: paste it, and an
 * agent knows what it may do. So the commands have to be right, and the two
 * caveats — window-scoped, always logged — have to be in it.
 */

const input = {
  entityName: 'prod-db',
  target: 'deploy@example.com',
  token: '51234.aabbcc',
  cliPath: 'C:\\Users\\dev\\.vscode\\extensions\\creds for devs\\out\\agentCli.js',
};

test('both command forms are present, with the token', () => {
  const snippet = buildAgentSnippet(input);

  assert.match(snippet, /ssh 51234\.aabbcc -- <command>/);
  assert.match(snippet, /terminal 51234\.aabbcc/);
});

test('the CLI path is quoted, because it can contain spaces', () => {
  const snippet = buildAgentSnippet(input);

  assert.equal(snippet.includes(`node "${input.cliPath}"`), true);
  assert.equal(snippet.includes(`node ${input.cliPath} `), false);
});

test('it says the agent never receives the credential itself', () => {
  assert.match(buildAgentSnippet(input), /never receive the credential itself/i);
});

test('it states the two caveats: window-scoped, and logged', () => {
  const snippet = buildAgentSnippet(input);

  assert.match(snippet, /window closes/i);
  assert.match(snippet, /Allow or Deny/i);
  assert.match(snippet, /output panel/i);
});

test('it names the entity and the target so a human can check what was shared', () => {
  const snippet = buildAgentSnippet(input);

  assert.match(snippet, /prod-db/);
  assert.match(snippet, /deploy@example\.com/);
});

test('it states the quoting rule that keeps one example working in every shell', () => {
  // Measured, not assumed: git-bash, Windows PowerShell 5.1 and cmd.exe all
  // deliver `-- "docker ps --format '{{.Names}}'"` as ONE argv element with the
  // single quotes intact. The divergence is inner DOUBLE quotes — PowerShell
  // drops them and splits the argument, so `grep "server name" f` arrives as
  // `grep server name f`: a different command that runs successfully, which is
  // exactly the kind of failure nobody notices.
  const snippet = buildAgentSnippet(input);

  assert.match(snippet, /PowerShell, cmd and bash alike/);
  assert.match(snippet, /single quotes inside/);
});

/* --- one snippet per kind: the agent must be told the verb that exists --- */

test('each kind gets its own verb and no other', () => {
  const base = { entityName: 'x', token: 'p.s', cliPath: 'C:/cli.js' };

  assert.match(buildKindSnippet('script', base) ?? '', /script p\.s/);
  assert.match(buildKindSnippet('terminal', base) ?? '', /run p\.s/);
  assert.match(buildKindSnippet('credential', base) ?? '', /env p\.s/);
  assert.match(buildKindSnippet('vpn', base) ?? '', /vpn-up p\.s/);
  assert.match(buildKindSnippet('db', base) ?? '', /db p\.s -- /);
});

test('every snippet says the credential is never handed over, and that calls are logged', () => {
  // The two facts the human needs after pasting: the agent cannot read the secret, and
  // everything it does is on the record.
  for (const kind of ['script', 'terminal', 'credential', 'vpn', 'db']) {
    const text = buildKindSnippet(kind, { entityName: 'x', token: 'p.s', cliPath: 'C:/cli.js' }) ?? '';
    assert.match(text, /never receive/i, kind);
    assert.match(text, /logged/i, kind);
  }
});

test('a kind with no agent capability gets no snippet rather than a wrong one', () => {
  assert.equal(buildKindSnippet('sshkey', { entityName: 'x', token: 'p.s', cliPath: 'c' }), undefined);
});
