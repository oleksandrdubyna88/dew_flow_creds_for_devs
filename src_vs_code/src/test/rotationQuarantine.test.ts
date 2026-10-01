import assert from 'node:assert/strict';
import { test } from 'node:test';
import { exportOpener } from '../exportSecrets';
import { rotationQuarantineSecretKey } from '../secretKeys';
import type { HeldSlots } from '../rotationQuarantine';
import type { StorageManager } from '../storageManager';
import { EntityMetadata, TreeNode } from '../types';
import { loadWithVscode } from './vscodeStub';
import { ACCOUNT, clickVscode, memoryStorage, seedEntry, sinks, stored } from './pinWorld';

/**
 * A rotated value the vault could not store waits in its own keychain item until the entry's PIN is entered
 * (`todo/PLAN_rotation_quarantine.md`). Over the REAL `StorageManager` with every keychain read logged.
 *
 * <p>Q2 — the item and its exclusions: it is the entry's (deleted with it, with its account, by the orphan
 * sweep) and it is in nothing that leaves this machine — no sync or backup snapshot reads it, a bundle apply
 * never touches it, an export and a share carry nothing of it.</p>
 */

const ENTRY = 'db1';
const CONN = 'mysql://app:old-password-9f2c@db-01.example.internal:3306/orders';
const HELD_CONN = 'mysql://app:HELD-rotated-77ab@db-01.example.internal:3306/orders';
const WAS = 'a'.repeat(64);
const ITEM = rotationQuarantineSecretKey(ACCOUNT, ENTRY);

const details = (): EntityMetadata => ({ id: ENTRY, name: 'orders-db', kind: 'db', isSshEnabled: false, dbType: 'mysql' }) as EntityMetadata;

const holding = (value: string = HELD_CONN, at = 1_000): HeldSlots => ({ dbConnection: { value: stored(value), at, was: WAS } });

interface World {
  readonly storage: StorageManager;
  readonly reads: string[];
}

/** A database entry with a value held beside it. */
async function world(): Promise<World> {
  const reads: string[] = [];
  const storage = memoryStorage(clickVscode([], sinks()), [], reads);
  await seedEntry(storage, details(), { 'database connection': CONN });
  await storage.heldRotations.put(ACCOUNT, ENTRY, holding());
  await storage.heldRotations.list(ACCOUNT, ENTRY);
  reads.length = 0;
  return { storage, reads };
}

const stillHeld = async (w: World): Promise<boolean> => (await w.storage.heldRotations.read(ACCOUNT, ENTRY)).dbConnection !== undefined;

// ---- the store ----

test('the store keeps what it was given, slot by slot, and an empty record is no item at all', async () => {
  const w = await world();

  assert.deepEqual(await w.storage.heldRotations.read(ACCOUNT, ENTRY), holding());
  await w.storage.heldRotations.put(ACCOUNT, ENTRY, {});
  assert.deepEqual(await w.storage.heldRotations.read(ACCOUNT, ENTRY), {});
});

test('the index lists each pair once and forgets it on its own', async () => {
  const w = await world();
  await w.storage.heldRotations.list(ACCOUNT, ENTRY);
  await w.storage.heldRotations.list(ACCOUNT, 'other');

  assert.deepEqual(await w.storage.heldRotations.listed(), [
    { accountId: ACCOUNT, entityId: ENTRY },
    { accountId: ACCOUNT, entityId: 'other' },
  ]);
  await w.storage.heldRotations.unlist(ACCOUNT, ENTRY);
  await w.storage.heldRotations.unlist(ACCOUNT, 'other');
  assert.deepEqual(await w.storage.heldRotations.listed(), []);
});

test('an item this build cannot read is nothing held: a damaged record, a wrong version, a malformed slot', async () => {
  const w = await world();
  const keychain = (w.storage as unknown as { secrets: { store(k: string, v: string): Promise<void> } }).secrets;

  for (const damaged of ['{"v":1,"slots":{"dbConnection":{"value":"x","at":1,"was":"short"}}}', '{"v":2,"slots":{}}', '{not json', 'null']) {
    await keychain.store(ITEM, damaged);
    assert.deepEqual(await w.storage.heldRotations.read(ACCOUNT, ENTRY), {}, `read as held: ${damaged}`);
  }
});

// ---- deleted with its entry ----

test('deleting the entry deletes the value held beside it', async () => {
  const w = await world();

  await w.storage.deleteNodeRecursive(ACCOUNT, ENTRY);

  assert.equal(await stillHeld(w), false, 'the held rotation survived its entry — a secret in the keychain nothing will ever look for');
});

test('removing the account deletes the values held beside its entries', async () => {
  const w = await world();

  await w.storage.removeAccount(ACCOUNT);

  assert.equal(await stillHeld(w), false, 'the held rotation survived its account');
});

test('the orphan sweep collects a held value whose entry is gone', async () => {
  const w = await world();
  await w.storage.deleteNodeRecursive(ACCOUNT, ENTRY);
  // What a crash between a hold and a deletion would leave: the item written after the entry went.
  await w.storage.heldRotations.put(ACCOUNT, ENTRY, holding());

  await w.storage.sweepOrphanSecrets(ACCOUNT);

  assert.equal(await stillHeld(w), false, 'the orphan sweep left the held rotation of a deleted entry');
});

// ---- never leaves this machine ----

test('a sync or backup snapshot never reads the held value and carries nothing of it', async () => {
  const w = await world();

  const snapshot = await w.storage.getSnapshot(ACCOUNT);

  assert.ok(!w.reads.includes(ITEM), 'the snapshot read the held rotation\'s item');
  assert.ok(!JSON.stringify(snapshot).includes('HELD-rotated'), 'the snapshot carries the held value');
});

test('a bundle applied over the entry — even one that drops its kinds — leaves the held value as it was', async () => {
  const w = await world();
  const bundle = await w.storage.exportBundle(ACCOUNT);

  await w.storage.importBundle(ACCOUNT, { ...bundle, dbConnections: {} });

  assert.ok(!w.reads.includes(ITEM), 'the bundle apply read the item of the held rotation');
  assert.equal(await stillHeld(w), true, 'a bundle apply deleted the held rotation — sync decided something only this machine knows');
});

test('an export of the entry carries nothing of the held value', async () => {
  const w = await world();

  const exported = await w.storage.exportSecretsFor(ACCOUNT, [ENTRY], exportOpener(ACCOUNT));

  assert.ok(!JSON.stringify(exported).includes('HELD-rotated'), 'the export carries the held value');
  assert.ok(!w.reads.includes(ITEM), 'the export read the held rotation\'s item');
});

test('a share of the entry carries nothing of the held value', async () => {
  const w = await world();
  const { buildSharePayload } = loadWithVscode<typeof import('../sharePayloadBuild')>('../sharePayloadBuild', clickVscode([], sinks()));
  const node = w.storage.getNode(ACCOUNT, ENTRY) as TreeNode;

  const payload = await buildSharePayload(w.storage, ACCOUNT, node, true);

  assert.ok(!JSON.stringify(payload).includes('HELD-rotated'), 'the share carries the held value');
  assert.ok(!w.reads.includes(ITEM), 'the share read the held rotation\'s item');
});
