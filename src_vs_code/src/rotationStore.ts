import * as vscode from 'vscode';
import { describeError } from './describeError';
import { NOTHING_OPENED } from './editPrefill';
import { EntryWriter, UnattendedRefusal, writeUnattended, writerFor } from './entryWriter';
import { admitEntry } from './pinPrompt';
import { RotationNotStored, StoreOutcome } from './rotateAction';
import { holdRotated, supersedeHeld } from './rotationQuarantine';
import { sealingForUpdate } from './sealingAtWrite';
import { copiedMessage, copySecret } from './secretClipboard';
import type { RotationSlot } from './secretRotation';
import { updateDoors } from './shareUpdateSeal';
import type { StorageManager } from './storageManager';
import type { UseActionContext } from './useActions';

/**
 * The rotation's store — and what happens when it cannot store (the E2 security review, finding 1; the
 * code round's findings 5 and 14; `todo/PLAN_rotation_quarantine.md` §4.3).
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
 *       (`rotateAction.RotationNotStored`), never the value.</li>
 * </ol>
 *
 * <p>No lease is held across any modal or the PIN box: the hold takes it for its one step, the plain writer
 * per write, and the sealing writer only to commit.</p>
 */
export async function storeRotated(storage: StorageManager, ctx: UseActionContext, slot: RotationSlot, value: string, was: string): Promise<StoreOutcome> {
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
  readonly was: string;
}

function writeSlot(writer: EntryWriter, ctx: UseActionContext, slot: RotationSlot, value: string): Promise<void> {
  return slot === 'password' ? writer.setPassword(ctx.accountId, ctx.entityId, value) : writer.setDbConnection(ctx.accountId, ctx.entityId, value);
}

/** Held beside the entry, and the person told without being waited for — or, when even that failed, handed to them. */
async function heldOrHanded(storage: StorageManager, ctx: UseActionContext, refused: Refused, error: unknown): Promise<StoreOutcome> {
  const held = await holdRotated(storage, ctx.accountId, ctx.entityId, refused.slot, refused.value, refused.was).then(
    () => true,
    () => false,
  );
  if (!held) {
    await handedToPerson(storage, ctx, refused.slot, refused.value, error);
    return 'stored';
  }
  void waitingNotice(storage, ctx, refused.slot).catch(() => undefined);
  return 'quarantined';
}

const STORE_NOW = 'Store it now (asks for the PIN)';
const LATER = 'Later';

/**
 * The modal at a hold — shown, never awaited by the rotation: the value is safe, and a modal left open must
 * not hold a broker call open for minutes. *Store it now* is the entry's own door; there is no copy button,
 * because the value is safe and after the PIN the entry's own *Copy* exists.
 */
async function waitingNotice(storage: StorageManager, ctx: UseActionContext, slot: RotationSlot): Promise<void> {
  const answer = await vscode.window.showWarningMessage(keptWaiting(ctx.entityName, slot), { modal: true }, STORE_NOW, LATER);
  if (answer === STORE_NOW) {
    await admitEntry(storage, ctx.accountId, ctx.entityId, ctx.entityName, `store the new ${what(slot)}`);
  }
}

function keptWaiting(name: string, slot: RotationSlot): string {
  return (
    `The ${what(slot)} of "${name}" WAS changed on the far side. "${name}" was protected with a PIN while that ran, so the new `
    + `${what(slot)} is being kept on this machine, outside the entry, until its PIN is entered — then it is stored, sealed. `
    + `Until then the entry still holds the old ${what(slot)}, which no longer works.`
  );
}

/** Stored under the entry's PIN with the person's help — or offered to them to copy, and `RotationNotStored`. */
async function handedToPerson(storage: StorageManager, ctx: UseActionContext, slot: RotationSlot, value: string, error: unknown): Promise<void> {
  const why = error instanceof UnattendedRefusal ? await storedUnderPin(storage, ctx, slot, value) : describeError(error);
  if (why === STORED) {
    return;
  }
  await offerCopy(ctx, slot, value, why);
  throw new RotationNotStored();
}

const STORED = '';
const STORE_IT = 'Store it (asks for the entry’s PIN)';

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
  return writeSlot(writerFor(storage, ctx.accountId, ctx.entityId, sealing, NOTHING_OPENED), ctx, slot, value).then(
    () => STORED,
    (failed: unknown) => describeError(failed),
  );
}

const DECLINED = 'declined';

/** The last offer: the value to the person's clipboard (cleared on its own), never to anything else. */
async function offerCopy(ctx: UseActionContext, slot: RotationSlot, value: string, why: string): Promise<void> {
  const copy = `Copy the new ${what(slot)}`;
  const answer = await vscode.window.showWarningMessage(notStored(ctx.entityName, slot, why), { modal: true }, copy);
  if (answer === copy) {
    await copySecret(vscode.env.clipboard, value);
    void vscode.window.showInformationMessage(`${copiedMessage(`The new ${what(slot)} of "${ctx.entityName}"`)} ${CLIPBOARD_HISTORY}`);
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
