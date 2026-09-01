import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PaymentFields } from '../paymentFields';
import { TreeNode } from '../types';
import { loadWithVscode } from './vscodeStub';

/**
 * S1.2 — the payment record through the real storage.
 *
 * <p>The shape is `storageFields.test.ts`'s, and so is the point: encrypted at rest by
 * construction (it is a `SecretStorage` key like the password), carried by the bundle, gone with
 * the entry. The row added to `SECRET_KINDS` is what buys all of that, so what this file really
 * asserts is that the row is enough — that nothing had to be hand-written per site.</p>
 */

interface Storage {
  addNode(accountId: string, node: TreeNode): Promise<void>;
  setPayment(accountId: string, id: string, fields: PaymentFields | undefined): Promise<void>;
  getPayment(accountId: string, id: string): Promise<PaymentFields>;
  getPaymentRaw(accountId: string, id: string): Promise<string | undefined>;
  setPaymentRaw(accountId: string, id: string, value: string | undefined): Promise<void>;
  deleteNodeRecursive(accountId: string, id: string): Promise<string[]>;
  exportBundle(accountId: string): Promise<{ payments?: Record<string, string> }>;
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

const CARD: PaymentFields = { number: '4111111111111111', cvv: '123', pin: '4321', holder: 'A Person' };

test('a payment record lives under one keychain key of its own, never in the node, and goes with the entry', async () => {
  const { storage, store } = machine();
  await storage.addNode(A, NODE);
  await storage.setPayment(A, 'p1', CARD);
  assert.deepEqual(await storage.getPayment(A, 'p1'), CARD);

  const keys = store.keys().filter((k) => k.endsWith(':payment'));
  assert.equal(keys.length, 1, 'ONE key for nine card fields — that is what the single JSON record buys');
  assert.ok(!JSON.stringify(NODE).includes('4111'), 'no value in plaintext metadata');
  assert.ok(!JSON.stringify(NODE).includes('123'), 'the CVV especially');

  await storage.deleteNodeRecursive(A, 'p1');
  assert.ok(!store.keys().some((k) => k.endsWith(':payment')), 'gone with the entry, via entitySecretKeys');
});

test('an empty record deletes the key rather than storing an empty object', async () => {
  const { storage } = machine();
  await storage.addNode(A, NODE);
  await storage.setPayment(A, 'p1', CARD);
  await storage.setPayment(A, 'p1', {});
  assert.equal(await storage.getPaymentRaw(A, 'p1'), undefined);
  assert.deepEqual(await storage.getPayment(A, 'p1'), {}, 'and reading it back is no fields, not a throw');
});

test('the bundle carries the payment record, and a restore on another machine brings it back', async () => {
  const a = machine();
  await a.storage.addNode(A, NODE);
  await a.storage.setPayment(A, 'p1', CARD);

  const bundle = await a.storage.exportBundle(A);
  assert.ok(bundle.payments !== undefined, 'the bundle grew a payments map from the SECRET_KINDS row alone');
  assert.ok(bundle.payments?.p1 !== undefined);

  const b = machine();
  await b.storage.importBundle(A, bundle);
  assert.deepEqual(await b.storage.getPayment(A, 'p1'), CARD, 'CVV and PIN included — a backup that lost them would lose them forever');
});

test('a bundle written before this kind existed still imports, carrying no payments', async () => {
  const a = machine();
  await a.storage.addNode(A, NODE);
  await a.storage.setPayment(A, 'p1', CARD);
  const bundle = (await a.storage.exportBundle(A)) as Record<string, unknown>;
  delete bundle.payments;

  const b = machine();
  await b.storage.importBundle(A, bundle);
  assert.deepEqual(await b.storage.getPayment(A, 'p1'), {}, 'absent is empty, never a crash');
});

test('a forged entity id cannot reach another entity’s payment key', async () => {
  // The escape `keyPart` exists for, asserted for the new suffix too: without it an id containing
  // `:` or `_` could name another entity's key. `storageSecretKeys.test.ts` pins this for the
  // existing kinds; a new suffix has to be pinned as well or the guarantee is only true of the
  // kinds somebody remembered.
  const { storage, store } = machine();
  await storage.setPaymentRaw(A, 'p1', '{"cvv":"111"}');
  await storage.setPaymentRaw(A, 'p1:payment_acc-1_p1', '{"cvv":"222"}');
  assert.equal(await storage.getPaymentRaw(A, 'p1'), '{"cvv":"111"}', 'the first entry is untouched');
  assert.equal(store.keys().filter((k) => k.endsWith(':payment')).length, 2, 'two distinct keys, no collision');
});
