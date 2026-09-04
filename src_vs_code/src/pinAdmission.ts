import { PinGate, PinOpen, openStored } from './pinGate';
import { SECRET_SLOTS } from './entitySlots';
import { StorageManager } from './storageManager';
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
    return { kind: 'in' };
  }
  return decided(await openStored(locked, gate));
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
  return readSecret(stored).kind === 'locked' ? valueOfOpen(await openStored(stored, gate)) : stored;
}

function valueOfOpen(opened: PinOpen): string | undefined {
  return opened.kind === 'value' ? opened.value : undefined;
}
