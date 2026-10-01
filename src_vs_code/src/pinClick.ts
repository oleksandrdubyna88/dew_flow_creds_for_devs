import * as vscode from 'vscode';
import type { SecretSlot } from './entitySlots';
import { PinOpen, openStored, silentPinGate } from './pinGate';
import { admitEntry } from './pinPrompt';
import { OpenedSecret, SecretOpener, SecretOwner } from './secretOpener';
import { isLockedSecret } from './secretEnvelope';
import type { StorageManager } from './storageManager';

/**
 * A value somebody CLICKED for — opened through the entry's door first (entry-PIN plan, rule R1).
 *
 * <p>Every click command that hands a stored value to a sink — the clipboard, a file, a terminal, the
 * database extension, the SSH agent — read the raw getter until 1.12, so a protected entry handed the
 * sink `{"v":1,"lock":…}` (D6). This is the one line each of them now reads through: the door asks
 * the PIN once when the entry has one (and names what OK will do), the value is opened with the grant
 * the door left, and anything that stops it is SAID here — so a caller only has to return.</p>
 *
 * <p><b>At most one box.</b> The value is opened behind the door with a SILENT gate: a value sealed
 * under a different PIN than the one the door took is refused in words rather than answered with a
 * second box the person cannot tell from the first.</p>
 *
 * <p>An entry with no mark and a value that is not sealed skips the door: there is nothing to ask
 * about, and the door would read every slot of the entry to find that out.</p>
 */

/** How a slot is read — `SecretSlot.read`'s shape, so a row of the slot table can be passed as it is. */
export type SlotRead = SecretSlot['read'];

/** Read one slot of `owner` and open it for the click that asked, with `purpose` in the box. */
export async function clickedSecret(
  storage: StorageManager,
  accountId: string,
  owner: SecretOwner,
  read: SlotRead,
  purpose: string,
): Promise<OpenedSecret> {
  return clickOpener(storage, accountId, purpose)(owner, await read(storage, accountId, owner.id));
}

/** The same, as an opener — for a path that resolves WHICH entry owns the value itself (an SSH key). */
export function clickOpener(storage: StorageManager, accountId: string, purpose: string): SecretOpener {
  const behindTheDoor = grantedOpener(accountId);
  return async (owner, stored) => {
    if (needsDoor(owner, stored) && (await admitEntry(storage, accountId, owner.id, owner.name, purpose)) === undefined) {
      return STOPPED;
    }
    return behindTheDoor(owner, stored);
  };
}

/**
 * The second half of `clickOpener` alone: a value opened with the grant a door ALREADY left, through a
 * SILENT gate — never a box — and every stop said. For a value read right after a click admitted its
 * entry, where a second `admitEntry` would be a second question about an entry the person answered a
 * moment ago: *Show Config Changes* opens the kept body with the grant the live body's click left
 * (`PLAN_typed_stored_secrets.md` §2.3, second plan round, finding 0 — no reader of a kept version
 * reaches for `clickOpener`).
 */
export function grantedOpener(accountId: string): SecretOpener {
  return async (owner, stored) => told(await openStored(stored, silentPinGate(accountId, owner.id, owner.name)), owner);
}

/** Said already, or declined: the caller has nothing left to say. */
const STOPPED: OpenedSecret = { kind: 'stopped', reason: '' };

function needsDoor(owner: SecretOwner, stored: string | undefined): boolean {
  return owner.pinProtected === true || isLockedSecret(stored);
}

/** The value — or nothing, and nothing only after the reason has been put in front of somebody. */
function told(opened: PinOpen, owner: SecretOwner): OpenedSecret {
  if (opened.kind === 'value' || opened.kind === 'unprotected') {
    return { kind: 'open', value: opened.value, protectedEntry: wasProtected(opened, owner) };
  }
  void vscode.window.showWarningMessage(opened.kind === 'cancelled' ? differentPin(owner.name) : opened.reason);
  return STOPPED;
}

/** The value was sealed, or its entry claims a PIN — either way a copy of it is outside the PIN. */
function wasProtected(opened: PinOpen, owner: SecretOwner): boolean {
  return opened.kind === 'value' || owner.pinProtected === true;
}

/** A silent gate answers `cancelled` only when the PIN the door took does not open this value. */
function differentPin(name: string): string {
  return `This value of "${name}" is sealed under a different PIN than the one that opened the entry. Nothing was done with it.`;
}

/**
 * The sentence a file written from a protected value carries: the PIN guards the vault's copy, and
 * the file is a second copy it cannot guard. `''` for an entry that is not protected.
 */
export function outsidePinNote(opened: { readonly protectedEntry: boolean }): string {
  return opened.protectedEntry ? OUTSIDE_PIN : '';
}

const OUTSIDE_PIN = ' The file is outside the PIN: anyone who can read it has the value.';
