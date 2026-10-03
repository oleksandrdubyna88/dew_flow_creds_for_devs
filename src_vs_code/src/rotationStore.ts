import * as vscode from 'vscode';
import { burnedByAgentUse } from './burnOnUse';
import { describeError } from './describeError';
import { NOTHING_OPENED } from './editPrefill';
import { EntryWriter, UnattendedRefusal, writeUnattended, writerFor } from './entryWriter';
import { admitEntry } from './pinPrompt';
import { RotationNotStored, StoreOutcome } from './rotateAction';
import { Fingerprint, holdRotated, supersedeHeld } from './rotationQuarantine';
import { sealingForUpdate } from './sealingAtWrite';
import { copiedMessage, copySecret } from './secretClipboard';
import type { RotationSlot } from './secretRotation';
import { updateDoors } from './shareUpdateSeal';
import type { StorageManager } from './storageManager';
import type { UseActionContext } from './useActions';

/**
 * The rotation's store — and what happens when it cannot store (the E2 security review, finding 1; the
 * code round's findings 5 and 14; `research/PLAN_rotation_quarantine.md` §4.3).
 *
 * <p>A rotation changes the far side FIRST, then the vault. The store is unattended
 * (`entryWriter.writeUnattended`): nothing automatic holds a PIN, so an entry protected while the
 * statement ran — another window, a sync — refuses it. Before E2 the value was written in the clear and
 * the door healed it later; E2 refused it and handed the value to a modal, so the ONLY copy of a password
 * the far side already accepted lived in process memory until a person answered — and the last resort was
 * the clipboard, which a clipboard history keeps. A person who was away lost access.</p>
 *
 * <p>So the value is never dropped once the far side has changed, and never waits on a person:</p>
 *
 * <ol>
 *   <li><b>stored</b> — the unattended write landed; any older hold of that slot is superseded
 *       (`supersedeHeld`), because the far side holds the newer value;</li>
 *   <li><b>quarantined</b> — refused, or failed for any other reason: the value is HELD beside the entry,
 *       outside its slots (`rotationQuarantine.holdRotated`), and the next time the entry's PIN is entered
 *       the door seals it in (`pinAdmission.admit`). The agent is answered at once; the person is told by a
 *       modal nobody waits for, with <i>Store it now</i> — that same door — and <i>Later</i>;</li>
 *   <li><b>handed to the person</b> — only when even the hold failed, so the value exists in memory alone:
 *       E2's chain, awaited — <i>Store it (asks for the entry's PIN)</i>, sealed by the sealing writer, and
 *       declined or failed, the copy offer, through `copySecret`. The agent hears `stored: false`
 *       (`rotateAction.RotationNotStored`), never the value;</li>
 *   <li><b>copied, for a ONE-USE entry</b> — the broker burns such an entry as soon as this call is answered,
 *       so a hold would burn unread and a value stored under the PIN would burn with the entry: the only road
 *       that keeps the far side's new value is the person's own copy, offered before the answer and awaited
 *       (`copiedBeforeTheBurn`). The agent hears `stored: false`.</li>
 * </ol>
 *
 * <p>No lease is held across any modal or the PIN box: the hold takes it for its one step, the plain writer
 * per write, and the sealing writer only to commit.</p>
 */
export async function storeRotated(storage: StorageManager, ctx: UseActionContext, slot: RotationSlot, value: string, was: Fingerprint): Promise<StoreOutcome> {
  try {
    await writeUnattended(storage, ctx.accountId, { id: ctx.entityId, name: ctx.entityName }, (writer) => writeSlot(writer, ctx, slot, value));
  } catch (error) {
    return heldOrHanded(storage, ctx, { slot, value, was }, error);
  }
  await supersedeHeld(storage, ctx.accountId, ctx.entityId, slot);
  return 'stored';
}

/** The value a refused store keeps: its slot, its stored form, and the fingerprint of what it replaced. */
interface Refused {
  readonly slot: RotationSlot;
  readonly value: string;
  readonly was: Fingerprint;
}

function writeSlot(writer: EntryWriter, ctx: UseActionContext, slot: RotationSlot, value: string): Promise<void> {
  return slot === 'password' ? writer.setPassword(ctx.accountId, ctx.entityId, value) : writer.setDbConnection(ctx.accountId, ctx.entityId, value);
}

/** Held beside the entry, and the person told without being waited for — or, when even that failed, handed to them. */
async function heldOrHanded(storage: StorageManager, ctx: UseActionContext, refused: Refused, error: unknown): Promise<StoreOutcome> {
  if (burnedByAgentUse(storage.getNode(ctx.accountId, ctx.entityId))) {
    return copiedBeforeTheBurn(ctx, refused, error);
  }
  const held = await holdRotated(storage, ctx.accountId, ctx.entityId, refused.slot, refused.value, refused.was).then(
    () => true,
    () => false,
  );
  if (!held) {
    await handedToPerson(storage, ctx, refused.slot, refused.value, error);
    // Stored under the PIN by the person: an older hold of that slot is superseded, as a landed store's is
    // (the security review, finding 5) — kept, its *Store the rotated one* would put back the older value.
    await supersedeHeld(storage, ctx.accountId, ctx.entityId, refused.slot);
    return 'stored';
  }
  void waitingNotice(storage, ctx, refused.slot, error).catch(() => undefined);
  return 'quarantined';
}

/**
 * A ONE-USE entry (the security review, finding 7c): the broker burns it as soon as this call is answered
 * (`burnOnUse.burnedByAgentUse`, the burn's own predicate), so a hold beside it would burn unread, and a
 * value stored under the PIN would burn with the entry — <i>Store it</i> was a trap. The only road that keeps
 * the far side's new value is the person's own copy: offered BEFORE the answer, awaited, with the three facts
 * said plainly — the far side changed, the entry burns after this answer, the value is stored nowhere — and
 * the clipboard-history warning. Nothing is copied without the button; the agent hears `stored: false`.
 */
async function copiedBeforeTheBurn(ctx: UseActionContext, refused: Refused, error: unknown): Promise<never> {
  await offerCopy(ctx, refused.slot, refused.value, burnsWithThisAnswer(ctx.entityName, refused.slot, error));
  throw new RotationNotStored();
}

/**
 * Why the store did not happen, as this road says it: the PIN only when the PIN was the reason
 * (`UnattendedRefusal`) — a keychain failure is named as itself (the final security review, fix 4).
 */
function whyNotStored(name: string, slot: RotationSlot, error: unknown): string {
  return error instanceof UnattendedRefusal
    ? `"${name}" was protected with a PIN while that ran — so nothing automatic may store the new ${what(slot)}`
    : `storing the new ${what(slot)} failed (${describeError(error)})`;
}

function burnsWithThisAnswer(name: string, slot: RotationSlot, error: unknown): string {
  return (
    `The ${what(slot)} of "${name}" WAS changed on the far side, and ${whyNotStored(name, slot, error)}. `
    + `And "${name}" is one-use: it burns as soon as this agent call is answered, `
    + `so the new ${what(slot)} cannot be kept in it or beside it. It is stored nowhere, and the old one no longer works: `
    + `copy it now and keep it yourself. ${CLIPBOARD_HISTORY}`
  );
}

const STORE_NOW = 'Store it now (asks for the PIN)';
const STORE_NOW_PLAIN = 'Store it now';
const LATER = 'Later';

/**
 * The modal at a hold — shown, never awaited by the rotation: the value is safe, and a modal left open must
 * not hold a broker call open for minutes. *Store it now* is the entry's own door; there is no copy button,
 * because the value is safe and after the PIN the entry's own *Copy* exists.
 *
 * <p>It says the store's own reason (`whyNotStored`): the PIN only when the PIN refused it. A hold after any
 * other failure — a keychain error on an entry with no PIN — is stored the next time the entry is used (a click
 * takes the door, an agent's use releases first) or by the sweep within a minute, and *Store it now* asks for
 * nothing there: the door of an unprotected entry releases without a box (`PLAN_waiting_rotation_visible.md` W3).</p>
 */
async function waitingNotice(storage: StorageManager, ctx: UseActionContext, slot: RotationSlot, error: unknown): Promise<void> {
  const storeNow = error instanceof UnattendedRefusal ? STORE_NOW : STORE_NOW_PLAIN;
  const answer = await vscode.window.showWarningMessage(keptWaiting(ctx.entityName, slot, error), { modal: true }, storeNow, LATER);
  if (answer === storeNow) {
    await admitEntry(storage, ctx.accountId, ctx.entityId, ctx.entityName, `store the new ${what(slot)}`);
  }
}

function keptWaiting(name: string, slot: RotationSlot, error: unknown): string {
  return error instanceof UnattendedRefusal ? keptForThePin(name, slot) : keptForTheNextUse(name, slot, error);
}

/** Held after a failure that was not the PIN: named as itself, and when the value goes in. */
function keptForTheNextUse(name: string, slot: RotationSlot, error: unknown): string {
  return (
    `The ${what(slot)} of "${name}" WAS changed on the far side, and ${whyNotStored(name, slot, error)}. The new ${what(slot)} `
    + `is being kept on this machine, outside the entry. It is stored the next time you use "${name}", or within a minute. `
    + `Until then the entry still holds the old ${what(slot)}, which no longer works.`
  );
}

function keptForThePin(name: string, slot: RotationSlot): string {
  return (
    `The ${what(slot)} of "${name}" WAS changed on the far side. "${name}" was protected with a PIN while that ran, so the new `
    + `${what(slot)} is being kept on this machine, outside the entry, until its PIN is entered — then it is stored, sealed. `
    + `Until then the entry still holds the old ${what(slot)}, which no longer works.`
  );
}

/** Stored under the entry's PIN with the person's help — or offered to them to copy, and `RotationNotStored`. */
async function handedToPerson(storage: StorageManager, ctx: UseActionContext, slot: RotationSlot, value: string, error: unknown): Promise<void> {
  const why = error instanceof UnattendedRefusal ? await storedUnderPinOrWhyNot(storage, ctx, slot, value) : describeError(error);
  if (why === STORED) {
    return;
  }
  await offerCopy(ctx, slot, value, notStored(ctx.entityName, slot, why));
  throw new RotationNotStored();
}

const STORED = '';
const STORE_IT = 'Store it (asks for the entry’s PIN)';

/**
 * The PIN road, whatever it does — ANY throw on it (the door, `sealingForUpdate`, the sealing writer) is a
 * reason, never an exit: the value exists in memory alone here, so every road out of it leads to the copy
 * (the final security review, fix 3 — only the write itself was caught, and a door that threw lost the value).
 */
function storedUnderPinOrWhyNot(storage: StorageManager, ctx: UseActionContext, slot: RotationSlot, value: string): Promise<string> {
  return storedUnderPin(storage, ctx, slot, value).catch((failed: unknown) => describeError(failed));
}

/** `STORED` when the value went in sealed; otherwise why not — `'declined'` when the person said no. */
async function storedUnderPin(storage: StorageManager, ctx: UseActionContext, slot: RotationSlot, value: string): Promise<string> {
  const answer = await vscode.window.showWarningMessage(protectedMeanwhile(ctx.entityName, slot), { modal: true }, STORE_IT);
  if (answer !== STORE_IT) {
    return DECLINED;
  }
  const entry = { id: ctx.entityId, name: ctx.entityName, parentId: storage.getNode(ctx.accountId, ctx.entityId)?.parentId };
  const sealing = await sealingForUpdate(storage, ctx.accountId, ctx.entityId, true, updateDoors(storage, ctx.accountId, entry, 'store the new value'));
  if (sealing.kind === 'stopped') {
    return DECLINED;
  }
  await writeSlot(writerFor(storage, ctx.accountId, ctx.entityId, sealing, NOTHING_OPENED), ctx, slot, value);
  return STORED;
}

const DECLINED = 'declined';

/** The last offer: the value to the person's clipboard (cleared on its own), never to anything else. `text` says why it came to this. */
async function offerCopy(ctx: UseActionContext, slot: RotationSlot, value: string, text: string): Promise<void> {
  const copy = `Copy the new ${what(slot)}`;
  const answer = await vscode.window.showWarningMessage(text, { modal: true }, copy);
  if (answer === copy) {
    await copySecret(vscode.env.clipboard, value);
    const copied = copiedMessage(`The new ${what(slot)} of "${ctx.entityName}"`);
    void vscode.window.showInformationMessage(`${copied} ${CLIPBOARD_HISTORY}`);
  }
}

function what(slot: RotationSlot): string {
  return slot === 'password' ? 'password' : 'connection string';
}

function protectedMeanwhile(name: string, slot: RotationSlot): string {
  return (
    `The ${what(slot)} of "${name}" WAS changed on the far side, and "${name}" was protected with a PIN while that ran — `
    + `so nothing automatic may store the new ${what(slot)}. Store it now, sealed under the entry's PIN? `
    + `If it is not stored, the vault keeps the old ${what(slot)}, which no longer works.`
  );
}

function notStored(name: string, slot: RotationSlot, why: string): string {
  const reason = why === DECLINED ? '' : ` (${why})`;
  return (
    `The ${what(slot)} of "${name}" was changed on the far side and was NOT stored in the vault${reason}. `
    + `The old one no longer works and the new one exists nowhere else: copy it now and put it into the entry yourself. `
    + CLIPBOARD_HISTORY
  );
}

/**
 * What a clipboard history does, said plainly (plan §4.7, the owner's decision). `vscode.env.clipboard` takes
 * plain text only, so the extension cannot mark the content as excluded from a history; this sentence is the
 * whole mitigation, and it says so rather than implying more.
 */
export const CLIPBOARD_HISTORY =
  'A clipboard history (Windows\' Win+V, a clipboard manager, a remote-desktop clipboard) keeps its own copy: the automatic clear '
  + 'empties the clipboard, not that history. Paste it into the entry now, then delete it from the history.';
