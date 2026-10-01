import * as vscode from 'vscode';
import { describeError } from './describeError';
import { NOTHING_OPENED } from './editPrefill';
import { EntryWriter, UnattendedRefusal, writeUnattended, writerFor } from './entryWriter';
import { RotationNotStored } from './rotateAction';
import { sealingForUpdate } from './sealingAtWrite';
import { copiedMessage, copySecret } from './secretClipboard';
import type { RotationSlot } from './secretRotation';
import { updateDoors } from './shareUpdateSeal';
import type { StorageManager } from './storageManager';
import type { UseActionContext } from './useActions';

/**
 * The rotation's store — and what happens when it cannot store (the E2 security review, finding 1; the
 * code round's findings 5 and 14).
 *
 * <p>A rotation changes the far side FIRST, then the vault. The store is unattended
 * (`entryWriter.writeUnattended`): nothing automatic holds a PIN, so an entry protected while the
 * statement ran — another window, a sync — refuses it. Before E2 the value was written in the clear and
 * the door healed it later; E2 refused it, and the refusal DROPPED the value: the server accepted a
 * password the vault never received, the vault kept the dead one, and the agent heard of an internal
 * failure. A lockout made out of a protection.</p>
 *
 * <p>So the value is never dropped once the far side has changed. A refusal hands it to the PERSON:</p>
 *
 * <ol>
 *   <li>a modal says the password WAS changed and the entry was protected meanwhile, and offers
 *       <i>Store it (asks for the entry's PIN)</i> — the entry's own door (`sealingForUpdate` with the
 *       live door and the first-PIN road, `shareUpdateSeal.updateDoors`), a `sealed` proof, and the
 *       sealing writer from `writerFor`: the value is sealed in memory before its write (R3);</li>
 *   <li>declined, or the PIN box dismissed or refused, or the write failing: a modal that says plainly the
 *       far side changed and the value was NOT stored, offering <i>Copy the new password</i> to the
 *       person only — through `copySecret`, so the clipboard clears itself;</li>
 *   <li>the agent's answer says `stored: false` (`rotateAction.RotationNotStored`), never the value.</li>
 * </ol>
 *
 * <p>A store that failed for any OTHER reason — the keychain refusing a write — goes to step 2 with its
 * reason: the far side changed all the same. No lease is held across either modal or the PIN box: the
 * plain writer takes its lease per write, and the sealing writer takes none.</p>
 */
export async function storeRotated(storage: StorageManager, ctx: UseActionContext, slot: RotationSlot, value: string): Promise<void> {
  try {
    await writeUnattended(storage, ctx.accountId, { id: ctx.entityId, name: ctx.entityName }, (writer) => writeSlot(writer, ctx, slot, value));
  } catch (error) {
    await handedToPerson(storage, ctx, slot, value, error);
  }
}

function writeSlot(writer: EntryWriter, ctx: UseActionContext, slot: RotationSlot, value: string): Promise<void> {
  return slot === 'password' ? writer.setPassword(ctx.accountId, ctx.entityId, value) : writer.setDbConnection(ctx.accountId, ctx.entityId, value);
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
    void vscode.window.showInformationMessage(copiedMessage(`The new ${what(slot)} of "${ctx.entityName}"`));
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
    + `The old one no longer works and the new one exists nowhere else: copy it now and put it into the entry yourself.`
  );
}
