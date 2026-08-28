import { TreeNode } from './types';
import { hasLifetime } from './entityExpiry';

/**
 * *Burn Now…* — burn a short-lived entry before its time (the parent plan's DoD, the owner's
 * "only on entries with a lifetime"). NOT the Trash: the one delete path the feature owns,
 * `deleteNodeRecursive`, takes the secret, every kept version and — by tombstone — every synced
 * copy. So the question is asked in those words, and the answer is the only thing that burns.
 */

export const BURN_BUTTON = 'Burn';

export function burnNowText(name: string): string {
  return `Burn "${name}" now? This is not the Trash: the secret, its history and every synced copy are gone for good.`;
}

/** Whether the menu offers it: only an entry that carries a lifetime. */
export function canBurnNow(node: TreeNode): boolean {
  return node.type === 'entity' && hasLifetime(node.details ?? {});
}

export interface BurnDeps {
  /** The modal: the text and the one button; true only when that button was pressed. */
  readonly confirm: (text: string, button: string) => Promise<boolean>;
  /** The one delete path — `StorageManager.deleteNodeRecursive`. */
  readonly burn: (accountId: string, id: string) => Promise<string[]>;
}

export async function burnNow(deps: BurnDeps, accountId: string, node: TreeNode): Promise<'burned' | 'kept'> {
  if (!canBurnNow(node)) {
    return 'kept';
  }
  if (!(await deps.confirm(burnNowText(node.name), BURN_BUTTON))) {
    return 'kept';
  }
  await deps.burn(accountId, node.id);
  return 'burned';
}
