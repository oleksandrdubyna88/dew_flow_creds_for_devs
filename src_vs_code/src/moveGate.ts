import { CorpPolicyState } from './corpPolicy';
import { resolveKind } from './entityKind';
import { TreeNode } from './types';

/**
 * What a move has to satisfy, gathered by the caller so this stays a pure function.
 *
 * @property moving the node being moved.
 * @property from the folder it is in now, when it is in one.
 * @property to the folder it would land in — undefined for the root.
 * @property policy this account's corporate policy, undefined on a personal account.
 */
export interface MoveFacts {
  readonly moving: TreeNode;
  readonly from?: TreeNode;
  readonly to?: TreeNode;
  readonly policy?: CorpPolicyState;
}

/**
 * The refusal for this move, or empty when it may go ahead.
 *
 * <p><b>One gate, two call sites.</b> The typed-folder rule below existed TWICE before epic 3 —
 * character for character, with the same sentence — in the move command and in the drag-and-drop
 * handler. Adding the project rule as a third copy is what the reuse rule forbids, and the two
 * would have disagreed the first time either was edited: a rule enforced in the menu and not on the
 * drop is not enforced.</p>
 *
 * <p><b>The project rule is evaluated on the FOLDER, not on the people.</b> An entity's project is
 * the project folder above it, so a developer who may share in A1 must not be able to take an entry
 * out of A5, drop it into A1 and send it — both halves of the server's check would then pass. Trash
 * stays reachable, because a deletion is not a relocation.</p>
 *
 * <p><b>It is a client-side promise, and the module doc says so.</b> A developer's own machine holds
 * their vault key; this stops the UI doing something the organisation did not intend, and it is not
 * a boundary the server can enforce. What the server enforces is the share rule, which does not
 * depend on any of this.</p>
 */
export function refuseMove(facts: MoveFacts): string {
  return kindRefusal(facts) || projectRefusal(facts);
}

/** A typed folder accepts only entities of its own kind. */
function kindRefusal(facts: MoveFacts): string {
  const to = facts.to;
  return to === undefined || facts.moving.type !== 'entity' ? '' : kindMismatch(facts.moving, to);
}

function kindMismatch(moving: TreeNode, to: TreeNode): string {
  const kind = resolveKind(moving.details);
  if (!enforcesAKind(to.folderType) || kind === to.folderType) {
    return '';
  }
  return `Folder "${to.name}" holds only ${to.folderType} entities — "${moving.name}" is ${kind}.`;
}

/**
 * Whether this folder's type is a restriction at all.
 *
 * <p>`'project'` is not: it is the client-side TEMPLATE that scaffolds default subfolders when a
 * folder is created, and it has never restricted what may be put inside. Nothing to do with a
 * corporate project — that is `projectId`, and the reason the two are separate fields.</p>
 */
function enforcesAKind(folderType?: string): boolean {
  return folderType !== undefined && folderType !== 'any' && folderType !== 'project';
}

/** Nothing corporate leaves a project folder for anywhere but the Trash. */
function projectRefusal(facts: MoveFacts): string {
  if (!lockApplies(facts)) {
    return '';
  }
  return facts.moving.projectId !== undefined ? theFolderItself(facts) : outOfAProject(facts);
}

/** The lock binds unless this account is not corporate, or the destination is the Trash. */
function lockApplies(facts: MoveFacts): boolean {
  const toTrash = facts.to?.isTrash === true;
  return locked(facts.policy) && !toTrash;
}

function theFolderItself(facts: MoveFacts): string {
  return `"${facts.moving.name}" is a project folder your organisation manages. It cannot be moved; `
    + 'it disappears on its own when an administrator takes you off the project.';
}

function outOfAProject(facts: MoveFacts): string {
  return facts.from?.projectId === undefined
    ? ''
    : `"${facts.moving.name}" is inside the project folder "${facts.from.name}", and your role on this `
      + 'server does not allow moving entries out of a project. Deleting it is still possible.';
}

/**
 * Whether this account's policy locks project folders.
 *
 * <p>Read from the document epic 2 already fetches (`moveOutOfProject`) rather than from a second
 * reading of the role: a stored copy of a rule is a second source of truth. No document means a
 * personal account, or a corporate one whose policy could not be read — and that second case
 * arrives here as {@link MOST_RESTRICTIVE_POLICY}, whose `moveOutOfProject` is already false, so it
 * is a refusal rather than an absence. The same reasoning `corpExits.refuseExit` records.</p>
 */
function locked(policy?: CorpPolicyState): boolean {
  return policy !== undefined && policy.corpMode && !policy.policy.moveOutOfProject;
}

/**
 * The refusal for renaming or deleting THIS node, or empty when it may go ahead.
 *
 * <p>Beside {@link refuseMove} because it is the same lock, read the same way. It is a separate
 * function because the refusals are separate verbs, and because a menu `when` clause is
 * discoverability, not enforcement: F2, the Delete key and the command palette all reach the
 * handler without passing a menu. The gate has to be in the handler, which is what the plan round
 * pointed out was missing.</p>
 *
 * <p>A project folder is not deleted by hand at all: it goes when an administrator takes the person
 * off the project, and the instruction to remove it is a durable record their client carries out.
 * Deleting it locally would leave the assignment standing and the folder recreated on the next
 * cycle — a confusing answer to give somebody who thinks they have removed something.</p>
 */
export function refuseProjectFolderChange(node: TreeNode, policy?: CorpPolicyState): string {
  if (node.projectId === undefined || !locked(policy)) {
    return '';
  }
  return `"${node.name}" is a project folder your organisation manages. It goes when an administrator `
    + 'takes you off the project; entries inside it can still be changed and deleted.';
}

/** The folder a node sits in, or nothing when it sits at the root. */
export function parentFolderOf(
  storage: { getNode: (accountId: string, id: string) => TreeNode | undefined },
  accountId: string,
  node: TreeNode,
): TreeNode | undefined {
  return node.parentId === undefined || node.parentId === null
    ? undefined
    : storage.getNode(accountId, node.parentId);
}
