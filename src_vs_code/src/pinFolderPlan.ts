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

/**
 * What a finished run did, in the words a person is told it in.
 *
 * <p>Three numbers, not one *(a reviewer's finding)*. A run that stops part-way used to abort with
 * nothing said, so the person saw a progress notification vanish and had no way to tell a finished
 * run from a failed one. Naming the failures — and the entry each belongs to — is what makes the
 * "run it again" answer usable, because re-running skips what is already done.</p>
 *
 * <p>`raced` is the third kind of outcome (review of 2026-09-30): an entry another window protected
 * under a DIFFERENT PIN while this run's boxes were open. It is neither done — the PIN just typed
 * opens none of it, so no mark was written and no decision counted — nor failed, because running it
 * again would not help: it is protected, under the other PIN.</p>
 */
export function runReport(done: readonly string[], failed: readonly string[], raced: readonly RacedEntry[] = []): string {
  const tail = [failedPart(failed), untouchedPart(raced.filter((one) => one.sealedHere.length === 0)), ...raced.filter((one) => one.sealedHere.length > 0).map(mixedPart)]
    .filter((part) => part !== '')
    .join(' ');
  return `${protectedPart(done)} ${tail === '' ? 'There is no way to recover it.' : tail}`;
}

/** An entry a Protect run found protected under another PIN — and the values THIS run sealed before it knew. */
export interface RacedEntry {
  readonly name: string;
  /** Labels of the values this run sealed under its PIN: empty when the other window had sealed them all first. */
  readonly sealedHere: readonly string[];
}

function protectedPart(done: readonly string[]): string {
  return done.length === 1 ? `"${done[0]}" is protected with its own PIN.` : `${done.length} entries are protected with that PIN.`;
}

function failedPart(failed: readonly string[]): string {
  return failed.length === 0
    ? ''
    : `${failed.length} could not be: ${failed.join(', ')}. Those are unchanged and still readable — run it again and it will `
      + 'finish them, skipping what is already done.';
}

function untouchedPart(raced: readonly RacedEntry[]): string {
  if (raced.length === 0) {
    return '';
  }
  const one = raced.length === 1;
  return `${raced.map((entry) => `"${entry.name}"`).join(', ')} ${one ? 'was' : 'were'} already protected in another window under a `
    + `different PIN — nothing was changed on ${one ? 'it' : 'them'}.`;
}

/**
 * Both windows sealing the same entry in the same seconds, each under its own PIN — the one case where
 * this run DID change something before it could know. Said as it is: which values went under this PIN.
 */
function mixedPart(entry: RacedEntry): string {
  return `"${entry.name}" was being protected in another window under a different PIN at the same moment: its `
    + `${entry.sealedHere.join(', ')} went under this PIN and the rest under the other, and no protection was recorded for this run.`;
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
