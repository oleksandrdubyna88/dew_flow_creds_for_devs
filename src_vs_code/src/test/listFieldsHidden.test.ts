import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { HIDDEN_DEPENDENCY, HIDDEN_REFERENCE } from '../agentNaming';
import { HELP_LANGUAGES, HelpLanguage, bodyFor, helpArticle } from '../helpContent';
import type { ReadRouteSources } from '../brokerReadRoutes';
import type { McpAccess } from '../mcpAccess';
import { McpEntry, McpVaultSource, agentMayView, visibleMcpEntries } from '../mcpEntries';
import { locateRef, parseSecretRef } from '../secretRef';
import { vaultRefLocator, viewableLocatorForOneListing } from '../vaultRefLocator';
import { type FolderView, visibleFolders } from '../mcpFolders';
import { stored } from '../storedSecret';
import type { EntityMetadata, TreeNode } from '../types';
import { CONTEXT_1, wallWorld } from './bridgeWallWorld';
import { loadBridgeModules } from './bridgeModules';

/**
 * The list answers name no node that the agent may not view (`research/PLAN_agent_list_fields_hidden_n1_n4_n6.md`, §6).
 *
 * <p>Each row builds its own small vault and calls the product's own list function: no row reads a source file. A hidden node has a
 * name and an id that a plain text search finds, so a row that asserts "the body holds no hidden name" can fail. The pair rows (E1 to
 * E4) compare the two whole bodies of two vaults that differ in one thing: the second node is hidden in the first, and not there in
 * the second (rule A of `research/PLAN_agent_refusal_names_unlisted_entry.md`).</p>
 *
 * <p><b>What these rows do not prove</b> (§6.9): a real window with a real `creds-mcp` and a real agent (H1 runs the real binary over
 * a stub window, the class test runs the real broker over a test vault); free text (a command, a name or a host that a person typed can
 * hold any word, also the name of another entry); Windows; the four translations of the help; the time of a hidden node and of a
 * missing id, because the pair rows compare bodies, not durations.</p>
 */

/** Every switch on: the node is hidden for another reason (the Trash, a PIN), not for want of a switch. */
const ALL: McpAccess = { view: true, use: true, edit: true, create: true, delete: 'any', folderCreate: true, folderEdit: true, folderDelete: 'any' };

function folder(id: string, name: string, extra: Partial<TreeNode> = {}): TreeNode {
  return { id, name, type: 'folder', parentId: null, ...extra };
}

function entry(id: string, name: string, details: Partial<EntityMetadata> = {}, parentId: string | null = null): TreeNode {
  const base: EntityMetadata = { id, name, kind: 'ssh', isSshEnabled: true, host: 'h.example.test' };
  return { id, name, type: 'entity', parentId, details: { ...base, ...details } };
}

interface Account {
  readonly accountId: string;
  readonly email: string;
  readonly nodes: readonly TreeNode[];
}

/** A vault of one or more accounts; no secret is stored anywhere. */
function vaultOf(...accounts: readonly Account[]): McpVaultSource {
  const nodesOf = (accountId: string): readonly TreeNode[] => accounts.find((a) => a.accountId === accountId)?.nodes ?? [];
  const none = (): Thenable<ReturnType<typeof stored>> => Promise.resolve(stored(undefined));
  return {
    getAccounts: () => accounts.map(({ accountId, email }) => ({ accountId, email })),
    getNodes: nodesOf,
    getNode: (accountId, id) => nodesOf(accountId).find((n) => n.id === id),
    getPassword: none,
    getPrivateKey: none,
    getNotes: none,
    getTotp: none,
    getDbConnection: none,
  };
}

const EMAIL = 'me@x.test';

/** A vault of one account `a1`. */
const vault = (nodes: readonly TreeNode[]): McpVaultSource => vaultOf({ accountId: 'a1', email: EMAIL, nodes });

/** The rows of the list, by id. */
async function rowsOf(source: McpVaultSource): Promise<Map<string, McpEntry>> {
  return new Map((await visibleMcpEntries(source)).map((row) => [row.id, row]));
}

async function rowOf(source: McpVaultSource, id: string): Promise<McpEntry> {
  const row = (await rowsOf(source)).get(id);
  assert.notEqual(row, undefined, `the list has no row ${id}`);
  return row as McpEntry;
}

/** No text of a hidden node is anywhere in the body of the list. */
async function assertBodyHolds(source: McpVaultSource, hidden: readonly string[]): Promise<void> {
  const body = JSON.stringify(await visibleMcpEntries(source));
  assert.deepEqual(hidden.filter((text) => body.includes(text)), [], 'the body of the list holds the name or the id of a hidden node');
}

// ---------- S1 · N1, `dependsOn` ----------

/** The entry that the agent may view, which depends on the ids in `needs`. */
const needy = (needs: readonly string[], extra: readonly TreeNode[]): McpVaultSource =>
  vault([entry('e1', 'needy', { mcp: { view: true }, dependsOn: [...needs] }), ...extra]);

test('D1: a dependency that has no switch is listed without its name', async () => {
  const source = needy(['d1'], [entry('d1', 'DEP-no-switch-name')]);
  assert.deepEqual((await rowOf(source, 'e1')).dependsOn, [HIDDEN_DEPENDENCY]);
  await assertBodyHolds(source, ['DEP-no-switch-name', 'd1']);
});

test('D2: a dependency that has a PIN of its own, or is in the Trash, with every switch on, is listed without its name', async () => {
  const pin = needy(['d1'], [entry('d1', 'DEP-pin-name', { mcp: ALL, pinProtected: true })]);
  assert.deepEqual((await rowOf(pin, 'e1')).dependsOn, [HIDDEN_DEPENDENCY], 'a PIN of its own');
  await assertBodyHolds(pin, ['DEP-pin-name', 'd1']);
  const trashed = needy(['d1'], [folder('t1', 'Trash', { isTrash: true, mcp: ALL }), entry('d1', 'DEP-trash-name', { mcp: ALL }, 't1')]);
  assert.deepEqual((await rowOf(trashed, 'e1')).dependsOn, [HIDDEN_DEPENDENCY], 'in the Trash');
  await assertBodyHolds(trashed, ['DEP-trash-name', 'd1']);
});

test('D3: a folder id is not a dependency that the agent may view, also when the folder is open', async () => {
  const closed = needy(['f1'], [folder('f1', 'DEP-folder-name')]);
  assert.deepEqual((await rowOf(closed, 'e1')).dependsOn, [HIDDEN_DEPENDENCY], 'a folder with no switch');
  await assertBodyHolds(closed, ['DEP-folder-name', 'f1']);
  const open = needy(['f1'], [folder('f1', 'DEP-open-folder-name', { mcp: { view: true } })]);
  assert.deepEqual((await rowOf(open, 'e1')).dependsOn, [HIDDEN_DEPENDENCY], 'an open folder');
  await assertBodyHolds(open, ['DEP-open-folder-name', 'f1']);
});

test('D4: one dependency that the agent may view, then three that it may not: its name, then ONE placeholder, at the end', async () => {
  const source = needy(
    ['h1', 'v1', 'h2', 'h3'],
    [
      entry('h1', 'DEP-hidden-1'),
      entry('v1', 'DEP-visible', { mcp: { view: true } }),
      entry('h2', 'DEP-hidden-2', { mcp: ALL, pinProtected: true }),
      folder('t1', 'Trash', { isTrash: true, mcp: ALL }),
      entry('h3', 'DEP-hidden-3', { mcp: ALL }, 't1'),
    ],
  );
  assert.deepEqual((await rowOf(source, 'e1')).dependsOn, ['DEP-visible', HIDDEN_DEPENDENCY]);
  await assertBodyHolds(source, ['DEP-hidden-1', 'DEP-hidden-2', 'DEP-hidden-3', 'h1', 'h2', 'h3']);
});

test('D5: an id that no node has is listed as the placeholder too, and not dropped', async () => {
  const source = needy(['nothing-has-this-id'], []);
  assert.deepEqual((await rowOf(source, 'e1')).dependsOn, [HIDDEN_DEPENDENCY]);
  await assertBodyHolds(source, ['nothing-has-this-id']);
});

test('E1: a hidden dependency and an id that no node has give the same body of the list', async () => {
  const hidden = needy(['d1'], [entry('d1', 'DEP-no-switch-name')]);
  const missing = needy(['d1'], []);
  assert.deepEqual(await visibleMcpEntries(hidden), await visibleMcpEntries(missing));
});

test('DG1: dependencies that the agent may view are named in the stored order; none gives an empty list', async () => {
  const two = needy(['b', 'a'], [entry('a', 'DEP-a', { mcp: { view: true } }), entry('b', 'DEP-b', { mcp: { view: true } })]);
  assert.deepEqual((await rowOf(two, 'e1')).dependsOn, ['DEP-b', 'DEP-a']);
  assert.deepEqual((await rowOf(needy([], []), 'e1')).dependsOn, []);
});

test('DG2: the wall is asked in the entry\'s own account: an id that a second account holds as an entry the agent may view is not named, and the row is exactly the placeholder', async () => {
  const own: Account = { accountId: 'a1', email: EMAIL, nodes: [entry('e1', 'needy', { mcp: { view: true }, dependsOn: ['shared-id'] })] };
  const other: Account = { accountId: 'a2', email: 'you@x.test', nodes: [entry('shared-id', 'DEP-in-other-account', { mcp: { view: true } })] };
  const source = vaultOf(own, other);
  const row = await rowOf(source, 'e1');
  assert.deepEqual(row.dependsOn, [HIDDEN_DEPENDENCY], 'the id is not in the entry\'s own account, so it reads as a dependency that is not open, and the name of the other account\'s entry is not there');
});

// ---------- S1 · the Remote Bridge never serves the placeholder (X1) ----------

/** What a bridge serves as its listing, through the wall's own view (`doorView`), over the rows that `visibleMcpEntries` gives for `source`. */
async function servedByBridge(source: McpVaultSource, scope: readonly string[]): Promise<{ entries: readonly Record<string, unknown>[]; folders: readonly unknown[] }> {
  const modules = loadBridgeModules();
  const ww = await wallWorld({ scope: [...scope] });
  try {
    const rows = await visibleMcpEntries(source);
    const view = modules.scope.doorView(CONTEXT_1, { ...ww.wall, listEntriesOf: () => Promise.resolve(rows) });
    const real: ReadRouteSources = { aliases: () => [], mcpEntries: () => Promise.resolve([]), visibleConfig: () => undefined, folders: () => [] };
    const sources = view.sources(real, undefined);
    return { entries: (await sources.mcpEntries?.()) as unknown as readonly Record<string, unknown>[], folders: (await sources.folders?.()) ?? [] };
  } finally {
    ww.dispose();
  }
}

/** A row in scope that depends on `needs`, and an entry in scope that is NAMED exactly as the placeholder. */
const bridgeWorld = (needs: readonly string[], extra: readonly TreeNode[] = []): McpVaultSource =>
  vault([
    entry('b-row', 'the row', { mcp: { view: true }, dependsOn: [...needs] }),
    entry('b-named', HIDDEN_DEPENDENCY, { mcp: { view: true } }),
    ...extra,
  ]);

const dependsOnOf = (served: { entries: readonly Record<string, unknown>[] }, id: string): unknown => served.entries.find((row) => row.id === id)?.dependsOn;

/** The row of a world, said as a sentence, when a bridge serves a dependency for it: the scoped list has none. */
function wrongWorld(world: string, served: { entries: readonly Record<string, unknown>[] }): string[] {
  const names = dependsOnOf(served, 'b-row') as string[];
  return names.length === 0 ? [] : [`${world}: ${JSON.stringify(names)}`];
}

test('BG3: a Remote Bridge never serves the placeholder, also when an entry in scope is named exactly as the placeholder', async () => {
  const scope = ['b-row', 'b-named'];
  const control = await servedByBridge(bridgeWorld([]), scope);
  assert.deepEqual(dependsOnOf(control, 'b-row'), [], 'control: a row with no dependency');
  const hidden = await servedByBridge(bridgeWorld(['b-hidden'], [entry('b-hidden', 'DEP-no-switch-name')]), scope);
  const missing = await servedByBridge(bridgeWorld(['b-nothing']), scope);
  const itself = await servedByBridge(bridgeWorld(['b-named']), scope);
  const wrong = [
    ...wrongWorld('(a) a dependency with no switch', hidden),
    ...wrongWorld('(b) an id that no node has', missing),
    ...wrongWorld('(c) the entry named as the placeholder', itself),
  ];
  assert.deepEqual(wrong, [], 'a bridge serves a dependency that its scoped list leaves out');
  assert.deepEqual(hidden, control, '(a) serves the body of a row with no dependency');
  assert.deepEqual(missing, control, '(b) serves the body of a row with no dependency');
  for (const served of [control, hidden, missing, itself]) {
    const values = served.entries.flatMap((row) => row.dependsOn as string[]);
    assert.equal(values.includes(HIDDEN_DEPENDENCY), false, 'no served body holds the placeholder as a value of dependsOn');
  }
});

test('BG1: on a Remote Bridge a row that depends on a hidden entry and on a missing id, has switches of its own in a closed folder, and holds a reference to a hidden entry is served as before', async () => {
  const source = vault([
    folder('f-closed', 'FOLDER-closed-name'),
    entry('b-hidden', 'DEP-no-switch-name'),
    entry('b-row', 'the row', { mcp: { view: true }, dependsOn: ['b-hidden', 'b-nothing'], kind: 'terminal', isSshEnabled: false, command: `run creds://${EMAIL}/DEP-no-switch-name/password` }, 'f-closed'),
  ]);
  const served = await servedByBridge(source, ['b-row']);
  const row = served.entries.find((r) => r.id === 'b-row');
  assert.deepEqual(row?.dependsOn, []);
  assert.equal(row?.folder, '');
  assert.equal(row?.hasCommand, true);
  assert.deepEqual(served.folders, []);
  const text = JSON.stringify(served);
  assert.deepEqual([HIDDEN_DEPENDENCY, HIDDEN_REFERENCE, 'creds://', 'DEP-no-switch-name', 'FOLDER-closed-name'].filter((word) => text.includes(word)), []);
});

// ---------- S2 · N4, `folder` ----------

/** A folder that the agent may view: `view` on. */
const OPEN = { view: true } as const;

/** An entry with switches of its own, in the folder `parent`. */
const placed = (parent: string | null, extra: readonly TreeNode[]): McpVaultSource =>
  vault([...extra, entry('e1', 'in a folder', { mcp: { view: true } }, parent)]);

test('F1: an entry with switches of its own, in a folder with no switch, has no folder name', async () => {
  const source = placed('f1', [folder('f1', 'FOLDER-no-switch-name')]);
  assert.equal((await rowOf(source, 'e1')).folder, '');
  await assertBodyHolds(source, ['FOLDER-no-switch-name']);
});

test('F2: an entry with switches of its own, in a folder that a person closed (mcp: {}) under an open folder, has no folder name', async () => {
  const source = placed('f2', [folder('f1', 'FOLDER-open-name', { mcp: OPEN }), folder('f2', 'FOLDER-closed-name', { parentId: 'f1', mcp: {} })]);
  assert.equal((await rowOf(source, 'e1')).folder, '');
  await assertBodyHolds(source, ['FOLDER-closed-name']);
});

test('E2: a folder with no switch and a parent id that points to no node give the same body of the list', async () => {
  const hidden = placed('f1', [folder('f1', 'FOLDER-no-switch-name')]);
  const missing = placed('f1', []);
  assert.deepEqual(await visibleMcpEntries(hidden), await visibleMcpEntries(missing));
});

test('FG1: an entry with switches of its own, in a folder that takes view from the folder above it, has the folder\'s name', async () => {
  const source = placed('f2', [folder('f1', 'FOLDER-above', { mcp: OPEN }), folder('f2', 'FOLDER-inherits', { parentId: 'f1' })]);
  assert.equal((await rowOf(source, 'e1')).folder, 'FOLDER-inherits');
});

test('FG2: an entry with no switch of its own, under a silent folder, under an open folder, has the name of the open folder, the one that answered', async () => {
  const source = vault([
    folder('f1', 'FOLDER-open', { mcp: OPEN }),
    folder('f2', 'FOLDER-silent', { parentId: 'f1' }),
    entry('e1', 'inherits', {}, 'f2'),
  ]);
  assert.equal((await rowOf(source, 'e1')).folder, 'FOLDER-open');
});

test('FG3: an entry at the root has no folder', async () => {
  assert.equal((await rowOf(placed(null, []), 'e1')).folder, '');
});

// ---------- S3 · N5, `command` ----------

/** The terminal entry that holds `command`, in a world: it has switches of its own, so it is listed. */
const terminal = (id: string, command: string): TreeNode => entry(id, `terminal ${id}`, { mcp: OPEN, kind: 'terminal', isSshEnabled: false, command });

/** Hidden: no switch (`H`), a PIN of its own, the Trash, and a folder with no switch (`HF`). Viewable: `V` in an open folder, `V2` with switches of its own in `HF`. */
const HID = { entry: 'Hid-entry', pin: 'Hid-pin', trashed: 'Hid-trashed', folder: 'Hid-folder' } as const;
const VIS = { entry: 'Vis-entry', two: 'Vis-two', folder: 'Open-folder' } as const;

const hiddenEntry = entry('h', HID.entry);
const hiddenFolder = folder('hf', HID.folder);

/** The nodes that every row of S3 has, but `hiddenEntry` and `hiddenFolder`, which the pair rows take out. */
const COMMON: readonly TreeNode[] = [
  folder('of', VIS.folder, { mcp: OPEN }),
  entry('v', VIS.entry, {}, 'of'),
  entry('p', HID.pin, { mcp: ALL, pinProtected: true }),
  folder('tr', 'Trash', { isTrash: true, mcp: ALL }),
  entry('tr1', HID.trashed, { mcp: ALL }, 'tr'),
];

const SECOND = entry('v2', VIS.two, { mcp: OPEN }, 'hf');

const HIDDEN_WORDS = [HID.entry, HID.pin, HID.trashed, HID.folder];

/** The command of the terminal entry `t1` in the list, for a world and a stored command. */
async function listedCommand(command: string, nodes: readonly TreeNode[] = [hiddenEntry, hiddenFolder, SECOND]): Promise<string | undefined> {
  return (await rowOf(vault([...COMMON, ...nodes, terminal('t1', command)]), 't1')).command;
}

const ref = (path: string, field = 'password', account = EMAIL): string => `creds://${account}/${path}/${field}`;

test('R1: a reference to an entry that has no switch is replaced, and the text around it stays', async () => {
  assert.equal(await listedCommand(`run ${ref(HID.entry)} now`), `run ${HIDDEN_REFERENCE} now`);
});

test('R2: a reference to an entry with a PIN of its own, or to an entry in the Trash, is replaced', async () => {
  assert.equal(await listedCommand(`a ${ref(HID.pin)} b`), `a ${HIDDEN_REFERENCE} b`);
  assert.equal(await listedCommand(`a ${ref(HID.trashed)} b`), `a ${HIDDEN_REFERENCE} b`);
});

test('R3: a reference that names a folder that is not open is replaced, also when the entry is one that the agent may view', async () => {
  assert.equal(await listedCommand(`go ${ref(`${HID.folder}/${VIS.two}`)}`), `go ${HIDDEN_REFERENCE}`);
});

test('R4: a reference to an account that is not there, or to a name that no entry has, is replaced', async () => {
  assert.equal(await listedCommand(ref(VIS.entry, 'password', 'nobody@x.test')), HIDDEN_REFERENCE);
  assert.equal(await listedCommand(ref('No-such-entry')), HIDDEN_REFERENCE);
  const first: Account = { accountId: 'a1', email: EMAIL, nodes: [terminal('t1', ref('Other-entry', 'password', 'you@x.test'))] };
  const second: Account = { accountId: 'a2', email: 'you@x.test', nodes: [entry('o1', 'Other-entry')] };
  assert.equal((await rowOf(vaultOf(first, second), 't1')).command, HIDDEN_REFERENCE, 'an entry of a second account that has no switch there');
});

test('R5: a name that two entries that the agent may view have is replaced; a hidden twin does not count (change 1.1: the list locates among the entries the agent may view)', async () => {
  const mixed = [entry('d1', 'Dup-mixed', { mcp: OPEN }), entry('d2', 'Dup-mixed')];
  assert.equal(await listedCommand(ref('Dup-mixed'), mixed), ref('Dup-mixed'), 'one that the agent may view and one hidden: the token names the viewable one, and is kept');
  const both = [entry('d3', 'Dup-both', { mcp: OPEN }), entry('d4', 'Dup-both', { mcp: OPEN })];
  assert.equal(await listedCommand(ref('Dup-both'), both), HIDDEN_REFERENCE, 'two that the agent may view');
});

test('R6: a token that the parser does not read is replaced, also when it starts with a name that the agent may view', async () => {
  for (const token of [`creds://${EMAIL}/${VIS.entry}`, ref(VIS.entry, 'salary'), ref(VIS.entry, 'Password'), `${ref(VIS.entry)}.`]) {
    assert.equal(await listedCommand(token), HIDDEN_REFERENCE, token);
  }
});

test('R7: the scheme in any letter case is a reference for the list, and the decision is the one of R1', async () => {
  assert.equal(await listedCommand(`CREDS://${EMAIL}/${HID.entry}/password`), HIDDEN_REFERENCE);
  assert.equal(await listedCommand(`Creds://ME@X.TEST/${HID.entry.toLowerCase()}/password`), HIDDEN_REFERENCE);
});

/** The two whole bodies of the list for a pair of worlds, and the text of the hidden words in them. */
async function pair(command: string, without: readonly TreeNode[], withIt: readonly TreeNode[]): Promise<{ equal: boolean; leaked: string[]; commands: [string | undefined, string | undefined] }> {
  const [a, b] = [vault([...COMMON, ...withIt, terminal('t1', command)]), vault([...COMMON, ...without, terminal('t1', command)])];
  const [bodyA, bodyB] = [await visibleMcpEntries(a), await visibleMcpEntries(b)];
  const text = JSON.stringify([bodyA, bodyB]);
  assert.deepEqual(bodyA, bodyB, 'the two bodies are deep-equal');
  return { equal: true, leaked: HIDDEN_WORDS.filter((word) => text.includes(word)), commands: [bodyA.find((r) => r.id === 't1')?.command, bodyB.find((r) => r.id === 't1')?.command] };
}

test('E3: a hidden entry and a missing one, a hidden folder and a missing one, a hidden twin and no twin, give the same body; a reference that names no hidden folder is kept in both', async () => {
  const one = await pair(`run ${ref(HID.entry)}`, [hiddenFolder, SECOND], [hiddenEntry, hiddenFolder, SECOND]);
  assert.deepEqual(one.leaked, [], 'pair (1): the name of the hidden entry is in neither body');
  assert.deepEqual(one.commands, [`run ${HIDDEN_REFERENCE}`, `run ${HIDDEN_REFERENCE}`]);
  const two = await pair(ref(`${HID.folder}/${VIS.two}`), [{ ...SECOND, parentId: 'hf' }], [hiddenFolder, SECOND]);
  assert.deepEqual(two.leaked, [], 'pair (2): the name of the hidden folder is in neither body');
  assert.deepEqual(two.commands, [HIDDEN_REFERENCE, HIDDEN_REFERENCE]);
  const three = await pair(ref(VIS.two), [{ ...SECOND, parentId: 'hf' }], [hiddenFolder, SECOND]);
  assert.deepEqual(three.leaked, [], 'pair (3): the name of the hidden folder is in neither body');
  assert.deepEqual(three.commands, [ref(VIS.two), ref(VIS.two)], 'pair (3): the shorter reference is kept in both');
  const twin = entry('tw1', 'Vis-twin', { mcp: OPEN });
  const four = await pair(ref('Vis-twin'), [twin], [twin, entry('tw2', 'Vis-twin')]);
  assert.deepEqual(four.commands, [ref('Vis-twin'), ref('Vis-twin')], 'pair (4): a hidden twin and no twin give the same body, and the reference to the viewable one is kept in both');
});

test('RG1: a reference to an entry that the agent may view, with no folder part or with an open folder, is kept byte for byte', async () => {
  for (const command of [`x ${ref(VIS.entry)} y`, `x ${ref(`${VIS.folder}/${VIS.entry}`)} y`]) {
    assert.equal(await listedCommand(command), command);
  }
});

test('RG2: a reference to an entry of a SECOND account that the agent may view there is kept: the wall is asked in the account that the reference names', async () => {
  const first: Account = { accountId: 'a1', email: EMAIL, nodes: [...COMMON, hiddenEntry, terminal('t1', ref('Other-entry', 'password', 'you@x.test'))] };
  const second: Account = { accountId: 'a2', email: 'you@x.test', nodes: [entry('o1', 'Other-entry', { mcp: OPEN })] };
  assert.equal((await rowOf(vaultOf(first, second), 't1')).command, ref('Other-entry', 'password', 'you@x.test'));
});

test('RG3: a command with no token is the text; a blank command has no command', async () => {
  assert.equal(await listedCommand('tmux {name}'), 'tmux {name}');
  assert.equal(await listedCommand('   '), undefined);
});

test('RG4: the replaced text is not a token: the answer of R1, given to the same function a second time, is the same text', async () => {
  const once = (await listedCommand(`run ${ref(HID.entry)} now`)) as string;
  assert.equal(await listedCommand(once), once);
});

test('RG5: the shorter reference, which leaves a hidden folder out and names one entry, is kept byte for byte', async () => {
  assert.equal(await listedCommand(ref(VIS.two)), ref(VIS.two));
});

test('RG6: a clean match in another letter case is kept in the letter case that the person typed', async () => {
  const spaced = entry('sp', 'Vis spaced', { mcp: OPEN });
  const kept = [`creds://ME@X.TEST/${VIS.entry.toLowerCase()}/totp`, `CREDS://${EMAIL}/${VIS.entry}/password`, `creds://${EMAIL}/VIS%20SPACED/password`];
  for (const command of kept) {
    assert.equal(await listedCommand(command, [hiddenEntry, spaced]), command);
  }
});

// ---------- S4 · N6, `parent` ----------

/** The folders that `creds_folders` lists for a vault of one account. */
function foldersOf(nodes: readonly TreeNode[]): FolderView[] {
  const source = vault(nodes);
  return visibleFolders(source.getAccounts(), (accountId) => source.getNodes(accountId), (accountId, id) => source.getNode(accountId, id));
}

/** The folder `c1`, with switches of its own, under the parent `parentId`; `extra` holds the nodes that the parent is. */
const childOf = (parentId: string | null, extra: readonly TreeNode[]): readonly TreeNode[] => [...extra, folder('c1', 'child', { parentId, mcp: OPEN })];

const parentOfChild = (nodes: readonly TreeNode[]): string | null | undefined => foldersOf(nodes).find((f) => f.id === 'c1')?.parent;

test('P1: a folder with switches of its own, under a folder with no switch, has no parent', () => {
  const nodes = childOf('p1', [folder('p1', 'PARENT-no-switch-name')]);
  assert.equal(parentOfChild(nodes), null);
  assert.deepEqual(['p1', 'PARENT-no-switch-name'].filter((text) => JSON.stringify(foldersOf(nodes)).includes(text)), []);
});

test('P2: a folder with switches of its own, under a folder that a person closed (mcp: {}) under an open folder, has no parent', () => {
  const nodes = childOf('p2', [folder('p1', 'PARENT-open', { mcp: OPEN }), folder('p2', 'PARENT-closed-name', { parentId: 'p1', mcp: {} })]);
  assert.equal(parentOfChild(nodes), null);
  assert.deepEqual(['p2', 'PARENT-closed-name'].filter((text) => JSON.stringify(foldersOf(nodes)).includes(text)), []);
});

test('P3: a folder whose parent id points to no node has no parent', () => {
  const nodes = childOf('nothing-has-this-id', []);
  assert.equal(parentOfChild(nodes), null);
  assert.equal(JSON.stringify(foldersOf(nodes)).includes('nothing-has-this-id'), false);
});

test('E4: a parent with no switch and a parent id that points to no node give the same body of the list of folders', () => {
  const hidden = foldersOf(childOf('p1', [folder('p1', 'PARENT-no-switch-name')]));
  assert.deepEqual(hidden, foldersOf(childOf('p1', [])));
  assert.deepEqual(['p1', 'PARENT-no-switch-name'].filter((text) => JSON.stringify(hidden).includes(text)), [], 'the body holds no name and no id of the hidden parent');
});

test('PG1: a folder that the agent may view, under a parent that it may view, has the parent\'s id', () => {
  assert.equal(parentOfChild(childOf('p1', [folder('p1', 'PARENT-open', { mcp: OPEN })])), 'p1', 'a parent with its own switch');
  const inherits = [folder('p0', 'PARENT-top', { mcp: OPEN }), folder('p1', 'PARENT-inherits', { parentId: 'p0' }), folder('c1', 'child', { parentId: 'p1' })];
  assert.equal(parentOfChild(inherits), 'p1', 'a child that takes view from above, under a parent that takes view from above');
});

test('PG2: a folder at the root has no parent', () => {
  assert.equal(parentOfChild(childOf(null, [])), null);
});

// ---------- S4 · G1, nothing else changes ----------

/** A vault in which the agent may view each node, and each of the four fields holds something: a dependency, a folder, a reference, a parent. */
const EVERYTHING_VIEWABLE: readonly TreeNode[] = [
  folder('g-top', 'Servers', { mcp: OPEN }),
  folder('g-eu', 'EU', { parentId: 'g-top' }),
  entry('g-vpn', 'office vpn', { kind: 'vpn', isSshEnabled: false, vpnType: 'openvpn' }, 'g-top'),
  entry('g-gw', 'gateway', { mcp: OPEN, dependsOn: ['g-vpn'] }, 'g-eu'),
  entry('g-term', 'ops', { kind: 'terminal', isSshEnabled: false, command: `run creds://${EMAIL}/EU/gateway/password now` }, 'g-top'),
  entry('g-root', 'at the root', { mcp: OPEN }),
];

/** The two list bodies of that vault on the code before this change (`37b82b48`), taken from a run of it: the literal is not computed by the code under test. */
const BEFORE = {
  entries: [
    {
      id: 'g-vpn',
      name: 'office vpn',
      kind: 'vpn',
      folder: 'Servers',
      host: 'h.example.test',
      vpnType: 'openvpn',
      hasPassword: false,
      hasPrivateKey: false,
      hasNotes: false,
      hasTotp: false,
      dependsOn: [],
      can: {
        use: false,
        edit: false,
        create: false,
        delete: false
      }
    },
    {
      id: 'g-gw',
      name: 'gateway',
      kind: 'ssh',
      folder: 'EU',
      host: 'h.example.test',
      hasPassword: false,
      hasPrivateKey: false,
      hasNotes: false,
      hasTotp: false,
      dependsOn: [
        'office vpn'
      ],
      can: {
        use: false,
        edit: false,
        create: false,
        delete: false
      }
    },
    {
      id: 'g-term',
      name: 'ops',
      kind: 'terminal',
      folder: 'Servers',
      host: 'h.example.test',
      command: 'run creds://me@x.test/EU/gateway/password now',
      hasPassword: false,
      hasPrivateKey: false,
      hasNotes: false,
      hasTotp: false,
      dependsOn: [],
      can: {
        use: false,
        edit: false,
        create: false,
        delete: false
      }
    },
    {
      id: 'g-root',
      name: 'at the root',
      kind: 'ssh',
      folder: '',
      host: 'h.example.test',
      hasPassword: false,
      hasPrivateKey: false,
      hasNotes: false,
      hasTotp: false,
      dependsOn: [],
      can: {
        use: false,
        edit: false,
        create: false,
        delete: false
      }
    }
  ],
  folders: [
    {
      id: 'g-top',
      name: 'Servers',
      parent: null,
      holds: 'any',
      can: {
        create: false,
        edit: false,
        delete: false
      }
    },
    {
      id: 'g-eu',
      name: 'EU',
      parent: 'g-top',
      holds: 'any',
      can: {
        create: false,
        edit: false,
        delete: false
      }
    }
  ]
};

test('G1: with each node viewable, the two list bodies are those of the code before this change: no other field changes', async () => {
  const source = vault(EVERYTHING_VIEWABLE);
  const folders = visibleFolders(source.getAccounts(), (accountId) => source.getNodes(accountId), (accountId, id) => source.getNode(accountId, id));
  assert.deepEqual(JSON.parse(JSON.stringify({ entries: await visibleMcpEntries(source), folders })), BEFORE);
});

// ---------- S5 · the words ----------

interface GeneratedTool {
  readonly name: string;
  readonly description: string;
}

/** The tool descriptions of `contract/mcp-tools-v1.json`, which `npm run contract:mcp` writes from the built `creds-mcp`: the join of the constants and the binary's own words. */
function generatedDescriptions(): Map<string, string> {
  const file = path.resolve(__dirname, '..', '..', '..', 'contract', 'mcp-tools-v1.json');
  const tools = (JSON.parse(fs.readFileSync(file, 'utf8')) as { tools: GeneratedTool[] }).tools;
  return new Map(tools.map((tool) => [tool.name, tool.description]));
}

test('T1: the descriptions of creds_vpn_up, creds_run and creds_list hold the words of the two placeholders', () => {
  const described = generatedDescriptions();
  const holds = (tool: string, words: string): boolean => (described.get(tool) ?? '').includes(words);
  assert.deepEqual(
    [
      ['creds_vpn_up', HIDDEN_DEPENDENCY],
      ['creds_run', HIDDEN_REFERENCE],
      ['creds_list', HIDDEN_REFERENCE],
      ['creds_list', HIDDEN_DEPENDENCY],
    ].filter(([tool, words]) => !holds(tool, words)),
    [],
    'a description does not hold the words of a placeholder',
  );
});

test('T1b: the descriptions of creds_list and creds_run say that the reference placeholder also stands for a reference that is missing, broken or ambiguous', () => {
  const described = generatedDescriptions();
  const lacking = ['creds_list', 'creds_run'].filter((tool) => !(described.get(tool) ?? '').includes('or that is missing, broken or ambiguous'));
  assert.deepEqual(lacking, [], 'a description says that the placeholder stands only for a reference that is not open');
});

test('T4: the description of creds_list says which folder `folder` names: the one that gave the switches, which can be a folder above the entry\'s own', () => {
  const text = generatedDescriptions().get('creds_list') ?? '';
  assert.equal(text.includes('it is the folder that gave them'), true);
  assert.equal(text.includes("which can be a folder above the entry's own folder"), true);
});

/** Appendix A of the plan: the sentence added to the `creds_list` bullet, and the one added to the `creds_folders` bullet, of `usage` of `agent-surface`. */
const HELP_SENTENCES: Readonly<Record<HelpLanguage, readonly [string, string]>> = {
  en: [
    'A folder, a dependency and a `creds://` reference in a command are named only when they are open to agents too. Otherwise the folder is empty, and the dependency and the reference are shown as fixed words that name nothing.',
    'The parent is given only when it is open to agents too.',
  ],
  de: [
    'Ein Ordner, eine Abhängigkeit und ein `creds://`-Verweis in einem Befehl werden nur genannt, wenn sie ebenfalls für Agenten geöffnet sind. Sonst ist der Ordner leer, und die Abhängigkeit und der Verweis erscheinen als feste Worte, die nichts benennen.',
    'Das Elternteil wird nur angegeben, wenn es ebenfalls für Agenten geöffnet ist.',
  ],
  es: [
    'Una carpeta, una dependencia y una referencia `creds://` en un comando sólo se nombran cuando también están abiertas a los agentes. Si no, la carpeta queda vacía, y la dependencia y la referencia se muestran como palabras fijas que no nombran nada.',
    'El padre sólo se indica cuando también está abierto a los agentes.',
  ],
  ru: [
    'Папка, зависимость и ссылка `creds://` в команде называются, только если они тоже открыты агентам. Иначе папка пустая, а зависимость и ссылка показаны фиксированными словами, которые ничего не называют.',
    'Родитель указан, только если он тоже открыт агентам.',
  ],
  uk: [
    'Папка, залежність і посилання `creds://` у команді називаються, лише якщо вони теж відкриті агентам. Інакше папка порожня, а залежність і посилання показані сталими словами, які нічого не називають.',
    'Батько вказаний, лише якщо він теж відкритий агентам.',
  ],
};

/** The bullet of one tool in the text: from \`- <tool> —\` to the end of its line. */
function bulletOf(usage: string, tool: string): string {
  const line = usage.split('\n').find((candidate) => candidate.startsWith(`- ${tool} —`));
  assert.notEqual(line, undefined, `the usage has no bullet of ${tool}`);
  return line as string;
}

test('T3: in each language the usage of the agent-surface article holds the two sentences, and is not the English fallback', () => {
  const article = helpArticle('agent-surface') as NonNullable<ReturnType<typeof helpArticle>>;
  assert.deepEqual([...HELP_LANGUAGES].sort(), Object.keys(HELP_SENTENCES).sort(), 'the table has a row for each language');
  for (const language of HELP_LANGUAGES) {
    const { body, fallback } = bodyFor(article, language);
    const [list, folders] = HELP_SENTENCES[language];
    assert.equal(fallback, false, language);
    assert.equal(bulletOf(body.usage, 'creds_list').endsWith(list), true, `${language}: the bullet of creds_list ends with its sentence`);
    assert.equal(bulletOf(body.usage, 'creds_folders').endsWith(folders), true, `${language}: the bullet of creds_folders ends with its sentence`);
  }
});

// ---------- S3 · change 1.1, the index of the listing ----------

test('RG7: the indexed locator of a listing finds what a locator over the viewable entries finds, token by token', () => {
  const nodes = [
    ...COMMON, hiddenEntry, hiddenFolder, SECOND,
    entry('d1', 'Dup-mixed', { mcp: OPEN }), entry('d2', 'Dup-mixed'),
    entry('d3', 'Dup-both', { mcp: OPEN }), entry('d4', 'Dup-both', { mcp: OPEN }),
    entry('sp', 'Vis spaced', { mcp: OPEN }), entry('lc', 'MiXeD-case', { mcp: OPEN }),
  ];
  const source = vault(nodes);
  const plain = vaultRefLocator(source);
  const viewable = (accountId: string, id: string): boolean => agentMayView(source, accountId, id);
  const indexed = viewableLocatorForOneListing(plain, viewable);
  const tokens = [
    ref(VIS.entry), ref(`${VIS.folder}/${VIS.entry}`), ref(VIS.two), ref(HID.entry), ref(HID.pin), ref('Dup-mixed'), ref('Dup-both'), ref('VIS%20SPACED'),
    ref('mixed-CASE'), ref('No-such-entry'), ref(VIS.entry, 'password', 'nobody@x.test'), `CREDS://ME@X.TEST/${VIS.entry.toUpperCase()}/totp`,
  ];
  for (const token of tokens) {
    const parsed = parseSecretRef(token);
    const lastName = parsed?.entityPath[parsed.entityPath.length - 1] ?? '';
    const whole = locateRef(token, { accounts: plain.accounts, entities: (accountId) => plain.entities(accountId).filter((e) => viewable(accountId, e.id)) });
    const given = locateRef(token, { accounts: () => indexed.accounts(), entities: (accountId) => indexed.candidates(accountId, lastName) });
    assert.deepEqual(given, whole, token);
  }
});
