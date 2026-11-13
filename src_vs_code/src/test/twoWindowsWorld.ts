import { TreeNode } from '../types';
import { loadWithVscode } from './vscodeStub';

/**
 * Two windows, one profile — the world `crossWindowWrites.test.ts` was written in, shared.
 *
 * <p>Every window of one profile shares a single `globalState` and a single `SecretStorage`. Moved out
 * of the test that made them so a second test file has no second copy; not named `*.test.ts`, so the
 * runner never reads it as a suite.</p>
 */

/** What the cross-window tests ask of a manager. */
export interface WindowStorage {
  addNode(accountId: string, node: TreeNode): Promise<void>;
  setPassword(accountId: string, id: string, value: string): Promise<void>;
  getPassword(accountId: string, id: string): Promise<string | undefined>;
  upsertAccount(account: { accountId: string; email: string; provider: string }): Promise<void>;
  getAccounts(): readonly { accountId: string }[];
  removeAccount(accountId: string): Promise<void>;
  importBundle(accountId: string, bundle: unknown): Promise<void>;
  exportBundle(accountId: string): Promise<unknown>;
}

/** One store, two windows, and a gate on one key to make an interleaving repeatable. */
export function sharedMemento(): {
  api: { get<T>(key: string, fallback?: T): T | undefined; update(key: string, value: unknown): Promise<void> };
  pauseOn(key: string): { reached: Promise<void>; release: () => void };
} {
  const map = new Map<string, unknown>();
  const gates = new Map<string, { open: Promise<void>; release: () => void; arrive: () => void }>();
  return {
    api: {
      get: <T>(key: string, fallback?: T): T | undefined => (map.has(key) ? (map.get(key) as T) : fallback),
      update: async (key: string, value: unknown): Promise<void> => {
        const gate = gates.get(key);
        if (gate !== undefined) {
          gates.delete(key);
          gate.arrive();
          await gate.open;
        }
        map.set(key, value !== null && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value);
      },
    },
    pauseOn: (key: string) => {
      let release = (): void => {};
      let arrive = (): void => {};
      const open = new Promise<void>((resolve) => {
        release = resolve;
      });
      const reached = new Promise<void>((resolve) => {
        arrive = resolve;
      });
      gates.set(key, { open, release, arrive });
      return { reached, release };
    },
  };
}

export function sharedSecrets(): { api: object; keys: () => string[] } {
  const map = new Map<string, string>();
  return {
    keys: () => [...map.keys()],
    api: {
      get: (k: string) => Promise.resolve(map.get(k)),
      store: (k: string, v: string) => {
        map.set(k, v);
        return Promise.resolve();
      },
      delete: (k: string) => {
        map.delete(k);
        return Promise.resolve();
      },
      onDidChange: () => ({ dispose: () => undefined }),
    },
  };
}

type Manager<S> = new (m: unknown, s: unknown, d?: string) => S;

/** The real `StorageManager` class under a `vscode` stub, typed as the interface the test names. */
function managerClass<S>(): Manager<S> {
  const { StorageManager } = loadWithVscode<{ StorageManager: Manager<S> }>(
    '../storageManager',
    {
      EventEmitter: class {
        event = (): void => {};
        fire(): void {}
      },
      Uri: { file: (p: string): object => ({ fsPath: p }) },
      workspace: { getConfiguration: () => ({ get: (_k: string, d: unknown) => d }) },
      window: { setStatusBarMessage: () => ({ dispose: (): void => undefined }) },
    },
  );
  return StorageManager;
}

/** One real `StorageManager` over the given memento and keychain. */
export function storageManagerOver<S>(memento: object, secrets: object, lockDir?: string): S {
  return new (managerClass<S>())(memento, secrets, lockDir);
}

/**
 * Two StorageManagers over ONE memento and ONE keychain: two windows of the same profile.
 *
 * <p>With `lockDir` they share a lock directory on the real filesystem — the real `mkdir`, because the
 * atomicity of that one call is the entire design. Without it each window has a `SerialQueue` and
 * nothing else. `S` is the manager's interface as the calling test names it.</p>
 */
export function twoWindows<S = WindowStorage>(lockDir?: string): { a: S; b: S; memento: ReturnType<typeof sharedMemento>; keys: () => string[] } {
  const Window = managerClass<S>();
  const memento = sharedMemento();
  const secrets = sharedSecrets();
  return {
    a: new Window(memento.api, secrets.api, lockDir),
    b: new Window(memento.api, secrets.api, lockDir),
    memento,
    keys: secrets.keys,
  };
}
