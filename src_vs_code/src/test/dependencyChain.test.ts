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

interface WorldOptions {
  integration?: boolean;
  /** What the person clicks on a notification (Continue / Stop). */
  notification?: 'Continue' | 'Stop';
  /** A modal gets its first button unless the test dismisses it. */
  modal?: 'first' | 'dismiss';
  /** The person closes the chain terminal as soon as the first step ends. */
  closeAfterFirst?: boolean;
}

function world(exitCodes: Record<string, number>, opts: WorldOptions = {}): World {
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
    if (opts.integration !== false) {
      terminal.shellIntegration = {
        executeCommand: (line: string) => {
          record.executed.push(line);
          const execution = { line };
          setImmediate(() => {
            [...ended].forEach((l) => l({ execution, exitCode: exitCodes[line] ?? 0 }));
            if (opts.closeAfterFirst === true) {
              terminal.exitStatus = { code: 0 };
            }
          });
          return execution;
        },
      };
    } else {
      // A shell that could not start: the terminal closes before integration ever activates.
      setImmediate(() => [...closed].forEach((l) => l(terminal)));
    }
    return terminal;
  };
  // A modal answers with its first button (Run / Run the rest) unless the test dismisses it; a
  // notification answers what the test says the person clicked.
  const answer = (sink: string[]) => (text: string, ...rest: unknown[]) => {
    sink.push(text);
    return Promise.resolve(reply(opts, rest.filter((r): r is string => typeof r === 'string'), isModal(rest[0])));
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

function reply(opts: WorldOptions, buttons: string[], modal: boolean): string | undefined {
  if (modal) {
    return opts.modal === 'dismiss' ? undefined : buttons[0];
  }
  return clickedOf(opts.notification ?? 'Continue', buttons);
}

function clickedOf(clicked: string, buttons: string[]): string | undefined {
  return buttons.includes(clicked) ? clicked : buttons[0];
}

function isModal(options: unknown): boolean {
  return typeof options === 'object' && options !== null && (options as { modal?: boolean }).modal === true;
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

type RunVpn = (t: unknown, a: 'start' | 'stop', s: unknown, dir: string, k: unknown, trust: unknown) => Promise<boolean>;

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
