import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BridgeContext } from '../bridgeContext';
import type { BridgeWallSource } from '../bridgeScope';
import type { McpUseLookup } from '../brokerRequests';
import type { McpEntry } from '../mcpEntries';
import { loadBridgeModules, memento, present } from './bridgeModules';

/**
 * The scope store and the door view (E1.3, S13 and S17, and the view's own behaviour).
 *
 * <p>Pure, driven over fakes: what these show is what each wrapped function does with a scope read at the moment
 * it is called. The real broker is in `bridgeScopeWalk.test.ts`.</p>
 */

const M = loadBridgeModules();
const { BridgeScopes, MAX_SCOPES, MAX_SCOPE_ENTRIES, SCOPES_KEY, scopeKey, OPEN_VIEW, CLOSED_VIEW, doorView } = M.scope;

const A1 = 'a1';
const S1 = 'server1';
const CTX: BridgeContext = { bridgeId: 'b1', accountId: A1, serverEntityId: S1, serverName: 'prod server', target: '', remoteOs: undefined };

/** A scope over a fresh store, holding `entries` for (a1, server1). */
async function wallWith(entries: string[], quiet = false): Promise<BridgeWallSource> {
  const scopes = new BridgeScopes(memento(), () => 1_000);
  await scopes.set(A1, S1, entries, quiet);
  return { scopes, storedTexts: () => [], refSource: { accounts: () => [], entities: () => [] } };
}

test('S17: a server with no record has an empty scope that admits nothing and is not quiet', () => {
  const scope = new BridgeScopes(memento()).read(A1, S1);
  assert.equal(scope.entries.size, 0);
  assert.equal(scope.quiet, false);
  assert.equal(scope.admits(A1, 'e1'), false);
});

test('S17: a malformed record, in any of its parts, is an empty scope with quiet off', () => {
  const good = { entries: ['e1'], quiet: true, at: 1 };
  const bad: unknown[] = [
    'junk', 5, null, [], { entries: 'e1', quiet: false, at: 1 }, { entries: [1, 2], quiet: false, at: 1 },
    { entries: ['e1', 7], quiet: false, at: 1 }, { ...good, quiet: 'yes' }, { ...good, at: 'now' }, { entries: ['e1'], quiet: true },
  ];
  for (const record of bad) {
    const store = memento();
    void store.update(SCOPES_KEY, { [scopeKey(A1, S1)]: record });
    const scope = new BridgeScopes(store).read(A1, S1);
    assert.equal(scope.entries.size, 0, JSON.stringify(record));
    assert.equal(scope.quiet, false, JSON.stringify(record));
  }
  for (const whole of ['junk', 7, null, [good]]) {
    const store = memento();
    void store.update(SCOPES_KEY, whole);
    assert.equal(new BridgeScopes(store).read(A1, S1).entries.size, 0, `a store holding ${JSON.stringify(whole)}`);
  }
  const store = memento();
  void store.update(SCOPES_KEY, { [scopeKey(A1, S1)]: good });
  assert.deepEqual([...new BridgeScopes(store).read(A1, S1).entries], ['e1'], 'positive control: the well-formed record reads');
});

test('S17: admits compares the account as well as the entry, and two accounts with one server id do not mix', async () => {
  const scopes = new BridgeScopes(memento(), () => 1);
  await scopes.set(A1, S1, ['e1'], false);
  const mine = scopes.read(A1, S1);
  assert.equal(mine.admits(A1, 'e1'), true);
  assert.equal(mine.admits('a2', 'e1'), false, 'the same entity id in another account is not in scope');
  assert.equal(mine.admits(A1, 'e2'), false);
  assert.equal(scopes.read('a2', S1).entries.size, 0, 'another account\'s record of the same server id is another record');
  assert.equal(scopes.read(A1, 'server2').entries.size, 0, 'and another server is another record');
});

test('S17: scopeKey is injective across the colon, as stampKey is', () => {
  assert.notEqual(scopeKey('a:b', 'c'), scopeKey('a', 'b:c'));
  assert.equal(scopeKey('a1', 's'), '2:a1:s');
});

test('S17: read is fresh — a second store over the same memento sees a write the first made, and a scope already read does not move', async () => {
  const store = memento();
  const first = new BridgeScopes(store, () => 1);
  const second = new BridgeScopes(store, () => 2);
  const before = second.read(A1, S1);
  await first.set(A1, S1, ['e1'], true);
  assert.deepEqual([...second.read(A1, S1).entries], ['e1']);
  assert.equal(second.read(A1, S1).quiet, true);
  assert.equal(before.admits(A1, 'e1'), false, 'a Scope is a snapshot; the next read is the fresh one');
  await first.set(A1, S1, [], false);
  assert.equal(second.read(A1, S1).admits(A1, 'e1'), false, 'narrowing is seen at once');
});

test('S17: forget removes one record and leaves the others', async () => {
  const scopes = new BridgeScopes(memento(), () => 1);
  await scopes.set(A1, S1, ['e1'], false);
  await scopes.set(A1, 'server2', ['e2'], false);
  await scopes.forget(A1, S1);
  assert.equal(scopes.read(A1, S1).entries.size, 0);
  assert.deepEqual([...scopes.read(A1, 'server2').entries], ['e2']);
});

test('S17: at most 64 records; the oldest `at` is pruned, never the one just written', async () => {
  let clock = 0;
  const scopes = new BridgeScopes(memento(), () => (clock += 1));
  for (let i = 0; i < MAX_SCOPES; i += 1) {
    await scopes.set(A1, `s${i}`, [`e${i}`], false);
  }
  assert.equal(scopes.read(A1, 's0').admits(A1, 'e0'), true, 'a full store still holds the first');
  await scopes.set(A1, 'newest', ['e-new'], false);
  assert.equal(scopes.read(A1, 's0').entries.size, 0, 'the oldest is gone');
  assert.equal(scopes.read(A1, 's1').admits(A1, 'e1'), true, 'the second oldest stays');
  assert.equal(scopes.read(A1, 'newest').admits(A1, 'e-new'), true);
  await scopes.set(A1, 's1', ['e1', 'again'], false);
  assert.equal(scopes.read(A1, 's1').admits(A1, 'again'), true, 'rewriting a record does not prune');
  assert.equal(scopes.read(A1, 's2').admits(A1, 'e2'), true);
});

test('S17: a record written at the same instant as the oldest is still the one kept', async () => {
  const scopes = new BridgeScopes(memento(), () => 5);
  for (let i = 0; i < MAX_SCOPES; i += 1) {
    await scopes.set(A1, `s${i}`, [`e${i}`], false);
  }
  await scopes.set(A1, 'newest', ['e-new'], false);
  assert.equal(scopes.read(A1, 'newest').admits(A1, 'e-new'), true, 'a tie never prunes the record just written');
});

test('S17: a scope of 256 entries is written; 257 are refused and nothing is stored', async () => {
  const store = memento();
  const scopes = new BridgeScopes(store, () => 1);
  const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => `e${i}`);
  await scopes.set(A1, S1, ids(MAX_SCOPE_ENTRIES), false);
  assert.equal(scopes.read(A1, S1).entries.size, MAX_SCOPE_ENTRIES);
  await assert.rejects(scopes.set(A1, S1, ids(MAX_SCOPE_ENTRIES + 1), false), /256/);
  assert.equal(scopes.read(A1, S1).entries.size, MAX_SCOPE_ENTRIES, 'the refused write left the old record');
});

test('S17: writes queue — two sets in flight at once both land, even when the store answers late', async () => {
  const scopes = new BridgeScopes(memento(true), () => 1);
  await Promise.all([scopes.set(A1, 's1', ['x'], false), scopes.set(A1, 's2', ['y'], false), scopes.set(A1, 's3', ['z'], false)]);
  assert.deepEqual(['s1', 's2', 's3'].map((s) => [...scopes.read(A1, s).entries][0]), ['x', 'y', 'z']);
});

test('S17: a record that holds an entry twice reads as a set', async () => {
  const scopes = new BridgeScopes(memento(), () => 1);
  await scopes.set(A1, S1, ['e1', 'e1', 'e2'], false);
  assert.equal(scopes.read(A1, S1).entries.size, 2);
});

test('S13: OPEN_VIEW is the identity — the existing doors run the code they ran before', () => {
  const resolveUse = (): McpUseLookup => undefined;
  const resolveAlias = (): undefined => undefined;
  const sources = { aliases: () => [] };
  assert.equal(OPEN_VIEW.bridge, undefined);
  assert.equal(OPEN_VIEW.resolveUse(resolveUse), resolveUse);
  assert.equal(OPEN_VIEW.resolveAlias(resolveAlias), resolveAlias);
  assert.equal(OPEN_VIEW.resolveUse(undefined), undefined);
  assert.equal(OPEN_VIEW.sources(sources, resolveAlias), sources);
  assert.equal(OPEN_VIEW.grantFor(), undefined);
});

test('S13: OPEN_VIEW.grantForToken answers exactly what grantForToken answers', () => {
  const grants = new M.grants.GrantRegistry();
  const token = grants.mint('a1', 'e1', 'prod', 'ssh');
  const limits = { idleMs: 0, maxUses: 0 };
  for (const header of [`Bearer ${token.secret}`, 'Bearer nope', undefined, 'Basic x']) {
    assert.deepEqual(OPEN_VIEW.grantForToken(header, grants, limits), M.requests.grantForToken(header, grants, limits), String(header));
  }
});

test('doorView: off a bridge it is OPEN_VIEW whatever wall it is given', async () => {
  assert.equal(doorView(undefined, undefined), OPEN_VIEW);
  assert.equal(doorView(undefined, await wallWith(['e1'])), OPEN_VIEW);
});

const E1_TARGET = { accountId: A1, entityId: 'e1', entityName: 'prod', kind: 'ssh' };

test('CLOSED_VIEW: a bridge with no wall answers no lookup', () => {
  assert.equal(doorView(CTX, undefined), CLOSED_VIEW);
  const usable = (): McpUseLookup => ({ kind: 'usable', target: E1_TARGET });
  assert.equal(present(CLOSED_VIEW.resolveUse(usable), 'a resolver')('e1', 'exec'), undefined);
  assert.equal(present(CLOSED_VIEW.resolveAlias(() => E1_TARGET), 'a resolver')('prod'), undefined);
});

test('CLOSED_VIEW: a bridge with no wall knows no token', () => {
  const grants = new M.grants.GrantRegistry();
  const token = grants.mint(A1, 'e1', 'prod', 'ssh');
  const answer = CLOSED_VIEW.grantForToken(`Bearer ${token.secret}`, grants, { idleMs: 0, maxUses: 0 });
  assert.deepEqual(answer, { ok: false, message: M.requests.UNKNOWN_TOKEN });
});

test('CLOSED_VIEW: a bridge with no wall lists nothing', async () => {
  const real = {
    aliases: () => [{ name: 'prod', kind: 'ssh' }],
    mcpEntries: () => Promise.resolve([entry('e1', 'prod')]),
    visibleConfig: () => ({ id: 'e1' }) as never,
    folders: () => [{ id: 'f' }] as never,
  };
  const read = CLOSED_VIEW.sources(real, () => E1_TARGET);
  assert.deepEqual(present(read.aliases, 'aliases')(), []);
  assert.deepEqual(await present(read.mcpEntries, 'entries')(), []);
  assert.equal(present(read.visibleConfig, 'configs')('e1'), undefined);
  assert.deepEqual(present(read.folders, 'folders')(), []);
});

function entry(id: string, name: string, extra: Partial<McpEntry> = {}): McpEntry {
  return {
    id, name, kind: 'ssh', folder: 'Agents', hasPassword: true, hasPrivateKey: false, hasNotes: false, hasTotp: false,
    dependsOn: [], can: { use: true, edit: true, create: true, delete: true }, ...extra,
  };
}

type Server = { accountId: string; serverEntityId: string };

/** A real lookup's arms, scripted by id, recording how it was asked. */
function scriptedLookup(): { real: (id: string, action: string, server?: Server) => McpUseLookup; calls: unknown[][] } {
  const calls: unknown[][] = [];
  const target = (accountId: string, entityId: string) => ({ accountId, entityId, entityName: entityId, kind: 'ssh' });
  const answers: Record<string, McpUseLookup> = {
    in: { kind: 'usable', target: target(A1, 'in'), preConsented: true, rungs: 'quiet' },
    out: { kind: 'usable', target: target(A1, 'out'), preConsented: true, rungs: 'quiet' },
    'closed-in': { kind: 'closed', entityName: 'in', needed: 'use' },
    'closed-out': { kind: 'closed', entityName: 'out', needed: 'use' },
    // Same id as an entry in scope, other account: the narrowing should never let it in, and `admits` must not either.
    'in-other-account': { kind: 'usable', target: target('a2', 'in-other-account') },
  };
  return {
    calls,
    real: (id, action, server) => {
      calls.push([id, action, server]);
      return answers[id];
    },
  };
}

function kindOf(found: McpUseLookup): string {
  return found === undefined ? 'nothing' : found.kind;
}

test('resolveUse: the real lookup runs for EVERY id with the bridge\'s account, and the scope decides afterwards', async () => {
  const view = doorView(CTX, await wallWith(['in', 'closed-in', 'in-other-account']));
  const { real, calls } = scriptedLookup();
  const resolve = present(view.resolveUse(real), 'a resolver');
  const ids = ['in', 'out', 'closed-in', 'closed-out', 'gone', 'in-other-account'];
  const answers = ids.map((id) => kindOf(resolve(id, 'exec')));
  assert.deepEqual(calls.map((call) => call[0]), ids, 'one real lookup per id, in scope or not, and none skipped');
  for (const call of calls) {
    assert.deepEqual(call[2], { accountId: A1, serverEntityId: S1 }, 'narrowed to the context\'s account by the context');
  }
  // usable in scope; out of scope nothing; closed in scope names the switch; closed out of scope would say the entry exists;
  // nothing at all; and in scope by id but in another account.
  assert.deepEqual(answers, ['usable', 'nothing', 'closed', 'nothing', 'nothing', 'nothing']);
});

test('resolveUse: a usable answer is never quiet on a bridge, whatever the vault said', async () => {
  const view = doorView(CTX, await wallWith(['in']));
  const found = present(view.resolveUse(scriptedLookup().real), 'a resolver')('in', 'exec');
  assert.equal(found?.kind, 'usable');
  assert.deepEqual(found, { kind: 'usable', target: { accountId: A1, entityId: 'in', entityName: 'in', kind: 'ssh' }, preConsented: false, rungs: '' });
});

test('resolveUse: the scope is read when the function is called, not when the view is built', async () => {
  const wall = await wallWith(['in']);
  const resolve = present(doorView(CTX, wall).resolveUse(scriptedLookup().real), 'a resolver');
  assert.equal(kindOf(resolve('in', 'exec')), 'usable');
  await wall.scopes.set(A1, S1, [], false);
  assert.equal(kindOf(resolve('in', 'exec')), 'nothing', 'narrowed since: refused at the next call');
  await wall.scopes.set(A1, S1, ['in'], false);
  assert.equal(kindOf(resolve('in', 'exec')), 'usable');
});

test('resolveUse: with no lookup there is none', async () => {
  assert.equal(doorView(CTX, await wallWith(['in'])).resolveUse(undefined), undefined);
});

test('resolveAlias: a target is served only when its account and entry are both in scope', async () => {
  const wall = await wallWith(['in']);
  const view = doorView(CTX, wall);
  const targets: Record<string, Target> = {
    mine: { accountId: A1, entityId: 'in', entityName: 'in', kind: 'ssh' },
    elsewhere: { accountId: A1, entityId: 'out', entityName: 'out', kind: 'ssh' },
    'other-account': { accountId: 'a2', entityId: 'in', entityName: 'in', kind: 'ssh' },
  };
  const resolve = present(view.resolveAlias((name) => targets[name]), 'a resolver');
  assert.equal(resolve('mine')?.entityId, 'in');
  assert.equal(resolve('elsewhere'), undefined);
  assert.equal(resolve('other-account'), undefined, 'the same entity id in another account');
  assert.equal(resolve('nobody'), undefined);
  assert.equal(view.resolveAlias(undefined), undefined);
});

type Target = { accountId: string; entityId: string; entityName: string; kind: string };

test('grantFor: the context and the scope\'s switch as it is NOW', async () => {
  const wall = await wallWith(['in'], false);
  const view = doorView(CTX, wall);
  assert.deepEqual(view.grantFor(), { context: CTX, quiet: false });
  await wall.scopes.set(A1, S1, ['in'], true);
  assert.deepEqual(view.grantFor(), { context: CTX, quiet: true });
  assert.equal(present(view.grantFor(), 'a grant').context, CTX, 'the very context the door handed over');
});

test('grantForToken: an out-of-scope token is unknown, live or expired, and is not looked up', async () => {
  const wall = await wallWith(['in']);
  const view = doorView(CTX, wall);
  const grants = new M.grants.GrantRegistry();
  const mine = grants.mint(A1, 'in', 'in', 'ssh');
  const theirs = grants.mint(A1, 'out', 'out', 'ssh');
  const foreign = grants.mint('a2', 'in', 'in', 'ssh');
  const limits = { idleMs: 0, maxUses: 1 };
  const unknown = { ok: false, message: M.requests.UNKNOWN_TOKEN };

  assert.equal(view.grantForToken(`Bearer ${mine.secret}`, grants, limits).ok, true);
  assert.deepEqual(view.grantForToken(`Bearer ${theirs.secret}`, grants, limits), unknown);
  assert.deepEqual(view.grantForToken(`Bearer ${foreign.secret}`, grants, limits), unknown, 'the same entity id, another account');
  assert.deepEqual(view.grantForToken('Bearer made-up', grants, limits), unknown);
  assert.deepEqual(view.grantForToken(undefined, grants, limits), unknown);

  grants.reserve(theirs.secret, Date.now(), limits);
  assert.deepEqual(view.grantForToken(`Bearer ${theirs.secret}`, grants, limits), unknown, 'spent AND out of scope: still just unknown');
  assert.notEqual(grants.get(theirs.secret), undefined, 'and it was never looked up, so the registry did not delete it either');
});

test('grantForToken: an in-scope token that ran out says so, which is the real function\'s answer', async () => {
  const view = doorView(CTX, await wallWith(['in']));
  const grants = new M.grants.GrantRegistry();
  const mine = grants.mint(A1, 'in', 'in', 'ssh');
  const limits = { idleMs: 0, maxUses: 1 };
  grants.reserve(mine.secret, Date.now(), limits);
  const answer = view.grantForToken(`Bearer ${mine.secret}`, grants, limits);
  assert.deepEqual(answer, { ok: false, message: 'This grant expired: it reached its limit of 1 calls. Ask the person for a fresh Share with Claude Code.' });
});

test('sources.aliases: a name is listed only when it resolves to a target in scope; no resolver, no names', async () => {
  const view = doorView(CTX, await wallWith(['in']));
  const targets: Record<string, Target> = {
    mine: { accountId: A1, entityId: 'in', entityName: 'in', kind: 'ssh' },
    leaky: { accountId: A1, entityId: 'out', entityName: 'out', kind: 'ssh' },
  };
  const real = { aliases: () => [{ name: 'mine', kind: 'ssh' }, { name: 'leaky', kind: 'ssh' }, { name: 'ghost', kind: 'ssh' }] };
  const listed = (sources: ReturnType<typeof view.sources>): unknown => present(sources.aliases, 'aliases')();
  assert.deepEqual(listed(view.sources(real, (name) => targets[name])), [{ name: 'mine', kind: 'ssh' }]);
  assert.deepEqual(listed(view.sources(real, undefined)), []);
  assert.deepEqual(listed(view.sources({}, (name) => targets[name])), []);
});

test('sources.mcpEntries: kept rows are those in scope, can is narrowed to use, dependsOn names only kept rows', async () => {
  const view = doorView(CTX, await wallWith(['in', 'also']));
  const rows = [
    entry('in', 'prod', { dependsOn: ['leak-target', 'friend', 'ghost'] }),
    entry('out', 'leak-target'),
    entry('also', 'friend', { can: { use: false, edit: true, create: false, delete: true } }),
  ];
  const list = present(view.sources({ mcpEntries: () => Promise.resolve(rows) }, undefined).mcpEntries, 'entries');
  const listed = await list();
  assert.deepEqual(listed.map((row) => row.id), ['in', 'also']);
  assert.deepEqual(listed[0].can, { use: true, edit: false, create: false, delete: false });
  assert.deepEqual(listed[0].dependsOn, ['friend'], 'the name of an entry out of scope is not given away');
  assert.deepEqual(listed[1].can, { use: false, edit: false, create: false, delete: false }, 'use is the vault\'s own');
  assert.equal(rows[0].can.edit, true, 'the source rows are not mutated');
  assert.deepEqual(rows[0].dependsOn, ['leak-target', 'friend', 'ghost']);
  assert.deepEqual(await present(view.sources({}, undefined).mcpEntries, 'entries')(), []);
});

test('sources.visibleConfig: a config only in scope, and the real supplier is not asked about the rest', async () => {
  const wall = await wallWith(['in']);
  const asked: string[] = [];
  const read = doorView(CTX, wall).sources({ visibleConfig: (id) => (asked.push(id), { id } as never) }, undefined);
  const config = present(read.visibleConfig, 'configs');
  assert.deepEqual(config('in'), { id: 'in' });
  assert.equal(config('out'), undefined);
  assert.deepEqual(asked, ['in']);
  await wall.scopes.set(A1, S1, [], false);
  assert.equal(config('in'), undefined, 'narrowed since the view was built');
});

test('sources.folders: no folders at all', async () => {
  const read = doorView(CTX, await wallWith(['in'])).sources({ folders: () => [{ id: 'f' }] as never }, undefined);
  assert.deepEqual(present(read.folders, 'folders')(), []);
});
