import * as vscode from 'vscode';
import { CorpPolicyState, isCorpAdmin, teamMemberDescription, teamRowRole } from './corpPolicy';
import { MemberListEntry, ProjectRow } from './orgMembersClient';
import { TeamFailure, diagnoseTeamFailure } from './teamDiagnosis';
import { StoredAccount, TeamMember, TreeElement } from './types';

/**
 * The Team rows — the scope row and one row per colleague — out of `treeDataProvider.ts`, which
 * sat at exactly the 800-line ceiling the moment the roles landed (the same move `accountItem.ts`
 * made for the account row, T32). Everything a row decides is taken as an argument, so the row
 * can be built in a test without the provider.
 */

/**
 * What a Team row reads off the provider, as a shape rather than as the provider.
 *
 * <p>Structural on purpose: the provider satisfies it by having the four fields, and a test
 * satisfies it with four plain maps. It is what lets the dispatcher below live here instead of in
 * `getTreeItem`, which is the point — `treeDataProvider.ts` is AT its 800-line ceiling
 * (`eslint.config.mjs`), so the Server section could not be written until something moved out.</p>
 */
export interface TeamRowSource {
  readonly sharing: {
    teamFor(account: StoredAccount): readonly TeamMember[];
    readonly teamFailures: ReadonlyMap<string, TeamFailure>;
  } | undefined;
  readonly orgPolicy: ReadonlyMap<string, CorpPolicyState>;
  readonly orgRoster: ReadonlyMap<string, readonly MemberListEntry[]>;
  readonly orgProjects: ReadonlyMap<string, readonly ProjectRow[]>;
}

/** Every Team row, dispatched by kind — the two arms `getTreeItem` used to spell inline. */
export function teamRowFor(
  element: Extract<TreeElement, { kind: 'teamScope' | 'teamMember' }>,
  source: TeamRowSource,
  collapsibleState: vscode.TreeItemCollapsibleState,
): vscode.TreeItem {
  return element.kind === 'teamScope'
    ? scopeRow(element.account, source, collapsibleState)
    : memberRow(element, source);
}

function scopeRow(
  account: StoredAccount,
  source: TeamRowSource,
  collapsibleState: vscode.TreeItemCollapsibleState,
): vscode.TreeItem {
  return teamScopeItem({
    account,
    collapsibleState,
    count: source.sharing?.teamFor(account).length ?? 0,
    failure: source.sharing?.teamFailures.get(account.accountId),
  });
}

/** The VIEWING account decides the row's menu and what it knows of the colleague's role. */
function memberRow(
  element: Extract<TreeElement, { kind: 'teamMember' }>,
  source: TeamRowSource,
): vscode.TreeItem {
  return teamMemberItem({
    member: element.member,
    viaAccountId: element.viaAccountId,
    viewer: source.orgPolicy.get(element.viaAccountId),
    roster: source.orgRoster.get(element.viaAccountId),
    projects: source.orgProjects.get(element.viaAccountId),
  });
}

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
  /** The server's projects, for turning this colleague's project ids into names. */
  readonly projects: readonly ProjectRow[] | undefined;
}

/**
 * A colleague's row.
 *
 * <p>The `contextValue` says whether the VIEWER administers, not who the colleague is:
 * `teamMember-adminView` is what *Set Role…* is gated on, so the QuickPick does not appear for a
 * member looking at colleagues. Every other Team-row entry is gated on the `teamMember` prefix,
 * which both values share — a bare `== teamMember` would vanish for admins.</p>
 */
/**
 * This colleague's projects, named where they can be named.
 *
 * <p>An id the list cannot name stays in the array as an empty string, so the row's count keeps
 * telling the truth: somebody on nine projects reads as three names and `+6` even when one of the
 * nine could not be resolved. Dropping it would say they are on fewer projects than they are.</p>
 */
function namesOf(
  ids: readonly string[] | undefined,
  projects: readonly ProjectRow[] | undefined,
): readonly string[] {
  if (ids === undefined) {
    return [];
  }
  const byId = new Map((projects ?? []).map((project) => [project.id, project.name]));
  return ids.map((id) => byId.get(id) ?? '');
}

export function teamMemberItem(input: TeamMemberRowInput): vscode.TreeItem {
  const { account, isSelf } = input.member;
  const item = new vscode.TreeItem(isSelf ? `${account.email} (you)` : account.email, vscode.TreeItemCollapsibleState.None);
  item.id = `team:${input.viaAccountId}:${account.accountId}`;
  item.contextValue = isCorpAdmin(input.viewer) ? 'teamMember-adminView' : 'teamMember';
  item.iconPath = new vscode.ThemeIcon('person', TEAM_COLOR);
  item.description = teamMemberDescription(
    account.provider,
    teamRowRole({ email: account.email, isSelf }, input.viewer, input.roster),
    namesOf(input.member.projectIds, input.projects),
  );
  return item;
}

/**
 * One sender's row under *Shared with me*.
 *
 * <p>Here with the other people rows, and moved out of `treeDataProvider.ts` for the reason this
 * file's header gives: that file is at the 800-line ceiling, and a row that decides nothing beyond
 * its own text belongs with the ones already moved for the same reason.</p>
 *
 * <p>`unverified` is taken as an ARGUMENT rather than computed here, because answering it needs the
 * provider's share sources — and a row that can be built without them is a row a test can build.</p>
 */
export function sharedSenderItem(email: string, unverified: boolean): vscode.TreeItem {
  const item = new vscode.TreeItem(email, vscode.TreeItemCollapsibleState.Expanded);
  item.id = `sender:${email}`;
  item.contextValue = 'sharedSender';
  // A name is the first thing the eye lands on, and on a shared folder it is a string the writer
  // chose rather than an identity anyone checked. The accept dialog says so too, but by then the
  // reader has already decided who this is from.
  item.iconPath = unverified
    ? new vscode.ThemeIcon('unverified', new vscode.ThemeColor('problemsWarningIcon.foreground'))
    : new vscode.ThemeIcon('account', TEAM_COLOR);
  item.description = unverified ? 'unverified sender' : undefined;
  item.tooltip = unverified
    ? `${email} — claimed, not verified. This share came through a shared folder, where anyone with write access can put any name here. A share through the vault server carries a sender stamped from a verified sign-in.`
    : `${email} — stamped by the vault server from a verified sign-in.`;
  return item;
}

/**
 * The inbox root — what other people have sent this window.
 *
 * <p>Here with the Team rows for the reason the file's own note gives: `treeDataProvider.ts` sits
 * at the 800-line ceiling, and a row that decides nothing beyond its own text belongs with the
 * others that were moved out for the same reason. It is about other PEOPLE, which is what this
 * file already collects.</p>
 */
export function sharedRootItem(count: number): vscode.TreeItem {
  const item = new vscode.TreeItem('Shared with me', vscode.TreeItemCollapsibleState.Expanded);
  item.id = 'sharedRoot';
  item.contextValue = 'sharedRoot';
  item.iconPath = new vscode.ThemeIcon('gift');
  item.description = `${count}`;
  return item;
}
