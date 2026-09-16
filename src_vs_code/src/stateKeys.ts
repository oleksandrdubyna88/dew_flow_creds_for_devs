import { TreeNode } from './types';

/**
 * The `globalState` key grammar, and the order siblings are shown in.
 *
 * <p>Extracted from `storageManager.ts` for the reason `secretKeys.ts` was, and recorded there: that
 * file is exempted from the 800-line ceiling, and the size ratchet lets an exempted file SHRINK and
 * never grow — so a new secret kind cannot add a line to it. These are the obvious tenants: pure,
 * `vscode`-free functions that read nothing off the manager and that nothing else in the file wants
 * to be near.</p>
 *
 * <p>Unlike a SecretStorage key, a `globalState` key is not a security boundary — it holds sealed
 * metadata rather than a secret, and it is composed from an account id that this product mints. It
 * is here for the same tidiness rather than for the same reason.</p>
 */

/** One account's flat node list. */
export function nodesKey(accountId: string): string {
  return `credSshManager.nodes.${accountId}`;
}

/** One account's soft-delete records. */
export function tombstonesKey(accountId: string): string {
  return `credSshManager.tombstones.${accountId}`;
}

/** One account's causal horizon — every vector ever observed, never pruned. */
export function horizonKey(accountId: string): string {
  return `credSshManager.horizon.${accountId}`;
}

/** Folders first (manual order, then name), entities alphabetical. */
// eslint-disable-next-line complexity
export function siblingOrder(a: TreeNode, b: TreeNode): number {
  if (a.type !== b.type) {
    return a.type === 'folder' ? -1 : 1;
  }
  if (a.type === 'folder') {
    const ao = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const bo = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
    if (ao !== bo) {
      return ao - bo;
    }
  }
  return a.name.localeCompare(b.name);
}
