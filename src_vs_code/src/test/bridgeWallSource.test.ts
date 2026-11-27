import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadBridgeModules } from './bridgeModules';
import { collideVault, wallWorld } from './bridgeWallWorld';
import * as wallSource from '../bridgeWallSource';
import { wallSuppliersOf } from '../bridgeWallSource';
import type { EntityMetadata, TreeNode } from '../types';
import { BRIDGED_DB_PROFILES, type DbProfileRow } from '../bridgedDbProfile';
import { BRIDGE_USE_REFUSED } from '../bridgeScope';
import { DR1 } from '../bridgedDbSentences';
import type { McpVaultSource } from '../mcpEntries';

/**
 * The wall's suppliers as production wires them (Amendment 2, W1): everything of a `BridgeWallSource` that comes from the
 * vault, over one `McpVaultSource`. The wall world of the scenarios builds its wall from this function and defines none of
 * the four itself, so S22, S23 and L4 exercise what E2 will wire and not a copy that could drift.
 */

const { scope: { AGENT_FORWARD_REFUSED }, runPlan: { referenceTextsOf } } = loadBridgeModules();

/** The gate the suppliers are given: the production table, which serves no pair, on this system. */
const GATE = { profiles: BRIDGED_DB_PROFILES, platform: process.platform };

test('W1: listEntriesOf is one account\'s listing — a1 lists prod and not foreign, which holds the same id in the account searched first', async () => {
  const suppliers = wallSuppliersOf(collideVault(), GATE);
  const names = (await suppliers.listEntriesOf('a1')).map((entry) => entry.name);
  assert.deepEqual(names.filter((name) => ['prod', 'foreign'].includes(name)), ['prod']);
  const others = (await suppliers.listEntriesOf('a2')).map((entry) => entry.name);
  assert.ok(others.includes('foreign'), 'positive control: a2 lists its own entry');
  assert.ok(!others.includes('prod'));
});

test('W1: visibleConfigOf is asked of one account: a1\'s e1 is a1\'s and a2\'s is a2\'s, whichever is searched first', () => {
  const suppliers = wallSuppliersOf(collideVault(), GATE);
  assert.equal(suppliers.visibleConfigOf('a1', 'e1')?.name, 'prod');
  assert.equal(suppliers.visibleConfigOf('a2', 'e1')?.name, 'foreign');
});

test('CG3: visibleConfigOf stays in one account — a config hidden in a1 and visible in a2 is undefined for a1, and no node of a2 is read', () => {
  const config = (id: string, name: string, mcp: object): TreeNode => ({
    id, name, type: 'entity', parentId: null,
    details: { id, name, kind: 'config', isConfig: true, configFormat: 'json', configFileName: `${name}.json`, mcp } as unknown as EntityMetadata,
  });
  const nodes: Record<string, readonly TreeNode[]> = { a1: [config('c1', 'conf1', {})], a2: [config('c1', 'conf2', { view: true })] };
  const asked: string[] = [];
  const none = (): Thenable<undefined> => Promise.resolve(undefined);
  const vault: McpVaultSource = {
    getAccounts: () => [{ accountId: 'a1' }, { accountId: 'a2' }],
    getNodes: (account) => nodes[account] ?? [],
    getNode: (account, id) => {
      asked.push(account);
      return (nodes[account] ?? []).find((node) => node.id === id);
    },
    getPassword: none, getPrivateKey: none, getNotes: none, getTotp: none, getDbConnection: none,
  };
  const suppliers = wallSuppliersOf(vault, GATE);

  assert.equal(suppliers.visibleConfigOf('a1', 'c1'), undefined);
  assert.ok(!asked.includes('a2'), `no read of a2: ${asked.join(',')}`);
  assert.equal(suppliers.visibleConfigOf('a2', 'c1')?.name, 'conf2', 'positive control: a2 gives its own config');
});

/** A vault of one entry with the details a test chooses; every secret reader is absent, as the suppliers must not need them. */
function vaultWith(details: Partial<EntityMetadata>): McpVaultSource {
  const node: TreeNode = { id: 'e1', name: 'prod', type: 'entity', parentId: null, details: { id: 'e1', name: 'prod', kind: 'ssh', ...details } as EntityMetadata };
  const none = (): Thenable<undefined> => Promise.resolve(undefined);
  return {
    getAccounts: () => [{ accountId: 'a1' }],
    getNodes: () => [node],
    getNode: (_account, id) => (id === 'e1' ? node : undefined),
    getPassword: none, getPrivateKey: none, getNotes: none, getTotp: none, getDbConnection: none,
  };
}

test('W1: entryRefusal refuses an entry that forwards the agent with the sentence, and nothing else', () => {
  assert.deepEqual(wallSuppliersOf(vaultWith({ agentForward: true }), GATE).entryRefusal('a1', 'e1'), { code: 'denied', message: AGENT_FORWARD_REFUSED('prod') });
  assert.equal(wallSuppliersOf(vaultWith({ agentForward: false }), GATE).entryRefusal('a1', 'e1'), undefined);
  assert.equal(wallSuppliersOf(vaultWith({}), GATE).entryRefusal('a1', 'e1'), undefined);
  assert.equal(wallSuppliersOf(vaultWith({ agentForward: true }), GATE).entryRefusal('a1', 'nobody'), undefined, 'an entry that is not there is not refused by this');
});

test('W1: storedTexts is referenceTextsOf the live entity — a command and its arguments, a script and its variables', () => {
  const command = { command: 'deploy creds://a@x.test/F/e/password', commandArgs: [{ value: '--flag' }, { value: 'creds://a@x.test/F/f/password', disabled: true }] };
  assert.deepEqual(wallSuppliersOf(vaultWith(command), GATE).storedTexts('a1', 'e1'), referenceTextsOf(command));
  assert.deepEqual(wallSuppliersOf(vaultWith(command), GATE).storedTexts('a1', 'e1'), ['deploy creds://a@x.test/F/e/password', '--flag', 'creds://a@x.test/F/f/password']);
  const script = { isScript: true, script: 'run ${A}', scriptVars: [{ name: 'A', value: 'creds://a@x.test/F/e/password' }] };
  assert.deepEqual(wallSuppliersOf(vaultWith(script), GATE).storedTexts('a1', 'e1'), referenceTextsOf(script));
  assert.deepEqual(wallSuppliersOf(vaultWith(script), GATE).storedTexts('a1', 'e1'), ['run ${A}', 'creds://a@x.test/F/e/password']);
});

test('W1: storedTexts of an entry that is not there is the texts of nothing, not a throw', () => {
  assert.deepEqual(wallSuppliersOf(vaultWith({}), GATE).storedTexts('a1', 'nobody'), referenceTextsOf({}));
});

/* ---------------------------------------------------------------------------------------------------------------
 * The wall world builds its wall from the production function and defines none of the four itself
 * ------------------------------------------------------------------------------------------------------------- */

test('W1: the wall world\'s four suppliers answer what wallSuppliersOf answers over the world\'s own vault', async () => {
  const ww = await wallWorld({ collide: true, agentForward: true });
  try {
    const real = wallSuppliersOf(ww.vault, GATE);
    for (const account of ['a1', 'a2']) {
      assert.deepEqual((await ww.wall.listEntriesOf(account)).map((entry) => entry.id), (await real.listEntriesOf(account)).map((entry) => entry.id), `listEntriesOf ${account}`);
      for (const id of ['e1', 'e-out', 'e2', 'nobody']) {
        assert.deepEqual(ww.wall.visibleConfigOf(account, id), real.visibleConfigOf(account, id), `visibleConfigOf ${account}/${id}`);
        assert.deepEqual(ww.wall.entryRefusal(account, id), real.entryRefusal(account, id), `entryRefusal ${account}/${id}`);
        assert.deepEqual(ww.wall.storedTexts(account, id), real.storedTexts(account, id), `storedTexts ${account}/${id}`);
      }
    }
    assert.notEqual(ww.wall.entryRefusal('a1', 'e1'), undefined, 'positive control: the forwarding entry is refused through the world\'s wall');
  } finally {
    ww.dispose();
  }
});

test('W1: a difference planted in wallSuppliersOf reaches the world\'s wall — it is built from that function, for each of the four', async () => {
  // The very module object the world imported (a `require` here could load a second copy: `loadBridgeModules` evicts ours).
  const module = wallSource as { wallSuppliersOf: typeof wallSuppliersOf };
  const original = module.wallSuppliersOf;
  try {
    module.wallSuppliersOf = (vault, gate) => ({
      ...original(vault, gate),
      storedTexts: () => ['planted text'],
      listEntriesOf: () => Promise.resolve([]),
      visibleConfigOf: () => undefined,
      entryRefusal: () => ({ code: 'denied', message: 'planted refusal' }),
    });
    const ww = await wallWorld();
    try {
      assert.deepEqual(ww.wall.storedTexts('a1', 'e1'), ['planted text']);
      assert.deepEqual(await ww.wall.listEntriesOf('a1'), []);
      assert.equal(ww.wall.visibleConfigOf('a1', 'e1'), undefined);
      assert.deepEqual(ww.wall.entryRefusal('a1', 'e1'), { code: 'denied', message: 'planted refusal' });
    } finally {
      ww.dispose();
    }
  } finally {
    module.wallSuppliersOf = original;
  }
});

test('W1: storedTexts reads the entity of the account it is asked about, not another account\'s of the same id', () => {
  const entity = (command: string): TreeNode => ({ id: 'e1', name: 'prod', type: 'entity', parentId: null, details: { id: 'e1', name: 'prod', kind: 'ssh', command } as EntityMetadata });
  const nodes: Record<string, TreeNode> = { a1: entity('one'), a2: entity('two') };
  const none = (): Thenable<undefined> => Promise.resolve(undefined);
  const vault: McpVaultSource = {
    getAccounts: () => [{ accountId: 'a2' }, { accountId: 'a1' }],
    getNodes: (account) => [nodes[account]],
    getNode: (account, id) => (id === 'e1' ? nodes[account] : undefined),
    getPassword: none, getPrivateKey: none, getNotes: none, getTotp: none, getDbConnection: none,
  };
  assert.deepEqual(wallSuppliersOf(vault, GATE).storedTexts('a1', 'e1'), ['one']);
  assert.deepEqual(wallSuppliersOf(vault, GATE).storedTexts('a2', 'e1'), ['two']);
});

/* ---------------------------------------------------------------------------------------------------------------
 * E1.7 V5 (§S7.8, BW3): the wall's entry refusal for a database entry whose pair the table does not serve
 * ------------------------------------------------------------------------------------------------------------- */

const SERVES_PSQL: readonly DbProfileRow[] = [{ client: 'psql', platform: 'linux', served: true }];
const AT_LINUX = (profiles: readonly DbProfileRow[]): { profiles: readonly DbProfileRow[]; platform: NodeJS.Platform } => ({ profiles, platform: 'linux' });

/** A vault of one entry that counts every read of its stored connection: the wall may read the entry's details and never that. */
function countingVault(details: Partial<EntityMetadata>, reads: { count: number }): McpVaultSource {
  const vault = vaultWith(details);
  return {
    ...vault,
    getDbConnection: (accountId, entityId) => {
      reads.count += 1;
      return vault.getDbConnection(accountId, entityId);
    },
  };
}

test('BW3 (V5, T79): a database entry whose pair the table does not serve is refused with the code not_supported, the generic message and DR1 as its detail; one whose pair it serves, a database entry with no type and an entry that forwards the agent are not', () => {
  const reads = { count: 0 };
  const refusal = (details: Partial<EntityMetadata>, profiles: readonly DbProfileRow[], platform: NodeJS.Platform = 'linux'): ReturnType<ReturnType<typeof wallSuppliersOf>['entryRefusal']> =>
    wallSuppliersOf(countingVault(details, reads), { profiles, platform }).entryRefusal('a1', 'e1');

  assert.deepEqual(refusal({ kind: 'db', dbType: 'postgres' }, []), { code: 'not_supported', message: BRIDGE_USE_REFUSED('prod'), detail: DR1('psql', 'linux') }, 'an unserved psql');
  assert.deepEqual(refusal({ kind: 'db', dbType: 'mysql' }, SERVES_PSQL), { code: 'not_supported', message: BRIDGE_USE_REFUSED('prod'), detail: DR1('mysql', 'linux') }, 'a served psql does not serve mysql');
  assert.deepEqual(refusal({ kind: 'db', dbType: 'mssql' }, SERVES_PSQL, 'win32'), { code: 'not_supported', message: BRIDGE_USE_REFUSED('prod'), detail: DR1('sqlcmd', 'win32') }, 'nor does Linux serve Windows');
  assert.deepEqual(refusal({ kind: 'db', dbType: 'mongodb' }, SERVES_PSQL), { code: 'not_supported', message: BRIDGE_USE_REFUSED('prod'), detail: DR1('mongosh', 'linux') }, 'a type with no client is not served');
  assert.equal(refusal({ kind: 'db', dbType: 'postgres' }, SERVES_PSQL), undefined, 'a served pair is not refused');
  assert.equal(refusal({ kind: 'db' }, []), undefined, 'a database entry with no type: nothing');
  assert.equal(refusal({ kind: 'ssh' }, []), undefined, 'an entry of another kind: nothing');
  assert.deepEqual(refusal({ kind: 'ssh', agentForward: true }, []), { code: 'denied', message: AGENT_FORWARD_REFUSED('prod') }, 'the agent-forwarding refusal, as today, with no detail');
  assert.deepEqual(refusal({ kind: 'db', dbType: 'postgres', agentForward: true }, []), { code: 'denied', message: AGENT_FORWARD_REFUSED('prod') }, 'and it comes first');
  assert.equal(wallSuppliersOf(vaultWith({ kind: 'db', dbType: 'postgres' }), AT_LINUX([])).entryRefusal('a1', 'nobody'), undefined, 'an entry that is not there is not refused by this');
  assert.equal(reads.count, 0, 'the stored connection was never read');
});

test('BW3b (V5): the refusal reads the table and the system it is given, not the production table or the process\'s platform', () => {
  const suppliers = (profiles: readonly DbProfileRow[], platform: NodeJS.Platform) => wallSuppliersOf(vaultWith({ kind: 'db', dbType: 'postgres' }), { profiles, platform }).entryRefusal('a1', 'e1');

  assert.equal(suppliers(SERVES_PSQL, 'linux'), undefined);
  assert.notEqual(suppliers(SERVES_PSQL, 'darwin'), undefined, 'the same table on another system');
  assert.notEqual(suppliers(BRIDGED_DB_PROFILES, 'linux'), undefined, 'and the production table serves no pair');
});
