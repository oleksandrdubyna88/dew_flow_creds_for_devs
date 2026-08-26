import assert from 'node:assert/strict';
import Module from 'node:module';
import { test } from 'node:test';
import { TreeNode } from '../types';

/**
 * The TOTP seed at the storage layer: its own SecretStorage key, carried by the bundle every
 * sync and backup is built from, and deleted with the entity — the same promises every other
 * secret field keeps, checked for the newest one.
 */

interface Storage {
  addNode(accountId: string, node: TreeNode): Promise<void>;
  deleteNodeRecursive(accountId: string, id: string): Promise<string[]>;
  setTotp(accountId: string, id: string, uri: string): Promise<void>;
  getTotp(accountId: string, id: string): Promise<string | undefined>;
  deleteTotp(accountId: string, id: string): Promise<void>;
  exportBundle(accountId: string): Promise<{ totps?: Record<string, string>; passwords: Record<string, string>; nodes: TreeNode[] }>;
  importBundle(accountId: string, bundle: { nodes: TreeNode[]; passwords: Record<string, string>; totps?: Record<string, string> }): Promise<void>;
  getSnapshot(accountId: string): Promise<{ totps: Record<string, string> }>;
}

const StorageCtor = ((): new (memento: unknown, secrets: unknown) => Storage => {
  const loader = Module as unknown as { _load(request: string, ...rest: unknown[]): unknown };
  const original = loader._load;
  loader._load = function patched(request: string, ...rest: unknown[]): unknown {
    if (request === 'vscode') {
      return {
        EventEmitter: class {
          event = (): void => {};
          fire(): void {}
        },
        Uri: { file: (p: string): object => ({ fsPath: p }) },
        workspace: { getConfiguration: () => ({ get: (_k: string, d: unknown) => d }) },
      };
    }
    return original.call(this, request, ...rest);
  };
  try {
    return (require('../storageManager') as { StorageManager: never }).StorageManager as never;
  } finally {
    loader._load = original;
  }
})();

function memento(): { get<T>(key: string, fallback: T): T; update(key: string, value: unknown): Promise<void> } {
  const map = new Map<string, unknown>();
  return {
    get: <T>(key: string, fallback: T): T => (map.has(key) ? (map.get(key) as T) : fallback),
    update: (key: string, value: unknown): Promise<void> => {
      map.set(key, value);
      return Promise.resolve();
    },
  };
}

function secrets(): {
  keys(): string[];
  get(k: string): Promise<string | undefined>;
  store(k: string, v: string): Promise<void>;
  delete(k: string): Promise<void>;
  onDidChange(): void;
} {
  const map = new Map<string, string>();
  return {
    keys: () => [...map.keys()],
    get: (k) => Promise.resolve(map.get(k)),
    store: (k, v) => {
      map.set(k, v);
      return Promise.resolve();
    },
    delete: (k) => {
      map.delete(k);
      return Promise.resolve();
    },
    onDidChange: () => {},
  };
}

const ACCOUNT = 'acc-1';
const SEED = 'otpauth://totp/GitHub%3Ame?secret=JBSWY3DPEHPK3PXP&issuer=GitHub&algorithm=SHA1&digits=6&period=30';

function entity(id: string): TreeNode {
  return { id, name: id, type: 'entity', details: { id, name: id, isSshEnabled: false, hasTotp: true } };
}

test('a seed lives under its own key and is exported into the bundle and the snapshot', async () => {
  const store = secrets();
  const storage = new StorageCtor(memento(), store);
  await storage.addNode(ACCOUNT, entity('e1'));
  await storage.setTotp(ACCOUNT, 'e1', SEED);

  assert.equal(await storage.getTotp(ACCOUNT, 'e1'), SEED);
  assert.deepEqual(store.keys(), [`${ACCOUNT}_e1:totp`], 'a dedicated key, not the password slot');
  assert.deepEqual((await storage.exportBundle(ACCOUNT)).totps, { e1: SEED });
  assert.deepEqual((await storage.getSnapshot(ACCOUNT)).totps, { e1: SEED });
});

test('importing a bundle that lacks the seed removes the stale one — a merge that dropped it wins', async () => {
  const storage = new StorageCtor(memento(), secrets());
  await storage.addNode(ACCOUNT, entity('e1'));
  await storage.setTotp(ACCOUNT, 'e1', SEED);

  await storage.importBundle(ACCOUNT, { nodes: [entity('e1')], passwords: {} });

  assert.equal(await storage.getTotp(ACCOUNT, 'e1'), undefined);
});

test('a bundle carrying seeds restores them', async () => {
  const storage = new StorageCtor(memento(), secrets());
  await storage.importBundle(ACCOUNT, { nodes: [entity('e1')], passwords: {}, totps: { e1: SEED } });

  assert.equal(await storage.getTotp(ACCOUNT, 'e1'), SEED);
});

test('deleting the entity deletes its seed', async () => {
  const store = secrets();
  const storage = new StorageCtor(memento(), store);
  await storage.addNode(ACCOUNT, entity('e1'));
  await storage.setTotp(ACCOUNT, 'e1', SEED);

  await storage.deleteNodeRecursive(ACCOUNT, 'e1');

  assert.equal(await storage.getTotp(ACCOUNT, 'e1'), undefined);
  assert.deepEqual(store.keys(), []);
});
