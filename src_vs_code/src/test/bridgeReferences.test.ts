import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BridgeContext, BridgeGrant } from '../bridgeContext';
import type { BridgeWallSource } from '../bridgeScope';
import type { Grant } from '../grantRegistry';
import type { RefSource } from '../secretRef';
import type { McpVaultSource } from '../mcpEntries';
import type { TreeNode } from '../types';
import { NO_SUPPLIERS, loadBridgeModules, memento, memoryScopes, present, put } from './bridgeModules';
import { loadEachWithVscode, loadWithVscode } from './vscodeStub';

/**
 * Everything E1.3 does with a `creds://` reference and an entry's account (S9, S16 and the pure halves of S8, S10, S20).
 *
 * <p>The sentence is one for every failure, because the four ways a reference can fail (no such account, no such
 * entity, ambiguous, out of scope) would otherwise tell a bridge which of them is true of a vault it may not see.</p>
 */

const M = loadBridgeModules();
const { REFERENCE_REFUSED, referenceRefusal, launchRefusal, outOfScopeAnswer, scopedRefSource } = M.scope;

const CTX: BridgeContext = { bridgeId: 'b1', accountId: 'a1', serverEntityId: 'server1', serverName: 'prod server', target: '', remoteOs: undefined };
const BRIDGED: BridgeGrant = { context: CTX, quiet: false };

/** The three entities of account a1 (two of them called `db`) and one of a2, with the paths a reference names. */
const ENTITIES: Record<string, Array<{ id: string; name: string; path: string[] }>> = {
  a1: [
    { id: 'e1', name: 'deploy', path: ['Servers', 'deploy'] },
    { id: 'db-mine', name: 'db', path: ['Mine', 'db'] },
    { id: 'db-other', name: 'db', path: ['Other', 'db'] },
    { id: 'solo', name: 'solo', path: ['Mine', 'solo'] },
  ],
  a2: [{ id: 'theirs', name: 'theirs', path: ['Theirs'] }],
};

function refSource(readings: string[] = []): RefSource {
  return {
    accounts: () => [{ accountId: 'a1', email: 'a@x.test' }, { accountId: 'a2', email: 'b@x.test' }],
    entities: (accountId) => ENTITIES[accountId] ?? [],
    fieldReading: (_account, entityId) => {
      readings.push(entityId);
      return Promise.resolve({ kind: 'value', value: `secret-of-${entityId}` });
    },
  };
}

async function wallOf(entries: string[], texts: readonly string[] | (() => readonly string[]) = []): Promise<BridgeWallSource> {
  const scopes = memoryScopes(M, () => 1);
  await put(scopes, 'a1', 'server1', entries);
  return { scopes, storedTexts: typeof texts === 'function' ? texts : () => texts, refSource: refSource(), ...NO_SUPPLIERS };
}

/** A grant of a bridge door; `{ bridge: undefined }` builds one of the existing doors, which has no such key at all. */
function grantOf(extra: Partial<Grant> = {}): Grant {
  const grant: { -readonly [K in keyof Grant]: Grant[K] } = {
    secret: 's', accountId: 'a1', entityId: 'e1', entityName: 'deploy', kind: 'ssh', status: 'pending',
    mintedAt: 0, lastUsedAt: 0, uses: 0, scope: 'call', bridge: BRIDGED, ...extra,
  };
  if (grant.bridge === undefined) {
    delete grant.bridge;
  }
  return grant;
}

/** The one sentence, written out: it echoes nothing of the stored text (S29), so it takes no reference. */
const sentence = (): string =>
  '"deploy" uses a creds:// reference this Remote Bridge does not serve. Add every entry it names to this bridge\'s scope, or take the reference out of the stored command or script.';
const denied = (): { code: string; message: string } => ({ code: 'denied', message: sentence() });

test('the reference sentence is the one of the spec, built by one function', () => {
  assert.equal(REFERENCE_REFUSED('deploy'), sentence());
});

test('S9 and S29: every way a reference can fail reads alike — one sentence, and it echoes nothing of the stored text', async () => {
  const wall = await wallOf(['e1', 'db-mine', 'solo']);
  const failing = [
    'creds://nobody@x.test/Mine/db/password', // no such account
    'creds://a@x.test/Mine/nothing/password', // no such entity
    'creds://a@x.test/db/password', // ambiguous: two entities called db, one of them in scope
    'creds://a@x.test/Other/db/password', // out of scope
    'creds://b@x.test/Theirs/password', // another account
  ];
  const messages: string[] = [];
  for (const ref of failing) {
    const refused = referenceRefusal(grantOf(), { ...wall, storedTexts: () => [`deploy ${ref}`] });
    assert.deepEqual(refused, denied(), ref);
    messages.push(present(refused, 'a refusal').message);
  }
  assert.equal(new Set(messages).size, 1, 'the sentences are one sentence, character for character');
  for (const message of messages) {
    for (const leak of ['db-other', 'Other', 'Mine', 'nobody', 'Theirs', 'x.test', 'creds://a', 'password', 'ambiguous', 'No entity', 'No signed-in']) {
      assert.ok(!message.includes(leak), `"${leak}" is not in ${message}`);
    }
  }
});

test('S9: a reference to an entry in scope lets the call proceed; so does a text with no reference at all', async () => {
  const wall = await wallOf(['e1', 'db-mine', 'solo']);
  assert.equal(referenceRefusal(grantOf(), { ...wall, storedTexts: () => ['deploy creds://a@x.test/Mine/db/password'] }), undefined);
  assert.equal(referenceRefusal(grantOf(), { ...wall, storedTexts: () => ['ls -l', ''] }), undefined);
  assert.equal(referenceRefusal(grantOf(), { ...wall, storedTexts: () => [] }), undefined);
  const both = ['creds://a@x.test/Mine/db/password creds://a@x.test/Mine/solo/notes'];
  assert.equal(referenceRefusal(grantOf(), { ...wall, storedTexts: () => both }), undefined, 'two in scope');
});

test('S9: one reference that cannot be served refuses the call, and references in scope around it do not cover it', async () => {
  const wall = await wallOf(['e1', 'solo']);
  const texts = ['creds://a@x.test/Mine/solo/password creds://a@x.test/Other/db/password creds://a@x.test/Mine/db/password'];
  assert.deepEqual(referenceRefusal(grantOf(), { ...wall, storedTexts: () => texts }), denied());
});

test('S9: a storedTexts or a vault that THROWS is the same refusal, never an exception', async () => {
  const wall = await wallOf(['e1']);
  const thrown = (): never => {
    throw new Error('C:\\Users\\me\\vault.json is locked');
  };
  const unreadable = referenceRefusal(grantOf(), { ...wall, storedTexts: thrown });
  assert.deepEqual(unreadable, denied());
  assert.ok(!present(unreadable, 'a refusal').message.includes('vault.json'), 'the error text is not repeated');
  const brokenVault: BridgeWallSource = { ...wall, storedTexts: () => ['creds://a@x.test/Mine/db/password'], refSource: { accounts: thrown, entities: thrown } };
  assert.deepEqual(referenceRefusal(grantOf(), brokenVault), denied());
});

test('S9: the stored texts are those of the LIVE entity named by the grant', async () => {
  const asked: string[][] = [];
  const wall = await wallOf(['e1'], []);
  referenceRefusal(grantOf({ accountId: 'a1', entityId: 'e1' }), { ...wall, storedTexts: (a, e) => { asked.push([a, e]); return []; } });
  assert.deepEqual(asked, [['a1', 'e1']]);
});

test('S9: a scope narrowed since the last call is seen by the next one', async () => {
  const wall = await wallOf(['e1', 'solo'], ['creds://a@x.test/Mine/solo/password']);
  assert.equal(referenceRefusal(grantOf(), wall), undefined);
  await put(wall.scopes, 'a1', 'server1', ['e1']);
  assert.deepEqual(referenceRefusal(grantOf(), wall), denied());
});

test('S9: off a bridge nothing is read, whatever the wall would say', async () => {
  let reads = 0;
  const wall: BridgeWallSource = { ...(await wallOf([])), storedTexts: () => { reads += 1; return ['creds://a@x.test/Other/db/password']; } };
  const local = grantOf({ bridge: undefined });
  assert.equal(referenceRefusal(local, wall), undefined);
  assert.equal(launchRefusal(local, wall, 'mcp', {}), undefined);
  assert.equal(launchRefusal(local, undefined, 'mcp', {}), undefined);
  assert.equal(reads, 0);
  assert.equal('bridge' in local, false);
});

test('S9: a bridged grant with no wall at all fails closed', () => {
  assert.equal(referenceRefusal(grantOf(), undefined)?.code, 'denied');
  assert.deepEqual(launchRefusal(grantOf(), undefined, 'mcp', {}), outOfScopeAnswer('mcp', {}));
});

test('S9: referenceTextsOf lists every place a reference may be written — script and variables, or command and arguments, disabled rows too', () => {
  const { referenceTextsOf } = M.runPlan;
  assert.deepEqual(
    referenceTextsOf({ isScript: true, script: 'echo go', scriptVars: [{ name: 'A', value: 'creds://one' }, { name: 'B', value: 'creds://two', disabled: true }], command: 'ignored creds://no' }),
    ['echo go', 'creds://one', 'creds://two'],
  );
  assert.deepEqual(
    referenceTextsOf({ command: 'deploy', commandArgs: [{ value: '--token=creds://one' }, { value: 'creds://two', disabled: true }], script: 'ignored creds://no', scriptVars: [{ value: 'creds://no' }] }),
    ['deploy', '--token=creds://one', 'creds://two'],
  );
  assert.deepEqual(referenceTextsOf({}), ['']);
  assert.deepEqual(referenceTextsOf({ isScript: true }), ['']);
});

test('S9: a reference hiding in a script body, a variable, a command, an argument or a disabled argument is found by the check', async () => {
  const hidden = 'creds://a@x.test/Other/db/password';
  const places = [
    { isScript: true, script: `run ${hidden}` },
    { isScript: true, script: 'run', scriptVars: [{ name: 'TOKEN', value: hidden }] },
    { command: `run ${hidden}` },
    { command: 'run', commandArgs: [{ value: hidden }] },
    { command: 'run', commandArgs: [{ value: hidden, disabled: true }] },
  ];
  for (const details of places) {
    const wall = { ...(await wallOf(['e1'])), storedTexts: () => M.runPlan.referenceTextsOf(details) };
    assert.deepEqual(referenceRefusal(grantOf(), wall), denied(), JSON.stringify(details));
  }
});

test('locateRef: parsed and located, or `ok: false` with no reason; never an exception, never a message', () => {
  const { locateRef } = M.secretRef;
  assert.deepEqual(locateRef('creds://a@x.test/Other/db/password', refSource()), { ok: true, accountId: 'a1', entityId: 'db-other' });
  assert.deepEqual(locateRef('creds://a@x.test/Mine/solo/notes', refSource()), { ok: true, accountId: 'a1', entityId: 'solo' });
  for (const raw of ['creds://nobody@x.test/Mine/db/password', 'creds://a@x.test/Nope/password', 'creds://a@x.test/db/password', 'creds://x', 'hello', '']) {
    assert.deepEqual(locateRef(raw, refSource()), { ok: false }, raw);
  }
  const throwing: RefSource = { ...refSource(), accounts: () => { throw new Error('/home/me/.vault'); } };
  assert.deepEqual(locateRef('creds://a@x.test/Mine/solo/notes', throwing), { ok: false });
});

test('locateRef: it never reads a value — only the entity is located', () => {
  const readings: string[] = [];
  M.secretRef.locateRef('creds://a@x.test/Mine/solo/password', refSource(readings));
  assert.deepEqual(readings, []);
});

test('outOfScopeAnswer: the route\'s own not-found sentence, word for word', () => {
  assert.deepEqual(outOfScopeAnswer('mcp', {}), { code: 'not_found', message: 'No such entry, or this window does not serve it.' });
  assert.deepEqual(outOfScopeAnswer('alias', { alias: 'leaky' }), { code: 'not_found', message: 'No entry is enabled for the CLI under "leaky".' });
  assert.deepEqual(outOfScopeAnswer('token', {}), { code: 'unauthorized', message: 'Unknown or missing grant token.' });
  assert.deepEqual(outOfScopeAnswer('config', {}), { code: 'unauthorized', message: 'Unknown or missing grant token.' });
});

test('B11: outOfScopeAnswer asks the route\'s own functions, so the sentence cannot be spelled twice', () => {
  const real = M.requests;
  const marked = {
    ...real,
    refusalFor: () => ({ code: 'not_found', message: 'MARK-ENTRY' }),
    aliasTarget: (_resolve: unknown, name: string) => ({ ok: false, code: 'not_found', message: `MARK-ALIAS ${name}` }),
    UNKNOWN_TOKEN: 'MARK-TOKEN',
  };
  const [scope] = loadEachWithVscode(['../bridgeScope'], { window: {} }, { './brokerRequests': marked }) as [typeof import('../bridgeScope')];
  assert.equal(scope.outOfScopeAnswer('mcp', {}).message, 'MARK-ENTRY');
  assert.equal(scope.outOfScopeAnswer('alias', { alias: 'x' }).message, 'MARK-ALIAS x');
  assert.equal(scope.outOfScopeAnswer('token', {}).message, 'MARK-TOKEN');
});

test('launchRefusal: the grant\'s account and entry against a fresh scope, then its references', async () => {
  const wall = await wallOf(['e1', 'solo'], ['creds://a@x.test/Mine/solo/password']);
  assert.equal(launchRefusal(grantOf(), wall, 'mcp', {}), undefined, 'in scope with a reference in scope');
  assert.deepEqual(launchRefusal(grantOf({ entityId: 'db-other' }), wall, 'mcp', {}), outOfScopeAnswer('mcp', {}));
  assert.deepEqual(launchRefusal(grantOf({ entityId: 'db-other' }), wall, 'alias', { alias: 'leaky' }), outOfScopeAnswer('alias', { alias: 'leaky' }));
  assert.deepEqual(launchRefusal(grantOf({ entityId: 'db-other' }), wall, 'token', {}), outOfScopeAnswer('token', {}));
  assert.deepEqual(launchRefusal(grantOf({ accountId: 'a2', entityId: 'e1' }), wall, 'mcp', {}), outOfScopeAnswer('mcp', {}), 'the same id in another account');
  await put(wall.scopes, 'a1', 'server1', ['e1']);
  assert.deepEqual(launchRefusal(grantOf(), wall, 'mcp', {}), denied(), 'a reference that fell out of scope since');
  await put(wall.scopes, 'a1', 'server1', []);
  assert.deepEqual(launchRefusal(grantOf(), wall, 'mcp', {}), outOfScopeAnswer('mcp', {}), 'and the entry that fell out first');
});

test('launchRefusal: the scope is the grant\'s own context\'s, not the first one in the store', async () => {
  const wall = await wallOf(['e1']);
  await put(wall.scopes, 'a1', 'server2', ['solo']);
  const other: BridgeGrant = { context: { ...CTX, serverEntityId: 'server2' }, quiet: false };
  assert.equal(launchRefusal(grantOf({ bridge: BRIDGED }), wall, 'mcp', {}), undefined);
  assert.deepEqual(launchRefusal(grantOf({ bridge: other }), wall, 'mcp', {}), outOfScopeAnswer('mcp', {}), 'e1 is in server1\'s scope, not server2\'s');
  assert.equal(launchRefusal(grantOf({ bridge: other, entityId: 'solo' }), wall, 'mcp', {}), undefined);
});

test('S16: scopedRefSource with the real resolveSecretRefs — in scope resolves, out of scope never reaches the vault', async () => {
  const readings: string[] = [];
  const wall = await wallOf(['solo', 'db-mine']);
  const source = scopedRefSource(CTX, wall, refSource(readings));
  const inScope = await M.secretRef.resolveSecretRefs(['creds://a@x.test/Mine/solo/password'], source);
  assert.deepEqual(inScope, { ok: true, values: { 'creds://a@x.test/Mine/solo/password': 'secret-of-solo' } });
  const outOfScope = await M.secretRef.resolveSecretRefs(['creds://a@x.test/Other/db/password'], source);
  assert.equal(outOfScope.ok, false);
  assert.deepEqual(readings, ['solo'], 'the real fieldReading was called for the entry in scope and for no other');
});

test('S16: an ambiguous reference stays ambiguous for the agent, exactly as for the person', async () => {
  const wall = await wallOf(['db-mine']);
  const source = scopedRefSource(CTX, wall, refSource());
  const person = await M.secretRef.resolveSecretRefs(['creds://a@x.test/db/password'], refSource());
  const agent = await M.secretRef.resolveSecretRefs(['creds://a@x.test/db/password'], source);
  assert.equal(person.ok, false);
  assert.equal(agent.ok, false, 'one of the two is in scope, and it still does not resolve silently to that one');
  assert.deepEqual(agent, person);
});

test('S16: another account\'s email resolves to nothing, and its entities are never listed', async () => {
  const wall = await wallOf(['e1']);
  const source = scopedRefSource(CTX, wall, refSource());
  assert.deepEqual(source.accounts(), [{ accountId: 'a1', email: 'a@x.test' }]);
  assert.deepEqual(source.entities('a2'), []);
  assert.equal(source.entities('a1').length, ENTITIES.a1.length, 'the account\'s FULL list, so ambiguity is decided as the person\'s run decides it');
  assert.equal((await M.secretRef.resolveSecretRefs(['creds://b@x.test/Theirs/password'], source)).ok, false);
});

test('S16: fieldReading answers `absent` for anything the scope does not admit and does not ask the vault', async () => {
  const readings: string[] = [];
  const wall = await wallOf(['solo']);
  const source = scopedRefSource(CTX, wall, refSource(readings));
  assert.deepEqual(await source.fieldReading('a1', 'db-other', 'password'), { kind: 'absent' });
  assert.deepEqual(await source.fieldReading('a2', 'solo', 'password'), { kind: 'absent' }, 'the same id in another account');
  assert.deepEqual(readings, []);
  assert.deepEqual(await source.fieldReading('a1', 'solo', 'password'), { kind: 'value', value: 'secret-of-solo' });
  await put(wall.scopes, 'a1', 'server1', []);
  assert.deepEqual(await source.fieldReading('a1', 'solo', 'password'), { kind: 'absent' }, 'narrowed since the source was built');
});

/** A fake vault of two accounts that both hold an entry called e1, recording which accounts were asked about. */
function twoAccounts(asked: string[]): Pick<McpVaultSource, 'getAccounts' | 'getNode'> {
  const folder: TreeNode = { id: 'f', name: 'Agents', type: 'folder', parentId: null, mcp: { use: true } };
  const e1: TreeNode = { id: 'e1', name: 'prod', type: 'entity', parentId: 'f', details: { id: 'e1', name: 'prod', kind: 'ssh', isSshEnabled: true } };
  return {
    getAccounts: () => [{ accountId: 'a2' }, { accountId: 'a1' }],
    getNode: (accountId, id) => {
      asked.push(accountId);
      return [folder, e1].find((node) => node.id === id);
    },
  };
}

/** The account a lookup found a usable entry in, or what it found instead. */
function accountOfUsable(found: ReturnType<typeof M.entries.findUsableEntry>): string {
  return found?.kind === 'usable' ? found.accountId : String(found?.kind);
}

test('accountOnly: the same source with one account, so a lookup never walks into another', () => {
  const { accountOnly, findUsableEntry } = M.entries;
  const asked: string[] = [];
  const source = twoAccounts(asked);
  assert.deepEqual(accountOnly(source, 'a1').getAccounts(), [{ accountId: 'a1' }]);
  assert.deepEqual(accountOnly(source, 'nobody').getAccounts(), []);

  assert.equal(accountOfUsable(findUsableEntry(source, 'e1', 'exec')), 'a2', 'positive control: unnarrowed, the first account answers');
  asked.length = 0;
  assert.equal(accountOfUsable(findUsableEntry(accountOnly(source, 'a1'), 'e1', 'exec')), 'a1');
  assert.ok(!asked.includes('a2'), 'a2 was never asked about');
  assert.equal(findUsableEntry(accountOnly(source, 'nobody'), 'e1', 'exec'), undefined);
});

test('mcpUseHooks: the resolveMcpUse it builds takes the bridge\'s server, and searches that account and no other', () => {
  const { mcpUseHooks } = loadWithVscode<typeof import('../mcpHooks')>('../mcpHooks', { window: {} });
  const folder: TreeNode = { id: 'f', name: 'Agents', type: 'folder', parentId: null, mcp: { use: true } };
  const entry = (name: string): TreeNode => ({ id: 'e1', name, type: 'entity', parentId: 'f', details: { id: 'e1', name, kind: 'ssh', isSshEnabled: true } });
  const nodes: Record<string, TreeNode[]> = { a2: [folder, entry('foreign')], a1: [folder, entry('prod')] };
  const vault: Pick<McpVaultSource, 'getAccounts' | 'getNode'> = {
    getAccounts: () => [{ accountId: 'a2' }, { accountId: 'a1' }],
    getNode: (accountId, id) => nodes[accountId].find((node) => node.id === id),
  };
  const { resolveMcpUse } = mcpUseHooks(vault, memento(), () => 1);
  const nameOf = (found: ReturnType<typeof resolveMcpUse>): string => (found?.kind === 'usable' ? found.target.entityName : String(found?.kind));
  assert.equal(nameOf(resolveMcpUse('e1', 'exec')), 'foreign', 'positive control: the existing doors search every account, a2 first');
  assert.equal(nameOf(resolveMcpUse('e1', 'exec', { accountId: 'a1', serverEntityId: 's' })), 'prod');
  assert.equal(nameOf(resolveMcpUse('e1', 'exec', { accountId: 'nobody', serverEntityId: 's' })), 'undefined');
});

const FORWARDING = { code: 'denied' as const, message: M.scope.AGENT_FORWARD_REFUSED('deploy') };

test('A.3.2: the wall\'s word on the entry comes first — an agent-forwarding entry is refused with its own sentence, whatever its text says', async () => {
  const asked: string[][] = [];
  const wall = { ...(await wallOf(['e1'], ['ls -l'])), entryRefusal: (account: string, entity: string) => (asked.push([account, entity]), FORWARDING) };
  assert.deepEqual(referenceRefusal(grantOf(), wall), FORWARDING, 'the text has no reference at all, and the entry is still refused');
  assert.deepEqual(asked, [['a1', 'e1']], 'asked about the grant\'s own account and entry');
  assert.deepEqual(launchRefusal(grantOf(), wall, 'mcp', {}), FORWARDING, 'and the launch gate asks it again, against the live entity');
  const both = { ...wall, storedTexts: () => ['creds://a@x.test/Other/db/password'] };
  assert.deepEqual(referenceRefusal(grantOf(), both), FORWARDING, 'when both apply the entry\'s own reason is the one given');
  assert.equal(referenceRefusal(grantOf({ bridge: undefined }), wall), undefined, 'off a bridge the wall is not asked');
  assert.deepEqual(asked.length, 3, 'and not asked then');
});

test('A.3.2: an entry the wall does not bar is checked for references as before, and a wall whose answer throws fails closed', async () => {
  const quiet = await wallOf(['e1'], ['ls -l']);
  assert.equal(referenceRefusal(grantOf(), quiet), undefined, 'positive control: nothing barred, no reference');
  const broken = {
    ...quiet,
    entryRefusal: (): never => {
      throw new Error('C:\\Users\\me\\vault.json is locked');
    },
  };
  assert.deepEqual(referenceRefusal(grantOf(), broken), denied(), 'refused with the generic sentence, not an exception');
  assert.ok(!present(referenceRefusal(grantOf(), broken), 'a refusal').message.includes('vault.json'));
});

test('A.3.3: the three sentences are written out, each takes the entry\'s name and nothing else', () => {
  assert.equal(
    M.scope.AGENT_FORWARD_REFUSED('prod'),
    '"prod" is set to forward this computer\'s SSH agent, and the shared agent answers for every loaded key. A Remote Bridge does not use it: turn agent forwarding off on that entry, or use it from this computer.',
  );
  assert.equal(
    M.scope.BRIDGE_USE_REFUSED('prod'),
    '"prod" could not be used through this Remote Bridge. The reason is in the agent journal on the computer that holds the vault.',
  );
  assert.equal(M.scope.AGENT_FORWARD_REFUSED.length, 1);
  assert.equal(M.scope.BRIDGE_USE_REFUSED.length, 1);
  assert.equal(M.scope.REFERENCE_REFUSED.length, 1);
});
