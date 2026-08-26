import { DEP_COLOR_KEYS, DepColorKey, isDepColorKey } from './depColors';
import { isInTrash } from './trash';
import { TreeNode } from './types';

/**
 * The whole "depends on" semantics, in one `vscode`-free module.
 *
 * <p>Same division of labour `treeSearch.ts` sets for the filter: this file decides everything,
 * the provider only routes. That is what makes the interesting cases — a target that was
 * deleted, two entities pointing at one thing, a pair pointing at each other, a palette with no
 * free colour left — unit tests instead of hopeful comments.</p>
 *
 * <p><b>Everything here is derived, never stored.</b> The vault records only which entities an
 * entity depends ON; "who depends on this" is computed from that, per repaint, from the node
 * array the storage layer already holds in memory. There is deliberately no background walk and
 * no `SecretStorage` read: `getTreeItem` is synchronous, and `treeProviderPasswordFlag`'s
 * "expanding a folder of 300 entities reads the keychain zero times" is the test that will say
 * so if anyone changes their mind.</p>
 */

/** The account root, which is a grouping but not a folder — it has nothing to navigate to. */
export const ROOT_GROUP_NAME = '(account root)';

export interface DependentGroup {
  /** `null` when these dependents sit at the account root rather than in a folder. */
  folderId: string | null;
  name: string;
  entities: TreeNode[];
}

export interface DependencyIndex {
  /** Entities naming this one in their own `dependsOn`, sorted by name. */
  dependentsOf(targetId: string): readonly TreeNode[];
  hasDependents(targetId: string): boolean;
  /** The tint this target has been given — only once something actually depends on it. */
  colorOf(targetId: string): DepColorKey | undefined;
  /** How many live targets wear each colour, for the form's auto-pick. */
  usedColors(): ReadonlyMap<DepColorKey, number>;
  /** The account's nodes by id — so a caller can name a target without a second lookup. */
  nodeById(id: string): TreeNode | undefined;
}

/** What a row's decoration says, beside the colour it is painted in. */
export interface RelationLabel {
  /** At most two characters — VS Code truncates a longer one. */
  badge: string;
  tooltip: string;
}

/** The ids an entity depends on, defensively: the field is data, arriving by sync and import. */
export function dependsOnOf(node: TreeNode): readonly string[] {
  const ids = node.details === undefined ? undefined : node.details.dependsOn;
  return Array.isArray(ids) ? ids : [];
}

/**
 * The stored colour of a node, or nothing.
 *
 * <p>A key this build does not know reads as absent rather than as an error — a vault written by
 * a newer one is opened, not refused, and the row is simply not tinted.</p>
 */
export function colorKeyOf(node: TreeNode | undefined): DepColorKey | undefined {
  const raw = node?.details?.depColor;
  return isDepColorKey(raw) ? raw : undefined;
}

function byName(a: TreeNode, b: TreeNode): number {
  return a.name.localeCompare(b.name);
}

/** One linear pass; the reverse map is the only thing anything else here asks for. */
export function buildDependencyIndex(nodes: readonly TreeNode[]): DependencyIndex {
  const byId = new Map<string, TreeNode>();
  for (const node of nodes) {
    byId.set(node.id, node);
  }
  const dependents = new Map<string, TreeNode[]>();
  for (const node of nodes) {
    addEdgesOf(node, dependents);
  }
  for (const list of dependents.values()) {
    list.sort(byName);
  }
  return indexOver(byId, dependents);
}

function addEdgesOf(node: TreeNode, dependents: Map<string, TreeNode[]>): void {
  for (const targetId of new Set(dependsOnOf(node))) {
    const list = dependents.get(targetId);
    if (list === undefined) {
      dependents.set(targetId, [node]);
      continue;
    }
    list.push(node);
  }
}

function indexOver(
  byId: Map<string, TreeNode>,
  dependents: Map<string, TreeNode[]>,
): DependencyIndex {
  return {
    dependentsOf: (targetId) => dependents.get(targetId) ?? [],
    hasDependents: (targetId) => (dependents.get(targetId)?.length ?? 0) > 0,
    // A colour answers only for a target something ACTUALLY depends on. An entity that was
    // once depended on and no longer is keeps its `depColor` in the record — harmless, and
    // worth keeping so re-pointing at it restores the colour it used to have — but it must
    // not paint a row, and it must not occupy a slot the auto-pick could hand out.
    colorOf: (targetId) =>
      dependents.has(targetId) ? colorKeyOf(byId.get(targetId)) : undefined,
    usedColors: () => tallyColors(byId, dependents),
    nodeById: (id) => byId.get(id),
  };
}

function tallyColors(
  byId: Map<string, TreeNode>,
  dependents: Map<string, TreeNode[]>,
): ReadonlyMap<DepColorKey, number> {
  const usage = new Map<DepColorKey, number>();
  for (const targetId of dependents.keys()) {
    const key = colorKeyOf(byId.get(targetId));
    if (key !== undefined) {
      usage.set(key, (usage.get(key) ?? 0) + 1);
    }
  }
  return usage;
}

/**
 * Which colour a row paints in.
 *
 * <p>A target wears its own; a dependent borrows from the first entry in its `dependsOn` that
 * still resolves to something with a colour. Being a target wins, because that is the end of the
 * relationship the colour was chosen FOR — an entity that both depends on something and is
 * depended on shows the colour other rows are matching against it, not the one it is matching
 * against something else.</p>
 *
 * <p>`FileDecoration.color` holds one value, so a dependent with two differently-coloured
 * targets can only show one. Document order decides; the rest are in the tooltip.</p>
 */
export function resolveTintColorKey(
  node: TreeNode,
  index: DependencyIndex,
): DepColorKey | undefined {
  const own = index.colorOf(node.id);
  return own ?? borrowedColorKey(node, index);
}

function borrowedColorKey(node: TreeNode, index: DependencyIndex): DepColorKey | undefined {
  for (const targetId of dependsOnOf(node)) {
    const key = index.colorOf(targetId);
    if (key !== undefined) {
      return key;
    }
  }
  return undefined;
}

/**
 * The dependents of one target, grouped by the folder they live in — and ONLY them: a folder
 * appearing here shows the entries that depend on this target, never its other contents.
 *
 * <p>The account-root group comes first when it exists; folders follow by name. A dependent
 * whose `parentId` names a folder that is gone is grouped at the root rather than dropped —
 * `parentId` is data too, and losing a row because its folder vanished would hide exactly the
 * entry somebody needs to find.</p>
 */
export function dependentFoldersOf(
  nodes: readonly TreeNode[],
  index: DependencyIndex,
  targetId: string,
): DependentGroup[] {
  const folders = new Map<string, TreeNode>();
  for (const node of nodes) {
    if (node.type === 'folder') {
      folders.set(node.id, node);
    }
  }
  const groups = new Map<string, DependentGroup>();
  for (const dependent of index.dependentsOf(targetId)) {
    groupFor(groups, folders, dependent).entities.push(dependent);
  }
  return orderGroups(groups);
}

/** The folder a dependent sits in, or nothing — for the root, and for a folder that is gone. */
function folderOf(folders: Map<string, TreeNode>, dependent: TreeNode): TreeNode | undefined {
  const parentId = dependent.parentId;
  return typeof parentId === 'string' ? folders.get(parentId) : undefined;
}

function newGroup(folder: TreeNode | undefined): DependentGroup {
  if (folder === undefined) {
    return { folderId: null, name: ROOT_GROUP_NAME, entities: [] };
  }
  return { folderId: folder.id, name: folder.name, entities: [] };
}

function groupFor(
  groups: Map<string, DependentGroup>,
  folders: Map<string, TreeNode>,
  dependent: TreeNode,
): DependentGroup {
  const folder = folderOf(folders, dependent);
  const key = folder?.id ?? '';
  const existing = groups.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const created = newGroup(folder);
  groups.set(key, created);
  return created;
}

function orderGroups(groups: Map<string, DependentGroup>): DependentGroup[] {
  const all = [...groups.values()];
  const root = all.filter((group) => group.folderId === null);
  const named = all
    .filter((group) => group.folderId !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
  return [...root, ...named];
}

export interface DependencyCandidate {
  id: string;
  name: string;
}

/** One folder in the form's first dropdown, carrying what its second dropdown will offer. */
export interface DependencyFolderCandidate {
  /** `''` for the account root — a place entities live, but not a folder. */
  id: string;
  name: string;
  entities: DependencyCandidate[];
}

/**
 * Everything this entity could be pointed at, grouped for the folder→entity cascade.
 *
 * <p>Sent whole when the form opens rather than fetched per folder change: it is names and ids
 * for one account, the page is already holding more than that, and a round trip per dropdown
 * change would make the second list arrive after the click that asked for it.</p>
 *
 * <p>The entity being edited is excluded — the same self-reference guard `jumpHostEntityId`
 * applies at its own save. A folder with nothing left to offer is dropped rather than shown
 * empty.</p>
 */
export function buildDependencyCandidates(
  nodes: readonly TreeNode[],
  excludeEntityId: string,
): DependencyFolderCandidate[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  // Nothing in the trash is offered — depending on something the person deleted would be a
  // relationship that exists only until the trash is emptied.
  const live = nodes.filter((node) => !isInTrash(node, (id) => byId.get(id)));
  const folders = new Map(
    live.filter((node) => node.type === 'folder').map((node) => [node.id, node]),
  );
  const groups = new Map<string, DependencyFolderCandidate>();
  for (const node of live) {
    addCandidate(groups, folders, node, excludeEntityId);
  }
  return orderCandidates(groups);
}

function addCandidate(
  groups: Map<string, DependencyFolderCandidate>,
  folders: Map<string, TreeNode>,
  node: TreeNode,
  excludeEntityId: string,
): void {
  if (!isOfferable(node, excludeEntityId)) {
    return;
  }
  candidateBucket(groups, folderOf(folders, node)).entities.push({
    id: node.id,
    name: node.name,
  });
}

function isOfferable(node: TreeNode, excludeEntityId: string): boolean {
  return node.type === 'entity' && node.id !== excludeEntityId;
}

function candidateBucket(
  groups: Map<string, DependencyFolderCandidate>,
  folder: TreeNode | undefined,
): DependencyFolderCandidate {
  const id = folder?.id ?? '';
  return groups.get(id) ?? newBucket(groups, id, folder);
}

function newBucket(
  groups: Map<string, DependencyFolderCandidate>,
  id: string,
  folder: TreeNode | undefined,
): DependencyFolderCandidate {
  const created: DependencyFolderCandidate = {
    id,
    name: folder === undefined ? ROOT_GROUP_NAME : folder.name,
    entities: [],
  };
  groups.set(id, created);
  return created;
}

function orderCandidates(
  groups: Map<string, DependencyFolderCandidate>,
): DependencyFolderCandidate[] {
  for (const group of groups.values()) {
    group.entities.sort((a, b) => a.name.localeCompare(b.name));
  }
  const all = [...groups.values()];
  return [
    ...all.filter((group) => group.id === ''),
    ...all.filter((group) => group.id !== '').sort((a, b) => a.name.localeCompare(b.name)),
  ];
}

/** One authored row in the form: which folder was picked, which entity, and in what colour. */
export interface DependencyRow {
  folderId: string;
  targetId: string;
  color: string;
  /** The target is not in this vault. The row is shown, disabled, and round-trips on save. */
  missing: boolean;
}

/**
 * The rows the form opens with, from what is already stored.
 *
 * <p>A stored id whose target is gone becomes a `missing` row rather than being dropped, and
 * that is the whole reason this function exists rather than a `.map` in the page. Dropping it
 * would look harmless — the row cannot be rendered as a dropdown selection anyway — and would
 * silently DELETE the relationship the next time anyone pressed Save on an unrelated field.
 * The target may be one sync away from coming back; the person can remove the row if it is not.</p>
 */
export function initialDependencyRows(
  dependsOn: readonly string[],
  folders: readonly DependencyFolderCandidate[],
  colors: Record<string, string>,
): DependencyRow[] {
  const folderOfEntity = new Map<string, string>();
  for (const folder of folders) {
    for (const entity of folder.entities) {
      folderOfEntity.set(entity.id, folder.id);
    }
  }
  return dependsOn.map((targetId) => ({
    folderId: folderOfEntity.get(targetId) ?? '',
    targetId,
    color: colors[targetId] ?? '',
    missing: !folderOfEntity.has(targetId),
  }));
}

/**
 * Target id -> its colour, for every target something CURRENTLY depends on.
 *
 * <p>Two jobs: it pre-selects the swatch when somebody points at a target that already has a
 * colour — which is what makes the second dependency on one VPN inherit the first one's — and
 * its values are the tally the auto-pick avoids.</p>
 */
export function buildDependencyColorMap(nodes: readonly TreeNode[]): Record<string, DepColorKey> {
  const index = buildDependencyIndex(nodes);
  const map: Record<string, DepColorKey> = {};
  for (const node of nodes) {
    const key = index.colorOf(node.id);
    if (key !== undefined) {
      map[node.id] = key;
    }
  }
  return map;
}

/**
 * What the form posts, made safe to store: no duplicates, no blanks, and never this entity
 * itself — the same self-reference guard `jumpHostEntityId` already applies. A CYCLE between
 * two entities is left alone: this is an annotation, not an execution chain, and "A needs B,
 * B needs A" is a true thing somebody may want to record.
 */
export function normalizeDependsOn(ids: readonly string[], selfId: string): string[] {
  const seen = new Set<string>();
  for (const id of ids) {
    if (id !== '' && id !== selfId) {
      seen.add(id);
    }
  }
  return [...seen];
}

/**
 * What a row's badge and tooltip say — or nothing at all, for an entity in no relationship.
 *
 * <p>The two ends read differently on purpose. Being depended ON is a fact with a size ("three
 * things need this"), so the badge is the count. Depending on something is a fact with a name,
 * so the badge is a mark and the names are in the tooltip. A badge is at most two characters,
 * which is why a large count becomes `9+` rather than being trusted to fit.</p>
 */
export function describeRelation(
  node: TreeNode,
  index: DependencyIndex,
): RelationLabel | undefined {
  const dependents = index.dependentsOf(node.id);
  if (dependents.length > 0) {
    return { badge: badgeCount(dependents.length), tooltip: dependedOnText(dependents) };
  }
  return dependsOnLabel(node, index);
}

function badgeCount(count: number): string {
  return count > 9 ? '9+' : String(count);
}

function dependedOnText(dependents: readonly TreeNode[]): string {
  const names = dependents.map((n) => n.name).join(', ');
  return `Depended on by ${dependents.length === 1 ? '' : `${dependents.length}: `}${names}`;
}

function dependsOnLabel(node: TreeNode, index: DependencyIndex): RelationLabel | undefined {
  const ids = dependsOnOf(node);
  if (ids.length === 0) {
    return undefined;
  }
  const names = ids.map((id) => index.nodeById(id)?.name).filter((name) => name !== undefined);
  const missing = ids.length - names.length;
  if (names.length === 0) {
    // Every target is gone. Still worth a row marker: the alternative is an entry that quietly
    // stops being related to anything, which reads as "I never set this up".
    return { badge: '!', tooltip: missingText(missing) };
  }
  const tail = missing === 0 ? '' : ` (and ${missingText(missing).toLowerCase()})`;
  return { badge: '●', tooltip: `Depends on ${names.join(', ')}${tail}` };
}

function missingText(missing: number): string {
  return missing === 1
    ? '1 dependency no longer exists in this vault'
    : `${missing} dependencies no longer exist in this vault`;
}

/**
 * The named warning for a reference whose target is gone.
 *
 * <p>Deliberately the voice `sshOptions.ts:refuseHop` and `sshCredential.ts` already use, and
 * deliberately not a cleanup: the target may be a sync away from coming back, and a sweep that
 * erased the reference would make that unrecoverable to save a line of tooltip.</p>
 */
export function describeDanglingDependencies(
  node: TreeNode,
  byId: (id: string) => TreeNode | undefined,
): string {
  const missing = dependsOnOf(node).filter((id) => byId(id) === undefined).length;
  if (missing === 0) {
    return '';
  }
  return missing === 1
    ? `1 dependency of "${node.name}" no longer exists in this vault.`
    : `${missing} dependencies of "${node.name}" no longer exist in this vault.`;
}

/**
 * The colour a new dependency gets offered: the first one nobody is using, and once all ten are
 * taken, the least-used — palette order breaking the tie, so the answer is the same on every
 * machine rather than whichever key the map happened to yield first.
 */
export function pickDepColor(usage: ReadonlyMap<DepColorKey, number>): DepColorKey {
  const countOf = (key: DepColorKey): number => usage.get(key) ?? 0;
  // `reduce` without a seed starts at the first key, and the comparison is strict — so a tie
  // never displaces the earlier entry, and palette order is what breaks it.
  return DEP_COLOR_KEYS.reduce((best, key) => (countOf(key) < countOf(best) ? key : best));
}
