import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptySnapshot, mergeProfiles, ProfileSnapshot } from '../syncMerge';
import { Tombstone } from '../versionVector';
import { TreeNode } from '../types';

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

function node(
  id: string,
  updatedAt: number,
  v: Record<string, number>,
  extra?: Partial<TreeNode>,
): TreeNode {
  return { id, name: `node-${id}`, type: 'entity', updatedAt, v, ...extra };
}

function snap(partial?: Partial<ProfileSnapshot>): ProfileSnapshot {
  return { ...emptySnapshot(), ...partial };
}

// ---- basic union / secret plumbing (unchanged behaviour) ----

test('union: nodes existing on only one side survive on both', () => {
  const local = snap({ nodes: [node('a', 100, { A: 1 })], passwords: { a: 'pa' } });
  const remote = snap({ nodes: [node('b', 200, { B: 1 })], passwords: { b: 'pb' } });
  const { merged } = mergeProfiles(local, remote, NOW);
  assert.deepEqual(merged.nodes.map((n) => n.id).sort(), ['a', 'b']);
  assert.deepEqual(merged.passwords, { a: 'pa', b: 'pb' });
});

// ---- causality: a dominating vector wins regardless of updatedAt ----

test('a causally-later edit wins even with a LOWER wall-clock (clock skew)', () => {
  // Device A edited twice (A:2); device B's copy is causally behind (A:1)
  // but has a higher — skewed — timestamp. Causality must beat the clock.
  const local = snap({ nodes: [node('x', 50, { A: 2 }, { name: 'A latest' })], passwords: { x: 'new' } });
  const remote = snap({ nodes: [node('x', 9_999, { A: 1 }, { name: 'stale' })], passwords: { x: 'old' } });
  const { merged } = mergeProfiles(local, remote, NOW);
  assert.equal(merged.nodes[0].name, 'A latest');
  assert.equal(merged.passwords.x, 'new');
});

// ---- concurrent edits on different devices ----

test('concurrent edits (neither vector dominates) resolve by updatedAt', () => {
  const local = snap({ nodes: [node('x', 100, { A: 2, B: 1 }, { name: 'from A' })] });
  const remote = snap({ nodes: [node('x', 90, { A: 1, B: 2 }, { name: 'from B' })] });
  const { merged } = mergeProfiles(local, remote, NOW);
  assert.equal(merged.nodes[0].name, 'from A'); // higher updatedAt
});

test('concurrent edits with equal updatedAt resolve deterministically by last-writer id', () => {
  const local = snap({ nodes: [node('x', 100, { AA: 2, BB: 1 }, { name: 'AA' })] });
  const remote = snap({ nodes: [node('x', 100, { AA: 1, BB: 2 }, { name: 'BB' })] });
  const forward = mergeProfiles(local, remote, NOW).merged.nodes[0].name;
  const backward = mergeProfiles(remote, local, NOW).merged.nodes[0].name;
  assert.equal(forward, backward); // order-independent
  assert.equal(forward, 'BB'); // last-writer 'BB' > 'AA'
});

// ---- deletion / resurrection by causality ----

test('a deletion propagates; a causally-newer edit resurrects', () => {
  const del: Tombstone = { deletedAt: NOW - DAY, v: { A: 2 } };
  const gone = mergeProfiles(
    snap({ nodes: [node('x', NOW - 2 * DAY, { A: 1 })], passwords: { x: 'p' } }),
    snap({ tombstones: { x: del } }),
    NOW,
  ).merged;
  assert.equal(gone.nodes.length, 0);

  const alive = mergeProfiles(
    snap({ nodes: [node('x', NOW, { A: 3 })], passwords: { x: 'p' } }), // edit after delete
    snap({ tombstones: { x: del } }),
    NOW,
  ).merged;
  assert.equal(alive.nodes.length, 1);
});

// ---- THE rollback guard: stale backup after tombstone GC ----

test('a >90-day-old backup cannot resurrect a deleted entry after tombstone GC', () => {
  // History on this machine: x created (A:1) then deleted (A:2); the tombstone
  // has since been garbage-collected, but the horizon still remembers A:2.
  const local = snap({ horizon: { A: 2 } }); // no node, no tombstone left
  // Attacker restores an ancient backup as the remote: x is "alive" at A:1.
  const remote = snap({ nodes: [node('x', NOW - 100 * DAY, { A: 1 })], passwords: { x: 'leaked' } });
  const { merged } = mergeProfiles(local, remote, NOW);
  assert.equal(merged.nodes.length, 0, 'phantom must be rejected');
  assert.equal(merged.passwords.x, undefined);
});

test('a genuinely new offline node (beyond the horizon) is NOT rejected as a phantom', () => {
  const local = snap({ horizon: { A: 2 } });
  const remote = snap({ nodes: [node('x', NOW, { A: 5 })], passwords: { x: 'real' } }); // A:5 > horizon
  const { merged } = mergeProfiles(local, remote, NOW);
  assert.equal(merged.nodes.length, 1);
  assert.equal(merged.passwords.x, 'real');
});

test('tombstones past the TTL are hard-deleted but the horizon retains their vector', () => {
  const old: Tombstone = { deletedAt: NOW - 91 * DAY, v: { A: 9 } };
  const { merged } = mergeProfiles(snap({ tombstones: { x: old } }), snap(), NOW);
  assert.equal(merged.tombstones.x, undefined); // GC'd
  assert.equal(merged.horizon.A, 9); // but remembered
});

// ---- legacy (pre-vector) vaults ----

test('legacy nodes without vectors merge by updatedAt (backward compatible)', () => {
  const local = snap({ nodes: [{ id: 'x', name: 'old', type: 'entity', updatedAt: 100 }] });
  const remote = snap({ nodes: [{ id: 'x', name: 'newer', type: 'entity', updatedAt: 200 }] });
  const { merged } = mergeProfiles(local, remote, NOW);
  assert.equal(merged.nodes[0].name, 'newer');
});

test('a legacy numeric tombstone is honoured', () => {
  const local = snap({ nodes: [{ id: 'x', name: 'x', type: 'entity', updatedAt: 100 }] });
  const remote = snap({ tombstones: { x: 200 } }); // legacy bare-number tombstone
  const { merged } = mergeProfiles(local, remote, NOW);
  assert.equal(merged.nodes.length, 0);
});

// ---- children re-parent when a parent doesn't survive ----

test('children of a deleted folder re-parent to root', () => {
  const local = snap({ nodes: [node('child', 300, { A: 1 }, { parentId: 'folder' })] });
  const remote = snap({ tombstones: { folder: { deletedAt: NOW, v: { A: 5 } } } });
  const { merged } = mergeProfiles(local, remote, NOW);
  assert.equal(merged.nodes[0].parentId, null);
});

// ---- idempotence ----

test('identical sides produce no changes in either direction', () => {
  const a = snap({ nodes: [node('a', 100, { A: 1 })], passwords: { a: 'p' }, horizon: { A: 1 } });
  const { localChanged, remoteChanged } = mergeProfiles(a, structuredClone(a), NOW);
  assert.equal(localChanged, false);
  assert.equal(remoteChanged, false);
});
