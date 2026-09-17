import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';

/**
 * Both ways of opening an SSH terminal must decide about the window in the SAME place.
 *
 * <p>There are two: the tree's Connect button (`commands/agentCommands.ts`) and the broker's
 * terminal action (`sshUseActions.ts`), and they already diverged once — the broker never passed
 * `agentServesKey`, which was invisible while it only meant materialising a key the agent could
 * have served, and is not invisible in a WSL window, where the route refuses as `agent-has-no-key`
 * while the agent is holding the key. A code round asked for the parity to be checked rather than
 * intended.</p>
 *
 * <p>This reads the SOURCE, because what it is about is which function is called, and there is no
 * runtime seam to observe it through without standing up two command hosts. It pins the whole
 * condition rather than a fragment: both must call the shared builder, and NEITHER may build a
 * window side of its own — a source test that only checks the first half survives its own break.</p>
 */

const SRC = path.join(__dirname, '..', '..', 'src');

const CALL_SITES = ['commands/agentCommands.ts', 'sshUseActions.ts'];

const read = (file: string): string => fs.readFileSync(path.join(SRC, file), 'utf8');

test('both connect call sites exist and both reach connectEntity', () => {
  // The loop below proves nothing if it runs over files that no longer call it.
  for (const file of CALL_SITES) {
    assert.match(read(file), /connectEntity\(/, `${file} no longer opens a connection`);
  }
});

test('both call sites get the window from the ONE shared builder', () => {
  for (const file of CALL_SITES) {
    assert.match(
      read(file),
      /remoteWindowDeps\(/,
      `${file} decides about the window without the shared builder`,
    );
  }
});

test('neither call site builds a window side or relay readiness of its own', () => {
  // The half that gives the test teeth. Calling the builder AND hand-rolling a side beside it is
  // exactly the divergence this is here to prevent, and the first assertion would not see it.
  for (const file of CALL_SITES) {
    const source = read(file);

    assert.doesNotMatch(source, /kind:\s*'wsl'/, `${file} names a WSL side itself`);
    assert.doesNotMatch(source, /env\.remoteName/, `${file} reads remoteName itself`);
    assert.doesNotMatch(source, /wslAgentRelay/, `${file} reads the relay setting itself`);
    assert.doesNotMatch(source, /socketPathFor/, `${file} resolves a relay socket itself`);
  }
});

test('the shared builder is the only place that reads what a window IS', () => {
  const host = read('remoteConnectHost.ts');

  assert.match(host, /vscode\.env\.remoteName/);
  assert.match(host, /workspaceFolders/);
  assert.match(host, /wslRelayDistros/);
  assert.match(host, /wslAgentRelay/);
  assert.match(host, /socketPathFor/);
});
