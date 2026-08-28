import { NeededSwitch } from './brokerRequests';
import { mayDeleteFolder, resolveMcpInTree } from './mcpAccess';
import { isInTrash, isTrashFolder } from './trash';
import { FolderType, TreeNode } from './types';

/**
 * Folders as an agent may see and change them.
 *
 * <p>The second object on the agent surface. Entries were the first, and everything structural
 * about them is repeated here on purpose: off until somebody says otherwise, resolved by the same
 * climb, refused with the name of the control to turn on, and never performed without the modal.</p>
 *
 * <p><b>What an agent can never do, and it is structural rather than checked.</b> Nothing here
 * reads or writes `mcp`. A permission that could change permissions is a permission to grant
 * itself every other one, so the edit shape below has three fields and none of them is the
 * switches. There is no request an agent can make that reaches them.</p>
 *
 * <p>Pure — no `vscode`, no storage, no http. The decisions live here so they are tests rather
 * than things discovered in somebody's vault.</p>
 */

/** One folder, as an agent is told about it. Nothing here is a secret; folders hold none. */
export interface FolderView {
  id: string;
  name: string;
  /** `null` at the root — the same shape the tree uses. */
  parent: string | null;
  folderType?: FolderType;
  can: { create: boolean; edit: boolean; delete: boolean };
}

/** A folder resolved for one action, in the vocabulary the broker's refusals already speak. */
export type FolderVerdict =
  | { kind: 'usable'; accountId: string; node: TreeNode }
  | { kind: 'closed'; node: TreeNode; needed: NeededSwitch }
  | undefined;

/** What an agent may ask to change about a folder. `mcp` is deliberately not among them. */
export interface FolderEdit {
  name?: string;
  parent?: string;
  folderType?: string;
}

type Nodes = (accountId: string) => readonly TreeNode[];
type ById = (accountId: string, id: string) => TreeNode | undefined;

/**
 * Every folder an agent may see, across every unlocked account.
 *
 * <p>Visibility is the bottom rung of both ladders, so a folder appears here exactly when
 * something about it has been opened — and `can` then says which of the three verbs apply. The
 * Trash and everything in it are absent whatever their switches say, for the reason they are
 * absent from the entry listing: a deleted thing that still answered would make the word
 * meaningless.</p>
 */
export function visibleFolders(
  accounts: readonly { accountId: string }[],
  nodesOf: Nodes,
  byId: ById,
): FolderView[] {
  return accounts.flatMap(({ accountId }) =>
    nodesOf(accountId)
      .filter((node) => isOpenFolder(node, (id) => byId(accountId, id)))
      .map((node) => viewOf(node, (id) => byId(accountId, id))),
  );
}

function isOpenFolder(node: TreeNode, byId: (id: string) => TreeNode | undefined): boolean {
  if (node.type !== 'folder' || isTrashFolder(node) || isInTrash(node, byId)) {
    return false;
  }
  return resolveMcpInTree(node, byId).access.view === true;
}

function viewOf(node: TreeNode, byId: (id: string) => TreeNode | undefined): FolderView {
  const access = resolveMcpInTree(node, byId).access;
  return {
    id: node.id,
    name: node.name,
    parent: node.parentId ?? null,
    folderType: node.folderType,
    can: {
      create: access.folderCreate === true,
      edit: access.folderEdit === true,
      delete: mayDeleteFolder(access, node.mcpCreatedByAgent === true),
    },
  };
}

/** The switch one folder verb needs. Written out, so an unknown verb asks for the top rung. */
export function switchForFolderAction(action: string): NeededSwitch {
  if (action === 'create') {
    return 'folderCreate';
  }
  return action === 'edit' ? 'folderEdit' : 'folderDelete';
}

/**
 * Find a folder by the id an agent quoted, and say whether it may do this to it.
 *
 * <p>Across every account, because the listing an agent read had already merged them and the id
 * it hands back carries no account with it — the same reasoning as `findUsableEntry`.</p>
 */
export function findFolder(
  accounts: readonly { accountId: string }[],
  byId: ById,
  folderId: string,
  action: string,
): FolderVerdict {
  for (const { accountId } of accounts) {
    const node = byId(accountId, folderId);
    if (node !== undefined && node.type === 'folder') {
      return verdictFor(accountId, node, (id) => byId(accountId, id), action);
    }
  }
  return undefined;
}

function verdictFor(
  accountId: string,
  node: TreeNode,
  byId: (id: string) => TreeNode | undefined,
  action: string,
): FolderVerdict {
  const needed = switchForFolderAction(action);
  return grantedFor(node, byId, needed)
    ? { kind: 'usable', accountId, node }
    : { kind: 'closed', node, needed };
}

function grantedFor(
  node: TreeNode,
  byId: (id: string) => TreeNode | undefined,
  needed: NeededSwitch,
): boolean {
  const access = resolveMcpInTree(node, byId).access;
  if (needed === 'folderDelete') {
    return mayDeleteFolder(access, node.mcpCreatedByAgent === true);
  }
  return needed === 'folderCreate' ? access.folderCreate === true : access.folderEdit === true;
}

/** Why a move is refused, or `undefined` when it may proceed. */
export type MoveRefusal =
  | 'no_such_destination'
  | 'destination_closed'
  | 'into_the_trash'
  | 'into_itself';

/**
 * May this folder move there?
 *
 * <p><b>Both ends must be under the grant</b>, which is the owner's rule stated exactly: a folder
 * with no agent access cannot be moved, and neither can one be moved somewhere the grant does not
 * reach. Checking only the folder would let an agent carry an open folder into a closed part of
 * the tree, or the reverse — and since a folder's answers are inherited by what is under it, a
 * move is a permission change for everything inside it. That is the whole reason this is not
 * simply a rename with an extra field.</p>
 *
 * <p>Into itself is refused here rather than left to storage. Storage does refuse it, by leaving
 * the tree alone — which reaches an agent as a call that succeeded and changed nothing.</p>
 */
export function moveRefusal(
  folder: TreeNode,
  destinationId: string,
  byId: (id: string) => TreeNode | undefined,
): MoveRefusal | undefined {
  const destination = byId(destinationId);
  return isFolder(destination) ? firstRefusal(folder, destination, byId) : 'no_such_destination';
}

/** The refusals in the order a person would notice them. */
function firstRefusal(
  folder: TreeNode,
  destination: TreeNode,
  byId: (id: string) => TreeNode | undefined,
): MoveRefusal | undefined {
  const checks: readonly [boolean, MoveRefusal][] = [
    [isTrashy(destination, byId), 'into_the_trash'],
    [wouldSwallowItself(folder, destination, byId), 'into_itself'],
    [!openToFolderEdit(destination, byId), 'destination_closed'],
  ];
  return checks.find(([refused]) => refused)?.[1];
}

function isFolder(node: TreeNode | undefined): node is TreeNode {
  return node !== undefined && node.type === 'folder';
}

function isTrashy(node: TreeNode, byId: (id: string) => TreeNode | undefined): boolean {
  return isTrashFolder(node) || isInTrash(node, byId);
}

function wouldSwallowItself(
  folder: TreeNode,
  destination: TreeNode,
  byId: (id: string) => TreeNode | undefined,
): boolean {
  return destination.id === folder.id || isUnder(destination, folder.id, byId);
}

function openToFolderEdit(node: TreeNode, byId: (id: string) => TreeNode | undefined): boolean {
  return resolveMcpInTree(node, byId).access.folderEdit === true;
}

/** Is `node` inside the folder with this id? Bounded, because `parentId` comes off a sync. */
function isUnder(
  node: TreeNode,
  folderId: string,
  byId: (id: string) => TreeNode | undefined,
): boolean {
  let current: TreeNode | undefined = node;
  for (let step = 0; current !== undefined && step < MAX_DEPTH; step += 1) {
    if (current.parentId === folderId) {
      return true;
    }
    current = parentOf(current, byId);
  }
  return false;
}

function parentOf(node: TreeNode, byId: (id: string) => TreeNode | undefined): TreeNode | undefined {
  return node.parentId === null || node.parentId === undefined ? undefined : byId(node.parentId);
}

const MAX_DEPTH = 64;

/** One sentence a person and a model can both act on. */
export function describeMoveRefusal(refusal: MoveRefusal, folderName: string): string {
  const said: Record<MoveRefusal, string> = {
    no_such_destination: 'there is no folder with that id',
    destination_closed: 'that destination is not open to agents — a folder can only move somewhere the same grant already reaches',
    into_the_trash: 'the Trash is not a destination; deleting is its own call',
    into_itself: 'a folder cannot be moved inside itself',
  };
  return `"${folderName}" was not moved: ${said[refusal]}.`;
}

/**
 * What the consent modal says, in the person's words rather than the protocol's.
 *
 * <p>Every field the agent asked to change, named. A prompt saying only "edit folder" would be a
 * prompt approving something the person cannot see.</p>
 */
export function summarizeFolderEdit(folder: TreeNode, edit: FolderEdit, parentName?: string): string {
  const parts = editParts(folder, edit, parentName).filter((part) => part.length > 0);
  return parts.length === 0
    ? `"${folder.name}" — nothing to change`
    : `"${folder.name}": ${parts.join(', ')}`;
}

function editParts(folder: TreeNode, edit: FolderEdit, parentName?: string): string[] {
  return [renamePart(edit, folder), movePart(edit, parentName), typePart(edit, folder)];
}

function renamePart(edit: FolderEdit, folder: TreeNode): string {
  return changed(edit.name, folder.name) ? `rename to "${edit.name}"` : '';
}

function movePart(edit: FolderEdit, parentName?: string): string {
  return edit.parent === undefined ? '' : `move into "${parentName ?? edit.parent}"`;
}

function typePart(edit: FolderEdit, folder: TreeNode): string {
  return changed(edit.folderType, folder.folderType) ? `hold ${edit.folderType} entries` : '';
}

/** Asked for, and different from what is there. An echo of the current value changes nothing. */
function changed(asked: string | undefined, current: string | undefined): boolean {
  return asked !== undefined && asked !== current;
}
