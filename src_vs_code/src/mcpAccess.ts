import { TreeNode } from './types';
import { isInTrash } from './trash';

/**
 * What an agent is allowed to do with one entry, and where that answer comes from.
 *
 * <p>Everything is off until somebody turns it on. A new entry is invisible to an agent, and so
 * is every entry that existed before this feature — absence means nothing rather than a default,
 * which is the only safe reading for a credential manager.</p>
 *
 * <p><b>A ladder, not five independent switches.</b> Deleting implies creating implies editing
 * implies using implies seeing. The state "may change it but may not see it" is not a
 * configuration anybody meant; it is a typo, and the ladder makes it unrepresentable rather than
 * merely discouraged.</p>
 */

export type McpDeleteScope = 'any' | 'own';

/**
 * How often a person is asked before an agent USES this entry.
 *
 * <p>A different axis from the ladder above it, and the difference is the whole reason it is not a
 * rung: the ladder says what an agent may ask for, this says how often a person is asked about it.
 * It grants nothing, and turning it on lights no capability.</p>
 *
 * <p><b>`always` is a real value and absence means "ask the folder".</b> The first draft had the
 * opposite — absence WAS "ask every time" — and it could not express the case that matters most: a
 * child under a folder set to `never` had no way to say "ask me anyway", because saying nothing is
 * how you say "inherit". The safe answer is kept where it belongs, at the end of the walk: when
 * nothing at any level answers, the effective policy is `always`.</p>
 */
export type McpAskPolicy = 'always' | 'every12h' | 'never';

export interface McpAccess {
  view?: boolean;
  use?: boolean;
  edit?: boolean;
  create?: boolean;
  /** `'own'` restricts deletion to entries the agent itself created. Absent means no deleting. */
  delete?: McpDeleteScope;
  /** Folders: may make one. */
  folderCreate?: boolean;
  /**
   * Folders: may rename, move and retype one — never its Agent access.
   *
   * <p>That exclusion is structural rather than checked: the route that edits a folder reads
   * `name`, `parent` and `folderType` and does not read `mcp` at all. A permission that could
   * change permissions is a permission to grant itself every other one, and the ladder would
   * stop meaning anything.</p>
   */
  folderEdit?: boolean;
  /** Folders: to the Trash. `'own'` is only the ones the agent made itself. */
  folderDelete?: McpDeleteScope;
  /** How often to ask before an agent uses this entry. Absent means "ask the folder". */
  ask?: McpAskPolicy;
}

/**
 * One rung of the ladder, by name.
 *
 * <p>`keyof McpAccess` used to say this, and it stopped being true the moment the record gained a
 * field that is not a rung: `switchForAction` would have been allowed to answer `'ask'`, and a
 * refusal would have named a control that grants nothing. The compiler said so on the first build,
 * which is the argument for naming the set rather than casting past it.</p>
 */
export type McpRung =
  | 'view'
  | 'use'
  | 'edit'
  | 'create'
  | 'delete'
  | 'folderCreate'
  | 'folderEdit'
  | 'folderDelete';

/**
 * The eight keys that make up the LADDER half of this record.
 *
 * <p>Written out because the two halves are now read, stored and inherited apart, and "does this
 * object answer the ladder" is a question with a wrong answer available: an object carrying only a
 * policy must not be mistaken for a ladder that says no to everything.</p>
 */
const LADDER_KEYS: readonly McpRung[] = [
  'view',
  'use',
  'edit',
  'create',
  'delete',
  'folderCreate',
  'folderEdit',
  'folderDelete',
];

/** Nothing allowed — what an entry with no setting anywhere resolves to. */
export const NO_MCP_ACCESS: McpAccess = {};

export type McpSource = 'entity' | 'folder' | 'none';

export interface ResolvedMcpAccess {
  access: McpAccess;
  /** Where the answer came from — the viewer says this out loud, see below. */
  source: McpSource;
}

/**
 * Fill in everything a switch implies.
 *
 * <p>Applied on the way IN as well as on the way out: a record arriving from sync or from an
 * older build can carry `edit` without `view`, and expanding it here means every reader sees a
 * consistent answer without repeating the ladder.</p>
 */
export function normalizeMcpAccess(raw: McpAccess | undefined): McpAccess {
  if (raw === undefined) {
    return NO_MCP_ACCESS;
  }
  return climb(raw, deleteScope(raw.delete), deleteScope(raw.folderDelete));
}

/**
 * An unknown scope reads as no deleting.
 *
 * <p>A record from a newer build could carry a word this one has never heard of. Refusing the
 * whole record would lose data it can still show; treating an unrecognised word as permission
 * would be worse than both.</p>
 *
 * <p>Takes `unknown` rather than the union, because both of its callers get their word from
 * somewhere outside this program — a synced record, or a message from a webview.</p>
 */
function deleteScope(raw: unknown): McpDeleteScope | undefined {
  return raw === 'any' || raw === 'own' ? raw : undefined;
}

const ASK_POLICIES: readonly McpAskPolicy[] = ['always', 'every12h', 'never'];

/**
 * An unknown policy word reads as "ask every time" — and it is an ANSWER, not silence.
 *
 * <p>The opposite of `deleteScope` above, and deliberately: there, an unrecognised word must grant
 * nothing, so it reads as absence. Here absence means "inherit", so reading a strange word as
 * absence would let it inherit a folder's `never` — a word this build has never seen would turn
 * the dialog off. The safe direction is the one that asks, and it has to stop the climb to do it.</p>
 *
 * <p>Takes `unknown` for `deleteScope`'s reason: both callers get their word from outside this
 * program — a synced record, or a message from a webview. `null` is separated from a strange word
 * on purpose: it is how the form says "I am taking my answer back", which is silence.</p>
 */
function askPolicy(raw: unknown): McpAskPolicy | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  return ASK_POLICIES.find((policy) => policy === raw) ?? 'always';
}

/**
 * The access an untrusted message claims, or `undefined` when it claims none.
 *
 * <p>Both forms post the same object — the entity form and the folder form share the page script
 * that builds it — so they share the reader too. It briefly existed twice, once in each panel,
 * which is a duplicate of a SECURITY decision: what a webview may assert about permissions. Two
 * copies of that rule is one copy too many, and the second was already spelled differently.</p>
 *
 * <p>Absent is not the same as empty here, and the distinction survives on purpose: no object at
 * all means "this record still has no answer of its own", while an object with everything off
 * means "decided, and the answer is nothing".</p>
 *
 * <p><b>Two halves, read apart.</b> The ladder and the ask policy are separate axes, so a message
 * may carry either, both or neither, and each half is stored only when it was actually claimed.
 * Reading them together is how a person who only changed "never ask" on a folder would have had an
 * all-off ladder written for them — closing to agents everything beneath it that used to inherit
 * its rights from higher up.</p>
 */
export function readMcpAccess(raw: unknown): McpAccess | undefined {
  if (typeof raw !== 'object' || raw === null) {
    return undefined;
  }
  const r = raw as Record<string, unknown>;
  const claimed = { ...ladderHalf(r), ...policyHalf(r) };
  return Object.keys(claimed).length === 0 ? undefined : claimed;
}

/** The ladder a message claims, or nothing when it names no rung at all. */
function ladderHalf(r: Record<string, unknown>): McpAccess {
  if (!LADDER_KEYS.some((key) => key in r)) {
    return {};
  }
  return {
    view: r.view === true,
    use: r.use === true,
    edit: r.edit === true,
    create: r.create === true,
    delete: deleteScope(r.delete),
    folderCreate: r.folderCreate === true,
    folderEdit: r.folderEdit === true,
    folderDelete: deleteScope(r.folderDelete),
  };
}

/**
 * The policy a message claims, or nothing.
 *
 * <p><b>`null` is the form taking its answer back</b>, and it has to be a value rather than an
 * omission because `JSON.stringify` drops an `undefined` property: a page that "sent undefined"
 * sends a key that never arrives, and a message carrying only that would be an empty object — which
 * the ladder half above would once have read as a decision to close.</p>
 */
function policyHalf(r: Record<string, unknown>): McpAccess {
  const ask = askPolicy(r.ask);
  return ask === undefined ? {} : { ask };
}

/**
 * Each rung turns on the one below it, and nothing turns on the one above.
 *
 * <p><b>Two ladders over two objects, meeting at the bottom.</b> Entries climb
 * delete -> create -> edit -> use -> view; folders climb folderDelete -> folderCreate ->
 * folderEdit -> view. They share the lowest rung because every one of these actions is about
 * something an agent must be able to SEE, which keeps "may rename it but may not see it" as
 * unrepresentable as its entry-side twin.</p>
 *
 * <p>They do not otherwise imply each other: making folders is not permission to store a
 * credential in one, and neither is the reverse.</p>
 */
function climb(
  raw: McpAccess,
  del: McpDeleteScope | undefined,
  folderDel: McpDeleteScope | undefined,
): McpAccess {
  const on = (flag: boolean | undefined, below: boolean): boolean => flag === true || below;
  const create = on(raw.create, del !== undefined);
  const edit = on(raw.edit, create);
  const use = on(raw.use, edit);
  const folderCreate = on(raw.folderCreate, folderDel !== undefined);
  const folderEdit = on(raw.folderEdit, folderCreate);
  return {
    view: on(raw.view, use) || folderEdit,
    use,
    edit,
    create,
    delete: del,
    folderCreate,
    folderEdit,
    folderDelete: folderDel,
    // Carried through, never climbed: no rung implies a policy and no policy lights a rung. A word
    // an older or newer build wrote is normalised here, on the way in from sync as well as out.
    ask: askPolicy(raw.ask),
  };
}

/** Is anything at all allowed? Used to tell "set to nothing" from "not set". */
export function grantsAnything(access: McpAccess): boolean {
  return access.view === true;
}

/**
 * The access that actually applies to this entry.
 *
 * <p>An entry's own setting wins; otherwise the folder's is inherited. The distinction between
 * "not set" and "explicitly nothing" is carried by the PRESENCE of the field, not by its
 * contents — which is why an entry that has been deliberately closed keeps an object with
 * everything false rather than having the field removed.</p>
 *
 * <p><b>Nothing in the trash is reachable</b>, whatever either setting says. A deleted entry that
 * still answered an agent would make the word "deleted" mean nothing, and the trash is the one
 * place where the answer must not be inherited from anywhere.</p>
 */
export function resolveMcpAccess(
  entity: TreeNode,
  folder: TreeNode | undefined,
  inTrash: boolean,
): ResolvedMcpAccess {
  if (inTrash) {
    return { access: NO_MCP_ACCESS, source: 'none' };
  }
  const own = entity.details === undefined ? undefined : entity.details.mcp;
  return own === undefined ? inheritedFrom(folder) : { access: normalizeMcpAccess(own), source: 'entity' };
}

/**
 * The same answer, found from the tree rather than from three arguments.
 *
 * <p>Three callers need it — the card, the tree row, and (next) the broker — and each of them
 * has only a node and a way to look ids up. Assembling the three arguments at each call site is
 * where the card got it wrong: it passed `inTrash: false` because it had nothing at hand to
 * answer with, and a deleted entry's card advertised permissions the resolver would refuse.
 * Taking the lookup instead of the boolean makes that unrepresentable.</p>
 */
export function resolveMcpInTree(
  node: TreeNode,
  byId: (id: string) => TreeNode | undefined,
): ResolvedMcpAccess & { folder: TreeNode | undefined } {
  const parent = parentOf(node, byId);
  if (isInTrash(node, byId)) {
    return { access: NO_MCP_ACCESS, source: 'none', folder: parent };
  }
  const own = ownAccess(node);
  if (own !== undefined) {
    return { access: normalizeMcpAccess(own), source: 'entity', folder: parent };
  }
  const decided = nearestAnswer(parent, byId);
  if (decided === undefined) {
    return { access: NO_MCP_ACCESS, source: 'none', folder: parent };
  }
  // The folder returned is the one that ANSWERED, not the one directly above: the viewer says
  // "inherited from X" with this name, and naming a silent folder would send somebody to a form
  // whose boxes are all clear looking for the setting they are subject to.
  return { access: normalizeMcpAccess(decided.mcp), source: 'folder', folder: decided };
}

/**
 * A node's own answer — an entry's from its details, a folder's from itself.
 *
 * <p>A folder carries `mcp` at the top level and an entry inside `details`, and reading only the
 * latter is how a sub-folder's own setting used to be ignored when the sub-folder was the node
 * being asked about.</p>
 */
function ownAccess(node: TreeNode): McpAccess | undefined {
  return node.type === 'entity' ? node.details?.mcp : node.mcp;
}

function parentOf(node: TreeNode, byId: (id: string) => TreeNode | undefined): TreeNode | undefined {
  return node.parentId === undefined || node.parentId === null ? undefined : byId(node.parentId);
}

/**
 * The nearest folder above that has an answer of its own.
 *
 * <p><b>The whole chain, not one step.</b> Resolving against the immediate parent alone meant a
 * project folder opened to agents granted nothing to the entries inside its sub-folders — which
 * is the shape everybody's vault actually has, and it made the switch look broken rather than
 * narrow. Inheritance now walks up until something answers, so opening a folder opens what is
 * under it and closing a sub-folder still closes that branch: an explicit empty object is an
 * answer, and answers stop the walk.</p>
 *
 * <p>The step limit is not defensive dressing. `parentId` comes off a synced record, and a cycle
 * there — two folders each other's parent after a bad merge — would hang the tree renderer rather
 * than draw a wrong badge. Depth in a real vault is single digits.</p>
 */
function nearestAnswer(
  from: TreeNode | undefined,
  byId: (id: string) => TreeNode | undefined,
): (TreeNode & { mcp: McpAccess }) | undefined {
  let current = from;
  for (let step = 0; current !== undefined && step < MAX_TREE_DEPTH; step += 1) {
    if (current.mcp !== undefined) {
      return current as TreeNode & { mcp: McpAccess };
    }
    current = parentOf(current, byId);
  }
  return undefined;
}

const MAX_TREE_DEPTH = 64;

function inheritedFrom(folder: TreeNode | undefined): ResolvedMcpAccess {
  const inherited = folder === undefined ? undefined : folder.mcp;
  if (inherited === undefined) {
    return { access: NO_MCP_ACCESS, source: 'none' };
  }
  return { access: normalizeMcpAccess(inherited), source: 'folder' };
}

/** May the agent delete THIS entry — taking the own-only scope into account. */
export function mayDelete(access: McpAccess, createdByAgent: boolean): boolean {
  return inScope(access.delete, createdByAgent);
}

/**
 * May the agent send THIS folder to the Trash?
 *
 * <p>Its own scope rather than the entry one, because the blast radius is not the same: a folder
 * takes its whole subtree with it. Somebody may reasonably let an agent tidy up entries and never
 * let it remove a folder.</p>
 */
export function mayDeleteFolder(access: McpAccess, createdByAgent: boolean): boolean {
  return inScope(access.folderDelete, createdByAgent);
}

function inScope(scope: McpDeleteScope | undefined, createdByAgent: boolean): boolean {
  return scope === 'any' || (scope === 'own' && createdByAgent);
}

/**
 * The bits the tree's icon is generated from, lowest first.
 *
 * <p>Five, not six: the two delete scopes share one stripe and one colour, because the tree
 * answers "can an agent delete here" and the scope is a question for the form. The order is the
 * ladder's own, which is what makes a glance at the stripes read as an escalation.</p>
 *
 * <p><b>Still five once folders arrived, deliberately.</b> Every extra bit doubles the generated
 * glyph set — five bits is 32 icons, eight would be 256 — and the badge answers a question about
 * THIS row's credential, which is what a person is looking at when they glance at the tree. The
 * folder rungs are shown where they are decided: in the form.</p>
 */
export function accessMask(access: McpAccess): boolean[] {
  return [
    access.view === true,
    access.use === true,
    access.edit === true,
    access.create === true,
    access.delete !== undefined,
  ];
}

/** `11100` — the stable name of a combination, used for the generated icon's file name. */
export function maskKey(access: McpAccess): string {
  return accessMask(access)
    .map((on) => (on ? '1' : '0'))
    .join('');
}

/** What the viewer says in words, for a card that has no checkboxes to look at. */
export function describeAccess(access: McpAccess): string {
  const labels = ['visible', 'usable', 'secret can be replaced', 'can create entries'];
  const parts = accessMask(access)
    .slice(0, labels.length)
    .map((on, index) => (on ? labels[index] : ''))
    .concat(deleteLabel(access.delete))
    .filter((part) => part !== '');
  if (parts.length === 0) {
    return 'not available to agents';
  }
  return [...parts, askLabel(access.ask)].filter((part) => part !== '').join(' · ');
}

function deleteLabel(scope: McpDeleteScope | undefined): string {
  if (scope === 'any') {
    return 'can delete to Trash';
  }
  return scope === 'own' ? 'can delete what it created' : '';
}

/**
 * How often a person is asked, in the card's words — and nothing at all for the answer that asks.
 *
 * <p>Silence for `always` is what keeps every existing card byte for byte what it was. The two
 * answers that spend a person's attention differently are the two worth a word, and a card that
 * hid "never asks" would be a display that lies about the one setting that removes the dialog.</p>
 */
function askLabel(policy: McpAskPolicy | undefined): string {
  if (policy === 'never') {
    return 'never asks';
  }
  return policy === 'every12h' ? 'asks once every 12 hours' : '';
}

/**
 * How many entries a folder's answer would actually reach.
 *
 * <p>The whole subtree, not the direct children. The form says this number out loud so the blast
 * radius of a switch is visible, and counting one level made it say "0 entries" for a project
 * folder whose entries all live in sub-folders — the most reassuring possible wording for the
 * most far-reaching possible click.</p>
 *
 * <p>An entry with an answer of its own is still counted: the sentence is about what the folder
 * covers, and an entry can have its own setting removed later. The walk carries a visited set
 * because `parentId` comes off a synced record and a cycle must not hang a form.</p>
 */
export function entriesUnder(folderId: string, nodes: readonly TreeNode[]): number {
  const children = childrenByParent(nodes);
  const seen = new Set<string>([folderId]);
  const queue = [folderId];
  let found = 0;
  while (queue.length > 0) {
    found += countInto(children.get(queue.pop() as string) ?? [], seen, queue);
  }
  return found;
}

/** Every node grouped under its parent id; a root's parent is the empty string. */
function childrenByParent(nodes: readonly TreeNode[]): Map<string, TreeNode[]> {
  const map = new Map<string, TreeNode[]>();
  for (const node of nodes) {
    const parent = node.parentId ?? '';
    map.set(parent, [...(map.get(parent) ?? []), node]);
  }
  return map;
}

/** One level of the walk: count the entries, queue the folders, and never revisit a node. */
function countInto(children: readonly TreeNode[], seen: Set<string>, queue: string[]): number {
  let found = 0;
  for (const child of children) {
    if (!seen.has(child.id)) {
      seen.add(child.id);
      found += child.type === 'entity' ? 1 : 0;
      queue.push(child.id);
    }
  }
  return found;
}

/**
 * Has anybody opened anything to agents in this vault?
 *
 * <p>The trigger for opening the broker's listener at all. It asks about answers a person GAVE,
 * not about what resolves where: a folder set to nothing is an opt-out and must not start a
 * listener, and an entry that merely inherits is already covered by the folder that answered.</p>
 */
export function anyAgentAccess(nodes: readonly TreeNode[]): boolean {
  return nodes.some((node) => grantsAnything(normalizeMcpAccess(ownAccess(node))));
}
