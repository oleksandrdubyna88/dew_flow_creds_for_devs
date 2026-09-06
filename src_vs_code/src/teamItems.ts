import * as vscode from 'vscode';
import { CorpPolicyState, isCorpAdmin, teamMemberDescription, teamRowRole } from './corpPolicy';
import { MemberListEntry } from './orgMembersClient';
import { TeamFailure, diagnoseTeamFailure } from './teamDiagnosis';
import { StoredAccount, TeamMember } from './types';

/**
 * The Team rows — the scope row and one row per colleague — out of `treeDataProvider.ts`, which
 * sat at exactly the 800-line ceiling the moment the roles landed (the same move `accountItem.ts`
 * made for the account row, T32). Everything a row decides is taken as an argument, so the row
 * can be built in a test without the provider.
 */

/** Team/people rows are dark blue so they read as "other people", not data. */
export const TEAM_COLOR = new vscode.ThemeColor('credSshManager.teamIcon');

export interface TeamScopeRowInput {
  readonly account: StoredAccount;
  readonly collapsibleState: vscode.TreeItemCollapsibleState;
  readonly count: number;
  /** Why the last team read failed, when it did. */
  readonly failure: TeamFailure | undefined;
}

export function teamScopeItem(input: TeamScopeRowInput): vscode.TreeItem {
  const item = new vscode.TreeItem('Team', input.collapsibleState);
  item.id = `teamScope:${input.account.accountId}`;
  item.contextValue = 'teamScope';
  // An empty team and a refused one used to look identical. Only one of them
  // is somebody's fault, and it is the one nobody could see.
  if (input.failure === undefined) {
    item.iconPath = new vscode.ThemeIcon('organization', TEAM_COLOR);
    item.description = `${input.count}`;
  } else {
    item.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('problemsWarningIcon.foreground'));
    item.description = input.failure.status === undefined ? 'unreachable' : `refused (${input.failure.status})`;
    item.tooltip = diagnoseTeamFailure(input.failure);
  }
  return item;
}

export interface TeamMemberRowInput {
  readonly member: TeamMember;
  readonly viaAccountId: string;
  /** The VIEWING account's policy state — absent means no document yet, or no server. */
  readonly viewer: CorpPolicyState | undefined;
  /** The viewing account's roster, held only when it administers. */
  readonly roster: readonly MemberListEntry[] | undefined;
}

/**
 * A colleague's row.
 *
 * <p>The `contextValue` says whether the VIEWER administers, not who the colleague is:
 * `teamMember-adminView` is what *Set Role…* is gated on, so the QuickPick does not appear for a
 * member looking at colleagues. Every other Team-row entry is gated on the `teamMember` prefix,
 * which both values share — a bare `== teamMember` would vanish for admins.</p>
 */
export function teamMemberItem(input: TeamMemberRowInput): vscode.TreeItem {
  const { account, isSelf } = input.member;
  const item = new vscode.TreeItem(isSelf ? `${account.email} (you)` : account.email, vscode.TreeItemCollapsibleState.None);
  item.id = `team:${input.viaAccountId}:${account.accountId}`;
  item.contextValue = isCorpAdmin(input.viewer) ? 'teamMember-adminView' : 'teamMember';
  item.iconPath = new vscode.ThemeIcon('person', TEAM_COLOR);
  item.description = teamMemberDescription(
    account.provider,
    teamRowRole({ email: account.email, isSelf }, input.viewer, input.roster),
  );
  return item;
}
