import { EntityMetadata } from './types';
import { StorageManager } from './storageManager';

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
 */
export type SshCredentialSource =
  | { kind: 'storedKey'; keyEntityId: string; content: string; warning?: string }
  | { kind: 'keyPath'; path: string; warning?: string }
  | { kind: 'password'; password: string; warning?: string }
  | { kind: 'none'; warning?: string };

// eslint-disable-next-line complexity
export async function resolveSshCredential(
  storage: StorageManager,
  accountId: string,
  entity: EntityMetadata,
): Promise<SshCredentialSource> {
  let keySource: EntityMetadata = entity;
  let warning: string | undefined;
  if (entity.sshKeyEntityId !== undefined) {
    const ref = storage.getNode(accountId, entity.sshKeyEntityId);
    if (ref?.details) {
      keySource = ref.details;
    } else {
      warning = `The key entity referenced by "${entity.name}" no longer exists — using its own key settings.`;
    }
  }

  const storedKey = await storage.getPrivateKey(accountId, keySource.id);
  if (storedKey !== undefined) {
    return { kind: 'storedKey', keyEntityId: keySource.id, content: storedKey, warning };
  }
  // `!== undefined` rather than truthiness: an empty stored path historically
  // meant "no -i flag, but still not the password branch", and changing that
  // here would change which prompt a user sees on Connect.
  if (keySource.sshKeyPath !== undefined) {
    return { kind: 'keyPath', path: keySource.sshKeyPath, warning };
  }

  const password =
    (await storage.getPassword(accountId, keySource.id)) ??
    (await storage.getPassword(accountId, entity.id));
  if (password !== undefined) {
    return { kind: 'password', password, warning };
  }
  return { kind: 'none', warning };
}
