import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { BRIDGE_NOT_SERVED, BRIDGE_ROUTES } from '../bridgeAllowList';
import { BRIDGE_WRONG_KEY } from '../brokerOrigin';
import { configSnippetResult } from '../mcpSnippetRoute';
import { Reply, code, message } from './bridgeDoorHarness';
import { put } from './bridgeModules';
import { ACCOUNT, Ask, CONTEXT_1, Door, LEAKS, WallWorld, normalised, send, until, viaBridge, viaMain, wallWorld } from './bridgeWallWorld';

/**
 * The walk (E1.3, S3-S7, S13, S15, S20): every route a bridge serves, asked about the entry that is in scope and the
 * one that is not, through a real listener in front of the real broker.
 *
 * <p>The walk is written so that it can SEE a leak: the same walk through the main port (S4) finds the leaks it
 * exists to find. A walk that only ever came back clean would be green for any wall, including none.</p>
 */

interface Who {
  readonly entry: string;
  readonly alias: string;
  readonly token: string;
}

/** The asks of rows 1-9 of the decision table, for one entry named three ways. `row` is the table's number. */
function asks(who: Who): Array<{ row: number; ask: Ask }> {
  const body = { command: 'id' };
  const snippet = `/v1/mcp/config-snippet?id=${who.entry}&language=shell`;
  return [
    { row: 1, ask: { method: 'GET', path: '/v1/health' } },
    { row: 2, ask: { method: 'GET', path: '/v1/mcp/kinds' } },
    { row: 2, ask: { method: 'GET', path: '/v1/mcp/kind-help?kind=ssh' } },
    { row: 3, ask: { method: 'GET', path: '/v1/aliases' } },
    { row: 4, ask: { method: 'GET', path: '/v1/mcp/entries' } },
    { row: 5, ask: { method: 'GET', path: snippet } },
    { row: 6, ask: { method: 'GET', path: '/v1/mcp/folders' } },
    ...['exec', 'query'].flatMap((action) => [
      { row: 7, ask: { path: `/v1/mcp/use/${action}`, body: { entry: who.entry, ...body } } },
      { row: 8, ask: { path: `/v1/alias/${action}`, body: { alias: who.alias, ...body } } },
      { row: 9, ask: { path: `/v1/use/${action}`, token: who.token, body } },
    ]),
  ];
}

async function whoIsOut(ww: WallWorld): Promise<Who> {
  return { entry: 'e-out', alias: 'leaky', token: await ww.tokenFor(ACCOUNT, 'e-out', 'leak-target') };
}

async function whoIsIn(ww: WallWorld): Promise<Who> {
  return { entry: 'e1', alias: 'one', token: await ww.tokenFor(ACCOUNT, 'e1', 'prod') };
}

/** The entries the action has run on, read fresh (an `assert.deepEqual(w.ran, [])` narrows the array to `never[]` for the rest of the test). */
const ranOn = (ww: WallWorld): string[] => ww.w.ran.map((r) => r.entityId);

const READ_ROWS = new Set([1, 2, 3, 4, 5, 6]);
const pathOf = (ask: Ask): string => ask.path.split('?')[0];

/** What a bridge scoped to `e1` answers for `e-out`, row by row: the status and code of §S3.3. */
const OUT_BEFORE_ANYTHING = {
  7: { status: 404, code: 'not_found', message: 'No such entry, or this window does not serve it.' },
  8: { status: 404, code: 'not_found', message: 'No entry is enabled for the CLI under "leaky".' },
  9: { status: 401, code: 'unauthorized', message: 'Unknown or missing grant token.' },
} as const;

/** A performing row that got an answer, or ran something: the call reached the entry. */
function reachedBy(row: number, ask: Ask, reply: Reply, ranGrew: boolean): string | undefined {
  return reply.status === 200 || ranGrew ? `row ${row} ${pathOf(ask)} reached e-out (${reply.status})` : undefined;
}

/** A snippet names nothing of the entry; what it gives away is that it is there, which is a body with no `error`. */
const snippetServed = (reply: Reply): boolean => (JSON.parse(reply.body) as { error?: string }).error === undefined;

/** A read that names the entry, or a snippet that serves it. */
function readLeak(row: number, ask: Ask, reply: Reply): string | undefined {
  const named = LEAKS.filter((leak) => reply.body.includes(leak));
  if (named.length > 0) {
    return `row ${row} ${pathOf(ask)} names ${named.join(', ')}`;
  }
  return row === 5 && snippetServed(reply) ? `row ${row} ${pathOf(ask)} serves it` : undefined;
}

/** Every way the walk found `e-out` through a door: a read that names it, a call that reaches it. */
async function leaksThrough(ww: WallWorld, door: Door, who: Who): Promise<string[]> {
  const found: string[] = [];
  for (const { row, ask } of asks(who)) {
    const ranBefore = ww.w.ran.length;
    const reply = await send(door, ask);
    const leak = READ_ROWS.has(row) ? readLeak(row, ask, reply) : reachedBy(row, ask, reply, ww.w.ran.length > ranBefore);
    found.push(...(leak === undefined ? [] : [leak]));
  }
  return found;
}

/** What one row of the walk must answer through a bridge scoped to e1, for e-out: a read that names nothing, a call turned away. */
function assertTurnedAway(row: number, ask: Ask, reply: Reply): void {
  const label = `row ${row} ${ask.method ?? 'POST'} ${ask.path}`;
  if (READ_ROWS.has(row)) {
    assert.equal(reply.status, 200, label);
    assert.deepEqual(LEAKS.filter((leak) => reply.body.includes(leak)), [], `${label}: ${reply.body.slice(0, 200)}`);
    return;
  }
  const wanted = OUT_BEFORE_ANYTHING[row as 7 | 8 | 9];
  assert.deepEqual([reply.status, code(reply), message(reply)], [wanted.status, wanted.code, wanted.message], label);
}

test('S3: through a bridge scoped to e1, e-out answers nothing it should not, on every route, by id, by alias and by token', async () => {
  const ww = await wallWorld();
  try {
    const who = await whoIsOut(ww);
    const journal = ww.w.audit.length;
    for (const { row, ask } of asks(who)) {
      assertTurnedAway(row, ask, await send(viaBridge(ww.bridge), ask));
    }
    assert.deepEqual(ww.w.ran, [], 'nothing ran');
    assert.deepEqual(ww.w.dialogs, [], 'nobody was asked');
    assert.equal(ww.w.audit.length, journal, 'and not one line was written to the journal: a refusal with no grant writes none');
  } finally {
    ww.dispose();
  }
});

test('S3: row 5 for an entry out of scope is the usual not-found body, with status 200', async () => {
  const ww = await wallWorld();
  try {
    const reply = await send(viaBridge(ww.bridge), { method: 'GET', path: '/v1/mcp/config-snippet?id=e-out&language=shell' });
    assert.equal(reply.status, 200);
    assert.deepEqual(JSON.parse(reply.body), configSnippetResult(undefined, undefined, undefined));
  } finally {
    ww.dispose();
  }
});

test('S3: through the same bridge e1 is served — rows 3, 4, 5 show it', async () => {
  const ww = await wallWorld();
  try {
    const bridge = viaBridge(ww.bridge);
    const listed = async (path: string): Promise<Record<string, unknown>> => JSON.parse((await send(bridge, { method: 'GET', path })).body) as Record<string, unknown>;

    assert.deepEqual(((await listed('/v1/aliases')).aliases as { name: string }[]).map((a) => a.name), ['one']);
    const entries = (await listed('/v1/mcp/entries')).entries as { id: string; can: unknown; dependsOn: string[] }[];
    assert.deepEqual(entries.map((e) => e.id), ['e1']);
    assert.deepEqual(entries[0].can, { use: true, edit: false, create: false, delete: false });
    assert.deepEqual(entries[0].dependsOn, [], 'e-out and e2 are not in scope, so e1 depends on no name that is');
    const snippet = await listed('/v1/mcp/config-snippet?id=e1&language=shell');
    assert.equal(snippet.error, undefined, 'e1 is a config in scope');
    assert.deepEqual(await listed('/v1/mcp/folders'), { folders: [] });
  } finally {
    ww.dispose();
  }
});

test('S3: through the same bridge e1 reaches the action after Allow on rows 7, 8 and 9, for each action', async () => {
  // One world per action: a caller without a token may prompt five times a minute, and three routes are three.
  for (const action of ['exec', 'query']) {
    const ww = await wallWorld();
    try {
      const who = await whoIsIn(ww);
      for (const { row, ask } of asks(who).filter(({ row: r, ask: a }) => r >= 7 && a.path.endsWith(`/${action}`))) {
        const reply = await send(viaBridge(ww.bridge), ask);
        assert.equal(reply.status, 200, `row ${row} ${ask.path}: ${reply.body}`);
      }
      assert.deepEqual(ranOn(ww), ['e1', 'e1', 'e1'], `${action}: three routes, all on e1`);
      assert.equal(ww.w.dialogs.length, 3, 'a modal for every call, and one only');
    } finally {
      ww.dispose();
    }
  }
});

test('S3: the walk asks about every route the table serves — a route served and not walked fails here', async () => {
  const ww = await wallWorld();
  try {
    const walked = new Set(asks(await whoIsIn(ww)).map(({ ask }) => `${ask.method ?? 'POST'} ${pathOf(ask)}`));
    const served = BRIDGE_ROUTES.filter((route) => route.decision.served).map((route) => `${route.method} ${route.path}`);
    assert.deepEqual([...walked].sort(), [...served].sort());
  } finally {
    ww.dispose();
  }
});

test('S4: the same walk through the main port finds e-out on rows 3-5 and 7-9 — the walk can see what it is looking for', async () => {
  const ww = await wallWorld();
  try {
    const findings = await leaksThrough(ww, viaMain(ww), await whoIsOut(ww));
    const rows = new Set(findings.map((finding) => Number(finding.split(' ')[1])));
    assert.deepEqual([...rows].sort(), [3, 4, 5, 7, 8, 9], findings.join('\n'));
    assert.ok(ranOn(ww).includes('e-out'), 'and e-out really did run, which is what a leak is');
  } finally {
    ww.dispose();
  }
});

test('S4: the walk through the bridge finds nothing', async () => {
  const ww = await wallWorld();
  try {
    assert.deepEqual(await leaksThrough(ww, viaBridge(ww.bridge), await whoIsOut(ww)), []);
  } finally {
    ww.dispose();
  }
});

type Answered = { status: number; body: string };

/** The asks of rows 3-9 about `x`, in order, through one door. */
async function askAbout(door: Door, who: Who, rows: (row: number) => boolean): Promise<Answered[]> {
  const answers: Answered[] = [];
  for (const { ask } of asks(who).filter(({ row }) => rows(row))) {
    answers.push(normalised(await send(door, ask)));
  }
  return answers;
}

type Registry = { reserve(secret: string, now: number, limits: object): unknown; get(secret: string): unknown };
const registryReserve = (ww: WallWorld): Registry => (ww.w.server as unknown as { grants: Registry }).grants;

/** Everything a bridge answers about `x`, where `x` is `kind`: the reads and the calls, then the token spent and the token legs again. */
async function theAnswersAbout(kind: 'usable' | 'closed' | 'absent'): Promise<{ answers: Answered[]; lookups: unknown[][]; ww: WallWorld }> {
  const ww = await wallWorld({ x: kind, maxCalls: 1 });
  const token = kind === 'absent' ? 'made-up-token-0123456789' : await ww.tokenFor(ACCOUNT, 'x', 'hidden-x');
  const who = { entry: 'x', alias: 'xalias', token };
  const door = viaBridge(ww.bridge);
  const answers = await askAbout(door, who, (row) => row >= 3);
  registryReserve(ww).reserve(token, Date.now(), { idleMs: 0, maxUses: 1 });
  answers.push(...(await askAbout(door, who, (row) => row === 9)));
  return { answers, lookups: ww.lookups, ww };
}

test('S5: an entry that exists and is out of scope answers as one that does not exist — status, body, and the lookups made', async () => {
  const absent = await theAnswersAbout('absent');
  try {
    for (const kind of ['usable', 'closed'] as const) {
      const present = await theAnswersAbout(kind);
      try {
        assert.equal(present.answers.length, absent.answers.length);
        present.answers.forEach((answer, i) => assert.deepEqual(answer, absent.answers[i], `${kind}: answer ${i}`));
        assert.deepEqual(present.lookups, absent.lookups, `${kind}: the real lookup was asked the same things`);
        assert.ok(present.lookups.length >= 2, 'and it WAS asked, for an id out of scope (the work is the same)');
        assert.deepEqual(present.ww.w.ran, []);
        assert.deepEqual(present.ww.w.dialogs, []);
      } finally {
        present.ww.dispose();
      }
    }
  } finally {
    absent.ww.dispose();
  }
});

test('S5: the token legs — live and then expired, a real out-of-scope token is as unknown as a made-up one, and neither costs a slot', async () => {
  const ww = await wallWorld({ x: 'usable', maxCalls: 1 });
  try {
    const bridge = viaBridge(ww.bridge);
    const real = await ww.tokenFor(ACCOUNT, 'x', 'hidden-x');
    const ask = (token: string): Promise<{ status: number; body: string }> => send(bridge, { path: '/v1/use/exec', token, body: { command: 'id' } }).then(normalised);
    const unknown = await ask('made-up-token-0123456789');
    assert.equal(unknown.status, 401);
    assert.deepEqual(await ask(real), unknown, 'live');
    const grants = (ww.w.server as unknown as { grants: { reserve(secret: string, now: number, limits: object): unknown; get(secret: string): unknown } }).grants;
    grants.reserve(real, Date.now(), { idleMs: 0, maxUses: 1 });
    assert.deepEqual(await ask(real), unknown, 'expired: the sentence that would say so is the one thing it must not say');
    assert.notEqual(grants.get(real), undefined, 'and the peek did not delete it');
    for (let i = 0; i < 12; i += 1) {
      await ask(real);
      await send(bridge, { path: '/v1/alias/exec', body: { alias: 'xalias', command: 'id' } });
    }
    const afterwards = await send(bridge, { path: '/v1/alias/exec', body: { alias: 'one', command: 'id' } });
    assert.equal(afterwards.status, 200, 'twelve refusals took no slot, so the next call is not refused for lack of one');
  } finally {
    ww.dispose();
  }
});

test('S6: every route a bridge does not serve is refused with its sentence, Connection: close, no dialog, and its hook never called', async () => {
  const ww = await wallWorld();
  try {
    const token = await ww.tokenFor(ACCOUNT, 'e1', 'prod');
    const named = BRIDGE_ROUTES.flatMap((route) =>
      route.decision.served ? [] : [{ method: route.method, path: route.path, code: route.decision.code, message: route.decision.message }],
    );
    const unnamed = [
      { method: 'GET', path: '/v1/use/exec' }, { method: 'POST', path: '/v1/health' }, { method: 'GET', path: '/v1/nope' }, { method: 'GET', path: '/v1/mcp/future' },
    ].map((route) => ({ ...route, code: 'not_supported', message: BRIDGE_NOT_SERVED }));
    assert.ok(named.length >= 20, `the table names ${named.length} refused routes`);
    for (const route of [...named, ...unnamed]) {
      const label = `${route.method} ${route.path}`;
      const body = route.method === 'POST' ? { entry: 'e1', alias: 'one', command: 'id', name: 'n' } : undefined;
      const reply = await send(viaBridge(ww.bridge), { method: route.method as 'GET' | 'POST', path: route.path, body, token });
      assert.deepEqual([reply.status, code(reply), message(reply)], [route.code === 'denied' ? 403 : 404, route.code, route.message], label);
      assert.equal(reply.connection, 'close', label);
    }
    assert.deepEqual(ww.w.dialogs, []);
    assert.deepEqual(ww.w.ran, []);
    assert.deepEqual(ww.forbidden, [], 'the config read and the folder hooks were never called');
    assert.deepEqual([ww.w.trashed, ww.w.created], [[], []], 'nothing was trashed or created');
  } finally {
    ww.dispose();
  }
});

test('S7: the context is the only identity — a body, a query or a header naming another server changes nothing', async () => {
  const ww = await wallWorld();
  try {
    const b = await ww.openOther({ ...CONTEXT_1, bridgeId: 'bridge-2', serverEntityId: 'server-B', serverName: 'other' }, ['e2']);
    const claims = {
      serverEntityId: 'server-B', bridgeId: 'bridge-2', accountId: ACCOUNT, caller: { agent: 'server-B' }, entry: 'e2', alias: 'second', command: 'id',
    };
    const headers = { 'X-Creds-Server': 'server-B', 'X-Creds-Bridge-Id': 'bridge-2' };
    const throughA = viaBridge(ww.bridge, headers);
    const throughB = viaBridge(b);
    const token = await ww.tokenFor(ACCOUNT, 'e2', 'second');
    const attempts: Ask[] = [
      { path: '/v1/mcp/use/exec?serverEntityId=server-B', body: claims },
      { path: '/v1/alias/exec?bridgeId=bridge-2', body: claims },
      { path: '/v1/use/exec?serverEntityId=server-B', body: claims, token },
    ];
    for (const ask of attempts) {
      const refused = await send(throughA, ask);
      assert.equal(refused.status === 200, false, `through A: ${ask.path}`);
    }
    assert.deepEqual(ww.w.ran, [], 'e2 never ran through the bridge scoped to e1');
    for (const ask of attempts) {
      const served = await send(throughB, ask);
      assert.equal(served.status, 200, `through B: ${ask.path} ${served.body}`);
    }
    assert.deepEqual(ranOn(ww), ['e2', 'e2', 'e2']);
    const crossed = await send({ port: b.port, headers: viaBridge(ww.bridge).headers }, { method: 'GET', path: '/v1/health' });
    assert.equal(message(crossed), BRIDGE_WRONG_KEY, 'and A\'s key on B\'s port is just a wrong key');
  } finally {
    ww.dispose();
  }
});

test('S15: dependsOn names only what is listed with it, can is narrowed to use, and a delete is not served', async () => {
  const ww = await wallWorld();
  try {
    const row = async (door: Door): Promise<{ id: string; dependsOn: string[]; can: Record<string, boolean> }> => {
      const rows = (JSON.parse((await send(door, { method: 'GET', path: '/v1/mcp/entries' })).body) as { entries: { id: string; dependsOn: string[]; can: Record<string, boolean> }[] }).entries;
      return rows.find((entry) => entry.id === 'e1') as { id: string; dependsOn: string[]; can: Record<string, boolean> };
    };
    const local = await row(viaMain(ww));
    assert.deepEqual(local.dependsOn, ['leak-target', 'second'], 'positive control: the main port names both');
    assert.equal(local.can.edit, true, 'and shows every permission the folder has');

    assert.deepEqual((await row(viaBridge(ww.bridge))).dependsOn, []);
    await put(ww.scopes, ACCOUNT, 'server1', ['e1', 'e2']);
    const widened = await row(viaBridge(ww.bridge));
    assert.deepEqual(widened.dependsOn, ['second'], 'e2 is in scope, so its name stays');
    assert.deepEqual(widened.can, { use: true, edit: false, create: false, delete: false });
    const del = await send(viaBridge(ww.bridge), { path: '/v1/mcp/delete', body: { entry: 'e1' } });
    assert.equal(code(del), 'not_supported');
    assert.deepEqual(ww.w.trashed, []);
  } finally {
    ww.dispose();
  }
});

test('S20: an entry of another account with the same id is not in scope, and the lookup never searches that account', async () => {
  const ww = await wallWorld({ collide: true });
  try {
    const bridge = viaBridge(ww.bridge);
    ww.nodesAsked.length = 0;
    // Account a2 comes FIRST in the vault and holds an e1 of its own ("foreign").
    const byId = await send(bridge, { path: '/v1/mcp/use/exec', body: { entry: 'e1', command: 'id' } });
    assert.equal(byId.status, 200, 'a1\'s e1 is found although a2 is searched first by the main port');
    assert.match(ww.w.dialogs[0], /prod/, 'the modal names a1\'s entry');
    assert.ok(!ww.w.dialogs[0].includes('foreign'));
    assert.deepEqual([...new Set(ww.nodesAsked)], [ACCOUNT], 'the lookup through the bridge never asked about a2');

    const before = ww.w.ran.length;
    const alias = await send(bridge, { path: '/v1/alias/exec', body: { alias: 'foreign', command: 'id' } });
    assert.deepEqual([alias.status, message(alias)], [404, 'No entry is enabled for the CLI under "foreign".']);
    const foreign = await ww.tokenFor('a2', 'e1', 'foreign');
    const token = await send(bridge, { path: '/v1/use/exec', token: foreign, body: { command: 'id' } });
    assert.deepEqual([token.status, message(token)], [401, 'Unknown or missing grant token.']);
    assert.equal(ww.w.ran.length, before, 'neither a2 e1 ran');
    const only = await send(bridge, { path: '/v1/mcp/use/exec', body: { entry: 'only-a2', command: 'id' } });
    assert.equal(only.status, 404, 'an entry that exists only in a2');
  } finally {
    ww.dispose();
  }
});

test('S13: a grant minted by share, by the alias route or by the MCP door has no bridge key at all', async () => {
  const ww = await wallWorld();
  try {
    const main = viaMain(ww);
    await send(main, { path: '/v1/alias/exec', body: { alias: 'one', command: 'id' } });
    await send(main, { path: '/v1/mcp/use/exec', body: { entry: 'e1', command: 'id' } });
    const registry = (ww.w.server as unknown as { grants: { grants: Map<string, object> } }).grants.grants;
    assert.ok(registry.size >= 3, 'the share, the alias call and the MCP call each minted one');
    for (const grant of registry.values()) {
      assert.equal('bridge' in grant, false);
    }
    const bridged = await send(viaBridge(ww.bridge), { path: '/v1/alias/exec', body: { alias: 'one', command: 'id' } });
    assert.equal(bridged.status, 200);
    assert.equal([...registry.values()].filter((grant) => 'bridge' in grant).length, 1, 'and the bridge door\'s grant is the one that has it');
  } finally {
    ww.dispose();
  }
});

test('S22: the listing is per account — with a2 holding an e1 of its own, a bridge scoped to a1\'s e1 lists a1\'s row once and never the foreign one', async () => {
  const ww = await wallWorld({ collide: true });
  try {
    const local = JSON.parse((await send(viaMain(ww), { method: 'GET', path: '/v1/mcp/entries' })).body) as { entries: { id: string; name: string }[] };
    assert.deepEqual(local.entries.filter((entry) => entry.id === 'e1').map((entry) => entry.name).sort(), ['foreign', 'prod'], 'positive control: the main port lists both, since it lists every account');
    const reply = await send(viaBridge(ww.bridge), { method: 'GET', path: '/v1/mcp/entries' });
    const listed = (JSON.parse(reply.body) as { entries: { id: string; name: string }[] }).entries;
    assert.deepEqual(listed.map((entry) => [entry.id, entry.name]), [['e1', 'prod']], 'e1 once, named prod');
    assert.ok(!reply.body.includes('foreign'), 'the foreign entry is nowhere in the body');
    assert.deepEqual([...new Set(ww.listed)], [ACCOUNT], 'and the supplier was asked about a1 only');
    assert.ok(ww.listed.length >= 1, 'it WAS asked: the listing came from the per-account supplier');
  } finally {
    ww.dispose();
  }
});

test('S23: the snippet is per account — e1 answers a1\'s config, and a world where only a2 holds a config e1 answers the not-found body', async () => {
  const ww = await wallWorld({ collide: true });
  try {
    const reply = await send(viaBridge(ww.bridge), { method: 'GET', path: '/v1/mcp/config-snippet?id=e1&language=shell' });
    const body = JSON.parse(reply.body) as { error?: string; snippet?: { code: string } };
    assert.equal(body.error, undefined, 'a1\'s e1 is a config in scope');
    assert.ok(body.snippet !== undefined || (JSON.parse(reply.body) as { languages: unknown[] }).languages.length > 0, 'positive control: a snippet or the catalog is served');
    assert.ok(!reply.body.includes('foreign'), 'and nothing of the foreign entry');
    assert.deepEqual([...new Set(ww.configsAsked.map(([account]) => account))], [ACCOUNT], 'the supplier was asked about a1 only');
    assert.ok(ww.configsAsked.length >= 1, 'and it WAS asked');
  } finally {
    ww.dispose();
  }
  const only = await wallWorld({ collide: true, a1Config: false });
  try {
    const reply = await send(viaBridge(only.bridge), { method: 'GET', path: '/v1/mcp/config-snippet?id=e1&language=shell' });
    assert.deepEqual(JSON.parse(reply.body), configSnippetResult(undefined, undefined, undefined), 'a2 holds the only config e1, and a bridge of a1 is told there is none');
    assert.ok(!reply.body.includes('foreign'));
  } finally {
    only.dispose();
  }
});

test('S24: a scope narrowed while the listing is being read is the scope the listing is cut by', async () => {
  const ww = await wallWorld({ holdListing: true });
  try {
    const request = send(viaBridge(ww.bridge), { method: 'GET', path: '/v1/mcp/entries' });
    await until(ww.listing.asked, 'the listing to be asked for');
    await put(ww.scopes, ACCOUNT, 'server1', []);
    ww.listing.release();
    const reply = await request;
    assert.deepEqual((JSON.parse(reply.body) as { entries: unknown[] }).entries, [], 'the scope was read after the listing came back: nothing of e1 is shown');
    ww.listing.release();
    await put(ww.scopes, ACCOUNT, 'server1', ['e1']);
    const widened = await send(viaBridge(ww.bridge), { method: 'GET', path: '/v1/mcp/entries' });
    assert.deepEqual((JSON.parse(widened.body) as { entries: { id: string }[] }).entries.map((entry) => entry.id), ['e1'], 'positive control: the same listing shows e1 once the scope holds it');
  } finally {
    ww.dispose();
  }
});
