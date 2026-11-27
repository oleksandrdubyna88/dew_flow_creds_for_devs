import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { HIDDEN_DEPENDENCY, HIDDEN_REFERENCE } from '../agentNaming';
import type { ReadRouteSources } from '../brokerReadRoutes';
import type { McpAccess } from '../mcpAccess';
import { McpEntry, McpVaultSource, visibleMcpEntries } from '../mcpEntries';
import { stored } from '../storedSecret';
import type { EntityMetadata, TreeNode } from '../types';
import { CONTEXT_1, wallWorld } from './bridgeWallWorld';
import { loadBridgeModules } from './bridgeModules';

/**
 * The list answers name no node that the agent may not view (`todo/PLAN_agent_list_fields_hidden_n1_n4_n6.md`, §6).
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

test('DG2: the wall is asked in the entry\'s own account: an id that a second account holds as an entry the agent may view is not named', async () => {
  const own: Account = { accountId: 'a1', email: EMAIL, nodes: [entry('e1', 'needy', { mcp: { view: true }, dependsOn: ['shared-id'] })] };
  const other: Account = { accountId: 'a2', email: 'you@x.test', nodes: [entry('shared-id', 'DEP-in-other-account', { mcp: { view: true } })] };
  const source = vaultOf(own, other);
  const row = await rowOf(source, 'e1');
  assert.equal(row.dependsOn.includes('DEP-in-other-account'), false);
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
