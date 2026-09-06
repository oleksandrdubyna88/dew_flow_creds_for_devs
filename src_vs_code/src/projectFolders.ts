import { createHash } from 'node:crypto';
import { TreeNode } from './types';

/** One assignment as the person's own document carries it. */
export interface ProjectAssignmentFact {
  readonly projectId: string;
  readonly name: string;
}

/** One standing instruction from the server about a project folder. */
export interface PendingFolderRemovalFact {
  readonly projectId: string;
  readonly deleteFolder: boolean;
}

/**
 * What one cycle should do about this account's project folders.
 *
 * <p>Four actions rather than three: `toUnlock` is the plan round's finding, and without it a person
 * taken off a project whose folder they were allowed to keep would hold a folder they could never
 * rename or move again — locked forever on behalf of a relationship that has ended.</p>
 */
export interface ProjectFolderPlan {
  readonly toCreate: readonly { nodeId: string; projectId: string; name: string }[];
  readonly toRename: readonly { nodeId: string; name: string }[];
  readonly toUnlock: readonly { nodeId: string }[];
  readonly toDelete: readonly { nodeId: string; projectId: string }[];
  /** Instructions to acknowledge once everything above has landed AND been pushed. */
  readonly toAck: readonly string[];
}

const EMPTY: ProjectFolderPlan = { toCreate: [], toRename: [], toUnlock: [], toDelete: [], toAck: [] };

/**
 * The node id for a project folder — DERIVED from the account and the project, never minted.
 *
 * <p>Two machines of the same person, both offline, both seeing a new assignment, would otherwise
 * mint two ids; `syncMerge` merges by node id and would keep both, because nothing in it can know
 * the two folders mean one thing. A derived id makes them the same node by construction, and the
 * ordinary version-vector merge then resolves a concurrent rename exactly as it resolves any other.
 * First-wins would need a device to have synced once to own the id, which is precisely the offline
 * window that breaks.</p>
 *
 * <p>It is also what lets a machine that has just merged a peer's vault delete the right node: the
 * id is computable from facts every machine has.</p>
 *
 * <p>A tombstone does not poison it. `syncMerge` resolves node-versus-tombstone by version vector —
 * a folder re-created on re-assignment carries a newer vector, so the merge keeps it and drops the
 * tombstone ("a newer edit resurrected it").</p>
 */
export function projectFolderNodeId(accountId: string, projectId: string): string {
  return createHash('sha256')
    .update('creds-for-devs/project-folder:' + accountId + ':' + projectId)
    .digest('hex')
    .slice(0, 32);
}

/**
 * What this account's project folders should become, given what the server says and what is here.
 *
 * <p><b>Pure.</b> No storage, no `vscode`, no clock — so every interesting case is a row in a table
 * rather than a reading of the sync cycle.</p>
 *
 * <p><b>Matched by `projectId`, never by name.</b> A person may rename their own folder; the
 * project's name is what the SERVER calls it, and an assignment is corporate material whose name is
 * the shared one. So a local rename is followed back to the server's name on the next cycle.</p>
 *
 * <p><b>An assignment that simply ended does not delete anything.</b> That is what
 * `?deleteFolder=false` means on the server: the copy stays with the person. The folder is UNLOCKED
 * instead, because the corporate relationship it belonged to is over.</p>
 *
 * <p><b>The caller must only run this on a cycle that actually read the document.</b> A failed fetch
 * must never be read as "you are on nothing" — that would unlock every project folder on the
 * machine. `refreshOrgPolicy` already answers "everything stays as it was" on a failure, and the
 * caller is wired to that.</p>
 */
export function reconcileProjectFolders(
  nodes: readonly TreeNode[],
  assigned: readonly ProjectAssignmentFact[],
  pendingRemovals: readonly PendingFolderRemovalFact[],
  accountId: string,
): ProjectFolderPlan {
  const existing = new Map(nodes.filter(isProjectFolder).map((n) => [n.projectId as string, n]));
  const removals = new Map(pendingRemovals.map((r) => [r.projectId, r]));
  const wanted = new Map(assigned.filter((a) => a.projectId.length > 0).map((a) => [a.projectId, a]));
  return {
    toCreate: creations(wanted, existing, removals, accountId),
    toRename: renames(wanted, existing, removals),
    toUnlock: unlocks(wanted, existing, removals),
    toDelete: deletions(existing, removals, accountId),
    toAck: [...removals.keys()],
  };
}

/** Nothing at all to do — the answer for a personal account, and the one the caller may skip on. */
export function nothingToDo(plan: ProjectFolderPlan): boolean {
  return (
    plan.toCreate.length +
      plan.toRename.length +
      plan.toUnlock.length +
      plan.toDelete.length +
      plan.toAck.length ===
    0
  );
}

export const NO_PROJECT_FOLDER_WORK: ProjectFolderPlan = EMPTY;

function isProjectFolder(node: TreeNode): boolean {
  return node.type === 'folder' && typeof node.projectId === 'string' && node.projectId.length > 0;
}

/** An assignment with no folder yet — unless the server is asking for that folder to go. */
function creations(
  wanted: Map<string, ProjectAssignmentFact>,
  existing: Map<string, TreeNode>,
  removals: Map<string, PendingFolderRemovalFact>,
  accountId: string,
): { nodeId: string; projectId: string; name: string }[] {
  return [...wanted.values()]
    .filter((a) => !existing.has(a.projectId) && !removals.has(a.projectId))
    .map((a) => ({
      nodeId: projectFolderNodeId(accountId, a.projectId),
      projectId: a.projectId,
      name: folderName(a),
    }));
}

/** The server's name wins; a folder about to be deleted is not renamed first. */
function renames(
  wanted: Map<string, ProjectAssignmentFact>,
  existing: Map<string, TreeNode>,
  removals: Map<string, PendingFolderRemovalFact>,
): { nodeId: string; name: string }[] {
  return [...existing.entries()]
    .filter(([projectId]) => wanted.has(projectId) && !removals.has(projectId))
    .map(([projectId, node]) => ({ nodeId: node.id, was: node.name, name: folderName(wanted.get(projectId)!) }))
    .filter((row) => row.was !== row.name)
    .map((row) => ({ nodeId: row.nodeId, name: row.name }));
}

/** A folder whose assignment has ended and which nobody asked to remove is simply theirs now. */
function unlocks(
  wanted: Map<string, ProjectAssignmentFact>,
  existing: Map<string, TreeNode>,
  removals: Map<string, PendingFolderRemovalFact>,
): { nodeId: string }[] {
  return [...existing.entries()]
    .filter(([projectId]) => !wanted.has(projectId) && !removals.has(projectId))
    .map(([, node]) => ({ nodeId: node.id }));
}

/**
 * Every removal the server is asking for, whether or not the folder is here.
 *
 * <p>The id is derived rather than looked up, so a machine that has merged a peer's vault deletes
 * the same node the peer created — and a removal for a folder that is already gone is a no-op the
 * deletion path swallows, which is what makes a repeated cycle safe.</p>
 *
 * <p><b>`deleteFolder: false` deletes nothing</b> and is still acknowledged. This server never
 * writes one — story 1 appends an entry only when the flag is true — but a record from a newer
 * server or a hand-edit must not be able to wedge the cycle by being unacknowledgeable forever.</p>
 */
function deletions(
  existing: Map<string, TreeNode>,
  removals: Map<string, PendingFolderRemovalFact>,
  accountId: string,
): { nodeId: string; projectId: string }[] {
  return [...removals.values()]
    .filter((r) => r.deleteFolder)
    .map((r) => ({
      nodeId: existing.get(r.projectId)?.id ?? projectFolderNodeId(accountId, r.projectId),
      projectId: r.projectId,
    }));
}

/** What the folder is called: the project's name, or its id when the server could not resolve one. */
function folderName(assignment: ProjectAssignmentFact): string {
  const trimmed = assignment.name.trim();
  return trimmed.length > 0 ? trimmed : 'Project ' + assignment.projectId.slice(0, 8);
}
