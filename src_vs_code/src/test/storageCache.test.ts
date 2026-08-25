import assert from 'node:assert/strict';
import Module from 'node:module';
import { test } from 'node:test';
import { TreeNode } from '../types';

/**
 * The storage layer's read cache (audit 2026-08-25, C3).
 *
 * <p>`getNodes` validated every stored node on every call and `getChildren` filtered and sorted
 * the whole account per call; the tree filter makes ~43 such calls per keystroke over a
 * thousand entities. What is asserted here is the observable contract, not the mechanism:
 * two reads without a write hand back the SAME array (so nothing was re-parsed), any write —
 * ours, or another window's landing in the memento underneath us — is seen by the very next
 * read, and the shared array cannot be edited in place by a caller who forgot it is shared.</p>
 */

interface Storage {
  getNodes(accountId: string): readonly TreeNode[];
  getChildren(accountId: string, parentId: string | null): readonly TreeNode[];
  addNode(accountId: string, node: TreeNode): Promise<void>;
  updateNode(accountId: string, node: TreeNode): Promise<void>;
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

/** Behaves like ExtHostMemento: a stored object is a JSON clone, stable until the next write. */
function memento(): {
  get<T>(key: string, fallback?: T): T | undefined;
  update(key: string, value: unknown): Promise<void>;
} {
  const map = new Map<string, unknown>();
  return {
    get: <T>(key: string, fallback?: T): T | undefined =>
      map.has(key) ? (map.get(key) as T) : fallback,
    update: (key: string, value: unknown): Promise<void> => {
      map.set(key, value !== null && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value);
      return Promise.resolve();
    },
  };
}

function secrets(): object {
  const map = new Map<string, string>();
  return {
    get: (k: string) => Promise.resolve(map.get(k)),
    store: (k: string, v: string) => {
      map.set(k, v);
      return Promise.resolve();
    },
    delete: (k: string) => {
      map.delete(k);
      return Promise.resolve();
    },
    onDidChange: () => ({ dispose(): void {} }),
  };
}

const ACCOUNT = 'acc-1';

function folder(id: string, name: string, sortOrder?: number): TreeNode {
  return { id, name, type: 'folder', parentId: null, sortOrder };
}

function entity(id: string, name: string, parentId: string | null): TreeNode {
  return { id, name, type: 'entity', parentId, details: { id, name, isSshEnabled: false } };
}

async function seeded(): Promise<{ storage: Storage; gs: ReturnType<typeof memento> }> {
  const gs = memento();
  const storage = new StorageCtor(gs, secrets());
  await storage.addNode(ACCOUNT, folder('f1', 'Servers', 1));
  await storage.addNode(ACCOUNT, entity('e1', 'beta', 'f1'));
  await storage.addNode(ACCOUNT, entity('e2', 'alpha', 'f1'));
  await storage.addNode(ACCOUNT, entity('e3', 'loose', null));
  return { storage, gs };
}

test('two reads without a write return the same array — the stored JSON is validated once', async () => {
  const { storage } = await seeded();

  assert.equal(storage.getNodes(ACCOUNT), storage.getNodes(ACCOUNT), 'getNodes must not re-parse');
  assert.equal(
    storage.getChildren(ACCOUNT, 'f1'),
    storage.getChildren(ACCOUNT, 'f1'),
    'getChildren must not re-filter and re-sort',
  );
  assert.equal(storage.getChildren(ACCOUNT, null), storage.getChildren(ACCOUNT, null));
});

test('the cached children are still folders-first and alphabetical', async () => {
  const { storage } = await seeded();

  assert.deepEqual(
    storage.getChildren(ACCOUNT, 'f1').map((n) => n.name),
    ['alpha', 'beta'],
  );
  assert.deepEqual(
    storage.getChildren(ACCOUNT, null).map((n) => n.name),
    ['Servers', 'loose'],
  );
});

test('a write through the storage is seen by the next read', async () => {
  const { storage } = await seeded();
  const before = storage.getChildren(ACCOUNT, 'f1');

  await storage.addNode(ACCOUNT, entity('e4', 'gamma', 'f1'));

  const after = storage.getChildren(ACCOUNT, 'f1');
  assert.notEqual(after, before, 'a mutation must produce a new array');
  assert.deepEqual(after.map((n) => n.name), ['alpha', 'beta', 'gamma']);
  assert.equal(storage.getNodes(ACCOUNT).length, 5);
});

test('a write from ANOTHER window — the memento replaced underneath us — is seen too', async () => {
  // Two VS Code windows of one profile each run their own extension host. When the other one
  // writes, this memento's value is swapped for a fresh parse; nothing calls a mutator here.
  const { storage, gs } = await seeded();
  storage.getNodes(ACCOUNT); // warm

  await gs.update(`credSshManager.nodes.${ACCOUNT}`, [folder('f9', 'From the other window')]);

  assert.deepEqual(storage.getNodes(ACCOUNT).map((n) => n.id), ['f9']);
  assert.deepEqual(storage.getChildren(ACCOUNT, null).map((n) => n.id), ['f9']);
});

test('a rename is visible in the folder listing, not only in getNodes', async () => {
  const { storage } = await seeded();
  storage.getChildren(ACCOUNT, 'f1'); // warm the per-parent cache

  await storage.updateNode(ACCOUNT, { ...entity('e1', 'zulu', 'f1') });

  assert.deepEqual(
    storage.getChildren(ACCOUNT, 'f1').map((n) => n.name),
    ['alpha', 'zulu'],
  );
});

test('the shared array cannot be edited in place — a forgotten copy throws instead of corrupting', async () => {
  const { storage } = await seeded();
  const nodes = storage.getNodes(ACCOUNT) as TreeNode[];
  const children = storage.getChildren(ACCOUNT, 'f1') as TreeNode[];

  assert.throws(() => nodes.push(entity('x', 'x', null)), TypeError);
  assert.throws(() => children.sort((a, b) => b.name.localeCompare(a.name)), TypeError);
  assert.equal(storage.getNodes(ACCOUNT).length, 4, 'nothing leaked into the cache');
});

test('an account with nothing stored reads as empty, and stays cheap to ask again', () => {
  const storage = new StorageCtor(memento(), secrets());

  assert.deepEqual(storage.getNodes('nobody'), []);
  assert.equal(storage.getNodes('nobody'), storage.getNodes('nobody'));
  assert.deepEqual(storage.getChildren('nobody', null), []);
});
