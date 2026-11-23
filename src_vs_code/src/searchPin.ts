/**
 * The search, pinned.
 *
 * <p>A tree cannot pin a row: the filter row scrolls away with everything else, and a long tree
 * leaves no way back to it. What does not scroll is the view's title bar and the line above the
 * tree (`TreeView.message`). The title bar carries the magnifier and, while a filter is on, a Clear
 * Filter gated on {@link SEARCH_ACTIVE_CONTEXT}; the line repeats what the row says. This file is
 * the one place that keeps the two in step with the row.</p>
 *
 * <p>It imports nothing — not `vscode`, not another module of ours — so the rule "when is the
 * filter on, and what does the line say" is a unit test that needs no stub, and it stays out of
 * `treeDataProvider.ts`, which answers to an 800-line ceiling. It reads the row through
 * `getTreeItem` rather than the provider's own fields, so the banner can only ever say what the row
 * says.</p>
 */

/** The context key the title bar's Clear Filter is gated on — the same string as package.json's view/title `when`. */
export const SEARCH_ACTIVE_CONTEXT = 'credSshManager.searchActive';

/**
 * The `contextValue` the filter row carries while a filter is on. `searchRowItem` imports it from
 * here, so the row and this file's reading of it share one string.
 */
export const SEARCH_ACTIVE_ROW_CONTEXT = 'credSearchActive';

/** The three fields of a `vscode.TreeItem` the pin reads, and nothing else. */
export interface SearchRowLike {
  readonly label?: string | { readonly label: string };
  readonly description?: string | boolean;
  readonly contextValue?: string;
}

interface PinnedSearchState {
  readonly message: string;
  readonly active: boolean;
}

/** What the pin needs of a `vscode.TreeView`. */
interface SearchPinView {
  message?: string;
}

/** What the pin needs of the tree provider. `getTreeItem` is synchronous on purpose. */
interface SearchPinTree {
  onDidChangeTreeData(listener: () => void): { dispose(): void };
  getTreeItem(element: { kind: 'search' }): SearchRowLike;
}

export type SetContext = (key: string, value: boolean) => void;

function labelText(label: SearchRowLike['label']): string {
  return typeof label === 'string' ? label : (label?.label ?? '');
}

/** `true` means "derive it from the resourceUri" to VS Code — it is not text. */
function descriptionText(description: SearchRowLike['description']): string {
  return typeof description === 'string' ? description : '';
}

/** The row's own text, carried as it is: no trim, no rewording — and never a dangling dash. */
function bannerText(row: SearchRowLike): string {
  const label = labelText(row.label);
  const description = descriptionText(row.description);
  return description === '' ? label : `${label} — ${description}`;
}

export function pinnedSearchState(row: SearchRowLike): PinnedSearchState {
  const active = row.contextValue === SEARCH_ACTIVE_ROW_CONTEXT;
  return { message: active ? bannerText(row) : '', active };
}

/**
 * Applies the row's state to the view at once, then again on every repaint of the tree.
 *
 * <p>The first application is unconditional, idle included: a context key lives in the window and
 * outlives an extension-host restart, so `false` has to be said, not assumed. After that only what
 * changed is sent — the message and the key are compared separately, so a new count rewrites the
 * banner without touching the key. The row is read before anything is written, so a throw leaves
 * nothing half-sent and the next event repairs it. No timer of its own: the provider already
 * coalesces keystrokes, and a second one would let the banner lag the row.</p>
 *
 * <p>Disposing ends the subscription and does nothing else.</p>
 */
export function pinSearch(view: SearchPinView, tree: SearchPinTree, setContext: SetContext): { dispose(): void } {
  const read = (): PinnedSearchState => pinnedSearchState(tree.getTreeItem({ kind: 'search' }));
  const first = read();
  view.message = first.message;
  setContext(SEARCH_ACTIVE_CONTEXT, first.active);
  let sent = first;

  return tree.onDidChangeTreeData(() => {
    const next = read();
    if (next.message !== sent.message) {
      view.message = next.message;
    }
    if (next.active !== sent.active) {
      setContext(SEARCH_ACTIVE_CONTEXT, next.active);
    }
    sent = next;
  });
}
