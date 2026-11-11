import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { after, before, test } from 'node:test';
import { BRIDGE_ROUTES } from '../bridgeAllowList';
import { visibleConfigDetails, visibleMcpEntries } from '../mcpEntries';
import { loadEachWithVscode } from './vscodeStub';
import { contractRoutes, strayRoutes, unnamedRoutes } from './contractRoutes';
import { World, share, world } from './brokerWorld';
import { normalised, send, viaBridge, wallWorld } from './bridgeWallWorld';
import { HIDDEN, HIDDEN_IDS, HIDDEN_NAMES, N5_COMMAND, SOURCE, STORAGE, VISIBLE, madeUp, markerOf, proveFixture } from './unlistedWorld';

/**
 * Part A of the class test of `todo/PLAN_agent_refusal_names_unlisted_entry.md` (section 5.1): the ADDRESSED node, at the door.
 *
 * <p>The rule: when the agent may not view the node whose id a request carries, the answer is the answer of an id that does
 * not exist. The real broker runs over `unlistedWorld.ts`, a vault with one node for each reason an agent may not view a node.
 * One row for each route of `contract/broker-v1.json` that reads an id; each hidden id is sent, then an id of the same length
 * that is not in the vault, and the two answers are compared item by item (the plan's section 2.4). A row collects every
 * pair that differs and fails once, with the list, so a first run prints the leaks. The routes are DERIVED from the contract,
 * and a route with no row fails the test, so the file cannot become empty.</p>
 */

interface Contract {
  readonly mcpUsePrefix: string;
  readonly mcpActions: readonly string[];
  readonly mcpDeleteRoute: string;
  readonly mcpCreateRoute: string;
  readonly mcpFolderPrefix: string;
  readonly routes: Readonly<Record<string, string>>;
  readonly aliasPrefix: string;
  readonly reads: Readonly<Record<string, { readonly path: string }>>;
  readonly health: { readonly path: string };
  readonly configRead: { readonly path: string };
}

const CONTRACT = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'contract', 'broker-v1.json'), 'utf8')) as Contract;

/** The modules that import `vscode` (through `storageManager.ts`), loaded once into one graph. */
const [folderMod, hookMod] = loadEachWithVscode(['../mcpFolderHooks', '../mcpHooks'], { window: {} }) as [typeof import('../mcpFolderHooks'), typeof import('../mcpHooks')];

/** How often each of the five lookups was reached: the completeness check reads it. */
interface Counts {
  resolve: number;
  folderChoose: number;
  createChoose: number;
  config: number;
}

interface Rig {
  readonly w: World;
  readonly port: number;
  readonly counts: Counts;
}

/** One answer: the status and the raw text of the body. */
interface Reply {
  readonly status: number;
  readonly text: string;
}

async function rigOf(): Promise<Rig> {
  const counts: Counts = { resolve: 0, folderChoose: 0, createChoose: 0, config: 0 };
  const realCreate = hookMod.mcpCreateHooks(STORAGE, () => undefined);
  const w = world({
    answers: ['Allow', 'Allow', 'Allow'],
    trash: true,
    mcpEntries: await visibleMcpEntries(SOURCE),
    mcpResolve: (id, action, server) => {
      counts.resolve += 1;
      return hookMod.mcpUseLookup(SOURCE, id, action, undefined, Date.now(), server);
    },
    mcpCreateReal: {
      ...realCreate,
      choose: (body) => {
        counts.createChoose += 1;
        return realCreate.choose(body);
      },
    },
    visibleConfig: (id) => {
      counts.config += 1;
      return visibleConfigDetails(SOURCE, id);
    },
  });
  const realFolders = folderMod.folderHooks(STORAGE, () => undefined);
  w.server.setFolderHooks({
    ...realFolders,
    choose: (action, body) => {
      counts.folderChoose += 1;
      return realFolders.choose(action, body);
    },
  });
  const { port } = await share(w);
  return { w, port, counts };
}

async function ask(rig: Rig, method: 'GET' | 'POST', route: string, body?: Record<string, unknown>): Promise<Reply> {
  const response = await fetch(`http://127.0.0.1:${rig.port}${route}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, text: await response.text() };
}

/** One route of the contract that reads a node, and what to send on it. `ids` are the hidden values to compare against made-up ones. */
interface Row {
  readonly path: string;
  readonly title: string;
  readonly ids: readonly string[];
  readonly send: (rig: Rig, sent: string) => Promise<Reply>;
}

const post = (route: string, body: (sent: string) => Record<string, unknown>) => (rig: Rig, sent: string): Promise<Reply> => ask(rig, 'POST', route, body(sent));

const HIDDEN_ENTRY_IDS: readonly string[] = Object.values(HIDDEN.entries);
const HIDDEN_FOLDER_IDS: readonly string[] = Object.values(HIDDEN.folders);

/** Each of the eight actions of the contract, and ONE verb that is not in its list. */
function useRows(): Row[] {
  const verbs = [...CONTRACT.mcpActions, 'frobnicate'];
  return verbs.map((verb) => ({
    path: `${CONTRACT.mcpUsePrefix}${verb}`,
    title: `use ${verb}: a hidden entry reads as a missing one`,
    ids: HIDDEN_ENTRY_IDS,
    send: post(`${CONTRACT.mcpUsePrefix}${verb}`, (entry) => ({ entry, command: 'id' })),
  }));
}

/** The folder verbs, the move (a row more on the edit route), the delete of an entry and the create by folder NAME. */
function writeRows(): Row[] {
  const folder = (verb: string): string => `${CONTRACT.mcpFolderPrefix}${verb}`;
  return [
    { path: CONTRACT.mcpDeleteRoute, title: 'delete: a hidden entry reads as a missing one', ids: HIDDEN_ENTRY_IDS, send: post(CONTRACT.mcpDeleteRoute, (entry) => ({ entry })) },
    { path: folder('create'), title: 'folder create: a hidden parent reads as a missing one', ids: HIDDEN_FOLDER_IDS, send: post(folder('create'), (parent) => ({ parent, name: 'x' })) },
    { path: folder('edit'), title: 'folder edit: a hidden folder reads as a missing one', ids: HIDDEN_FOLDER_IDS, send: post(folder('edit'), (id) => ({ folder: id, name: 'x' })) },
    { path: folder('edit'), title: 'folder edit, a move: a hidden destination reads as a missing one', ids: HIDDEN_FOLDER_IDS, send: post(folder('edit'), (parent) => ({ folder: VISIBLE.folderEditChild, parent })) },
    { path: folder('delete'), title: 'folder delete: a hidden folder reads as a missing one', ids: HIDDEN_FOLDER_IDS, send: post(folder('delete'), (id) => ({ folder: id })) },
    { path: CONTRACT.mcpCreateRoute, title: 'create: the NAME of a hidden folder reads as the name of a missing one', ids: HIDDEN_FOLDER_IDS.map(markerOf), send: post(CONTRACT.mcpCreateRoute, (name) => ({ name: 'x', kind: 'ssh', folder: name })) },
    {
      path: CONTRACT.reads.mcpConfigSnippet.path,
      title: 'config snippet: a hidden config reads as a missing one',
      ids: [HIDDEN.entries.config],
      send: (rig, id) => ask(rig, 'GET', `${CONTRACT.reads.mcpConfigSnippet.path}?id=${id}&language=shell`),
    },
  ];
}

/** The two list routes: read one time by the list check, and named here so that the table covers them. */
const LIST_PATHS: readonly string[] = [CONTRACT.reads.mcpEntries.path, CONTRACT.reads.mcpFolders.path];

/** The routes that read no node id, each with its reason: a kind, an alias name, a config key, a grant token, or nothing. */
function takesNoNodeId(): { path: string; reason: string }[] {
  const useRoutes = [...new Set(Object.values(CONTRACT.routes))];
  return [
    { path: CONTRACT.health.path, reason: 'takes nothing' },
    { path: CONTRACT.reads.aliases.path, reason: 'takes nothing: the list of alias names' },
    { path: CONTRACT.reads.mcpKinds.path, reason: 'takes nothing: the kinds there are' },
    { path: CONTRACT.reads.mcpKindHelp.path, reason: 'takes a kind, not a node id' },
    { path: CONTRACT.configRead.path, reason: 'takes a config key, not a node id' },
    ...useRoutes.map((route) => ({ path: route, reason: 'takes a grant token, not a node id' })),
    ...useRoutes.map((route) => ({ path: CONTRACT.aliasPrefix + route.slice('/v1/use/'.length), reason: 'takes an alias name, not a node id' })),
  ];
}

const ROWS: readonly Row[] = [...useRows(), ...writeRows()];
const TABLE_PATHS: readonly string[] = [...ROWS.map((row) => row.path), ...LIST_PATHS, ...takesNoNodeId().map((row) => row.path)];

/** Everything an agent can observe of one call, with the value that the request itself sent replaced by `<SENT>` (the plan's F6). */
interface Observed {
  readonly sent: string;
  readonly status: number;
  readonly raw: string;
  readonly body: string;
  readonly dialogs: number;
  readonly audit: readonly string[];
}

async function observe(rig: Rig, row: Row, sent: string): Promise<Observed> {
  const dialogs = rig.w.dialogs.length;
  const audit = rig.w.audit.length;
  const reply = await row.send(rig, sent);
  const stripped = (text: string): string => text.split(sent).join('<SENT>');
  return {
    sent,
    status: reply.status,
    raw: reply.text,
    body: stripped(reply.text),
    dialogs: rig.w.dialogs.length - dialogs,
    audit: rig.w.audit.slice(audit).map(stripped),
  };
}

/** The hidden names and ids that the body holds. A sent ID is stripped from ids only, so the marker that holds it is still found by name. */
function leaksOf(seen: Observed): string[] {
  const nameView = HIDDEN_NAMES.includes(seen.sent) ? seen.body : seen.raw;
  return [...HIDDEN_NAMES.filter((name) => nameView.includes(name)), ...HIDDEN_IDS.filter((id) => seen.body.includes(id))];
}

const when = (differs: boolean, what: string): string[] => (differs ? [what] : []);

/** The six items of the plan's section 2.4 for one pair: the hidden value, and the value that is not in the vault. */
function differences(label: string, hidden: Observed, missing: Observed): string[] {
  const parsed = (seen: Observed): unknown => JSON.parse(seen.body) as unknown;
  const same = JSON.stringify(parsed(hidden)) === JSON.stringify(parsed(missing));
  return [
    ...when(hidden.status !== missing.status, `${label}: status ${hidden.status} against ${missing.status}`),
    ...when(!same, `${label}: body ${hidden.body} against ${missing.body}`),
    ...when(Buffer.byteLength(hidden.raw) !== Buffer.byteLength(missing.raw), `${label}: ${Buffer.byteLength(hidden.raw)} bytes against ${Buffer.byteLength(missing.raw)}`),
    ...when(leaksOf(hidden).length + leaksOf(missing).length > 0, `${label}: the body holds ${leaksOf(hidden).concat(leaksOf(missing)).join(', ')}`),
    ...when(hidden.dialogs + missing.dialogs > 0, `${label}: a dialog was raised`),
    ...when(hidden.audit.join('|') !== missing.audit.join('|'), `${label}: journal ${hidden.audit.join('|')} against ${missing.audit.join('|')}`),
  ];
}

async function pairFailures(rig: Rig, row: Row, id: string): Promise<string[]> {
  const hidden = await observe(rig, row, id);
  const missing = await observe(rig, row, madeUp(id));
  return differences(`${row.title} [${id}]`, hidden, missing);
}

let rig: Rig;
before(async () => {
  rig = await rigOf();
});
after(() => {
  rig.w.server.dispose();
});

test('the fixture holds what it says: the two lists give exactly the visible nodes, no hidden id is a part of another node, madeUp is not in the vault', async () => {
  await proveFixture();
});

for (const row of ROWS) {
  test(`A: ${row.title}`, async () => {
    const failed: string[] = [];
    for (const id of row.ids) {
      failed.push(...(await pairFailures(rig, row, id)));
    }
    assert.deepEqual(failed, [], `${failed.length} pair(s) differ`);
  });
}

test('A: a move to a destination that is an entry reads as a move to an id that does not exist', async () => {
  const move = ROWS.find((row) => row.title.startsWith('folder edit, a move')) as Row;
  const entry = await observe(rig, move, VISIBLE.entryView);
  const missing = await observe(rig, move, madeUp(HIDDEN.folders.none));
  assert.deepEqual(differences('a destination that is an entry', entry, missing), []);
});

test('the exact answers: none is a new sentence, and each is the answer that the same route gives for an id that does not exist', async () => {
  const row = (title: string): Row => ROWS.find((r) => r.title.startsWith(title)) as Row;
  const error = (seen: Observed): { code: string; message: string } => (JSON.parse(seen.body) as { error: { code: string; message: string } }).error;
  const entry = await observe(rig, row('use exec'), HIDDEN.entries.none);
  assert.equal(entry.status, 404);
  assert.deepEqual(error(entry), { code: 'not_found', message: 'No such entry, or this window does not serve it.' });
  const folder = await observe(rig, row('folder edit: '), HIDDEN.folders.none);
  assert.equal(folder.status, 404);
  assert.deepEqual(error(folder), { code: 'not_found', message: 'No folder with id "<SENT>" is open to you. Call creds_folders again.' });
  const move = await observe(rig, row('folder edit, a move'), HIDDEN.folders.none);
  assert.equal(move.status, 403);
  assert.deepEqual(error(move), { code: 'denied', message: `"${markerOf(VISIBLE.folderEditChild)}" was not moved: there is no folder with that id.` });
  const create = await observe(rig, row('create: '), markerOf(HIDDEN.folders.none));
  assert.equal(create.status, 403);
  assert.deepEqual(error(create), { code: 'denied', message: `"<SENT>" is not open to agents for creating entries. The ones that are: "${markerOf(VISIBLE.folderCreate)}".` });
  const snippet = await observe(rig, row('config snippet'), HIDDEN.entries.config);
  assert.equal(snippet.status, 200);
  assert.deepEqual(JSON.parse(snippet.raw), { error: 'no such config is open to agents', envVar: (JSON.parse(snippet.raw) as { envVar: string }).envVar, languages: [] });
});

/**
 * The four fields of the two list answers that can hold the name or the id of a node the agent may not view (the plan's
 * section 2.6). Each is a documented answer of an MCP tool today, so each is a question for the owner and none is changed here.
 * When the owner closes one, its assertion goes red and its row goes.
 */
const EXCEPTIONS = [
  { n: 'N1', list: 'entries', field: 'dependsOn', reason: 'the agent can tell the person which VPN is missing; creds_vpn_up builds on it; a Remote Bridge filters it' },
  { n: 'N4', list: 'entries', field: 'folder', reason: 'so an agent can tell two entries with one name apart; a Remote Bridge gives an empty string' },
  { n: 'N5', list: 'entries', field: 'command', reason: 'not a secret: it is what the person typed; a Remote Bridge gives a boolean' },
  { n: 'N6', list: 'folders', field: 'parent', reason: 'the shape of the tree' },
] as const;

type ListRow = Record<string, unknown> & { id: string };

async function listOf(list: 'entries' | 'folders'): Promise<ListRow[]> {
  const route = list === 'entries' ? CONTRACT.reads.mcpEntries.path : CONTRACT.reads.mcpFolders.path;
  const reply = await ask(rig, 'GET', route);
  assert.equal(reply.status, 200, reply.text);
  return (JSON.parse(reply.text) as Record<string, ListRow[]>)[list];
}

/** The same rows with one field of one row taken out. */
const without = (rows: readonly ListRow[], id: string, field: string): ListRow[] => rows.map((row) => (row.id === id ? { ...row, [field]: undefined } : row));

test('the list check: the four exceptions are exactly N1, N4, N5 and N6, each holds the value that is there today, and the lists hold nothing else', async () => {
  assert.deepEqual(EXCEPTIONS.map((e) => `${e.list}.${e.field}`), ['entries.dependsOn', 'entries.folder', 'entries.command', 'folders.parent']);
  const entries = await listOf('entries');
  const folders = await listOf('folders');
  const row = (rows: readonly ListRow[], id: string): ListRow => rows.find((r) => r.id === id) as ListRow;
  assert.deepEqual(row(entries, VISIBLE.n1).dependsOn, [markerOf(HIDDEN.entries.none)], 'N1: the hidden dependency\'s NAME');
  assert.equal(row(entries, VISIBLE.n4).folder, markerOf(HIDDEN.folders.none), 'N4: the hidden folder\'s NAME');
  assert.equal(row(entries, VISIBLE.n5).command, N5_COMMAND, 'N5: the reference text, with the hidden entry\'s NAME in it');
  assert.equal(row(folders, VISIBLE.n6).parent, HIDDEN.folders.none, 'N6: the hidden parent\'s ID');
  const left = JSON.stringify([
    without(without(without(entries, VISIBLE.n1, 'dependsOn'), VISIBLE.n4, 'folder'), VISIBLE.n5, 'command'),
    without(folders, VISIBLE.n6, 'parent'),
  ]);
  const found = [...HIDDEN_NAMES, ...HIDDEN_IDS].filter((text) => left.includes(text));
  assert.deepEqual(found, [], 'no hidden name and no hidden id is left in the two bodies');
});

test('completeness 1: every route of the contract has a row or a written reason, and the contract holds no route that nobody has seen', () => {
  assert.deepEqual(unnamedRoutes(CONTRACT, TABLE_PATHS), [], 'a route of contract/broker-v1.json has no row in part A');
  assert.deepEqual(strayRoutes(CONTRACT), []);
  assert.equal(contractRoutes(CONTRACT).length, 35, 'the contract names 35 routes today');
});

test('completeness 3: the /v1/mcp/ routes of the contract are the /v1/mcp/ routes of the bridge table', () => {
  const mcp = (paths: readonly string[]): string[] => [...new Set(paths.filter((p) => p.startsWith('/v1/mcp/')))].sort();
  assert.deepEqual(mcp(contractRoutes(CONTRACT)), mcp(BRIDGE_ROUTES.map((route) => route.path)));
  assert.equal(mcp(contractRoutes(CONTRACT)).length, 18);
});

test('completeness 4, controls (a) and (b): a node that the agent MAY view is named, so the file of negative assertions can fail', async () => {
  const exec = await ask(rig, 'POST', `${CONTRACT.mcpUsePrefix}exec`, { entry: VISIBLE.entryView, command: 'id' });
  const refusal = JSON.parse(exec.text) as { error: { code: string; message: string } };
  assert.equal(exec.status, 403);
  assert.equal(refusal.error.code, 'denied');
  assert.ok(refusal.error.message.includes(markerOf(VISIBLE.entryView)) && refusal.error.message.includes('Usable by agents'), refusal.error.message);
  const move = await ask(rig, 'POST', `${CONTRACT.mcpFolderPrefix}edit`, { folder: VISIBLE.folderEditChild, parent: VISIBLE.folderView });
  assert.equal(move.status, 403);
  assert.ok((JSON.parse(move.text) as { error: { message: string } }).error.message.includes('that destination is not open to agents'), move.text);
});

test('completeness 2 and 4 (c): each of the five lookups was reached, and the refused lookups took no throttle slot', async () => {
  const { counts } = rig;
  assert.ok(counts.resolve > 0 && counts.folderChoose > 0 && counts.createChoose > 0 && counts.config > 0, JSON.stringify(counts));
  const create = await ask(rig, 'POST', CONTRACT.mcpCreateRoute, { name: 'x', kind: 'ssh', folder: markerOf(HIDDEN.folders.none) });
  assert.match(create.text, /is not open to agents for creating entries\. The ones that are: /, 'chooseTarget was reached: only describeChoice makes this sentence');
  const dialogs = rig.w.dialogs.length;
  const used = await ask(rig, 'POST', `${CONTRACT.mcpUsePrefix}exec`, { entry: VISIBLE.entryUse, command: 'id' });
  assert.equal(used.status, 200, used.text);
  assert.equal(rig.w.dialogs.length - dialogs, 1, 'one dialog: the throttle gave a slot, as no refused call took one');
});

test('A, on a Remote Bridge: an entry in scope that the agent may not view answers as one out of scope and as one that does not exist', async () => {
  const ww = await wallWorld({ x: 'unseen', scope: ['e1', 'x'] });
  try {
    const door = viaBridge(ww.bridge);
    const use = async (entry: string): Promise<{ status: number; body: string }> => normalised(await send(door, { path: '/v1/mcp/use/exec', body: { entry, command: 'id' } }));
    const hidden = await use('x');
    assert.deepEqual(hidden, await use('e2'), 'against an entry that exists and is out of scope');
    assert.deepEqual(hidden, await use('xx'), 'against an id that does not exist');
    assert.equal(hidden.status, 404, hidden.body);
    assert.deepEqual(ww.w.dialogs, []);
    assert.deepEqual(ww.w.ran, []);
  } finally {
    ww.dispose();
  }
});
