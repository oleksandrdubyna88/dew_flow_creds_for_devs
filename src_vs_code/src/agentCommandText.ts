import { HIDDEN_REFERENCE } from './agentNaming';
import { isOpenFolder } from './mcpFolders';
import { RefSource, locateRef, parseSecretRef, rewriteRefTokens } from './secretRef';
import type { TreeNode } from './types';

/**
 * The text of a command as an agent reads it in `creds_list`: each `creds://` token that is not a reference to things that the agent may
 * view becomes `HIDDEN_REFERENCE` (`todo/PLAN_agent_list_fields_hidden_n1_n4_n6.md`, §2.4); the text between the tokens stays.
 *
 * <p>Pure: it imports no `vscode`, and it asks the wall through functions, as `agentRefusal` does.</p>
 */

/** What the three conditions need: the product's own locator, and the two questions of the wall. */
export interface ReferenceWall {
  /** The locator of `vaultRefLocator`, over ALL entries of an account, not the visible part (D5). */
  readonly locator: Pick<RefSource, 'accounts' | 'entities'>;
  /** May the agent view this entry, in this account? (`agentMayView`.) */
  readonly mayViewEntry: (accountId: string, entityId: string) => boolean;
  /** The node, in this account. */
  readonly nodeOf: (accountId: string, id: string) => TreeNode | undefined;
}

/**
 * Is this token kept as the person typed it? Only when the three conditions are true, and fail closed: a token that the parser does not
 * read, an account that is not signed in, an entry that nobody has, two entries with the name, a hidden entry, and a folder that is named
 * and is not open all read alike (rule A). A folder that the token does not name is not asked.
 */
export function keepsReference(token: string, wall: ReferenceWall): boolean {
  const ref = parseSecretRef(token);
  const found = locateRef(token, wall.locator);
  return ref !== undefined && found.ok && wall.mayViewEntry(found.accountId, found.entityId) && foldersOpen(wall, found.accountId, found.entityId, ref.entityPath.length - 1);
}

/** Is each of the `count` folders above the entry open to the agent? A parent that is missing, or a cycle, is not open. */
function foldersOpen(wall: ReferenceWall, accountId: string, entityId: string, count: number): boolean {
  const byId = (id: string): TreeNode | undefined => wall.nodeOf(accountId, id);
  const above = foldersAbove(byId(entityId), byId, count, new Set<string>([entityId]));
  return above.length === count && above.every((folder) => isOpenFolder(folder, byId));
}

/** The `count` nodes above `node`, nearest first; fewer when a parent is missing or the chain comes back to a node that was walked. */
function foldersAbove(node: TreeNode | undefined, byId: (id: string) => TreeNode | undefined, count: number, seen: ReadonlySet<string>): TreeNode[] {
  const parent = unwalkedParent(node, byId, seen);
  return count <= 0 || parent === undefined ? [] : [parent, ...foldersAbove(parent, byId, count - 1, new Set([...seen, parent.id]))];
}

/** The parent of `node`, unless there is none or it was walked already (`parentId` arrives by sync, so it is data and not an invariant). */
function unwalkedParent(node: TreeNode | undefined, byId: (id: string) => TreeNode | undefined, seen: ReadonlySet<string>): TreeNode | undefined {
  const parentId = parentIdOf(node);
  return parentId === null || seen.has(parentId) ? undefined : byId(parentId);
}

const parentIdOf = (node: TreeNode | undefined): string | null => node?.parentId ?? null;

/** The command that an agent reads: each token that is not kept is the placeholder, and nothing else changes. */
export function listedCommand(text: string, keeps: (token: string) => boolean): string {
  return rewriteRefTokens(text, (token) => (keeps(token) ? token : HIDDEN_REFERENCE));
}
