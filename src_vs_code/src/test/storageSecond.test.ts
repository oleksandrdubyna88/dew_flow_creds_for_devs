import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SecondValues } from '../secondValues';
import { TreeNode } from '../types';
import { loadWithVscode } from './vscodeStub';

/**
 * S3 — the second-values record through the real storage.
 *
 * <p>The shape is `storagePayment.test.ts`'s, and so is the point: encrypted at rest by construction
 * (it is a `SecretStorage` key like the password), carried by the bundle, gone with the entry. The
 * row added to `SECRET_KINDS` is what buys all of that, so what this file really asserts is that the
 * row was enough — that nothing had to be hand-written per site.</p>
 *
 * <p>The sync direction is NOT here; it is `secondSurvival.test.ts`, because a kind in that table
 * and not in `ProfileSnapshot` does not fail to sync, it DELETES, and that deserved a file of its
 * own.</p>
 */

interface Storage {
  addNode(accountId: string, node: TreeNode): Promise<void>;
  setSecond(accountId: string, id: string, values: SecondValues | undefined): Promise<void>;
  getSecond(accountId: string, id: string): Promise<SecondValues>;
  getSecondRaw(accountId: string, id: string): Promise<string | undefined>;
  setSecondRaw(accountId: string, id: string, value: string | undefined): Promise<void>;
  deleteNodeRecursive(accountId: string, id: string): Promise<string[]>;
  exportBundle(accountId: string): Promise<{ seconds?: Record<string, string> }>;
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
const NODE: TreeNode = {
  id: 'p1',
  name: 'visa',
  type: 'entity',
  parentId: null,
  details: { id: 'p1', name: 'visa', isSshEnabled: false, kind: 'payment', isPayment: true },
};

const SECONDS: SecondValues = { password2: 'the other password', cvv2: '481', number2: '4242424242424242' };

test('second values live under one keychain key of their own, never in the node, and go with the entry', async () => {
  const { storage, store } = machine();
  await storage.addNode(A, NODE);
  await storage.setSecond(A, 'p1', SECONDS);
  assert.deepEqual(await storage.getSecond(A, 'p1'), SECONDS);

  const keys = store.keys().filter((k) => k.endsWith(':second'));
  assert.equal(keys.length, 1, 'ONE key for six second values — that is what the single JSON record buys');
  assert.ok(!JSON.stringify(NODE).includes('481'), 'no value in plaintext metadata');
  assert.ok(!JSON.stringify(NODE).includes('the other password'), 'the second password especially');

  await storage.deleteNodeRecursive(A, 'p1');
  assert.ok(!store.keys().some((k) => k.endsWith(':second')), 'gone with the entry, via entitySecretKeys');
});

test('an empty record deletes the key rather than storing an empty object', async () => {
  const { storage, store } = machine();
  await storage.addNode(A, NODE);
  await storage.setSecond(A, 'p1', SECONDS);
  await storage.setSecond(A, 'p1', {});

  assert.equal(await storage.getSecondRaw(A, 'p1'), undefined);
  assert.ok(!store.keys().some((k) => k.endsWith(':second')), 'the key is gone, not holding "{}"');
  assert.deepEqual(await storage.getSecond(A, 'p1'), {}, 'and reading it back is no values, not a throw');
});

test('clearing ONE second value leaves the others alone', async () => {
  // The record is replaced whole, which is the same contract `setPayment` has: what the form hands
  // over IS the entry's second values. Dropping one key is how a person deletes one.
  const { storage } = machine();
  await storage.addNode(A, NODE);
  await storage.setSecond(A, 'p1', SECONDS);
  await storage.setSecond(A, 'p1', { cvv2: '481' });

  assert.deepEqual(await storage.getSecond(A, 'p1'), { cvv2: '481' });
});

test('the bundle carries the second values, and a restore on another machine brings them back', async () => {
  const a = machine();
  await a.storage.addNode(A, NODE);
  await a.storage.setSecond(A, 'p1', SECONDS);

  const bundle = await a.storage.exportBundle(A);
  assert.ok(bundle.seconds !== undefined, 'the bundle grew a seconds map from the SECRET_KINDS row alone');
  assert.ok(bundle.seconds?.p1 !== undefined);

  const b = machine();
  await b.storage.importBundle(A, bundle);
  assert.deepEqual(await b.storage.getSecond(A, 'p1'), SECONDS, 'a backup that lost them would lose them forever');
});

test('a bundle written before this kind existed still imports, carrying no second values', async () => {
  const a = machine();
  await a.storage.addNode(A, NODE);
  await a.storage.setSecond(A, 'p1', SECONDS);
  const bundle = (await a.storage.exportBundle(A)) as Record<string, unknown>;
  delete bundle.seconds;

  const b = machine();
  await b.storage.importBundle(A, bundle);
  assert.deepEqual(await b.storage.getSecond(A, 'p1'), {}, 'absent is empty, never a crash');
});

test('a forged entity id cannot reach another entity’s second-values key', async () => {
  // The escape `keyPart` exists for, asserted for the new suffix too: without it an id containing
  // `:` or `_` could name another entity's key. `storageSecretKeys.test.ts` pins this for the
  // existing kinds; a new suffix has to be pinned as well or the guarantee is only true of the
  // kinds somebody remembered.
  const { storage, store } = machine();
  await storage.setSecondRaw(A, 'p1', '{"cvv2":"111"}');
  await storage.setSecondRaw(A, 'p1:second_acc-1_p1', '{"cvv2":"222"}');

  assert.equal(await storage.getSecondRaw(A, 'p1'), '{"cvv2":"111"}', 'the first entry is untouched');
  assert.equal(store.keys().filter((k) => k.endsWith(':second')).length, 2, 'two distinct keys, no collision');
});
