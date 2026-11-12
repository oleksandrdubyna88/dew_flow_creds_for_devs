import * as assert from 'node:assert/strict';
import type { McpAccess } from '../mcpAccess';
import { McpVaultSource, visibleMcpEntries } from '../mcpEntries';
import { visibleFolders } from '../mcpFolders';
import type { StorageManager } from '../storageManager';
import { stored } from '../storedSecret';
import type { EntityMetadata, TreeNode } from '../types';

/**
 * A vault in which an agent may NOT view some nodes, each for a different reason, and may view the rest (rule A of
 * `research/PLAN_agent_refusal_names_unlisted_entry.md`, its section 5).
 *
 * <p>One account, `a1`. Each node has an id of its own and the name `MARK-<id>`, so a name or an id that reaches an
 * answer can be found by a plain text search. The file gives the source, the lists of hidden names and hidden ids,
 * and the ids by role. Not a test file: `node:test` is pointed at `*.test.js` only.</p>
 *
 * <p>Nothing here is a hidden node by name alone. `proveFixture` asserts that the product's own two lists (`visibleMcpEntries`,
 * `visibleFolders`) agree with the roles: a fixture that the code declines for another reason would prove nothing.</p>
 */

export const ACCOUNT = 'a1';

/** Every switch on: the node is hidden for another reason (the Trash, a PIN), not for want of a switch. */
const ALL: McpAccess = { view: true, use: true, edit: true, create: true, delete: 'any', folderCreate: true, folderEdit: true, folderDelete: 'any' };

/** The marker of a node: what a leak looks like in a body. */
export const markerOf = (id: string): string => `MARK-${id}`;

function folder(id: string, parentId: string | null, mcp?: McpAccess, extra: Partial<TreeNode> = {}): TreeNode {
  return { id, name: markerOf(id), type: 'folder', parentId, ...(mcp === undefined ? {} : { mcp }), ...extra };
}

function entry(id: string, parentId: string | null, details: Partial<EntityMetadata> = {}): TreeNode {
  const base: EntityMetadata = { id, name: markerOf(id), kind: 'ssh', isSshEnabled: true, host: 'h.example.test' };
  return { id, name: markerOf(id), type: 'entity', parentId, details: { ...base, ...details } };
}

/** The ids of the nodes the agent may NOT view, by role. */
export const HIDDEN = {
  entries: {
    /** In a folder that has no switch. */
    none: 'he-none',
    /** `mcp: {}` in a folder with `view` on. */
    empty: 'he-empty',
    /** In the Trash, every switch on. */
    trash: 'he-trash',
    /** A PIN of its own, every switch on. */
    pin: 'he-pin',
    /** A config entry with no switch. */
    config: 'he-config',
  },
  folders: {
    /** At the root, no switch. */
    none: 'hf-none',
    /** `mcp: {}` under a folder with `view` on. */
    empty: 'hf-empty',
    /** In the Trash, every switch on. */
    trash: 'hf-trash',
    /** The Trash itself. */
    theTrash: 'hf-thetrash',
  },
} as const;

/** The ids of the nodes the agent may view, by role. */
export const VISIBLE = {
  /** An entry that takes `view` from its folder and nothing else: the positive control. */
  entryView: 've-view',
  /** `mcp: { use: true }`, kind ssh, so that the world's scripted `exec` serves it. */
  entryUse: 've-use',
  /** `mcp: { delete: 'own' }`, made by a person. */
  entryOwnDelete: 've-own',
  /** N1: depends on the hidden entry that has no switch. */
  n1: 've-n1',
  /** N4: a view of its own, inside the hidden folder that has no switch. */
  n4: 've-n4',
  /** N5: a Terminal entry whose command holds a reference to the hidden entry that has no switch. */
  n5: 've-n5',
  folderView: 'vf-view',
  /** `folderEdit` on, with one child folder that moves in the move rows. */
  folderEdit: 'vf-edit',
  folderEditChild: 'vf-child',
  /** `create` on: without it the create row stops before it reads the name. */
  folderCreate: 'vf-create',
  /** N6: a view of its own, under the hidden folder that has no switch. */
  n6: 'vf-n6',
} as const;

/** What N5's command says: a reference to the hidden entry by NAME. */
export const N5_COMMAND = `creds://${ACCOUNT}/${markerOf(HIDDEN.entries.none)}/password`;

const NODES: readonly TreeNode[] = [
  folder(HIDDEN.folders.none, null),
  folder(VISIBLE.folderView, null, { view: true }),
  folder(HIDDEN.folders.empty, VISIBLE.folderView, {}),
  folder(HIDDEN.folders.theTrash, null, ALL, { isTrash: true }),
  folder(HIDDEN.folders.trash, HIDDEN.folders.theTrash, ALL),
  folder(VISIBLE.folderEdit, null, { folderEdit: true }),
  folder(VISIBLE.folderEditChild, VISIBLE.folderEdit),
  folder(VISIBLE.folderCreate, null, { create: true }),
  folder(VISIBLE.n6, HIDDEN.folders.none, { view: true }),
  entry(HIDDEN.entries.none, HIDDEN.folders.none),
  entry(HIDDEN.entries.empty, VISIBLE.folderView, { mcp: {} }),
  entry(HIDDEN.entries.trash, HIDDEN.folders.theTrash, { mcp: ALL }),
  entry(HIDDEN.entries.pin, null, { mcp: ALL, pinProtected: true }),
  entry(HIDDEN.entries.config, null, { kind: 'config', isConfig: true, configFormat: 'json', configFileName: 'he-config.json' } as Partial<EntityMetadata>),
  entry(VISIBLE.entryView, VISIBLE.folderView),
  entry(VISIBLE.entryUse, null, { mcp: { use: true } }),
  entry(VISIBLE.entryOwnDelete, null, { mcp: { delete: 'own' } }),
  entry(VISIBLE.n1, null, { mcp: { view: true }, dependsOn: [HIDDEN.entries.none] }),
  entry(VISIBLE.n4, HIDDEN.folders.none, { mcp: { view: true } }),
  entry(VISIBLE.n5, null, { mcp: { view: true }, kind: 'terminal', isSshEnabled: false, command: N5_COMMAND }),
];

/** The vault as the broker's collaborators see it: one account, no stored secret anywhere. */
export const SOURCE: McpVaultSource = {
  getAccounts: () => [{ accountId: ACCOUNT }],
  getNodes: () => NODES,
  getNode: (_account, id) => NODES.find((node) => node.id === id),
  getPassword: () => Promise.resolve(stored(undefined)),
  getPrivateKey: () => Promise.resolve(stored(undefined)),
  getNotes: () => Promise.resolve(stored(undefined)),
  getTotp: () => Promise.resolve(stored(undefined)),
  getDbConnection: () => Promise.resolve(stored(undefined)),
};

/**
 * The hooks that are typed `StorageManager` get the source through this one cast: a `StorageManager` is a class of forty
 * members, and a refusal reads three of them (`getAccounts`, `getNodes`, `getNode`), as `agentSshWorld.ts` casts it too.
 */
export const STORAGE = SOURCE as unknown as StorageManager;

const idsOf = (roles: Readonly<Record<string, string>>): string[] => Object.values(roles);

/** Every hidden id, entries first, then folders. */
export const HIDDEN_IDS: readonly string[] = [...idsOf(HIDDEN.entries), ...idsOf(HIDDEN.folders)];

/** Every hidden name, in the order of `HIDDEN_IDS`. */
export const HIDDEN_NAMES: readonly string[] = HIDDEN_IDS.map(markerOf);

/** The hidden entries that have no PIN: the four that a lookup answers `closed` for today. */
export const HIDDEN_ENTRIES_NO_PIN: readonly string[] = [HIDDEN.entries.none, HIDDEN.entries.empty, HIDDEN.entries.trash, HIDDEN.entries.config];

/** An id of the same length that is not in the vault: the last character changed. */
export function madeUp(id: string): string {
  const last = id.endsWith('x') ? 'y' : 'x';
  return `${id.slice(0, -1)}${last}`;
}

/** The made-up id of every hidden id is a made-up one: not a node of the vault, and not another hidden id. */
function assertMadeUp(id: string): void {
  assert.equal(SOURCE.getNode(ACCOUNT, madeUp(id)), undefined, `madeUp(${id}) is a node of the vault`);
  assert.equal(madeUp(id).length, id.length);
  assert.notEqual(madeUp(id), id);
}

/** Proof 1: the product's own two lists agree with the roles of the fixture. */
async function assertListsAgree(): Promise<void> {
  const entries = (await visibleMcpEntries(SOURCE)).map((e) => e.id).sort((a, b) => a.localeCompare(b));
  assert.deepEqual(entries, idsOf(VISIBLE).filter((id) => id.startsWith('ve-')).sort((a, b) => a.localeCompare(b)), 'visibleMcpEntries gives exactly the visible entries');
  const folders = visibleFolders(SOURCE.getAccounts(), (account) => SOURCE.getNodes(account), (account, id) => SOURCE.getNode(account, id)).map((f) => f.id).sort((a, b) => a.localeCompare(b));
  assert.deepEqual(folders, idsOf(VISIBLE).filter((id) => id.startsWith('vf-')).sort((a, b) => a.localeCompare(b)), 'visibleFolders gives exactly the visible folders');
}

/** Proof 2: no hidden id (so no hidden marker, which holds it) is a part of the id or the name of ANOTHER node. */
function assertNoOverlap(): void {
  const parts = NODES.flatMap((node) => HIDDEN_IDS.filter((id) => id !== node.id && (node.id.includes(id) || node.name.includes(id))));
  assert.deepEqual(parts, [], 'a hidden id is a part of another node');
}

/**
 * The three proofs at load of the fixture (a fixture that the code declines for another reason proves nothing): the two
 * lists give exactly the visible nodes; no hidden name or id is a part of another node's name or id; `madeUp` gives an id
 * of the same length that is not in the vault.
 */
export async function proveFixture(): Promise<void> {
  await assertListsAgree();
  assertNoOverlap();
  HIDDEN_IDS.forEach(assertMadeUp);
}
