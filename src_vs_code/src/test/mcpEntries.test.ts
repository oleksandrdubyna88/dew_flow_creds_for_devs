import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { McpVaultSource, capabilitiesOf, mcpEntryFor, visibleMcpEntries } from '../mcpEntries';
import { normalizeMcpAccess, resolveMcpInTree } from '../mcpAccess';
import type { TreeNode } from '../types';

/**
 * Level 1 of the ladder: what an agent may SEE.
 *
 * <p>This is the first route in the product that hands an agent stored fields rather than
 * performing something on its behalf, so the tests are about what does NOT come back at least
 * as much as what does. Two guarantees carry the design:</p>
 *
 * <ul>
 * <li><b>Nothing appears unless a switch says so.</b> Not the entry, not its name, not the fact
 * that it exists — an unopened vault answers an empty list however much it holds. This is what
 * stands in for a bearer token on that route, so it is the assertion that must not rot.</li>
 * <li><b>No secret has a field to travel in.</b> The password, the private key, the VPN config,
 * the TOTP seed and the notes are all absent by construction; a DB connection string comes back
 * with the password stripped, because without the string the agent cannot address the database
 * and with the password it would not need to ask.</li>
 * </ul>
 *
 * <p>The shape is built field by field rather than spread-and-deleted, and one test below is
 * exactly about that: a new field on a stored record must not reach the wire because somebody
 * added it somewhere else.</p>
 */

const SECRET = 'hunter2-SUPER-SECRET';

function folder(id: string, name: string, extra: Partial<TreeNode> = {}): TreeNode {
  return { id, name, type: 'folder', parentId: null, ...extra };
}

function entity(id: string, name: string, details: Record<string, unknown>, parentId = 'f1'): TreeNode {
  return {
    id,
    name,
    type: 'entity',
    parentId,
    details: { id, name, isSshEnabled: false, ...details } as TreeNode['details'],
  };
}

function vault(nodes: readonly TreeNode[], secrets: Partial<Record<string, string>> = {}): McpVaultSource {
  const find = (id: string): TreeNode | undefined => nodes.find((n) => n.id === id);
  const answer = (key: string) => (): Thenable<string | undefined> => Promise.resolve(secrets[key]);
  return {
    getAccounts: () => [{ accountId: 'a1' }],
    getNodes: () => nodes,
    getNode: (_a, id) => find(id),
    getPassword: answer('password'),
    getPrivateKey: answer('privateKey'),
    getNotes: answer('notes'),
    getTotp: answer('totp'),
    getDbConnection: answer('dbConnection'),
  };
}

test('a vault nobody has opened to agents answers an empty list', async () => {
  // The common case by a wide margin. Every entry is invisible until somebody says otherwise,
  // including every entry that existed before the feature.
  const nodes = [folder('f1', 'Databases'), entity('e1', 'orders-db', { kind: 'db', host: 'db-01' })];

  assert.deepEqual(await visibleMcpEntries(vault(nodes)), []);
});

test('an entry appears once its own switch is on, and carries its non-secret half', async () => {
  const nodes = [
    folder('f1', 'Databases'),
    entity('e1', 'orders-db', {
      kind: 'db',
      dbType: 'mysql',
      host: 'db-01.example.internal',
      port: 3306,
      user: 'app',
      mcp: { view: true },
    }),
  ];

  const [entry] = await visibleMcpEntries(vault(nodes, { password: SECRET }));

  assert.equal(entry.id, 'e1');
  assert.equal(entry.name, 'orders-db');
  assert.equal(entry.kind, 'db');
  assert.equal(entry.folder, 'Databases');
  assert.equal(entry.host, 'db-01.example.internal');
  assert.equal(entry.port, 3306);
  assert.equal(entry.user, 'app');
  assert.equal(entry.hasPassword, true);
});

test('an entry with no answer of its own inherits the folder s', async () => {
  const nodes = [
    folder('f1', 'Databases', { mcp: { view: true } }),
    entity('e1', 'orders-db', { kind: 'db' }),
  ];

  const entries = await visibleMcpEntries(vault(nodes));

  assert.equal(entries.length, 1);
  assert.equal(entries[0].folder, 'Databases');
});

test('an entry that closed itself is invisible even inside an open folder', async () => {
  // Absent means "ask the folder"; present-and-empty means "decided here, and the answer is
  // nothing". A folder setting must not be able to overrule that.
  const nodes = [
    folder('f1', 'Databases', { mcp: { view: true } }),
    entity('e1', 'orders-db', { kind: 'db', mcp: {} }),
  ];

  assert.deepEqual(await visibleMcpEntries(vault(nodes)), []);
});

test('nothing in the Trash is visible, whatever it was granted before it was deleted', async () => {
  const nodes = [
    folder('t', 'Trash', { isTrash: true }),
    entity('e1', 'orders-db', { kind: 'db', mcp: { delete: 'any' } }, 't'),
  ];

  assert.deepEqual(await visibleMcpEntries(vault(nodes)), []);
});

test('a deleted FOLDER takes its contents out of sight with it', async () => {
  const nodes = [
    folder('t', 'Trash', { isTrash: true }),
    { ...folder('f1', 'Databases', { mcp: { view: true } }), parentId: 't' },
    entity('e1', 'orders-db', { kind: 'db' }),
  ];

  assert.deepEqual(await visibleMcpEntries(vault(nodes)), []);
});

test('the connection string comes back without the password in it', async () => {
  const nodes = [folder('f1', 'DB'), entity('e1', 'orders', { kind: 'db', mcp: { view: true } })];

  const [entry] = await visibleMcpEntries(
    vault(nodes, { dbConnection: `mysql://app:${SECRET}@db-01.example.internal:3306/orders` }),
  );

  assert.ok(entry.connectionString !== undefined);
  assert.equal(entry.connectionString.includes(SECRET), false, 'the password must not be in the string');
  assert.ok(entry.connectionString.includes('db-01.example.internal'));
  assert.equal(entry.hasPassword, false, 'the password lives in the string here, not in the field');
});

test('no secret has a field to travel in — the whole answer is searched for each one', async () => {
  // The structural guarantee, asserted structurally: whatever the shape grows, none of these
  // five values may appear anywhere in the serialized answer.
  const nodes = [
    folder('f1', 'Everything'),
    entity('e1', 'prod', { kind: 'ssh', host: 'h', mcp: { delete: 'any' } }),
  ];

  const entries = await visibleMcpEntries(
    vault(nodes, {
      password: SECRET,
      privateKey: `-----BEGIN OPENSSH PRIVATE KEY-----${SECRET}`,
      notes: `the note says ${SECRET}`,
      totp: `otpauth://totp/x?secret=${SECRET}`,
      dbConnection: `postgres://u:${SECRET}@h:5432/db`,
    }),
  );

  assert.equal(JSON.stringify(entries).includes(SECRET), false);
  assert.equal(entries[0].hasPassword, true);
  assert.equal(entries[0].hasNotes, true, 'that there IS a note may be said; what it says may not');
  assert.equal(entries[0].hasTotp, true);
});

test('a field added to a stored record does not reach the wire on its own', async () => {
  // The reason the builder names every field instead of spreading the record: the field a
  // spread would have carried is always the one nobody thought about.
  const nodes = [
    folder('f1', 'F'),
    entity('e1', 'prod', {
      kind: 'ssh',
      mcp: { view: true },
      somethingAddedLater: 'must not appear',
    }),
  ];

  const [entry] = await visibleMcpEntries(vault(nodes));

  assert.equal(JSON.stringify(entry).includes('somethingAddedLater'), false);
  assert.equal(JSON.stringify(entry).includes('must not appear'), false);
});

test('dependencies are named, never given as ids', async () => {
  // An id means nothing to an agent: the only thing that resolves one is the vault it is not
  // allowed to enumerate. The name is what the consent modal it triggers next will say.
  const nodes = [
    folder('f1', 'F'),
    entity('v1', 'office vpn', { kind: 'vpn' }),
    entity('e1', 'orders-db', { kind: 'db', mcp: { view: true }, dependsOn: ['v1', 'gone'] }),
  ];

  const [entry] = await visibleMcpEntries(vault(nodes));

  assert.deepEqual(entry.dependsOn, ['office vpn']);
});

test('the capabilities say what may be done beyond looking', () => {
  assert.deepEqual(capabilitiesOf(normalizeMcpAccess({ view: true })), {
    use: false,
    edit: false,
    create: false,
    delete: false,
  });
  assert.deepEqual(capabilitiesOf(normalizeMcpAccess({ edit: true })), {
    use: true,
    edit: true,
    create: false,
    delete: false,
  });
  assert.deepEqual(capabilitiesOf(normalizeMcpAccess({ delete: 'own' })), {
    use: true,
    edit: true,
    create: true,
    delete: true,
  });
});

test('a node with no details is never an entry, whatever its switches say', () => {
  const node: TreeNode = { id: 'x', name: 'broken', type: 'entity', parentId: 'f1' };
  const resolved = resolveMcpInTree(node, () => folder('f1', 'F', { mcp: { view: true } }));

  const built = mcpEntryFor(node, {
    resolved,
    folderName: 'F',
    hasPassword: false,
    hasPrivateKey: false,
    hasNotes: false,
    hasTotp: false,
    dependsOn: [],
  });

  assert.equal(built, undefined);
});

test('the keychain is not read for entries nobody opened', async () => {
  // The cost argument, asserted: filtering happens before the five reads, so a large vault that
  // has opened nothing costs none of them however often an agent asks.
  let reads = 0;
  const nodes = [folder('f1', 'F'), ...Array.from({ length: 50 }, (_, i) => entity(`e${i}`, `x${i}`, {}))];
  const base = vault(nodes);
  const counted: McpVaultSource = {
    ...base,
    getPassword: () => {
      reads += 1;
      return Promise.resolve(undefined);
    },
  };

  await visibleMcpEntries(counted);

  assert.equal(reads, 0);
});
