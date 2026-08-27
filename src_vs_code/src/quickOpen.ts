import { EntityKind, TreeNode } from './types';
import { kindOf } from './entityKind';
import { nodeHaystack } from './treeSearch';

/**
 * "Go to entity" — one keystroke to the thing you want, without finding it in a tree.
 *
 * <p>The tree filter narrows what is DISPLAYED; this answers a different question: I know what
 * it is called, open it. Ctrl+Alt+P, one list across every account, the same shape VS Code's
 * own Go to File has, and the reason the audit called its absence out — a manager with sixty
 * commands and no way to jump to a credential makes people scroll.</p>
 *
 * <p><b>It matches exactly what the tree filter matches, and for the same reason.</b>
 * `nodeHaystack` is reused rather than re-derived: a picker that searched secrets would answer
 * "does any password contain `Tr0ub4`?" a keystroke at a time, which is the oracle
 * `treeSearch.ts` exists to refuse. Reusing the function makes that guarantee one
 * implementation instead of two that can drift.</p>
 *
 * <p>Pure and `vscode`-free — the caller renders the list.</p>
 */

export interface QuickOpenItem {
  /** The entity's name, as the picker shows it. */
  label: string;
  /** Account email + the folder path — what tells two `prod-db`s apart. */
  description: string;
  /** Host/user/command, the same line the tree row shows. */
  detail: string;
  /** Named entityKind, not kind: VS Code's QuickPickItem already owns that property. */
  entityKind: EntityKind;
  accountId: string;
  nodeId: string;
}

export interface QuickOpenAccount {
  accountId: string;
  email: string;
  nodes: readonly TreeNode[];
}

/** The parent, unless there is none or we have already walked through it. */
function lookupParent(
  node: TreeNode,
  byId: Map<string, TreeNode>,
  seen: Set<string>,
): TreeNode | undefined {
  const parentId = node.parentId ?? null;
  return parentId === null || seen.has(parentId) ? undefined : byId.get(parentId);
}

/**
 * Folder names from the root down to (but not including) the node itself.
 *
 * <p>Cycle-bounded through `seen`: `parentId` arrives by sync and by external import, so it is
 * data rather than an invariant, and an unguarded walk would hang the extension host on a
 * malformed tree instead of rendering a bad row.</p>
 */
export function folderPath(node: TreeNode, byId: Map<string, TreeNode>): string[] {
  const segments: string[] = [];
  const seen = new Set<string>([node.id]);
  let parent = lookupParent(node, byId, seen);
  while (parent !== undefined) {
    seen.add(parent.id);
    segments.unshift(parent.name);
    parent = lookupParent(parent, byId, seen);
  }
  return segments;
}

function describe(email: string, path: readonly string[]): string {
  return path.length > 0 ? `${email} · ${path.join(' / ')}` : email;
}

/** One flat list of every entity in every account, ready for a QuickPick. */
export function quickOpenItems(accounts: readonly QuickOpenAccount[]): QuickOpenItem[] {
  const items: QuickOpenItem[] = [];
  for (const account of accounts) {
    const byId = new Map(account.nodes.map((n) => [n.id, n]));
    for (const node of account.nodes) {
      if (node.type !== 'entity') {
        continue;
      }
      items.push({
        label: node.name,
        description: describe(account.email, folderPath(node, byId)),
        // The same text the filter matches — never a secret. See the module note.
        detail: nodeHaystack(node),
        entityKind: kindOf(node.details),
        accountId: account.accountId,
        nodeId: node.id,
      });
    }
  }
  return items.sort((a, b) => a.label.localeCompare(b.label));
}
