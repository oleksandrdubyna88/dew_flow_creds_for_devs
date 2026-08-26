import { StoredAccount, TreeElement, TreeNode } from './types';

/**
 * Which row a row hangs under.
 *
 * <p>`TreeView.reveal` cannot expand its way to anything without this — and until now this
 * provider had no `getParent` at all, which is written down in `extension.ts` where Quick Open
 * opens the read-only viewer instead of selecting the row it found. The "go to the original
 * folder" button is the first thing that genuinely needs it, so this is where it gets written,
 * and it is pure: a walk over ids that returns elements, with no `vscode` in sight.</p>
 *
 * <p>`parentId` is data — it arrives by sync and by import — so a parent that does not resolve
 * is treated as "this sits at the account root" rather than as an error. That is the same
 * defensive reading `treeSearch`'s walk already applies, and the reason a dangling parent shows
 * a row at the top level instead of throwing inside a reveal nobody can see into.</p>
 */

export interface ParentSource {
  getNode(accountId: string, id: string): TreeNode | undefined;
  getAccount(accountId: string): StoredAccount | undefined;
}

export function parentOf(element: TreeElement, source: ParentSource): TreeElement | undefined {
  if (element.kind === 'node') {
    return parentOfNode(element, source);
  }
  if (element.kind === 'dependentsFolder') {
    return dependentsParent(element, source);
  }
  return ownerEntityOf(element);
}

function parentOfNode(
  element: Extract<TreeElement, { kind: 'node' }>,
  source: ParentSource,
): TreeElement | undefined {
  const parentId = element.node.parentId;
  const parent =
    typeof parentId === 'string' ? source.getNode(element.accountId, parentId) : undefined;
  if (parent !== undefined) {
    return { kind: 'node', accountId: element.accountId, node: parent };
  }
  const account = source.getAccount(element.accountId);
  return account === undefined ? undefined : { kind: 'account', account };
}

/** A revision row and the dependents header both hang directly under their entity. */
function ownerEntityOf(element: TreeElement): TreeElement | undefined {
  return element.kind === 'revision' || element.kind === 'dependents'
    ? { kind: 'node', accountId: element.accountId, node: element.node }
    : undefined;
}

function dependentsParent(
  element: Extract<TreeElement, { kind: 'dependentsFolder' }>,
  source: ParentSource,
): TreeElement | undefined {
  const target = source.getNode(element.accountId, element.targetId);
  return target === undefined
    ? undefined
    : { kind: 'dependents', accountId: element.accountId, node: target };
}
