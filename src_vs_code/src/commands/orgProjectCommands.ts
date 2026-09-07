import * as vscode from 'vscode';
import { CredTreeDataProvider } from '../treeDataProvider';
import { PROJECT_SHARES, ProjectRow, ProjectShare } from '../orgMembersClient';
import { RefreshOutcome } from '../orgPolicyRefresh';
import { StorageManager } from '../storageManager';
import { StoredAccount } from '../types';
import { TransportFactory } from '../transportFactory';
import { OrgMemberCommandsHost, registerOrgMemberCommands } from './orgMemberCommands';
import { registerOrgEventCommands } from './orgEventCommands';
import { asElement } from '../commandTargets';
import { describeError } from '../describeError';

/**
 * The three project actions an administrator runs from the tree: create one, put somebody on it,
 * take somebody off it.
 *
 * <p>Epic 3 built the store, the rule, the folders and the binding, and none of it was reachable
 * without `curl`. These are the callers.</p>
 *
 * <p><b>Nothing here enforces anything.</b> The tree offers what the server will accept and the
 * server decides; every refusal shown below is the server's own sentence rather than a second
 * vocabulary for the same states. The entries are gated on `teamMember-adminView` and hidden from
 * the command palette, because a palette invocation passes no row and would throw before any
 * request could be made.</p>
 */
export interface OrgProjectCommandsHost {
  readonly provider: CredTreeDataProvider;
  /** Re-reads the account's policy, roster and projects, so the rows say the new thing. */
  readonly refreshOrgPolicy: (account: StoredAccount) => Promise<RefreshOutcome>;
  readonly register: (command: string, handler: (...args: unknown[]) => unknown) => void;
  readonly storage: StorageManager;
  readonly transports: TransportFactory;
}

/** What each share value means, in the words an admin needs rather than the wire's. */
const SHARE_WORDS: Readonly<Record<ProjectShare, string>> = {
  inherit: "Whatever their role allows — the usual choice",
  project: 'May share inside this project',
  none: 'May receive shares here, never send one',
};

/**
 * Every corporate command an administrator runs from a Team row: the role, and the three project
 * actions.
 *
 * <p>One entry point because they share one host and one place in `activate()` — and because
 * `extension.ts` is under a size ratchet that only lets it shrink, so a second registration line
 * there would have to be paid for by taking something else out.</p>
 */
export function registerOrgCommands(host: OrgProjectCommandsHost & OrgMemberCommandsHost): void {
  registerOrgMemberCommands(host);
  registerOrgProjectCommands(host);
  // Epic 4's tab, through the one entry point the corporate families already share: `extension.ts`
  // is at its size ratchet, and a feature paid for by taking something else out of that file is a
  // feature that made an unrelated one harder to find.
  registerOrgEventCommands(host);
}

export function registerOrgProjectCommands(host: OrgProjectCommandsHost): void {
  host.register('credSshManager.newProject', (target) => runNewProject(host, target));
  host.register('credSshManager.assignToProject', (target) => runAssignToProject(host, target));
  host.register('credSshManager.removeFromProject', (target) => runRemoveFromProject(host, target));
}

/**
 * Who this command is for: the account whose server it speaks to, and — on a colleague's row —
 * that colleague.
 *
 * <p>One resolution rather than three questions, because the three commands need the same two
 * facts and the Team SCOPE row supplies only the first. A row that is neither is nothing this
 * command can act on, and the menus never offer it there.</p>
 */
interface ProjectTarget {
  readonly admin: StoredAccount;
  readonly email: string | undefined;
  readonly projectIds: readonly string[];
}

function targetOf(host: OrgProjectCommandsHost, target: unknown): ProjectTarget | undefined {
  const element = asElement(target);
  if (element === undefined) {
    return undefined;
  }
  if (element.kind === 'teamScope') {
    return { admin: element.account, email: undefined, projectIds: [] };
  }
  return element.kind === 'teamMember' ? memberTarget(host, element) : undefined;
}

function memberTarget(
  host: OrgProjectCommandsHost,
  element: { viaAccountId: string; member: { account: { email: string }; projectIds?: readonly string[] } },
): ProjectTarget | undefined {
  const admin = host.storage.getAccount(element.viaAccountId);
  return admin === undefined
    ? undefined
    : { admin, email: element.member.account.email, projectIds: element.member.projectIds ?? [] };
}

/**
 * Create a project.
 *
 * <p>On the Team SCOPE row as well as a colleague's, and that is the finding the plan round caught:
 * with it only on a member row, an administrator whose roster is empty — the first day of a
 * deployment, which is exactly when projects get created — has no way in at all.</p>
 */
async function runNewProject(host: OrgProjectCommandsHost, target: unknown): Promise<void> {
  const picked = targetOf(host, target);
  if (picked === undefined) {
    return;
  }
  const admin = picked.admin;
  const name = await vscode.window.showInputBox({
    title: 'New project',
    prompt: 'What is it called? People assigned to it get a folder of this name.',
    validateInput: (value) => nameProblem(value),
  });
  if (name === undefined) {
    return;
  }
  await run(host, admin, async (client) => {
    const created = await client.createProject(admin, name.trim());
    return `Project "${created.name}" created.`;
  });
}

/** The server's own rule, applied while somebody types rather than as a 400 afterwards. */
function nameProblem(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return 'A project needs a name.';
  }
  if (trimmed.length > 120) {
    return `A project name is at most 120 characters; this one is ${trimmed.length}.`;
  }
  return /[\r\n\t]/.test(trimmed)
    ? 'A project name is one line: no tabs and no line breaks. It becomes a folder name on every machine.'
    : undefined;
}

/** Put this colleague on a project, and say what they may do in it. */
async function runAssignToProject(host: OrgProjectCommandsHost, target: unknown): Promise<void> {
  const picked = onAColleague(host, target);
  if (picked === undefined) {
    return;
  }
  const { admin, email } = picked;
  const project = await pickProject(openProjects(host, admin), 'Assign to which project?');
  if (project === undefined) {
    return;
  }
  const share = await pickShare();
  if (share === undefined) {
    return;
  }
  await run(host, admin, async (client) => {
    await client.assignToProject(admin, project.id, email, share);
    return `${email} is on "${project.name}".`;
  });
}

/**
 * Take this colleague off a project, and decide what happens to their copy.
 *
 * <p>The project list is the intersection with what they are actually ON — the plan round's
 * finding, and a destructive one left unfixed: an admin could otherwise pick a project the person
 * was never on and then be asked whether to delete a folder they never had.</p>
 */
async function runRemoveFromProject(host: OrgProjectCommandsHost, target: unknown): Promise<void> {
  const picked = onAColleague(host, target);
  if (picked === undefined) {
    return;
  }
  const { admin, email } = picked;
  const project = await pickTheirProject(host, picked, email);
  if (project === undefined) {
    return;
  }
  const deleteFolder = await pickFolderFate(email, project.name);
  if (deleteFolder === undefined) {
    return;
  }
  await run(host, admin, async (client) => {
    await client.removeFromProject(admin, project.id, email, deleteFolder);
    return `${email} is off "${project.name}".`;
  });
}

/** Every open project this server has told this window about. Archived ones take nobody new. */
function openProjects(host: OrgProjectCommandsHost, admin: StoredAccount): readonly ProjectRow[] {
  return (host.provider.orgProjects.get(admin.accountId) ?? []).filter((project) => !project.archived);
}

/** The two commands that are about a PERSON need one; the scope row cannot supply it. */
function onAColleague(
  host: OrgProjectCommandsHost,
  target: unknown,
): (ProjectTarget & { email: string }) | undefined {
  const picked = targetOf(host, target);
  return picked?.email === undefined ? undefined : { ...picked, email: picked.email };
}

/**
 * Which of THEIR projects to take them off — archived included, since somebody can still come
 * off a closed engagement.
 *
 * <p>The intersection with what they are actually on, which is the plan round's finding and a
 * destructive one left unfixed: an admin could otherwise pick a project the person was never on
 * and then be asked whether to delete a folder they never had.</p>
 */
async function pickTheirProject(
  host: OrgProjectCommandsHost,
  picked: ProjectTarget,
  email: string,
): Promise<ProjectRow | undefined> {
  const ids = new Set(picked.projectIds);
  const theirs = (host.provider.orgProjects.get(picked.admin.accountId) ?? []).filter((p) => ids.has(p.id));
  if (theirs.length === 0) {
    void vscode.window.showInformationMessage(`${email} is not on any project this server can show you.`);
    return undefined;
  }
  return await pickProject(theirs, 'Remove from which project?');
}

async function pickProject(
  projects: readonly ProjectRow[],
  title: string,
): Promise<ProjectRow | undefined> {
  if (projects.length === 0) {
    void vscode.window.showInformationMessage(
      'There are no projects on this server yet — create one first.',
    );
    return undefined;
  }
  const picked = await vscode.window.showQuickPick(
    projects.map((project) => ({ label: project.name, project })),
    { title, placeHolder: 'Type to filter' },
  );
  return picked?.project;
}

async function pickShare(): Promise<ProjectShare | undefined> {
  const picked = await vscode.window.showQuickPick(
    PROJECT_SHARES.map((share) => ({ label: share, description: SHARE_WORDS[share], share })),
    { title: 'What may they do in it?' },
  );
  return picked?.share;
}

/**
 * What happens to their copy of the folder — the one question this surface refuses to guess.
 *
 * <p>Two items, both stated in words, and <b>the safe one first</b>: it is the item Enter selects,
 * which is the reasoning the delete command already records for putting *Move to Trash* ahead of
 * *Delete Permanently*. There is no checkbox in a VS Code QuickPick, and the two outcomes are not
 * recoverable from each other — which is also why the server refuses the request outright when the
 * parameter is absent.</p>
 */
async function pickFolderFate(email: string, projectName: string): Promise<boolean | undefined> {
  const keep = { label: `Leave the "${projectName}" folder with ${email}`, deleteFolder: false };
  const remove = {
    label: `Delete the "${projectName}" folder from every machine ${email} syncs`,
    description: 'Permanent, and it travels to their other machines',
    deleteFolder: true,
  };
  const picked = await vscode.window.showQuickPick([keep, remove], {
    title: `Taking ${email} off "${projectName}" — what happens to their copy?`,
  });
  return picked?.deleteFolder;
}

/**
 * Run one write, then re-read so the rows say the new thing.
 *
 * <p><b>The write is what succeeded.</b> A refresh that fails afterwards says so on its own line
 * rather than turning a completed change into an apparent failure — which is what would make
 * somebody run a non-idempotent create a second time.</p>
 */
async function run(
  host: OrgProjectCommandsHost,
  admin: StoredAccount,
  write: (client: NonNullable<ReturnType<TransportFactory['orgMembersFor']>>) => Promise<string>,
): Promise<void> {
  const client = host.transports.orgMembersFor(admin);
  if (client === undefined) {
    void vscode.window.showWarningMessage(`${admin.email} does not sync to a vault server.`);
    return;
  }
  let done: string;
  try {
    done = await write(client);
  } catch (error) {
    void vscode.window.showErrorMessage(describeError(error));
    return;
  }
  const refreshed = await host.refreshOrgPolicy(admin).catch(() => undefined);
  host.provider.refresh();
  void vscode.window.showInformationMessage(
    refreshed === undefined ? `${done} The tree could not be refreshed; it will catch up.` : done,
  );
}
