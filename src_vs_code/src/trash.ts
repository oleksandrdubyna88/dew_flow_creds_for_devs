import { TreeNode } from './types';

/**
 * The trash — a folder per account that makes deletion reversible.
 *
 * <p><b>It is deliberately NOT part of `deleteNodeRecursive`.</b> That is the single deletion
 * path, and three shipped features depend on it deleting for real: `burnOnUse`, `entityExpiry`
 * and `ephemeralSweeper`. Their guarantee is a real delete when the time comes — tombstone,
 * every SecretStorage key, the revision history — never a flag that leaves the secret in place.
 * A trash inside that method would mean an entry which promised to destroy itself instead moves
 * to a folder and keeps working, and the promise would break silently. So moving to the trash is
 * an operation one level up, and expiry, burning and the sweeper still go straight through the
 * permanent path.</p>
 *
 * <p>The folder is an ordinary node, which is what makes sync, the tree and restore-by-moving
 * work for free. The price is that it has to be hidden from every place that offers a folder —
 * and that price is paid here, once: `isTrashFolder` is the only predicate, and
 * `trashScan.test.ts` fails when a new folder listing appears without it.</p>
 */

export const TRASH_FOLDER_NAME = 'Trash';

/** What the right-click menu offers, in days. */
export const TRASH_RETENTION_CHOICES = [1, 3, 7, 30, 90, 365] as const;

export type TrashRetentionDays = (typeof TRASH_RETENTION_CHOICES)[number];

export function isTrashFolder(node: TreeNode | undefined): boolean {
  return node?.type === 'folder' && node.isTrash === true;
}

/** The account's trash, if it has one yet — it is created on the first delete, not up front. */
export function findTrash(nodes: readonly TreeNode[]): TreeNode | undefined {
  return nodes.find((node) => isTrashFolder(node));
}

/**
 * Is this node inside the trash — at any depth?
 *
 * <p>Depth matters: deleting a folder moves it whole, so its entries sit one level under the
 * trash rather than in it. A check that only looked at `parentId` would report them as live,
 * and a deleted entry that still answers to the broker is the defect the trash exists to avoid.</p>
 *
 * <p>The walk is bounded, like every other walk over `parentId` here: ids arrive by sync and by
 * import, so a cycle is data rather than an impossibility.</p>
 */
export function isInTrash(node: TreeNode, byId: (id: string) => TreeNode | undefined): boolean {
  const seen = new Set<string>([node.id]);
  let current: TreeNode | undefined = node;
  while (current !== undefined) {
    if (isTrashFolder(current)) {
      return true;
    }
    current = parentOf(current, byId, seen);
  }
  return false;
}

function parentOf(
  node: TreeNode,
  byId: (id: string) => TreeNode | undefined,
  seen: Set<string>,
): TreeNode | undefined {
  const parentId = node.parentId;
  if (typeof parentId !== 'string' || seen.has(parentId)) {
    return undefined;
  }
  seen.add(parentId);
  return byId(parentId);
}

/**
 * What the auto-cleanup should delete for real, given when each entry was trashed.
 *
 * <p>Returns the TOP-LEVEL nodes only — the ones sitting directly in the trash. Deleting one is
 * recursive, so returning its children too would ask the caller to delete an id that no longer
 * exists by the time it got there.</p>
 *
 * <p>No retention set means keep forever, which is the honest default for a fresh trash: a
 * folder that silently emptied itself the first time somebody looked away would be worse than
 * one that grows.</p>
 */
export function expiredInTrash(
  nodes: readonly TreeNode[],
  now: number,
): { id: string; name: string }[] {
  const trash = findTrash(nodes);
  const days = retentionDays(trash);
  if (trash === undefined || days === 0) {
    return [];
  }
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  return nodes
    .filter((node) => node.parentId === trash.id && trashedAt(node) < cutoff)
    .map((node) => ({ id: node.id, name: node.name }));
}

/**
 * When this went into the trash.
 *
 * <p>`updatedAt` is stamped by the move itself — every local write passes through `stampVector`
 * — so no second timestamp is stored. A node that somehow carries none counts as trashed now,
 * which errs toward keeping rather than deleting.</p>
 */
function trashedAt(node: TreeNode): number {
  return typeof node.updatedAt === 'number' ? node.updatedAt : Number.POSITIVE_INFINITY;
}

/** A usable number of days, or 0 for "keep until emptied" — the one place the shape is read. */
function retentionDays(node: TreeNode | undefined): number {
  const days = node?.trashRetentionDays;
  return typeof days === 'number' && days > 0 ? days : 0;
}

/** `emptied after 30 days` / `kept until emptied` — one phrase for the folder's own row. */
export function describeRetention(node: TreeNode | undefined): string {
  const days = retentionDays(node);
  if (days === 0) {
    return 'kept until emptied';
  }
  return days === 1 ? 'emptied after 1 day' : `emptied after ${days} days`;
}
