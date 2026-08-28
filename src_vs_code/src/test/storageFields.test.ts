import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeProfiles, ProfileSnapshot } from '../syncMerge';
import { TreeNode } from '../types';
import { loadWithVscode } from './vscodeStub';

/**
 * The login/URL secret through the real storage: encrypted-at-rest by construction (it is a
 * SecretStorage key like the password), carried by the bundle and the snapshot, merged across
 * machines, gone with the entry.
 */

interface Storage {
  addNode(accountId: string, node: TreeNode): Promise<void>;
  setFields(accountId: string, id: string, fields: { login?: string; url?: string } | undefined): Promise<void>;
  getFields(accountId: string, id: string): Promise<{ login?: string; url?: string }>;
  getFieldsRaw(accountId: string, id: string): Promise<string | undefined>;
  deleteNodeRecursive(accountId: string, id: string): Promise<string[]>;
  exportBundle(accountId: string): Promise<{ fields?: Record<string, string> }>;
  importBundle(accountId: string, bundle: unknown): Promise<void>;
  getSnapshot(accountId: string): Promise<ProfileSnapshot>;
  applySnapshot(accountId: string, snapshot: ProfileSnapshot): Promise<void>;
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
const NODE: TreeNode = { id: 'c1', name: 'grafana', type: 'entity', parentId: null, details: { id: 'c1', name: 'grafana', isSshEnabled: false } };

test('login and URL live under their own keychain key, never in the node, and go with the entry', async () => {
  const { storage, store } = machine();
  await storage.addNode(A, NODE);
  await storage.setFields(A, 'c1', { login: 'admin', url: 'https://grafana.example.internal' });
  assert.deepEqual(await storage.getFields(A, 'c1'), { login: 'admin', url: 'https://grafana.example.internal' });
  assert.ok(store.keys().some((k) => k.endsWith(':fields')), 'a keychain key of its own');
  assert.ok(!JSON.stringify(NODE).includes('admin'), 'nothing in plain metadata');
  await storage.setFields(A, 'c1', {});
  assert.equal(await storage.getFieldsRaw(A, 'c1'), undefined, 'an empty record deletes the key');
  await storage.setFields(A, 'c1', { login: 'admin' });
  await storage.deleteNodeRecursive(A, 'c1');
  assert.ok(!store.keys().some((k) => k.endsWith(':fields')), 'gone with the entry');
});

test('the bundle and the snapshot carry the fields, and a restore brings them back', async () => {
  const a = machine();
  await a.storage.addNode(A, NODE);
  await a.storage.setFields(A, 'c1', { login: 'admin', url: 'https://x' });
  const bundle = await a.storage.exportBundle(A);
  assert.ok(bundle.fields !== undefined && bundle.fields.c1 !== undefined, 'the bundle has a fields map');

  const b = machine();
  await b.storage.importBundle(A, bundle);
  assert.deepEqual(await b.storage.getFields(A, 'c1'), { login: 'admin', url: 'https://x' });

  const c = machine();
  await c.storage.applySnapshot(A, await a.storage.getSnapshot(A));
  assert.deepEqual(await c.storage.getFields(A, 'c1'), { login: 'admin', url: 'https://x' });
});

test('a merge carries the fields like every other secret, and a pre-0.82 snapshot without them still merges', async () => {
  const a = machine();
  await a.storage.addNode(A, NODE);
  await a.storage.setFields(A, 'c1', { login: 'admin' });
  const withFields = await a.storage.getSnapshot(A);
  const legacy = { ...withFields } as Partial<ProfileSnapshot>;
  delete legacy.fields;
  const { merged } = mergeProfiles(legacy as ProfileSnapshot, withFields, 1_800_000_000_000);
  assert.deepEqual(merged.fields, withFields.fields);
});
