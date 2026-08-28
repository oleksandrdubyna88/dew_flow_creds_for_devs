import { TreeNode } from './types';

/** One selected row: the account and the node. */
export interface RestoreTarget {
  readonly accountId: string;
  readonly node: TreeNode;
}

/** What the Restore command needs from the world — storage and the tree, as callbacks. */
export interface RestoreDeps {
  readonly restore: (accountId: string, id: string) => Promise<TreeNode | null | undefined>;
  /** Repaint the tree, then reveal and tint the restored row (the arrival highlight, T13). */
  readonly announce: (accountId: string, id: string) => Promise<void>;
}

/** `"www" → "ssh"`, or `"www" → the account root`. */
function restoredTo(name: string, folder: TreeNode | null): string {
  return `"${name}" → ${folder === null ? 'the account root' : `"${folder.name}"`}`;
}

/**
 * *Restore* for every selected node in the Trash (the owner, 2026-08-28: the first item on the
 * right-click of a deleted entry, back to where it was deleted from). Sequential, like every
 * other storage mutation here — two in flight would race on the same flat array.
 *
 * <p>Returns the sentence to show — where each thing went, by name — or nothing when nothing
 * was there to restore. The last restored row is the one revealed.</p>
 */
export async function restoreEntries(deps: RestoreDeps, targets: readonly RestoreTarget[]): Promise<string> {
  const restored: string[] = [];
  let last: RestoreTarget | undefined;
  for (const target of targets) {
    const folder = await deps.restore(target.accountId, target.node.id);
    if (folder !== undefined) {
      restored.push(restoredTo(target.node.name, folder));
      last = target;
    }
  }
  if (last === undefined) {
    return '';
  }
  await deps.announce(last.accountId, last.node.id);
  return `Restored ${restored.join(', ')}.`;
}
