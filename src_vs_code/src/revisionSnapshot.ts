import { SECRET_SLOTS, SlotSource } from './entitySlots';
import { Revision, RevisionSecrets } from './revisionHistory';
import { EntityMetadata } from './types';

/**
 * The state of an entity, captured as a `Revision` the moment before it is replaced
 * (audit 2026-08-25, A1). Two paths overwrite entities — an edit, and an accepted
 * same-sender share update — and each carried its own copy of this five-secret read;
 * a secret added to one and forgotten in the other would silently fall out of history.
 */
/**
 * Just the reads this needs — so a test does not have to build a `StorageManager`.
 *
 * <p>The narrow-interface shape `maskEntries.ts` and `mcpEntries.ts` already use next door, taken
 * here for the reason they give: a module that asks for the whole storage manager is a module whose
 * test has to cast something to it, and a cast is exactly what stopped the compiler naming the
 * reader a new secret kind had forgotten. It is the slot table's own `SlotSource` — the getters the
 * table's `read` column calls — since the snapshot walks that table instead of ten hand-written reads.</p>
 */
export type RevisionSource = SlotSource;

export async function snapshotForRevision(
  storage: RevisionSource,
  accountId: string,
  entity: { id: string; name: string; details: EntityMetadata },
): Promise<Revision> {
  const at = Date.now();
  return { at, name: entity.name, details: entity.details, secrets: await slotValues(storage, accountId, entity.id) };
}

/**
 * Every slot's stored value, under the field a revision keeps it — the table walked, one read per
 * slot, in order. An absent value is kept as an `undefined` field, as the hand-written reads did.
 */
async function slotValues(storage: RevisionSource, accountId: string, entityId: string): Promise<RevisionSecrets> {
  const secrets: RevisionSecrets = {};
  for (const slot of SECRET_SLOTS) {
    secrets[slot.revisionField] = await slot.read(storage, accountId, entityId);
  }
  return secrets;
}
