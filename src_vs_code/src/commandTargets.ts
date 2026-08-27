import { EntityKind, TreeElement, TreeNode } from './types';
import { KeyCandidate } from './entityFormPanel';
import { SelectedNode, describeSkips, resolveSelection } from './selectionResolver';
import { inheritedFolderType } from './defaultFolders';
import { StorageManager } from './storageManager';

/**
 * Turning what a command was INVOKED with into what it may act on.
 *
 * <p>Lifted out of `extension.ts` (audit A3). That file is wiring — it constructs the managers
 * and registers the commands — but these four were decisions living inside it, unexported and
 * therefore untestable, in a 3,500-line file nobody can load in a unit test. Nothing here
 * imports `vscode`, which is what makes the move worth doing rather than merely tidy: they are
 * now plain functions with plain inputs.</p>
 *
 * <p><b>`asElement` is the gate every command passes through</b>, and it is stricter than it
 * looks. VS Code hands a command whatever the invocation carried: a tree element for a context
 * menu, `undefined` for the palette, and — for a multi-select action — a second array that may
 * hold rows of any kind. Each shape is checked for the fields the commands will actually read,
 * so a malformed or unexpected argument becomes `undefined` here rather than a property access
 * on nothing several frames later.</p>
 */

/**
 * The kind a new entity inherits from the folder it is being created in.
 *
 * <p>`undefined` at the account root, where nothing constrains it — and `parentId` is compared
 * with `== null` on purpose, because a root parent arrives as `null` from a tree element and as
 * `undefined` from a palette invocation, and both mean the same thing.</p>
 */
export function folderKindOf(
  storage: StorageManager,
  accountId: string,
  parentId: string | null | undefined,
): EntityKind | undefined {
  if (parentId == null) {
    return undefined;
  }
  return inheritedFolderType(storage.getNode(accountId, parentId)?.folderType);
}

/**
 * What a bulk action acts on: the row that was clicked, widened to the selection it belongs to.
 *
 * <p>The clicked row is the ANCHOR and it decides the account — a selection spanning two
 * profiles is not a thing any of these commands can do, and `resolveSelection` drops the rest
 * rather than acting across a boundary. Anything that is not a plain node row yields no targets
 * at all, so a command invoked on a folder group or a shared item does nothing instead of
 * something surprising.</p>
 */
export function resolveBulkTargets(
  storage: StorageManager,
  clicked: unknown,
  selected: unknown,
): { targets: SelectedNode[]; skippedNote: string } {
  const anchor = asElement(clicked);
  if (anchor?.kind !== 'node') {
    return { targets: [], skippedNote: '' };
  }
  const rows = Array.isArray(selected) ? selected.map(asElement) : undefined;
  const resolved = resolveSelection(anchor, rows, storage.getNodes(anchor.accountId));
  return { targets: resolved.targets, skippedNote: describeSkips(resolved) };
}

/**
 * The entities this one could be pointed through as a jump host.
 *
 * <p>An entity cannot be its own bastion, and only something with a host and SSH enabled can be
 * one — offering anything else would produce a chain that fails at connect time with an error
 * about the wrong hop.</p>
 */
export function collectJumpCandidates(
  storage: StorageManager,
  accountId: string,
  excludeEntityId: string,
): KeyCandidate[] {
  return storage
    .getNodes(accountId)
    .filter((node) => canBeJumpHost(node, excludeEntityId))
    .map((node) => ({ id: node.id, name: node.name }));
}

/** A reachable SSH endpoint — which is what a hop has to be. */
function isSshReachable(details: TreeNode['details']): boolean {
  return details?.isSshEnabled === true && Boolean(details.host);
}

/** Named rather than inlined, so the conditions stay inside the complexity limit. */
function canBeJumpHost(node: TreeNode, excludeEntityId: string): boolean {
  if (node.type !== 'entity' || node.id === excludeEntityId) {
    return false;
  }
  return isSshReachable(node.details);
}

// eslint-disable-next-line complexity
export function asElement(value: unknown): TreeElement | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const v = value as TreeElement;
  if (v.kind === 'account' && typeof v.account?.accountId === 'string') {
    return v;
  }
  if (v.kind === 'node' && typeof v.accountId === 'string' && typeof v.node?.id === 'string') {
    return v;
  }
  if (
    v.kind === 'revision' &&
    typeof v.accountId === 'string' &&
    typeof v.node?.id === 'string' &&
    typeof v.index === 'number'
  ) {
    return v;
  }
  if (v.kind === 'teamMember' && typeof v.member?.account?.accountId === 'string') {
    return v;
  }
  if (v.kind === 'teamScope' && typeof v.account?.accountId === 'string') {
    return v;
  }
  if (v.kind === 'sharedSender' && typeof v.email === 'string') {
    return v;
  }
  if (v.kind === 'sharedItem' && typeof v.share?.item?.id === 'string') {
    return v;
  }
  if (v.kind === 'sharedRoot') {
    return v;
  }
  // A shadow row IS its entity — narrowed to the plain node element so that every command
  // already reachable on the real row works here with no second code path. That is the whole
  // point of giving it the same `contextValue`: the sub-tree is a place to act, not a picture.
  if (
    v.kind === 'dependentEntity' &&
    typeof v.accountId === 'string' &&
    typeof v.node?.id === 'string'
  ) {
    return { kind: 'node', accountId: v.accountId, node: v.node };
  }
  // Kept as itself: it has its own command rather than any of an entity's. The account-root
  // group carries `folderId: null` and is deliberately NOT accepted — its `contextValue` is
  // `dependentsRoot`, which no command binds to, because "go to the original folder" has
  // nowhere to go from there.
  if (
    v.kind === 'dependentsFolder' &&
    typeof v.accountId === 'string' &&
    typeof v.folderId === 'string'
  ) {
    return v;
  }
  return undefined;
}

/**
 * What to say after a withdrawal attempt.
 *
 * <p>"Already taken" is never dressed up as success. The point of asking was to stop a secret
 * reaching someone; being told it worked when it did not is worse than being told nothing, and
 * the honest answer names the only remaining move.</p>
 */
export function withdrawalMessage(outcome: 'withdrawn' | 'alreadyTaken' | 'notFound', name: string): string {
  if (outcome === 'withdrawn') {
    return `"${name}" was taken back before anyone accepted it.`;
  }
  if (outcome === 'alreadyTaken') {
    return `"${name}" had already been accepted or declined — it cannot be taken back. Rotate the secret instead.`;
  }
  return `"${name}" is no longer listed as sent; nothing to take back.`;
}
