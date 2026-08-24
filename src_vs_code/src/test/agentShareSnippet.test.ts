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
