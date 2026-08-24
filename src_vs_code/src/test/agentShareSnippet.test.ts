import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildAgentSnippet } from '../agentShareSnippet';

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
