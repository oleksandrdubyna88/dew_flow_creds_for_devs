import { McpAccess, ResolvedMcpAccess, accessMask, resolveMcpInTree } from './mcpAccess';
import { EntityMetadata, TreeNode } from './types';
import { resolveKind } from './entityKind';
import { withoutPassword } from './dbConnString';

/**
 * What an agent is allowed to SEE — level 1 of the ladder, and the only place that decides it.
 *
 * <p>One function builds the whole answer, and it takes the entry apart field by field rather
 * than spreading it and deleting: a spread would carry every field a future release adds
 * straight onto the wire, and the field it carried would be whichever one nobody thought about.
 * Everything here is written out on purpose, and the absent ones are absent on purpose.</p>
 *
 * <p><b>What is deliberately NOT here.</b> No password, no private key, no VPN config, no TOTP
 * seed, no attachment — there is no field in this shape any of them could travel in, which is
 * the same structural guarantee `brokerProtocol.ts` keeps for the rest of the surface. A DB
 * connection string IS included, with the password stripped by `withoutPassword`, because
 * without it the agent cannot address the database at all; `hasPassword` says one exists
 * without saying what it is.</p>
 *
 * <p><b>Notes are not included, and that is a deviation from the plan.</b> The plan's example
 * answer carries the note text. Notes were moved out of plaintext metadata into SecretStorage
 * in 0.20 and are stripped from a shared entry, so the product treats them as a secret
 * everywhere else; a field that is a secret in every other path must not become readable in
 * this one. `hasNotes` says there is something to read, and a person who wants the text can put
 * it somewhere the product does not call a secret. Reversing this is a one-line change here.</p>
 *
 * <p>Pure — no `vscode`, no storage. It is handed what it needs and answers with data.</p>
 */

/** One visible entry, as the wire carries it. */
export interface McpEntry {
  id: string;
  name: string;
  kind: string;
  /** The folder it lives in, so an agent can tell two entries with one name apart. */
  folder: string;
  host?: string;
  port?: number;
  user?: string;
  dbType?: string;
  /** The connection string with the password removed — never the one that would connect. */
  connectionString?: string;
  vpnType?: string;
  /** The command a terminal entry runs. Not a secret: it is what the person typed. */
  command?: string;
  scriptLanguage?: string;
  hasPassword: boolean;
  hasPrivateKey: boolean;
  hasNotes: boolean;
  hasTotp: boolean;
  /** The names this entry needs to be usable, so an agent can bring up a VPN first. */
  dependsOn: string[];
  /** What may be done with it, from the ladder — beyond `view`, which it evidently has. */
  can: McpCapabilities;
}

/** The four rungs above `view`, said in the words a tool description uses. */
export interface McpCapabilities {
  use: boolean;
  edit: boolean;
  create: boolean;
  delete: boolean;
}

export interface McpEntriesBody {
  entries: McpEntry[];
}

/** What the builder needs to know about one entry that it cannot read off the node. */
export interface McpEntryContext {
  /** The resolved access — the entry's own, or its folder's, or nothing. */
  resolved: ResolvedMcpAccess;
  folderName: string;
  /** True when a secret of that kind is stored. Read by the caller, which owns the keychain. */
  hasPassword: boolean;
  hasPrivateKey: boolean;
  hasNotes: boolean;
  hasTotp: boolean;
  /** The stored connection string, if any. Stripped here rather than by the caller. */
  dbConnection?: string;
  /** The names this entry depends on, already resolved from ids by the caller. */
  dependsOn: readonly string[];
}

/** Is this entry visible to an agent at all? Everything else follows from the answer. */
export function isVisibleToAgents(access: McpAccess): boolean {
  return access.view === true;
}

export function capabilitiesOf(access: McpAccess): McpCapabilities {
  const [, use, edit, create, del] = accessMask(access);
  return { use, edit, create, delete: del };
}

/**
 * One entry, reduced to what an agent may see.
 *
 * <p>Returns `undefined` when the entry is not visible, rather than an empty record: the caller
 * builds a list by filtering on this, so "not visible" and "visible but empty" can never be
 * confused into a row that should not be there.</p>
 */
export function mcpEntryFor(node: TreeNode, context: McpEntryContext): McpEntry | undefined {
  const details = node.details;
  if (details === undefined || !isVisibleToAgents(context.resolved.access)) {
    return undefined;
  }
  return {
    id: node.id,
    name: node.name,
    kind: resolveKind(details),
    folder: context.folderName,
    ...visibleFields(details),
    connectionString:
      context.dbConnection === undefined ? undefined : withoutPassword(context.dbConnection),
    hasPassword: context.hasPassword,
    hasPrivateKey: context.hasPrivateKey,
    hasNotes: context.hasNotes,
    hasTotp: context.hasTotp,
    dependsOn: [...context.dependsOn],
    can: capabilitiesOf(context.resolved.access),
  };
}

/**
 * The fields taken off the stored record, named one by one.
 *
 * <p>Separate from the assembly above so the list of what crosses the wire reads as a list. A
 * new field on `EntityMetadata` does not appear here by itself, which is the intended
 * direction: adding one to this answer should be a decision somebody made.</p>
 */
function visibleFields(details: EntityMetadata): Partial<McpEntry> {
  return {
    host: blankToUndefined(details.host),
    port: details.port,
    user: blankToUndefined(details.user),
    dbType: blankToUndefined(details.dbType),
    vpnType: blankToUndefined(details.vpnType),
    command: blankToUndefined(details.command),
    scriptLanguage: blankToUndefined(details.scriptLanguage),
  };
}

/** An empty string on the wire says "there is one, and it is nothing", which is never true here. */
function blankToUndefined(value: string | undefined): string | undefined {
  return value === undefined || value.trim().length === 0 ? undefined : value;
}

/**
 * Just the reads this needs — so the unit test does not build a StorageManager.
 *
 * <p>The same narrow-interface shape `maskEntries.ts` uses next door, and for the same reason:
 * a module that takes the whole storage manager is a module whose test has to build one.</p>
 */
export interface McpVaultSource {
  getAccounts(): readonly { accountId: string }[];
  getNodes(accountId: string): readonly TreeNode[];
  getNode(accountId: string, id: string): TreeNode | undefined;
  getPassword(accountId: string, entityId: string): Thenable<string | undefined>;
  getPrivateKey(accountId: string, entityId: string): Thenable<string | undefined>;
  getNotes(accountId: string, entityId: string): Thenable<string | undefined>;
  getTotp(accountId: string, entityId: string): Thenable<string | undefined>;
  getDbConnection(accountId: string, entityId: string): Thenable<string | undefined>;
}

/**
 * Every entry, in every account, that somebody opened to agents.
 *
 * <p><b>Filtered before it is read.</b> The keychain reads that answer `hasPassword` happen only
 * for entries that passed the switch, so a vault nobody has opened to agents costs zero of them
 * however large it is. An entry that IS open costs five, which is the same budget
 * `maskEntriesFor` spends per grant and for the same reason: they are the entries whose
 * existence the person deliberately disclosed.</p>
 *
 * <p>Resolution goes through `resolveMcpInTree`, which is the same road the tree row and the
 * card take — inheritance from the folder, and nothing at all inside the Trash.</p>
 */
export async function visibleMcpEntries(source: McpVaultSource): Promise<readonly McpEntry[]> {
  const found: McpEntry[] = [];
  for (const { accountId } of source.getAccounts()) {
    const byId = (id: string): TreeNode | undefined => source.getNode(accountId, id);
    for (const node of source.getNodes(accountId)) {
      const entry = await entryIfVisible(source, accountId, node, byId);
      if (entry !== undefined) {
        found.push(entry);
      }
    }
  }
  return found;
}

async function entryIfVisible(
  source: McpVaultSource,
  accountId: string,
  node: TreeNode,
  byId: (id: string) => TreeNode | undefined,
): Promise<McpEntry | undefined> {
  const resolved = resolveMcpInTree(node, byId);
  if (!shown(node, resolved)) {
    return undefined;
  }
  return mcpEntryFor(node, {
    resolved,
    folderName: folderNameOf(resolved),
    ...(await storedSecrets(source, accountId, node.id)),
    dependsOn: dependencyNames(node, byId),
  });
}

/** A folder is not an entry, and an entry nobody opened is not shown. */
function shown(node: TreeNode, resolved: ResolvedMcpAccess): boolean {
  return node.type === 'entity' && isVisibleToAgents(resolved.access);
}

/** An entry at the root has no folder, and an empty name is the honest answer for it. */
function folderNameOf(resolved: ResolvedMcpAccess & { folder?: TreeNode }): string {
  return resolved.folder?.name ?? '';
}

/**
 * The five keychain reads, as five booleans and one string.
 *
 * <p>Read together rather than one at a time: they are independent, and a serial chain of five
 * cross-process reads per visible entry is the cost class this product has already removed from
 * the tree once. The connection string is the one value that comes back rather than a flag,
 * because the shaper strips its password and hands it on.</p>
 */
async function storedSecrets(
  source: McpVaultSource,
  accountId: string,
  entityId: string,
): Promise<Pick<McpEntryContext, 'hasPassword' | 'hasPrivateKey' | 'hasNotes' | 'hasTotp' | 'dbConnection'>> {
  const [password, privateKey, notes, totp, dbConnection] = await Promise.all([
    source.getPassword(accountId, entityId),
    source.getPrivateKey(accountId, entityId),
    source.getNotes(accountId, entityId),
    source.getTotp(accountId, entityId),
    source.getDbConnection(accountId, entityId),
  ]);
  return {
    hasPassword: password !== undefined,
    hasPrivateKey: privateKey !== undefined,
    hasNotes: notes !== undefined,
    hasTotp: totp !== undefined,
    dbConnection,
  };
}

/**
 * What an entry id means to an agent asking to USE it.
 *
 * <p>Three answers, because the middle one is the one worth having: an entry that exists and is
 * closed is a sentence a person can act on ("turn on Usable by agents"), while collapsing it
 * into "no such entry" would make the product look broken exactly when it is working.</p>
 *
 * <p>Searched across every account, because an id is unique to a vault and an agent has no
 * account to name — it got the id from a list that had already merged them.</p>
 */
export type UsableEntry =
  | { kind: 'usable'; accountId: string; node: TreeNode }
  | { kind: 'closed'; node: TreeNode; needed: keyof McpAccess }
  | undefined;

/**
 * Find an entry by id and say whether an agent may use it.
 *
 * <p>Resolution goes through `resolveMcpInTree`, the same road the tree row, the card and the
 * list take — inheritance from the folder, and nothing at all inside the Trash. A synchronous
 * lookup on purpose: this runs before a consent modal, and nothing here reads a secret.</p>
 */
export function findUsableEntry(
  source: Pick<McpVaultSource, 'getAccounts' | 'getNode'>,
  entryId: string,
  action: string,
): UsableEntry {
  for (const { accountId } of source.getAccounts()) {
    const node = source.getNode(accountId, entryId);
    if (node?.type === 'entity') {
      return verdictFor(accountId, node, (id) => source.getNode(accountId, id), action);
    }
  }
  return undefined;
}

/**
 * Which switch an action needs.
 *
 * <p>Not every action sits on the same rung, and the ladder is the whole point: `rotate`
 * replaces a stored secret, which is <b>edit</b>, while running a command or opening a terminal
 * is <b>use</b>. Deciding this per action rather than once per call is what stops a rotation
 * riding in on a permission somebody granted for a read-only query.</p>
 *
 * <p>An action this table does not know asks for the HIGHEST rung it could be, not the lowest.
 * A verb added to the broker and forgotten here should fail closed.</p>
 */
export function switchForAction(action: string): keyof McpAccess {
  if (action === 'rotate') {
    return 'edit';
  }
  return KNOWN_USE_ACTIONS.has(action) ? 'use' : 'delete';
}

/** The verbs that are plain USE. Written out, so an unknown one falls through to the top rung. */
const KNOWN_USE_ACTIONS = new Set([
  'exec',
  'terminal',
  'query',
  'run',
  'exportEnv',
  'up',
  'down',
]);

function verdictFor(
  accountId: string,
  node: TreeNode,
  byId: (id: string) => TreeNode | undefined,
  action: string,
): UsableEntry {
  const access = resolveMcpInTree(node, byId).access;
  const needed = switchForAction(action);
  const granted = needed === 'delete' ? access.delete !== undefined : access[needed] === true;
  return granted ? { kind: 'usable', accountId, node } : { kind: 'closed', node, needed };
}

/**
 * Dependencies as NAMES, never ids.
 *
 * <p>An id means nothing to an agent — it cannot look one up, because the only thing that
 * resolves ids is the vault it is not allowed to enumerate. A name is what appears in the
 * consent modal it will trigger next, so the two halves of the conversation match. A dependency
 * whose target has been deleted is dropped rather than named, since a name that resolves to
 * nothing is worse than silence.</p>
 */
function dependencyNames(node: TreeNode, byId: (id: string) => TreeNode | undefined): readonly string[] {
  return (node.details?.dependsOn ?? []).flatMap((id) => {
    const target = byId(id);
    return target === undefined ? [] : [target.name];
  });
}
