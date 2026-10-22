import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { EntityMetadata, TreeNode } from '../types';
import { StubCancellationToken, StubCancellationTokenSource, StubEventEmitter, loadEachWithVscode } from './vscodeStub';

/**
 * The SSH agent manager's test world: the real `SshAgentManager` over a stub socket server and a `vscode`
 * whose every sink is a spy, shared by the suites that exercise the gate (`sshAgentManager.test.ts` and
 * `sshAgentManagerLog.test.ts`; `sshAgentManagerWindows.test.ts` joined them with E1.3).
 *
 * <p>It also holds the key-material guard: a suite registers its logs (`watchLogs`) and the keys it feeds in
 * (`watchSecret`), and ends with `assertNoKeyMaterialLogged()`.</p>
 *
 * <p>The socket server is substituted, which is what makes the `confirm` callback reachable through its
 * real wiring rather than by reaching into a private method: the manager hands the server that callback,
 * so holding the server means holding the gate.</p>
 *
 * <p>`also` loads further modules into the SAME module graph as the manager (E2.1: a real `VaultKeys` and the
 * SSH wiring that connects it to the manager) — `loadEachWithVscode` evicts the whole graph on every call, so
 * two separate loads would leave each module holding its own copy of the others.</p>
 *
 * <p>Not named `*.test.ts`, so the runner never treats it as a suite.</p>
 */

export type Manager = typeof import('../sshAgentManager');

export interface FakeServer {
  socketPath: string;
  listening: boolean;
  /**
   * `data`, `signal` and `flags` default inside the world (an empty buffer, a never-aborted signal, flags `0` — the
   * flag-less request that RSA signs with SHA-1): no call site changes.
   */
  confirm(
    key: { entityId: string; name: string; fingerprint: string },
    purpose: unknown,
    data?: Buffer,
    signal?: AbortSignal,
    flags?: number,
  ): Promise<boolean>;
  keys(): unknown[];
  dispose(): void;
}

export interface World {
  mod: Manager;
  /** The modules `also` asked for, in order, loaded beside the manager under the same `vscode`. */
  modules: unknown[];
  server(): FakeServer | undefined;
  /** Modal answers, consumed in order; undefined means dismissed, a pending promise means unanswered. */
  answers: (string | undefined | Promise<string>)[];
  dialogs: string[];
  /** The information messages shown, in order — what a person is TOLD (E2.3). */
  infos: string[];
  /** The buttons each dialog offered, in order — what the prompt really lets a person answer. */
  buttons: string[][];
  env: Record<string, string>;
  envDescription: string;
  presence: number;
  logs: string[];
  disposals: number;
  /** How many output channels the manager created — the agent log is made on first use, never at startup. */
  channels: number;
  /** The lists *Allow longer…* opened, in order: the real items and the options (title, placeholder) they were shown with. */
  picks: { items: PickItem[]; options: { title?: string; placeHolder?: string; ignoreFocusOut?: boolean } }[];
  /**
   * What the lists answer, consumed in order, BY LABEL against the real items (a label the list never offered throws:
   * a test cannot pick what the person was not shown). `undefined` is Escape; a promise stays open until the test
   * settles it (`unansweredPick`); `rejectedPick()` makes the list reject, as a closing window does.
   */
  pickAnswers: PickAnswer[];
  /** Every `CancellationTokenSource` the manager made, so a test can see that it was disposed. */
  sources: StubCancellationTokenSource[];
  /** The settings a `workspace.getConfiguration().get` reads, by bare key; unset reads the caller's fallback. */
  settings: Record<string, unknown>;
  /** Change a setting and tell every `onDidChangeConfiguration` listener, as VS Code does. */
  changeSetting(key: string, value: unknown): void;
}

/** One entry of a list as the manager hands it to `showQuickPick`. */
export interface PickItem {
  label: string;
  description?: string;
  ms: number;
}

/** What a list answers: a label, Escape, a list that stays open, or a rejection. */
export type PickAnswer = string | undefined | Promise<string | undefined> | { rejects: Error };

/**
 * A list nobody answers yet, and ways to answer it late: pick a label or press Escape. A `stubborn` list does NOT
 * close when its token is cancelled — it answers only when the test says, which is how a pick that reaches the
 * manager AFTER its turn ended is built (the races of #197 E3.3, L20).
 */
export function unansweredPick(options: { stubborn?: boolean } = {}): {
  answer: Promise<string | undefined>;
  pickLate: (label: string) => void;
  escapeLate: () => void;
} {
  let settle: (label: string | undefined) => void = () => undefined;
  const answer = Object.assign(
    new Promise<string | undefined>((resolve) => {
      settle = resolve;
    }),
    { stubborn: options.stubborn === true },
  );
  return { answer, pickLate: (label) => settle(label), escapeLate: () => settle(undefined) };
}

/** A list that rejects, the way `showQuickPick` does when the window closes under it. */
export function rejectedPick(message = 'the window is closing'): { rejects: Error } {
  return { rejects: new Error(message) };
}

/** The item a label names; a label the list never offered is a bug in the TEST, and says so. */
function itemLabelled(items: PickItem[], label: string): PickItem {
  const item = items.find((one) => one.label === label);
  if (item === undefined) {
    throw new Error(`the test picked "${label}" but the list offered ${items.map((one) => `"${one.label}"`).join(', ')}`);
  }
  return item;
}

/** A list's answer: the item for the label, `undefined` when the token is cancelled first or the answer is Escape. */
function answerPick(items: PickItem[], answer: PickAnswer, token: StubCancellationToken): Promise<PickItem | undefined> {
  const rejects = Reflect.get(Object(answer), 'rejects');
  if (rejects instanceof Error) {
    return Promise.reject(rejects);
  }
  const stubborn = Reflect.get(Object(answer), 'stubborn') === true;
  const picked = Promise.resolve(answer as string | undefined | Promise<string | undefined>).then((label) => (label === undefined ? undefined : itemLabelled(items, label)));
  return Promise.race([picked, closedBy(token, stubborn)]);
}

/** Resolves `undefined` when the token is cancelled (or already was) — never for a stubborn list. */
function closedBy(token: StubCancellationToken, stubborn: boolean): Promise<undefined> {
  return new Promise<undefined>((resolve) => {
    if (stubborn) {
      return;
    }
    if (token.isCancellationRequested) {
      resolve(undefined);
    } else {
      token.onCancellationRequested(() => resolve(undefined));
    }
  });
}

type ConfigListener = (event: { affectsConfiguration(section: string): boolean }) => void;

/**
 * The `workspace` a real `VaultKeys` and the auto-lock reader see: `settings` is what `get` reads (unset: the caller's
 * fallback) and `onDidChangeConfiguration` registers a listener (the world's `changeSetting` is VS Code telling them).
 */
function workspaceStub(w: { settings: Record<string, unknown> }, listeners: Set<ConfigListener>): Record<string, unknown> {
  return {
    getConfiguration: () => ({ get: <T>(key: string, fallback: T): T => (key in w.settings ? (w.settings[key] as T) : fallback) }),
    onDidChangeConfiguration: (listener: ConfigListener) => {
      listeners.add(listener);
      return { dispose: (): void => void listeners.delete(listener) };
    },
  };
}

/** An output channel that refuses a write after it was disposed — a late log line must not reach a channel that is gone. */
function outputChannelStub(w: World): unknown {
  let closed = false;
  w.channels += 1;
  return {
    appendLine: (line: string): void => {
      if (closed) {
        throw new Error('the output channel was disposed');
      }
      w.logs.push(line);
    },
    dispose: (): void => {
      closed = true;
    },
  };
}

export type KeyType = 'ed25519' | 'rsa';

export function realPrivateKey(type: KeyType = 'ed25519'): string {
  // Generated, never committed: a private key in a repository is a private key on the internet.
  const { privateKey } = crypto.generateKeyPairSync(type as 'ed25519', {
    ...(type === 'rsa' ? { modulusLength: 2048 } : {}),
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  } as never) as unknown as { privateKey: string };
  return privateKey;
}

export function world(options: {
  keys?: Record<string, string | undefined>;
  nodes?: TreeNode[];
  answers?: (string | undefined | Promise<string>)[];
  also?: string[];
  /** What a person types when a vault loaded via `also` asks for the PIN (the interactive unlock). */
  typed?: string;
  /** Keep the REAL `SshAgentServer` (a real socket) instead of the stub — for the test that crosses the server's own lambda. */
  realServer?: boolean;
}): World {
  let server: FakeServer | undefined;
  const w: World = {
    mod: undefined as never,
    modules: [],
    server: (): FakeServer | undefined => server,
    answers: [...(options.answers ?? [])],
    dialogs: [],
    infos: [],
    buttons: [],
    env: {},
    envDescription: '',
    presence: 0,
    logs: watchLogs([]),
    disposals: 0,
    channels: 0,
    picks: [],
    pickAnswers: [],
    sources: [],
    settings: {},
    changeSetting: (key, value) => {
      w.settings[key] = value;
      const event = { affectsConfiguration: (section: string): boolean => section === 'credSshManager' || section === `credSshManager.${key}` };
      configListeners.forEach((listener) => listener(event));
    },
  };
  const configListeners = new Set<ConfigListener>();

  class StubAgentServer {
    readonly socketPath: string;
    listening = false;
    readonly confirm: FakeServer['confirm'];
    readonly keys: () => unknown[];

    constructor(o: {
      socketPath: string;
      keys: () => unknown[];
      confirm: (
        key: { entityId: string; name: string; fingerprint: string },
        purpose: unknown,
        data: Buffer,
        signal: AbortSignal,
        flags: number,
      ) => Promise<boolean>;
      log: (m: string) => void;
    }) {
      this.socketPath = o.socketPath;
      this.confirm = (key, purpose, data = Buffer.alloc(0), signal = new AbortController().signal, flags = 0) =>
        o.confirm(key, purpose, data, signal, flags);
      this.keys = o.keys;
      server = this as unknown as FakeServer;
    }

    listen(): Promise<void> {
      this.listening = true;
      return Promise.resolve();
    }

    dispose(): void {
      this.listening = false;
      w.disposals += 1;
    }
  }

  const [mod, ...also] = loadEachWithVscode(
    ['../sshAgentManager', ...(options.also ?? [])],
    {
      // A working emitter: the real semantics, so `VaultKeys.onDidLock` delivers to its listeners as it does in VS Code.
      EventEmitter: StubEventEmitter,
      // What a real `VaultKeys` reads when it is loaded beside the manager: its silent routes ask nobody anything.
      workspace: workspaceStub(w, configListeners),
      CancellationTokenSource: class extends StubCancellationTokenSource {
        constructor() {
          super();
          w.sources.push(this);
        }
      },
      window: {
        showQuickPick: (items: PickItem[], options: World['picks'][number]['options'], token: StubCancellationToken): Promise<PickItem | undefined> => {
          w.picks.push({ items, options });
          return answerPick(items, w.pickAnswers.shift(), token);
        },
        showErrorMessage: (): Promise<undefined> => Promise.resolve(undefined),
        showInputBox: (): Promise<string | undefined> => Promise.resolve(options.typed),
        showInformationMessage: (m: string): Promise<undefined> => {
          w.infos.push(m);
          return Promise.resolve(undefined);
        },
        showWarningMessage: (m: string, _options?: unknown, ...buttons: string[]): Promise<string | undefined> => {
          w.dialogs.push(m);
          w.buttons.push(buttons);
          return Promise.resolve(w.answers.shift());
        },
        createOutputChannel: (): unknown => outputChannelStub(w),
      },
    },
    options.realServer === true
      ? {}
      : {
          './sshAgentServer': {
            SshAgentServer: StubAgentServer,
            agentSocketPath: (dir: string, _p: string, pid: number): string => path.join(dir, `agent-${pid}.sock`),
          },
        },
  );
  w.mod = mod as Manager;
  w.modules = also;
  return w;
}

export function manager(
  w: World,
  options: {
    keys?: Record<string, string | undefined>;
    nodes?: TreeNode[];
    clock?: () => Date;
    consentTimeoutMs?: number;
    /** The window book's second clock; the real one is `performance.now()`, which a test cannot move. */
    monotonic?: () => number;
    /**
     * The three hooks the wiring sets, as values (#197, E3.3). Left out, the hook keeps its FAIL-CLOSED default —
     * which is what a manager nobody wired has. A test that changes one mid-way assigns the field on the instance.
     */
    autoLockMinutes?: number;
    locked?: boolean;
    overdue?: boolean;
  },
): {
  instance: InstanceType<Manager['SshAgentManager']>;
  /** The storage root this manager was given — the socket path is derived from it. */
  dir: string;
} {
  const dir = storageDir();
  const instance = new w.mod.SshAgentManager(
    agentStorage(options) as never,
    dir,
    agentEnv(w) as never,
    () => {
      w.presence += 1;
    },
    undefined,
    options.clock,
    options.consentTimeoutMs,
    options.monotonic,
  );
  hooked(instance, options);
  return { dir, instance };
}

/** Wire the hooks a test asked for; the rest stay as the manager builds them (fail closed). */
function hooked(
  instance: InstanceType<Manager['SshAgentManager']>,
  options: { autoLockMinutes?: number; locked?: boolean; overdue?: boolean },
): void {
  const { autoLockMinutes, locked, overdue } = options;
  if (autoLockMinutes !== undefined) {
    instance.autoLockMinutes = () => autoLockMinutes;
  }
  if (locked !== undefined) {
    instance.lockedNow = () => locked;
  }
  if (overdue !== undefined) {
    instance.autoLockOverdue = () => overdue;
  }
}

/** The vault side of the agent: the keys it may open, the one account, and the nodes that ask to be served. */
export function agentStorage(options: { keys?: Record<string, string | undefined>; nodes?: TreeNode[] }): {
  getPrivateKey(accountId: string, id: string): Promise<string | undefined>;
  getAccounts(): unknown[];
  getNodes(): TreeNode[];
} {
  Object.values(options.keys ?? {}).forEach((pem) => pem !== undefined && watchSecret(pem));
  return {
    getPrivateKey: (_a: string, id: string): Promise<string | undefined> =>
      Promise.resolve(options.keys?.[id]),
    getAccounts: (): unknown[] => [{ accountId: 'a1', email: 'me@corp.com', provider: 'google' }],
    getNodes: (): TreeNode[] => options.nodes ?? [],
  };
}

/** The terminal environment the agent publishes `SSH_AUTH_SOCK` into, recorded on the world. */
export function agentEnv(w: World): {
  replace(name: string, value: string): void;
  delete(name: string): void;
  description: string;
} {
  return {
    replace: (name: string, value: string): void => {
      w.env[name] = value;
    },
    delete: (name: string): void => {
      delete w.env[name];
    },
    set description(value: string) {
      w.envDescription = value;
    },
  } as never;
}

/**
 * A real, writable storage directory.
 *
 * <p>Was the literal `/storage`, which resolves to a drive-relative path Windows tolerates and
 * to the filesystem root on Linux, where creating it needs privileges no test has. These fifteen
 * tests therefore passed on Windows and failed on Linux with `EACCES` — meaning the SSH agent
 * had never actually been exercised under WSL or in a Linux CI.</p>
 */
const tempDirs: string[] = [];

export function storageDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'testsToDelete-agent-'));
  tempDirs.push(dir);
  return dir;
}

// One directory per manager, twenty-odd per run: swept at exit rather than in each test, so a
// failing assertion still leaves nothing behind in the system temp folder.
process.on('exit', () => {
  for (const dir of tempDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // a file another process still holds — the OS clears temp eventually
    }
  }
});

export const keyEntity = (id: string, name: string): EntityMetadata =>
  ({ id, name, kind: 'sshkey' }) as EntityMetadata;

export const KEY_ID = 'key-1';

/**
 * A modal nobody answers, and a way to answer it LATE — after the bound has already refused — or to have it
 * fail late (the window closing under it).
 */
export function unanswered(): {
  answer: Promise<string>;
  clickLate: (choice: string) => void;
  failLate: (error: Error) => void;
} {
  let clickLate: (choice: string) => void = () => undefined;
  let failLate: (error: Error) => void = () => undefined;
  const answer = new Promise<string>((resolve, reject) => {
    clickLate = resolve;
    failLate = reject;
  });
  return { answer, clickLate, failLate };
}

/** The key object the (stub) server holds for the first served key — the thing a late caller would sign with. */
export function servedKey(w: { server(): FakeServer | undefined }): { sign(data: Buffer, flags: number): Buffer | undefined } {
  const keys = (w.server() as FakeServer).keys() as { sign(data: Buffer, flags: number): Buffer | undefined }[];
  return keys[0];
}

/** Bytes a client wants signed — any bytes; `servedKey(w).sign(SIGNED_BYTES, 0)` is a Buffer while the key is live. */
export const SIGNED_BYTES = Buffer.from('bytes a client wants signed');

/** Every log a suite captured and every secret it fed in — what the key-material guard below reads. */
const capturedLogs: string[][] = [];
const secretsFedIn: string[] = [];

/** Put a log into the guard's reach; returns it, so a harness can register where it creates one. */
export function watchLogs(logs: string[]): string[] {
  capturedLogs.push(logs);
  return logs;
}

/** Put a private key's text into the guard's reach; returns it, so a fixture can register where it makes one. */
export function watchSecret(pem: string): string {
  secretsFedIn.push(pem);
  return pem;
}

/**
 * The base64 lines of a PEM. One line at a time, not the joined body: the agent's log turns a line break
 * into `?`, so a printed key reads as its lines glued by `?`, never as the joined body.
 */
function pemBodyLines(pem: string): string[] {
  return pem
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('-----'));
}

/**
 * The lines that carry key material: a PEM header, or the base64 body of a key a test fed in. Pure, so
 * the guard itself can be shown to catch a leak.
 */
export function keyMaterialIn(logs: readonly string[], secrets: readonly string[]): string[] {
  const bodyLines = secrets.flatMap(pemBodyLines);
  return logs.filter((line) => line.includes('PRIVATE KEY') || bodyLines.some((body) => line.includes(body)));
}

/** Every line the suite logged so far that carries key material — empty when the suite is clean (#197). */
export function keyMaterialLogged(): string[] {
  return keyMaterialIn(capturedLogs.flat(), secretsFedIn);
}

/** The suite-wide guard: nothing the suite logged contains key material (#197). */
export function assertNoKeyMaterialLogged(): void {
  const leaked = keyMaterialLogged();
  if (leaked.length > 0) {
    throw new Error(`a log line carries key material: ${leaked[0]}`);
  }
}
