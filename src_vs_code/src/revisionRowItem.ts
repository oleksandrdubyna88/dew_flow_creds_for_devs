import * as vscode from 'vscode';
import { RevisionHead, summarizeRevision } from './revisionHistory';
import { TreeElement } from './types';

/**
 * One kept version, as a row under its entity.
 *
 * <p>Moved out of `treeDataProvider.ts` for the reason that file's shape keeps answering to: it
 * enforces an 800-line ceiling, and remembering which rows were open pushed it to 815. This
 * builder reads nothing off the provider except the head it is handed, so it is the cheapest
 * thing in there to give its own file.</p>
 */

/** Blue, so "this has been changed" is visible in the tree rather than only after opening it. */
const HISTORY_COLOR = new vscode.ThemeColor('credSshManager.historyIcon');

export function revisionRowItem(
  element: Extract<TreeElement, { kind: 'revision' }>,
  head: RevisionHead | undefined,
): vscode.TreeItem {
  const label = head === undefined ? 'version no longer kept' : summarizeRevision(head);
  const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
  item.id = `${element.accountId}:${element.node.id}:rev${element.index}`;
  item.contextValue = revisionContextValue(head);
  item.iconPath = new vscode.ThemeIcon('history', HISTORY_COLOR);
  item.description =
    element.index === 0 ? 'previous version' : `${element.index + 1} versions ago`;
  item.tooltip =
    head === undefined
      ? undefined
      : `Replaced ${new Date(head.at).toLocaleString()} — click to see what it was. Clone it to bring it back as a new entry.`;
  // A single click opens it: unlike an entity, a version has no other single-click job.
  item.command = {
    command: 'credSshManager.revisionClicked',
    title: 'Show version',
    arguments: [element],
  };
  return item;
}

/**
 * `revision`, plus the entity's own command/script suffixes and nothing else — so Run and Copy
 * Command reach a version while Edit, Share and Copy Password never do.
 */
function revisionContextValue(head: RevisionHead | undefined): string {
  const details = head?.details;
  return `revision${suffix(details?.isTerminal, ':cmd')}${suffix(details?.isScript, ':script')}`;
}

function suffix(on: boolean | undefined, token: string): string {
  return on === true ? token : '';
}
