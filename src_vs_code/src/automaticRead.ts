import { beforeTheDoor, isWaiting, releaseBeforeAutomaticUse } from './rotationQuarantine';
import { SecretOpener, automaticOpener } from './secretOpener';
import type { RotationSlot } from './secretRotation';
import type { StorageManager } from './storageManager';
import type { StoredSecret } from './storedSecret';

/**
 * The automatic opener, for a reader that holds the storage — the ONE way an automatic read of a stored value is
 * opened (`PLAN_waiting_rotation_visible.md` W5, as the code round of 2026-10-03 asked: by construction, not at each
 * caller). An agent's query, exec and ssh login, an environment binding, a `creds://` reference, a config body, a
 * deploy key and the SSH agent's startup sweep all open through it.
 *
 * <p>Before the decision `secretOpener.automaticOpener` makes — sealed or claiming a PIN → refused with the sentence,
 * damaged → refused as damaged — a rotated value waiting beside an UNPROTECTED owner goes in, unattended
 * (`rotationQuarantine.releaseBeforeAutomaticUse`), and a value the reader read before it is read again: the value it
 * holds is the one the release replaced (`beforeTheDoor`, the click's own re-read). An owner the index does not
 * list costs one memento read and nothing else; a marked or sealed one is left to the person's door; a conflict
 * writes nothing and the reader opens what is stored. Never a PIN, never a modal — pure of `vscode`.</p>
 *
 * <p>The bare `automaticOpener` is named nowhere else in the product: a reader that opened with it would hand an
 * agent the value a rotation replaced, and `waitingRotationVisible.test.ts` fails on any such use.</p>
 */
export function automaticOpenerFor(storage: StorageManager, accountId: string): SecretOpener {
  return async (owner, stored, slot) => automaticOpener(owner, await releasedFirst(storage, accountId, owner.id, stored, slot), slot);
}

/** `stored`, or — when a waiting value went in over it — what the slot holds now. */
async function releasedFirst(storage: StorageManager, accountId: string, entityId: string, stored: StoredSecret | undefined, slot: RotationSlot | undefined): Promise<StoredSecret | undefined> {
  if (!(await isWaiting(storage, accountId, entityId).catch(() => false))) {
    return stored;
  }
  const reread = await beforeTheDoor(storage, accountId, entityId);
  return reread(stored, await releaseBeforeAutomaticUse(storage, accountId, entityId), slot);
}
