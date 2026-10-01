import assert from 'node:assert/strict';
import { test } from 'node:test';
import { protectEntity } from '../entityPin';
import { exportOpener } from '../exportSecrets';
import type { PinGate } from '../pinGate';
import { HeldSlots, fingerprintOf } from '../rotationQuarantine';
import { readSecret, unlockSecret } from '../secretEnvelope';
import { rotationQuarantineSecretKey } from '../secretKeys';
import type { StorageManager } from '../storageManager';
import { protectionDecision } from '../syncPinRule';
import { EntityMetadata, TreeNode } from '../types';
import { loadEachWithVscode, loadWithVscode } from './vscodeStub';
import { ACCOUNT, ModalAnswer, PIN, Sinks, carried, clickVscode, memoryStorage, seedEntry, sinks, stored } from './pinWorld';

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

// ---- Q4: the release at the door, sealed (plan §4.4) ----

const OTHER_CONN = 'mysql://app:CHANGED-elsewhere-5e0f@db-01.example.internal:3306/orders';
const STORE_ROTATED = 'Store the rotated one';
const KEEP_CURRENT = 'Keep the current one';

interface DoorWorld {
  readonly storage: StorageManager;
  readonly s: Sinks;
  /** Every value the keychain was handed after the setup — rule R3's evidence. */
  readonly written: string[];
  readonly door: typeof import('../pinAdmission');
  readonly prompt: typeof import('../pinPrompt');
  readonly edit: typeof import('../editPrefill');
}

/**
 * A PROTECTED database entry with a rotated connection string held beside it — the rotation ran while the
 * entry was being protected. `live` is what the slot holds (sealed); the hold replaced `CONN`.
 */
async function doorWorld(inputs: (string | undefined)[] = [PIN], modal: ModalAnswer[] = [], live: string = CONN): Promise<DoorWorld> {
  const s = sinks();
  s.modalAnswers.push(...modal);
  const stub = clickVscode([...inputs], s);
  const written: string[] = [];
  const storage = memoryStorage(stub, written);
  await seedEntry(storage, details(), { 'database connection': live });
  await protectEntity(storage, ACCOUNT, ENTRY, PIN);
  await storage.updateNodeFields(ACCOUNT, ENTRY, protectionDecision(true));
  await storage.heldRotations.list(ACCOUNT, ENTRY);
  await storage.heldRotations.put(ACCOUNT, ENTRY, { dbConnection: { value: stored(HELD_CONN), at: AT, was: fingerprintOf(CONN) } });
  // One graph: the door's grant is the one the release reads.
  const [door, prompt, edit] = loadEachWithVscode(['../pinAdmission', '../pinPrompt', '../editPrefill'], stub) as [
    typeof import('../pinAdmission'),
    typeof import('../pinPrompt'),
    typeof import('../editPrefill'),
  ];
  written.length = 0;
  return { storage, s, written, door, prompt, edit };
}

const AT = Date.UTC(2026, 9, 1, 9, 30, 0);

const GATE: PinGate = { accountId: ACCOUNT, entityId: ENTRY, entryName: 'orders-db', ask: () => Promise.resolve(PIN) };

async function openedSlot(w: DoorWorld): Promise<string | undefined> {
  const read = readSecret(await w.storage.getDbConnection(ACCOUNT, ENTRY));
  return read.kind === 'locked' ? unlockSecret(read.envelope, ACCOUNT, PIN) : undefined;
}

const heldNow = async (w: DoorWorld): Promise<HeldSlots> => w.storage.heldRotations.read(ACCOUNT, ENTRY);

/** A keychain write that carried the held value in the clear — R3 says there must be none. */
const clearWrites = (w: DoorWorld): string[] => w.written.filter((value) => value.includes('HELD-rotated'));

test('the PIN at the door puts the held value into the entry, sealed — never in the clear — and the item and its index entry are gone', async () => {
  const w = await doorWorld();

  const admission = await w.door.admit(w.storage, ACCOUNT, ENTRY, GATE);

  assert.equal(await openedSlot(w), HELD_CONN, 'the entry still holds the old connection string after its PIN was entered');
  assert.deepEqual(clearWrites(w), [], 'the held value reached the keychain in the clear (R3)');
  assert.deepEqual(await heldNow(w), {}, 'the item survived its release');
  assert.deepEqual(await w.storage.heldRotations.listed(), [], 'the index still names a released entry');
  assert.deepEqual(admission, { kind: 'in', released: [{ slot: 'dbConnection', at: AT, sealed: true }], conflicts: [] });
});

test('a release whose drop failed is finished by the next door — nothing written twice, nothing lost', async () => {
  const w = await doorWorld();
  failOnce(w.storage.heldRotations, 'put');

  await w.door.admit(w.storage, ACCOUNT, ENTRY, GATE);
  assert.equal(await openedSlot(w), HELD_CONN, 'the write did not land before the failed drop');
  assert.ok((await heldNow(w)).dbConnection !== undefined, 'the setup: the drop did not fail');
  const writes = w.written.length;

  const second = await w.door.admit(w.storage, ACCOUNT, ENTRY, GATE);

  assert.deepEqual(await heldNow(w), {}, 'the next door did not finish the interrupted release');
  assert.equal(w.written.length, writes, 'the next door wrote the slot again instead of only dropping the item');
  assert.equal(second.kind === 'in' && second.released.length, 1);
});

test('a sealed write that fails keeps the item, and the door still opens', async () => {
  const w = await doorWorld();
  failOnce(w.storage as unknown as Record<string, unknown>, 'setDbConnection');

  const admission = await w.door.admit(w.storage, ACCOUNT, ENTRY, GATE);

  assert.equal(admission.kind, 'in', 'a failed release became a failure to open');
  assert.equal(carried((await heldNow(w)).dbConnection?.value), HELD_CONN, 'the held value was lost when its write failed');
  assert.equal(await openedSlot(w), CONN);
});

test('a slot changed after the rotation is not overwritten: the item is kept, nothing is written, and the conflict is reported', async () => {
  const w = await doorWorld([PIN], [], OTHER_CONN);

  const admission = await w.door.admit(w.storage, ACCOUNT, ENTRY, GATE);

  assert.equal(await openedSlot(w), OTHER_CONN, 'the release overwrote a value that changed after the rotation');
  assert.deepEqual(w.written, [], 'something was written');
  assert.ok((await heldNow(w)).dbConnection !== undefined, 'the conflicting hold was dropped without asking');
  assert.deepEqual(admission, { kind: 'in', released: [], conflicts: [{ slot: 'dbConnection', at: AT }] });
});

test('the conflict, asked: "Store the rotated one" keeps the current value in history first, then stores the rotated one sealed', async () => {
  const w = await doorWorld([PIN], [STORE_ROTATED], OTHER_CONN);
  const before = (await w.storage.getHistory(ACCOUNT, ENTRY)).length;

  const gate = await w.prompt.admitEntry(w.storage, ACCOUNT, ENTRY, 'orders-db', 'view it');

  assert.ok(gate !== undefined, 'the door did not open');
  assert.match(w.s.modals[0] ?? '', /changed after it/);
  assert.equal(await openedSlot(w), HELD_CONN, 'the rotated value was not stored after the person chose it');
  assert.equal((await w.storage.getHistory(ACCOUNT, ENTRY)).length, before + 1, 'the value it replaced was not kept in history first');
  assert.deepEqual(clearWrites(w), [], 'the rotated value reached the keychain in the clear');
  assert.deepEqual(await heldNow(w), {});
});

test('the conflict, asked: "Keep the current one", confirmed, drops the held value and leaves the entry as it is', async () => {
  const w = await doorWorld([PIN], [KEEP_CURRENT, 'Drop It'], OTHER_CONN);

  await w.prompt.admitEntry(w.storage, ACCOUNT, ENTRY, 'orders-db', 'view it');

  assert.equal(await openedSlot(w), OTHER_CONN);
  assert.deepEqual(await heldNow(w), {}, 'the held value survived the person keeping the current one');
  assert.equal(w.s.modals.length, 2, 'dropping the only copy of a rotated value was not confirmed');
});

test('the conflict, dismissed: kept, and asked again at the next door', async () => {
  const w = await doorWorld([PIN], [undefined, undefined], OTHER_CONN);

  await w.prompt.admitEntry(w.storage, ACCOUNT, ENTRY, 'orders-db', 'view it');
  await w.prompt.admitEntry(w.storage, ACCOUNT, ENTRY, 'orders-db', 'view it');

  assert.ok((await heldNow(w)).dbConnection !== undefined);
  assert.equal(w.s.modals.length, 2, 'the second door did not ask again');
});

test('the person is told the waiting value is now stored, with when it was rotated', async () => {
  const w = await doorWorld();

  await w.prompt.admitEntry(w.storage, ACCOUNT, ENTRY, 'orders-db', 'view it');

  assert.match(w.s.infos.join('\n'), /The new connection string of "orders-db" from 2026-10-01 .* is now stored, sealed under its PIN\./);
});

test('Edit after a waiting rotation opens over the rotated value, never over the old one', async () => {
  const w = await doorWorld();

  const gate = await w.prompt.admitEntry(w.storage, ACCOUNT, ENTRY, 'orders-db', 'edit it');
  const opened = await w.edit.openEntryForEdit(w.storage, ACCOUNT, ENTRY, gate as PinGate);

  assert.equal(opened.kind === 'open' && opened.prefill.dbConnection, HELD_CONN, 'Edit opened over the old value — saving would write it back over the rotated one');
});

/** The next call of `name` fails, and every one after it works — a crash between two steps of a release. */
function failOnce(target: Record<string, unknown> | object, name: string): void {
  const host = target as Record<string, (...args: unknown[]) => Promise<unknown>>;
  const real = host[name].bind(host);
  let failed = false;
  host[name] = (...args: unknown[]): Promise<unknown> => {
    if (failed) {
      return real(...args);
    }
    failed = true;
    return Promise.reject(new Error(`${name} failed (injected)`));
  };
}
