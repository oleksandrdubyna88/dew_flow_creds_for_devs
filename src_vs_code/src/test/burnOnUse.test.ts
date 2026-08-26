import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BurnStorage, burnIfOneUse } from '../burnOnUse';
import { EntityKind, TreeNode } from '../types';
import { BurnPolicy } from '../entityExpiry';

/**
 * What a successful agent call destroys, and — the more important half — what it does not.
 * Every `false` here is somebody keeping a credential they still need.
 */

function storage(node: TreeNode | undefined): BurnStorage & { deleted: string[] } {
  const deleted: string[] = [];
  return {
    deleted,
    getNode: () => node,
    deleteNodeRecursive: (_a, id) => {
      deleted.push(id);
      return Promise.resolve([id]);
    },
  };
}

function entity(kind: EntityKind, burnPolicy?: BurnPolicy): TreeNode {
  return {
    id: 'e1',
    name: 'temp token',
    type: 'entity',
    details: { id: 'e1', name: 'temp token', kind, isSshEnabled: kind === 'ssh', burnPolicy },
  } as TreeNode;
}

test('a one-use entry is deleted after the agent uses it', async () => {
  const s = storage(entity('credential', 'oneUse'));

  assert.equal(await burnIfOneUse(s, 'a1', 'e1'), true);
  assert.deepEqual(s.deleted, ['e1']);
});

test('an ordinary entry is untouched', async () => {
  const s = storage(entity('credential'));

  assert.equal(await burnIfOneUse(s, 'a1', 'e1'), false);
  assert.deepEqual(s.deleted, []);
});

test('a timed entry is not burned by use — its clock is the only thing that ends it', async () => {
  const s = storage(entity('credential', 'ttl'));

  assert.equal(await burnIfOneUse(s, 'a1', 'e1'), false);
  assert.deepEqual(s.deleted, []);
});

test('a window-scoped entry is not burned by use either', async () => {
  const s = storage(entity('credential', 'onClose'));

  assert.equal(await burnIfOneUse(s, 'a1', 'e1'), false);
});

test('an entry that no longer exists is not an error', async () => {
  // The grant outlives the entity: it was deleted between minting and use.
  const s = storage(undefined);

  assert.equal(await burnIfOneUse(s, 'a1', 'gone'), false);
  assert.deepEqual(s.deleted, []);
});

test('an sshkey marked one-use by an older build is NOT deleted', async () => {
  // The broker never serves a key pair, so `oneUse` there could never fire and the write
  // path now refuses it. A record written before that rule must not be destroyed by the
  // first broker call that happens to name it — the failure would be silent and total.
  const s = storage(entity('sshkey', 'oneUse'));

  assert.equal(await burnIfOneUse(s, 'a1', 'e1'), false);
  assert.deepEqual(s.deleted, []);
});

test('every kind the broker serves can burn', async () => {
  for (const kind of ['credential', 'ssh', 'db', 'terminal', 'script', 'vpn'] as EntityKind[]) {
    const s = storage(entity(kind, 'oneUse'));
    assert.equal(await burnIfOneUse(s, 'a1', 'e1'), true, kind);
  }
});
