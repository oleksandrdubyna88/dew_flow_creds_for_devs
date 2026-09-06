import * as vscode from 'vscode';
import { accountFromTargetOrPick } from '../accountPick';
import { asElement } from '../commandTargets';
import { corpPolicy, factsOf, roleLabel } from '../corpPolicy';
import { describeError } from '../describeError';
import { MEMBER_ROLES, MemberListEntry, MemberRole, OrgMembersClient, SHARE_DEFAULTS, ShareDefault } from '../orgMembersClient';
import { showMemberPolicyView } from '../orgMemberPolicyPanel';
import { StorageManager } from '../storageManager';
import { CredTreeDataProvider } from '../treeDataProvider';
import { TransportFactory } from '../transportFactory';
import { StoredAccount } from '../types';

/**
 * The two role commands of epic 1: an admin sets a colleague's role from their Team row, and
 * anybody on a corporate server reads their own role and policy.
 *
 * <p>Registered from `activate` like every other family (`register…Commands(host)` with an
 * explicit host of the locals it uses), and the refusals are shown in the server's own words:
 * a `409` says the person is a recovery officer, a `403` says who may not do this, a `503` says a
 * record must be repaired — each is a sentence the admin acts on, and a bare status is none.</p>
 */
export interface OrgMemberCommandsHost {
  readonly provider: CredTreeDataProvider;
  /** Re-reads the viewing account's policy and roster after a change, so the row says the new role. */
  readonly refreshOrgPolicy: (account: StoredAccount) => Promise<void>;
  readonly register: (command: string, handler: (...args: unknown[]) => unknown) => void;
  readonly storage: StorageManager;
  readonly transports: TransportFactory;
}

export function registerOrgMemberCommands(host: OrgMemberCommandsHost): void {
  host.register('credSshManager.setMemberRole', (target) => runSetMemberRole(host, target));
  host.register('credSshManager.showMyRole', (target) => runShowMyRole(host, target));
}

/** What the picker says about each role — honest that the bans are a later version's. */
const ROLE_WORDS: Readonly<Record<MemberRole, string>> = {
  admin: 'Sees the roster, sets roles and the offline lease',
  member: "Today's behaviour — export, share with anyone in the domain",
  dev: 'No export, backup or clone; shares inside projects only (applied by a later version)',
};

const SHARE_WORDS: Readonly<Record<ShareDefault, string>> = {
  project: 'May share inside the projects they are assigned to',
  none: 'May receive shares, never send one',
};

interface MemberTarget {
  readonly admin: StoredAccount;
  readonly email: string;
}

interface RoleChange {
  readonly role: MemberRole;
  readonly shareDefault: ShareDefault | undefined;
}

/** The colleague's row, or nothing — the command is a row's, and the palette has no row to name. */
function memberTarget(host: OrgMemberCommandsHost, target: unknown): MemberTarget | undefined {
  const element = asElement(target);
  if (element?.kind !== 'teamMember') {
    void vscode.window.showInformationMessage('Set Role… is run from a colleague’s row under Team.');
    return undefined;
  }
  const admin = host.storage.getAccount(element.viaAccountId);
  return admin === undefined ? undefined : { admin, email: element.member.account.email };
}

/** What the roster already says about this person, so the picker can mark the current values. */
function rosterRow(host: OrgMemberCommandsHost, picked: MemberTarget): MemberListEntry | undefined {
  const wanted = picked.email.toLowerCase();
  return host.provider.orgRoster.get(picked.admin.accountId)?.find((row) => row.email.toLowerCase() === wanted);
}

async function pickRole(email: string, current: MemberListEntry | undefined): Promise<MemberRole | undefined> {
  const picked = await vscode.window.showQuickPick(
    MEMBER_ROLES.map((role) => ({
      label: role,
      description: current?.role === role ? '(current)' : undefined,
      detail: ROLE_WORDS[role],
      role,
    })),
    { title: `Role for ${email}`, placeHolder: 'What this person is on the server' },
  );
  return picked?.role;
}

async function pickShareDefault(current: MemberListEntry | undefined): Promise<ShareDefault | undefined> {
  const picked = await vscode.window.showQuickPick(
    SHARE_DEFAULTS.map((share) => ({
      label: share,
      description: current?.shareDefault === share ? '(current)' : undefined,
      detail: SHARE_WORDS[share],
      share,
    })),
    { title: 'Share default for a developer', placeHolder: 'Each project assignment may override it later' },
  );
  return picked?.share;
}

/** Role first, then the share default when the role is `dev`, then the call, then a refresh. */
async function runSetMemberRole(host: OrgMemberCommandsHost, target: unknown): Promise<void> {
  const picked = memberTarget(host, target);
  const client = picked && host.transports.orgMembersFor(picked.admin);
  if (picked === undefined || client === undefined) {
    return;
  }
  await applyRole(host, client, picked, await pickChange(picked.email, rosterRow(host, picked)));
}

/**
 * The share default is asked only for a developer, because it only takes effect for one; an admin
 * promoting somebody to member is not asked a question whose answer changes nothing. Escaping
 * either picker cancels the whole change — nothing is sent on a half-answer.
 */
async function pickChange(email: string, current: MemberListEntry | undefined): Promise<RoleChange | undefined> {
  const role = await pickRole(email, current);
  if (role === undefined) {
    return undefined;
  }
  if (role !== 'dev') {
    return { role, shareDefault: undefined };
  }
  const shareDefault = await pickShareDefault(current);
  return shareDefault === undefined ? undefined : { role, shareDefault };
}

async function applyRole(
  host: OrgMemberCommandsHost,
  client: OrgMembersClient,
  picked: MemberTarget,
  change: RoleChange | undefined,
): Promise<void> {
  if (change === undefined) {
    return; // cancelled in a picker
  }
  try {
    const row = await client.setMember(picked.admin, picked.email, change);
    await host.refreshOrgPolicy(picked.admin);
    host.provider.refresh();
    void vscode.window.showInformationMessage(`${row.email} is now ${roleLabel(row.role, row.isOfficer)} on ${client.location}.`);
  } catch (error) {
    // A 409 (a recovery officer), a 403, a 503 — the server's own sentence, which is the one the
    // admin can act on.
    void vscode.window.showErrorMessage(`Could not set the role of ${picked.email}: ${describeError(error)}`);
  }
}

/** A fresh read, not the cache: the page is where somebody goes to see what is true NOW. */
async function runShowMyRole(host: OrgMemberCommandsHost, target: unknown): Promise<void> {
  const account = await accountFromTargetOrPick(target, host.storage, 'My role and policy for…');
  if (account === undefined) {
    return;
  }
  const client = host.transports.orgMembersFor(account);
  if (client === undefined) {
    void vscode.window.showInformationMessage(`${account.email} does not sync to a vault server, so it has no corporate role.`);
    return;
  }
  try {
    const me = await client.readMe(account);
    showMemberPolicyView({
      accountEmail: account.email,
      location: client.location,
      state: corpPolicy(factsOf(me, Date.now())),
    });
  } catch (error) {
    void vscode.window.showErrorMessage(`Could not read your role and policy: ${describeError(error)}`);
  }
}
