import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TreeNode } from '../types';
import { loadWithVscode } from './vscodeStub';

/**
 * Restore through the real storage (the owner, 2026-08-28): moving to the Trash remembers the
 * folder, restoring goes back to it — in one write each — and a folder that is gone by then
 * sends the entry to the root instead of nowhere.
 */

interface Storage {
  getNode(accountId: string, id: string): TreeNode | undefined;
  addNode(accountId: string, node: TreeNode): Promise<void>;
  moveToTrash(accountId: string, id: string): Promise<TreeNode>;
  restoreFromTrash(accountId: string, id: string): Promise<TreeNode | null | undefined>;
  deleteNodeRecursive(accountId: string, id: string): Promise<string[]>;
}

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

const secrets = {
  get: (): Promise<string | undefined> => Promise.resolve(undefined),
  store: (): Promise<void> => Promise.resolve(),
  delete: (): Promise<void> => Promise.resolve(),
  onDidChange: (): { dispose(): void } => ({ dispose: (): void => {} }),
};

function build(): Storage {
  const { StorageManager } = loadWithVscode<{ StorageManager: new (memento: unknown, secrets: unknown) => Storage }>(
    '../storageManager',
    {
      EventEmitter: class {
        event = (): void => {};
        fire(): void {}
      },
      Uri: { file: (p: string): object => ({ fsPath: p }) },
      workspace: { getConfiguration: () => ({ get: (_k: string, d: unknown) => d }) },
    },
  );
  return new StorageManager(memento(), secrets);
}

const A = 'a1';

function nodeOf(storage: Storage, id: string): TreeNode {
  const node = storage.getNode(A, id);
  if (node === undefined) {
    throw new Error(`no node ${id}`);
  }
  return node;
}

async function vaultWithEntry(storage: Storage): Promise<void> {
  await storage.addNode(A, { id: 'f', name: 'ssh', type: 'folder', parentId: null });
  await storage.addNode(A, { id: 'e', name: 'www', type: 'entity', parentId: 'f', details: { id: 'e', name: 'www' } as never });
}

test('deleting remembers the folder; restoring goes back to it and forgets', async () => {
  const storage = build();
  await vaultWithEntry(storage);
  const trash = await storage.moveToTrash(A, 'e');
  const gone = nodeOf(storage, 'e');
  assert.equal(gone.parentId, trash.id, 'in the trash');
  assert.equal(gone.trashedFrom, 'f', 'and it remembers where from');

  const back = await storage.restoreFromTrash(A, 'e');
  assert.equal(back === null || back === undefined ? '' : back.id, 'f', 'restored to the ssh folder');
  const restored = nodeOf(storage, 'e');
  assert.equal(restored.parentId, 'f');
  assert.equal(restored.trashedFrom, undefined, 'the memory is cleared once used');
});

test('when the folder was deleted for real in the meantime, the entry restores to the root', async () => {
  const storage = build();
  await vaultWithEntry(storage);
  await storage.moveToTrash(A, 'e');
  await storage.deleteNodeRecursive(A, 'f');
  const back = await storage.restoreFromTrash(A, 'e');
  assert.equal(back, null, 'the root');
  assert.equal(nodeOf(storage, 'e').parentId, null);
});

test('restoring what is not there restores nothing', async () => {
  const storage = build();
  assert.equal(await storage.restoreFromTrash(A, 'nope'), undefined);
});
