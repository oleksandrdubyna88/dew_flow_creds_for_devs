import { TreeElement, TreeNode } from './types';

/**
 * Which nodes a bulk action actually runs on, out of a raw tree selection.
 *
 * <p>The constraint this module exists for: VS Code evaluates a context menu's `when`
 * clause against the <b>anchor row only</b>, never the whole selection. A folder can
 * therefore sit in a selection whose anchor was an entity, and a second profile's node in
 * one whose anchor was the first — and the menu offers the command regardless. Every
 * eligibility rule has to live here, in code with tests, rather than in a `when` clause
 * that cannot see past one row.</p>
 *
 * <p>Pure, and takes plain data rather than a storage object, so the rules are testable
 * without an editor — the same shape as `mergeProfiles` and `resolveShares`.</p>
 */

export interface SelectedNode {
  accountId: string;
  node: TreeNode;
}

export interface ResolvedSelection {
  /** In selection order, deduped, no node covered by another. */
  targets: SelectedNode[];
  /** Accounts, team rows, inbox rows — nothing a bulk action can act on. */
  skippedNonNode: number;
  /** Nodes from a profile other than the anchor's. */
  skippedOtherAccount: number;
  /** Nodes a selected folder already contains. Not reported to the user — see below. */
  skippedCoveredByAncestor: number;
}

/**
 * `rootId` and everything beneath it, in tree order — the set a recursive delete removes.
 *
 * <p>Lived inside `deleteNodeRecursive` until the write-order work needed the room; it is a pure
 * question about a node list, which is what this module is for. Repeated sweeps rather than
 * recursion, so a parent listed after its child is still collected and a cycle cannot hang it.</p>
 */
export function subtreeOf(nodes: readonly TreeNode[], rootId: string): readonly TreeNode[] {
  const inside = new Set<string>([rootId]);
  while (addChildren(nodes, inside)) {
    // Until the set stops growing.
  }
  return nodes.filter((node) => inside.has(node.id));
}

/** One sweep: every node whose parent is already inside joins it. True when the set grew. */
function addChildren(nodes: readonly TreeNode[], inside: Set<string>): boolean {
  const found = nodes.filter((n) => n.parentId != null && inside.has(n.parentId) && !inside.has(n.id));
  for (const node of found) {
    inside.add(node.id);
  }
  return found.length > 0;
}

/** Whether `nodeId` is `ancestorId` or lives under it, walking the real tree. */
// eslint-disable-next-line complexity
export function isSelfOrDescendantIn(
  nodes: readonly TreeNode[],
  ancestorId: string,
  nodeId: string,
): boolean {
  if (ancestorId === nodeId) {
    return true;
  }
  let current = nodes.find((n) => n.id === nodeId);
  const seen = new Set<string>();
  while (current?.parentId != null && !seen.has(current.id)) {
    seen.add(current.id);
    if (current.parentId === ancestorId) {
      return true;
    }
    current = nodes.find((n) => n.id === current?.parentId);
  }
  return false;
}

// eslint-disable-next-line complexity
export function resolveSelection(
  clicked: TreeElement | undefined,
  selected: readonly (TreeElement | undefined)[] | undefined,
  accountNodes: readonly TreeNode[],
): ResolvedSelection {
  const empty: ResolvedSelection = {
    targets: [],
    skippedNonNode: 0,
    skippedOtherAccount: 0,
    skippedCoveredByAncestor: 0,
  };
  if (clicked === undefined || clicked.kind !== 'node') {
    return empty;
  }
  // No selection array at all is the ordinary single-click, a keybinding, or the command
  // palette — the clicked row is the selection.
  const raw = selected !== undefined && selected.length > 0 ? selected : [clicked];

  let skippedNonNode = 0;
  let skippedOtherAccount = 0;
  const picked: SelectedNode[] = [];
  const seen = new Set<string>();
  for (const element of raw) {
    if (element === undefined || element.kind !== 'node') {
      skippedNonNode += 1;
      continue;
    }
    if (element.accountId !== clicked.accountId) {
      skippedOtherAccount += 1;
      continue;
    }
    if (seen.has(element.node.id)) {
      continue;
    }
    seen.add(element.node.id);
    picked.push({ accountId: element.accountId, node: element.node });
  }

  // A folder already carries everything under it: deleting it removes the child,
  // exporting it includes the child, sharing it shares the child. Acting on both would
  // double-count at best.
  const ids = new Set(picked.map((p) => p.node.id));
  const targets = picked.filter(
    (p) =>
      ![...ids].some(
        (other) => other !== p.node.id && isSelfOrDescendantIn(accountNodes, other, p.node.id),
      ),
  );

  return {
    targets,
    skippedNonNode,
    skippedOtherAccount,
    skippedCoveredByAncestor: picked.length - targets.length,
  };
}

/**
 * One sentence about what was left out, or `''`.
 *
 * <p>`skippedCoveredByAncestor` is deliberately silent: selecting a folder together with
 * something inside it is an ordinary shift-click, not a mistake, and a toast about it
 * would fire on every second use until people stopped reading toasts.</p>
 */
export function describeSkips(resolved: ResolvedSelection): string {
  const parts: string[] = [];
  if (resolved.skippedNonNode > 0) {
    parts.push(`${resolved.skippedNonNode} selected row(s) are not folders or entries`);
  }
  if (resolved.skippedOtherAccount > 0) {
    parts.push(`${resolved.skippedOtherAccount} belong to another profile`);
  }
  return parts.length === 0 ? '' : `Skipped: ${parts.join(', ')}.`;
}
