import assert from 'node:assert/strict';
import Module from 'node:module';
import { test } from 'node:test';
import { TreeNode } from '../types';

/**
 * Two promises about history, at the storage layer where they are actually kept.
 *
 * <p><b>A clone has no history.</b> A clone is a new id, and history is keyed by id — so the
 * copy starts with an empty past, exactly as it starts with no secrets. Bringing an old
 * version back is a clone FROM a version row, and that too is a fresh entry.</p>
 *
 * <p><b>An accepted update shifts the old one into history.</b> When a share turns out to be
 * a newer version of something already accepted from the same sender and the reader chooses
 * "Update it", the current state is recorded first and the incoming one becomes current —
 * so the entry keeps its place and its id, and what it used to be is one twisty away.</p>
 */

interface Storage {
  addNode(accountId: string, node: TreeNode): Promise<void>;
  updateNode(accountId: string, node: TreeNode): Promise<void>;
  getNode(accountId: string, id: string): TreeNode | undefined;
  getHistory(accountId: string, id: string): Promise<{ name: string; secrets: { password?: string } }[]>;
  recordRevision(accountId: string, id: string, revision: unknown): Promise<void>;
  setPassword(accountId: string, id: string, value: string | undefined): Promise<void>;
  getPassword(accountId: string, id: string): Promise<string | undefined>;
}

const StorageCtor = ((): { new (memento: unknown, secrets: unknown): Storage; newId(): string } => {
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

function secrets(): { get(k: string): Promise<string | undefined>; store(k: string, v: string): Promise<void>; delete(k: string): Promise<void>; onDidChange(): void } {
  const map = new Map<string, string>();
  return {
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

function entity(id: string, name: string, extra: Partial<TreeNode['details']> = {}): TreeNode {
  return { id, name, type: 'entity', details: { id, name, isSshEnabled: false, ...extra } };
}

async function withHistory(storage: Storage): Promise<TreeNode> {
  const node = entity('e1', 'v2', { host: 'new.example.com' });
  await storage.addNode(ACCOUNT, node);
  await storage.setPassword(ACCOUNT, 'e1', 'new-secret');
  await storage.recordRevision(ACCOUNT, 'e1', {
    at: 1_700_000_000_000,
    name: 'v1',
    details: { id: 'e1', name: 'v1', isSshEnabled: false, host: 'old.example.com' },
    secrets: { password: 'old-secret' },
  });
  return node;
}

test('a clone starts with no history, however much the original has', async () => {
  const storage = new StorageCtor(memento(), secrets());
  const source = await withHistory(storage);
  assert.equal((await storage.getHistory(ACCOUNT, 'e1')).length, 1, 'precondition: the original has a past');

  // This is exactly what the Clone command does: a new id, the metadata copied, nothing else.
  const clonedId = StorageCtor.newId();
  await storage.addNode(ACCOUNT, {
    ...source,
    id: clonedId,
    name: 'v2 (copy)',
    details: { ...source.details!, id: clonedId, name: 'v2 (copy)' },
  });

  assert.deepEqual(await storage.getHistory(ACCOUNT, clonedId), []);
  assert.equal(await storage.getPassword(ACCOUNT, clonedId), undefined, 'and no secret either');
  assert.equal((await storage.getHistory(ACCOUNT, 'e1')).length, 1, 'the original keeps its own');
});

test('an accepted update makes the incoming version current and shifts the old one into history', async () => {
  const storage = new StorageCtor(memento(), secrets());
  await withHistory(storage);

  // The "Update it" branch of Accept Share, in storage terms: record what is there, then
  // overwrite it under the SAME id.
  await storage.recordRevision(ACCOUNT, 'e1', {
    at: 1_700_000_900_000,
    name: 'v2',
    details: storage.getNode(ACCOUNT, 'e1')!.details,
    secrets: { password: await storage.getPassword(ACCOUNT, 'e1') },
  });
  await storage.updateNode(ACCOUNT, entity('e1', 'v3', { host: 'newest.example.com' }));
  await storage.setPassword(ACCOUNT, 'e1', 'newest-secret');

  const current = storage.getNode(ACCOUNT, 'e1');
  assert.equal(current?.name, 'v3', 'the incoming one is what the tree shows');
  assert.equal(await storage.getPassword(ACCOUNT, 'e1'), 'newest-secret');

  const history = await storage.getHistory(ACCOUNT, 'e1');
  assert.deepEqual(
    history.map((r) => r.name),
    ['v2', 'v1'],
    'newest first, and the just-replaced version is on top',
  );
  assert.equal(history[0].secrets.password, 'new-secret', 'the replaced secret is still retrievable from history');
});
