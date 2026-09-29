import { protectEntity } from './entityPin';
import { PinGate, PinOpen, openStored } from './pinGate';
import { grantedPin } from './pinSession';
import { SECRET_SLOTS } from './entitySlots';
import { StorageManager } from './storageManager';
import { EntityMetadata } from './types';
import { isLockedSecret, readSecret } from './secretEnvelope';

/**
 * Being let into a protected entry — once, at the door, rather than field by field.
 *
 * <p>The viewer reads several values EAGERLY as it builds its page: the notes, the login and URL,
 * the config body, the connection string. Gating each of those separately would ask for the PIN
 * four times to open one entry, and — worse — a value that was not gated would reach the page as
 * envelope JSON, which is the one failure the whole classification exists to prevent.</p>
 *
 * <p>So the ask happens at the door. `admit` finds the first locked slot, opens it, and the PIN
 * that worked goes into this window's session; every read afterwards finds it there and asks
 * nothing. Declining means the entry does not open at all, which is the honest outcome — a viewer
 * showing an entry with every field empty would be a worse answer than not opening.</p>
 *
 * <p>Pure of `vscode`: the prompt and the reporting arrive as functions.</p>
 */

/** What the door said. Only `in` opens anything. */
export type Admission =
  | { readonly kind: 'in' }
  | { readonly kind: 'declined' }
  | { readonly kind: 'refused'; readonly reason: string };

/**
 * Ask for this entry's PIN if it has one, and remember what worked.
 *
 * <p>An unprotected entry is admitted without a question — there is nothing to ask about.</p>
 */
export async function admit(
  storage: StorageManager,
  accountId: string,
  entityId: string,
  gate: PinGate,
): Promise<Admission> {
  const locked = await firstLockedStored(storage, accountId, entityId);
  if (locked === undefined) {
    await repairFalseMark(storage, accountId, entityId);
    return { kind: 'in' };
  }
  const admission = decided(await openStored(locked, gate));
  if (admission.kind === 'in') {
    await healProtected(storage, accountId, entityId);
  }
  return admission;
}

/**
 * The door has just opened a LOCKED entry, with its PIN in this window's session — the moment two
 * drifts can be put right at no cost to anybody (R5, R3):
 *
 * <ul>
 *   <li><b>the mark is restored</b> when it is missing — the mirror of `repairFalseMark`. An Edit
 *       before 1.12 dropped it (D3) and a sync can take the unmarked side (D12); left alone, the row
 *       offers only *Protect…* (D15) and agents see the entry again. Not a protection DECISION, so it
 *       counts as none;</li>
 *   <li><b>a value found in the clear is sealed</b> by `protectEntity` — written by an older build,
 *       or arriving from another machine. `protectEntity` seals exactly the plain values and writes
 *       nothing when there are none.</li>
 * </ul>
 *
 * <p>Both best-effort, as `clearMark` is: a repair on the way into an entry must never become a
 * failure to open it, and the next door tries again.</p>
 */
async function healProtected(storage: StorageManager, accountId: string, entityId: string): Promise<void> {
  await restoreMark(storage, accountId, entityId);
  const pin = grantedPin(accountId, entityId);
  if (pin !== undefined) {
    await protectEntity(storage, accountId, entityId, pin).catch(() => undefined);
  }
}

/** Locked values and no mark: the mark goes back (best-effort, through the same write as `clearMark`). */
async function restoreMark(storage: StorageManager, accountId: string, entityId: string): Promise<void> {
  if (storage.getNode(accountId, entityId)?.details?.pinProtected !== true) {
    await clearMark(storage, accountId, entityId, { pinProtected: true });
  }
}

function decided(opened: PinOpen): Admission {
  if (opened.kind === 'value' || opened.kind === 'unprotected') {
    return { kind: 'in' };
  }
  return opened.kind === 'cancelled' ? { kind: 'declined' } : { kind: 'refused', reason: opened.reason };
}

/**
 * The stored string of the first slot that is locked, or nothing.
 *
 * <p>Any locked slot answers the question "does this entry have a PIN, and does yours open it" —
 * they were all wrapped under the same one by `protectEntity`. An entry left half-protected by an
 * interrupted run still answers correctly, because the check is "is there a lock here", not "are
 * they all locked".</p>
 */
export async function firstLockedStored(
  storage: StorageManager,
  accountId: string,
  entityId: string,
): Promise<string | undefined> {
  for (const slot of SECRET_SLOTS) {
    const stored = await slot.read(storage, accountId, entityId);
    if (isLockedSecret(stored)) {
      return stored;
    }
  }
  return undefined;
}

/**
 * One eagerly-read value, opened with the PIN this window already holds.
 *
 * <p>Called only AFTER `admit` has returned `in`, so the grant is there and nothing is asked. It
 * still goes through `openStored` rather than unwrapping directly, because that is the one place
 * that knows what a corrupt envelope is and refuses to treat it as text.</p>
 */
export async function openedText(stored: string | undefined, gate: PinGate): Promise<string | undefined> {
  const read = readSecret(stored);
  if (read.kind === 'locked' || read.kind === 'corrupt') {
    // A reviewer's finding, and it was a real hole: only `locked` was special-cased, so envelope-
    // shaped text that will not PARSE fell through and was returned — putting `{"v":1,"lock":…}` in
    // the notes box, in the connection string the viewer shows, and into a share payload. The
    // envelope's contract separates "mine and damaged" from "not mine" precisely so that cannot
    // happen, and this is the caller that was ignoring it.
    return valueOfOpen(await openStored(stored, gate));
  }
  return stored;
}

function valueOfOpen(opened: PinOpen): string | undefined {
  return opened.kind === 'value' ? opened.value : undefined;
}

/**
 * An entry claiming a PIN over values that are not wrapped — the mark goes.
 *
 * <p>0.99.0 shipped a share that carried `pinProtected` while the sender had unwrapped every value
 * at share time, so anyone who accepted one before the fix has a copy in exactly this state. And
 * the state is self-diagnosing rather than ambiguous: the mark says the values are locked, and
 * `readSecret` says they are not. There is nothing to guess.
 *
 * <p>Repaired at the DOOR because the door already read every slot to decide whether to ask, so the
 * check costs nothing and the entry heals the first time somebody opens it. Left alone, it hides
 * from that person's agent surfaces and offers a Remove-PIN command that answers "is not
 * protected\" — a contradiction with no way out from inside the interface.</p>
 */
async function repairFalseMark(
  storage: StorageManager,
  accountId: string,
  entityId: string,
): Promise<void> {
  const node = storage.getNode(accountId, entityId);
  if (node?.details?.pinProtected !== true) {
    return;
  }
  await clearMark(storage, accountId, entityId, { pinProtected: undefined });
}

/**
 * The write, alone — best-effort, deliberately.
 *
 * <p>This is a repair on the way INTO an entry somebody asked to open, and a failed write must not
 * become a failure to open: the mark is wrong either way, and the next open tries again. (A
 * reviewer's finding — the throw would otherwise have propagated out of `admit`.)</p>
 */
async function clearMark(
  storage: StorageManager,
  accountId: string,
  entityId: string,
  fields: Partial<EntityMetadata>,
): Promise<void> {
  try {
    await storage.updateDetailsFields(accountId, entityId, fields);
  } catch {
    /* said above: the next open tries again */
  }
}
