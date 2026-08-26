import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { isSafeEntityId, quarantineUnsafeIds } from '../idQuarantine';
import { BackupBundle, TreeNode } from '../types';

/**
 * Renaming an entity whose own id could break something.
 *
 * <p>An entity id is concatenated into a SecretStorage key and into a file name under
 * `keys/&lt;pid&gt;/`. Both were reachable — `x:sshPrivateKey` addressed another entity's
 * private-key slot, `x/../../../../evil` escaped the key directory — and both are fixed at the
 * point of use. This closes the class instead: such an id never enters the vault.</p>
 *
 * <p><b>The test that matters most is the boring one.</b> `importBundle` is reached by RESTORE
 * and by SYNC, and sync runs it on every cycle. If an ordinary uuid were rewritten, each cycle
 * would rename every entity, push the renames, and every other machine would see its whole
 * vault replaced by strangers. So the ordinary path must be identity — asserted here on the
 * object, not just on its contents.</p>
 *
 * <p>Renaming rather than rejecting is a deliberate choice: refusing the bundle would break
 * importing a vault written by another tool for the sake of one odd id. Nothing is lost, and
 * the map records what an entity was called so a SECOND import updates it instead of adding a
 * duplicate — the mechanism `shareOrigin.ts` already uses, applied to a different source.</p>
 */

function entity(id: string, extra: Record<string, unknown> = {}): TreeNode {
  return {
    id,
    name: id,
    type: 'entity',
    parentId: null,
    details: { id, name: id, kind: 'credential', isSshEnabled: false, ...extra },
  } as unknown as TreeNode;
}

function bundle(nodes: TreeNode[], secrets: Partial<BackupBundle> = {}): BackupBundle {
  return { nodes, passwords: {}, ...secrets } as unknown as BackupBundle;
}

/** Deterministic ids, so a test can name what an entity became. */
function minter(): () => string {
  let n = 0;
  return (): string => {
    n += 1;
    return `fresh-${n}`;
  };
}

const UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

test('an ordinary uuid is safe, and so are the shapes an older build may have used', () => {
  assert.equal(isSafeEntityId(UUID), true);
  assert.equal(isSafeEntityId('entity-17'), true);
  assert.equal(isSafeEntityId('a.b.c'), true);
});

test('anything that could break a key or a path is not safe', () => {
  for (const id of [
    'x:sshPrivateKey', // reaches another entity's private-key slot
    'x_y', // the account/entity separator
    'x/../../../../evil', // escapes the key directory
    '..\\..\\evil',
    '/etc/passwd',
    '..',
    '.hidden',
    '',
    'x y',
    'x%3Ay',
  ]) {
    assert.equal(isSafeEntityId(id), false, JSON.stringify(id));
  }
});

test('a bundle of ordinary ids comes back as the SAME OBJECT', () => {
  // Sync calls this every cycle. Identity is the guarantee: a rebuilt-but-equal bundle would
  // still be correct today and would stop being obviously correct the first time someone
  // changed the rebuild.
  const input = bundle([entity(UUID), entity('entity-2')]);

  const result = quarantineUnsafeIds(input, {}, minter());

  assert.equal(result.bundle, input, 'the ordinary path must not rebuild anything');
  assert.deepEqual(result.renamed, {});
});

test('an unsafe id is replaced, and the map says what it was', () => {
  const result = quarantineUnsafeIds(bundle([entity('x:sshPrivateKey')]), {}, minter());

  assert.deepEqual(result.renamed, { 'x:sshPrivateKey': 'fresh-1' });
  assert.equal(result.bundle.nodes[0].id, 'fresh-1');
  assert.equal(result.bundle.nodes[0].details?.id, 'fresh-1', 'the copy inside details too');
});

test('the SAFE entities in a mixed bundle keep their ids', () => {
  // One odd entity must not cost a person the identity of everything beside it.
  const result = quarantineUnsafeIds(bundle([entity(UUID), entity('x:notes')]), {}, minter());

  assert.deepEqual(
    result.bundle.nodes.map((n) => n.id),
    [UUID, 'fresh-1'],
  );
});

test("a renamed entity's secrets follow it, in every kind", () => {
  // A password left under the old key is a credential the entity can no longer read — and one
  // still sitting in the keychain under a name nothing will ever purge.
  const bad = 'x:sshPrivateKey';
  const result = quarantineUnsafeIds(
    bundle([entity(bad)], {
      passwords: { [bad]: 'pw' },
      privateKeys: { [bad]: 'key' },
      vpnConfigs: { [bad]: 'vpn' },
      dbConnections: { [bad]: 'db' },
      notes: { [bad]: 'note' },
      attachments: { [bad]: 'file' },
      images: { [bad]: 'img' },
      totps: { [bad]: 'seed' },
    } as Partial<BackupBundle>),
    {},
    minter(),
  );

  for (const [kind, value] of [
    ['passwords', 'pw'],
    ['privateKeys', 'key'],
    ['vpnConfigs', 'vpn'],
    ['dbConnections', 'db'],
    ['notes', 'note'],
    ['attachments', 'file'],
    ['images', 'img'],
    ['totps', 'seed'],
  ] as const) {
    const map = result.bundle[kind] as Record<string, string>;
    assert.equal(map['fresh-1'], value, kind);
    assert.equal(map[bad], undefined, `${kind} kept the old key`);
  }
});

test("a renamed entity's TOMBSTONE follows it, or its deletion stops applying", () => {
  const bad = 'x:notes';
  const result = quarantineUnsafeIds(
    bundle([entity(bad)], { tombstones: { [bad]: { deletedAt: 1, v: {} } } } as Partial<BackupBundle>),
    {},
    minter(),
  );

  assert.ok(result.bundle.tombstones?.['fresh-1'] !== undefined);
  assert.equal(result.bundle.tombstones?.[bad], undefined);
});

test('the horizon is NOT rekeyed — it is keyed by device, not by entity', () => {
  // Rewriting it would corrupt the version vector and make every machine re-send its tree.
  const result = quarantineUnsafeIds(
    bundle([entity('x:notes')], { horizon: { 'device-1': 7 } } as Partial<BackupBundle>),
    {},
    minter(),
  );

  assert.deepEqual(result.bundle.horizon, { 'device-1': 7 });
});

test('a folder rename carries its children with it', () => {
  // The child's parentId points at the old id; left alone, the whole subtree would detach and
  // its entities would appear at the account root.
  const folder = { id: 'f:1', name: 'Team', type: 'folder', parentId: null } as unknown as TreeNode;
  const child = { ...entity(UUID), parentId: 'f:1' } as TreeNode;

  const result = quarantineUnsafeIds(bundle([folder, child]), {}, minter());

  assert.equal(result.bundle.nodes[0].id, 'fresh-1');
  assert.equal(result.bundle.nodes[1].parentId, 'fresh-1', 'the child followed');
});

test('a reference to a renamed entity is repointed — key source, jump host, dependency', () => {
  // A dangling reference is not cosmetic: a jump host that resolves to nothing fails the
  // connection with an error about the wrong hop.
  const bad = 'k:1';
  const referrer = entity(UUID, {
    sshKeyEntityId: bad,
    jumpHostEntityId: bad,
    dependsOn: [bad, UUID],
  });

  const result = quarantineUnsafeIds(bundle([entity(bad), referrer]), {}, minter());

  const details = result.bundle.nodes[1].details as unknown as Record<string, unknown>;
  assert.equal(details.sshKeyEntityId, 'fresh-1');
  assert.equal(details.jumpHostEntityId, 'fresh-1');
  assert.deepEqual(details.dependsOn, ['fresh-1', UUID], 'and the safe one is untouched');
});

test('importing the SAME file twice reuses the id it was given, rather than duplicating', () => {
  // The whole reason the map is kept. Without it a second restore of one backup would leave
  // two copies of every odd entity, with nothing saying which is current.
  const first = quarantineUnsafeIds(bundle([entity('x:notes')]), {}, minter());

  const second = quarantineUnsafeIds(bundle([entity('x:notes')]), first.renamed, minter());

  assert.equal(second.bundle.nodes[0].id, first.bundle.nodes[0].id);
});

test('a fresh id is itself safe — the rename must not need renaming', () => {
  const result = quarantineUnsafeIds(bundle([entity('x:notes')]));

  assert.equal(isSafeEntityId(result.bundle.nodes[0].id), true, result.bundle.nodes[0].id);
});

test('two unsafe entities get two different ids', () => {
  const result = quarantineUnsafeIds(bundle([entity('x:notes'), entity('y:notes')]), {}, minter());

  const ids = result.bundle.nodes.map((n) => n.id);
  assert.equal(new Set(ids).size, 2, ids.join());
});
