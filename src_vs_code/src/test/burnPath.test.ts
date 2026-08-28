import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ProfileSnapshot } from '../syncMerge';
import { Revision } from '../revisionHistory';
import { TreeNode } from '../types';
import { loadWithVscode } from './vscodeStub';

interface Storage {
  addNode(accountId: string, node: TreeNode): Promise<void>;
  getNode(accountId: string, id: string): TreeNode | undefined;
  getNodes(accountId: string): readonly TreeNode[];
  setPassword(accountId: string, id: string, value: string): Promise<void>;
  getPassword(accountId: string, id: string): Promise<string | undefined>;
  setNotes(accountId: string, id: string, value: string): Promise<void>;
  getNotes(accountId: string, id: string): Promise<string | undefined>;
  recordRevision(accountId: string, id: string, revision: Revision): Promise<void>;
  getHistory(accountId: string, id: string): Promise<Revision[]>;
  deleteNodeRecursive(accountId: string, id: string): Promise<string[]>;
  getSnapshot(accountId: string): Promise<ProfileSnapshot>;
  applySnapshot(accountId: string, snapshot: ProfileSnapshot): Promise<void>;
  exportBundle(accountId: string): Promise<unknown>;
  importBundle(accountId: string, bundle: unknown): Promise<void>;
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

function secrets(): { keys(): string[]; get(k: string): Promise<string | undefined>; store(k: string, v: string): Promise<void>; delete(k: string): Promise<void>; onDidChange(): void } {
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

/** One machine: its own memento (device id, nodes, tombstones) and its own keychain. */
function machine(): { storage: Storage; store: ReturnType<typeof secrets> } {
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
  const store = secrets();
  return { storage: new StorageManager(memento(), store), store };
}

const A = 'acc-1';
const NOW = 1_800_000_000_000;

function ephemeral(id: string): TreeNode {
  return {
    id,
    name: `${id} (1 h)`,
    type: 'entity',
    parentId: null,
    details: { id, name: `${id} (1 h)`, isSshEnabled: false, expiresAt: NOW + 60 * 60 * 1000, burnPolicy: 'ttl' } as never,
  };
}

const REVISION: Revision = { at: NOW - 1000, name: 'before', details: { id: 'e1', name: 'before', isSshEnabled: false } as never, secrets: { password: 'old-pw' } };

/** The entry as a person makes it: metadata, a password, notes, and one kept version. */
async function seed(storage: Storage): Promise<void> {
  await storage.addNode(A, ephemeral('e1'));
  await storage.setPassword(A, 'e1', 'pw-1');
  await storage.setNotes(A, 'e1', 'some notes');
  await storage.recordRevision(A, 'e1', REVISION);
}

function keysOf(store: ReturnType<typeof secrets>, id: string): string[] {
  return store.keys().filter((k) => k.includes(id));
}

/**
 * The parent plan's §10 — "the only way to get this wrong" — in executable form: after a burn
 * there is no history and no key of any kind left for the entry.
 */

test('after a burn getHistory is empty and no key of the entry remains in the keychain', async () => {
  const m = machine();
  await seed(m.storage);
  assert.equal((await m.storage.getHistory(A, 'e1')).length, 1, 'the fixture has a kept version');
  assert.ok(keysOf(m.store, 'e1').length >= 3, `the fixture has secrets: ${keysOf(m.store, 'e1').join(', ')}`);

  const removed = await m.storage.deleteNodeRecursive(A, 'e1');

  assert.deepEqual(removed, ['e1 (1 h)']);
  assert.deepEqual(await m.storage.getHistory(A, 'e1'), []);
  assert.deepEqual(keysOf(m.store, 'e1'), [], 'every key — password, notes, history and the rest — is gone');
  assert.equal(m.storage.getNodes(A).length, 0);
});

test('a burn writes a causal tombstone — what carries the deletion to every other machine', async () => {
  const m = machine();
  await seed(m.storage);
  await m.storage.deleteNodeRecursive(A, 'e1');
  const snapshot = await m.storage.getSnapshot(A);
  const tombstone = snapshot.tombstones.e1;
  assert.ok(tombstone !== undefined && typeof tombstone === 'object' && Object.keys(tombstone.v).length > 0, 'a versioned tombstone');
});
