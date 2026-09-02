import { Revision, isRevisionList, pushRevision } from './revisionHistory';
import { SecretChest } from './secretMaps';
import { historySecretKey } from './secretKeys';

/**
 * The kept previous versions of an entity — read and written, and nothing else.
 *
 * <p>In `SecretStorage` rather than plaintext metadata because a revision holds the old password:
 * replaced is not the same as harmless. Local to this machine — it is not in the sync bundle, so a
 * second machine has its own history and one that never saw the change has none, which is honest
 * rather than invented.</p>
 *
 * <p>Its own module since S1.4, for the reason the `storageManager.ts` header names: the next feature
 * that needs room there should take a concern out rather than grow the file. This one leaves cleanly —
 * it touches the keychain and nothing else about a profile.</p>
 */
export async function readHistory(chest: SecretChest, accountId: string, entityId: string): Promise<Revision[]> {
  const raw = await chest.get(historySecretKey(accountId, entityId));
  if (raw === undefined) {
    return [];
  }
  return parseHistory(raw);
}

function parseHistory(raw: string): Revision[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRevisionList(parsed) ? parsed : [];
  } catch {
    return []; // A corrupt history is no history; it is never the only copy of anything.
  }
}

/** Record the CURRENT state as a revision, before it is overwritten. */
export async function writeRevision(
  chest: SecretChest,
  accountId: string,
  entityId: string,
  revision: Revision,
): Promise<void> {
  const next = pushRevision(await readHistory(chest, accountId, entityId), revision);
  await chest.store(historySecretKey(accountId, entityId), JSON.stringify(next));
}
