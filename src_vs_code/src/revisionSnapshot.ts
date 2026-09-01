import { Revision } from './revisionHistory';
import type { StorageManager } from './storageManager';
import { EntityMetadata } from './types';

/**
 * The state of an entity, captured as a `Revision` the moment before it is replaced
 * (audit 2026-08-25, A1). Two paths overwrite entities — an edit, and an accepted
 * same-sender share update — and each carried its own copy of this five-secret read;
 * a secret added to one and forgotten in the other would silently fall out of history.
 */
export async function snapshotForRevision(
  storage: StorageManager,
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
    },
  };
}
