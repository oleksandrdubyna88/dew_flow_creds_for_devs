import { SECRET_SLOTS, SecretSlot } from './entitySlots';
import { attemptUnlock, cooldownMs, coolingReason } from './pinAttempts';
import { StorageManager } from './storageManager';
import { SecretEnvelope, isLockedSecret, lockSecret, readSecret } from './secretEnvelope';

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
  await slot.write(storage, accountId, entityId, await sealValue(stored, accountId, pin));
  changed.push(slot.label);
}

/** Only a slot that HELD something is worth telling somebody about. */
function noteSkip(kind: string, slot: SecretSlot, skipped: string[]): void {
  if (kind !== 'absent') {
    skipped.push(slot.label);
  }
}

/**
 * One value about to be WRITTEN into a protected entry, sealed under its PIN.
 *
 * <p>Extracted from `lockOne` so that every writer into a protected entry — Edit, a restore, a share
 * update, the history rewrite — seals exactly the way Protect does, in memory and BEFORE its raw
 * setter runs (entry-PIN plan, rule R3). One place for the woven mark, one place for idempotence:</p>
 *
 * <ul>
 *   <li>a plain string, and a plain envelope carrying the woven mark, both come out locked with
 *       the mark kept;</li>
 *   <li>a value that is already locked is returned untouched — a second wrap under the same PIN
 *       would need the first opened, and re-running being the resume is what `protectEntity`
 *       promises;</li>
 *   <li>envelope-shaped text that does not parse is sealed as the text it is. `readSecret` calls
 *       that `corrupt` when it is STORED, because a stored one is a damaged write; here it is what
 *       somebody typed, and a save must not refuse a note for looking like a wrap.</li>
 * </ul>
 */
export async function sealValue(value: string, accountId: string, pin: string): Promise<string> {
  const read = readSecret(value);
  if (read.kind === 'locked') {
    return value;
  }
  return read.kind === 'value'
    ? lockSecret(read.value, accountId, pin, read.woven)
    : lockSecret(value, accountId, pin, false);
}

/**
 * Take every wrapped slot back out, given the PIN.
 *
 * <p>Throws if the PIN does not open the FIRST locked slot, before anything is written — so a wrong
 * PIN costs a message rather than half an entry.</p>
 */
export async function unprotectEntity(
  storage: StorageManager,
  accountId: string,
  entityId: string,
  pin: string,
): Promise<PinRunResult> {
  const opened = await openedSlots(storage, accountId, entityId, pin);
  const changed: string[] = [];
  for (const [slot, value] of opened) {
    await slot.write(storage, accountId, entityId, value);
    changed.push(slot.label);
  }
  return { changed, skipped: [] };
}

/**
 * Every locked slot, opened — read and unwrapped in full BEFORE the first write.
 *
 * <p>This is where the wrong-PIN check lives: the first slot that will not open throws, and nothing
 * has been written yet. It is also why the values are held in a list rather than written as they
 * come: an unprotect that half-succeeded would leave an entry whose PIN opens some of it.</p>
 */
async function openedSlots(
  storage: StorageManager,
  accountId: string,
  entityId: string,
  pin: string,
): Promise<[SecretSlot, string][]> {
  const cooling = cooldownMs(accountId, entityId, Date.now());
  if (cooling > 0) {
    throw new Error(coolingReason(cooling));
  }
  const opened: [SecretSlot, string][] = [];
  for (const slot of SECRET_SLOTS) {
    const read = readSecret(await slot.read(storage, accountId, entityId));
    if (read.kind === 'locked') {
      opened.push([slot, await openedOrThrow(read.envelope, accountId, entityId, pin)]);
    }
  }
  return opened;
}

/**
 * The choke point's answer, as the throw this module's callers report. `attemptUnlock` counts the
 * miss; the sentence here is what `pinCommands.removeOne` puts after <i>That PIN does not open</i>.
 */
async function openedOrThrow(envelope: SecretEnvelope, accountId: string, entityId: string, pin: string): Promise<string> {
  const value = await attemptUnlock(envelope, accountId, entityId, pin);
  if (value === undefined) {
    throw new Error('The PIN was refused.');
  }
  return value;
}

/** How much of this entry is locked — the number a person is shown, and the interrupted-run signal. */
export async function lockedSlotCount(
  storage: StorageManager,
  accountId: string,
  entityId: string,
): Promise<{ readonly locked: number; readonly total: number }> {
  let locked = 0;
  let total = 0;
  for (const slot of SECRET_SLOTS) {
    const stored = await slot.read(storage, accountId, entityId);
    total += stored === undefined ? 0 : 1;
    locked += isLockedSecret(stored) ? 1 : 0;
  }
  return { locked, total };
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
 * Does this PIN open that entry?
 *
 * <p>The question the folder's "use the PIN a sibling already uses" box is answered with. It opens
 * ONE slot and throws nothing: a wrong PIN is an answer here, not a failure.</p>
 */
export async function pinOpens(
  storage: StorageManager,
  accountId: string,
  entityId: string,
  pin: string,
): Promise<boolean> {
  for (const slot of SECRET_SLOTS) {
    const read = readSecret(await slot.read(storage, accountId, entityId));
    if (read.kind === 'locked') {
      // Through the choke point, so a sibling check that opens none of N protected siblings counts
      // one wrong attempt on each of them (D16) — and a cooling sibling opens for nobody.
      return (await attemptUnlock(read.envelope, accountId, entityId, pin)) !== undefined;
    }
  }
  return false;
}
