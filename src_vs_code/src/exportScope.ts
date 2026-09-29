import { EntityMetadata, TreeNode } from './types';
import { listOf } from './sentenceList';

/**
 * What may LEAVE this vault for another person — issue #122's *Not for export* mark.
 *
 * <p>An entry marked `notForExport` is never handed to *Share with…* (either transport: the vault
 * server or a shared folder) or written into *Export / Share Externally…*'s file. Inside a selected
 * folder it is left out and NAMED; when nothing else is left, the action is refused. Both handlers
 * ask this module first, before any prompt, so the person hears what will stay behind before they
 * pick a form, a password or a recipient (gate plan round, findings 4, 10 and 12).</p>
 *
 * <p>What it does NOT stop, deliberately: *Share with Claude Code…* (an agent uses the entry through
 * the window and never receives the secret), backup, sync and every local use. And it is an
 * honest-client control — the person can still read their own secret and paste it anywhere; the mark
 * closes the product's own exits, not the person's.</p>
 *
 * <p>Pure: the tree comes in as nodes, so the walk is testable without a store.</p>
 */

/** The two exits the mark closes, in the words the sentences below use. */
export type LeavingAction = 'share' | 'export';

export interface ExportScope {
  /** Every node that leaves: the selected roots' subtrees, marked entities removed. */
  readonly kept: readonly TreeNode[];
  /** The marked entities that were in the selection, in walk order — named to the person. */
  readonly withheld: readonly TreeNode[];
}

/** Marked *Not for export* — an entity only; a folder carries no mark of its own. */
export function isNotForExport(node: TreeNode): boolean {
  return node.type === 'entity' && node.details?.notForExport === true;
}

/**
 * A folder brings its whole subtree; an entity brings itself. Moved here from `exportCommand.ts`
 * (reuse-first) so the share handler and the export handler walk the same way. Indexed once rather
 * than filtered per folder: the filter form is O(nodes × folders), which on a vault of ten thousand
 * nodes is the difference between an instant prompt and a visible pause.
 */
export function subtreeNodes(all: readonly TreeNode[], roots: readonly TreeNode[]): TreeNode[] {
  const children = indexByParent(all);
  const picked: TreeNode[] = [];
  // Visited, because a parent cycle is a tree no editor makes but a merge or a hand-edited import can
  // deliver — and without this the walk recursed until the stack gave out (code gate, round 1).
  const seen = new Set<string>();
  const collect = (node: TreeNode): void => {
    if (seen.has(node.id)) {
      return;
    }
    seen.add(node.id);
    picked.push(node);
    for (const child of children.get(node.id) ?? []) {
      collect(child);
    }
  };
  for (const root of roots) {
    collect(root);
  }
  return picked;
}

/** The selection split into what leaves and what stays behind. */
export function exportScope(all: readonly TreeNode[], roots: readonly TreeNode[]): ExportScope {
  const walked = subtreeNodes(all, roots);
  return {
    kept: walked.filter((node) => !isNotForExport(node)),
    withheld: walked.filter(isNotForExport),
  };
}

/**
 * An accepted UPDATE keeps the marks the recipient set on their own copy. The sender's payload never
 * carries them — a marked entry does not leave, and a PIN is the recipient's own — so rebuilding the
 * node from the payload alone dropped them silently: the recipient's next folder share sent a
 * Not-for-export entry on (own review), and a protected entry stopped claiming its PIN while its
 * values were still sealed (entry-PIN plan, D9). One helper, so a third mark is one line here.
 *
 * <p>`pinEpoch` is not listed: the plan puts it on the NODE, not in `details` (§5.9), so when it
 * exists it is carried where the node is rebuilt (`shareUpdateSeal.rebuilt`).</p>
 */
export function keepingMark(incoming: EntityMetadata | undefined, existing: TreeNode | undefined): EntityMetadata | undefined {
  return incoming === undefined ? undefined : { ...incoming, ...recipientMarks(existing) };
}

/** The marks a recipient sets on their own copy, which no payload carries. */
const RECIPIENT_MARKS = ['notForExport', 'pinProtected'] as const;

/** The marks this recipient set, and only those that are set — an absent mark adds no key. */
function recipientMarks(node: TreeNode | undefined): Partial<EntityMetadata> {
  const details = node?.details;
  return Object.fromEntries(RECIPIENT_MARKS.filter((mark) => details?.[mark] === true).map((mark) => [mark, true]));
}

/** True when the selection had marked entries and nothing ELSE that could leave. */
export function nothingLeaves(scope: ExportScope): boolean {
  return scope.withheld.length > 0 && !scope.kept.some((node) => node.type === 'entity');
}

/**
 * Said BEFORE the first prompt of a share or an export that goes ahead without some entries — so
 * the person choosing a recipient or a password already knows the result will be partial.
 */
export function withheldNote(action: LeavingAction, withheld: readonly TreeNode[]): string {
  if (withheld.length === 0) {
    return '';
  }
  const verb = action === 'share' ? 'shared' : 'exported';
  return `${namesOf(withheld)} ${withheld.length === 1 ? 'is' : 'are'} marked Not for export and will not be ${verb}; the rest will be.`;
}

/** The refusal when every entry selected is marked — with where the mark is changed. */
export function nothingLeavesNote(action: LeavingAction, withheld: readonly TreeNode[]): string {
  const one = withheld.length === 1;
  const subject = one ? `${namesOf(withheld)} is` : `everything selected (${namesOf(withheld)}) is`;
  const where = one ? 'the entry\'s Edit → General to let it' : 'each entry\'s Edit → General to let them';
  return `Nothing to ${action}: ${subject} marked Not for export. Untick it in ${where} leave.`;
}

/**
 * The step both handlers take before their first prompt: refuse when nothing may leave, name what
 * stays behind when something does, and hand back the scope to act on. `say` is the handler's
 * warning — injected so this stays free of `vscode` and one sentence cannot be worded twice.
 */
export function admitLeaving(
  action: LeavingAction,
  all: readonly TreeNode[],
  roots: readonly TreeNode[],
  say: (message: string) => void,
): ExportScope | undefined {
  const scope = exportScope(all, roots);
  if (nothingLeaves(scope)) {
    say(nothingLeavesNote(action, scope.withheld));
    return undefined;
  }
  if (scope.withheld.length > 0) {
    say(withheldNote(action, scope.withheld));
  }
  return scope;
}

/** Up to five names, quoted, then a count — a notification is not a list view. */
function namesOf(nodes: readonly TreeNode[]): string {
  const shown = nodes.slice(0, 5).map((node) => `"${node.name}"`);
  const rest = nodes.length - shown.length;
  return rest > 0 ? `${shown.join(', ')} and ${rest} more` : listOf(shown);
}

/** Every node's children, in one pass — the index that keeps the walk above linear. */
function indexByParent(nodes: readonly TreeNode[]): Map<string, TreeNode[]> {
  const children = new Map<string, TreeNode[]>();
  for (const node of nodes) {
    const parent = node.parentId ?? '';
    const siblings = children.get(parent) ?? [];
    siblings.push(node);
    children.set(parent, siblings);
  }
  return children;
}
