import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadWithVscode } from './vscodeStub';
import { EntityMetadata } from '../types';

/**
 * A VPN start under the `vscode` stub — the world `dependencyChain.test.ts` and
 * `vpnGoneRequest.test.ts` share, lifted out of the first so the second did not copy it.
 *
 * <p>Shell integration is simulated the way VS Code delivers it: `executeCommand` returns an
 * execution, and `onDidEndTerminalShellExecution` fires later with that execution's exit code.
 * Nothing here starts a process: every terminal is a record of what was typed into it.</p>
 *
 * <p>Not named `*.test.ts`, so the runner never treats it as a suite with no tests in it.</p>
 */

const HOST_OS: Partial<Record<NodeJS.Platform, string>> = { win32: 'windows', darwin: 'macos' };

/** This machine's `terminalOs` — the value an entry written for it carries. */
export const hostOs = HOST_OS[process.platform] ?? 'linux';

export interface FakeTerminal {
  name: string;
  shellPath?: string;
  executed: string[];
  sent: string[];
}

/** A dialog the world is holding open until the test answers it. */
export interface HeldDialog {
  text: string;
  buttons: string[];
  answer(button: string | undefined): void;
}

export interface World {
  vscode: Record<string, unknown>;
  terminals: FakeTerminal[];
  warnings: string[];
  infos: string[];
  /** Dialogs matched by `holdDialogs`, oldest first — each waits for the test's answer. */
  held: HeldDialog[];
}

type Listener = (e: unknown) => void;

export interface WorldOptions {
  integration?: boolean;
  /** What the person clicks on a notification (Continue / Stop). */
  notification?: 'Continue' | 'Stop';
  /** A modal gets its first button unless the test dismisses it. */
  modal?: 'first' | 'dismiss';
  /** The person closes the chain terminal as soon as the first step ends. */
  closeAfterFirst?: boolean;
  /** Dialogs whose text matches stay open until the test answers them through `w.held`. */
  holdDialogs?: RegExp;
  /** Called as each chain step is handed to the shell — before its end is reported. */
  onExecute?: (line: string) => void;
}

export function world(exitCodes: Record<string, number>, opts: WorldOptions = {}): World {
  const terminals: FakeTerminal[] = [];
  const warnings: string[] = [];
  const infos: string[] = [];
  const held: HeldDialog[] = [];
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
          opts.onExecute?.(line);
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
  // notification answers what the test says the person clicked; a held dialog waits for the test.
  const answer = (sink: string[]) => (text: string, ...rest: unknown[]) => {
    sink.push(text);
    const buttons = rest.filter((r): r is string => typeof r === 'string');
    if (opts.holdDialogs?.test(text) === true) {
      return new Promise<string | undefined>((resolve) => held.push({ text, buttons, answer: resolve }));
    }
    return Promise.resolve(reply(opts, buttons, isModal(rest[0])));
  };
  const vscode = {
    env: { remoteName: undefined, shell: undefined },
    window: {
      terminals: [],
      createTerminal,
      showWarningMessage: answer(warnings),
      showInformationMessage: answer(infos),
      showErrorMessage: answer(warnings),
      onDidEndTerminalShellExecution: subscribe(ended),
      onDidCloseTerminal: subscribe(closed),
      onDidChangeTerminalShellIntegration: subscribe([]),
    },
  };
  return { vscode, terminals, warnings, infos, held };
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

/** Poll until `ready`, failing with `what` rather than hanging the suite. */
export function until(ready: () => boolean, what: string, ms = 3000): Promise<void> {
  const deadline = Date.now() + ms;
  return new Promise((resolve, reject) => {
    const poll = (): void => {
      if (ready()) {
        resolve();
      } else if (Date.now() > deadline) {
        reject(new assert.AssertionError({ message: `timed out waiting for ${what}` }));
      } else {
        setTimeout(poll, 5);
      }
    };
    poll();
  });
}

/** The owner's own chain (#103): a VPN started by "start openvpn", which depends on "install openvpn". */
export function ownerChain(): Record<string, EntityMetadata> {
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

export const STORED_CONFIG = 'client\nremote vpn.example 1194\n';

export function storageOf(nodes: Record<string, EntityMetadata>, config: () => Promise<string | undefined> = () => Promise.resolve(STORED_CONFIG)) {
  return {
    getNode: (_account: string, id: string) => (nodes[id] === undefined ? undefined : { id, details: nodes[id] }),
    getVpnConfig: config,
  };
}

export function memoryTrust() {
  let trusted: string[] = [];
  const update = (_k: string, v: string[]): Promise<void> => {
    trusted = v;
    return Promise.resolve();
  };
  return { get: () => trusted, update };
}

export function terminalNamed(w: World, name: string): FakeTerminal {
  const found = w.terminals.find((t) => t.name === name);
  assert.ok(found, `no terminal "${name}" — opened: ${w.terminals.map((t) => t.name).join(', ')}`);
  return found;
}

/** The single-quoted path in a typed line, unquoted the way both PowerShell and POSIX read it here. */
export function quotedPath(line: string): string {
  const match = /'(.*)'/.exec(line);
  assert.ok(match, line);
  return match[1].replaceAll("''", "'");
}

export type RunVpn = (
  t: unknown,
  a: 'start' | 'stop',
  s: unknown,
  dir: string,
  k: unknown,
  trust: unknown,
  startGate?: AbortSignal,
) => Promise<boolean>;

export interface StartOptions {
  action?: 'start' | 'stop';
  /** The agent request's signal — absent for the person's own click. */
  startGate?: AbortSignal;
  storage?: ReturnType<typeof storageOf>;
  mocks?: Record<string, unknown>;
}

/**
 * Start (or stop) the VPN entry `vpn` of `nodes`, in a fresh storage directory.
 *
 * <p>`ended` is the request's end THROWN from inside the start — a chain that had typed a step when the
 * client left says so that way (E4.S4) — caught here so the directory is still handed back for cleanup.</p>
 */
export async function startVpn(w: World, nodes: Record<string, EntityMetadata>, o: StartOptions = {}): Promise<{ started: boolean; dir: string; ended?: Error }> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'creds-chain-'));
  const { runVpn } = loadWithVscode<{ runVpn: RunVpn }>('../vpnRun', w.vscode, o.mocks);
  const target = { kind: 'node', accountId: 'a1', node: { id: 'vpn', name: nodes.vpn.name, details: nodes.vpn } };
  const storage = o.storage ?? storageOf(nodes);
  try {
    return { started: await runVpn(target, actionOf(o), storage, dir, { noteUserActivity: () => undefined }, memoryTrust(), o.startGate), dir };
  } catch (error) {
    return { started: false, dir, ended: asError(error) };
  }
}

function actionOf(o: StartOptions): 'start' | 'stop' {
  return o.action ?? 'start';
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/** Every file under `dir` — what a start left on disk. */
export function filesUnder(dir: string): string[] {
  return fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name) : [];
}
