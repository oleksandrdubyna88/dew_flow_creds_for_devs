import type { StorageManager } from './storageManager';
import type { EntityFormValues } from './entityFormPanel';

/**
 * Every secret the form can set, cleared or written from its values — one place for the create path
 * and the edit path, so a secret kind added to the form reaches storage from both.
 *
 * <h3>Two passes, on opposite sides of the node write</h3>
 *
 * <p>This was one function, and the plan gate found why it cannot be. The invariant the storage layer
 * protects is that **an orphaned secret is the only torn state allowed to exist** — bytes no node
 * references are invisible and harmless, while a node claiming a record that is not there is visible,
 * broken, and it SYNCS. That gives opposite orders for the two halves of a save:</p>
 *
 * <ul>
 *   <li><b>Adding</b> a secret: write the SECRET first, then the node. A crash between them leaves an
 *       orphan.</li>
 *   <li><b>Removing</b> one: write the NODE first, then delete the secret. A crash between them leaves
 *       an orphan too — reversed, it leaves a node still claiming a value that is already gone.</li>
 * </ul>
 *
 * <p>One save does both: the form's `clearX` checkboxes are removals and its filled fields are
 * additions, so a single ordered call cannot be right for both. Hence `applyAdditions` and
 * `applyRemovals`, and callers put the node write between them.</p>
 *
 * <p>`setNotes`, `setFields`, `setConfigBody` and `setPayment` are in the ADDITIONS pass even though
 * each deletes when handed nothing. That is deliberate and worth stating: what they delete is decided
 * by the form having scrubbed the OTHER kinds' fields for this kind, so the node being written
 * afterwards already agrees with them. Moving them to the removals pass would leave a window in which
 * the node claims a note the keychain no longer has.</p>
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

/** Everything a save WRITES — before the node, so the node never claims what is not there yet. */
export async function applyAdditions(
  storage: StorageManager,
  accountId: string,
  entityId: string,
  result: EntityFormValues,
): Promise<void> {
  if (!result.clearPassword) {
    await storage.setPassword(accountId, entityId, result.newPassword);
  }
  await applyOptional(false, result.newPrivateKey, noop, (v) => storage.setPrivateKey(accountId, entityId, v));
  await applyOptional(false, result.newVpnConfig, noop, (v) => storage.setVpnConfig(accountId, entityId, v));
  await applyOptional(false, result.newDbConnection, noop, (v) => storage.setDbConnection(accountId, entityId, v));
  await storage.setNotes(accountId, entityId, result.newNotes);
  await storage.setFields(accountId, entityId, result.newFields);
  // `undefined` for every kind that is not a config, which DELETES — deliberately, and the same
  // scrubbing the form does to every other kind's fields when the type changes. An entity turned
  // from a config into something else must not keep a config body nothing can reach or edit.
  await storage.setConfigBody(accountId, entityId, result.newConfigBody);
  await applyOptional(false, result.newAttachment, noop, (v) => storage.setAttachment(accountId, entityId, v));
  await applyOptional(false, result.newImage, noop, (v) => storage.setImage(accountId, entityId, v));
  // The form already canonicalised the seed (`toValues`), so this is a store, not a parse.
  await applyOptional(false, result.newTotp, noop, (v) => storage.setTotp(accountId, entityId, v));
}

/** Everything a save DELETES — after the node, so no node outlives a value it still claims. */
export async function applyRemovals(
  storage: StorageManager,
  accountId: string,
  entityId: string,
  result: EntityFormValues,
): Promise<void> {
  if (result.clearPassword) {
    await storage.deletePassword(accountId, entityId);
  }
  await applyOptional(result.clearPrivateKey, undefined, () => storage.deletePrivateKey(accountId, entityId), noopSet);
  await applyOptional(result.clearVpnConfig, undefined, () => storage.deleteVpnConfig(accountId, entityId), noopSet);
  await applyOptional(result.clearDbConnection, undefined, () => storage.deleteDbConnection(accountId, entityId), noopSet);
  await applyOptional(result.clearAttachment, undefined, () => storage.setAttachment(accountId, entityId, undefined), noopSet);
  await applyOptional(result.clearImage, undefined, () => storage.setImage(accountId, entityId, undefined), noopSet);
  await applyOptional(result.clearTotp, undefined, () => storage.deleteTotp(accountId, entityId), noopSet);
}

function noop(): Promise<void> {
  return Promise.resolve();
}

function noopSet(_value: string): Promise<void> {
  return Promise.resolve();
}

/**
 * Both passes with NO node write between them — for the one caller that has no node to write.
 *
 * <p>Kept so a caller that genuinely does not order a node against these (a test, or a path that has
 * already written its node) does not have to know about the split. Anything that DOES write a node
 * must call the two halves around it instead; `entityWriteOrder.test.ts` is what holds that.</p>
 */
export async function applySecrets(
  storage: StorageManager,
  accountId: string,
  entityId: string,
  result: EntityFormValues,
): Promise<void> {
  await applyAdditions(storage, accountId, entityId, result);
  await applyRemovals(storage, accountId, entityId, result);
}
