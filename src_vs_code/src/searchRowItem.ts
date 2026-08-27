import * as vscode from 'vscode';

/**
 * The filter row.
 *
 * <p>A tree cannot hold a real text field — the API takes rows, not widgets — so the row IS the
 * field: clicking it opens an input that filters as you type, and it then shows the term it is
 * filtering by, with how many entries survived. The count is the part that matters when nothing
 * matches, because an empty tree and a broken tree look identical otherwise.</p>
 *
 * <p>Moved out of `treeDataProvider.ts` for the reason that file keeps answering to, and for the
 * second time: it enforces an 800-line ceiling, and the bridge's `:bridged` / `:nobridge` pair
 * pushed it to 810. `revisionRowItem.ts` was the first; this row is the next cheapest, because it
 * reads nothing off the provider that cannot be handed to it.</p>
 */

/** Everything that differs between filtering and not, decided once instead of five times. */
interface RowLook {
  readonly label: string;
  readonly contextValue: string;
  readonly icon: string;
  readonly description: string;
  readonly tooltip: string;
}

export function searchRowItem(
  query: string,
  terms: readonly string[],
  /** Deferred: the count is a scan of every entry, and an inactive filter must not pay for it. */
  countFound: () => number,
): vscode.TreeItem {
  const look = terms.length > 0 ? filtering(query, countFound()) : IDLE;
  const item = new vscode.TreeItem(look.label, vscode.TreeItemCollapsibleState.None);
  item.id = 'search';
  item.contextValue = look.contextValue;
  item.iconPath = new vscode.ThemeIcon(look.icon);
  item.description = look.description;
  item.tooltip = look.tooltip;
  item.command = { command: 'credSshManager.search', title: 'Search' };
  return item;
}

/**
 * Filtering by something.
 *
 * <p>`credSearchActive` is a second context value rather than a flag, because the × is
 * contributed as an inline action and an inline action cannot be conditional on anything but
 * this string.</p>
 */
function filtering(query: string, found: number): RowLook {
  return {
    label: `Search: ${query}`,
    contextValue: 'credSearchActive',
    icon: 'filter-filled',
    // "nothing matches" rather than "0 found": the empty case is the one worth spelling out,
    // because an empty tree and a broken tree look identical otherwise.
    description: found === 0 ? 'nothing matches' : `${found} found`,
    tooltip: `Filtering by "${query}" — click to change it, × to clear. Secrets are never searched.`,
  };
}

/** Not filtering: the row advertises what it is for, since nothing else in the tree does. */
const IDLE: RowLook = {
  label: 'Search',
  contextValue: 'credSearch',
  icon: 'search',
  description: 'filter by name, host, command…',
  tooltip: 'Click to filter the tree as you type. Names, hosts, users, commands — never secrets.',
};
