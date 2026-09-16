import { Revision } from './revisionHistory';
import type { StorageManager } from './storageManager';
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
 * reader a new secret kind had forgotten. `Pick` rather than a hand-written list, so these
 * signatures cannot drift from the manager's own.</p>
 */
export type RevisionSource = Pick<
  StorageManager,
  | 'getPassword'
  | 'getPrivateKey'
  | 'getVpnConfig'
  | 'getDbConnection'
  | 'getNotes'
  | 'getTotp'
  | 'getConfigBody'
  | 'getFieldsRaw'
  | 'getPaymentRaw'
  | 'getSecondRaw'
>;

export async function snapshotForRevision(
  storage: RevisionSource,
  accountId: string,
  entity: { id: string; name: string; details: EntityMetadata },
): Promise<Revision> {
  return {
    at: Date.now(),
    name: entity.name,
    details: entity.details,
    secrets: {
      password: await storage.getPassword(accountId, entity.id),
      privateKey: await storage.getPrivateKey(accountId, entity.id),
      vpnConfig: await storage.getVpnConfig(accountId, entity.id),
      dbConnection: await storage.getDbConnection(accountId, entity.id),
      notes: await storage.getNotes(accountId, entity.id),
      totp: await storage.getTotp(accountId, entity.id),
      config: await storage.getConfigBody(accountId, entity.id),
      fields: await storage.getFieldsRaw(accountId, entity.id),
      payment: await storage.getPaymentRaw(accountId, entity.id),
      second: await storage.getSecondRaw(accountId, entity.id),
    },
  };
}
