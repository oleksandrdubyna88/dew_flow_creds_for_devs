import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { BRIDGE_BYTE_EQUAL_READS, BRIDGE_READ_SHAPES, BRIDGE_ROUTES } from '../bridgeAllowList';
import { BRIDGE_ENTRY_FIELDS } from '../bridgeScope';
import type { ReadRouteSources } from '../brokerReadRoutes';
import { visibleMcpEntries, type McpEntry } from '../mcpEntries';
import { loadBridgeModules } from './bridgeModules';
import { ACCOUNT, CONTEXT_1, PLANTED, PLANTED_IDS, SECRET_SLOTS, WallWorld, send, viaBridge, viaMain, wallWorld } from './bridgeWallWorld';

/**
 * What a bridge may SAY about the entries in its scope (Amendment 6, F.3; the parent's §4.2, D12): every served read, walked
 * from the route to the JSON a client parses, and the one function every bridged listing row passes.
 *
 * <p>The bodies are read as served TEXT, never as the in-process object: an optional field set to `undefined` is a key of the
 * object and absent on the wire, and the wire is what an agent sees.</p>
 */

const SERVED_READS = BRIDGE_ROUTES.filter((route) => route.method === 'GET' && route.decision.served).map((route) => route.path);

/** What each served read is asked with: a walk that has to name every served GET, so a new read cannot be served unwalked. */
const WALK: Readonly<Record<string, readonly string[]>> = {
  '/v1/health': [''],
  '/v1/mcp/kinds': [''],
  '/v1/mcp/kind-help': ['?kind=ssh', '?kind=db', '?kind=nonsense'],
  '/v1/aliases': [''],
  '/v1/mcp/entries': [''],
  '/v1/mcp/config-snippet': ['?id=e1', '?id=e1&language=shell'],
  '/v1/mcp/folders': [''],
};

const ALL_IN_SCOPE = ['e1', 'e2', 'e-out', ...PLANTED_IDS];

const asks = (path: string): string[] => {
  const queries = WALK[path];
  assert.ok(queries !== undefined, `${path} is served and the walk does not ask it: add it to WALK`);
  return queries.map((query) => `${path}${query}`);
};

const bodyOf = async (ww: WallWorld, door: 'bridge' | 'main', pathAndQuery: string): Promise<string> => {
  const reply = await send(door === 'bridge' ? viaBridge(ww.bridge) : viaMain(ww), { method: 'GET', path: pathAndQuery });
  assert.equal(reply.status, 200, `${door} ${pathAndQuery}: ${reply.body}`);
  return reply.body;
};

/** Every key of every object at every depth of a parsed body. */
function keysAt(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(keysAt);
  }
  return typeof value === 'object' && value !== null ? Object.entries(value).flatMap(([key, inner]) => [key, ...keysAt(inner)]) : [];
}

/** The field list of a served read, or the failure that is default deny. */
function fieldsFor(path: string): readonly string[] {
  const fields = BRIDGE_READ_SHAPES[path];
  if (fields === undefined) {
    assert.fail(`${path} is a served read with no field list: default deny (add a row to BRIDGE_READ_SHAPES, or pin it byte-equal)`);
  }
  return fields;
}

/** The row of an entry, as the bridge served it (parsed from text). */
async function servedRow(ww: WallWorld, id: string): Promise<Record<string, unknown>> {
  const listed = JSON.parse(await bodyOf(ww, 'bridge', '/v1/mcp/entries')) as { entries: Record<string, unknown>[] };
  const row = listed.entries.find((entry) => entry.id === id);
  assert.ok(row !== undefined, `${id} is in the served listing`);
  return row;
}

/** The routes that serve a list, and the field it is in. */
const LIST_FIELDS: Readonly<Record<string, string>> = { '/v1/aliases': 'aliases', '/v1/mcp/entries': 'entries' };

/** A list route must carry its list field, as a non-empty array: a response with no field, or an empty one, has no stray key to find. */
function assertListNotEmpty(path: string, ask: string, body: Record<string, unknown>): void {
  const field = LIST_FIELDS[path];
  if (field !== undefined) {
    const rows = body[field];
    assert.ok(Array.isArray(rows) && rows.length > 0, `${ask} has no non-empty "${field}" array`);
  }
}

/** The keys a served body carries, after asserting each is in its route's field list (a byte-equal route has none to check). */
function keysWithinList(path: string, ask: string, text: string): string[] {
  if (BRIDGE_BYTE_EQUAL_READS.includes(path)) {
    return [];
  }
  const allowed = new Set(fieldsFor(path));
  const body = JSON.parse(text) as Record<string, unknown>;
  assertListNotEmpty(path, ask, body);
  const keys = keysAt(body);
  assert.deepEqual([...new Set(keys.filter((key) => !allowed.has(key)))], [], `${ask} served keys its field list does not name`);
  return keys;
}

test('RS1: every key at every depth of every served read is in that route\'s field list, or the route is pinned byte-equal', async () => {
  const ww = await wallWorld({ fullVault: true, scope: ALL_IN_SCOPE });
  try {
    const seen = new Set<string>();
    for (const path of SERVED_READS) {
      for (const ask of asks(path)) {
        keysWithinList(path, ask, await bodyOf(ww, 'bridge', ask)).forEach((key) => seen.add(key));
      }
    }
    // Teeth: the walk saw what it is meant to check. A snippet that was never served, or an empty alias list, would pass for ever.
    for (const key of ['snippet', 'code', 'where', 'name', 'kind', 'hasPassword', 'variants']) {
      assert.ok(seen.has(key), `the walk never saw "${key}" in a served body`);
    }
  } finally {
    ww.dispose();
  }
});

test('RS1 teeth: a served read in neither list fails with default deny', () => {
  assert.throws(() => fieldsFor('/v1/mcp/nothing'), /a served read with no field list: default deny/);
});

test('RS2: a row is exactly BridgeEntry — the key set equals the list, `can` has only `use` as resolved, dependencies name kept rows only', async () => {
  const ww = await wallWorld({ fullVault: true, scope: ['full-row', 'db-kv'] });
  try {
    const row = await servedRow(ww, 'full-row');
    assert.deepEqual(new Set(Object.keys(row)), new Set(BRIDGE_ENTRY_FIELDS), 'the served row\'s keys are the list, no more and no fewer');
    assert.equal(BRIDGE_ENTRY_FIELDS.length, 19);
    const local = (await visibleMcpEntries(ww.vault)).find((entry) => entry.id === 'full-row');
    assert.deepEqual(row.can, { use: local?.can.use, edit: false, create: false, delete: false });
    assert.equal(local?.can.use, true, 'the folder opens use, so the control can tell `use` from `false`');
    assert.deepEqual(row.dependsOn, ['db-kv'], 'the dependency out of scope is not named');
    assert.equal(row.folder, '');
  } finally {
    ww.dispose();
  }
});

/** Every served read, asked through the bridge: the text of each body. */
async function walkedThroughBridge(ww: WallWorld): Promise<Array<{ ask: string; text: string }>> {
  const walked: Array<{ ask: string; text: string }> = [];
  for (const ask of SERVED_READS.flatMap(asks)) {
    walked.push({ ask, text: await bodyOf(ww, 'bridge', ask) });
  }
  return walked;
}

const FORBIDDEN = [PLANTED.S1, PLANTED.S2, PLANTED.S3a, PLANTED.S3b, PLANTED.S4a, PLANTED.S4b, PLANTED.FOLDER, 'creds://', 'Password=', '?password'];

/** What the main port still serves, whole: the control that shows the test can see what it looks for. */
const SERVED_WHOLE_LOCALLY = [
  `Password=${PLANTED.S1}`,
  `?password=${PLANTED.S2}`,
  `postgresql://u:${PLANTED.S3a}/${PLANTED.S3b}@h/d`,
  `postgresql://u@${PLANTED.S4b}@h/d`,
  `deploy ${PLANTED.REFERENCE}`,
  `"folder":"${PLANTED.FOLDER}"`,
];

const FLAGS = ['hasPassword', 'hasPrivateKey', 'hasNotes', 'hasTotp'] as const;
const PLAIN_FIELDS = ['name', 'kind', 'host', 'port', 'user', 'dbType', 'vpnType', 'scriptLanguage', 'codeAccessEnabled'] as const;

/** The plain fields of the row that sets them all: each served value is the local row's, and the control is that the local row sets it. */
function assertPlainFields(served: Record<string, unknown>, local: McpEntry | undefined): void {
  for (const field of PLAIN_FIELDS) {
    assert.notEqual(local?.[field], undefined, `control: the local row sets ${field}`);
    assert.equal(served[field], local?.[field], `${field} is the local row's`);
  }
}

/** One row that holds one slot alone: every flag is the local row's, and the local row has exactly that one. */
function assertFlags(id: string, own: string, served: Record<string, unknown>, local: McpEntry | undefined): void {
  for (const flag of FLAGS) {
    assert.equal(local?.[flag], flag === own, `control: the local row ${id} holds ${own} alone`);
    assert.equal(served[flag], local?.[flag], `${id}: ${flag} is the local row's`);
  }
}

/** A row with no connection string or command says false; a config with no code-access key says false, which is not absent; the name is not the id. */
function assertAbsentThings(plain: Record<string, unknown>, local: McpEntry | undefined, full: McpEntry | undefined): void {
  assert.equal(plain.hasConnectionString, false);
  assert.equal(plain.hasCommand, false);
  assert.equal(local?.codeAccessEnabled, false, 'control: the local row says false');
  assert.equal(plain.codeAccessEnabled, false);
  assert.notEqual(full?.name, full?.id, 'control: the name is not the id');
}

test('RS2: every served value is the local row\'s — the plain fields on a row that sets them all, each flag on a row that holds that slot alone', async () => {
  const ww = await wallWorld({ fullVault: true, scope: ['e1', 'full-row', ...Object.keys(SECRET_SLOTS)] });
  try {
    const local = await visibleMcpEntries(ww.vault);
    const localRow = (id: string): McpEntry | undefined => local.find((entry) => entry.id === id);
    assertPlainFields(await servedRow(ww, 'full-row'), localRow('full-row'));
    for (const [id, own] of Object.entries(SECRET_SLOTS)) {
      assertFlags(id, own, await servedRow(ww, id), localRow(id));
    }
    assertAbsentThings(await servedRow(ww, 'e1'), localRow('e1'), localRow('full-row'));
  } finally {
    ww.dispose();
  }
});

test('RS2: every served alias row is the local one — a kind other than ssh survives', async () => {
  const ww = await wallWorld({ fullVault: true, scope: ALL_IN_SCOPE });
  try {
    const served = (JSON.parse(await bodyOf(ww, 'bridge', '/v1/aliases')) as { aliases: Array<{ name: string; kind: string }> }).aliases;
    const local = (JSON.parse(await bodyOf(ww, 'main', '/v1/aliases')) as { aliases: Array<{ name: string; kind: string }> }).aliases;
    assert.ok(local.some((row) => row.kind !== 'ssh'), 'control: the local list has a row of another kind');
    assert.deepEqual(served, local.filter((row) => row.name !== 'foreign'), 'the bridge lists the local rows whose entries are in scope, name and kind as they are');
  } finally {
    ww.dispose();
  }
});

test('RS3: five strings through the wall — none crosses a bridge, and the main port is the control that shows the test can see them', async () => {
  const ww = await wallWorld({ fullVault: true, scope: ALL_IN_SCOPE });
  try {
    for (const { ask, text } of await walkedThroughBridge(ww)) {
      assert.deepEqual(FORBIDDEN.filter((word) => text.includes(word)), [], `${ask} carries these through the bridge`);
    }
    for (const id of ['db-kv', 'db-qs', 'db-slash', 'db-at']) {
      assert.equal((await servedRow(ww, id)).hasConnectionString, true, `${id} says it has a connection string`);
    }
    assert.equal((await servedRow(ww, 'tm-ref')).hasCommand, true);
    assert.equal((await servedRow(ww, 'in-folder')).folder, '');

    const main = await bodyOf(ww, 'main', '/v1/mcp/entries');
    assert.equal(main, JSON.stringify({ entries: await visibleMcpEntries(ww.vault) }), 'the main port serves visibleMcpEntries, untouched');
    assert.deepEqual(SERVED_WHOLE_LOCALLY.filter((whole) => !main.includes(whole)), [], 'the main port still serves these whole');
  } finally {
    ww.dispose();
  }
});

test('RS4: the product\'s own reads are byte-equal through a bridge over an empty scope, a bridge over the full vault, and the main port', async () => {
  const empty = await wallWorld({ emptyVault: true, scope: [] });
  const full = await wallWorld({ fullVault: true, scope: ALL_IN_SCOPE });
  try {
    for (const path of BRIDGE_BYTE_EQUAL_READS) {
      for (const ask of asks(path)) {
        const [none, everything, main] = [await bodyOf(empty, 'bridge', ask), await bodyOf(full, 'bridge', ask), await bodyOf(full, 'main', ask)];
        assert.equal(none, everything, `${ask}: an empty scope and the full vault read alike`);
        assert.equal(everything, main, `${ask}: and the main port reads the same`);
      }
    }
  } finally {
    empty.dispose();
    full.dispose();
  }
});

test('RS5: the listing a bridge builds is the wall\'s, field by field — a key planted on the stored row is not served', async () => {
  const modules = loadBridgeModules();
  const real: ReadRouteSources = { aliases: () => [], mcpEntries: () => Promise.resolve([]), visibleConfig: () => undefined, folders: () => [] };
  assert.equal(modules.scope.OPEN_VIEW.sources(real, undefined), real, 'the local door\'s view is the identity: its listing is untouched');
  const ww = await wallWorld();
  try {
    const rows = await ww.wall.listEntriesOf(ACCOUNT);
    const planted = rows.map((row) => Object.assign(row, { leak: 'zq-planted-s5' }));
    const view = modules.scope.doorView(CONTEXT_1, { ...ww.wall, listEntriesOf: () => Promise.resolve(planted) });
    const served = JSON.stringify(await view.sources(real, undefined).mcpEntries?.());
    assert.ok(served.includes('"id":"e1"'), 'the row was listed');
    assert.equal(served.includes('leak'), false);
    assert.equal(served.includes('zq-planted-s5'), false);
  } finally {
    ww.dispose();
  }
});

test('RS6: default deny has teeth — the two lists together name exactly the served GET routes', () => {
  const named = [...Object.keys(BRIDGE_READ_SHAPES), ...BRIDGE_BYTE_EQUAL_READS];
  assert.deepEqual([...named].sort(), [...SERVED_READS].sort());
});
