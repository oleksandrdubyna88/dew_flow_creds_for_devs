import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import { test } from 'node:test';
import { protectEntity, unprotectEntity } from '../entityPin';
import { exportOpener } from '../exportSecrets';
import type { PinGate } from '../pinGate';
import { Fingerprint, HeldSlots, ReleaseProof, UNATTENDED, fingerprintOf, holdRotated, matchesFingerprint, releaseHeld, releaseUnprotected, waitingKeys } from '../rotationQuarantine';
import { readSecret, unlockSecret } from '../secretEnvelope';
import { rotationQuarantineSecretKey } from '../secretKeys';
import type { StorageManager } from '../storageManager';
import { protectionDecision } from '../syncPinRule';
import { EntityMetadata, TreeNode } from '../types';
import { loadEachWithVscode, loadWithVscode } from './vscodeStub';
import { ACCOUNT, ModalAnswer, PIN, Sinks, carried, clickVscode, locked, memoryStorage, seedEntry, sinks, stored } from './pinWorld';

/**
 * A rotated value the vault could not store waits in its own keychain item until the entry's PIN is entered
 * (`research/PLAN_rotation_quarantine.md`). Over the REAL `StorageManager` with every keychain read logged.
 *
 * <p>Q2 — the item and its exclusions: it is the entry's (deleted with it, with its account, by the orphan
 * sweep) and it is in nothing that leaves this machine — no sync or backup snapshot reads it, a bundle apply
 * never touches it, an export and a share carry nothing of it.</p>
 */

const ENTRY = 'db1';
const CONN = 'mysql://app:old-password-9f2c@db-01.example.internal:3306/orders';
const HELD_CONN = 'mysql://app:HELD-rotated-77ab@db-01.example.internal:3306/orders';
const WAS: Fingerprint = { kdf: 'unknown' };
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

  for (const damaged of ['{"v":2,"slots":{"dbConnection":{"at":1,"was":{"salt":"ab","mac":"short"}}}}', '{"v":1,"slots":{"dbConnection":{"value":5,"at":1,"was":"short"}}}', '{"v":3,"slots":{"dbConnection":{"value":"x","at":"soon","was":{"kdf":"unknown"}}}}', '{"v":4,"slots":{"dbConnection":{"value":"x","at":1,"was":{"kdf":"unknown"}}}}', '{not json', 'null']) {
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

test('a bundle applied WITHOUT the entry — an older backup restored, no tombstone — deletes the value held beside it and unlists it', async () => {
  const w = await world();
  const bundle = await w.storage.exportBundle(ACCOUNT);

  await w.storage.importBundle(ACCOUNT, { ...bundle, nodes: bundle.nodes.filter((node) => node.id !== ENTRY), dbConnections: {} });

  assert.equal(w.storage.getNode(ACCOUNT, ENTRY), undefined, 'the setup: the apply did not remove the entry');
  assert.equal(await stillHeld(w), false, 'the held rotation outlived the entry the apply removed — a plaintext item in the keychain that nothing will ever look for');
  assert.deepEqual(await w.storage.heldRotations.listed(), [], 'the index still names the removed entry');
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
  await storage.heldRotations.put(ACCOUNT, ENTRY, { dbConnection: { value: stored(HELD_CONN), at: AT, was: await fingerprintOf(CONN) } });
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

// ---- Q5: the release when the entry is no longer protected (plan §4.5) ----

interface PlainWorld extends DoorWorld {
  readonly quarantine: typeof import('../rotationQuarantine');
  readonly session: typeof import('../pinSession');
  readonly commands: typeof import('../pinCommands');
}

/** `doorWorld`, with the release's own module, the grants and the PIN commands in the same graph. */
async function plainWorld(inputs: (string | undefined)[] = [PIN]): Promise<PlainWorld> {
  const w = await doorWorld(inputs);
  const stub = clickVscode([...inputs], w.s);
  const [quarantine, session, commands] = loadEachWithVscode(['../rotationQuarantine', '../pinSession', '../pinCommands'], stub) as [
    typeof import('../rotationQuarantine'),
    typeof import('../pinSession'),
    typeof import('../pinCommands'),
  ];
  return { ...w, quarantine, session, commands };
}

/** What another window or a sync does: the values unsealed with the PIN, the mark off — no door here. */
async function unprotectedElsewhere(w: DoorWorld): Promise<void> {
  await unprotectEntity(w.storage, ACCOUNT, ENTRY, PIN);
  await w.storage.updateNodeFields(ACCOUNT, ENTRY, protectionDecision(false));
  w.written.length = 0;
}

const plainSlot = async (w: DoorWorld): Promise<string | undefined> => carried(await w.storage.getDbConnection(ACCOUNT, ENTRY));

test('Remove PIN Protection with a rotated value waiting: the entry gets the new value, plain, and the item is gone', async () => {
  const w = await plainWorld();

  await w.commands.unprotectEntry(w.storage.getNode(ACCOUNT, ENTRY) as TreeNode, { storage: w.storage, accountId: ACCOUNT, refresh: () => undefined });

  assert.equal(await plainSlot(w), HELD_CONN, 'the entry was left on the old connection string with no PIN left to trigger anything');
  assert.deepEqual(await heldNow(w), {}, 'the held value survived its entry losing its PIN');
  assert.match(w.s.infos.join('\n'), /rotated connection string that was waiting is now stored/);
});

test('an entry unprotected by a sync: the sweep stores the waiting value, plain, exactly as the rotation would have', async () => {
  const w = await plainWorld();
  await unprotectedElsewhere(w);

  const released = await w.quarantine.releaseUnprotected(w.storage);

  assert.equal(released.length, 1);
  assert.equal(await plainSlot(w), HELD_CONN, 'the sweep left an unprotected entry on the old connection string');
  assert.deepEqual(await heldNow(w), {});
  assert.deepEqual(await w.storage.heldRotations.listed(), []);
});

test('an entry protected again between the sweep\'s decision and its write: refused under the lease, nothing in the clear, the item kept', async () => {
  const w = await plainWorld();
  await unprotectedElsewhere(w);
  const protectedLate: ReleaseProof = async (storage, accountId, entityId, name) => {
    const decided = await w.quarantine.UNATTENDED(storage, accountId, entityId, name);
    await protectEntity(w.storage, ACCOUNT, ENTRY, PIN);
    await w.storage.updateNodeFields(ACCOUNT, ENTRY, protectionDecision(true));
    w.written.length = 0;
    return decided;
  };

  const release = await w.quarantine.releaseHeld(w.storage, ACCOUNT, ENTRY, 'orders-db', protectedLate);

  assert.deepEqual(release.released, []);
  assert.deepEqual(clearWrites(w), [], 'the held value was written in the clear into an entry protected meanwhile');
  assert.equal(readSecret(await w.storage.getDbConnection(ACCOUNT, ENTRY)).kind, 'locked');
  assert.ok((await heldNow(w)).dbConnection !== undefined, 'the held value was lost');
});

test('a protected entry\'s held value is left alone by the sweep — even while this window holds its PIN', async () => {
  const w = await plainWorld();
  w.session.grantPin(ACCOUNT, ENTRY, PIN);

  const released = await w.quarantine.releaseUnprotected(w.storage);

  assert.equal(released.length, 0);
  assert.deepEqual(w.written, [], 'the sweep wrote into a protected entry — nothing automatic may use a PIN');
  assert.ok((await heldNow(w)).dbConnection !== undefined);
  assert.equal(await openedSlot(w), CONN);
});

test('the sweep drops an index entry whose item is gone', async () => {
  const w = await plainWorld();
  await w.storage.heldRotations.put(ACCOUNT, ENTRY, {});

  await w.quarantine.releaseUnprotected(w.storage);

  assert.deepEqual(await w.storage.heldRotations.listed(), [], 'a stale index entry survived the sweep');
});

const RELEASED = { entryName: 'orders-db', slot: { slot: 'dbConnection', at: 1_000, sealed: false } } as const;

test('the sweeper runs the release on its own trigger, says so, and repaints', async () => {
  const lines: string[] = [];
  let repainted = 0;
  const { EphemeralSweeper } = loadWithVscode<typeof import('../ephemeralSweeper')>('../ephemeralSweeper', clickVscode([], sinks()));
  const quiet = {
    metadataFault: undefined,
    getAccounts: () => [],
    getNodes: () => [],
    deleteNodeRecursive: () => Promise.resolve([]),
    sweepOrphanSecrets: () => Promise.resolve({ deleted: 0, checked: 0 }),
    resumeAccountRemovals: () => Promise.resolve([]),
  };
  const state = { get: () => undefined, update: () => Promise.resolve() } as never;
  const sweeper = new EphemeralSweeper(quiet, state, (line) => lines.push(line), () => (repainted += 1), () => Promise.resolve([RELEASED, RELEASED]));

  await sweeper.runOnce();

  assert.match(lines.join('\n'), /Stored 2 rotated value\(s\) that waited beside an entry no longer protected/);
  assert.equal(repainted, 1);
});

// ---- security review, finding 1: the release decides and commits under ONE lease ----

const V3 = 'mysql://app:EDITED-elsewhere-8a2d@db-01.example.internal:3306/orders';
const V2 = 'mysql://app:ROTATED-again-4f1b@db-01.example.internal:3306/orders';

test('another window seals a newer value between the release\'s check and its commit — the release writes nothing and keeps the item', async () => {
  const w = await plainWorld();
  w.session.grantPin(ACCOUNT, ENTRY, PIN);
  const editedMeanwhile: ReleaseProof = async (...args) => {
    const decided = await w.quarantine.AT_THE_DOOR(...args);
    // Another window's Edit lands while this one seals (scrypt, ~1 s, outside the lease).
    await w.storage.setDbConnection(ACCOUNT, ENTRY, stored(await locked(V3)));
    return decided;
  };

  const release = await w.quarantine.releaseHeld(w.storage, ACCOUNT, ENTRY, 'orders-db', editedMeanwhile);

  assert.equal(await openedSlot(w), V3, 'the release overwrote a newer value with the older held one');
  assert.deepEqual(release.released, []);
  assert.ok((await heldNow(w)).dbConnection !== undefined, 'the held value was dropped though it was never written');
});

test('a plain rotation lands and supersedes the hold between the release\'s check and its commit — the newer value stays', async () => {
  const w = await plainWorld();
  await unprotectedElsewhere(w);
  const rotatedMeanwhile: ReleaseProof = async (...args) => {
    const decided = await w.quarantine.UNATTENDED(...args);
    // What `storeRotated` does for a rotation that lands: the plain write, then the older hold superseded.
    await w.storage.setDbConnection(ACCOUNT, ENTRY, stored(V2));
    await w.quarantine.supersedeHeld(w.storage, ACCOUNT, ENTRY, 'dbConnection');
    return decided;
  };

  await w.quarantine.releaseHeld(w.storage, ACCOUNT, ENTRY, 'orders-db', rotatedMeanwhile);

  assert.equal(await plainSlot(w), V2, 'the release overwrote the newer rotation with the older held value');
});

// ---- security review, finding 2: a click reads its value AFTER the door that released it ----

/** The click surfaces of `doorWorld`'s entry, in the graph whose door releases. */
async function clickWorld(): Promise<DoorWorld & { readonly click: typeof import('../pinClick') }> {
  const w = await doorWorld();
  const [click] = loadEachWithVscode(['../pinClick'], clickVscode([PIN], w.s)) as [typeof import('../pinClick')];
  return { ...w, click };
}

const OWNER = { id: ENTRY, name: 'orders-db', pinProtected: true };

test('Copy Connection String on an entry with a rotated value waiting copies the NEW value, not the one the door just replaced', async () => {
  const w = await clickWorld();

  const opened = await w.click.clickedSecret(w.storage, ACCOUNT, OWNER, (s, a, e) => s.getDbConnection(a, e), 'copy its connection string', 'dbConnection');

  assert.equal(opened.kind === 'open' && opened.value, HELD_CONN, 'the click used the value read before its door released the rotated one — a password that no longer works');
});

test('a click opener handed a value read before its door (Connect, SSH, exec) uses the value the door released', async () => {
  const w = await clickWorld();
  const readFirst = await w.storage.getDbConnection(ACCOUNT, ENTRY);

  const opened = await w.click.clickOpener(w.storage, ACCOUNT, 'connect')(OWNER, readFirst, 'dbConnection');

  assert.equal(opened.kind === 'open' && opened.value, HELD_CONN, 'the opener used the pre-release value');
});

// ---- security review, finding 3: an index entry is dropped only while its item is still empty ----

/**
 * The first read of the item answers "empty" — and a rotation's hold lands right after it, before the reader
 * acts on the answer: the index entry the hold wrote must survive the reader's clean-up.
 */
function holdLandsAfterTheFirstRead(storage: StorageManager): void {
  const store = storage.heldRotations as unknown as Record<string, unknown>;
  const read = storage.heldRotations.read.bind(storage.heldRotations);
  let first = true;
  store.read = async (accountId: string, entityId: string): Promise<HeldSlots> => {
    const answer = await read(accountId, entityId);
    if (first) {
      first = false;
      await holdRotated(storage, ACCOUNT, ENTRY, 'dbConnection', HELD_CONN, await fingerprintOf(CONN));
    }
    return answer;
  };
}

async function emptyButListed(): Promise<StorageManager> {
  const storage = memoryStorage(clickVscode([], sinks()));
  await seedEntry(storage, details(), { 'database connection': CONN });
  await storage.heldRotations.list(ACCOUNT, ENTRY);
  return storage;
}

test('the flags walk does not drop the index entry of a hold that landed while it looked', async () => {
  const storage = await emptyButListed();
  holdLandsAfterTheFirstRead(storage);

  await waitingKeys(storage);

  assert.ok((await storage.heldRotations.read(ACCOUNT, ENTRY)).dbConnection !== undefined, 'the setup: the hold did not land');
  assert.deepEqual(await storage.heldRotations.listed(), [{ accountId: ACCOUNT, entityId: ENTRY }], 'the index lost an entry whose item exists — the tree and the sweep can no longer see it');
});

test('the sweep does not drop the index entry of a hold that landed while it looked', async () => {
  const storage = await emptyButListed();
  holdLandsAfterTheFirstRead(storage);

  await releaseUnprotected(storage);

  assert.deepEqual(await storage.heldRotations.listed(), [{ accountId: ACCOUNT, entityId: ENTRY }], 'the index lost an entry whose item exists');
});

// ---- security review, finding 6: the fingerprint of the replaced value gives no offline check on it ----

const plainSha256 = (text: string): string => crypto.createHash('sha256').update(text, 'utf8').digest('hex');

/** An UNPROTECTED database entry, every keychain write logged — a release here takes the plain road. */
async function plainEntry(): Promise<{ readonly storage: StorageManager; readonly written: string[] }> {
  const written: string[] = [];
  const storage = memoryStorage(clickVscode([], sinks()), written);
  await seedEntry(storage, details(), { 'database connection': CONN });
  written.length = 0;
  return { storage, written };
}

const slotNow = async (storage: StorageManager): Promise<string | undefined> => carried(await storage.getDbConnection(ACCOUNT, ENTRY));

test('a hold\'s record carries no plain SHA-256 of the value it replaced — and the release still tells an unchanged slot from a changed one', async () => {
  const { storage, written } = await plainEntry();

  await holdRotated(storage, ACCOUNT, ENTRY, 'dbConnection', HELD_CONN, await fingerprintOf(CONN));

  const record = written.find((value) => value.includes('"slots"'));
  assert.ok(record !== undefined, 'the setup: no item was written');
  assert.ok(!record.includes(plainSha256(CONN)), `the record carries the plain SHA-256 of the replaced value — an offline guessing check on it for whoever can read the keychain item: ${record}`);
  // Unchanged since the rotation: released.
  const unchanged = await releaseHeld(storage, ACCOUNT, ENTRY, 'orders-db', UNATTENDED);
  assert.deepEqual([unchanged.released.map((one) => one.slot), unchanged.conflicts], [['dbConnection'], []], 'the release no longer recognises the value the rotation replaced');
  assert.equal(await slotNow(storage), HELD_CONN);
  // Changed after the rotation (another window, a sync): a conflict, nothing written.
  await holdRotated(storage, ACCOUNT, ENTRY, 'dbConnection', V2, await fingerprintOf(HELD_CONN));
  await storage.setDbConnection(ACCOUNT, ENTRY, stored(OTHER_CONN));
  const changed = await releaseHeld(storage, ACCOUNT, ENTRY, 'orders-db', UNATTENDED);
  assert.deepEqual([changed.released, changed.conflicts.map((one) => one.slot)], [[], ['dbConnection']], 'a slot changed after the rotation was not seen as changed');
  assert.equal(await slotNow(storage), OTHER_CONN, 'the release overwrote a value that changed after the rotation');
});

// ---- CodeQL js/insufficient-password-hash (PR #179): the fingerprint is a memory-hard derivation ----

const hmacSha256 = (salt: string, text: string): string => crypto.createHmac('sha256', Buffer.from(salt, 'hex')).update(text, 'utf8').digest('hex');

test('a fresh hold\'s fingerprint is a scrypt derivation of the replaced text under its own salt — no fast hash of it', async () => {
  const was = (await fingerprintOf(CONN)) as Fingerprint & { kdf: 'scrypt'; N: number; r: number; p: number; salt: string; key: string };

  assert.equal(was.kdf, 'scrypt', `the fingerprint of the replaced password is not a memory-hard derivation: ${JSON.stringify(was)}`);
  assert.notEqual(was.key, hmacSha256(was.salt, CONN), 'the fingerprint is an HMAC-SHA-256 — a fast, offline guessing check on the replaced password');
  assert.notEqual(was.key, plainSha256(CONN), 'the fingerprint is a plain SHA-256 of the replaced password');
  assert.equal(was.key, crypto.scryptSync(CONN, Buffer.from(was.salt, 'hex'), 32, { N: was.N, r: was.r, p: was.p }).toString('hex'));
  assert.ok(was.N >= 2 ** 14 && was.r >= 8, `a cost too low to slow a guesser: N=${was.N} r=${was.r}`);
  assert.notEqual((await fingerprintOf(CONN) as typeof was).salt, was.salt, 'two holds share a salt');
});

/** A record as a build before the scrypt fingerprint wrote it — never released, but on a developer's machine. */
async function legacyRecord(storage: StorageManager, version: 1 | 2): Promise<void> {
  const keychain = (storage as unknown as { secrets: { store(k: string, v: string): Promise<void> } }).secrets;
  const salt = 'c'.repeat(32);
  const was = version === 1 ? plainSha256(CONN) : { salt, mac: hmacSha256(salt, CONN) };
  await keychain.store(ITEM, JSON.stringify({ v: version, slots: { dbConnection: { value: HELD_CONN, at: AT, was } } }));
}

for (const version of [1, 2] as const) {
  test(`a v${version} record (a fast hash of the replaced value) is read as held, and the door ASKS instead of writing`, async () => {
    const w = await doorWorld();
    await legacyRecord(w.storage, version);

    const admission = await w.door.admit(w.storage, ACCOUNT, ENTRY, GATE);

    assert.equal(await openedSlot(w), CONN, `a v${version} hold was written on the strength of a fast hash — or the value it held was dropped`);
    assert.deepEqual(admission.kind === 'in' && [admission.released, admission.conflicts.map((one) => one.slot)], [[], ['dbConnection']], `a v${version} hold was not turned into a question`);
    assert.equal(carried((await heldNow(w)).dbConnection?.value), HELD_CONN, `the v${version} hold is no longer held — a silent drop`);
  });

  test(`a v${version} record beside an UNPROTECTED entry is left alone by the sweep — no automatic release without a fingerprint`, async () => {
    const { storage, written } = await plainEntry();
    await legacyRecord(storage, version);
    await storage.heldRotations.list(ACCOUNT, ENTRY);
    written.length = 0;

    const released = await releaseUnprotected(storage);

    assert.equal(released.length, 0);
    assert.equal(await slotNow(storage), CONN, `the sweep wrote a v${version} hold with no fingerprint it can check`);
    assert.ok((await storage.heldRotations.read(ACCOUNT, ENTRY)).dbConnection !== undefined, `the v${version} hold was dropped`);
  });
}

test('the scrypt fingerprint still tells the replaced value from any other', async () => {
  const was = await fingerprintOf(CONN);

  assert.equal(await matchesFingerprint(was, CONN), true);
  assert.equal(await matchesFingerprint(was, OTHER_CONN), false);
  assert.equal(await matchesFingerprint(was, undefined), false);
  assert.equal(await matchesFingerprint(await fingerprintOf(undefined), undefined), true, 'an empty slot is fingerprinted as the empty text');
});

// ---- final security review, fix 2: the click after a conflict settled for the rotated value ----

test('a click on an entry whose waiting value conflicts, answered "Store the rotated one", uses the ROTATED value', async () => {
  const w = await doorWorld([PIN], [STORE_ROTATED], OTHER_CONN);
  const [click] = loadEachWithVscode(['../pinClick'], clickVscode([PIN], w.s)) as [typeof import('../pinClick')];

  const opened = await click.clickedSecret(w.storage, ACCOUNT, OWNER, (s, a, e) => s.getDbConnection(a, e), 'copy its connection string', 'dbConnection');

  assert.equal(await openedSlot(w), HELD_CONN, 'the setup: the person\u2019s choice was not stored');
  assert.equal(opened.kind === 'open' && opened.value, HELD_CONN, 'the click used the value the person had just chosen to replace');
});
