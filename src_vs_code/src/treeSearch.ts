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
// eslint-disable-next-line complexity
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
    // Tags are labels a person put on the row and can see on it — exactly the rule this
    // haystack follows. They are not, and must never become, a place to keep a secret.
    ...(d?.tags ?? []),
  ]
    .filter((part) => part !== undefined && part !== null && String(part).length > 0)
    .join(' ')
    .toLowerCase();
}

export function matchesTerms(haystack: string, terms: readonly string[]): boolean {
  return terms.every((term) => haystack.includes(term));
}

/**
 * How a node is judged. `terms` drive the default text match and remain the memo's cache key
 * ingredient; `matcher`, when present, REPLACES the judgement — the capability predicates
 * (tails T23b) ride in this seat, already composed with the text terms by the provider. One
 * seat rather than a parallel predicate parameter, so the walk below cannot apply half a
 * query.
 */
export interface NodeJudge {
  readonly terms: readonly string[];
  readonly matcher?: (node: TreeNode) => boolean;
  /** Distinguishes two matchers for the memo — the provider passes the raw query here. */
  readonly matcherKey?: string;
}

function judgeNode(node: TreeNode, judge: NodeJudge): boolean {
  return judge.matcher === undefined
    ? matchesTerms(nodeHaystack(node), judge.terms)
    : judge.matcher(node);
}

/** Just enough of the storage to walk one account's tree. Read-only: the walk never mutates. */
export interface TreeSource {
  getChildren(accountId: string, parentId: string | null): readonly TreeNode[];
}

/**
 * Answers already given for the CURRENT term, kept until the tree changes.
 *
 * <p>One render asks the same questions several times: the root's filtered children decide
 * which accounts to show and are asked for again when the account row opens; each folder the
 * filter kept is walked once inside the root's walk and once more when it opens — the whole
 * subtree each time, over a source that used to re-filter the account per call. The memo
 * answers a repeated question from the first answer.</p>
 *
 * <p>It is tuned to one term: an entry point hands it the terms it is about to answer for, and
 * answers given for different terms are dropped. The owner clears it whenever the tree changes,
 * so a hit is never older than the tree it describes. In a parent cycle (corrupt data) a
 * folder's verdict depends on the path that reached it, and the memo keeps the first — the
 * guard's promise there is termination, not a well-defined answer.</p>
 */
export class FilterMemo {
  private tunedTo = '';
  private readonly subtrees = new Map<string, boolean>();
  private readonly childLists = new Map<string, readonly TreeNode[]>();
  private readonly counts = new Map<string, number>();

  /** Forget everything — the tree changed under the memo. */
  clear(): void {
    this.subtrees.clear();
    this.childLists.clear();
    this.counts.clear();
  }

  /** Answer for these terms from now on, dropping what was remembered for different ones. */
  tune(terms: readonly string[]): void {
    const key = terms.join('\n');
    if (key !== this.tunedTo) {
      this.tunedTo = key;
      this.clear();
    }
  }

  subtree(accountId: string, nodeId: string, compute: () => boolean): boolean {
    return remembered(this.subtrees, `${accountId}\n${nodeId}`, compute);
  }

  children(
    accountId: string,
    parentId: string | null,
    compute: () => readonly TreeNode[],
  ): readonly TreeNode[] {
    return remembered(this.childLists, `${accountId}\n${parentId ?? ''}`, compute);
  }

  count(accountIds: readonly string[], compute: () => number): number {
    return remembered(this.counts, accountIds.join('\n'), compute);
  }
}

function remembered<T>(store: Map<string, T>, key: string, compute: () => T): T {
  const hit = store.get(key);
  if (hit !== undefined) {
    return hit;
  }
  const value = compute();
  store.set(key, value);
  return value;
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
  judge: NodeJudge,
  visited: Set<string>,
  memo: FilterMemo | undefined,
): boolean {
  const compute = (): boolean => {
    // The node's own text first, then the cycle guard. The two orderings are EQUIVALENT — a
    // node enters `visited` only after its own haystack was checked and failed, so a node
    // re-reached through a cycle is by construction one that did not match — but this order
    // says out loud that the guard's only job is termination, never hiding a visible match.
    if (judgeNode(node, judge)) {
      return true;
    }
    if (node.type !== 'folder' || visited.has(node.id)) {
      return false;
    }
    visited.add(node.id);
    return source
      .getChildren(accountId, node.id)
      .some((child) => subtreeMatches(source, accountId, child, judge, visited, memo));
  };
  return memo === undefined ? compute() : memo.subtree(accountId, node.id, compute);
}

/**
 * The children of one tree position, filtered.
 *
 * <p>`parentMatched` is the caller saying "the folder you are opening matched by its own
 * name" — and then everything inside it is shown. Searching for a folder and being handed an
 * empty folder would be the wrong answer to the question that was asked.</p>
 */
// eslint-disable-next-line complexity
export function filterChildren(
  source: TreeSource,
  accountId: string,
  parentId: string | null,
  judge: NodeJudge | readonly string[],
  parentMatched = false,
  memo?: FilterMemo,
): readonly TreeNode[] {
  const q: NodeJudge = Array.isArray(judge) ? { terms: judge } : (judge as NodeJudge);
  // A matched FOLDER shows everything inside it — but only for a pure text search. With
  // capability predicates in play the shortcut would be a lie: a folder matched by name does
  // not make its children CLI-enabled.
  if ((q.terms.length === 0 && q.matcher === undefined) || (parentMatched && q.matcher === undefined)) {
    return source.getChildren(accountId, parentId);
  }
  memo?.tune(memoKey(q));
  const compute = (): readonly TreeNode[] =>
    source
      .getChildren(accountId, parentId)
      .filter((child) => subtreeMatches(source, accountId, child, q, new Set<string>(), memo));
  return memo === undefined ? compute() : memo.children(accountId, parentId, compute);
}

/** What the memo keys a judgement by. The matcher's identity is carried by `matcherKey`. */
function memoKey(judge: NodeJudge): readonly string[] {
  return judge.matcher === undefined ? judge.terms : [...judge.terms, judge.matcherKey ?? '#pred'];
}

/** Whether an account has anything to show at all — an empty account row is noise. */
export function accountMatches(
  source: TreeSource,
  accountId: string,
  judge: NodeJudge | readonly string[],
  memo?: FilterMemo,
): boolean {
  const q: NodeJudge = Array.isArray(judge) ? { terms: judge } : (judge as NodeJudge);
  return (
    (q.terms.length === 0 && q.matcher === undefined) ||
    filterChildren(source, accountId, null, q, false, memo).length > 0
  );
}

/** How many entities (not folders) the filter keeps, so the row can say whether it found anything. */
export function countMatches(
  source: TreeSource,
  accountIds: readonly string[],
  judge: NodeJudge | readonly string[],
  memo?: FilterMemo,
): number {
  const q: NodeJudge = Array.isArray(judge) ? { terms: judge } : (judge as NodeJudge);
  const walk = (
    accountId: string,
    parentId: string | null,
    inMatched: boolean,
    visited: Set<string>,
  // eslint-disable-next-line complexity
  ): number => {
    let total = 0;
    for (const node of source.getChildren(accountId, parentId)) {
      // The matched-folder shortcut counts children for a pure text search only — with
      // predicates, being inside a matched folder proves nothing about a child's capability.
      const matched =
        (inMatched && q.matcher === undefined) || judgeNode(node, q);
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
  const compute = (): number =>
    accountIds.reduce(
      (sum, accountId) => sum + walk(accountId, null, false, new Set<string>()),
      0,
    );
  memo?.tune(memoKey(q));
  return memo === undefined ? compute() : memo.count(accountIds, compute);
}
