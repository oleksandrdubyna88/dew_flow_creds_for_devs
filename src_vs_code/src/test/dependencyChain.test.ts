import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { loadWithVscode } from './vscodeStub';
import { EntityMetadata } from '../types';
import { RunVpn, hostOs, memoryTrust, ownerChain, quotedPath, startVpn, storageOf, terminalNamed, world } from './vpnWorld';

/**
 * Issue #103 end to end under the `vscode` stub: the owner's own chain. A VPN whose launcher is a
 * Terminal entry "start openvpn", which depends on "install openvpn" — execute ticked on both.
 * Starting the VPN must run the installer, WAIT for it, and only then type the launcher's line
 * with `{config}` filled in; a failed install must stop everything after it.
 *
 * <p>The world — the stubbed terminals, shell integration and modals — is `vpnWorld.ts`.</p>
 */

test('the owner\'s chain: the installer runs and is AWAITED, then the launcher is typed with {config} filled in', async () => {
  const w = world({});
  const { started, dir } = await startVpn(w, ownerChain());
  try {
    assert.equal(started, true, w.warnings.join('\n'));
    const chain = terminalNamed(w, 'CredsForDevs: before org meter stage');
    assert.deepEqual(chain.executed, ['install-openvpn'], 'the installer ran; the launcher did NOT run twice');
    const launcher = terminalNamed(w, 'CredsForDevs: start openvpn');
    assert.equal(launcher.sent.length, 1);
    assert.match(launcher.sent[0], /^openvpn --config '.*org_meter_stage\.ovpn'$/);
    assert.equal(fs.readFileSync(quotedPath(launcher.sent[0]), 'utf8'), 'client\nremote vpn.example 1194\n', 'the config the line names was written');
    // Both lines were confirmed once — the chain in one modal, the launcher's template in its own.
    assert.ok(w.warnings.some((t) => /Before "org meter stage", these run in .*, in order/.test(t)), w.warnings.join('\n'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a failed installer ASKS, and Stop stops — the launcher is never typed, and the caller hears FALSE', async () => {
  const w = world({ 'install-openvpn': 1 }, { notification: 'Stop' });
  const { started, dir } = await startVpn(w, ownerChain());
  try {
    assert.equal(started, false);
    assert.equal(w.terminals.find((t) => t.name === 'CredsForDevs: start openvpn'), undefined);
    assert.ok(w.infos.some((t) => /"install openvpn" exited with code 1/.test(t)), w.infos.join('\n'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('an installer that exits non-zero because the tool is already there: Continue goes on to the launcher', async () => {
  // winget answers "no applicable upgrade" with a non-zero code; a hard stop would block every
  // start after the first.
  const w = world({ 'install-openvpn': -1978335189 }, { notification: 'Continue' });
  const { started, dir } = await startVpn(w, ownerChain());
  try {
    assert.equal(started, true, w.warnings.join('\n'));
    assert.equal(terminalNamed(w, 'CredsForDevs: start openvpn').sent.length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the chain modal dismissed: nothing runs and the caller hears FALSE', async () => {
  const w = world({}, { modal: 'dismiss' });
  const { started, dir } = await startVpn(w, ownerChain());
  try {
    assert.equal(started, false);
    assert.equal(w.terminals.length, 0, 'no terminal was opened for a chain the person declined');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a launcher in the Trash is not run — the built-in launcher is used, with a warning', async () => {
  const nodes = ownerChain();
  const w = world({});
  const trash = { id: 'trash', name: 'Trash', type: 'folder', parentId: null, isTrash: true };
  const plain = storageOf(nodes);
  const storage = {
    ...plain,
    getNode: (account: string, id: string) => {
      if (id === 'trash') {
        return trash;
      }
      return id === 'start' ? { id, type: 'entity', parentId: 'trash', details: nodes.start } : plain.getNode(account, id);
    },
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'creds-chain-'));
  try {
    const { runVpn } = loadWithVscode<{ runVpn: RunVpn }>('../vpnRun', w.vscode, {
      './vpnExec': { resolveVpnLauncher: () => ({ kind: 'cli', exe: 'openvpn' }) },
    });
    const target = { kind: 'node', accountId: 'a1', node: { id: 'vpn', name: nodes.vpn.name, details: nodes.vpn } };
    await runVpn(target, 'start', storage, dir, { noteUserActivity: () => undefined }, memoryTrust());
    assert.ok(w.warnings.some((t) => /The launcher of "org meter stage" no longer exists/.test(t)), w.warnings.join('\n'));
    assert.equal(w.terminals.find((t) => t.name === 'CredsForDevs: start openvpn'), undefined, 'the trashed launcher never ran');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a launcher without {config} writes no file and types its line as it is', async () => {
  const nodes = ownerChain();
  nodes.start = { ...nodes.start, command: 'rasdial "Work VPN"', runDependencies: undefined };
  nodes.vpn = { ...nodes.vpn, runDependencies: undefined };
  const w = world({});
  const { started, dir } = await startVpn(w, nodes);
  try {
    assert.equal(started, true);
    assert.deepEqual(terminalNamed(w, 'CredsForDevs: start openvpn').sent, ['rasdial "Work VPN"']);
    assert.equal(fs.existsSync(path.join(dir, 'keys')), false, 'no config was materialized');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a shell that never starts is named, not waited on (gate round 1, finding 0)', async () => {
  const w = world({}, { integration: false });
  const { started, dir } = await startVpn(w, ownerChain());
  try {
    assert.equal(started, false);
    assert.ok(w.warnings.some((t) => /terminal closed before it was ready/.test(t)), w.warnings.join('\n'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('without the execute mark nothing runs first — the launcher alone is typed', async () => {
  const nodes = ownerChain();
  nodes.vpn = { ...nodes.vpn, runDependencies: undefined };
  nodes.start = { ...nodes.start, runDependencies: undefined };
  const w = world({});
  const { started, dir } = await startVpn(w, nodes);
  try {
    assert.equal(started, true);
    assert.equal(w.terminals.find((t) => t.name.startsWith('CredsForDevs: before')), undefined);
    assert.equal(w.terminals.find((t) => t.name === 'CredsForDevs: start openvpn')?.sent.length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the chain terminal closed between two steps: the second is refused, never typed into a dead terminal', async () => {
  // The security review's case: a step ends with no exit code, the Continue question sits open, the
  // person closes the terminal, then clicks Continue. Typing then throws, and an execution on a
  // disposed terminal never ends — the run must stop with a sentence instead.
  const first: EntityMetadata = { id: 'a', name: 'first', isSshEnabled: false, isTerminal: true, command: 'first-step', terminalOs: hostOs };
  const second: EntityMetadata = { id: 'b', name: 'second', isSshEnabled: false, isTerminal: true, command: 'second-step', terminalOs: hostOs };
  const vpn: EntityMetadata = { id: 'vpn', name: 'org meter stage', isSshEnabled: false, isVpn: true, vpnType: 'openvpn', dependsOn: ['a', 'b'], runDependencies: true };
  const nodes = { a: first, b: second, vpn };
  const w = world({}, { closeAfterFirst: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'creds-chain-'));
  try {
    const { runVpn } = loadWithVscode<{ runVpn: RunVpn }>('../vpnRun', w.vscode, {
      './vpnExec': { resolveVpnLauncher: () => ({ kind: 'cli', exe: 'openvpn' }) },
    });
    const target = { kind: 'node', accountId: 'a1', node: { id: 'vpn', name: vpn.name, details: vpn } };
    const started = await runVpn(target, 'start', storageOf(nodes), dir, { noteUserActivity: () => undefined }, memoryTrust());

    assert.equal(started, false);
    assert.deepEqual(terminalNamed(w, 'CredsForDevs: before org meter stage').executed, ['first-step']);
    assert.ok(w.warnings.some((t) => /closed before "second" could run/.test(t)), w.warnings.join('\n'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
