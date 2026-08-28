import type { StorageManager } from './storageManager';
import type { EntityFormValues } from './entityFormPanel';

/**
 * Every secret the form can set, cleared or written from its values — one place for the create
 * path and the edit path, so a secret kind added to the form reaches storage from both.
 */
/** Clear, or set when a value came, or leave alone — the shape every optional secret shares. */
async function applyOptional(
  clear: boolean | undefined,
  value: string | undefined,
  remove: () => Promise<void>,
  set: (value: string) => Promise<void>,
): Promise<void> {
  if (clear) {
    await remove();
  } else if (value !== undefined) {
    await set(value);
  }
}

export async function applySecrets(
  storage: StorageManager,
  accountId: string,
  entityId: string,
  result: EntityFormValues,
): Promise<void> {
  if (result.clearPassword) {
    await storage.deletePassword(accountId, entityId);
  } else {
    await storage.setPassword(accountId, entityId, result.newPassword);
  }
  await applyOptional(result.clearPrivateKey, result.newPrivateKey, () => storage.deletePrivateKey(accountId, entityId), (v) => storage.setPrivateKey(accountId, entityId, v));
  await applyOptional(result.clearVpnConfig, result.newVpnConfig, () => storage.deleteVpnConfig(accountId, entityId), (v) => storage.setVpnConfig(accountId, entityId, v));
  await applyOptional(result.clearDbConnection, result.newDbConnection, () => storage.deleteDbConnection(accountId, entityId), (v) => storage.setDbConnection(accountId, entityId, v));
  await storage.setNotes(accountId, entityId, result.newNotes);
  await storage.setFields(accountId, entityId, result.newFields);
  // `undefined` for every kind that is not a config, which DELETES — deliberately, and the same
  // scrubbing the form does to every other kind's fields when the type changes. An entity turned
  // from a config into something else must not keep a config body nothing can reach or edit.
  await storage.setConfigBody(accountId, entityId, result.newConfigBody);
  await applyOptional(result.clearAttachment, result.newAttachment, () => storage.setAttachment(accountId, entityId, undefined), (v) => storage.setAttachment(accountId, entityId, v));
  await applyOptional(result.clearImage, result.newImage, () => storage.setImage(accountId, entityId, undefined), (v) => storage.setImage(accountId, entityId, v));
  // The form already canonicalised the seed (`toValues`), so this is a store, not a parse.
  await applyOptional(result.clearTotp, result.newTotp, () => storage.deleteTotp(accountId, entityId), (v) => storage.setTotp(accountId, entityId, v));
}
