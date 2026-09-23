import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { loadWithVscode } from './vscodeStub';
import { EntityMetadata } from '../types';

/**
 * Issue #103 end to end under the `vscode` stub: the owner's own chain. A VPN whose launcher is a
 * Terminal entry "start openvpn", which depends on "install openvpn" — execute ticked on both.
 * Starting the VPN must run the installer, WAIT for it, and only then type the launcher's line
 * with `{config}` filled in; a failed install must stop everything after it.
 *
 * <p>Shell integration is simulated the way VS Code delivers it: `executeCommand` returns an
 * execution, and `onDidEndTerminalShellExecution` fires later with that execution's exit code.</p>
 */

const hostOs = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux';

interface FakeTerminal {
  name: string;
  shellPath?: string;
  executed: string[];
  sent: string[];
}

interface World {
  vscode: Record<string, unknown>;
  terminals: FakeTerminal[];
  warnings: string[];
  infos: string[];
}

type Listener = (e: unknown) => void;

function world(exitCodes: Record<string, number>, opts: { integration: boolean } = { integration: true }): World {
  const terminals: FakeTerminal[] = [];
  const warnings: string[] = [];
  const infos: string[] = [];
  const ended: Listener[] = [];
  const closed: Listener[] = [];
  const subscribe = (list: Listener[]) => (l: Listener) => {
    list.push(l);
    return { dispose: () => list.splice(list.indexOf(l), 1) };
  };
  const createTerminal = (o: { name: string; shellPath?: string }) => {
    const record: FakeTerminal = { name: o.name, shellPath: o.shellPath, executed: [], sent: [] };
    terminals.push(record);
    const terminal: Record<string, unknown> = {
      name: o.name,
      creationOptions: o,
      exitStatus: undefined,
      show: () => undefined,
      dispose: () => undefined,
      sendText: (text: string) => record.sent.push(text),
    };
    if (opts.integration) {
      terminal.shellIntegration = {
        executeCommand: (line: string) => {
          record.executed.push(line);
          const execution = { line };
          setImmediate(() => [...ended].forEach((l) => l({ execution, exitCode: exitCodes[line] ?? 0 })));
          return execution;
        },
      };
    } else {
      // A shell that could not start: the terminal closes before integration ever activates.
      setImmediate(() => [...closed].forEach((l) => l(terminal)));
    }
    return terminal;
  };
  // Modals answer with their first button — the person clicked Run / Run the rest.
  const answer = (sink: string[]) => (text: string, ...rest: unknown[]) => {
    sink.push(text);
    const buttons = rest.filter((r): r is string => typeof r === 'string');
    return Promise.resolve(buttons[0]);
  };
  const vscode = {
    env: { remoteName: undefined, shell: undefined },
    window: {
      terminals: [],
      createTerminal,
      showWarningMessage: answer(warnings),
      showInformationMessage: answer(infos),
      onDidEndTerminalShellExecution: subscribe(ended),
      onDidCloseTerminal: subscribe(closed),
      onDidChangeTerminalShellIntegration: subscribe([]),
    },
  };
  return { vscode, terminals, warnings, infos };
}

function ownerChain(): Record<string, EntityMetadata> {
  const install: EntityMetadata = { id: 'install', name: 'install openvpn', isSshEnabled: false, isTerminal: true, command: 'install-openvpn', terminalOs: hostOs };
  const start: EntityMetadata = {
    id: 'start',
    name: 'start openvpn',
    isSshEnabled: false,
    isTerminal: true,
    command: 'openvpn --config {config}',
    terminalOs: hostOs,
    dependsOn: ['install'],
    runDependencies: true,
  };
  const vpn: EntityMetadata = {
    id: 'vpn',
    name: 'org meter stage',
    isSshEnabled: false,
    isVpn: true,
    vpnType: 'openvpn',
    vpnLauncherEntityId: 'start',
    dependsOn: ['start'],
    runDependencies: true,
  };
  return { install, start, vpn };
}

function storageOf(nodes: Record<string, EntityMetadata>) {
  return {
    getNode: (_account: string, id: string) => (nodes[id] === undefined ? undefined : { id, details: nodes[id] }),
    getVpnConfig: () => Promise.resolve('client\nremote vpn.example 1194\n'),
  };
}

function memoryTrust() {
  let trusted: string[] = [];
  return { get: () => trusted, update: (_k: string, v: string[]) => ((trusted = v), Promise.resolve()) };
}

function terminalNamed(w: World, name: string): FakeTerminal {
  const found = w.terminals.find((t) => t.name === name);
  assert.ok(found, `no terminal "${name}" — opened: ${w.terminals.map((t) => t.name).join(', ')}`);
  return found;
}

/** The single-quoted path in a typed line, unquoted the way both PowerShell and POSIX read it here. */
function quotedPath(line: string): string {
  const match = /'(.*)'/.exec(line);
  assert.ok(match, line);
  return match[1].replace(/''/g, "'");
}

type RunVpn =(t: unknown, a: 'start' | 'stop', s: unknown, dir: string, k: unknown, trust: unknown) => Promise<boolean>;

async function startVpn(w: World, nodes: Record<string, EntityMetadata>): Promise<{ started: boolean; dir: string }> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'creds-chain-'));
  const { runVpn } = loadWithVscode<{ runVpn: RunVpn }>('../vpnRun', w.vscode);
  const target = { kind: 'node', accountId: 'a1', node: { id: 'vpn', name: nodes.vpn.name, details: nodes.vpn } };
  const started = await runVpn(target, 'start', storageOf(nodes), dir, { noteUserActivity: () => undefined }, memoryTrust());
  return { started, dir };
}

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
    assert.ok(w.warnings.some((t) => /Before "org meter stage", these run in order/.test(t)), w.warnings.join('\n'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a failed installer stops the chain — the launcher is never typed, and the caller hears FALSE', async () => {
  const w = world({ 'install-openvpn': 1 });
  const { started, dir } = await startVpn(w, ownerChain());
  try {
    assert.equal(started, false);
    assert.equal(w.terminals.find((t) => t.name === 'CredsForDevs: start openvpn'), undefined);
    assert.ok(w.warnings.some((t) => /"install openvpn" failed \(exit code 1\)/.test(t)), w.warnings.join('\n'));
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
