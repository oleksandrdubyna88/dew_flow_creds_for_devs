import { TreeNode } from './types';

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

export interface McpAccess {
  view?: boolean;
  use?: boolean;
  edit?: boolean;
  create?: boolean;
  /** `'own'` restricts deletion to entries the agent itself created. Absent means no deleting. */
  delete?: McpDeleteScope;
}

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
  return climb(raw, deleteScope(raw.delete));
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
 */
export function readMcpAccess(raw: unknown): McpAccess | undefined {
  if (typeof raw !== 'object' || raw === null) {
    return undefined;
  }
  const r = raw as Record<string, unknown>;
  return {
    view: r.view === true,
    use: r.use === true,
    edit: r.edit === true,
    create: r.create === true,
    delete: deleteScope(r.delete),
  };
}

/** Each rung turns on the one below it, and nothing turns on the one above. */
function climb(raw: McpAccess, del: McpDeleteScope | undefined): McpAccess {
  const on = (flag: boolean | undefined, below: boolean): boolean => flag === true || below;
  const create = on(raw.create, del !== undefined);
  const edit = on(raw.edit, create);
  const use = on(raw.use, edit);
  return { view: on(raw.view, use), use, edit, create, delete: del };
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

function inheritedFrom(folder: TreeNode | undefined): ResolvedMcpAccess {
  const inherited = folder === undefined ? undefined : folder.mcp;
  if (inherited === undefined) {
    return { access: NO_MCP_ACCESS, source: 'none' };
  }
  return { access: normalizeMcpAccess(inherited), source: 'folder' };
}

/** May the agent delete THIS entry — taking the own-only scope into account. */
export function mayDelete(access: McpAccess, createdByAgent: boolean): boolean {
  if (access.delete === 'any') {
    return true;
  }
  return access.delete === 'own' && createdByAgent;
}

/**
 * The bits the tree's icon is generated from, lowest first.
 *
 * <p>Five, not six: the two delete scopes share one stripe and one colour, because the tree
 * answers "can an agent delete here" and the scope is a question for the form. The order is the
 * ladder's own, which is what makes a glance at the stripes read as an escalation.</p>
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
  return parts.length === 0 ? 'not available to agents' : parts.join(' · ');
}

function deleteLabel(scope: McpDeleteScope | undefined): string {
  if (scope === 'any') {
    return 'can delete to Trash';
  }
  return scope === 'own' ? 'can delete what it created' : '';
}
