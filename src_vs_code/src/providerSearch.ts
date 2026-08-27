import * as vscode from 'vscode';
import { StorageManager } from './storageManager';
import { TreeNode } from './types';
import { FilterMemo, NodeJudge, countMatches, matchesTerms, nodeHaystack, searchTerms } from './treeSearch';
import { searchRowItem } from './searchRowItem';
import { matchesPredicates, parseQuery } from './searchPredicates';
import { resolveMcpInTree } from './mcpAccess';

/**
 * The tree provider's search query, judged (tails T23b) — split out when the predicates pushed
 * `treeDataProvider.ts` over the 800-line ceiling.
 *
 * <p>Free text stays terms; when capability predicates are present, the judge carries a
 * composed matcher that ANDs them with the text. The matcher closes over the SAME MCP resolver
 * the tree badge uses and the alias hook the extension fills, so the filter's answer and the
 * badge's answer come from one place and cannot disagree.</p>
 */
export function buildJudge(
  query: string,
  accountId: string,
  storage: StorageManager,
  hasCliAlias: ((accountId: string, nodeId: string) => boolean) | undefined,
): NodeJudge {
  const parsed = parseQuery(query);
  if (parsed.predicates.length === 0) {
    return { terms: parsed.terms };
  }
  const caps = {
    hasAlias: (node: TreeNode) => hasCliAlias?.(accountId, node.id) ?? false,
    mcpAccess: (node: TreeNode) =>
      resolveMcpInTree(node, (id) => storage.getNode(accountId, id)).access,
  };
  return {
    terms: parsed.terms,
    matcherKey: query,
    matcher: (node: TreeNode) =>
      matchesTerms(nodeHaystack(node), parsed.terms) &&
      matchesPredicates(node, parsed.predicates, caps),
  };
}

/** The `has:`/`mcp:` tokens nobody recognises, for the search row to name rather than guess. */
export function unknownPredicatesIn(query: string): string[] {
  return parseQuery(query).unknown;
}

/**
 * The filter row. Counting spans accounts, and each account's judge closes over its own
 * resolver — so the count sums per account rather than pretending one judge serves all.
 */
export function searchRowFor(
  query: string,
  storage: StorageManager,
  filterMemo: FilterMemo,
  judgeFor: (accountId: string) => NodeJudge,
): vscode.TreeItem {
  return searchRowItem(
    query,
    searchTerms(query),
    () =>
      storage
        .getAccounts()
        .reduce(
          (sum, a) => sum + countMatches(storage, [a.accountId], judgeFor(a.accountId), filterMemo),
          0,
        ),
    unknownPredicatesIn(query),
  );
}
