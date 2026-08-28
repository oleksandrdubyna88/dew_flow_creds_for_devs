import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  WINDOWS_BINARY_VARIABLE,
  helpArgv,
  installArgv,
  installFailure,
  installedPathFrom,
  knowsTheBridge,
  staleBinaryWarning,
  wslInstalledMessage,
  wslPathArgv,
  wslServerBlock,
} from '../wslMcpInstall';
import { mcpServerBlock } from '../mcpClientConfig';

/**
 * The WSL route of the MCP install: the decisions, without a distribution to run them in.
 *
 * <p>What is under test is the part that was wrong before this existed — a config block naming a
 * Windows `.exe` for a client that runs in a Linux shell, and a Windows path composed rather than
 * asked for. Whether `wsl.exe` is present is not something a unit test can say anything honest
 * about; the flow that spawns it is `mcpInstallTarget.ts`.</p>
 */

test('the Windows path is handed to wslpath as an ARGUMENT, never spliced into a shell line', () => {
  // A user name with a space is the ordinary case this protects: `bash -lc` would need quoting,
  // and quoting is the question this design refuses to have.
  const argv = wslPathArgv('Ubuntu', 'C:\\Users\\Ada Lovelace\\AppData\\creds-mcp.exe');

  assert.deepEqual(argv, [
    '-d',
    'Ubuntu',
    '-e',
    'wslpath',
    '-a',
    'C:\\Users\\Ada Lovelace\\AppData\\creds-mcp.exe',
  ]);
  assert.ok(!argv.includes('bash'), 'no shell may see this path');
});

test('an unnamed distribution means the default one, not a broken -d flag', () => {
  assert.deepEqual(wslPathArgv('', 'C:\\x.exe'), ['-e', 'wslpath', '-a', 'C:\\x.exe']);
  assert.ok(!installArgv('').includes('-d'));
});

test('the install runs the SAME published one-liner the copy-command item hands out', () => {
  const argv = installArgv('Ubuntu');

  assert.deepEqual(argv.slice(0, 4), ['-d', 'Ubuntu', '-e', 'bash']);
  assert.equal(argv[4], '-lc');
  const script = argv[5];
  // The three properties that make it safe to run unattended, each from installCommand.ts.
  assert.ok(script.includes('creds-mcp-[0-9]'), 'anchored so it cannot fetch another binary');
  assert.ok(script.includes('sha256sum -c'), 'the download is verified, not decorated');
  assert.ok(script.includes('$HOME/.local/bin'), 'no sudo');
});

test('where it landed is READ from the script, not recomputed from $HOME', () => {
  // The rule the SSH relay already follows: the far side prints the answer, so nobody keeps a
  // second copy of the path rule that must agree with the first.
  assert.equal(
    installedPathFrom('installed: /home/ada/.local/bin/creds-mcp\n'),
    '/home/ada/.local/bin/creds-mcp',
  );
});

test('a login shell greeting before it does not become the path', () => {
  const noisy = 'Welcome to Ubuntu\ninstalled: /home/ada/.local/bin/creds-mcp\n';

  assert.equal(installedPathFrom(noisy), '/home/ada/.local/bin/creds-mcp');
});

test('a script that never got there yields nothing, which the caller reports as a failure', () => {
  assert.equal(installedPathFrom('curl: (6) Could not resolve host: api.github.com\n'), '');
  assert.equal(installedPathFrom(''), '');
});

test('the block a WSL client gets names the LINUX binary and carries the Windows one in env', () => {
  // The defect this whole route exists for: the old block named the .exe, and a Linux shell
  // cannot start it — the failure surfaced in another program as "server exited".
  const block = JSON.parse(
    wslServerBlock('/home/ada/.local/bin/creds-mcp', '/mnt/c/Users/ada/creds-mcp.exe'),
  );

  assert.equal(block.mcpServers.creds.command, '/home/ada/.local/bin/creds-mcp');
  assert.equal(
    block.mcpServers.creds.env[WINDOWS_BINARY_VARIABLE],
    '/mnt/c/Users/ada/creds-mcp.exe',
  );
  // The .exe belongs in `env` and nowhere else: naming it as the command is the original defect.
  assert.ok(!block.mcpServers.creds.command.endsWith('.exe'), 'the command is never the Windows binary');
});

test('the Windows block is unchanged — no empty env field appears in it', () => {
  const block = JSON.parse(mcpServerBlock('C:\\Users\\ada\\creds-mcp.exe'));

  assert.equal(block.mcpServers.creds.command, 'C:\\Users\\ada\\creds-mcp.exe');
  assert.ok(!('env' in block.mcpServers.creds), 'a field that does nothing invites a question');
});

test('both messages name the distribution, because a person may have several', () => {
  const done = wslInstalledMessage('Ubuntu', '/home/ada/.local/bin/creds-mcp');
  assert.ok(done.includes('Ubuntu') && done.includes('/home/ada/.local/bin/creds-mcp'));
  assert.ok(done.includes('INSIDE'), 'which client to paste it into is the whole point');

  const failed = installFailure('Ubuntu', 'curl: (6) Could not resolve host: api.github.com');
  assert.ok(failed.includes('Ubuntu'));
  assert.ok(failed.includes('curl'), 'what the distribution said is what a person can act on');
});

test('an unnamed distribution still reads as a sentence rather than a gap', () => {
  assert.ok(wslInstalledMessage('', '/home/ada/.local/bin/creds-mcp').includes('your WSL distribution'));
  assert.ok(installFailure('', '').includes('your WSL distribution'));
});

test('a published release that predates the bridge is caught, not left to fail silently', () => {
  // Measured 2026-08-28 against the real mcp-v0.1.0, cut hours before the bridge: the config was
  // right, the window was open and healthy, and the agent was told the vault was unreachable —
  // the same sentence a CLOSED window produces. The binary's own help is the signal.
  const oldHelp = 'creds-mcp — the MCP server for CredsForDevs.\n\nTools: creds_list, creds_exec…';
  const newHelp = 'creds-mcp — the MCP server.\n\nSet CREDS_MCP_WINDOWS_BINARY to the full path…';

  assert.equal(knowsTheBridge(oldHelp), false);
  assert.equal(knowsTheBridge(newHelp), true);
  assert.equal(knowsTheBridge(''), false, 'a binary that said nothing is not a binary that knows');
});

test('the stale warning says it is the RELEASE that is old, not their configuration', () => {
  const said = staleBinaryWarning('Ubuntu', '/home/ada/.local/bin/creds-mcp');

  assert.ok(said.includes('predates the WSL bridge'));
  assert.ok(said.includes('still on your clipboard'), 'the block is not wasted work');
  assert.ok(said.includes('Ubuntu'));
});

test('the help probe runs the binary directly, with no shell to quote for', () => {
  assert.deepEqual(helpArgv('Ubuntu', '/home/ada/.local/bin/creds-mcp'), [
    '-d',
    'Ubuntu',
    '-e',
    '/home/ada/.local/bin/creds-mcp',
    '--help',
  ]);
});
