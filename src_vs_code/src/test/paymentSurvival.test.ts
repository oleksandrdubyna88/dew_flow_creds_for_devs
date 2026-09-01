import assert from 'node:assert/strict';
import { test } from 'node:test';
import { quarantineUnsafeIds } from '../idQuarantine';
import type { PaymentFields } from '../paymentFields';
import { mergeProfiles, ProfileSnapshot } from '../syncMerge';
import { TreeNode } from '../types';
import { loadWithVscode } from './vscodeStub';

/**
 * Two ways a payment record could be destroyed, both found by the S1.2 code review, both Blocking.
 *
 * <p>They share a shape worth naming: adding a secret kind to the row-driven table
 * (`SECRET_KINDS`) makes every TABLE-DRIVEN seam carry it for free — export, import, delete — and
 * makes every HAND-MAINTAINED seam silently disagree with it. The table-driven half is what the
 * story tested. The hand-written half is where the data goes.</p>
 *
 * <p>1. <b>A sync deleted every payment record.</b> The new row put payments into the snapshot that
 * `getSnapshot()` builds, but `ProfileSnapshot` and `mergeProfiles` did not carry them — so the
 * merged snapshot came back WITHOUT payments, `secretMapsOf` read that absence as `{}`, and
 * `dropAbsentKinds` deleted the `:payment` key of every entity. Save a card, let any ordinary change
 * arrive from another machine, lose the card. The plan had deferred sync to the next story and never
 * asked whether NOT syncing was safe; it was not, it was destructive.</p>
 *
 * <p>2. <b>Restoring a backup with an unsafe id stranded the record.</b> `remapBundle` re-keys nine
 * maps by hand. A payment node whose id is `x:payment` gets renamed to a safe uuid, but its JSON
 * stayed under the old key — so the restored entry read empty, the next export omitted it, and the
 * only copy became an unreachable keychain orphan.</p>
 */

interface Storage {
  addNode(accountId: string, node: TreeNode): Promise<void>;
  setPayment(accountId: string, id: string, fields: PaymentFields | undefined): Promise<void>;
  getPayment(accountId: string, id: string): Promise<PaymentFields>;
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
const CARD: PaymentFields = { number: '4111111111111111', cvv: '123', pin: '4321' };

function node(id: string): TreeNode {
  return {
    id,
    name: 'visa',
    type: 'entity',
    parentId: null,
    details: { id, name: 'visa', isSshEnabled: false, kind: 'payment', isPayment: true },
  };
}

test('a sync does not delete the payment record it is not carrying', async () => {
  const { storage } = machine();
  await storage.addNode(A, node('p1'));
  await storage.setPayment(A, 'p1', CARD);

  // Exactly what a sync cycle does: snapshot, merge against the other side, apply the result.
  const local = await storage.getSnapshot(A);
  const { merged } = mergeProfiles(local, local, 1_800_000_000_000);
  await storage.applySnapshot(A, merged);

  assert.deepEqual(
    await storage.getPayment(A, 'p1'),
    CARD,
    'the card survived a sync — the CVV and the PIN exist nowhere else',
  );
});

test('the snapshot carries payments, so a merge cannot drop them', async () => {
  const { storage } = machine();
  await storage.addNode(A, node('p1'));
  await storage.setPayment(A, 'p1', CARD);

  const snapshot = await storage.getSnapshot(A);
  assert.ok(snapshot.payments !== undefined, 'ProfileSnapshot must carry payments, not merely export them');
  assert.ok(snapshot.payments?.p1 !== undefined);

  const { merged } = mergeProfiles(snapshot, snapshot, 1_800_000_000_000);
  assert.deepEqual(merged.payments, snapshot.payments, 'and the merge must return them');
});

test('a merge with a pre-payment snapshot on one side keeps the side that has the record', () => {
  // The forward-compatibility case every other kind already has a line for: a snapshot decoded from
  // a vault written before this kind exists carries no payments record AT ALL, and must not delete
  // the other side's.
  const withCard: ProfileSnapshot = {
    ...emptyish(),
    nodes: [node('p1')],
    payments: { p1: JSON.stringify(CARD) },
  };
  const legacy = { ...withCard } as Partial<ProfileSnapshot>;
  delete legacy.payments;

  const { merged } = mergeProfiles(legacy as ProfileSnapshot, withCard, 1_800_000_000_000);
  assert.deepEqual(merged.payments, withCard.payments, 'the record survives a merge against a build that knows nothing of it');
});

test('an unsafe imported id takes its payment record with it', () => {
  // A node id of `x:payment` is exactly the collision `keyPart` escapes, so quarantine renames it.
  // The record must follow the rename, or it is stranded under a key the restored node never reads.
  const bundle = {
    nodes: [node('x:payment')],
    passwords: {},
    payments: { 'x:payment': JSON.stringify(CARD) },
  };
  const { bundle: safe, renamed } = quarantineUnsafeIds(bundle as never, {}, () => 'fresh-uuid');

  assert.equal(renamed['x:payment'], 'fresh-uuid', 'the id was quarantined');
  assert.equal(safe.nodes[0]?.id, 'fresh-uuid');
  assert.equal(
    (safe as { payments?: Record<string, string> }).payments?.['fresh-uuid'],
    JSON.stringify(CARD),
    'and the record moved with it, rather than being stranded under the old key',
  );
  assert.equal(
    (safe as { payments?: Record<string, string> }).payments?.['x:payment'],
    undefined,
    'nothing left behind to become an orphan',
  );
});

/** A snapshot with every required map empty — the fields `mergeProfiles` reads unconditionally. */
function emptyish(): ProfileSnapshot {
  return {
    nodes: [],
    passwords: {},
    privateKeys: {},
    vpnConfigs: {},
    dbConnections: {},
    notes: {},
    attachments: {},
    images: {},
    totps: {},
    configs: {},
    fields: {},
    tombstones: {},
    horizon: {},
  };
}
