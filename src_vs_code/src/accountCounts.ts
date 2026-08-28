import { OwnedShare, TreeNode } from './types';
import { findTrash, isInTrash } from './trash';

/**
 * The three numbers on an account row (tails T32): entries / in the Trash / shared.
 *
 * <p>They replace the row's inline plus — which needed a folder to mean anything — with what the
 * owner actually asked the row to say: how much lives here. Histories are not counted (a
 * revision is not a tree node, so this is by construction, and the test pins it); folders are
 * structure, not entries; the Trash's entities count in their own slot only; "shared" is the
 * account's pending inbox — the rows its *Shared with me* section shows.</p>
 *
 * <p>Zeros are REAL: the row renders `0 / 0 / 0`, never a blank — the owner said so in as many
 * words, and a blank where a number belongs reads as "not loaded".</p>
 *
 * <p><b>The colour half of the ask is declined with its reason recorded:</b> a tree row's
 * description is plain text — VS Code offers no styling for it — so three numbers in three
 * colours are not expressible. Same wall as T30.</p>
 */

export interface AccountCounts {
  readonly entries: number;
  readonly trash: number;
  readonly shared: number;
}

export function accountCounts(
  nodes: readonly TreeNode[],
  byId: (id: string) => TreeNode | undefined,
  ownShares: readonly OwnedShare[],
  accountId: string,
): AccountCounts {
  const hasTrash = findTrash(nodes) !== undefined;
  const entities = nodes.filter((node) => node.type === 'entity');
  const trash = hasTrash ? entities.filter((node) => isInTrash(node, byId)).length : 0;
  const shared = ownShares.filter((share) => share.accountId === accountId).length;
  return { entries: entities.length - trash, trash, shared };
}

/** `12 / 3 / 2` — the order the owner wrote them in, zeros written out. */
export function formatAccountCounts(counts: AccountCounts): string {
  return `${counts.entries} / ${counts.trash} / ${counts.shared}`;
}
