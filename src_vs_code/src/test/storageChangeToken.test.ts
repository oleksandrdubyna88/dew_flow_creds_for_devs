import assert from 'node:assert/strict';
import Module from 'node:module';
import { test } from 'node:test';
import { TreeNode } from '../types';

/**
 * `StorageManager.changeToken` (audit 2026-08-25, C4) — the sync cycle's proof that the local
 * snapshot cannot have changed.
 *
 * <p>It has to be STABLE across reads, or the idle-cycle skip never fires; and it has to MOVE
 * on every way local state can change, or a change is never pushed: every mutator, a write
 * landing in the memento from another window, and a keychain change event from another
 * window. Each of those is one test below, because each is one way to lose data silently.</p>
 */

interface Storage {
  changeToken(accountId: string): string;
  addNode(accountId: string, node: TreeNode): Promise<void>;
  updateNode(accountId: string, node: TreeNode): Promise<void>;
  moveNode(accountId: string, id: string, parentId: string | null): Promise<void>;
  deleteNodeRecursive(accountId: string, id: string): Promise<string[]>;
  setPassword(accountId: string, id: string, value: string | undefined): Promise<void>;
  deletePassword(accountId: string, id: string): Promise<void>;
  setPrivateKey(accountId: string, id: string, value: string): Promise<void>;
  setVpnConfig(accountId: string, id: string, value: string): Promise<void>;
  setDbConnection(accountId: string, id: string, value: string): Promise<void>;
  setNotes(accountId: string, id: string, value: string | undefined): Promise<void>;
  setAttachment(accountId: string, id: string, value: string | undefined): Promise<void>;
  setImage(accountId: string, id: string, value: string | undefined): Promise<void>;
  setTombstones(accountId: string, tombstones: Record<string, number>): Promise<void>;
  setHorizon(accountId: string, horizon: Record<string, number>): Promise<void>;
  recordRevision(accountId: string, id: string, revision: unknown): Promise<void>;
  getNodes(accountId: string): readonly TreeNode[];
  dispose(): void;
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

function memento(): { get<T>(key: string, fallback?: T): T | undefined; update(key: string, value: unknown): Promise<void> } {
  const map = new Map<string, unknown>();
  return {
    get: <T>(key: string, fallback?: T): T | undefined => (map.has(key) ? (map.get(key) as T) : fallback),
    update: (key: string, value: unknown): Promise<void> => {
      map.set(key, value !== null && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value);
      return Promise.resolve();
    },
  };
}

/** A SecretStorage whose change event the test can fire, as another window's write would. */
function secrets(): {
  get(k: string): Promise<string | undefined>;
  store(k: string, v: string): Promise<void>;
  delete(k: string): Promise<void>;
  onDidChange(listener: (e: { key: string }) => void): { dispose(): void };
  fireChange(key: string): void;
  disposed: boolean;
} {
  const map = new Map<string, string>();
  const listeners: ((e: { key: string }) => void)[] = [];
  const self = {
    disposed: false,
    get: (k: string) => Promise.resolve(map.get(k)),
    store: (k: string, v: string) => {
      map.set(k, v);
      return Promise.resolve();
    },
    delete: (k: string) => {
      map.delete(k);
      return Promise.resolve();
    },
    onDidChange: (listener: (e: { key: string }) => void) => {
      listeners.push(listener);
      return {
        dispose: () => {
          self.disposed = true;
        },
      };
    },
    fireChange: (key: string) => {
      for (const l of listeners) {
        l({ key });
      }
    },
  };
  return self;
}

const A = 'acc-1';

function entity(id: string, parentId: string | null = null): TreeNode {
  return { id, name: id, type: 'entity', parentId, details: { id, name: id, isSshEnabled: false } };
}

test('the token is stable across reads — otherwise the idle skip would never fire', async () => {
  const storage = new StorageCtor(memento(), secrets());
  await storage.addNode(A, entity('e1'));

  const first = storage.changeToken(A);
  storage.getNodes(A);
  assert.equal(storage.changeToken(A), first);
  assert.equal(storage.changeToken(A), first);
});

test('every mutator moves the token', async () => {
  const storage = new StorageCtor(memento(), secrets());
  await storage.addNode(A, { id: 'f1', name: 'f', type: 'folder', parentId: null });
  await storage.addNode(A, entity('e1'));
  let token = storage.changeToken(A);
  const moved = (what: string): void => {
    const next = storage.changeToken(A);
    assert.notEqual(next, token, `${what} must move the token`);
    token = next;
  };

  await storage.addNode(A, entity('e2'));
  moved('addNode');
  await storage.updateNode(A, entity('e2'));
  moved('updateNode');
  await storage.moveNode(A, 'e2', 'f1');
  moved('moveNode');
  await storage.setPassword(A, 'e1', 'pw');
  moved('setPassword');
  await storage.deletePassword(A, 'e1');
  moved('deletePassword');
  await storage.setPrivateKey(A, 'e1', 'key');
  moved('setPrivateKey');
  await storage.setVpnConfig(A, 'e1', 'cfg');
  moved('setVpnConfig');
  await storage.setDbConnection(A, 'e1', 'conn');
  moved('setDbConnection');
  await storage.setNotes(A, 'e1', 'note');
  moved('setNotes');
  await storage.setAttachment(A, 'e1', 'YQ==');
  moved('setAttachment');
  await storage.setImage(A, 'e1', 'YQ==');
  moved('setImage');
  await storage.setTombstones(A, { gone: 1 });
  moved('setTombstones');
  await storage.setHorizon(A, { dev: 9 });
  moved('setHorizon');
  await storage.deleteNodeRecursive(A, 'f1');
  moved('deleteNodeRecursive');
});

test('a keychain change event from another window moves the token', async () => {
  const ss = secrets();
  const storage = new StorageCtor(memento(), ss);
  await storage.addNode(A, entity('e1'));
  const before = storage.changeToken(A);

  ss.fireChange(`${A}_e1`);

  assert.notEqual(storage.changeToken(A), before);
});

test('a memento write from another window moves the token', async () => {
  const gs = memento();
  const storage = new StorageCtor(gs, secrets());
  await storage.addNode(A, entity('e1'));
  const before = storage.changeToken(A);

  await gs.update(`credSshManager.nodes.${A}`, [entity('e1'), entity('e2')]);

  assert.notEqual(storage.changeToken(A), before);
});

test('a revision (local history, not part of the snapshot) leaves the token alone', async () => {
  const storage = new StorageCtor(memento(), secrets());
  await storage.addNode(A, entity('e1'));
  const before = storage.changeToken(A);

  await storage.recordRevision(A, 'e1', { at: 1, name: 'old', details: { id: 'e1', name: 'old', isSshEnabled: false }, secrets: {} });

  assert.equal(storage.changeToken(A), before);
});

test('tokens are per account — a write to one profile does not disturb another', async () => {
  const storage = new StorageCtor(memento(), secrets());
  await storage.addNode(A, entity('e1'));
  await storage.addNode('acc-2', entity('e9'));
  const other = storage.changeToken('acc-2');

  await storage.addNode(A, entity('e2'));

  assert.equal(storage.changeToken('acc-2'), other);
});

test('disposing the storage releases the SecretStorage listener', () => {
  const ss = secrets();
  const storage = new StorageCtor(memento(), ss);

  storage.dispose();

  assert.equal(ss.disposed, true);
});
