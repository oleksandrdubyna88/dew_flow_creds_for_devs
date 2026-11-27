import { HIDDEN_REFERENCE } from './agentNaming';
import { isOpenFolder } from './mcpFolders';
import { RefSource, SecretRef, locateRef, parseSecretRef, rewriteRefTokens } from './secretRef';
import type { TreeNode } from './types';
import type { ListingLocator } from './vaultRefLocator';

/**
 * The text of a command as an agent reads it in `creds_list`: each `creds://` token that is not a reference to things that the agent may
 * view becomes `HIDDEN_REFERENCE` (`todo/PLAN_agent_list_fields_hidden_n1_n4_n6.md`, §2.4); the text between the tokens stays.
 *
 * <p>Pure: it imports no `vscode`, and it asks the wall through functions, as `agentRefusal` does.</p>
 */

/** What the three conditions need: the product's own locator, and the two questions of the wall. */
export interface ReferenceWall {
  /** The locator of `vaultRefLocator` over the entries that the agent may view (change 1.1: a hidden twin is no twin). */
  readonly locator: ListingLocator;
  /** May the agent view this entry, in this account? (`agentMayView`.) */
  readonly mayViewEntry: (accountId: string, entityId: string) => boolean;
  /** The node, in this account. */
  readonly nodeOf: (accountId: string, id: string) => TreeNode | undefined;
}

/**
 * Is this token kept as the person typed it? Only when the three conditions are true, and fail closed: a token that the parser does not
 * read, an account that is not signed in, an entry that nobody has, two entries that the agent may view with the name, a hidden entry (a hidden
 * twin of a viewable entry does not count), and a folder that is named and is not open all read alike (rule A). A folder that the token does not name is not asked.
 */
export function keepsReference(token: string, wall: ReferenceWall): boolean {
  const hit = located(token, wall.locator);
  return hit !== undefined && wall.mayViewEntry(hit.accountId, hit.entityId) && foldersOpen(wall, hit.accountId, hit.entityId, hit.ref.entityPath.length - 1);
}

/** The ONE entry that the agent may view and that the token names, by the product's own locator, given only the entries that can match; `undefined` for none, for two, and for a token that the parser does not read. */
function located(token: string, locator: ListingLocator): { ref: SecretRef; accountId: string; entityId: string } | undefined {
  const ref = parseSecretRef(token);
  return ref === undefined ? undefined : locatedBy(token, ref, locator);
}

function locatedBy(token: string, ref: SecretRef, locator: ListingLocator): { ref: SecretRef; accountId: string; entityId: string } | undefined {
  const found = locateRef(token, candidatesOf(locator, ref.entityPath[ref.entityPath.length - 1]));
  return found.ok ? { ref, accountId: found.accountId, entityId: found.entityId } : undefined;
}

function candidatesOf(locator: ListingLocator, lastName: string): Pick<RefSource, 'accounts' | 'entities'> {
  return { accounts: () => locator.accounts(), entities: (accountId) => locator.candidates(accountId, lastName) };
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
