import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { MCP_CLIENT_TARGETS, installedMessage, mcpServerBlock } from '../mcpClientConfig';

/**
 * The block a person pastes into their MCP client.
 *
 * <p>Small enough to look correct by eye, and one of the two ways it can be wrong is invisible
 * that way: a Windows path written into JSON by hand carries backslashes, and `C:\Users\…` is a
 * string with three invalid escapes in it. The client then reports a malformed config, which
 * sends the person looking at the wrong thing entirely.</p>
 */

test('a Windows path survives into valid JSON', () => {
  // The one that would have been shipped broken. `\U` and `\c` are not escapes JSON knows.
  const block = mcpServerBlock('C:\\Users\\someone\\AppData\\creds-mcp.exe');

  const parsed = JSON.parse(block) as { mcpServers: { creds: { command: string } } };
  assert.equal(parsed.mcpServers.creds.command, 'C:\\Users\\someone\\AppData\\creds-mcp.exe');
});

test('a POSIX path survives too, unchanged', () => {
  const parsed = JSON.parse(mcpServerBlock('/home/someone/.config/creds-mcp')) as {
    mcpServers: { creds: { command: string } };
  };

  assert.equal(parsed.mcpServers.creds.command, '/home/someone/.config/creds-mcp');
});

test('it names the FULL path, because the binary is deliberately not on the PATH', () => {
  // Installing into the extension's own storage is the decision this follows from: a client
  // told `"command": "creds-mcp"` would report that it cannot find it.
  const block = mcpServerBlock('/opt/creds/creds-mcp');

  assert.equal(block.includes('/opt/creds/creds-mcp'), true);
  assert.equal(/"command":\s*"creds-mcp"/.test(block), false);
});

test('the block is indented, because a person is going to read it before pasting it', () => {
  assert.equal(mcpServerBlock('/x/creds-mcp').includes('\n'), true);
});

test('the message says the one thing that is easy to get wrong afterwards', () => {
  // Installing the server grants nothing. Somebody who pastes the config and expects their
  // agent to see their vault has one more step, and it is not a step they would guess.
  const message = installedMessage('/x/creds-mcp');

  assert.equal(message.includes('/x/creds-mcp'), true);
  assert.equal(message.includes('Agent access'), true);
  assert.equal(message.includes('restart'), true);
});

test('every client target names a file a person could actually open', () => {
  assert.ok(MCP_CLIENT_TARGETS.length > 0);
  for (const target of MCP_CLIENT_TARGETS) {
    assert.ok(target.label.length > 0);
    assert.match(target.path, /\.json$/);
  }
});
