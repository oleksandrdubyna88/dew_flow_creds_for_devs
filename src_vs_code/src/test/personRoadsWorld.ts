import * as fs from 'node:fs';
import { formatToken } from '../grantToken';
import { materializedKeysDir } from '../materializedKeys';
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
 * <p>The saved host key of the entry (G1): `hostKey` puts one on the entry, and `storageDir` is the window's storage folder. A pin
 * test gives a REAL folder and `realForget`, so `materializeKnownHosts` and `forgetMaterializedKey` are the real ones and the
 * pin files are real files; `pinFiles` lists them, and `knownHostsOf` reads the file that an argv names.</p>
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

/** A resolved credential that signs in with a password: no key file is written for it. */
export const passwordLogin = (): ExecAuth => ({ ok: true, env: {}, auth: 'askpass' });

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
  /** The saved host key of the entry (`hostKey`), as it is stored: a pin, or a text that is none. Left out: the entry has no `hostKey`. */
  hostKey?: string;
  /** The storage folder of the window. A pin test gives a real, owned folder. Default: `/storage`, which no test writes. */
  storageDir?: string;
  /** The spawner of the bridges. Default: every bridge is a `heldChild`, kept in `children`, and its argv in `bridgeArgvs`. */
  spawn?: BridgeSpawner;
  /** What a modal question and the quick pick answer. Default: dismissed. A promise holds the question open until the test settles it. */
  answer?: (message: string, rest: readonly unknown[]) => string | undefined | Promise<string | undefined>;
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
  /** The argv of every bridge that the default spawner started, in order. */
  bridgeArgvs: (readonly string[])[];
  /** Every path `forgetMaterializedKey` was given, in order. */
  forgotten: string[];
  /** Every `ssh` run: its argv, how many paths were forgotten when it started, and the known-hosts file its argv names, read at that moment. */
  runs: { argv: readonly string[]; forgottenBefore: number; knownHosts: NamedKnownHosts | undefined }[];
  /** Every modal question and quick pick: its text and how many paths were forgotten when it was shown. */
  asked: { message: string; forgottenBefore: number }[];
  /** `onEnded` of the manager: a bridge that ended by itself. */
  ended: string[];
  infos: string[];
  warnings: string[];
  errors: string[];
  logs: string[];
}

/** The known-hosts file that an argv names, and its text at the moment of the read (`undefined`: the file is not on the disk). */
export interface NamedKnownHosts {
  file: string;
  text: string | undefined;
}

const KNOWN_HOSTS_WORD = 'UserKnownHostsFile=';

/** What `-o UserKnownHostsFile=<path>` of an argv names, the path bare or in double quotes. `undefined`: the argv names no such file. */
export function knownHostsOf(argv: readonly string[]): NamedKnownHosts | undefined {
  const word = argv.find((one) => one.startsWith(KNOWN_HOSTS_WORD));
  if (word === undefined) {
    return undefined;
  }
  const file = word.slice(KNOWN_HOSTS_WORD.length).replace(/^"(.*)"$/, '$1');
  return { file, text: fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined };
}

/** The names of the known-hosts files in this window's key folder of `storageDir`, sorted. The folder is the one `materializedKeysDir` names. */
export function pinFiles(storageDir: string): string[] {
  const dir = materializedKeysDir(storageDir);
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => name.startsWith('known_hosts-')).sort() : [];
}

export const ROW = { accountId: 'a1', node: { id: 'e1', name: 'box' } };
export const KEY = 'a1:e1';

function emptyWorld(parts: Parts): World {
  const children: HeldChild[] = [];
  const bridgeArgvs: (readonly string[])[] = [];
  const ended: string[] = [];
  const held: BridgeSpawner = (_command, argv) => {
    const child = heldChild();
    children.push(child);
    bridgeArgvs.push(argv);
    return child;
  };
  const bridges = new SshBridgeManager(parts.spawn ?? held, (key) => void ended.push(key));
  return { handlers: new Map(), bridges, children, bridgeArgvs, forgotten: [], runs: [], asked: [], ended, infos: [], warnings: [], errors: [], logs: [] };
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
      w.runs.push({ argv, forgottenBefore: w.forgotten.length, knownHosts: knownHostsOf(argv) });
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

/** The snapshot of the entry that the storage answers: with `hostKey` only when the test gave one. */
function detailsOf(parts: Parts): Record<string, unknown> {
  const pin = parts.hostKey === undefined ? {} : { hostKey: parts.hostKey };
  return { id: ROW.node.id, name: ROW.node.name, isSshEnabled: true, host: parts.host ?? 'box.example', user: 'dev', ...pin };
}

/** Register the real agent commands over the stand-ins, and hand back what they registered and what they did. */
export function world(parts: Parts = {}): World {
  const w = emptyWorld(parts);
  const details = detailsOf(parts);
  const mod = loadWithVscode<{ registerAgentCommands(host: Record<string, unknown>): void }>('../commands/agentCommands', vscodeStub(w, parts), mocksOf(w, parts));
  const say = (_area: string, text: string): void => void w.logs.push(text);
  // The host is an untyped record on purpose, as in forgetAgentConsents.test.ts: only the fields these three roads read are
  // supplied, and typing it would mean stubbing the whole extension (its provider, its stores, its servers) for nothing.
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
    storageDir: parts.storageDir ?? '/storage',
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
