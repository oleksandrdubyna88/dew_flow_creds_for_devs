import type { TreeNode } from './types';

/**
 * A node whose record names the node it is in — the invariant every secret read depends on.
 *
 * <p><b>`TreeNode.id` and `TreeNode.details.id` are two spellings of one fact</b>, and nothing in the
 * product reads them as two. A `TreeElement` carries `details`, so the viewer, the tree's copy
 * commands, the env binder and the agent surfaces all key their keychain reads on `details.id`
 * (`entityViewerCommands.ts`, `commands/entityCommands.ts`, `envApply.ts`) — while every WRITE is
 * keyed on `node.id`. Let the two disagree and the entry still lists, still has a name and its dates,
 * and has nothing behind it: no password, no login, no URL, no one-time code. The values are on disk
 * the whole time, under the id nobody reads.</p>
 *
 * <p>Which is exactly what an accepted share did. The import gives the arriving node a FRESH local
 * id — a sender must never be able to address an entry in our vault — and spread `details` unchanged
 * beside it, so the copy pointed at the SENDER's id forever. The clone command and the file import
 * both fix the id up by hand (`commands/treeMutationCommands.ts`, `importFormats.ts`); the accept
 * path was the third site and it forgot. One function now, called by all of them, so a fourth site
 * cannot forget.</p>
 *
 * <p>Also applied when nodes are READ (`storageManager.nodeEntry`), which is what makes this a repair
 * rather than only a guard: a vault that already holds entries broken by an older build is corrected
 * as it loads, and they become readable again with nothing to re-share. Deliberately a read-time
 * normalisation and not a migration write — a rewrite of every node would bump the version vectors
 * and push a sync of records whose stored bytes need no change.</p>
 *
 * <p>Returns the node ITSELF when there is nothing to fix, so the common path allocates nothing and
 * the frozen arrays a read hands out keep their identity.</p>
 */
export function withOwnId(node: TreeNode): TreeNode {
  const details = node.details;
  if (details === undefined || details.id === node.id) {
    return node;
  }
  return { ...node, details: { ...details, id: node.id } };
}
