import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { after, before, test } from 'node:test';
import { BRIDGE_ROUTES } from '../bridgeAllowList';
import { ErrorCode, errorBody, statusForErrorCode } from '../brokerProtocol';
import { linkedRunRefused, terminalRunAction } from '../agentUseActions';
import { visibleConfigDetails, visibleMcpEntries } from '../mcpEntries';
import { pinRefusalFor } from '../pinGate';
import { resolveJumpChain } from '../sshOptions';
import { isSafeSshTarget } from '../sshCommand';
import { loadEachWithVscode } from './vscodeStub';
import { contractRoutes, strayRoutes, unnamedRoutes } from './contractRoutes';
import { World, share, world } from './brokerWorld';
import { normalised, send, viaBridge, wallWorld } from './bridgeWallWorld';
import { HIDDEN_HOP_IDS, asBroker, gateWorld, usableSsh } from './agentSshWorld';
import { ACCOUNT, HIDDEN_ID, SecondOptions, SecondWorld, VISIBLE_NAME, secondEntryWorld } from './secondEntryWorld';
import { HIDDEN, HIDDEN_IDS, HIDDEN_NAMES, N5_COMMAND, SOURCE, STORAGE, VISIBLE, madeUp, markerOf, proveFixture } from './unlistedWorld';

/**
 * Part A of the class test of `research/PLAN_agent_refusal_names_unlisted_entry.md` (section 5.1): the ADDRESSED node, at the door.
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
const [folderMod, hookMod, credentialMod, authMod] = loadEachWithVscode(['../mcpFolderHooks', '../mcpHooks', '../sshCredential', '../sshExecAuth'], { window: {} }) as [
  typeof import('../mcpFolderHooks'),
  typeof import('../mcpHooks'),
  typeof import('../sshCredential'),
  typeof import('../sshExecAuth'),
];

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

/** Everything an agent can observe of one call, with the value that the request itself sent replaced by `<SENT>` (the plan's F6). */
interface Observed {
  readonly sent: string;
  readonly status: number;
  readonly raw: string;
  readonly body: string;
  readonly dialogs: number;
  readonly audit: readonly string[];
}

/**
 * One route of the contract that reads a node, and what to send on it. `ids` are the hidden values to compare against made-up ones.
 * `reaches` says whether an answer is the route's OWN answer for a value that is not in the vault: a request whose value never gets to the
 * lookup (a wrong field, `invalid_request`) is answered alike for a hidden value and a made-up one, so the pair alone would pass.
 */
interface Row {
  readonly path: string;
  readonly title: string;
  readonly ids: readonly string[];
  readonly send: (rig: Rig, sent: string) => Promise<Reply>;
  readonly reaches: (missing: Observed) => boolean;
}

/** The `error` object of an answer, or an empty one when the body has none (a string `error`, or no `error`). */
function errorOf(seen: Observed): { code?: string; message?: string } {
  const error = (JSON.parse(seen.body) as { error?: unknown }).error;
  return typeof error === 'object' && error !== null ? (error as { code?: string; message?: string }) : {};
}

/** The answer of the use, delete and folder routes for an id that is not there: 404 `not_found`. */
const notFound = (seen: Observed): boolean => seen.status === 404 && errorOf(seen).code === 'not_found';
/** The answer of a move to a destination that is not there. */
const moveMissing = (seen: Observed): boolean => errorOf(seen).message?.endsWith('was not moved: there is no folder with that id.') === true;
/** The answer of a create into a folder NAME that is not there. */
const createMissing = (seen: Observed): boolean => errorOf(seen).message?.includes('is not open to agents for creating entries') === true;
/** The answer of a config snippet for an id that is not there: a `200` that carries the sentence. */
const snippetMissing = (seen: Observed): boolean => seen.status === 200 && (JSON.parse(seen.body) as { error?: string }).error === 'no such config is open to agents';

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
    reaches: notFound,
  }));
}

/** The folder verbs, the move (a row more on the edit route), the delete of an entry and the create by folder NAME. */
function writeRows(): Row[] {
  const folder = (verb: string): string => `${CONTRACT.mcpFolderPrefix}${verb}`;
  return [
    { path: CONTRACT.mcpDeleteRoute, title: 'delete: a hidden entry reads as a missing one', ids: HIDDEN_ENTRY_IDS, send: post(CONTRACT.mcpDeleteRoute, (entry) => ({ entry })), reaches: notFound },
    { path: folder('create'), title: 'folder create: a hidden parent reads as a missing one', ids: HIDDEN_FOLDER_IDS, send: post(folder('create'), (parent) => ({ parent, name: 'x' })), reaches: notFound },
    { path: folder('edit'), title: 'folder edit: a hidden folder reads as a missing one', ids: HIDDEN_FOLDER_IDS, send: post(folder('edit'), (id) => ({ folder: id, name: 'x' })), reaches: notFound },
    { path: folder('edit'), title: 'folder edit, a move: a hidden destination reads as a missing one', ids: HIDDEN_FOLDER_IDS, send: post(folder('edit'), (parent) => ({ folder: VISIBLE.folderEditChild, parent })), reaches: moveMissing },
    { path: folder('delete'), title: 'folder delete: a hidden folder reads as a missing one', ids: HIDDEN_FOLDER_IDS, send: post(folder('delete'), (id) => ({ folder: id })), reaches: notFound },
    { path: CONTRACT.mcpCreateRoute, title: 'create: the NAME of a hidden folder reads as the name of a missing one', ids: HIDDEN_FOLDER_IDS.map(markerOf), send: post(CONTRACT.mcpCreateRoute, (name) => ({ name: 'x', kind: 'ssh', folder: name })), reaches: createMissing },
    {
      path: CONTRACT.reads.mcpConfigSnippet.path,
      title: 'config snippet: a hidden config reads as a missing one',
      ids: [HIDDEN.entries.config],
      send: (rig, id) => ask(rig, 'GET', `${CONTRACT.reads.mcpConfigSnippet.path}?id=${id}&language=shell`),
      reaches: snippetMissing,
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
  const label = `${row.title} [${id}]`;
  return [...differences(label, hidden, missing), ...when(!row.reaches(missing), `${label}: the made-up value did not reach the route's lookup: ${missing.status} ${missing.body}`)];
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
  assert.ok(move.reaches(missing), `the made-up destination did not reach the lookup: ${missing.body}`);
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
  const mcp = (paths: readonly string[]): string[] => [...new Set(paths.filter((p) => p.startsWith('/v1/mcp/')))].sort((a, b) => a.localeCompare(b));
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

test('V1 (change 8.2, owed): an entry in scope that the agent may view and whose use is switched off answers with the switch sentence through exec and query, not as an absent id; no dialog, nothing runs', async () => {
  const ww = await wallWorld({ x: 'closed', scope: ['e1', 'x'] });
  try {
    const door = viaBridge(ww.bridge);
    const absent = await send(door, { path: '/v1/mcp/use/exec', body: { entry: 'xx', command: 'id' } });
    assert.equal(absent.status, 404, absent.body);
    for (const ask of [{ path: '/v1/mcp/use/exec', body: { entry: 'x', command: 'id' } }, { path: '/v1/mcp/use/query', body: { entry: 'x', query: 'select 1' } }]) {
      const reply = await send(door, ask);
      assert.equal(reply.status, 403, `${ask.path}: ${reply.body}`);
      const error = (JSON.parse(reply.body) as { error: { code: string; message: string } }).error;
      assert.equal(error.code, 'denied');
      assert.ok(error.message.includes('Usable by agents') && error.message.includes('is not open to agents for that'), error.message);
      assert.notDeepEqual(normalised(reply), normalised(absent), 'it differs from the 404 of an absent id');
    }
    assert.deepEqual(ww.w.dialogs, [], 'nobody was asked');
    assert.deepEqual(ww.w.ran, [], 'and nothing ran');
  } finally {
    ww.dispose();
  }
});

/*
 * ---- Part B: a SECOND entry in a refusal (`research/PLAN_agent_refusal_names_unlisted_entry_E2.md` section 3; the parent's rule B) -------------------
 *
 * The rule: when an entry that an agent may view needs a second entry (a linked key, a jump host) and the second one stops the call, the
 * answer names that second entry only when the agent may view it. The REAL actions run over `secondEntryWorld.ts`, a vault in which the
 * second entries are hidden. One scenario for each field of `EntityMetadata` that holds the id of another entry; a row collects each case
 * that fails and fails one time, with the list. The assertion of a refused call here is: the status and the code are as today and the answer
 * holds no hidden name and no hidden id. The exact new body is pinned by rows B1 to B3 of `sshUseActions.test.ts` and `agentSshGate.test.ts`.
 */

interface Case {
  readonly label: string;
  readonly options: SecondOptions;
  readonly door: 'exec' | 'terminal' | 'run' | 'runHidden' | 'rotate' | 'vpnUp';
  readonly code: ErrorCode;
  readonly message?: string;
}

const REFUSED = 'no_credential';
const hopCase = (door: Case['door'], unsafeAt: number): Case => ({ label: `${door}, hop ${unsafeAt} of 3`, options: { hops: 3, unsafeAt }, door, code: REFUSED });
const VPN_SAID = `"${VISIBLE_NAME.v1}" could not be started — see the notification.`;

/** One row for each reference field, and one for `ssh:terminal` (the two SSH fields again). The keys are what the scan compares with. */
const SCENARIOS: Readonly<Record<string, readonly Case[]>> = {
  sshKeyEntityId: [
    { label: 'exec, a sealed key entry', options: { key: 'sealed' }, door: 'exec', code: REFUSED },
    { label: 'exec, a damaged key entry', options: { key: 'damaged' }, door: 'exec', code: REFUSED },
    { label: 'rotate, a sealed key entry', options: { key: 'sealed' }, door: 'rotate', code: REFUSED },
    { label: 'run of t1, a sealed key entry', options: { key: 'sealed' }, door: 'run', code: REFUSED },
  ],
  jumpHostEntityId: [
    ...[1, 2, 3].map((at) => hopCase('exec', at)),
    ...[1, 2, 3].map((at) => hopCase('run', at)),
    hopCase('rotate', 1),
  ],
  sshEntityId: [{ label: 'run of t2, linked to a hidden SSH entry', options: {}, door: 'runHidden', code: 'denied', message: linkedRunRefused(VISIBLE_NAME.t2) }],
  vpnLauncherEntityId: [{ label: 'vpn up, the start fails', options: {}, door: 'vpnUp', code: REFUSED, message: VPN_SAID }],
  dependsOn: [{ label: 'vpn up, the start fails (the dependency)', options: {}, door: 'vpnUp', code: REFUSED, message: VPN_SAID }],
  'ssh:terminal': [{
    label: 'terminal, a sealed key and a hidden unsafe hop',
    options: { key: 'sealed', hops: 1, unsafeAt: 1 },
    door: 'terminal',
    code: 'internal',
    message: `Could not open an SSH terminal for "${VISIBLE_NAME.e1}" — the window said why.`,
  }],
};

/** The fields of `EntityMetadata` that are `string` or `string[]` and hold no id of another entry. The scan fails on a field that is on neither list. */
const NO_REFERENCE = [
  'id', 'name', 'host', 'user', 'sshKeyPath', 'publicKey', 'hostKey', 'tags', 'vpnConfigFileName', 'scriptLanguage', 'script', 'configFileName',
  'configKeyHash', 'command', 'commandNote', 'terminalOs', 'attachmentFileName', 'imageFileName', 'depColor', 'notes',
  // The e-mail of the person who changed the file (`attachmentMeta.ts`); each shares a line with other fields in `types.ts`.
  'attachmentChangedBy', 'imageChangedBy',
] as const;

const ranRows = new Set<string>();

const messageOf = (result: { body: unknown }): string | undefined => (result.body as { error?: { message?: string } }).error?.message;
const codeOf = (result: { body: unknown }): string | undefined => (result.body as { error?: { code?: string } }).error?.code;

/** What is wrong with the answer of one case: the status, the code, the sentence when the case has one, a spawn, a hidden name or id. */
async function failuresOf(c: Case): Promise<string[]> {
  const w = await secondEntryWorld(c.options);
  try {
    const result = await w.call[c.door]();
    return [
      ...when(result.status !== statusForErrorCode(c.code), `${c.label}: status ${result.status}`),
      ...when(codeOf(result) !== c.code, `${c.label}: code ${String(codeOf(result))}`),
      ...when(c.message !== undefined && messageOf(result) !== c.message, `${c.label}: message ${String(messageOf(result))}`),
      ...when(w.spawned.length > 0, `${c.label}: ssh was started`),
      ...when(w.leaks(JSON.stringify(result.body)).length > 0, `${c.label}: the answer holds ${w.leaks(JSON.stringify(result.body)).join(' and ')}: ${String(messageOf(result))}`),
    ];
  } finally {
    w.cleanup();
  }
}

test('B: the fixture holds what it says (proofs 1 to 5): the hidden entries are hidden, the others are viewable, no name is a part of another text, e1 passes the credential step by its own key', async () => {
  const w = await secondEntryWorld({ key: 'sealed', hops: 5, unsafeAt: 3 });
  const shown = await secondEntryWorld({ key: 'damaged', keyVisible: true, hops: 2, visibleHops: [1] });
  try {
    assert.deepEqual(w.hiddenIds.filter((id) => w.mayView(id)), [], 'an id that the product says an agent may view');
    assert.equal(w.hiddenIds.length, 3 + 1 + 5, 'the key entry, the five hops and the three others');
    assert.deepEqual(['e1', 't1', 't2', 'v1'].filter((id) => !w.mayView(id)), [], 'a visible entry that the product hides');
    assert.deepEqual([HIDDEN_ID.key, HIDDEN_HOP_IDS[0]].filter((id) => !shown.mayView(id)), [], 'a made-visible key entry or hop that the product hides');
    const texts = [...Object.values(VISIBLE_NAME), 'e1', 't1', 't2', 'v1', w.storageDir, linkedRunRefused(VISIBLE_NAME.t2), VPN_SAID, ...w.hiddenNames];
    const parts = w.hiddenIds.flatMap((id) => texts.filter((text) => text.includes(id) && text !== `MARK-${id}`));
    assert.deepEqual(parts, [], 'a hidden id is a part of another text');
    const hops = [1, 2, 3, 4, 5].map((n) => isSafeSshTarget(w.storage.getNode(ACCOUNT, HIDDEN_HOP_IDS[n - 1])?.details as never));
    assert.deepEqual(hops, [true, true, false, true, true], 'only hop 3 has an unsafe address');
    const e1 = w.storage.getNode(ACCOUNT, 'e1')?.details as never;
    const sealed = await credentialMod.resolveSshCredential(w.storage, ACCOUNT, e1);
    assert.deepEqual(sealed, { kind: 'stopped', reason: pinRefusalFor(w.names.key), ownerName: w.names.key, ownerId: HIDDEN_ID.key, warning: undefined }, 'a sealed key entry stops the real resolver');
    const damaged = await credentialMod.resolveSshCredential(shown.storage, ACCOUNT, shown.storage.getNode(ACCOUNT, 'e1')?.details as never);
    assert.ok(damaged.kind === 'stopped' && damaged.reason.startsWith(`"${shown.names.key}" holds a protected value that cannot be read:`), JSON.stringify(damaged));
  } finally {
    w.cleanup();
    shown.cleanup();
  }
  const plain = await secondEntryWorld();
  try {
    assert.equal((await plain.call.exec()).status, 200, 'proof 5: with no second entry the call reaches ssh by e1\'s own key');
    assert.equal(plain.spawned.length, 1);
  } finally {
    plain.cleanup();
  }
});

for (const [field, cases] of Object.entries(SCENARIOS)) {
  test(`B, ${field}: the answer holds no hidden name and no hidden id`, async () => {
    const failed: string[] = [];
    for (const c of cases) {
      failed.push(...(await failuresOf(c)));
    }
    ranRows.add(field);
    assert.deepEqual(failed, [], `${failed.length} of ${cases.length} case(s) fail`);
  });
}

test('B, the scan: each string field of EntityMetadata is a scenario of the table or on the written list of fields that hold no reference', async () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', '..', 'src', 'types.ts'), 'utf8');
  const body = source.slice(source.indexOf('export interface EntityMetadata {') + 'export interface EntityMetadata {'.length).split(/\n\}/)[0];
  const pieces = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').split(';').map((piece) => piece.trim()).filter((piece) => piece !== '');
  const shape = /^(?:readonly\s+)?(\w+)\??\s*:\s*([\s\S]+)$/;
  const notFields = pieces.filter((piece) => !shape.test(piece));
  assert.deepEqual(notFields, [], 'a piece of the interface that is not "name: type"');
  const strings = pieces.map((piece) => shape.exec(piece) as RegExpExecArray).filter((m) => /^(?:readonly\s+)?string(?:\[\])?$/.test(m[2].trim())).map((m) => m[1]);
  const known = [...Object.keys(SCENARIOS), ...NO_REFERENCE];
  assert.deepEqual(strings.filter((name) => !known.includes(name)), [], 'a string field that is on neither list');
  assert.deepEqual(NO_REFERENCE.filter((name) => !strings.includes(name)), [], 'a name of the written list that the scan does not find (a list that went stale)');
  for (const field of ['sshKeyEntityId', 'jumpHostEntityId', 'vpnLauncherEntityId', 'sshEntityId', 'dependsOn', 'name']) {
    assert.ok(strings.includes(field), `the scan still finds ${field}`);
  }
  const w = await secondEntryWorld();
  try {
    const details = w.storage.getNode(ACCOUNT, 'v1')?.details as { vpnLauncherEntityId?: string; dependsOn?: string[] };
    assert.deepEqual([details.vpnLauncherEntityId, details.dependsOn], [HIDDEN_ID.launcher, [HIDDEN_ID.dependency]], 'v1 holds the two fields that rows R4 and R5 read');
  } finally {
    w.cleanup();
  }
});

test('B, each row ran: each of the six rows of the table made at least one call', () => {
  assert.deepEqual(Object.keys(SCENARIOS).filter((field) => !ranRows.has(field)), []);
});

test('B, row R: no agent action resolves a creds:// reference off a bridge', async () => {
  const dir = path.resolve(__dirname, '..', '..', 'src');
  const imports = (file: string): string[] => (fs.readFileSync(path.join(dir, file), 'utf8').match(/['"]\.\/(?:secretRef|entityFieldReading|runPlan)['"]/g) ?? []);
  assert.deepEqual(['sshUseActions.ts', 'agentUseActions.ts', 'rotateAction.ts'].flatMap(imports), [], 'an agent action imports a reference resolver');
  assert.deepEqual(imports('remoteLaunch.ts'), ["'./runPlan'"], 'the scan still finds the import it looks for');
  const command = `echo creds://${ACCOUNT}/MARK-${HIDDEN.entries.none}/password`;
  const w = gateWorld({ terminal: { command }, acct1: [usableSsh('s1')] });
  w.trust(w.nodes.get('s1')?.details as never, command);
  const action = terminalRunAction(w.deps);
  const result = await action.run(asBroker(action, w.ctx), {});
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.ok(w.overSsh.calls[0].call.remoteCommand.includes(`creds://${ACCOUNT}/MARK-${HIDDEN.entries.none}/password`), 'the reference travels as text');
  assert.ok(!JSON.stringify(result.body).includes(`MARK-${HIDDEN.entries.none}`));
});

/** The message of a refusal that a real resolver gives on the same world: the `m` of a positive control, never typed again. */
async function resolverSays(w: SecondWorld): Promise<string> {
  const e1 = w.storage.getNode(ACCOUNT, 'e1')?.details as never;
  const auth = await authMod.resolveExecAuth(w.storage, ACCOUNT, e1, w.storageDir);
  const chain = resolveJumpChain(e1, (id) => w.storage.getNode(ACCOUNT, id)?.details);
  return !auth.ok ? auth.message : chain.ok ? 'no refusal' : chain.reason;
}

test('B, control: a visible jump host with an unsafe address is named as today, the whole body is the resolver\'s, and no note is written', async () => {
  const w = await secondEntryWorld({ hops: 1, unsafeAt: 1, visibleHops: [1] });
  try {
    const said = await resolverSays(w);
    assert.equal(said, `The jump host "${w.names.hop(1)}" cannot be used: its address is not a valid host.`);
    assert.deepEqual(await w.call.exec(), { status: 409, body: errorBody(REFUSED, said) });
    assert.deepEqual(w.notes, []);
  } finally {
    w.cleanup();
  }
});

test('B, control: a visible key entry with a damaged value is named as today, the whole body is the resolver\'s, and no note is written', async () => {
  const w = await secondEntryWorld({ key: 'damaged', keyVisible: true });
  try {
    const said = await resolverSays(w);
    assert.ok(said.startsWith(`"${w.names.key}" holds a protected value that cannot be read:`), said);
    assert.deepEqual(await w.call.exec(), { status: 409, body: errorBody(REFUSED, said) });
    assert.deepEqual(w.notes, []);
  } finally {
    w.cleanup();
  }
});

test('B, control: a visible unsafe hop behind a hidden good hop names hop 2 and not hop 1', async () => {
  const w = await secondEntryWorld({ hops: 2, unsafeAt: 2, visibleHops: [2] });
  try {
    const result = await w.call.exec();
    assert.equal(messageOf(result), `The jump host "${w.names.hop(2)}" cannot be used: its address is not a valid host.`);
    assert.ok(!JSON.stringify(result.body).includes(w.names.hop(1)), 'hop 1 is hidden and is not named');
  } finally {
    w.cleanup();
  }
});

test('G11: a hidden jump host with a safe address stops no call', async () => {
  const w = await secondEntryWorld({ hops: 1 });
  try {
    const result = await w.call.exec();
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(w.spawned.length, 1);
    assert.equal(w.spawned[0][w.spawned[0].indexOf('-J') + 1], 'hop@hop1.example', `the hop is in the argv: ${w.spawned[0].join(' ')}`);
    assert.deepEqual(w.notes, []);
  } finally {
    w.cleanup();
  }
});

test('G11: a hidden key entry with no PIN stops no call, and its file is gone after', async () => {
  const w = await secondEntryWorld({ key: 'plain' });
  try {
    const result = await w.call.exec();
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(w.spawned.length, 1);
    assert.deepEqual(w.materialised.map((file) => fs.existsSync(file)), [false], 'the key file was written, and removed');
    assert.deepEqual(w.notes, []);
  } finally {
    w.cleanup();
  }
});
