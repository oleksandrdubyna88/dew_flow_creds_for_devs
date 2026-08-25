import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeProfiles } from '../syncMerge';
import { ProfileSnapshot } from '../syncMerge';

/**
 * The merge's own behaviour when the local node list is empty but its horizon is not.
 *
 * <p>This is not a hypothetical. Sealing the metadata cache (0.57.0) gave the tree a way to
 * come back EMPTY — a device key that no longer opens the slot yields `[]` — while the
 * tombstone and horizon slots, which are not sealed, survive intact. What the merge then does
 * is the dangerous part, and it is correct in isolation: a remote node with no local
 * counterpart, no local tombstone, and a version the local horizon already covers is a
 * "phantom" from a stale backup and is dropped. That guard is exactly right for the case it
 * was built for, and catastrophic for this one.</p>
 *
 * <p>These tests pin the behaviour so nobody "fixes" the guard, and record why the caller must
 * refuse to sync at all when the tree could not be read — see `SyncManager.syncProfile`.</p>
 */

const DEVICE = 'device-a';

function snapshot(over: Partial<ProfileSnapshot>): ProfileSnapshot {
  return {
    nodes: [],
    passwords: {},
    privateKeys: {},
    vpnConfigs: {},
    dbConnections: {},
    notes: {},
    attachments: {},
    images: {},
    tombstones: {},
    horizon: {},
    ...over,
  } as ProfileSnapshot;
}

const REMOTE_NODE = {
  id: 'e1',
  name: 'prod-db',
  type: 'entity' as const,
  v: { [DEVICE]: 7 },
  details: { id: 'e1', name: 'prod-db', isSshEnabled: false },
};

test('an empty local tree with a live horizon erases the remote in the merge', () => {
  // The mechanism, demonstrated rather than described. If this ever stops being true the
  // fail-closed guard in SyncManager can be reconsidered; while it is true, that guard is the
  // only thing standing between a keychain reset and a destroyed remote vault.
  const local = snapshot({ nodes: [], horizon: { [DEVICE]: 9 } });
  const remote = snapshot({ nodes: [REMOTE_NODE] });

  const { merged, remoteChanged } = mergeProfiles(local, remote, Date.now());

  assert.deepEqual(merged.nodes, [], 'every remote node is dropped as an already-collected phantom');
  assert.equal(remoteChanged, true, 'and the caller would push this emptiness over the good copy');
});

test('the same merge with an honestly empty horizon keeps the remote', () => {
  // A genuinely new machine — empty tree, empty horizon — must ADOPT the remote, which is why
  // "the tree is empty" cannot itself be the signal to refuse.
  const local = snapshot({ nodes: [], horizon: {} });
  const remote = snapshot({ nodes: [REMOTE_NODE] });

  const { merged } = mergeProfiles(local, remote, Date.now());

  assert.equal(merged.nodes.length, 1);
  assert.equal(merged.nodes[0].id, 'e1');
});

test('a real deletion still propagates — the guard it relies on is untouched', () => {
  // The case the phantom guard exists for: local deleted the node, kept the tombstone, and the
  // remote still has it. That must resolve to deleted, not resurrected.
  const local = snapshot({
    nodes: [],
    tombstones: { e1: { deletedAt: Date.now(), v: { [DEVICE]: 8 } } },
    horizon: { [DEVICE]: 9 },
  });
  const remote = snapshot({ nodes: [REMOTE_NODE] });

  const { merged } = mergeProfiles(local, remote, Date.now());

  assert.deepEqual(merged.nodes, [], 'the deletion wins, as it should');
  assert.ok(merged.tombstones.e1 !== undefined, 'and it stays recorded');
});
