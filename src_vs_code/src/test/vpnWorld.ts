import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { commandFingerprint } from '../commandTrust';
import { loadWithVscode } from './vscodeStub';
import { endedStage } from '../requestLife';
import { entryTerminalKey, entryTerminalTitle } from '../terminalTitles';
import { EntityMetadata, TreeNode } from '../types';
import { ownedDir, type Scope } from '../../scripts/lib/leftovers.cjs';
import { DiagnosticWriter } from '../diagnosticWriter';
import { colouringStorage } from './liveColourStorage';

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
  /** The environment the terminal was CREATED with (a password road's askpass variables), or `undefined`. */
  env?: Record<string, string>;
  /** The `color` the terminal was created with; the property is ABSENT when the options carried none (E1.S3). */
  color?: { id: string };
  executed: string[];
  sent: string[];
  /** How many times the terminal was brought to the front. */
  shown: number;
  /** How many times `dispose` was called. It closes nothing here: the terminal stays listed and live, the worst case VS Code allows. */
  disposed: number;
}

/** A dialog the world is holding open until the test answers it. */
export interface HeldDialog {
  text: string;
  buttons: string[];
  /** Whether the dialog was a modal (`{ modal: true }` as its options): a toast otherwise (E1.5, C10c, C11). */
  modal: boolean;
  answer(button: string | undefined): void;
}

/** A terminal the world made — the object a flow holds, whose record is the `FakeTerminal` of the same name. */
export interface LiveTerminal {
  readonly name: string;
  exitStatus: { code: number | undefined } | undefined;
  sendText(text: string, enter?: boolean): void;
  show(): void;
  dispose(): void;
  shellIntegration?: unknown;
}

/** Shell integration's two events, fired the way VS Code delivers them (`terminal` and `execution` on each). */
export interface ShellEvents {
  /** A command started in `terminal`; answers the execution (a fresh object unless one is given). */
  start(terminal: LiveTerminal, execution?: object): object;
  end(terminal: LiveTerminal, execution: object, exitCode: number | undefined): void;
}

export interface World {
  vscode: Record<string, unknown>;
  terminals: FakeTerminal[];
  warnings: string[];
  infos: string[];
  /** Dialogs matched by `holdDialogs`, oldest first — each waits for the test's answer. */
  held: HeldDialog[];
  /** A terminal made through the same fabric as `createTerminal`, NOT listed in `window.terminals`: one a test lists by hand with `list`. */
  open(name: string, shellPath?: string): LiveTerminal;
  /** Add a terminal to `window.terminals`, as VS Code does for one the person opened; answers it. */
  list(terminal: LiveTerminal): LiveTerminal;
  /** The terminal really ends: `exitStatus` set, gone from `window.terminals`, the close event fired. */
  exit(terminal: LiveTerminal, code?: number): void;
  /** How many times `window.terminals` was read after the first `dispose` of the world's terminals. */
  listReadsAfterDispose(): number;
  /** The `preopened` terminals and the ones a flow created, by name: the newest of each. */
  live: Record<string, LiveTerminal>;
  /** Executions started with `holdExecutions`, oldest first: each ends only when the test ends it through `shell.end`. */
  executions: { terminal: LiveTerminal; execution: object }[];
  /** How many listeners the three terminal events hold right now: what an abandoned run must not leave behind (E1.5, C20). */
  listenerCounts(): { ended: number; closed: number };
  shell: ShellEvents;
  /** How many times the start or stop told the vault the person is at the keyboard (`noteUserActivity`): the idle clock's one input from here. */
  userActivity: number;
}

type Listener = (e: unknown) => void;

export interface WorldOptions {
  /** `false`: the shell never starts (the terminal closes at once). `'absent'`: it starts and never reports shell integration, and never closes. */
  integration?: boolean | 'absent';
  /** Executions never end by themselves: `world.executions` lists them and the test ends each through `world.shell.end` (E1.5, C10). */
  holdExecutions?: boolean;
  /** What the person clicks on a notification (Continue / Stop). */
  notification?: 'Continue' | 'Stop';
  /** A modal gets its first button unless the test dismisses it or asks for the last. */
  modal?: 'first' | 'last' | 'dismiss';
  /** The person closes the chain terminal as soon as the first step ends. */
  closeAfterFirst?: boolean;
  /** Dialogs whose text matches stay open until the test answers them through `w.held`. */
  holdDialogs?: RegExp;
  /** Names of terminals that are LIVE before the flow starts. A terminal a flow creates joins them in `window.terminals` at once. */
  preopened?: readonly string[];
  /** Called as each chain step is handed to the shell — before its end is reported. */
  onExecute?: (line: string) => void;
  /** `createTerminal` throws for a terminal whose name matches. */
  failCreate?: RegExp;
  /** `sendText` throws for a terminal whose name matches: the terminal exists, the line did not reach it. */
  failSend?: RegExp;
  /** Called inside `sendText`, before the line is recorded. */
  onSend?: (name: string, line: string) => void;
}

/** `vscode.ThemeColor` as the world sees it: it keeps the id it was built with. */
class ThemeColorStub {
  constructor(readonly id: string) {}
}

export function world(exitCodes: Record<string, number>, opts: WorldOptions = {}): World {
  const terminals: FakeTerminal[] = [];
  const [warnings, infos]: [string[], string[]] = [[], []];
  const held: HeldDialog[] = [];
  const executions: { terminal: LiveTerminal; execution: object }[] = [];
  const [started, ended, closed]: [Listener[], Listener[], Listener[]] = [[], [], []];
  const subscribe = (list: Listener[]) => (l: Listener) => {
    list.push(l);
    return { dispose: () => list.splice(list.indexOf(l), 1) };
  };
  let listed: LiveTerminal[] = [];
  const reads = { disposals: 0, afterDispose: 0 };
  const makeTerminal = (o: { name: string; shellPath?: string; env?: Record<string, string>; color?: { id: string } }): LiveTerminal => {
    const record: FakeTerminal = { name: o.name, shellPath: o.shellPath, env: o.env, executed: [], sent: [], shown: 0, disposed: 0, ...('color' in o ? { color: o.color } : {}) };
    terminals.push(record);
    const terminal: LiveTerminal & { creationOptions: unknown } = {
      name: o.name,
      creationOptions: o,
      exitStatus: undefined,
      show: () => {
        record.shown += 1;
      },
      dispose: () => {
        record.disposed += 1;
        reads.disposals += 1;
      },
      sendText: (text: string) => {
        opts.onSend?.(o.name, text);
        if (opts.failSend?.test(o.name) === true) {
          throw new Error(`no line for ${o.name}`);
        }
        record.sent.push(text);
      },
    };
    if (opts.integration === false) {
      // A shell that could not start: the terminal closes before integration ever activates.
      setImmediate(() => [...closed].forEach((l) => l(terminal)));
    } else if (opts.integration !== 'absent') {
      terminal.shellIntegration = {
        executeCommand: (line: string) => {
          record.executed.push(line);
          opts.onExecute?.(line);
          const execution = { line };
          if (opts.holdExecutions === true) {
            executions.push({ terminal, execution });
            return execution;
          }
          setImmediate(() => {
            [...ended].forEach((l) => l({ terminal, execution, exitCode: exitCodes[line] ?? 0, shellIntegration: terminal.shellIntegration }));
            if (opts.closeAfterFirst === true) {
              terminal.exitStatus = { code: 0 };
            }
          });
          return execution;
        },
      };
    }
    return terminal;
  };
  // A modal answers with its first button (Run / Run the rest) unless the test dismisses it; a
  // notification answers what the test says the person clicked; a held dialog waits for the test.
  const answer = (sink: string[]) => (text: string, ...rest: unknown[]) => {
    sink.push(text);
    const buttons = rest.filter((r): r is string => typeof r === 'string');
    if (opts.holdDialogs?.test(text) === true) {
      return new Promise<string | undefined>((resolve) => held.push({ text, buttons, modal: isModal(rest[0]), answer: resolve }));
    }
    return Promise.resolve(reply(opts, buttons, isModal(rest[0])));
  };
  const live: Record<string, LiveTerminal> = {};
  for (const name of opts.preopened ?? []) {
    live[name] = makeTerminal({ name });
    listed = [...listed, live[name]];
  }
  const vscode = {
    ThemeColor: ThemeColorStub,
    env: { remoteName: undefined, shell: undefined },
    window: {
      get terminals(): LiveTerminal[] {
        reads.afterDispose += reads.disposals > 0 ? 1 : 0;
        return listed;
      },
      set terminals(list: LiveTerminal[]) {
        listed = list;
      },
      createTerminal: (o: { name: string; shellPath?: string; env?: Record<string, string>; color?: { id: string } }): LiveTerminal => {
        if (opts.failCreate?.test(o.name) === true) {
          throw new Error(`no terminal for ${o.name}`);
        }
        live[o.name] = makeTerminal(o);
        listed = [...listed, live[o.name]];
        return live[o.name];
      },
      showWarningMessage: answer(warnings),
      showInformationMessage: answer(infos),
      showErrorMessage: answer(warnings),
      onDidStartTerminalShellExecution: subscribe(started),
      onDidEndTerminalShellExecution: subscribe(ended),
      onDidCloseTerminal: subscribe(closed),
      onDidChangeTerminalShellIntegration: subscribe([]),
    },
  };
  const fire = (list: Listener[], terminal: LiveTerminal, rest: object): void =>
    [...list].forEach((l) => l({ terminal, shellIntegration: terminal.shellIntegration, ...rest }));
  const shell: ShellEvents = {
    start: (terminal, execution = {}) => {
      fire(started, terminal, { execution });
      return execution;
    },
    end: (terminal, execution, exitCode) => fire(ended, terminal, { execution, exitCode }),
  };
  const list = (terminal: LiveTerminal): LiveTerminal => {
    listed = [...listed, terminal];
    return terminal;
  };
  const exit = (terminal: LiveTerminal, code = 0): void => {
    terminal.exitStatus = { code };
    listed = listed.filter((t) => t !== terminal);
    [...closed].forEach((l) => l(terminal));
  };
  const open = (name: string, shellPath?: string): LiveTerminal => makeTerminal({ name, shellPath });
  return { vscode, terminals, warnings, infos, held, open, list, exit, listReadsAfterDispose: () => reads.afterDispose, live, shell, userActivity: 0, executions, listenerCounts: () => ({ ended: ended.length, closed: closed.length }) };
}

function reply(opts: WorldOptions, buttons: string[], modal: boolean): string | undefined {
  if (modal) {
    return modalAnswer(opts.modal, buttons);
  }
  return clickedOf(opts.notification ?? 'Continue', buttons);
}

function modalAnswer(modal: WorldOptions['modal'], buttons: string[]): string | undefined {
  if (modal === 'dismiss') {
    return undefined;
  }
  return modal === 'last' ? buttons[buttons.length - 1] : buttons[0];
}

function clickedOf(clicked: string, buttons: string[]): string | undefined {
  return buttons.includes(clicked) ? clicked : buttons[0];
}

function isModal(options: unknown): boolean {
  return typeof options === 'object' && options !== null && (options as { modal?: boolean }).modal === true;
}

/** The real timer, taken at load: a test that mocks `setTimeout` or `Date` must not stop `until` from timing out. */
const realSetTimeout = setTimeout;

/** Poll until `ready`, failing with `what` rather than hanging the suite: on the real clock and the real timer, whatever the test has mocked. */
export function until(ready: () => boolean, what: string, ms = 3000): Promise<void> {
  const deadline = performance.now() + ms;
  return new Promise((resolve, reject) => {
    const poll = (): void => {
      if (ready()) {
        resolve();
      } else if (performance.now() > deadline) {
        reject(new assert.AssertionError({ message: `timed out waiting for ${what}` }));
      } else {
        realSetTimeout(poll, 5);
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
    name: 'ops relay stage',
    isSshEnabled: false,
    isVpn: true,
    vpnType: 'openvpn',
    vpnLauncherEntityId: 'start',
    dependsOn: ['start'],
    runDependencies: true,
  };
  return { install, start, vpn };
}

/** The title of the terminal of the entry `name` inside `parent` (none: a root entry), built by the real functions. The one composition under `src/test`. */
export const titleIn = (parent: TreeNode | undefined, name: string): string => entryTerminalTitle(entryTerminalKey(name, parent));

/** The title of the terminal of a ROOT entry (no parent folder) named `name`. */
export const rootTitle = (name: string): string => titleIn(undefined, name);

export const STORED_CONFIG = 'client\nremote vpn.example 1194\n';

/** The folder of `placed` with this id, if any. */
function folderIn(placed: Record<string, TreeNode>, id: string): TreeNode | undefined {
  return Object.values(placed).find((folder) => folder.id === id);
}

/**
 * The storage of a chain world: `nodes` are the entries by id; `placed[entryId]` is the folder node that entry sits in
 * (none: the root). An id it does not know answers `undefined`.
 */
export function storageOf(
  nodes: Record<string, EntityMetadata>,
  config: () => Promise<string | undefined> = () => Promise.resolve(STORED_CONFIG),
  placed: Record<string, TreeNode> = {},
) {
  const getNode = (_account: string, id: string): TreeNode | undefined =>
    nodes[id] === undefined ? folderIn(placed, id) : { id, name: nodes[id].name, type: 'entity', details: nodes[id], parentId: placed[id]?.id };
  // The colour write (E1.S3): the entries and the folders they sit in, and a folder's new colour goes back into `placed`.
  const colouring = colouringStorage({
    all: () => [...Object.keys(nodes).map((id) => getNode('a1', id)), ...new Set(Object.values(placed))].filter((node): node is TreeNode => node !== undefined),
    replace: (node) => {
      Object.entries(placed).filter(([, folder]) => folder.id === node.id).forEach(([entryId]) => (placed[entryId] = node));
    },
  });
  return { getNode, getVpnConfig: config, getNodes: colouring.getNodes, updateNodeFields: colouring.updateNodeFields, written: colouring.written, failNextWrite: colouring.failNextWrite };
}

export function memoryTrust() {
  let trusted: string[] = [];
  const update = (_k: string, v: string[]): Promise<void> => {
    trusted = v;
    return Promise.resolve();
  };
  return { get: () => trusted, update };
}

/** Vouch for [entityId, line] pairs in `store`. A store that rejects its writes (a test's own doing) simply stays empty. */
export function seedTrusted(store: ReturnType<typeof memoryTrust>, pairs: readonly (readonly [string, string])[]): void {
  store.update('trusted', pairs.map(([id, line]) => commandFingerprint(id, line))).catch(() => undefined);
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
  lateAnswer?: (what: string) => void,
  standingPrompt?: (prompt: PromiseLike<unknown>) => void,
  sshRoad?: unknown,
  log?: DiagnosticWriter,
) => Promise<boolean>;

export interface StartOptions {
  action?: 'start' | 'stop';
  /** The agent request's signal — absent for the person's own click. */
  startGate?: AbortSignal;
  /** The person's road host (`SshRoad`), handed to `runVpn` as its second to last argument: absent is the agent's start (E2-D2). */
  sshRoad?: unknown;
  /** The diagnostic log, handed to `runVpn` as its last argument. */
  log?: DiagnosticWriter;
  storage?: ReturnType<typeof storageOf>;
  /** The trust store the start reads and writes; a fresh one when absent. */
  trust?: ReturnType<typeof memoryTrust>;
  mocks?: Record<string, unknown>;
  /**
   * Shell events the person's terminals had already produced, fired once the activity tracker is listening — as in
   * an extension that was active before the click (`registerRunCommands` subscribes it at activation).
   */
  shellEvents?: () => void;
}

/**
 * Start (or stop) the VPN entry `vpn` of `nodes`, in a fresh storage directory owned by `scope`.
 *
 * <p>The directory is made by `ownedDir` BEFORE anything can throw, and the scope removes it however the start ends: a start that
 * rejects, or a caller that never reaches its own cleanup, no longer leaves it behind (it used to be handed back only on the
 * paths that returned).</p>
 *
 * <p>`ended` is the request's end THROWN from inside the start — a chain that had typed a step when the
 * client left says so that way (E4.S4) — caught here and reported. ONLY that: any other failure is rethrown, so an
 * unexpected storage or terminal error still fails the test instead of hiding behind `started: false` (code round 2).</p>
 */
export async function startVpn(scope: Scope, w: World, nodes: Record<string, EntityMetadata>, o: StartOptions = {}): Promise<{ started: boolean; dir: string; ended?: Error }> {
  const dir = ownedDir(scope, 'chain');
  const { runVpn } = loadWithVscode<{ runVpn: RunVpn }>('../vpnRun', w.vscode, o.mocks);
  listenForShellEvents(o.shellEvents);
  const target = { kind: 'node', accountId: 'a1', node: { id: 'vpn', name: nodes.vpn.name, details: nodes.vpn } };
  const storage = o.storage ?? storageOf(nodes);
  try {
    return { started: await runVpn(target, actionOf(o), storage, dir, { noteUserActivity: () => void (w.userActivity += 1) }, trustOf(o), o.startGate, undefined, undefined, o.sshRoad, o.log), dir };
  } catch (error) {
    return { started: false, dir, ended: requestsEnd(error) };
  }
}

/**
 * The graph `loadWithVscode` just built holds the activity tracker bound to this stub; listening is what activation
 * does, so `earlier` — events the terminals had already produced — is delivered to it.
 */
function listenForShellEvents(earlier: (() => void) | undefined): void {
  (require('../terminalActivityTracker') as { trackTerminalActivity(): unknown }).trackTerminalActivity();
  earlier?.();
}

/**
 * The extension's own send, as `typed` in `terminalGuard.ts` notes it: what `running` and `finished` both need (`PLAN_terminal_folder_run.md` §2). The
 * tracker is the one `loadWithVscode` last built, reached as `listenForShellEvents` reaches it, so a world made after this
 * terminal's has replaced it.
 */
export function noteOurSend(terminal: LiveTerminal): void {
  (require('../terminalActivityTracker') as { noteSent(t: unknown): void }).noteSent(terminal);
}

/** The test's own trust store, or a fresh one. */
function trustOf(o: StartOptions): ReturnType<typeof memoryTrust> {
  return o.trust ?? memoryTrust();
}

function actionOf(o: StartOptions): 'start' | 'stop' {
  return o.action ?? 'start';
}

/** The thrown request's end — or the throw itself, for anything that is not one. */
function requestsEnd(error: unknown): Error {
  if (endedStage(error) === undefined) {
    throw error;
  }
  return error as Error;
}

/** Every file under `dir` — what a start left on disk. */
export function filesUnder(dir: string): string[] {
  return fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name) : [];
}
