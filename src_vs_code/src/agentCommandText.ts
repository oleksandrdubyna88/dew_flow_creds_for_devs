import { HIDDEN_REFERENCE } from './agentNaming';
import { isOpenFolder } from './mcpFolders';
import { RefSource, SecretRef, locateRef, parseSecretRef, rewriteRefTokens } from './secretRef';
import type { TreeNode } from './types';
import type { Candidates, ListingLocator } from './vaultRefLocator';

/**
 * The text of a command as an agent reads it in `creds_list`: each `creds://` token that is not a reference to things that the agent may
 * view becomes `HIDDEN_REFERENCE` (`research/PLAN_agent_list_fields_hidden_n1_n4_n6.md`, §2.4); the text between the tokens stays.
 *
 * <p>Pure: it imports no `vscode`, and it asks the wall through functions, as `agentRefusal` does.</p>
 */

/** What the decision of a token needs: the candidates (the locator of the listing), and the second lock on the entry that is found. */
export interface ReferenceWall {
  /** The locator of `vaultRefLocator` over the candidates of a token: viewable entries whose named folders are open. */
  readonly locator: ListingLocator;
  /** May the agent view this entry, in this account? (`agentMayView`.) The second lock: the candidates are viewable already. */
  readonly mayViewEntry: (accountId: string, entityId: string) => boolean;
}

/** The nodes of one account, for the walk above an entry. */
export interface NodeLookup {
  readonly nodeOf: (accountId: string, id: string) => TreeNode | undefined;
}

/**
 * Is this token kept as the person typed it? ONE rule (§2.4): the candidates of the token are the entries of EACH account with its address that the agent may
 * view, with the token's last name, whose folders that the token names exist and are open to the agent; the product's locator is given the candidates and no
 * other entry, and the token is kept when it finds exactly one. A node that the agent may not view is never a candidate and never a folder that a candidate is under
 * by name, so it decides nothing (rule A). Fail closed: a token that the parser does not read, no account with the address, no candidate and two candidates all read alike.
 */
export function keepsReference(token: string, wall: ReferenceWall): boolean {
  const hit = located(token, wall.locator);
  return hit !== undefined && wall.mayViewEntry(hit.accountId, hit.entityId);
}

/** The ONE candidate that the token names, with the account that it came from; `undefined` for none, for two, and for a token that the parser does not read. */
function located(token: string, locator: ListingLocator): { accountId: string; entityId: string } | undefined {
  const ref = parseSecretRef(token);
  return ref === undefined ? undefined : locatedBy(token, ref, locator);
}

function locatedBy(token: string, ref: SecretRef, locator: ListingLocator): { accountId: string; entityId: string } | undefined {
  const candidates = locator.qualified(ref.account, ref.entityPath[ref.entityPath.length - 1], ref.entityPath.length - 1);
  const found = locateRef(token, asOneAccount(ref.account, candidates));
  return found.ok ? candidates.origin.get(found.entityId) : undefined;
}

/** The candidates of all the accounts with the address as the entries of ONE account that has the address, so that the locator counts over the accounts and no first account wins. */
function asOneAccount(address: string, candidates: Candidates): Pick<RefSource, 'accounts' | 'entities'> {
  return { accounts: () => [{ accountId: 'listing', email: address }], entities: () => candidates.entities };
}

/** Is each of the `count` folders above the entry open to the agent? A parent that is missing, or a cycle, is not open. */
export function foldersOpen(wall: NodeLookup, accountId: string, entityId: string, count: number): boolean {
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
