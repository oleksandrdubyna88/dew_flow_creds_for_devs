import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeError } from '../describeError';
import { refreshFrom, runAndDeliver, tableFor } from '../brokerResponse';
import { burnIfOneUse } from '../burnOnUse';
import { protectEntity, unprotectEntity } from '../entityPin';
import { maskEntriesFor } from '../maskEntries';
import { writeUnattended } from '../entryWriter';
import { snapshotForRevision } from '../revisionSnapshot';
import type { RotateDeps, StoreOutcome } from '../rotateAction';
import { QuarantineStore, fingerprintOf } from '../rotationQuarantine';
import { readSecret, unlockSecret } from '../secretEnvelope';
import { NEW_SECRET_PLACEHOLDER, RotationSlot } from '../secretRotation';
import type { MaskEntry } from '../secretMasker';
import type { StorageManager } from '../storageManager';
import { protectionDecision } from '../syncPinRule';
import { EntityMetadata } from '../types';
import type { UseAction, UseActionResult } from '../useActions';
import { loadEachWithVscode } from './vscodeStub';
import { ACCOUNT, ModalAnswer, PIN, Sinks, carried, clickVscode, memoryStorage, seedEntry, sinks, stored } from './pinWorld';

/**
 * A rotation never loses a password the far side already accepted (the E2 security review, finding 1;
 * the code round's findings 5 and 14).
 *
 * <p>The far side changes FIRST and the vault after — the order that keeps a vault from holding a
 * password the server never accepted. Since E2 the store is unattended and refused on a protected
 * entry, so an entry protected (in another window) while the statement ran turned a rotation into a
 * lockout: the server had the new password, the vault kept the dead one, the new value was dropped and
 * the agent was told of an internal failure. Now the refusal hands the value to the PERSON: store it
 * under the entry's PIN, or — declined — copy it, and the agent is told it was not stored.</p>
 *
 * <p>Over the real `StorageManager` with every keychain write logged, the real door, and a far side that
 * "accepts" the statement while another window protects the entry.</p>
 */

const ENTRY = 'db1';
const CONN = 'mysql://app:old-password-9f2c@db-01.example.internal:3306/orders';
const NEW_SECRET = 'NEW-secret-4b7e-rotated';
const STORE_IT = 'Store it (asks for the entry’s PIN)';
const COPY_IT = 'Copy the new connection string';
const CTX = { accountId: ACCOUNT, entityId: ENTRY, entityName: 'orders-db' };
const STATEMENT = `ALTER USER app IDENTIFIED BY '${NEW_SECRET_PLACEHOLDER}'`;

const details = (burnPolicy?: EntityMetadata['burnPolicy']): EntityMetadata => ({ id: ENTRY, name: 'orders-db', kind: 'db', isSshEnabled: false, dbType: 'mysql', burnPolicy }) as EntityMetadata;

interface World {
  storage: StorageManager;
  s: Sinks;
  written: string[];
  rotate: () => Promise<UseActionResult>;
  /** The rotation action itself — its journal word is `describeOutcome`. */
  action: UseAction;
  /** The store the action calls, for a second rotation's store without a second far side. */
  store: (slot: RotationSlot, value: string) => Promise<StoreOutcome>;
  /** The connection string as the other window sealed it, byte for byte, the moment it was protected. */
  sealedBefore: string | undefined;
}

/**
 * How the far side behaves: `echo` prints back the statement it ran (a statement composed to echo its
 * input, the masker's case), `stays` leaves the entry unprotected, `exitCode` is what the statement ended with.
 */
interface FarSide {
  readonly echo?: boolean;
  readonly stays?: 'plain';
  readonly exitCode?: number;
  /** `fails`: the keychain refuses the HOLD's item — the value exists in memory alone, E2's chain (plan §4.3 step 3). */
  readonly hold?: 'fails';
  /** `throws`: the far side changed, then the call threw with the statement it ran in its message. */
  readonly ends?: 'throws';
  /** `fails`: the history write refuses — the snapshot of the previous value cannot be kept. */
  readonly history?: 'fails';
  /** `true`: a ONE-USE entry — the broker burns it right after a successful answer (`burnOnUse.ts`). */
  readonly oneUse?: true;
}

/** What the far side printed and how the statement ended. */
function farAnswer(far: FarSide, body: unknown): UseActionResult {
  const printed = far.echo === true ? `${String((body as { query?: unknown }).query)}\n` : 'ALTER\n';
  return { status: 200, body: { exitCode: far.exitCode ?? 0, stdout: printed, stderr: far.echo === true ? printed : '' } };
}

/** A plain database entry, and a far side that accepts the statement while another window protects the entry. */
async function world(inputs: (string | undefined)[], modal: ModalAnswer[], far: FarSide = {}): Promise<World> {
  const s = sinks();
  s.modalAnswers.push(...modal);
  const stub = clickVscode([...inputs], s);
  const written: string[] = [];
  const storage = memoryStorage(stub, written);
  await seedEntry(storage, details(far.oneUse === true ? 'oneUse' : undefined), { 'database connection': CONN });
  if (far.hold === 'fails') {
    refuseHolds(storage);
  }
  const w = { sealedBefore: undefined } as World;
  // One graph: the store's `RotationNotStored` is the class the action catches.
  const [{ storeRotated }, { rotateAction }] = loadEachWithVscode(['../rotationStore', '../rotateAction'], stub) as [
    typeof import('../rotationStore'),
    typeof import('../rotateAction'),
  ];
  const farSide: UseAction = {
    kind: 'db',
    action: 'query',
    mutatesSecrets: false,
    verb: 'run a query against',
    validate: () => ({ ok: true }),
    summarize: () => '',
    describeOutcome: () => 'ok',
    run: async (_ctx, body) => {
      // The server took the new password. Meanwhile, another window protected the entry.
      if (far.stays !== 'plain') {
        await protectEntity(storage, ACCOUNT, ENTRY, PIN);
        await storage.updateNodeFields(ACCOUNT, ENTRY, protectionDecision(true));
        w.sealedBefore = carried(await storage.getDbConnection(ACCOUNT, ENTRY));
      }
      if (far.ends === 'throws') {
        throw new Error(`the driver failed after running: ${String((body as { query?: unknown }).query)}`);
      }
      return farAnswer(far, body);
    },
  };
  const deps: RotateDeps = {
    generate: () => ({ ok: true, value: NEW_SECRET, kind: 'password' }),
    entity: (ctx) => storage.getNode(ctx.accountId, ctx.entityId)?.details,
    current: (ctx) => Promise.resolve(storage.getDbConnection(ctx.accountId, ctx.entityId)),
    snapshot: (ctx, d) => snapshotForRevision(storage, ctx.accountId, { id: ctx.entityId, name: ctx.entityName, details: d }),
    record: (ctx, revision) => (far.history === 'fails' ? Promise.reject(new Error('the keychain refused the history write')) : storage.recordRevision(ctx.accountId, ctx.entityId, revision)),
    store: (ctx, slot, value, was) => storeRotated(storage, ctx, slot, value, was),
  };
  const action = rotateAction(farSide, 'query', deps);
  written.length = 0;
  const rotate = (): Promise<UseActionResult> =>
    action.run(CTX, { statement: STATEMENT }).catch((error: unknown) => ({ status: 500, body: { thrown: describeError(error) } }));
  const store = (slot: RotationSlot, value: string): Promise<StoreOutcome> => storeRotated(storage, CTX, slot, value, fingerprintOf(CONN));
  return Object.assign(w, { storage, s, written, rotate, action, store });
}

/** The keychain refuses the hold's item: what is left is E2's chain, the value in memory alone. */
function refuseHolds(storage: StorageManager): void {
  const store = storage.heldRotations;
  Object.defineProperty(storage, 'heldRotations', { value: { ...store, put: () => Promise.reject(new Error('the keychain refused the write')) } });
}

const inTheClear = (w: World): string[] => w.written.filter((value) => value.includes(NEW_SECRET));

async function openedConnection(w: World): Promise<string | undefined> {
  const read = readSecret(await w.storage.getDbConnection(ACCOUNT, ENTRY));
  return read.kind === 'locked' ? unlockSecret(read.envelope, ACCOUNT, PIN) : undefined;
}

test('protected while the far side changed and the hold failed — the person stores the new value under the entry\'s PIN: sealed, kept, never in the clear', async () => {
  const w = await world([PIN], [STORE_IT], { hold: 'fails' });

  const result = await w.rotate();

  const opened = await openedConnection(w);
  assert.ok(opened?.includes(NEW_SECRET) === true, `the far side's new password was dropped — the vault holds ${String(opened)}; the agent got ${JSON.stringify(result.body)}`);
  assert.deepEqual(inTheClear(w), [], 'the new value reached the keychain in the clear, in a protected entry');
  assert.equal(result.status, 200);
  assert.equal((result.body as { stored?: unknown }).stored, undefined, 'a stored rotation answers as it always did');
  assert.match(w.s.modals[0] ?? '', /WAS changed/);
});

test('protected while the far side changed and the hold failed — the person declines: the copy offer happens, nothing plain is stored, and the agent is told it was NOT stored', async () => {
  const w = await world([], [undefined, COPY_IT], { hold: 'fails' });

  const result = await w.rotate();

  assert.equal(w.s.clipboard.filter((value) => value.includes(NEW_SECRET)).length, 1, `the far side's new password was dropped — never offered to the person; the agent got ${JSON.stringify(result.body)}`);
  assert.deepEqual(inTheClear(w), [], 'the new value reached the keychain in the clear');
  assert.equal(readSecret(await w.storage.getDbConnection(ACCOUNT, ENTRY)).kind, 'locked', 'the other window\'s seal was overwritten');
  assert.equal(result.status, 200, `the agent got an internal failure: ${JSON.stringify(result.body)}`);
  const body = result.body as { rotated?: unknown; stored?: unknown; message?: unknown };
  assert.deepEqual([body.rotated, body.stored], [true, false]);
  assert.match(String(body.message), /the far side changed; the new value was not stored in the vault; the person was told/i);
  assert.ok(!JSON.stringify(result.body).includes(NEW_SECRET), 'the agent was handed the new value');
  assert.match(w.s.modals[1] ?? '', /was NOT stored in the vault/);
});

test('protected while the far side changed and the hold failed — the person agrees but the PIN box is dismissed: the copy offer still comes, and nothing is stored in the clear', async () => {
  const w = await world([undefined], [STORE_IT, COPY_IT], { hold: 'fails' });

  const result = await w.rotate();

  assert.equal(w.s.clipboard.filter((value) => value.includes(NEW_SECRET)).length, 1, `the far side's new password was dropped after the PIN box was dismissed; the agent got ${JSON.stringify(result.body)}`);
  assert.deepEqual(inTheClear(w), []);
  assert.equal((result.body as { stored?: unknown }).stored, false);
});

test('an unattended write refused because the entry was protected meanwhile does not tell its caller to "do it again from the entry"', async () => {
  const storage = memoryStorage(clickVscode([], sinks()));
  await seedEntry(storage, details(), { 'database connection': CONN });

  const refused = await writeUnattended(storage, ACCOUNT, { id: ENTRY, name: 'orders-db' }, async (writer) => {
    await protectEntity(storage, ACCOUNT, ENTRY, PIN);
    await writer.setDbConnection(ACCOUNT, ENTRY, 'mysql://app:x@h/db');
  }).then(() => 'written', (error: unknown) => describeError(error));

  assert.match(refused, /"orders-db" was protected with a PIN/);
  assert.doesNotMatch(refused, /do it again from the entry/i, 'an unattended caller was told to do it again from the entry');
  assert.match(refused, /Nothing was stored/);
});

// ---- Q1: the rotation's own answer never carries the new value (rotation-quarantine plan §4.8) ----

/**
 * The rotation's answer as the agent receives it: through the broker's own tail (`runAndDeliver`), with
 * the pre-run table and the post-run refresh read by the real `maskEntriesFor` over the real storage —
 * exactly what `credsAgentServer` wires. A statement composed to echo its input prints the new value.
 */
async function delivered(w: World): Promise<string> {
  const entriesFor = (a: string, e: string): Promise<readonly MaskEntry[]> => maskEntriesFor(w.storage, a, e);
  const where = { accountId: ACCOUNT, entityId: ENTRY };
  let sent: unknown;
  await runAndDeliver(
    {
      respond: (_status, body) => {
        sent = body;
      },
      log: () => undefined,
      // The real burn (`burnOneUseIn` wires it): a one-use entry is deleted right after the answer, every other entry is left alone.
      burn: () => burnIfOneUse(w.storage, ACCOUNT, ENTRY).then(() => undefined),
      table: await tableFor(entriesFor, where),
      where: { grant: 'g1', entityName: 'orders-db', action: 'rotate', via: 'mcp', summary: 'rotate', caller: undefined },
      refresh: refreshFrom(entriesFor, where),
      fail: (reason) => {
        sent = { failed: reason };
      },
      mutatesSecrets: true,
    },
    w.rotate,
    () => 'rotated',
  );
  return JSON.stringify(sent);
}

test('a statement that echoes the new value, the entry protected while it ran, the person stores it under the PIN — the agent never reads the new value', async () => {
  const w = await world([PIN], [STORE_IT], { echo: true, hold: 'fails' });

  const answer = await delivered(w);

  assert.ok(!answer.includes(NEW_SECRET), `the agent was handed the new value in the rotation's own answer: ${answer}`);
  assert.match(answer, /CREDS_MASKED/, 'the echoed statement was not masked — it is missing rather than redacted');
});

test('a statement that echoes the new value, the entry protected while it ran, the person declines and copies it — the agent never reads the new value', async () => {
  const w = await world([], [undefined, COPY_IT], { echo: true, hold: 'fails' });

  const answer = await delivered(w);

  assert.ok(!answer.includes(NEW_SECRET), `the agent was handed the new value in the rotation's own answer: ${answer}`);
});

test('a statement that echoes the new value and then FAILS — the far side may have changed anyway, and the agent never reads the new value', async () => {
  const w = await world([], [], { echo: true, stays: 'plain', exitCode: 1 });

  const answer = await delivered(w);

  assert.ok(!answer.includes(NEW_SECRET), `the agent was handed the new value in a failed rotation's answer: ${answer}`);
});

test('the control: a statement that echoes the new value into an entry nobody protected — stored plain, and masked', async () => {
  const w = await world([], [], { echo: true, stays: 'plain' });

  const answer = await delivered(w);

  assert.ok(!answer.includes(NEW_SECRET), `the agent was handed the new value: ${answer}`);
  assert.match(answer, /CREDS_MASKED/);
});

// ---- Q3: the refused store writes the hold (plan §4.3) ----

/** `work`, or a failure naming what it waited for — a test that would otherwise hang says why instead. */
async function within<T>(work: Promise<T>, ms: number, waited: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(waited)), ms);
  });
  try {
    return await Promise.race([work, late]);
  } finally {
    clearTimeout(timer);
  }
}

/** A modal that stays open until the test answers it — the person is away. */
function heldOpen(): { answer: ModalAnswer; close: (pressed: string | undefined) => void } {
  let close: (pressed: string | undefined) => void = () => undefined;
  const answer = (): Promise<string | undefined> => new Promise((resolve) => (close = resolve));
  return { answer, close: (pressed) => close(pressed) };
}

const holdsTheNewValue = async (w: World): Promise<boolean> => ((await heldConnection(w)) ?? '').includes(NEW_SECRET);

/** Every keychain write that carried the new value was the held item's record — and there was one. */
const onlyInTheHeldItem = (w: World): boolean => inTheClear(w).length > 0 && inTheClear(w).every((value) => value.startsWith('{"v":2,"slots":'));

const journalWord = (w: World, result: UseActionResult): string => (w.action.describeOutcome ?? String)(result);

const heldConnection = async (w: World): Promise<string | undefined> => carried((await w.storage.heldRotations.read(ACCOUNT, ENTRY)).dbConnection?.value);

test('protected while the far side changed — the new value is held beside the entry, the agent hears "quarantined" at once, and nothing reaches the slot in the clear', async () => {
  const modal = heldOpen();
  const w = await world([], [modal.answer]);

  const result = await within(w.rotate(), 5_000, 'the agent\'s answer waited for the person to answer the modal');

  assert.ok(await holdsTheNewValue(w), `the far side's new password is held nowhere — the agent got ${JSON.stringify(result.body)}`);
  assert.equal(carried(await w.storage.getDbConnection(ACCOUNT, ENTRY)), w.sealedBefore, 'the slot is not the sealed value the other window wrote, byte for byte');
  assert.ok(onlyInTheHeldItem(w), 'the new value reached a keychain key other than the held item');
  const body = result.body as { rotated?: unknown; stored?: unknown; message?: unknown };
  assert.deepEqual([result.status, body.rotated, body.stored], [200, true, 'quarantined']);
  assert.match(String(body.message), /kept on the person's machine, outside the entry, until they next enter its PIN/);
  assert.ok(!JSON.stringify(result.body).includes(NEW_SECRET), 'the agent was handed the new value');
  assert.equal(journalWord(w, result), 'rotated, quarantined');
  assert.deepEqual(await w.storage.heldRotations.listed(), [{ accountId: ACCOUNT, entityId: ENTRY }], 'the index does not name the entry — the tree and the sweep cannot see it');
  assert.match(w.s.modals[0] ?? '', /being kept on this machine, outside the entry, until its PIN is entered/);
  modal.close('Later');
});

test('a held rotation that echoes its new value — the agent never reads it', async () => {
  const w = await world([], [], { echo: true });

  const answer = await delivered(w);

  assert.match(answer, /"stored":"quarantined"/);
  assert.ok(!answer.includes(NEW_SECRET), `the agent was handed the new value: ${answer}`);
});

test('a second refused rotation of the same slot — the hold keeps the later value, the one the far side holds', async () => {
  const w = await world([], []);
  await w.rotate();

  const second = await w.store('dbConnection', 'mysql://app:SECOND-rotation-9d1e@db-01.example.internal:3306/orders');

  assert.equal(second, 'quarantined');
  assert.match((await heldConnection(w)) ?? '', /SECOND-rotation-9d1e/, 'the hold kept the older value — the next PIN would store a password the far side no longer accepts');
});

test('a refused rotation, then one that lands in the unprotected entry — the older hold is gone, so no door overwrites the newer value with it', async () => {
  const w = await world([], []);
  await w.rotate();
  await unprotectEntity(w.storage, ACCOUNT, ENTRY, PIN);
  await w.storage.updateNodeFields(ACCOUNT, ENTRY, protectionDecision(false));

  const later = await w.store('dbConnection', 'mysql://app:LANDED-rotation-3c5a@db-01.example.internal:3306/orders');

  assert.equal(later, 'stored');
  assert.equal(await heldConnection(w), undefined, 'the older hold survived a newer value landing in the entry');
  assert.deepEqual(await w.storage.heldRotations.listed(), [], 'the index still names an entry with nothing held');
});

// ---- Q6: what the person is told at the rotation, and the clipboard as the last resort (plan §4.3, §4.7) ----

const HISTORY_WARNING = /A clipboard history \(Windows' Win\+V, a clipboard manager, a remote-desktop clipboard\) keeps its own copy: the automatic clear empties the clipboard, not that history\. Paste it into the entry now, then delete it from the history\./;

test('the modal at a hold says the value is kept on this machine until the PIN, and offers the door or later — never a copy', async () => {
  const w = await world([], ['Later']);

  await w.rotate();

  assert.match(w.s.modals[0] ?? '', /WAS changed on the far side\. "orders-db" was protected with a PIN while that ran, so the new connection string is being kept on this machine, outside the entry, until its PIN is entered — then it is stored, sealed\. Until then the entry still holds the old connection string, which no longer works\./);
  assert.deepEqual(w.s.modalButtons[0], ['Store it now (asks for the PIN)', 'Later']);
  assert.deepEqual(w.s.clipboard, [], 'the value reached the clipboard though it is safe on this machine');
});

test('the last-resort copy offer says what a clipboard history does — and nothing is copied without the button', async () => {
  const w = await world([], [undefined, undefined], { hold: 'fails' });

  await w.rotate();

  assert.match(w.s.modals[1] ?? '', HISTORY_WARNING, 'the copy offer does not warn about clipboard history');
  assert.deepEqual(w.s.clipboard, [], 'the new value was copied without the person pressing the button');
});

test('after the copy, the message says it again: the automatic clear does not empty a clipboard history', async () => {
  const w = await world([], [undefined, COPY_IT], { hold: 'fails' });

  await w.rotate();

  assert.equal(w.s.clipboard.length, 1);
  assert.match(w.s.infos.join('\n'), HISTORY_WARNING, 'the post-copy message does not warn about clipboard history');
});

// ---- security review, finding 4: a rotation that throws, and a history that cannot be written ----

test('the far side changed and the call then THREW with the statement in its message — the agent and the journal never read the new value', async () => {
  const w = await world([], ['Later'], { ends: 'throws' });

  const answer = await delivered(w);

  assert.match(answer, /failed/, 'the setup: the call did not fail');
  assert.ok(!answer.includes(NEW_SECRET), `the new value went out in a failure's reason: ${answer}`);
});

test('the history write fails after the far side changed — the new value is still held, and the agent is told the previous value was not kept', async () => {
  const w = await world([], ['Later'], { history: 'fails' });

  const result = await w.rotate();

  assert.equal(result.status, 200, `the new value was lost to a history failure: ${JSON.stringify(result.body)}`);
  assert.ok(await holdsTheNewValue(w), 'the far side has the new password and this machine holds it nowhere');
  const body = result.body as { stored?: unknown; historyKept?: unknown; message?: unknown };
  assert.deepEqual([body.stored, body.historyKept], ['quarantined', false]);
  assert.match(String(body.message), /previous value could not be kept in the entry's history/);
});

// ---- security review, finding 5: a value the person stored under the PIN supersedes an older hold ----

const OLDER_HELD = 'mysql://app:OLDER-hold-2c9e@db-01.example.internal:3306/orders';

/** The keychain refuses the NEXT hold write only — the rotation's own; every write after it lands. */
function refuseNextHold(storage: StorageManager): void {
  const store = storage.heldRotations;
  let refused = false;
  const put: QuarantineStore['put'] = (accountId, entityId, slots) => {
    if (refused) {
      return store.put(accountId, entityId, slots);
    }
    refused = true;
    return Promise.reject(new Error('the keychain refused the write'));
  };
  Object.defineProperty(storage, 'heldRotations', { value: { ...store, put } });
}

test('the hold failed and the person stored the new value under the PIN — an OLDER hold of that slot is gone, so no door can put it back over the new value', async () => {
  // An older hold of a value the slot no longer holds: the door the person passes asks about it (dismissed) rather than releasing it.
  const w = await world([PIN], [STORE_IT, undefined]);
  await w.storage.heldRotations.list(ACCOUNT, ENTRY);
  await w.storage.heldRotations.put(ACCOUNT, ENTRY, { dbConnection: { value: stored(OLDER_HELD), at: 1, was: fingerprintOf('a value from before this entry was last changed') } });
  refuseNextHold(w.storage);

  const result = await w.rotate();

  assert.ok((await openedConnection(w))?.includes(NEW_SECRET) === true, `the setup: the person did not store the new value — ${JSON.stringify(result.body)}`);
  assert.equal(await heldConnection(w), undefined, 'the older hold survived — "Store the rotated one" at the next door would put back a password the far side no longer accepts');
  assert.deepEqual(await w.storage.heldRotations.listed(), [], 'the index still names an entry with nothing held');
});

// ---- security review, finding 7c: a one-use entry is burned right after the answer — a hold would go with it ----

test('a ONE-USE entry protected while the far side changed: the person is handed the value BEFORE the answer, because the burn that follows the answer takes the entry — and would take a hold with it', async () => {
  const w = await world([], [undefined, COPY_IT], { oneUse: true });

  const answer = await delivered(w);

  assert.equal(w.storage.getNode(ACCOUNT, ENTRY), undefined, 'the setup: the one-use entry was not burned after the answer');
  assert.equal(w.s.clipboard.filter((value) => value.includes(NEW_SECRET)).length, 1, `the new value was burned with the one-use entry — the person was never handed it; the agent got ${answer}`);
  assert.match(w.s.modals[0] ?? '', /so nothing automatic may store the new connection string/, 'the person saw the "kept on this machine" notice for a value the burn was about to take');
  assert.match(answer, /"stored":false/);
  assert.ok(!answer.includes(NEW_SECRET), `the agent was handed the new value: ${answer}`);
});
