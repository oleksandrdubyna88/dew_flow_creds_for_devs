import { burnsOnAgentUse } from './entityExpiry';
import { canBurnOnAgentUse, resolveKind } from './entityKind';
import { TreeNode } from './types';

/**
 * Destroy an entry that was created to survive exactly one agent use.
 *
 * <p>Separate from the broker because the broker holds a grant, not a stored record: it
 * should no more read `burnPolicy` than it reads a password. Separate from `extension.ts`
 * because `activate()` is already too long (audit A1) and because this needs to be a unit
 * test rather than a thing one clicks.</p>
 *
 * <p><b>Only the broker spends an entry.</b> A person copying the password, connecting from
 * the tree, or opening the viewer does NOT burn it — the owner's decision, and the reason the
 * UI has to say "until an agent uses it" rather than "one-time", which would promise
 * something the code deliberately does not do.</p>
 *
 * <p>The kind is checked again here even though `stampKind` already refuses an unfirable
 * policy on write: a record can predate that rule, and the failure it prevents is silent —
 * an `sshkey` marked `oneUse` by an older build would otherwise be deleted by the first
 * broker call that happened to name it, which is the one direction this feature must never
 * fail in.</p>
 */

/** Only the two reads this needs, so its test builds no StorageManager. */
export interface BurnStorage {
  getNode(accountId: string, id: string): TreeNode | undefined;
  deleteNodeRecursive(accountId: string, id: string): Promise<string[]>;
}

/** `true` when the entry was one-use and is now gone from the vault. */
export async function burnIfOneUse(
  storage: BurnStorage,
  accountId: string,
  entityId: string,
): Promise<boolean> {
  const node = storage.getNode(accountId, entityId);
  if (node === undefined || !burnsOnAgentUse(node)) {
    return false;
  }
  if (!canBurnOnAgentUse(resolveKind(node.details))) {
    return false; // a policy nothing could ever fire, written before that was refused
  }
  await storage.deleteNodeRecursive(accountId, entityId);
  return true;
}
