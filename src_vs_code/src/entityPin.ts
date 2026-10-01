import { SECRET_SLOTS, SecretSlot } from './entitySlots';
import { OpenedHistory, firstSealedKept, openHistory, rewriteHistory } from './historyPin';
import { SiblingTry, attemptAcross, attemptUnlock, cooldownMs, coolingReason, retryGranted } from './pinAttempts';
import { sealValue } from './sealValue';
import { StorageManager } from './storageManager';
import { SecretEnvelope, SecretRead, plainSecret, readSecret } from './secretEnvelope';
import { StoredSecret, stored } from './storedSecret';

export { sealValue };

/**
 * Putting one entry's secrets under a PIN, and taking them back out.
 *
 * <p>Every slot the entry has is read, wrapped under a fresh data key that is itself wrapped under
 * the PIN, and written back. `secretEnvelope` does the cryptography; this decides WHICH values and
 * in what order, and what happens when the process does not survive to the end.</p>
 *
 * <h3>Idempotent and self-describing, not atomic</h3>
 *
 * <p>Three reviewers said the same thing about the plan and were right: `SecretStorage` has no
 * transaction, so a process killed between two slot writes leaves an entry with some slots wrapped
 * and some not, and holding the values in memory before writing them does not change that by one
 * line. Claiming otherwise would have been a promise the storage cannot keep.</p>
 *
 * <p>What makes it survivable is that <b>the mark is inside each value</b>. A half-protected entry
 * is not a state nothing can describe — it is an entry whose password is locked and whose notes are
 * not, and `readSecret` says exactly that, per slot, to anyone who asks. So:</p>
 *
 * <ul>
 *   <li><b>`protect` skips slots that are already locked</b> and locks the rest. Running it again
 *       finishes an interrupted run: there is nothing to resume because re-running IS the resume,
 *       and it needs no progress marker that could go stale.</li>
 *   <li><b>`unprotect` is the mirror</b>, skipping what is already plain.</li>
 *   <li><b>A wrong PIN fails before any write.</b> On the way out it is checked against the first
 *       locked slot, so "wrong PIN, half the entry re-wrapped" cannot happen.</li>
 *   <li><b>The password goes last</b> on the way in — see `entitySlots.ts`.</li>
 * </ul>
 *
 * <p>Pure of `vscode`: the storage arrives as an argument, so every path here is a unit test.</p>
 */

/** What a run did, in the words a person is told it in. */
export interface PinRunResult {
  /** The slots this run changed, by label. */
  readonly changed: readonly string[];
  /** The slots it left alone because they were already in the wanted state. */
  readonly skipped: readonly string[];
}

/**
 * Wrap every unwrapped slot of one entry under `pin`.
 *
 * <p>Slots that are already locked are left exactly as they are — including ones locked under a
 * DIFFERENT PIN, which this cannot open and must not silently replace.</p>
 */
export async function protectEntity(
  storage: StorageManager,
  accountId: string,
  entityId: string,
  pin: string,
): Promise<PinRunResult> {
  // Exported and pure, so the input box's validator is not a guarantee about this function — and a
  // reviewer named the shape the failure would take: the entry locks under nothing, and every later
  // attempt to open it is answered "that PIN does not open this entry", which is true and useless.
  if (pin.trim().length === 0) {
    throw new Error('An empty PIN cannot protect anything; nothing was changed.');
  }
  const changed: string[] = [];
  const skipped: string[] = [];
  for (const slot of SECRET_SLOTS) {
    await lockOne(storage, accountId, entityId, slot, pin, changed, skipped);
  }
  return { changed, skipped };
}

/**
 * One slot: read, sealed, written — the write atomic with respect to the storage's cross-window lease
 * (the E2 security review, finding 3). Without it, a plain write that landed while this was sealing was
 * overwritten with seal(the value read before it): the new value lost, and the plain writer's re-check
 * guarding nothing, because Protect wrote around the lease it re-checks under.
 *
 * <p>The lease is kept SHORT: the seal — a scrypt of about a second — is made OUTSIDE it, optimistically;
 * inside it the slot is read again and the seal written only if the value is still the one it seals.
 * Never across a PIN box: the PIN arrives already chosen.</p>
 */
async function lockOne(
  storage: StorageManager,
  accountId: string,
  entityId: string,
  slot: SecretSlot,
  pin: string,
  changed: string[],
  skipped: string[],
): Promise<void> {
  const stored = await slot.read(storage, accountId, entityId);
  const read = readSecret(stored);
  if (stored === undefined || read.kind !== 'value') {
    // `absent` is nothing to wrap; `locked` is already done; `corrupt` is the one state a write
    // must never touch — overwriting damaged ciphertext destroys the only copy of the evidence.
    noteSkip(read.kind, slot, skipped);
    return;
  }
  const sealed = await sealValue(stored, accountId, pin);
  const kind = await storage.writes.run(() => sealIfStill(storage, accountId, entityId, slot, pin, { was: stored, sealed }));
  noteRun(kind, slot, changed, skipped);
}

/**
 * Under the lease: the slot read again. Still the value the seal was made from → the seal is written.
 * A plain write landed meanwhile → THAT value is sealed and written, here, inside the lease — one more
 * scrypt, held for about a second, on a path two windows have to collide to reach; a retry loop outside
 * would release the lease between attempts and could be overtaken again for ever, where this ends in one
 * step. Sealed, emptied or damaged meanwhile → nothing to wrap, nothing written. Answers what the slot
 * held when it was decided, as `readSecret` names it.
 */
async function sealIfStill(
  storage: StorageManager,
  accountId: string,
  entityId: string,
  slot: SecretSlot,
  pin: string,
  made: { readonly was: StoredSecret; readonly sealed: StoredSecret },
): Promise<string> {
  const now = await slot.read(storage, accountId, entityId);
  const read = readSecret(now);
  if (now === undefined || read.kind !== 'value') {
    return read.kind;
  }
  await slot.store(storage, accountId, entityId, now === made.was ? made.sealed : await sealValue(now, accountId, pin));
  return 'value';
}

/** A slot this run sealed is changed; any other that held something was skipped. */
function noteRun(kind: string, slot: SecretSlot, changed: string[], skipped: string[]): void {
  if (kind === 'value') {
    changed.push(slot.label);
  } else {
    noteSkip(kind, slot, skipped);
  }
}

/** Only a slot that HELD something is worth telling somebody about. */
function noteSkip(kind: string, slot: SecretSlot, skipped: string[]): void {
  if (kind !== 'absent') {
    skipped.push(slot.label);
  }
}

/**
 * A value the PIN cannot open because its wrap is DAMAGED — thrown by `unprotectEntity` before
 * anything is written (D14). Taking the PIN off would leave it unreadable while the entry stopped
 * claiming a PIN; the person decides, and `keepDamaged` is the answer that goes ahead.
 */
export class DamagedSlots extends Error {
  constructor(readonly labels: readonly string[]) {
    super(`${labels.join(', ')} ${labels.length === 1 ? 'is' : 'are'} damaged and cannot be opened.`);
    this.name = 'DamagedSlots';
  }
}

/** What *Remove PIN Protection…* did, beyond the live slots it unwrapped. */
export interface UnprotectResult extends PinRunResult {
  /** Live slots left exactly as they were because their wrap is damaged (`keepDamaged`). */
  readonly damaged: readonly string[];
  /** Kept-version values under a DIFFERENT PIN — left sealed, counted so the person is told. */
  readonly foreignKept: number;
}

/**
 * Take every wrapped slot back out, given the PIN — and the entry's kept versions with it (§5.7).
 *
 * <p>In this order, and every step before the first write: the PIN is checked against the first
 * locked value (a live one, or a kept one when the live entry holds none — plan gate, finding 3); every
 * live slot AND every kept value is opened in memory; a damaged live slot refuses the whole run with
 * `DamagedSlots` unless `keepDamaged` says to go ahead without it. Only then are the live slots
 * written — each with `plainSecret(value, woven)`, so a woven password comes back woven (D13) — and
 * then the history, with the list as it is at write time.</p>
 */
export async function unprotectEntity(
  storage: StorageManager,
  accountId: string,
  entityId: string,
  pin: string,
  options: { readonly keepDamaged?: boolean } = {},
): Promise<UnprotectResult> {
  const live = await openedSlots(storage, accountId, entityId, pin);
  const kept = await openedKeptVersions(storage, accountId, entityId, pin, live.opened.length > 0);
  refuseDamaged(live.damaged, options.keepDamaged === true);
  const changed: string[] = [];
  for (const [slot, value] of live.opened) {
    await slot.store(storage, accountId, entityId, value);
    changed.push(slot.label);
  }
  await rewriteHistory(storage, accountId, entityId, kept.rewrite);
  return { changed, skipped: [], damaged: live.damaged, foreignKept: kept.foreign };
}

function refuseDamaged(damaged: readonly string[], keepDamaged: boolean): void {
  if (damaged.length > 0 && !keepDamaged) {
    throw new DamagedSlots(damaged);
  }
}

/** The live slots, opened into the form an unprotected value is stored in, and the damaged ones by label. */
interface OpenedSlots {
  readonly opened: readonly (readonly [SecretSlot, StoredSecret])[];
  readonly damaged: readonly string[];
}

/**
 * Every locked slot, opened — read and unwrapped in full BEFORE the first write.
 *
 * <p>This is where the wrong-PIN check lives: the first locked slot is a GUESS until it opens and is
 * counted (`attemptUnlock`); once it has, the same PIN tried on the rest is not a guess
 * (`retryGranted`), so a value under a second PIN costs a refusal, not a cooldown. A slot that will not
 * open throws, and nothing has been written yet. The values are held in a list rather than written as
 * they come, because an unprotect that half-succeeded would leave an entry whose PIN opens some of
 * it.</p>
 */
async function openedSlots(storage: StorageManager, accountId: string, entityId: string, pin: string): Promise<OpenedSlots> {
  refuseWhileCooling(accountId, entityId);
  const reads = await Promise.all(SECRET_SLOTS.map(async (slot) => [slot, readSecret(await slot.read(storage, accountId, entityId))] as const));
  const locked = reads.filter(([, read]) => read.kind === 'locked');
  const opened: [SecretSlot, StoredSecret][] = [];
  for (const [at, [slot, read]] of locked.entries()) {
    const unlock = at === 0 ? attemptUnlock : retryGranted;
    opened.push([slot, await openedOrThrow(read, (envelope) => unlock(envelope, accountId, entityId, pin))]);
  }
  return { opened, damaged: reads.filter(([, read]) => read.kind === 'corrupt').map(([slot]) => slot.label) };
}

function refuseWhileCooling(accountId: string, entityId: string): void {
  const cooling = cooldownMs(accountId, entityId, Date.now());
  if (cooling > 0) {
    throw new Error(coolingReason(cooling));
  }
}

/**
 * The choke point's answer, as the throw this module's callers report — in the form an unprotected
 * value is stored in, so the woven mark the lock kept survives the unwrap (D13). The sentence here is
 * what `pinCommands.removeOne` puts after <i>That PIN does not open</i>.
 */
async function openedOrThrow(read: SecretRead, unlock: (envelope: SecretEnvelope) => Promise<string | undefined>): Promise<StoredSecret> {
  const value = read.kind === 'locked' ? await unlock(read.envelope) : undefined;
  if (value === undefined) {
    throw new Error('The PIN was refused.');
  }
  return stored(plainSecret(value, read.kind === 'locked' && read.woven));
}

/**
 * The kept versions, opened in memory with the PIN. When no LIVE slot was locked there was nothing to
 * check the PIN against yet, so the first sealed kept value is that check — counted as a guess.
 */
async function openedKeptVersions(
  storage: StorageManager,
  accountId: string,
  entityId: string,
  pin: string,
  checked: boolean,
): Promise<OpenedHistory> {
  const kept = await storage.getHistory(accountId, entityId);
  if (!checked) {
    await checkOnKept(kept, accountId, entityId, pin);
  }
  return openHistory(kept, accountId, entityId, pin);
}

async function checkOnKept(kept: Awaited<ReturnType<StorageManager['getHistory']>>, accountId: string, entityId: string, pin: string): Promise<void> {
  const first = firstSealedKept(kept);
  if (first !== undefined) {
    await openedOrThrow(first, (envelope) => attemptUnlock(envelope, accountId, entityId, pin));
  }
}

/** What one entry's slots hold, counted by what `readSecret` says each one is. */
export interface SlotCount {
  /** Slots sealed under a PIN. */
  readonly locked: number;
  /** Slots that hold anything at all — sealed, in the clear, or damaged. */
  readonly total: number;
  /**
   * Slots holding a value IN THE CLEAR — the 0.99.0 false mark's evidence (`pinAdmission`). An entry
   * that claims a PIN over a value like this is wrong about itself; one that claims it over NOTHING is
   * an entry protected while empty, and its mark is the only record of that choice.
   */
  readonly plain: number;
}

/** How much of this entry is locked — the number a person is shown, and the interrupted-run signal. */
export async function lockedSlotCount(storage: StorageManager, accountId: string, entityId: string): Promise<SlotCount> {
  const stored = await Promise.all(SECRET_SLOTS.map((slot) => slot.read(storage, accountId, entityId)));
  const kinds = stored.map((raw) => readSecret(raw).kind);
  return {
    locked: kinds.filter((kind) => kind === 'locked').length,
    total: kinds.filter((kind) => kind !== 'absent').length,
    plain: kinds.filter((kind) => kind === 'value').length,
  };
}

/** Whether this entry is protected at all — one locked slot is enough to have to ask. */
export async function isProtected(
  storage: StorageManager,
  accountId: string,
  entityId: string,
): Promise<boolean> {
  return (await lockedSlotCount(storage, accountId, entityId)).locked > 0;
}

/**
 * Whether EVERY sealed value of this entry opens with `pin` — the check a Protect run makes after
 * `protectEntity`, which leaves a value sealed under another PIN exactly as it is.
 *
 * <p>Protect checks for an existing PIN before its two PIN boxes, and another window can protect the
 * same entry under a different PIN while they are open (review of 2026-09-30). Without this the run
 * then wrote the mark, counted a second protection decision and said the entry was protected with the
 * PIN just typed — which opens none of it. Tried as a grant (`retryGranted`): the person chose this
 * PIN a moment ago, so a value it does not open is a fact about that value, never a wrong guess that
 * cools the entry down. The values are tried in parallel, each a scrypt of about a second.</p>
 */
export async function opensEverySealed(storage: StorageManager, accountId: string, entityId: string, pin: string): Promise<boolean> {
  const reads = await Promise.all(SECRET_SLOTS.map(async (slot) => readSecret(await slot.read(storage, accountId, entityId))));
  const sealed = reads.flatMap((read) => (read.kind === 'locked' ? [read.envelope] : []));
  const opened = await Promise.all(sealed.map((envelope) => retryGranted(envelope, accountId, entityId, pin)));
  return opened.every((value) => value !== undefined);
}

/**
 * How many of these entries this PIN opens — the question the folder's "use the PIN a sibling already
 * uses" boxes are answered with (Protect Folder, Add in a protected folder).
 *
 * <p>One slot per entry, and nothing thrown: a wrong PIN is an answer here, not a failure. Through
 * `pinAttempts.attemptAcross`, so the count follows D16 (§5.10): a PIN that opens NONE of them is one
 * wrong attempt on each, one that opens SOME charges nobody (a folder may hold two PINs), and a
 * cooling entry opens for nobody. An entry with no locked value opens nothing and is not tried.</p>
 */
export async function siblingsOpened(
  storage: StorageManager,
  accountId: string,
  entityIds: readonly string[],
  pin: string,
): Promise<number> {
  const tries: SiblingTry[] = [];
  for (const entityId of entityIds) {
    const envelope = await firstEnvelope(storage, accountId, entityId);
    if (envelope !== undefined) {
      tries.push({ entityId, envelope });
    }
  }
  return attemptAcross(tries, accountId, pin);
}

/** The first locked value of an entry, as its envelope — what a PIN is tried on. */
async function firstEnvelope(storage: StorageManager, accountId: string, entityId: string): Promise<SecretEnvelope | undefined> {
  for (const slot of SECRET_SLOTS) {
    const read = readSecret(await slot.read(storage, accountId, entityId));
    if (read.kind === 'locked') {
      return read.envelope;
    }
  }
  return undefined;
}
