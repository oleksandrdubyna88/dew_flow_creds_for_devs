import { FolderAccepted, FolderDecision, McpFolderHooks } from './brokerFolderDoor';
import {
  FolderEdit,
  describeMoveRefusal,
  findFolder,
  moveRefusal,
  summarizeFolderEdit,
  visibleFolders,
} from './mcpFolders';
import { StorageManager } from './storageManager';
import { FolderType, TreeNode } from './types';

/**
 * The folder verbs, joined to a vault.
 *
 * <p>The half `mcpFolders.ts` deliberately has not got: that module decides, this one reaches
 * storage. The split is the same one every other level here keeps — a decision is a test, a
 * write is a window.</p>
 *
 * <p><b>Three fields cross from an agent's request into the tree, and they are named one at a
 * time.</b> Nothing spreads a request body over a node: a spread is how a field nobody meant —
 * `mcp` above all — arrives in the vault, and this is the exact place that would happen.</p>
 */
export function folderHooks(storage: StorageManager, onMutated: () => void): McpFolderHooks {
  const accounts = (): { accountId: string }[] => storage.getAccounts().map((a) => ({ accountId: a.accountId }));
  const byId = (accountId: string, id: string): TreeNode | undefined => storage.getNode(accountId, id);
  const local = (accountId: string) => (id: string): TreeNode | undefined => byId(accountId, id);

  return {
    list: () => visibleFolders(accounts(), (id) => storage.getNodes(id), byId),
    choose: (action, body) => choose(storage, accounts(), byId, action, body),
    create: async (decision, body) => {
      const made = newFolder(String(body.name), decision.target.entityId, readType(body.folderType));
      await storage.addNode(decision.target.accountId, made);
      onMutated();
      return { id: made.id, name: made.name };
    },
    edit: async (decision, edit) => {
      const changed = await applyEdit(storage, decision, edit, local(decision.target.accountId));
      onMutated();
      return changed;
    },
    remove: async (decision) => {
      await storage.moveToTrash(decision.target.accountId, decision.target.entityId);
      onMutated();
      return true;
    },
  };
}

/**
 * A folder an agent made, marked as such.
 *
 * <p>`mcpCreatedByAgent` is the mark the narrow delete scope keys on. Forgetting it would make
 * "may delete what it created" cover nothing at all — a failure in the safe direction, which is
 * the kind that survives for months.</p>
 */
function newFolder(name: string, parentId: string, folderType: FolderType | undefined): TreeNode {
  return {
    id: StorageManager.newId(),
    name,
    type: 'folder',
    parentId,
    mcpCreatedByAgent: true,
    ...(folderType === undefined ? {} : { folderType }),
  };
}

/**
 * Where a request lands, or why it does not.
 *
 * <p>Creation names the PARENT and editing names the folder itself, so they resolve different
 * ids against different switches — but both end in the same shape, because the door beyond this
 * point treats them identically.</p>
 */
function choose(
  storage: StorageManager,
  accounts: readonly { accountId: string }[],
  byId: (accountId: string, id: string) => TreeNode | undefined,
  action: string,
  body: Record<string, unknown>,
): FolderDecision {
  const id = addressed(action, body);
  if (id === '') {
    return missingId(action);
  }
  const found = findFolder(accounts, byId, id, action);
  if (found === undefined) {
    return { ok: false, code: 'not_found', message: `No folder with id "${id}" is open to you. Call creds_folders again.` };
  }
  return found.kind === 'closed'
    ? closedAnswer(found.node.name, found.needed)
    : accept(storage, found.accountId, found.node, action, body, (i) => byId(found.accountId, i));
}

/** Creating names the PARENT; the other two name the folder itself. */
function addressed(action: string, body: Record<string, unknown>): string {
  const raw = action === 'create' ? body.parent : body.folder;
  return typeof raw === 'string' ? raw : '';
}

function missingId(action: string): FolderDecision {
  const message =
    action === 'create'
      ? 'Name the "parent" folder to create in — creds_folders lists the ones open to you.'
      : 'Name the "folder" to change.';
  return { ok: false, code: 'invalid_request', message };
}

/** The refusal that names the control to turn on, in the words the form prints. */
function closedAnswer(name: string, needed: string): FolderDecision {
  return {
    ok: false,
    code: 'denied',
    message: `"${name}" is not open to agents for that. Turn on the ${LABELS[needed] ?? needed} switch on the folder, or on one above it.`,
  };
}

const LABELS: Readonly<Record<string, string>> = {
  folderCreate: '"Agents may create folders"',
  folderEdit: '"Agents may rename and move folders"',
  folderDelete: '"Agents may delete folders they created"',
};

function accept(
  storage: StorageManager,
  accountId: string,
  node: TreeNode,
  action: string,
  body: Record<string, unknown>,
  local: (id: string) => TreeNode | undefined,
): FolderDecision {
  const edit = readEdit(body);
  const refusal = action === 'edit' && edit.parent !== undefined ? moveRefusal(node, edit.parent, local) : undefined;
  if (refusal !== undefined) {
    return { ok: false, code: 'denied', message: describeMoveRefusal(refusal, node.name) };
  }
  return {
    ok: true,
    target: { accountId, entityId: node.id, entityName: node.name, kind: 'folder' },
    summary: summaryFor(storage, accountId, node, action, body, edit),
    edit,
  };
}

function summaryFor(
  storage: StorageManager,
  accountId: string,
  node: TreeNode,
  action: string,
  body: Record<string, unknown>,
  edit: FolderEdit,
): string {
  if (action === 'create') {
    return `"${String(body.name)}" inside "${node.name}"`;
  }
  return action === 'delete'
    ? `"${node.name}" and everything in it`
    : summarizeFolderEdit(node, edit, parentNameOf(storage, accountId, edit));
}

function parentNameOf(
  storage: StorageManager,
  accountId: string,
  edit: FolderEdit,
): string | undefined {
  return edit.parent === undefined ? undefined : storage.getNode(accountId, edit.parent)?.name;
}

/**
 * The three fields, read one at a time.
 *
 * <p>Never a spread of the request body. The switches live in `mcp`, and the only way they reach
 * the tree is if something copies a field nobody named — so nothing here copies a field nobody
 * named.</p>
 */
function readEdit(body: Record<string, unknown>): FolderEdit {
  return {
    ...maybe('name', text(body.name)),
    ...maybe('parent', text(body.parent)),
    ...maybe('folderType', readType(body.folderType)),
  };
}

/** A field only appears when it was actually asked for — absent is not the same as empty. */
function maybe(key: string, value: string | undefined): Record<string, string> {
  return value === undefined ? {} : { [key]: value };
}

function text(raw: unknown): string | undefined {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  return trimmed.length > 0 ? trimmed : undefined;
}

/** A kind this build does not know is dropped, never stored — the tree would not render it. */
function readType(raw: unknown): FolderType | undefined {
  return typeof raw === 'string' && FOLDER_TYPES.has(raw) ? (raw as FolderType) : undefined;
}

const FOLDER_TYPES: ReadonlySet<string> = new Set([
  'any',
  'credential',
  'ssh',
  'sshkey',
  'vpn',
  'db',
  'terminal',
  'script',
  'config',
]);

/** Apply what was asked, and say whether the tree actually moved. */
async function applyEdit(
  storage: StorageManager,
  decision: FolderAccepted,
  edit: FolderEdit,
  local: (id: string) => TreeNode | undefined,
): Promise<boolean> {
  const node = local(decision.target.entityId);
  if (node === undefined) {
    return false;
  }
  await storage.updateNode(decision.target.accountId, { ...node, ...changesOf(edit) });
  return true;
}

/** The three fields, named one at a time — never a spread of the request body. */
function changesOf(edit: FolderEdit): Partial<TreeNode> {
  return {
    ...maybe('name', edit.name),
    ...maybe('parentId', edit.parent),
    ...maybe('folderType', edit.folderType),
  } as Partial<TreeNode>;
}
