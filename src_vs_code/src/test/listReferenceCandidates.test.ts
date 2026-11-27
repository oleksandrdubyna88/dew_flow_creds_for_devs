import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { HIDDEN_REFERENCE } from '../agentNaming';
import { McpEntry, McpVaultSource, visibleMcpEntries } from '../mcpEntries';
import { stored } from '../storedSecret';
import type { EntityMetadata, TreeNode } from '../types';

/**
 * The candidates of a `creds://` token in a listed command (`todo/PLAN_agent_list_fields_hidden_n1_n4_n6.md`, §2.4 and §6.10, story S6).
 *
 * <p>Each row builds two or three vaults that differ in ONE thing that the agent may not view, calls the product's own list function, and compares the
 * COMPLETE bodies with `deepEqual`: a token reads the same with that node there, with another name, and with the node taken out (so that a `parentId`
 * points to nothing). The three worlds of a row: W1 the node is there; W2 it has another name; W3 it is not there. The account is `me@x.test`; each
 * token is `creds://me@x.test/<the path>/password`.</p>
 *
 * <p><b>What these rows do not prove</b> (§6.10): the time (KG6 counts node reads for one shape); a path of more than three named folders (KD1 is the deepest
 * row); more than two accounts with one address; a vault that changes while a listing is built; the real binary (H1 carries a placeholder through it); a folder
 * that is hidden because it is in the Trash (the wall covers it).</p>
 */

const EMAIL = 'me@x.test';
const OPEN = { view: true } as const;

const folder = (id: string, name: string, parentId: string | null = null, mcp?: TreeNode['mcp']): TreeNode => ({ id, name, type: 'folder', parentId, ...(mcp === undefined ? {} : { mcp }) });

function entry(id: string, name: string, parentId: string | null, details: Partial<EntityMetadata> = {}): TreeNode {
  const base: EntityMetadata = { id, name, kind: 'ssh', isSshEnabled: true, host: 'h.example.test' };
  return { id, name, type: 'entity', parentId, details: { ...base, ...details } };
}

interface Account {
  readonly accountId: string;
  readonly email: string;
  readonly nodes: readonly TreeNode[];
}

/** A vault of accounts; `reads` counts the `getNode` calls when it is given. */
function vaultOf(accounts: readonly Account[], reads?: { count: number }): McpVaultSource {
  const nodesOf = (accountId: string): readonly TreeNode[] => accounts.find((a) => a.accountId === accountId)?.nodes ?? [];
  const none = (): Thenable<ReturnType<typeof stored>> => Promise.resolve(stored(undefined));
  return {
    getAccounts: () => accounts.map(({ accountId, email }) => ({ accountId, email })),
    getNodes: nodesOf,
    getNode: (accountId, id) => {
      if (reads !== undefined) {
        reads.count += 1;
      }
      return nodesOf(accountId).find((n) => n.id === id);
    },
    getPassword: none,
    getPrivateKey: none,
    getNotes: none,
    getTotp: none,
    getDbConnection: none,
  };
}

const ref = (path: string, address = EMAIL): string => `creds://${address}/${path}/password`;

/** The terminal entry that holds the command: it has switches of its own, so it is listed. */
const terminal = (command: string, parentId: string | null = null): TreeNode => entry('t1', 'the command', parentId, { mcp: OPEN, kind: 'terminal', isSshEnabled: false, command });

/** The complete body of the list for a vault, as the wire carries it. */
async function bodyOf(accounts: readonly Account[]): Promise<McpEntry[]> {
  return [...(await visibleMcpEntries(vaultOf(accounts)))];
}

const commandIn = (body: readonly McpEntry[]): string | undefined => body.find((row) => row.id === 't1')?.command;

/** The three worlds of a row: the complete bodies are deep-equal, and the command reads `expected` in each. */
async function assertAlike(worlds: Readonly<Record<string, readonly Account[]>>, expected: string): Promise<void> {
  const bodies = await Promise.all(Object.entries(worlds).map(async ([name, accounts]) => [name, await bodyOf(accounts)] as const));
  for (const [name, body] of bodies) {
    assert.equal(commandIn(body), expected, `${name}: the command`);
    assert.deepEqual(body, bodies[0][1], `${name}: the complete body is the body of ${bodies[0][0]}`);
  }
}

const one = (nodes: readonly TreeNode[]): readonly Account[] => [{ accountId: 'a1', email: EMAIL, nodes }];

// ---------- K1 and KG1: one folder named ----------

/** Two viewable `db`: one in an open `Team`, one with switches of its own in a folder `Team` that has no switch (W1), another name (W2), or not there (W3). */
function teamWorld(world: 'W1' | 'W2' | 'W3', command: string): readonly Account[] {
  const closedName = world === 'W2' ? 'Other' : 'Team';
  return one([
    folder('f-open', 'Team', null, OPEN),
    ...(world === 'W3' ? [] : [folder('f-closed', closedName)]),
    entry('db1', 'db', 'f-open'),
    entry('db2', 'db', 'f-closed', { mcp: OPEN }),
    terminal(command),
  ]);
}

test('K1: a viewable entry under a folder that the agent may not view is no candidate of a token that names a folder: kept, in the three worlds', async () => {
  const command = `a ${ref('Team/db')} b ${ref('TEAM/DB')}`;
  await assertAlike({ W1: teamWorld('W1', command), W2: teamWorld('W2', command), W3: teamWorld('W3', command) }, command);
});

test('KG1: a token with one path part names no folder: the two viewable entries are ambiguous, in the three worlds', async () => {
  const command = `a ${ref('db')}`;
  await assertAlike({ W1: teamWorld('W1', command), W2: teamWorld('W2', command), W3: teamWorld('W3', command) }, `a ${HIDDEN_REFERENCE}`);
});

// ---------- K2 and KG5: two folders named ----------

/** `Mid/Inner/db` in an open `Mid`; a second viewable `db` in a second `Inner` (switches of its own) in a `Mid` that a person closed (`mcp: {}`). */
function midWorld(world: 'W1' | 'W2' | 'W3', command: string): readonly Account[] {
  return one([
    folder('mid1', 'Mid', null, OPEN),
    folder('in1', 'Inner', 'mid1'),
    entry('db1', 'db', 'in1'),
    ...(world === 'W3' ? [] : [folder('mid2', world === 'W2' ? 'Other' : 'Mid', null, {})]),
    folder('in2', 'Inner', 'mid2', OPEN),
    entry('db2', 'db', 'in2', { mcp: OPEN }),
    terminal(command),
  ]);
}

test('K2: the same at a depth of two folders: kept, in the three worlds', async () => {
  const command = ref('Mid/Inner/db');
  await assertAlike({ W1: midWorld('W1', command), W2: midWorld('W2', command), W3: midWorld('W3', command) }, command);
});

test('KG5: the same vaults with a token that names no closed folder: two open Inner give the placeholder, in the three worlds', async () => {
  for (const token of [ref('Inner/db'), ref('db')]) {
    await assertAlike({ W1: midWorld('W1', token), W2: midWorld('W2', token), W3: midWorld('W3', token) }, HIDDEN_REFERENCE);
  }
});

// ---------- KD1: three folders named ----------

function topWorld(world: 'W1' | 'W2' | 'W3', command: string): readonly Account[] {
  return one([
    folder('top1', 'Top', null, OPEN),
    folder('mid1', 'Mid', 'top1'),
    folder('in1', 'Inner', 'mid1'),
    entry('db1', 'db', 'in1'),
    ...(world === 'W3' ? [] : [folder('top2', world === 'W2' ? 'Other' : 'Top', null, {})]),
    folder('mid2', 'Mid', 'top2', OPEN),
    folder('in2', 'Inner', 'mid2', OPEN),
    entry('db2', 'db', 'in2', { mcp: OPEN }),
    terminal(command),
  ]);
}

test('KD1: three folders deep: the token that names the closed Top is kept, the one that does not is ambiguous, in the three worlds', async () => {
  const named = ref('Top/Mid/Inner/db');
  await assertAlike({ W1: topWorld('W1', named), W2: topWorld('W2', named), W3: topWorld('W3', named) }, named);
  const unnamed = ref('Mid/Inner/db');
  await assertAlike({ W1: topWorld('W1', unnamed), W2: topWorld('W2', unnamed), W3: topWorld('W3', unnamed) }, HIDDEN_REFERENCE);
});

// ---------- KG2, KG3, KG4: guards ----------

test('KG2: one viewable db under a folder with no switch, and the same with a parent id that points to nothing, read alike', async () => {
  const command = `${ref('db')} ${ref('Team/db')}`;
  const withParent = one([folder('f-closed', 'Team'), entry('db1', 'db', 'f-closed', { mcp: OPEN }), terminal(command)]);
  const withNone = one([entry('db1', 'db', 'f-closed', { mcp: OPEN }), terminal(command)]);
  await assertAlike({ W1: withParent, W3: withNone }, `${ref('db')} ${HIDDEN_REFERENCE}`);
});

test('KG3: a closed folder between two open ones: only the path that leaves it out is kept, and the closed name is in no body', async () => {
  const command = [ref('Inner/db'), ref('Outer/Inner/db'), ref('Hidden/Inner/db'), ref('Outer/Hidden/Inner/db')].join(' ');
  const world = (closed: 'there' | 'gone'): readonly Account[] =>
    one([
      folder('outer', 'Outer', null, OPEN),
      ...(closed === 'there' ? [folder('hidden', 'Hidden', 'outer', {})] : []),
      folder('inner', 'Inner', 'hidden', OPEN),
      entry('db1', 'db', 'inner', { mcp: OPEN }),
      terminal(command),
    ]);
  const expected = [ref('Inner/db'), HIDDEN_REFERENCE, HIDDEN_REFERENCE, HIDDEN_REFERENCE].join(' ');
  await assertAlike({ W1: world('there'), W3: world('gone') }, expected);
  assert.equal(JSON.stringify(await bodyOf(world('there'))).includes('Hidden'), false, 'the word Hidden is in no body');
});

test('KG4: two viewable db, each directly in a different open folder named Team: two candidates, the placeholder', async () => {
  const nodes = one([folder('t1a', 'Team', null, OPEN), folder('t2a', 'Team', null, OPEN), entry('db1', 'db', 't1a'), entry('db2', 'db', 't2a'), terminal(`${ref('Team/db')} ${ref('db')}`)]);
  assert.equal(commandIn(await bodyOf(nodes)), `${HIDDEN_REFERENCE} ${HIDDEN_REFERENCE}`);
});

// ---------- KA1 to KA3: two accounts with one address ----------

/** The second account holds a viewable `db` and the command; the first is what the world says. */
function twoAccounts(first: Account | undefined, command: string): readonly Account[] {
  const second: Account = { accountId: 'a2', email: EMAIL, nodes: [entry('db-b', 'db', null, { mcp: OPEN }), terminal(command)] };
  return first === undefined ? [second] : [first, second];
}

test('KA1: an account with the address, in which the agent may view nothing, decides nothing: kept, in each world', async () => {
  const command = ref('db');
  const mine = (email: string, nodes: readonly TreeNode[]): Account => ({ accountId: 'a0', email, nodes });
  await assertAlike(
    {
      W1: twoAccounts(mine(EMAIL, [entry('db-h', 'db', null)]), command),
      W1b: twoAccounts(mine(EMAIL, []), command),
      W1c: twoAccounts(mine('ME@X.TEST', [entry('db-h', 'db', null)]), command),
      W1d: twoAccounts(mine(EMAIL, [entry('db-b', 'db', null)]), command),
      W3: twoAccounts(undefined, command),
    },
    command,
  );
});

test('KA2: two accounts with one address, each with a viewable db: two candidates in a list that has no account, the placeholder', async () => {
  const first: Account = { accountId: 'a0', email: EMAIL, nodes: [entry('db-a', 'db', null, { mcp: OPEN })] };
  assert.equal(commandIn(await bodyOf(twoAccounts(first, ref('db')))), HIDDEN_REFERENCE);
});

test('KA3: the folder that the token names is in the SECOND account: kept; the token with one part is ambiguous', async () => {
  const first: Account = { accountId: 'a0', email: EMAIL, nodes: [folder('f-o', 'Other', null, OPEN), entry('db-a', 'db', 'f-o')] };
  const second: Account = { accountId: 'a2', email: EMAIL, nodes: [folder('f-t', 'Team', null, OPEN), entry('db-b', 'db', 'f-t'), terminal(`${ref('Team/db')} ${ref('db')}`)] };
  assert.equal(commandIn(await bodyOf([first, second])), `${ref('Team/db')} ${HIDDEN_REFERENCE}`);
});

// ---------- KG6: the candidates are found once for a listing ----------

test('KG6: ten viewable db in ten open folders: fifty tokens read the same number of nodes as one token, and each reads the placeholder', async () => {
  const folders = Array.from({ length: 10 }, (_, i) => folder(`f${i}`, `F${i}`, null, OPEN));
  const dbs = Array.from({ length: 10 }, (_, i) => entry(`db${i}`, 'db', `f${i}`));
  const reads = async (tokens: number): Promise<{ count: number; command: string | undefined }> => {
    const command = Array.from({ length: tokens }, (_, i) => ref(`X${i + 1}/db`)).join(' ');
    const counter = { count: 0 };
    const rows = await visibleMcpEntries(vaultOf(one([...folders, ...dbs, terminal(command)]), counter));
    return { count: counter.count, command: rows.find((r) => r.id === 't1')?.command };
  };
  const a = await reads(1);
  const b = await reads(50);
  assert.equal(b.count, a.count, 'the nodes read for fifty tokens and for one');
  assert.equal(a.command, HIDDEN_REFERENCE);
  assert.equal(b.command, Array.from({ length: 50 }, () => HIDDEN_REFERENCE).join(' '));
});

test('KG7: the memory of a listing keys each token apart, also when a name holds a NUL: the order of two tokens changes nothing', async () => {
  const kept = 'creds://me@x.test/y%000/password';
  const other = 'creds://me@x.test%00y/0/password';
  for (const command of [`${kept} ${other}`, `${other} ${kept}`]) {
    const shown = commandIn(await bodyOf(one([entry('y0', 'y\u00000', null, { mcp: OPEN }), terminal(command)])));
    assert.ok(shown?.includes(kept), `the reference to the viewable entry is kept in "${command}": ${shown}`);
  }
});
