import { formatToken } from '../grantToken';
import { BridgeProcess, BridgeSpawner, SshBridgeManager } from '../sshBridgeManager';
import type { ExecAuth } from '../sshExecAuth';
import type { SshExecOutcome } from '../sshExecRunner';
import { loadWithVscode } from './vscodeStub';

/**
 * The world of the three roads of the person that write a key file through `resolveExecAuth` (N16): the bridge socket check,
 * *Install creds on host* and *Open Remote Bridge…*. The REAL `registerAgentCommands` is loaded under a stubbed `vscode`; a test
 * calls the handlers the extension registered. The bridges are the REAL `SshBridgeManager` over a spawner the test chooses.
 *
 * <p>Stand-ins, by the request string that `commands/agentCommands.ts` (or the module it imports) writes: `../sshExecAuth` (what a
 * resolve answers), `../sshExecRunner` (no real `ssh`), `./keyInstaller` (the recorder of `forgetMaterializedKey`; left out with
 * `realForget`), and with `noExecArgv` `../sshExecCommand`.</p>
 *
 * <p>Not named `*.test.ts`, so the runner never treats it as a suite.</p>
 */

export type Handler = (...args: unknown[]) => unknown;

/** A bridge's `ssh` whose end the TEST decides: `kill()` only counts, `exited` settles when `end` is called and never by itself. */
export interface HeldChild extends BridgeProcess {
  killed: number;
  end(code: number | null): void;
}

export function heldChild(): HeldChild {
  let settle: (code: number | null) => void = () => {};
  const exited = new Promise<number | null>((resolve) => {
    settle = resolve;
  });
  return {
    killed: 0,
    exited,
    kill(): void {
      this.killed += 1;
    },
    end: (code) => settle(code),
  };
}

/** A resolved credential whose key was WRITTEN for the call: `materialized` is the path. */
export const writtenKey = (keyPath: string): ExecAuth => ({ ok: true, keyPath, env: {}, auth: 'key', materialized: keyPath });

/** A resolved credential whose key is the person's own file: nothing was written, so nothing may be deleted. */
export const ownKeyFile = (keyPath: string): ExecAuth => ({ ok: true, keyPath, env: {}, auth: 'key' });

export const NO_CREDENTIAL: ExecAuth = { ok: false, reason: 'no_credential', message: 'nothing stored' };

/** What one `ssh` run answers. */
export const ran = (stdout: string, exitCode = 0, stderr = ''): SshExecOutcome => ({
  exitCode,
  stdout,
  stderr,
  stdoutTruncated: false,
  stderrTruncated: false,
  timedOut: false,
  durationMs: 1,
});

export const TIMED_OUT: SshExecOutcome = { ...ran('', 0), exitCode: null, timedOut: true };

export interface Parts {
  /** What a resolve WITH an opener answers (a click: the bridge, the install), one per call, in order. */
  clicks?: readonly ExecAuth[];
  /** What a resolve with NO opener answers (the socket check), one per call, in order. None left: no credential. */
  checks?: readonly ExecAuth[];
  /** A click's resolve waits for this before it answers. */
  resolveGate?: Promise<void>;
  /** The n-th `ssh` run (0-based) of the window. It may throw. */
  run?: (index: number, argv: readonly string[]) => SshExecOutcome;
  host?: string;
  /** The spawner of the bridges. Default: every bridge is a `heldChild`, kept in `children`. */
  spawn?: BridgeSpawner;
  /** What a modal question and the quick pick answer. Default: dismissed. */
  answer?: (message: string, rest: readonly unknown[]) => string | undefined;
  /** The real `forgetMaterializedKey` deletes; `forgotten` stays empty. */
  realForget?: boolean;
  /** `buildSshExecArgv` answers no argv. */
  noExecArgv?: boolean;
  /** More stand-ins, by request string. */
  mocks?: Record<string, unknown>;
}

export interface World {
  handlers: Map<string, Handler>;
  bridges: SshBridgeManager;
  children: HeldChild[];
  /** Every path `forgetMaterializedKey` was given, in order. */
  forgotten: string[];
  /** Every `ssh` run: its argv and how many paths were forgotten when it started. */
  runs: { argv: readonly string[]; forgottenBefore: number }[];
  /** Every modal question and quick pick: its text and how many paths were forgotten when it was shown. */
  asked: { message: string; forgottenBefore: number }[];
  /** `onEnded` of the manager: a bridge that ended by itself. */
  ended: string[];
  infos: string[];
  warnings: string[];
  errors: string[];
  logs: string[];
}

export const ROW = { accountId: 'a1', node: { id: 'e1', name: 'box' } };
export const KEY = 'a1:e1';

function emptyWorld(parts: Parts): World {
  const w: World = { handlers: new Map(), bridges: undefined as never, children: [], forgotten: [], runs: [], asked: [], ended: [], infos: [], warnings: [], errors: [], logs: [] };
  const held: BridgeSpawner = () => {
    const child = heldChild();
    w.children.push(child);
    return child;
  };
  w.bridges = new SshBridgeManager(parts.spawn ?? held, (key) => void w.ended.push(key));
  return w;
}

/** A dialog that records its text and answers what the test says; one without buttons answers nothing. */
function dialog(w: World, parts: Parts, into: string[]): (message: string, ...rest: unknown[]) => Promise<string | undefined> {
  return (message, ...rest) => {
    into.push(message);
    const asks = rest.some((one) => typeof one === 'string');
    if (asks) {
      w.asked.push({ message, forgottenBefore: w.forgotten.length });
    }
    return asks ? Promise.resolve().then(() => parts.answer?.(message, rest)) : Promise.resolve(undefined);
  };
}

function vscodeStub(w: World, parts: Parts): Record<string, unknown> {
  return {
    window: {
      showInformationMessage: dialog(w, parts, w.infos),
      showWarningMessage: dialog(w, parts, w.warnings),
      showErrorMessage: dialog(w, parts, w.errors),
      showQuickPick: (items: readonly string[], options: { title: string }): Promise<string | undefined> => dialog(w, parts, w.infos)(options.title, ...items),
      withProgress: (_options: unknown, task: () => Promise<unknown>): Promise<unknown> => task(),
    },
    ProgressLocation: { Notification: 15 },
    env: { clipboard: { writeText: (): Promise<void> => Promise.resolve() } },
  };
}

/** The stand-in of `../sshExecAuth`: a resolve with an opener is a click, one with none is the socket check. */
function resolverOf(parts: Parts): Record<string, unknown> {
  const clicks = [...(parts.clicks ?? [])];
  const checks = [...(parts.checks ?? [])];
  return {
    resolveExecAuth: async (_s: unknown, _a: unknown, _e: unknown, _d: unknown, open?: unknown): Promise<ExecAuth> => {
      if (open === undefined) {
        return checks.shift() ?? NO_CREDENTIAL;
      }
      await parts.resolveGate;
      return clicks.shift() ?? NO_CREDENTIAL;
    },
  };
}

/** The stand-in of `../sshExecRunner`: no `ssh` starts; each run is recorded and answered on a promise callback. */
function runnerOf(w: World, parts: Parts): Record<string, unknown> {
  const answer = parts.run ?? ((): SshExecOutcome => ran('600'));
  return {
    runSshExec: (argv: readonly string[]): Promise<SshExecOutcome> => {
      w.runs.push({ argv, forgottenBefore: w.forgotten.length });
      const index = w.runs.length - 1;
      return Promise.resolve().then(() => answer(index, argv));
    },
  };
}

function mocksOf(w: World, parts: Parts): Record<string, unknown> {
  const recorder = { './keyInstaller': { forgetMaterializedKey: (keyPath: string): void => void w.forgotten.push(keyPath) } };
  const noArgv = { '../sshExecCommand': { buildSshExecArgv: (): undefined => undefined } };
  return {
    '../sshExecAuth': resolverOf(parts),
    '../sshExecRunner': runnerOf(w, parts),
    ...(parts.realForget === true ? {} : recorder),
    ...(parts.noExecArgv === true ? noArgv : {}),
    ...parts.mocks,
  };
}

/** Register the real agent commands over the stand-ins, and hand back what they registered and what they did. */
export function world(parts: Parts = {}): World {
  const w = emptyWorld(parts);
  const details = { id: ROW.node.id, name: ROW.node.name, isSshEnabled: true, host: parts.host ?? 'box.example', user: 'dev' };
  const mod = loadWithVscode<{ registerAgentCommands(host: Record<string, unknown>): void }>('../commands/agentCommands', vscodeStub(w, parts), mocksOf(w, parts));
  const say = (_area: string, text: string): void => void w.logs.push(text);
  mod.registerAgentCommands({
    MACHINES: [],
    agentServer: { setFolderHooks: (): void => undefined, share: (): Promise<string> => Promise.resolve(formatToken(4242, 'c2VjcmV0')), signal: undefined },
    aliasMap: () => ({}),
    bridges: w.bridges,
    log: { info: say, warn: say },
    mutated: (): void => undefined,
    offerInstall: (): Promise<void> => Promise.resolve(),
    provider: { refresh: (): void => undefined },
    register: (command: string, handler: Handler): void => void w.handlers.set(command, handler),
    setAliasMap: (): Thenable<void> => Promise.resolve(),
    sshAgent: {},
    state: {},
    storage: { getAccounts: () => [], getNodes: () => [], getNode: () => ({ id: ROW.node.id, name: ROW.node.name, details }) },
    storageDir: '/storage',
    vaultKeys: {},
  });
  return w;
}

/** Run one registered command on the row, as a click does. */
export function click(w: World, command: 'openRemoteBridge' | 'closeRemoteBridge' | 'installRemoteCli'): Promise<unknown> {
  const handler = w.handlers.get(`credSshManager.${command}`);
  if (handler === undefined) {
    throw new Error(`credSshManager.${command} is not registered; registered: ${[...w.handlers.keys()].join(', ')}`);
  }
  return Promise.resolve(handler(ROW));
}

/** Let every promise callback that is ready run: the stand-ins settle on promise callbacks, never on a timer. */
export async function settled(): Promise<void> {
  for (let turn = 0; turn < 5; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}
