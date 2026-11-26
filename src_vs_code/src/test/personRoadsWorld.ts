import * as fs from 'node:fs';
import { formatToken } from '../grantToken';
import { materializedKeysDir } from '../materializedKeys';
import { BridgeProcess, BridgeSpawner, SshBridgeManager } from '../sshBridgeManager';
import type { PinClient, PinClientCall } from '../pinClient';
import type { ExecAuth } from '../sshExecAuth';
import type { SshExecOutcome } from '../sshExecRunner';
import { loadWithVscode } from './vscodeStub';

/**
 * The world of the three roads of the person that write a key file through `resolveExecAuth` (N16): the bridge socket check,
 * *Install creds on host* and *Open Remote Bridge…*. The REAL `registerAgentCommands` is loaded under a stubbed `vscode`; a test
 * calls the handlers the extension registered. The bridges are the REAL `SshBridgeManager` over a spawner the test chooses.
 *
 * <p>Stand-ins, by the request string that `commands/agentCommands.ts` (or the module it imports) writes: `../sshExecAuth` (what a
 * resolve answers; left out with `realResolve`), `../sshExecRunner` (no real `ssh`), `./keyInstaller` (the recorder of `forgetMaterializedKey`; left out with
 * `realForget`), `./pinClient` (the asker of the client of a pinned call; left out with `realClient`), and with `noExecArgv`
 * `../sshExecCommand`.</p>
 *
 * <p>The question about the client (G1, E2: `ssh -V`, the plan's §3.10) is a kind of its own: it is recorded in `clientAsks` and never in
 * `runs`, so every count of `runs` is a count of connections. `client` says what the client answers; the default is one that knows
 * `KnownHostsCommand`. The question goes through `./pinClient`, not through `../sshExecRunner`, so the stand-in runner never sees it.</p>
 *
 * <p>The saved host key of the entry (G1): `hostKey` puts one on the entry, and `storageDir` is the window's storage folder. A pin
 * test gives a REAL folder and `realForget`, so `materializeKnownHosts` and `forgetMaterializedKey` are the real ones and the
 * pin files are real files; `pinFiles` lists them, and `knownHostsOf` reads the file that an argv names.</p>
 *
 * <p>The entry's `user` and `port` (E1.S4): the smoke of section 10 of `scripts/ssh-agent-itest.cjs` loads this world with a real runner
 * and a real spawner, and names the user that runs it and the port of its own `sshd`. Every suite leaves them out.</p>
 *
 * <p>The REAL resolve (G1, E3.S4: `realResolve`): the rows of E3 keep `vscode` as their only stand-in, and the stand-in of `../sshExecAuth`
 * replaces that whole module, so a fault of the real `resolveExecAuth` (a stored key written with no `materialized`, so never deleted) stays
 * green under it. With `realResolve` the registered commands call the product's resolve, which reads a disposable `vault` that the host's
 * `storage` answers: a stored key, a key named by its path (the entry's `sshKeyPath`) or a password, all plain text, so no PIN is asked.
 * The real resolve hands `ssh` the PROCESS's environment, so a row runs the world in a process whose environment is its own.</p>
 *
 * <p>`said` is every message, quick pick and log line in the order it was shown (the four arrays lose the order across kinds), each with its time
 * (`at`, `performance.now()` of this process: the clock of the observers of a leg process, G1 E3.S5), and `replaceHostKey` and `replaceHost` make the
 * storage answer a NEW snapshot of the entry from the next read on (a leg that changes the pin, or the host, in the same window).</p>
 *
 * <p>Connect's repair (G1, E3.S5, M9): `connectOptions` is the product's own `connectionOptions`, taken from the graph this world loaded (so it is bound to
 * this world's `vscode` and mocks), called with the current snapshot; it never connects. `updateDetailsFields` of the host's storage records what Connect
 * saved in `updates` and makes the storage answer it from the next read on. `shares` is every token the *Open Remote Bridge…* command minted, with the time
 * and how many things had been said then.</p>
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
  /** The login of the entry (`user`). Default: `dev`. */
  user?: string;
  /** The port of the entry (`port`). Left out: the entry has no `port`, as before. */
  port?: number;
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
  /** What the `ssh` program answers about its version: one answer for every question, or the answer of the n-th question (0-based) of the window. Default: {@link KNOWS}. */
  client?: PinClient | ((index: number) => PinClient);
  /** The real `./pinClient` asks (a real `ssh -V` through the real runner); `clientAsks` stays empty. */
  realClient?: boolean;
  /** The product's own `resolveExecAuth` answers instead of the stand-in: `clicks`, `checks` and `resolveGate` are not read. Needs a `vault` and a real `storageDir`. */
  realResolve?: boolean;
  /** What the host's `storage` holds of the entry, for the real resolve: a stored key, a key file named by its path, a password. Plain text. Left out: the host has none of these. */
  vault?: Vault;
  /** More stand-ins, by request string. */
  mocks?: Record<string, unknown>;
}

/** The disposable vault of the host (E3.S4): the three credentials the real resolve tells apart. At most one is given. */
export interface Vault {
  privateKey?: string;
  keyPath?: string;
  password?: string;
}

/** One thing a person was shown, in the order it was shown. */
export interface Said {
  kind: 'info' | 'warning' | 'error' | 'pick' | 'log';
  text: string;
  /** `performance.now()` of this process when it was shown. */
  at: number;
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
  /** Every question about the client of a pinned call, in order: what it was asked of, and how many pin files were on the disk and how many runs had started then. */
  clientAsks: { call: PinClientCall; pinFilesBefore: number; runsBefore: number }[];
  /** Every modal question and quick pick: its text and how many paths were forgotten when it was shown. */
  asked: { message: string; forgottenBefore: number }[];
  /** `onEnded` of the manager: a bridge that ended by itself. */
  ended: string[];
  infos: string[];
  warnings: string[];
  errors: string[];
  logs: string[];
  /** Every message, quick pick and log line, in the order they were shown. */
  said: Said[];
  /** From the next read on the storage answers a NEW snapshot of the entry with this `hostKey` (the field is left out for `undefined`); the old snapshot is not changed. */
  replaceHostKey(hostKey: string | undefined): void;
  /**
   * From the next read on the storage answers a NEW snapshot of the entry with this `host`; the old snapshot is not changed. M4 (c): a saved key on a host that cannot form a
   * known-hosts line, in the window that a warming call used.
   */
  replaceHost(host: string): void;
  /** The snapshot of the entry that the storage answers now. */
  snapshot(): Record<string, unknown>;
  /** Every token the host's `agentServer.share` minted, in order: when, and how many things had been said before it answered. */
  shares: { at: number; saidBefore: number }[];
  /** Every `updateDetailsFields` of the host's storage: the entry as it was saved. */
  updates: Record<string, unknown>[];
  /** Connect's options of the entry (the product's `connectionOptions`, no start gate), with the current snapshot. Connect's repair of M9; it never connects. */
  connectOptions(): Promise<unknown>;
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
  return {
    handlers: new Map(), bridges, children, bridgeArgvs, forgotten: [], runs: [], clientAsks: [], asked: [], ended, infos: [], warnings: [], errors: [], logs: [], said: [], shares: [], updates: [],
    replaceHostKey: () => undefined, replaceHost: () => undefined, snapshot: () => ({}), connectOptions: () => Promise.resolve(undefined),
  };
}

/** A dialog that records its text and answers what the test says; one without buttons answers nothing. */
function dialog(w: World, parts: Parts, into: string[], kind: Said['kind']): (message: string, ...rest: unknown[]) => Promise<string | undefined> {
  return (message, ...rest) => {
    into.push(message);
    w.said.push({ kind, text: message, at: performance.now() });
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
      showInformationMessage: dialog(w, parts, w.infos, 'info'),
      showWarningMessage: dialog(w, parts, w.warnings, 'warning'),
      showErrorMessage: dialog(w, parts, w.errors, 'error'),
      showQuickPick: (items: readonly string[], options: { title: string }): Promise<string | undefined> => dialog(w, parts, w.infos, 'pick')(options.title, ...items),
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

/** The answer of a client that knows `KnownHostsCommand` (OpenSSH 8.5 or newer). */
export const KNOWS: PinClient = { kind: 'knows', token: 'OpenSSH_10.2' };
/** The answer of a client below 8.5: a success of its own. */
export const OLDER: PinClient = { kind: 'older', token: 'OpenSSH_8.4' };
/** The answer of a client whose version could not be read. */
export const unreadable = (exitCode: number | null): PinClient => ({ kind: 'unreadable', exitCode });

/** The stand-in of `./pinClient`: no `ssh -V` starts; each question is recorded, apart from the runs, and answered on a promise callback. */
function clientOf(w: World, parts: Parts): Record<string, unknown> {
  return {
    windowPinClient: (call: PinClientCall): Promise<PinClient> => {
      w.clientAsks.push({ call, pinFilesBefore: pinFiles(parts.storageDir ?? '/storage').length, runsBefore: w.runs.length });
      const index = w.clientAsks.length - 1;
      return Promise.resolve().then(() => (typeof parts.client === 'function' ? parts.client(index) : (parts.client ?? KNOWS)));
    },
  };
}

/** The stand-ins a flag turns OFF: `mocks` unless the part's flag is `true`. */
const unless = (flag: boolean | undefined, mocks: Record<string, unknown>): Record<string, unknown> => (flag === true ? {} : mocks);

function mocksOf(w: World, parts: Parts): Record<string, unknown> {
  const recorder = { './keyInstaller': { forgetMaterializedKey: (keyPath: string): void => void w.forgotten.push(keyPath) } };
  const noArgv = { '../sshExecCommand': { buildSshExecArgv: (): undefined => undefined } };
  return {
    ...unless(parts.realResolve, { '../sshExecAuth': resolverOf(parts) }),
    '../sshExecRunner': runnerOf(w, parts),
    ...unless(parts.realForget, recorder),
    ...unless(parts.realClient, { './pinClient': clientOf(w, parts) }),
    ...(parts.noExecArgv === true ? noArgv : {}),
    ...parts.mocks,
  };
}

/** The fields of the entry that a test chose and that have no default: a field left out is not in the snapshot. */
function chosenFields(parts: Parts): Record<string, unknown> {
  const fields: Record<string, unknown> = { hostKey: parts.hostKey, port: parts.port, sshKeyPath: parts.vault?.keyPath };
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
}

/** The snapshot of the entry that the storage answers. */
function detailsOf(parts: Parts): Record<string, unknown> {
  return { id: ROW.node.id, name: ROW.node.name, isSshEnabled: true, host: parts.host ?? 'box.example', user: parts.user ?? 'dev', ...chosenFields(parts) };
}

/** What the host's storage adds for the real resolve: the three values of the vault, and no rotation that waits (so no door is needed and no PIN is asked). Nothing without a vault. */
function vaultOf(vault: Vault | undefined): Record<string, unknown> {
  return vault === undefined
    ? {}
    : {
        getPrivateKey: (): Promise<string | undefined> => Promise.resolve(vault.privateKey),
        getPassword: (): Promise<string | undefined> => Promise.resolve(vault.password),
        heldRotations: { listed: (): Promise<unknown[]> => Promise.resolve([]) },
      };
}

/** The entry as the storage answers it, a copy that holds `patch` (a field whose value is `undefined` is left out). */
function patched(details: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries({ ...details, ...patch }).filter(([, value]) => value !== undefined));
}

type ConnectionOptionsOf = (accountId: string, entity: Record<string, unknown>, storage: unknown, storageDir: string, startGate: undefined) => Promise<unknown>;

/** Connect's options from the graph the world just loaded: the same `vscode` stand-in and mocks. A graph that does not hold the module makes the call fail, saying so. */
function connectionOptionsOfGraph(): ConnectionOptionsOf {
  const loaded = require.cache[require.resolve('../connectionOptions')]?.exports as { connectionOptions?: ConnectionOptionsOf } | undefined;
  return loaded?.connectionOptions ?? (() => Promise.reject(new Error('connectionOptions.js is not in the graph that this world loaded')));
}

/** The host's storage of the world: the entry's snapshot as `entry.details` (replaced, never changed), what Connect saved in `updates`, and the vault. */
function storageOf(w: World, parts: Parts, entry: { details: Record<string, unknown> }): Record<string, unknown> {
  return {
    getAccounts: () => [],
    getNodes: () => [],
    getNode: () => ({ id: ROW.node.id, name: ROW.node.name, details: entry.details }),
    updateDetailsFields: (_accountId: string, _nodeId: string, updated: Record<string, unknown>): Promise<void> => {
      w.updates.push(updated);
      entry.details = { ...updated };
      return Promise.resolve();
    },
    ...vaultOf(parts.vault),
  };
}

/** The host's `agentServer`: the token it mints is recorded in `shares`. */
function agentServerOf(w: World): Record<string, unknown> {
  return {
    setFolderHooks: (): void => undefined,
    share: (): Promise<string> => {
      w.shares.push({ at: performance.now(), saidBefore: w.said.length });
      return Promise.resolve(formatToken(4242, 'c2VjcmV0'));
    },
    signal: undefined,
  };
}

/** Register the real agent commands over the stand-ins, and hand back what they registered and what they did. */
export function world(parts: Parts = {}): World {
  const w = emptyWorld(parts);
  const entry = { details: detailsOf(parts) };
  w.replaceHostKey = (hostKey) => {
    entry.details = patched(entry.details, { hostKey });
  };
  w.replaceHost = (host) => {
    entry.details = patched(entry.details, { host });
  };
  w.snapshot = () => entry.details;
  const mod = loadWithVscode<{ registerAgentCommands(host: Record<string, unknown>): void }>('../commands/agentCommands', vscodeStub(w, parts), mocksOf(w, parts));
  const connectionOptionsOf = connectionOptionsOfGraph();
  const say = (_area: string, text: string): void => void (w.logs.push(text), w.said.push({ kind: 'log', text, at: performance.now() }));
  const storage = storageOf(w, parts, entry);
  w.connectOptions = () => connectionOptionsOf(ROW.accountId, entry.details, storage, parts.storageDir ?? '/storage', undefined);
  // The host is an untyped record on purpose, as in forgetAgentConsents.test.ts: only the fields these three roads read are
  // supplied, and typing it would mean stubbing the whole extension (its provider, its stores, its servers) for nothing.
  mod.registerAgentCommands({
    MACHINES: [],
    agentServer: agentServerOf(w),
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
    storage,
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

/** What the exec world needs of the product's `sshUseActions`: the deps that production assembles and the action's own `run`. */
interface SshUseActions {
  sshDepsFor(parts: Record<string, unknown>): unknown;
  sshExecAction(deps: unknown): { run(ctx: Record<string, unknown>, body: Record<string, unknown>): Promise<{ status: number; body: unknown }> };
}

/** The agent's exec over the host of {@link world} (G1, E3.S7, M14): the same entry, saved key and vault, and no registered command. */
export interface ExecWorld {
  /** The agent's `ssh:exec` through its own `run`, off a bridge (no `bridge` in the context): the status and the body that the broker would send. */
  run(command: string): Promise<{ status: number; body: unknown }>;
  /** Every line the agent's journal took (`deps.note`), and every line of the diagnostic log. */
  notes: string[];
  /** Every message, quick pick and log line, in the order it was shown. */
  said: Said[];
  /** From the next read on the storage answers a NEW snapshot of the entry with this `hostKey`. */
  replaceHostKey(hostKey: string | undefined): void;
}

/**
 * The agent's exec (G1, E3.S7, M14): the REAL `sshUseActions` is loaded under the stubbed `vscode`, its deps are assembled by the product's own
 * `sshDepsFor` (as production does: the asker is the real `windowPinClient`, the resolve the real `resolveExecAuth`), over the SAME host as {@link world}
 * (`detailsOf`, `storageOf`: the entry, its saved key and its vault). Only `mocks` (by request string, `./sshExecRunner` for a leg that times the question)
 * stand in. `sshAgent` has no socket and `relays` is absent: it is read only on the terminal's road.
 */
export function execWorld(parts: Parts = {}): ExecWorld {
  const w = emptyWorld(parts);
  const entry = { details: detailsOf(parts) };
  w.replaceHostKey = (hostKey) => {
    entry.details = patched(entry.details, { hostKey });
  };
  const notes: string[] = [];
  const say = (text: string): void => void (notes.push(text), w.said.push({ kind: 'log', text, at: performance.now() }));
  const mod = loadWithVscode<SshUseActions>('../sshUseActions', vscodeStub(w, parts), parts.mocks ?? {});
  const signal = new AbortController().signal;
  const deps = mod.sshDepsFor({
    storage: storageOf(w, parts, entry),
    storageDir: parts.storageDir ?? '/storage',
    agentServer: { signal, acquireExecSlot: (): (() => void) => () => undefined, note: say },
    sshAgent: { socketPath: undefined, servesKeyForEntity: (): boolean => false },
    log: { info: (_source: string, text: string): void => say(text), warn: (_source: string, text: string): void => say(text), error: (_source: string, text: string): void => say(text) },
    onMutated: (): void => undefined,
  });
  const action = mod.sshExecAction(deps);
  return {
    run: (command) => action.run({ accountId: ROW.accountId, entityId: ROW.node.id, entityName: ROW.node.name, signal }, { command }),
    notes,
    said: w.said,
    replaceHostKey: (hostKey) => w.replaceHostKey(hostKey),
  };
}

/** Let every promise callback that is ready run: the stand-ins settle on promise callbacks, never on a timer. */
export async function settled(): Promise<void> {
  for (let turn = 0; turn < 5; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}
