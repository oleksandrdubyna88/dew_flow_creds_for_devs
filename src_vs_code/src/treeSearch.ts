import { TreeNode } from './types';

/**
 * Filtering the sidebar tree by what you can already see in it.
 *
 * <p><b>What is searched, and what is deliberately not.</b> A term is matched against the
 * text the tree itself shows for a row — its name, and the target it describes (user, host,
 * port, database or VPN type, the saved command, a key path). It is never matched against a
 * secret: not the password, the private key, the VPN config, the connection string, the
 * notes, or a script variable's value.</p>
 *
 * <p>That is not tidiness, it is the difference between a filter and an oracle. A search box
 * that matched secrets would answer "does this password contain `Tr0ub4`?" to anyone sitting
 * at an unlocked window — one character at a time, without ever opening an entry, and without
 * leaving a trace in any of the places a revealed secret is recorded. So the rule is: if the
 * row does not already say it out loud, typing it will not find it.</p>
 *
 * <p>Pure and free of `vscode`, so the behaviour is testable without a window.</p>
 */

/**
 * A query split into terms. Several words are an AND — `prod db` finds the row that is both,
 * in either order, which is how people narrow a list they are looking at.
 */
export function searchTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 0);
}

/** The non-secret text of one row, lowercased, as one string to look in. */
export function nodeHaystack(node: TreeNode): string {
  const d = node.details;
  return [
    node.name,
    node.folderType,
    d?.user,
    d?.host,
    d?.port,
    d?.dbType,
    d?.vpnType,
    d?.command,
    d?.commandNote,
    d?.sshKeyPath,
    d?.scriptLanguage,
  ]
    .filter((part) => part !== undefined && part !== null && String(part).length > 0)
    .join(' ')
    .toLowerCase();
}

export function matchesTerms(haystack: string, terms: readonly string[]): boolean {
  return terms.every((term) => haystack.includes(term));
}

/** Just enough of the storage to walk one account's tree. */
export interface TreeSource {
  getChildren(accountId: string, parentId: string | null): TreeNode[];
}

/**
 * Whether this node, or anything under it, matches.
 *
 * <p>A folder is kept when a child matches, because a hit nobody can navigate to is not a
 * hit — the folder is the path to it. The visited set guards against a parent cycle in a
 * corrupt or hand-edited vault: this walks data that arrives by sync and import, and an
 * infinite recursion inside `getChildren` would hang the window rather than show a bad row.</p>
 */
function subtreeMatches(
  source: TreeSource,
  accountId: string,
  node: TreeNode,
  terms: readonly string[],
  visited: Set<string>,
): boolean {
  if (matchesTerms(nodeHaystack(node), terms)) {
    return true;
  }
  if (node.type !== 'folder' || visited.has(node.id)) {
    return false;
  }
  visited.add(node.id);
  return source
    .getChildren(accountId, node.id)
    .some((child) => subtreeMatches(source, accountId, child, terms, visited));
}

/**
 * The children of one tree position, filtered.
 *
 * <p>`parentMatched` is the caller saying "the folder you are opening matched by its own
 * name" — and then everything inside it is shown. Searching for a folder and being handed an
 * empty folder would be the wrong answer to the question that was asked.</p>
 */
export function filterChildren(
  source: TreeSource,
  accountId: string,
  parentId: string | null,
  terms: readonly string[],
  parentMatched = false,
): TreeNode[] {
  const children = source.getChildren(accountId, parentId);
  if (terms.length === 0 || parentMatched) {
    return children;
  }
  return children.filter((child) =>
    subtreeMatches(source, accountId, child, terms, new Set<string>()),
  );
}

/** Whether an account has anything to show at all — an empty account row is noise. */
export function accountMatches(
  source: TreeSource,
  accountId: string,
  terms: readonly string[],
): boolean {
  return terms.length === 0 || filterChildren(source, accountId, null, terms).length > 0;
}

/** How many entities (not folders) the filter keeps, so the row can say whether it found anything. */
export function countMatches(
  source: TreeSource,
  accountIds: readonly string[],
  terms: readonly string[],
): number {
  const walk = (
    accountId: string,
    parentId: string | null,
    inMatched: boolean,
    visited: Set<string>,
  ): number => {
    let total = 0;
    for (const node of source.getChildren(accountId, parentId)) {
      const matched = inMatched || matchesTerms(nodeHaystack(node), terms);
      if (node.type === 'folder') {
        if (!visited.has(node.id)) {
          visited.add(node.id);
          total += walk(accountId, node.id, matched, visited);
        }
      } else if (matched) {
        total += 1;
      }
    }
    return total;
  };
  return accountIds.reduce(
    (sum, accountId) => sum + walk(accountId, null, false, new Set<string>()),
    0,
  );
}
