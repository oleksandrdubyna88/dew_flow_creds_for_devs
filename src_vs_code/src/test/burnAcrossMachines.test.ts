import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeProfiles, ProfileSnapshot } from '../syncMerge';
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

/** Two-way sync, the way SyncManager does it: merge, write both sides. */
async function sync(from: Storage, to: Storage): Promise<void> {
  const remote = await from.getSnapshot(A);
  const local = await to.getSnapshot(A);
  const { merged } = mergeProfiles(local, remote, NOW + 2000);
  await to.applySnapshot(A, merged);
  await from.applySnapshot(A, merged);
}

function keysOf(store: ReturnType<typeof secrets>, id: string): string[] {
  return store.keys().filter((k) => k.includes(id));
}

/**
 * The parent plan's §8 — the point of the feature, finally as a test rather than an argument:
 * an entry that burns on machine A is gone on machine B after a sync — node, history, every
 * secret — and a machine that restores a backup taken BEFORE the burn does not bring it back.
 */

test('a burn on A removes the entry, its history and every secret on B after a sync', async () => {
  const a = machine();
  const b = machine();
  await seed(a.storage);
  await sync(a.storage, b.storage);
  assert.equal(await b.storage.getPassword(A, 'e1'), 'pw-1', 'B holds the entry before the burn');
  await b.storage.recordRevision(A, 'e1', REVISION); // B has its own kept version too

  // The clock ran out on A: the sweeper's path is deleteNodeRecursive and nothing else.
  await a.storage.deleteNodeRecursive(A, 'e1');
  await sync(a.storage, b.storage);

  assert.equal(b.storage.getNode(A, 'e1'), undefined, 'the entry is gone on B');
  assert.deepEqual(await b.storage.getHistory(A, 'e1'), [], 'and so is its history');
  assert.equal(await b.storage.getPassword(A, 'e1'), undefined);
  assert.equal(await b.storage.getNotes(A, 'e1'), undefined);
  assert.deepEqual(keysOf(b.store, 'e1'), [], `no key of e1 survives in B's keychain: ${keysOf(b.store, 'e1').join(', ')}`);
});

test('a machine that restores a backup taken before the burn does NOT resurrect the entry', async () => {
  const a = machine();
  const c = machine();
  await seed(a.storage);
  const backup = await a.storage.exportBundle(A); // taken while the entry was alive

  await a.storage.deleteNodeRecursive(A, 'e1');

  await c.storage.importBundle(A, backup); // C comes back from the old backup
  assert.ok(c.storage.getNode(A, 'e1') !== undefined, 'the restore itself brings the entry back locally');
  await sync(a.storage, c.storage);

  assert.equal(c.storage.getNode(A, 'e1'), undefined, 'the tombstone wins: the burn is not undone by an old backup');
  assert.equal(a.storage.getNode(A, 'e1'), undefined, 'and A does not get it back from C either');
  assert.deepEqual(keysOf(c.store, 'e1'), []);
});
