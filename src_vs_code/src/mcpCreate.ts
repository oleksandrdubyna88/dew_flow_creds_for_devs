import { McpAccess, normalizeMcpAccess } from './mcpAccess';
import { ENTITY_KINDS, EntityKind, EntityMetadata, TreeNode } from './types';
import { isInTrash, isTrashFolder } from './trash';

/**
 * Level 4: an agent storing a credential it just made.
 *
 * <p>The case is real — an agent provisions a host and has the access key in hand — and the risk
 * is where it puts it. <b>The agent does not choose the place.</b> A folder is open to creation
 * only if somebody turned its <i>Agents may create entries</i> switch on, and the set of such
 * folders is the whole of what an agent may choose between. Given a free choice it would make
 * one, and the one it made would be wherever seemed convenient.</p>
 *
 * <p><b>The secret comes from the agent here, and that is the trade.</b> Every other level is
 * built so that no secret passes through an agent's context; this one cannot be, because the
 * agent is the only party that has the value — it is the one that provisioned the thing. The
 * product's answer is not to pretend otherwise but to record it: the entry is marked as
 * agent-created, which is what the narrow delete scope keys on, and the audit line says the
 * secret arrived from the agent so the journal can count them.</p>
 *
 * <p>Pure — no `vscode`, no storage.</p>
 */

/** A folder somebody opened to creation, as the answer names it. */
export interface CreateTarget {
  accountId: string;
  folderId: string;
  folderName: string;
  /** The kind this folder holds, when it is typed. A typed folder dictates the new entry's kind. */
  folderType?: string;
}

/** What an agent may say about the entry it is creating. Everything else is ours to decide. */
export interface CreateRequest {
  name: string;
  kind: string;
  /** The value the agent already holds. Optional: an entry may legitimately have no secret yet. */
  secret?: string;
  host?: string;
  user?: string;
  port?: number;
  /** Which open folder, when there is more than one. Never a free choice — see above. */
  folder?: string;
}

/**
 * The folders an agent may create in.
 *
 * <p>A folder's own switch only: a folder does not inherit creation from its parent, for the same
 * reason inheritance stops at one level everywhere else here — a person opening one folder to an
 * agent has said one thing, and reading it as "and everything under it" says another.</p>
 *
 * <p>Nothing in the Trash is offered, whatever its switch says. Creating inside the Trash would
 * make an entry that is invisible the moment it exists.</p>
 */
export function creatableFolders(
  accounts: readonly { accountId: string }[],
  nodesOf: (accountId: string) => readonly TreeNode[],
  byId: (accountId: string, id: string) => TreeNode | undefined,
): CreateTarget[] {
  return accounts.flatMap(({ accountId }) =>
    nodesOf(accountId)
      .filter((node) => opensToCreation(node, (id) => byId(accountId, id)))
      .map((node) => ({
        accountId,
        folderId: node.id,
        folderName: node.name,
        folderType: node.folderType,
      })),
  );
}

function opensToCreation(node: TreeNode, byId: (id: string) => TreeNode | undefined): boolean {
  if (node.type !== 'folder' || isTrashFolder(node) || isInTrash(node, byId)) {
    return false;
  }
  return normalizeMcpAccess(node.mcp).create === true;
}

/** What went wrong, or the one folder this request lands in. */
export type CreateChoice =
  | { ok: true; target: CreateTarget; kind: EntityKind }
  | { ok: false; message: string };

/**
 * Where this request goes, and what kind the new entry is.
 *
 * <p>Three answers, and each is a different sentence to an agent. <b>No open folder</b> is the
 * common one and it names the switch to turn on. <b>Several open folders and no choice given</b>
 * asks for one and lists them — the agent picks from the person's set, which is not the same as
 * picking a place. <b>A folder that is not on the list</b> is refused without saying whether it
 * exists, because whether it does is not something an agent may enumerate by guessing.</p>
 */
export function chooseTarget(targets: readonly CreateTarget[], request: CreateRequest): CreateChoice {
  if (targets.length === 0) {
    return {
      ok: false,
      message:
        'No folder is open to agents for creating entries. Turn on "Agents may create entries" on the folder this belongs in.',
    };
  }
  const target = pick(targets, request.folder);
  if (target === undefined) {
    return { ok: false, message: describeChoice(targets, request.folder) };
  }
  return kindFor(target, request);
}

function pick(targets: readonly CreateTarget[], folder: string | undefined): CreateTarget | undefined {
  if (folder === undefined || folder === '') {
    return targets.length === 1 ? targets[0] : undefined;
  }
  return targets.find((t) => t.folderName.toLowerCase() === folder.toLowerCase());
}

function describeChoice(targets: readonly CreateTarget[], folder: string | undefined): string {
  const names = targets.map((t) => `"${t.folderName}"`).join(', ');
  return folder === undefined || folder === ''
    ? `Several folders are open for creating entries — name one in "folder": ${names}.`
    : `"${folder}" is not open to agents for creating entries. The ones that are: ${names}.`;
}

/**
 * The new entry's kind — the folder's when it has one.
 *
 * <p>A typed folder holds one kind and refuses the others, so an agent naming a different kind is
 * making an entry the folder would not accept from a person. The folder wins, and the refusal is
 * only for the case where there is nothing to fall back on.</p>
 */
function kindFor(target: CreateTarget, request: CreateRequest): CreateChoice {
  const wanted = target.folderType ?? request.kind;
  if (!isEntityKind(wanted)) {
    return {
      ok: false,
      message: `"${request.kind}" is not a kind of entry. One of: ${ENTITY_KINDS.join(', ')}.`,
    };
  }
  return { ok: true, target, kind: wanted };
}

function isEntityKind(value: string): value is EntityKind {
  return (ENTITY_KINDS as readonly string[]).includes(value);
}

/**
 * The record an agent's request becomes.
 *
 * <p>Built field by field, like the read side and for the same reason: an agent supplies four
 * things and everything else is ours. `mcpCreatedByAgent` is the one that matters later — the
 * narrow delete scope keys on it, so an entry that arrived this way is one the agent may tidy
 * away and an entry a person made is not.</p>
 */
export function detailsFor(id: string, kind: EntityKind, request: CreateRequest): EntityMetadata {
  return {
    id,
    name: request.name,
    kind,
    isSshEnabled: kind === 'ssh',
    host: blank(request.host),
    user: blank(request.user),
    port: request.port,
    mcpCreatedByAgent: true,
  };
}

function blank(value: string | undefined): string | undefined {
  return value === undefined || value.trim().length === 0 ? undefined : value;
}

/** What the consent prompt says: the entry, its kind, and where it is going. */
export function summarizeCreate(request: CreateRequest, target: CreateTarget, kind: string): string {
  return `${request.name} (${kind}) in "${target.folderName}"`;
}

/** Is anything at all creatable? Used by the tool to answer before a round trip. */
export function anyCreatable(access: McpAccess): boolean {
  return access.create === true;
}
