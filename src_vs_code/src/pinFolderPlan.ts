import { StorageManager } from './storageManager';
import { TreeNode } from './types';
import { isProtected } from './entityPin';

/**
 * What a folder run would DO, worked out before it does any of it.
 *
 * <p>Its own module, and pure of `vscode`, because the sentences are the feature. A reviewer found
 * the defect this exists for: a person running a folder with a new PIN expects the folder to be
 * uniformly theirs afterwards, and it will not be — entries already wrapped under another PIN are
 * skipped and keep it. Somebody who does not know that PIN has just locked themselves out of
 * entries they could read yesterday, while believing the opposite. So the plan is computed first
 * and stated first.</p>
 */

export interface FolderPinPlan {
  /** Every entry under the folder, at any depth, that is not protected yet. */
  readonly toProtect: readonly TreeNode[];
  /** Every entry under it that already has a PIN — left exactly as it is. */
  readonly alreadyProtected: readonly TreeNode[];
}

/** Walk the folder and sort its entries into the two piles. */
export async function folderPinPlan(
  storage: StorageManager,
  accountId: string,
  folderId: string,
): Promise<FolderPinPlan> {
  const toProtect: TreeNode[] = [];
  const alreadyProtected: TreeNode[] = [];
  for (const node of entriesUnder(storage.getNodes(accountId), folderId)) {
    const pile = (await isProtected(storage, accountId, node.id)) ? alreadyProtected : toProtect;
    pile.push(node);
  }
  return { toProtect, alreadyProtected };
}

/**
 * Every ENTITY under a folder, at any depth.
 *
 * <p>Walks parent links rather than recursing on children, so a malformed parent chain — which sync
 * can produce — costs one entry rather than a stack overflow. The depth cap is the same guard the
 * tree's own walks use.</p>
 */
export function entriesUnder(nodes: readonly TreeNode[], folderId: string): TreeNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return nodes.filter((n) => n.type === 'entity' && isUnder(n, folderId, byId));
}

function isUnder(node: TreeNode, folderId: string, byId: Map<string, TreeNode>): boolean {
  let current: TreeNode | undefined = node;
  for (let depth = 0; depth < MAX_DEPTH; depth += 1) {
    if (current === undefined) {
      return false;
    }
    if (current.parentId === folderId) {
      return true;
    }
    current = parentOf(current, byId);
  }
  return false;
}

/** The node above this one, or nothing — at the root, and when sync left a chain pointing nowhere. */
function parentOf(node: TreeNode, byId: Map<string, TreeNode>): TreeNode | undefined {
  return node.parentId === null || node.parentId === undefined ? undefined : byId.get(node.parentId);
}

const MAX_DEPTH = 64;

/**
 * What is about to be skipped, said before the run rather than after it.
 *
 * <p>The count first, then what it MEANS — that those entries keep their own PIN and this run will
 * not change them. A summary that only counted would leave the person to work out the consequence
 * for themselves, which is the working-out that goes wrong.</p>
 */
export function siblingReport(folderName: string, plan: FolderPinPlan): string {
  const kept = plan.alreadyProtected.length;
  return (
    `${kept} of the ${kept + plan.toProtect.length} entries in "${folderName}" already have a PIN of `
    + 'their own.\n\nThey will be left exactly as they are — this run does not change them, and you '
    + 'will still need their own PIN to open them. '
    + `${plan.toProtect.length} unprotected ${plan.toProtect.length === 1 ? 'entry' : 'entries'} will be `
    + 'protected with the PIN you are about to type.'
  );
}

/** The state of a folder in one line — what the tree shows, and what an already-done run says. */
export function protectionSummary(folderName: string, plan: FolderPinPlan): string {
  const total = plan.alreadyProtected.length + plan.toProtect.length;
  if (total === 0) {
    return `"${folderName}" holds no entries to protect.`;
  }
  return plan.toProtect.length === 0
    ? `All ${total} entries in "${folderName}" already have a PIN.`
    : `${plan.alreadyProtected.length} of ${total} entries in "${folderName}" are protected.`;
}
