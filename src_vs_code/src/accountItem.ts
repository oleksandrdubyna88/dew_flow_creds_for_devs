import * as vscode from 'vscode';
import { OwnedShare, StoredAccount, TreeNode } from './types';
import { accountCounts, formatAccountCounts } from './accountCounts';
import { OrgRecoveryAccess, accountContextValue } from './orgRecoveryAccess';

/**
 * The account row and the separator row, out of `treeDataProvider.ts` — which crossed the
 * 800-line ceiling the moment the counts landed (T32). Everything the row decides is taken as
 * an argument, so the row can be built in a test without the provider.
 */

export interface AccountRowInput {
  readonly account: StoredAccount;
  readonly collapsibleState: vscode.TreeItemCollapsibleState;
  /** What the org-recovery menu decides from — `'none'` for an ordinary account. */
  readonly orgAccess: OrgRecoveryAccess;
  readonly readiness: { ready: boolean; reason?: string } | undefined;
  readonly extensionUri: vscode.Uri;
  readonly nodes: readonly TreeNode[];
  readonly byId: (id: string) => TreeNode | undefined;
  readonly ownShares: readonly OwnedShare[];
}

export function accountItem(input: AccountRowInput): vscode.TreeItem {
  const { account, readiness } = input;
  const item = new vscode.TreeItem(account.email, input.collapsibleState);
  item.id = `account:${account.accountId}`;
  // The menu a row offers is chosen HERE, by the value the `when` clauses match. Ordinary
  // accounts keep the exact string every other entry was contributed against.
  item.contextValue = accountContextValue(input.orgAccess);
  // An SVG file, not a ThemeIcon with a colour: VS Code repaints themed icons in the
  // selection colour the moment the row is selected, which made a signed-in account
  // look signed-out exactly while you were looking at it.
  item.iconPath = vscode.Uri.joinPath(
    input.extensionUri,
    'media',
    readiness?.ready === true ? 'account-green.svg' : 'account-grey.svg',
  );
  // The reason belongs on the row itself: a grey icon that does not say why is a riddle.
  // The three counts (T32) replace the row's plus: entries / trash / shared, zeros written
  // out. Colours for the numbers are not expressible in a description — recorded in
  // accountCounts.ts.
  const counts = accountCounts(input.nodes, input.byId, input.ownShares, account.accountId);
  item.description = describeAccount(account.provider, formatAccountCounts(counts), readiness);
  item.tooltip = `${counts.entries} entries · ${counts.trash} in the Trash · ${counts.shared} shared with this account`;
  return item;
}

/** Provider · counts · the not-ready reason, when there is one. */
function describeAccount(
  provider: string,
  counts: string,
  readiness: AccountRowInput['readiness'],
): string {
  const reason = readiness !== undefined && !readiness.ready ? readiness.reason : undefined;
  return [provider, counts, reason].filter(Boolean).join('  ·  ');
}

/**
 * Inert on purpose (T29): no command, no icon, and a contextValue no menu contribution
 * matches — a separator that grows a right-click menu has stopped separating.
 */
export function separatorItem(afterAccountId: string): vscode.TreeItem {
  const item = new vscode.TreeItem('', vscode.TreeItemCollapsibleState.None);
  item.id = `separator:${afterAccountId}`;
  item.contextValue = 'separator';
  return item;
}
