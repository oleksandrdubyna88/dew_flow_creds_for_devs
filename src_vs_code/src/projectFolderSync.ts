import { ProjectFolderPlan, nothingToDo } from './projectFolders';
import { TreeNode } from './types';

/**
 * Everything applying a plan needs, as functions — so the order below is testable without a vault,
 * a server or a `vscode`.
 */
export interface ProjectFolderHost {
  readonly addFolder: (accountId: string, node: TreeNode) => Promise<void>;
  readonly setFields: (accountId: string, id: string, patch: Partial<TreeNode>) => Promise<void>;
  /** The ONE real deletion path: tombstone → node → secrets, so it reaches their other machines. */
  readonly deleteRecursive: (accountId: string, id: string) => Promise<unknown>;
  /** Push the vault. Must reject if the server did not take it. */
  readonly push: (accountId: string) => Promise<void>;
  /** Tell the server this removal has landed and left the machine. */
  readonly ack: (accountId: string, projectId: string) => Promise<void>;
  /** Say what happened, once, when something was actually removed. */
  readonly announce: (message: string) => void;
  readonly now: () => number;
}

/** What one application did, for the caller's log line and for the tests. */
export interface ProjectFolderOutcome {
  readonly created: number;
  readonly renamed: number;
  readonly unlocked: number;
  readonly deleted: number;
  readonly acked: number;
}

const NOTHING: ProjectFolderOutcome = { created: 0, renamed: 0, unlocked: 0, deleted: 0, acked: 0 };

/**
 * Carry out one reconciled plan, in the only order that is safe.
 *
 * <p><b>Delete, then PUSH, then acknowledge.</b> The instruction is per PERSON: the first machine to
 * ack clears it for every other one, which then receives the deletion the ordinary way, as a
 * tombstone through their own vault sync. So an ack that ran before the push would, if this machine
 * then died, leave the instruction gone and the tombstone never sent — and every other machine would
 * keep the folder forever. A cycle that fails between two steps simply repeats: the delete is
 * idempotent, and so is the ack.</p>
 *
 * <p><b>The caller must only reach here on a cycle that actually read the person's document.</b> A
 * failed fetch read as "you are on nothing" would unlock every project folder on the machine;
 * `refreshOrgPolicy` already answers "everything stays as it was" on a failure.</p>
 */
export async function applyProjectFolders(
  accountId: string,
  plan: ProjectFolderPlan,
  host: ProjectFolderHost,
): Promise<ProjectFolderOutcome> {
  if (nothingToDo(plan)) {
    return NOTHING;
  }
  await createFolders(accountId, plan, host);
  await renameFolders(accountId, plan, host);
  await unlockFolders(accountId, plan, host);
  const deleted = await deleteFolders(accountId, plan, host);
  await host.push(accountId);
  const acked = await acknowledge(accountId, plan, host);
  announce(deleted, host);
  return {
    created: plan.toCreate.length,
    renamed: plan.toRename.length,
    unlocked: plan.toUnlock.length,
    deleted,
    acked,
  };
}

async function createFolders(accountId: string, plan: ProjectFolderPlan, host: ProjectFolderHost): Promise<void> {
  for (const row of plan.toCreate) {
    await host.addFolder(accountId, {
      id: row.nodeId,
      name: row.name,
      type: 'folder',
      parentId: null,
      projectId: row.projectId,
      createdAt: host.now(),
      updatedAt: host.now(),
    });
  }
}

async function renameFolders(accountId: string, plan: ProjectFolderPlan, host: ProjectFolderHost): Promise<void> {
  for (const row of plan.toRename) {
    await host.setFields(accountId, row.nodeId, { name: row.name });
  }
}

/**
 * The folder becomes an ordinary one of theirs.
 *
 * <p>`undefined` rather than a deletion of the whole node: the assignment ended and nobody asked for
 * the material back, so the copy is theirs — and leaving `projectId` on it would lock it against
 * renaming and moving forever, on behalf of a relationship that is over.</p>
 */
async function unlockFolders(accountId: string, plan: ProjectFolderPlan, host: ProjectFolderHost): Promise<void> {
  for (const row of plan.toUnlock) {
    await host.setFields(accountId, row.nodeId, { projectId: undefined });
  }
}

async function deleteFolders(accountId: string, plan: ProjectFolderPlan, host: ProjectFolderHost): Promise<number> {
  let deleted = 0;
  for (const row of plan.toDelete) {
    await host.deleteRecursive(accountId, row.nodeId);
    deleted += 1;
  }
  return deleted;
}

async function acknowledge(accountId: string, plan: ProjectFolderPlan, host: ProjectFolderHost): Promise<number> {
  let acked = 0;
  for (const projectId of plan.toAck) {
    await host.ack(accountId, projectId);
    acked += 1;
  }
  return acked;
}

/**
 * Say it out loud.
 *
 * <p>A folder vanishing from somebody's vault with no explanation is the kind of event that becomes
 * a support conversation about data loss. There is deliberately no CONFIRMATION — an instruction a
 * developer can decline is not an instruction, and the epic's decision is that a removal is
 * permanent and travels by tombstone — but silence was not part of that decision.</p>
 */
function announce(deleted: number, host: ProjectFolderHost): void {
  if (deleted === 0) {
    return;
  }
  const what = deleted === 1 ? 'A project folder was' : `${deleted} project folders were`;
  host.announce(`${what} removed from this vault because your organisation took you off the project.`);
}
