import * as assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import type { BridgeContext } from '../bridgeContext';
import type { BridgeScopes as BridgeScopesT, BridgeWallSource, ScopeFile } from '../bridgeScope';
import { readRouteBody } from '../brokerReadRoutes';
import type { McpUseLookup } from '../brokerRequests';
import { accountOnlyVault } from '../mcpAccountVault';
import type { McpEntry } from '../mcpEntries';
import { NO_SUPPLIERS, SCOPES_TEST_DIR, loadBridgeModules, memoryScopeFs, memoryScopes, present, put } from './bridgeModules';

/**
 * The scope store and the door view (E1.3, S13 and S17, and the view's own behaviour).
 *
 * <p>Pure, driven over fakes: what these show is what each wrapped function does with a scope read at the moment
 * it is called. The real broker is in `bridgeScopeWalk.test.ts`.</p>
 */

const M = loadBridgeModules();
const { MAX_SCOPES, MAX_SCOPE_ENTRIES, NO_SCOPE, SCOPE_STALE, SCOPE_UNREADABLE, scopeKey, OPEN_VIEW, CLOSED_VIEW, doorView } = M.scope;

const A1 = 'a1';
const S1 = 'server1';
const CTX: BridgeContext = { bridgeId: 'b1', accountId: A1, serverEntityId: S1, serverName: 'prod server', target: '', remoteOs: undefined };

/** A scope over a fresh store, holding `entries` for (a1, server1). */
async function wallWith(entries: string[], quiet = false): Promise<BridgeWallSource> {
  const scopes = memoryScopes(M, () => 1_000);
  await put(scopes, A1, S1, entries, quiet);
  return { scopes, storedTexts: () => [], refSource: { accounts: () => [], entities: () => [] }, ...NO_SUPPLIERS };
}

test('S17: a server with no file has an empty scope at NO_SCOPE that admits nothing and is not quiet', () => {
  const scope = memoryScopes(M).read(A1, S1);
  assert.equal(scope.entries.size, 0);
  assert.equal(scope.quiet, false);
  assert.equal(scope.revision, NO_SCOPE);
  assert.equal(scope.admits(A1, 'e1'), false);
});

/** The file a well-behaved writer leaves for (a1, server1), as text. */
const GOOD: ScopeFile = { v: 1, accountId: A1, serverEntityId: S1, entries: ['e1'], quiet: true, revision: 'rev-3', at: 1 };

/** The scopes over a disk holding `text` as the file of (a1, server1). */
function holding(text: string): BridgeScopesT {
  const io = memoryScopeFs();
  io.held.set(`${SCOPES_TEST_DIR}/${M.scope.scopeFileName(A1, S1)}`, text);
  return memoryScopes(M, () => 1, io);
}

test('S17: a malformed file, in any of its parts, is an empty scope at NO_SCOPE with quiet off', () => {
  const bad: unknown[] = [
    'junk', 5, null, [], { ...GOOD, entries: 'e1' }, { ...GOOD, entries: [1, 2] }, { ...GOOD, entries: ['e1', 7] }, { ...GOOD, quiet: 'yes' },
    { ...GOOD, at: 'now' }, { ...GOOD, v: 2 }, { ...GOOD, v: undefined }, { ...GOOD, revision: 1 }, { ...GOOD, revision: '' }, { ...GOOD, revision: NO_SCOPE }, { ...GOOD, revision: undefined }, { ...GOOD, revision: null },
    { ...GOOD, accountId: undefined }, { ...GOOD, serverEntityId: 7 },
    { ...GOOD, accountId: 'a2' }, { ...GOOD, serverEntityId: 'server2' },
  ];
  for (const record of bad) {
    for (const text of [JSON.stringify(record), `${JSON.stringify(record)}{`]) {
      const scope = holding(text).read(A1, S1);
      assert.equal(scope.entries.size, 0, text);
      assert.equal(scope.quiet, false, text);
      assert.equal(scope.revision, NO_SCOPE, text);
    }
  }
  assert.equal(holding('').read(A1, S1).revision, NO_SCOPE, 'an empty file');
  const control = holding(JSON.stringify(GOOD)).read(A1, S1);
  assert.deepEqual([...control.entries], ['e1'], 'positive control: the well-formed file reads');
  assert.equal(control.quiet, true);
  assert.equal(control.revision, 'rev-3');
});

test('S17: a file moved by hand to another server\'s name admits nothing for that server (the file names whose it is)', () => {
  const io = memoryScopeFs();
  io.held.set(`${SCOPES_TEST_DIR}/${M.scope.scopeFileName(A1, 'server2')}`, JSON.stringify(GOOD));
  const scopes = memoryScopes(M, () => 1, io);
  assert.equal(scopes.read(A1, 'server2').entries.size, 0, 'GOOD names server1; at the name of server2 it is nobody\'s');
  assert.equal(scopes.read(A1, 'server2').revision, NO_SCOPE);
  io.held.set(`${SCOPES_TEST_DIR}/${M.scope.scopeFileName('a2', S1)}`, JSON.stringify(GOOD));
  assert.equal(scopes.read('a2', S1).entries.size, 0, 'and at another account\'s name');
});

test('S17: admits compares the account as well as the entry, and two accounts with one server id do not mix', async () => {
  const scopes = memoryScopes(M, () => 1);
  await put(scopes, A1, S1, ['e1']);
  const mine = scopes.read(A1, S1);
  assert.equal(mine.admits(A1, 'e1'), true);
  assert.equal(mine.admits('a2', 'e1'), false, 'the same entity id in another account is not in scope');
  assert.equal(mine.admits(A1, 'e2'), false);
  assert.equal(scopes.read('a2', S1).entries.size, 0, 'another account\'s file of the same server id is another file');
  assert.equal(scopes.read(A1, 'server2').entries.size, 0, 'and another server is another file');
});

test('S17: scopeKey is injective across the colon, as stampKey is, and the file name is its hash', () => {
  assert.notEqual(scopeKey('a:b', 'c'), scopeKey('a', 'b:c'));
  assert.equal(scopeKey('a1', 's'), '2:a1:s');
  const name = M.scope.scopeFileName(A1, S1);
  assert.match(name, /^[0-9a-f]{64}\.json$/, 'a hash and an extension: no character a Windows file name refuses');
  assert.notEqual(name, M.scope.scopeFileName('a:b', 'c'));
  assert.notEqual(M.scope.scopeFileName('a:b', 'c'), M.scope.scopeFileName('a', 'b:c'));
});

test('S17: set answers the revision it wrote, a fresh id every time, and a copy at the wrong revision is refused with the one sentence and changes nothing', async () => {
  const io = memoryScopeFs();
  const scopes = memoryScopes(M, () => 1, io);
  const first = await scopes.set(A1, S1, ['e1'], false, NO_SCOPE);
  const second = await scopes.set(A1, S1, ['e1', 'e2'], true, first);
  assert.match(first, /^[0-9a-f-]{36}$/, 'a random id, not a counter');
  assert.notEqual(second, first);
  assert.notEqual(first, NO_SCOPE);
  const before = [...io.held.entries()];
  await assert.rejects(scopes.set(A1, S1, [], false, NO_SCOPE), { message: SCOPE_STALE }, 'a copy of the absent scope, on a scope that exists');
  await assert.rejects(scopes.set(A1, S1, [], false, first), { message: SCOPE_STALE }, 'a copy one behind');
  await assert.rejects(scopes.set(A1, S1, [], false, 'never-written'), { message: SCOPE_STALE }, 'and one that was never written');
  assert.deepEqual([...io.held.entries()], before, 'the file is as it was');
  assert.equal(scopes.read(A1, S1).revision, second);
  assert.match(SCOPE_STALE, /^The scope of this Remote Bridge changed in another window\. Look at it again, then save\.$/);
});

test('S17: NO_SCOPE is never written to a file, and the revision on disk is the one set answered', async () => {
  const io = memoryScopeFs();
  const scopes = memoryScopes(M, () => 1, io);
  const revision = await scopes.set(A1, S1, ['e1'], false, NO_SCOPE);
  const stored = JSON.parse([...io.held.values()][0]) as { revision: string };
  assert.equal(stored.revision, revision);
  assert.notEqual(stored.revision, NO_SCOPE);
  assert.equal(M.scope.NO_SCOPE, 'absent');
});

test('S17: a corrupt file at the name is NOT replaced by `set` (the strict read, parent §4.2) — it reads as no scope, `set` refuses it, and Close then lets a set through', async () => {
  const scopes = holding('{ not json');
  await assert.rejects(scopes.set(A1, S1, ['e1'], false, NO_SCOPE), { message: SCOPE_UNREADABLE });
  assert.equal(scopes.read(A1, S1).revision, NO_SCOPE);
  await scopes.forget(A1, S1);
  const revision = await scopes.set(A1, S1, ['e1'], false, NO_SCOPE);
  assert.equal(scopes.read(A1, S1).revision, revision);
  assert.deepEqual([...scopes.read(A1, S1).entries], ['e1']);
});

test('S17: read is fresh — a second BridgeScopes over the same directory sees a write the first made, and a scope already read does not move', async () => {
  const io = memoryScopeFs();
  const first = memoryScopes(M, () => 1, io);
  const second = memoryScopes(M, () => 2, io);
  const before = second.read(A1, S1);
  await put(first, A1, S1, ['e1'], true);
  assert.deepEqual([...second.read(A1, S1).entries], ['e1']);
  assert.equal(second.read(A1, S1).quiet, true);
  assert.equal(before.admits(A1, 'e1'), false, 'a Scope is a snapshot; the next read is the fresh one');
  await put(first, A1, S1, []);
  assert.equal(second.read(A1, S1).admits(A1, 'e1'), false, 'narrowing is seen at once');
});

test('S17: forget removes one file and leaves the others', async () => {
  const scopes = memoryScopes(M, () => 1);
  await put(scopes, A1, S1, ['e1']);
  await put(scopes, A1, 'server2', ['e2']);
  await scopes.forget(A1, S1);
  assert.equal(scopes.read(A1, S1).entries.size, 0);
  assert.equal(scopes.read(A1, S1).revision, NO_SCOPE, 'a forgotten scope is at NO_SCOPE again');
  assert.deepEqual([...scopes.read(A1, 'server2').entries], ['e2']);
  await scopes.forget(A1, S1);
});

test('S17: at most 64 files; the oldest `at` is pruned, never the one just written', async () => {
  let clock = 0;
  const scopes = memoryScopes(M, () => (clock += 1));
  for (let i = 0; i < MAX_SCOPES; i += 1) {
    await put(scopes, A1, `s${i}`, [`e${i}`]);
  }
  assert.equal(scopes.read(A1, 's0').admits(A1, 'e0'), true, 'a full store still holds the first');
  await put(scopes, A1, 'newest', ['e-new']);
  assert.equal(scopes.read(A1, 's0').entries.size, 0, 'the oldest is gone');
  assert.equal(scopes.read(A1, 's1').admits(A1, 'e1'), true, 'the second oldest stays');
  assert.equal(scopes.read(A1, 'newest').admits(A1, 'e-new'), true);
  await put(scopes, A1, 's1', ['e1', 'again']);
  assert.equal(scopes.read(A1, 's1').admits(A1, 'again'), true, 'rewriting a file does not prune');
  assert.equal(scopes.read(A1, 's2').admits(A1, 'e2'), true);
});

test('S17: the file just written survives even when it is the oldest of all (a clock that stepped back)', async () => {
  let clock = 1_000;
  const scopes = memoryScopes(M, () => clock);
  for (let i = 0; i < MAX_SCOPES; i += 1) {
    clock += 1;
    await put(scopes, A1, `s${i}`, [`e${i}`]);
  }
  clock = 1;
  await put(scopes, A1, 'newest', ['e-new']);
  assert.equal(scopes.read(A1, 'newest').admits(A1, 'e-new'), true, 'its `at` is the smallest, and it is still there');
  assert.equal(scopes.read(A1, 's0').entries.size, 0, 'the oldest of the OTHERS went instead');
});

test('S17: a file written at the same instant as the oldest is still the one kept', async () => {
  const scopes = memoryScopes(M, () => 5);
  for (let i = 0; i < MAX_SCOPES; i += 1) {
    await put(scopes, A1, `s${i}`, [`e${i}`]);
  }
  await put(scopes, A1, 'newest', ['e-new']);
  assert.equal(scopes.read(A1, 'newest').admits(A1, 'e-new'), true, 'a tie never prunes the file just written');
});

test('S17: a file that does not parse is the oldest of all, and a `.tmp` left behind is not listed, so it is never counted', async () => {
  const io = memoryScopeFs();
  let clock = 10;
  const scopes = memoryScopes(M, () => (clock += 1), io);
  io.held.set(`${SCOPES_TEST_DIR}/zz-junk.json`, 'junk');
  io.held.set(`${SCOPES_TEST_DIR}/${M.scope.scopeFileName(A1, 's0')}.1234.tmp`, 'half a write');
  for (let i = 0; i < MAX_SCOPES - 1; i += 1) {
    await put(scopes, A1, `s${i}`, [`e${i}`]);
  }
  assert.ok(io.held.has(`${SCOPES_TEST_DIR}/zz-junk.json`), 'junk and 63 files make 64: nothing pruned yet');
  await put(scopes, A1, 'newest', ['e-new']);
  assert.ok(!io.held.has(`${SCOPES_TEST_DIR}/zz-junk.json`), 'the 65th write pruned the junk, not a real scope');
  assert.equal(scopes.read(A1, 's0').admits(A1, 'e0'), true);
  assert.ok([...io.held.keys()].some((file) => file.endsWith('.tmp')), 'the half-written temp file is not ours to count or remove');
});

test('S17: a scope of 256 entries is written; 257 are refused and nothing is stored', async () => {
  const scopes = memoryScopes(M, () => 1);
  const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => `e${i}`);
  const written = await put(scopes, A1, S1, ids(MAX_SCOPE_ENTRIES));
  assert.equal(scopes.read(A1, S1).entries.size, MAX_SCOPE_ENTRIES);
  await assert.rejects(put(scopes, A1, S1, ids(MAX_SCOPE_ENTRIES + 1)), /256/);
  assert.equal(scopes.read(A1, S1).entries.size, MAX_SCOPE_ENTRIES, 'the refused write left the old file');
  assert.equal(scopes.read(A1, S1).revision, written, 'and its revision');
});

test('S17: writes queue — three sets in flight at once all land, even when the disk answers late', async () => {
  const scopes = memoryScopes(M, () => 1, memoryScopeFs(true));
  await Promise.all([put(scopes, A1, 's1', ['x']), put(scopes, A1, 's2', ['y']), put(scopes, A1, 's3', ['z'])]);
  assert.deepEqual(['s1', 's2', 's3'].map((s) => [...scopes.read(A1, s).entries][0]), ['x', 'y', 'z']);
});

test('S17: an entry given twice is written once, and reads as a set', async () => {
  const io = memoryScopeFs();
  const scopes = memoryScopes(M, () => 1, io);
  await put(scopes, A1, S1, ['e1', 'e1', 'e2']);
  assert.equal(scopes.read(A1, S1).entries.size, 2);
  const written = JSON.parse([...io.held.values()][0]) as ScopeFile;
  assert.deepEqual(written.entries, ['e1', 'e2'], 'and the file itself holds each id once');
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
  await put(wall.scopes, A1, S1, [], false);
  assert.equal(kindOf(resolve('in', 'exec')), 'nothing', 'narrowed since: refused at the next call');
  await put(wall.scopes, A1, S1, ['in'], false);
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
  await put(wall.scopes, A1, S1, ['in'], true);
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

test('sources.aliases (Amendment 6 review): a row is built by name — a field planted on a hook row is not served, through doorView and readRouteBody', async () => {
  const view = doorView(CTX, await wallWith(['in']));
  const target: Target = { accountId: A1, entityId: 'in', entityName: 'in', kind: 'ssh' };
  const planted = { name: 'mine', kind: 'ssh', entityId: 'in', keyPath: '/planted/zq-key' };
  const body = await readRouteBody('/v1/aliases', view.sources({ aliases: () => [planted] }, () => target));
  assert.equal(JSON.stringify(body), JSON.stringify({ aliases: [{ name: 'mine', kind: 'ssh' }] }));
});

test('sources.aliases (Amendment 6 review): a listing of several rows reads the scope once', async () => {
  const wall = await wallWith(['in']);
  const read = mock.method(wall.scopes, 'read');
  const view = doorView(CTX, wall);
  const target: Target = { accountId: A1, entityId: 'in', entityName: 'in', kind: 'ssh' };
  const real = { aliases: () => ['a', 'b', 'c', 'd'].map((name) => ({ name, kind: 'ssh' })) };
  assert.equal(present(view.sources(real, () => target).aliases, 'aliases')().length, 4);
  assert.equal(read.mock.callCount(), 1, 'one scope read for the whole listing, so a narrow landing mid-listing cannot cut it in two');
});

test('sources.mcpEntries: kept rows are those in scope, can is narrowed to use, dependsOn names only kept rows', async () => {
  const asked: string[] = [];
  const wall = { ...(await wallWith(['in', 'also'])), listEntriesOf: async (account: string): Promise<McpEntry[]> => (asked.push(account), rows) };
  const view = doorView(CTX, wall);
  const rows = [
    entry('in', 'prod', { dependsOn: ['leak-target', 'friend', 'ghost'] }),
    entry('out', 'leak-target'),
    entry('also', 'friend', { can: { use: false, edit: true, create: false, delete: true } }),
  ];
  const theRealHook = (): Promise<McpEntry[]> => Promise.reject(new Error('the whole vault\'s listing is not what a bridge reads'));
  const list = present(view.sources({ mcpEntries: theRealHook }, undefined).mcpEntries, 'entries');
  const listed = await list();
  assert.deepEqual(asked, [A1], 'the per-account supplier was asked, for the bridge\'s own account');
  assert.deepEqual(listed.map((row) => row.id), ['in', 'also']);
  assert.deepEqual(listed[0].can, { use: true, edit: false, create: false, delete: false });
  assert.deepEqual(listed[0].dependsOn, ['friend'], 'the name of an entry out of scope is not given away');
  assert.deepEqual(listed[1].can, { use: false, edit: false, create: false, delete: false }, 'use is the vault\'s own');
  assert.equal(rows[0].can.edit, true, 'the source rows are not mutated');
  assert.deepEqual(rows[0].dependsOn, ['leak-target', 'friend', 'ghost']);
  await put(wall.scopes, A1, S1, [], false);
  assert.deepEqual(await list(), [], 'narrowed since the view was built');
});

test('sources.visibleConfig: a config only in scope, from the per-account supplier, and it is not asked about the rest', async () => {
  const asked: string[][] = [];
  const wall = { ...(await wallWith(['in'])), visibleConfigOf: (account: string, id: string) => (asked.push([account, id]), { id } as never) };
  const theRealHook = (): never => {
    throw new Error('the first account\'s config is not what a bridge reads');
  };
  const read = doorView(CTX, wall).sources({ visibleConfig: theRealHook }, undefined);
  const config = present(read.visibleConfig, 'configs');
  assert.deepEqual(config('in'), { id: 'in' });
  assert.equal(config('out'), undefined);
  assert.deepEqual(asked, [[A1, 'in']], 'asked for the bridge\'s own account, and only about what is in scope');
  await put(wall.scopes, A1, S1, [], false);
  assert.equal(config('in'), undefined, 'narrowed since the view was built');
});

test('sources.folders: no folders at all', async () => {
  const read = doorView(CTX, await wallWith(['in'])).sources({ folders: () => [{ id: 'f' }] as never }, undefined);
  assert.deepEqual(present(read.folders, 'folders')(), []);
});

test('accountOnlyVault: the whole source with one account listed, every other method delegated by name and bound to the source', async () => {
  // A class instance on purpose: a spread of a StorageManager would lose its prototype, and a method pulled off it
  // would lose its `this`. The delegation must call the method ON the source.
  class Vault {
    readonly calls: string[] = [];
    private readonly tag = 'vault';
    getAccounts(): readonly { accountId: string }[] { this.calls.push(`getAccounts ${this.tag}`); return [{ accountId: 'a2' }, { accountId: 'a1' }]; }
    getNodes(accountId: string): readonly never[] { this.calls.push(`getNodes ${accountId} ${this.tag}`); return []; }
    getNode(accountId: string, id: string): undefined { this.calls.push(`getNode ${accountId} ${id} ${this.tag}`); return undefined; }
    getPassword(accountId: string, id: string): Thenable<undefined> { this.calls.push(`getPassword ${accountId} ${id}`); return Promise.resolve(undefined); }
    getPrivateKey(accountId: string, id: string): Thenable<undefined> { this.calls.push(`getPrivateKey ${accountId} ${id}`); return Promise.resolve(undefined); }
    getNotes(accountId: string, id: string): Thenable<undefined> { this.calls.push(`getNotes ${accountId} ${id}`); return Promise.resolve(undefined); }
    getTotp(accountId: string, id: string): Thenable<undefined> { this.calls.push(`getTotp ${accountId} ${id}`); return Promise.resolve(undefined); }
    getDbConnection(accountId: string, id: string): Thenable<undefined> { this.calls.push(`getDbConnection ${accountId} ${id}`); return Promise.resolve(undefined); }
  }
  const source = new Vault();
  const one = accountOnlyVault(source, 'a1');
  assert.deepEqual(one.getAccounts(), [{ accountId: 'a1' }], 'only the account asked for');
  assert.deepEqual(accountOnlyVault(source, 'nobody').getAccounts(), [], 'an unknown account is no account');
  one.getNodes('a1');
  one.getNode('a1', 'e1');
  await one.getPassword('a1', 'e1');
  await one.getPrivateKey('a1', 'e1');
  await one.getNotes('a1', 'e1');
  await one.getTotp('a1', 'e1');
  await one.getDbConnection('a1', 'e1');
  assert.deepEqual(source.calls, [
    'getAccounts vault', 'getAccounts vault', 'getNodes a1 vault', 'getNode a1 e1 vault',
    'getPassword a1 e1', 'getPrivateKey a1 e1', 'getNotes a1 e1', 'getTotp a1 e1', 'getDbConnection a1 e1',
  ], 'every method reached the source, with its own `this`');
});

/* ---------------------------------------------------------------------------------------------------------------
 * The strict read (parent §4.2, the re-review for epoch 6): only ENOENT is an absent file, and `set` alone is strict
 * ------------------------------------------------------------------------------------------------------------- */

const SCOPE_PATH = `${SCOPES_TEST_DIR}/${M.scope.scopeFileName(A1, S1)}`;
const denied = (): never => {
  throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
};

/** A fake disk that counts what is written and removed, and whose reads of `unreadable` paths throw EACCES. */
function countingFs(held: Map<string, string> = new Map(), unreadable: readonly string[] = []): ReturnType<typeof memoryScopeFs> & { writes: number } {
  const base = memoryScopeFs(false, held);
  const io = {
    ...base,
    writes: 0,
    readSync: (file: string) => (unreadable.includes(file) ? denied() : base.readSync(file)),
    write: (file: string, text: string) => {
      io.writes += 1;
      return base.write(file, text);
    },
  };
  return io;
}

test('S17 strict: a file that cannot be read (EACCES) is no scope for `read`, and `set` refuses it with zero writes', async () => {
  const io = countingFs(new Map([[SCOPE_PATH, JSON.stringify(GOOD)]]), [SCOPE_PATH]);
  const scopes = memoryScopes(M, () => 1, io);
  assert.equal(scopes.read(A1, S1).revision, NO_SCOPE, 'read fails closed: nothing is admitted');
  assert.equal(scopes.read(A1, S1).entries.size, 0);
  await assert.rejects(scopes.set(A1, S1, ['e1'], false, NO_SCOPE), { message: SCOPE_UNREADABLE });
  assert.equal(io.writes, 0, 'nothing was written over a record that was not read');
});

test('S17 strict: only ENOENT is an absent file — `set` creates it with a fresh revision', async () => {
  const io = countingFs();
  const scopes = memoryScopes(M, () => 1, io);
  const revision = await scopes.set(A1, S1, ['e1'], false, NO_SCOPE);
  assert.match(revision, /^[0-9a-f-]{36}$/);
  assert.equal(io.writes, 1);
});

test('S17 strict: a file that exists but is not this server\'s record — corrupt, or another account\'s — is refused by `set` with zero writes, and Close is the road that removes it', async () => {
  for (const [what, text] of [['a half file', '{ half a file'], ['another account\'s record', JSON.stringify({ ...GOOD, accountId: 'a2' })], ['an empty file', '']] as const) {
    const io = countingFs(new Map([[SCOPE_PATH, text]]));
    const scopes = memoryScopes(M, () => 1, io);
    assert.equal(scopes.read(A1, S1).revision, NO_SCOPE, `${what}: read answers no scope`);
    await assert.rejects(scopes.set(A1, S1, ['e1'], false, NO_SCOPE), { message: SCOPE_UNREADABLE }, what);
    assert.equal(io.writes, 0, `${what}: nothing was written`);
    assert.equal(io.held.get(SCOPE_PATH), text, `${what}: the file is as it was`);
    await scopes.forget(A1, S1);
    assert.equal(await scopes.set(A1, S1, ['e1'], false, NO_SCOPE) !== undefined, true, `${what}: after Close the set goes through`);
  }
});

test('S17 strict: prune skips a neighbour it cannot read instead of ranking it first, and still removes the oldest it can read', async () => {
  const held = new Map<string, string>();
  const record = (n: number): string => JSON.stringify({ v: 1, accountId: `a${n}`, serverEntityId: 's', entries: [], quiet: false, revision: `r${n}`, at: 100 + n });
  for (let n = 0; n < MAX_SCOPES; n += 1) {
    held.set(`${SCOPES_TEST_DIR}/n${n}.json`, record(n));
  }
  held.set(`${SCOPES_TEST_DIR}/unreadable.json`, '{}');
  const io = countingFs(held, [`${SCOPES_TEST_DIR}/unreadable.json`]);
  await memoryScopes(M, () => 1, io).set(A1, S1, ['e1'], false, NO_SCOPE);
  assert.ok(held.has(`${SCOPES_TEST_DIR}/unreadable.json`), 'the file it could not read was not removed');
  assert.equal(held.has(`${SCOPES_TEST_DIR}/n0.json`), false, 'the oldest readable one went');
  assert.equal(held.has(`${SCOPES_TEST_DIR}/n1.json`), false, 'and the next, since the cap is over by two');
  assert.ok(held.has(`${SCOPES_TEST_DIR}/n2.json`));
  assert.ok(held.has(SCOPE_PATH), 'and never the file just written');
});
