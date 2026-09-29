import { EntityMetadata } from './types';
import { StorageManager } from './storageManager';
import { OpenedSecret, SecretOpener, automaticOpener } from './secretOpener';

/**
 * What an SSH connection should authenticate with, resolved from the vault.
 *
 * Extracted from `connectEntity` so the human Connect path and the agent
 * broker's exec path answer the question identically — two resolutions of
 * "which key, which password" is how the two paths would silently diverge.
 *
 * Resolution order mirrors the original exactly: a referenced key entity
 * wins over the entity's own settings; a key stored in the vault wins over
 * a key path on disk; a key path (even an empty one — historic data) wins
 * over a stored password; a password is used only when no key is configured.
 *
 * <p><b>Every value is opened by its OWNER</b> (entry-PIN plan, D6/D7). The two paths differ in
 * exactly one place, the opener: the person's Connect passes a click opener, which asks the PIN of
 * the entry that holds the value — the borrowed key entity, not the connection that was clicked —
 * and the agent's exec takes the default, `automaticOpener`, which refuses a protected value with the
 * sentence and never prompts. Until then both read the raw getter, so a protected key reached `ssh`
 * (and the disk) as its envelope.</p>
 */
export type SshCredentialSource =
  | { kind: 'storedKey'; keyEntityId: string; content: string; warning?: string }
  | { kind: 'keyPath'; path: string; warning?: string }
  | { kind: 'password'; password: string; warning?: string }
  | { kind: 'none'; warning?: string };

/**
 * The opener stopped the value: a click has said why already (or the person declined) and `reason`
 * is `''`; an automatic refusal carries its sentence. `ownerName` is the entry whose value it was.
 */
export interface SshCredentialStopped {
  readonly kind: 'stopped';
  readonly reason: string;
  readonly ownerName: string;
  readonly warning?: string;
}

export async function resolveSshCredential(
  storage: StorageManager,
  accountId: string,
  entity: EntityMetadata,
  open: SecretOpener = automaticOpener,
): Promise<SshCredentialSource | SshCredentialStopped> {
  const { keySource, warning } = keySourceOf(storage, accountId, entity);
  const storedKey = await storage.getPrivateKey(accountId, keySource.id);
  if (storedKey !== undefined) {
    return keyFrom(await open(keySource, storedKey), keySource, warning);
  }
  // `!== undefined` rather than truthiness: an empty stored path historically
  // meant "no -i flag, but still not the password branch", and changing that
  // here would change which prompt a user sees on Connect.
  if (keySource.sshKeyPath !== undefined) {
    return { kind: 'keyPath', path: keySource.sshKeyPath, warning };
  }
  return passwordOf(storage, accountId, entity, keySource, open, warning);
}

/** A referenced key entity wins over the entity's own settings — or the warning that it is gone. */
function keySourceOf(
  storage: StorageManager,
  accountId: string,
  entity: EntityMetadata,
): { keySource: EntityMetadata; warning: string | undefined } {
  if (entity.sshKeyEntityId === undefined) {
    return { keySource: entity, warning: undefined };
  }
  const ref = storage.getNode(accountId, entity.sshKeyEntityId)?.details;
  return ref !== undefined
    ? { keySource: ref, warning: undefined }
    : { keySource: entity, warning: `The key entity referenced by "${entity.name}" no longer exists — using its own key settings.` };
}

function keyFrom(opened: OpenedSecret, keySource: EntityMetadata, warning: string | undefined): SshCredentialSource | SshCredentialStopped {
  if (opened.kind === 'stopped') {
    return { kind: 'stopped', reason: opened.reason, ownerName: keySource.name, warning };
  }
  return opened.value === undefined
    ? { kind: 'none', warning }
    : { kind: 'storedKey', keyEntityId: keySource.id, content: opened.value, warning };
}

/** The key entity's password first, the entity's own as fallback — each opened by the entry it belongs to. */
async function passwordOf(
  storage: StorageManager,
  accountId: string,
  entity: EntityMetadata,
  keySource: EntityMetadata,
  open: SecretOpener,
  warning: string | undefined,
): Promise<SshCredentialSource | SshCredentialStopped> {
  const { owner, stored } = await passwordOwner(storage, accountId, entity, keySource);
  if (stored === undefined) {
    return { kind: 'none', warning };
  }
  const opened = await open(owner, stored);
  if (opened.kind === 'stopped') {
    return { kind: 'stopped', reason: opened.reason, ownerName: owner.name, warning };
  }
  return opened.value === undefined ? { kind: 'none', warning } : { kind: 'password', password: opened.value, warning };
}

async function passwordOwner(
  storage: StorageManager,
  accountId: string,
  entity: EntityMetadata,
  keySource: EntityMetadata,
): Promise<{ owner: EntityMetadata; stored: string | undefined }> {
  const shared = await storage.getPassword(accountId, keySource.id);
  return shared !== undefined
    ? { owner: keySource, stored: shared }
    : { owner: entity, stored: await storage.getPassword(accountId, entity.id) };
}
