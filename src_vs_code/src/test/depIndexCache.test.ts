import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { DepIndexCache } from '../depIndexCache';
import { TreeNode } from '../types';

/**
 * "Who depends on this", cached for the length of one repaint.
 *
 * <p>`depGraph.ts` decides what the answer IS and is tested there. What is only true here is the
 * lifecycle, and it carries the two failure modes a cache always has.</p>
 *
 * <p><b>Too little caching is a performance defect with a measured precedent.</b> Two things read
 * this — the tree, for the twisty and its children, and the decoration provider, for the row's
 * colour — and both are called per row during a repaint. Rebuilding the index for each of them
 * would put an O(n) walk on every row of an n-entity folder, which is exactly the shape the
 * password-flag cache was introduced to remove ("expanding a folder of 300 entities reads the
 * keychain zero times").</p>
 *
 * <p><b>Too much is a correctness defect, and the worse one:</b> a stale index paints the tree
 * with the relationships from before the edit, and the row keeps its old colour until something
 * unrelated refreshes. So the index survives exactly until `clear()`, which every mutation
 * reaches, and never a moment longer.</p>
 */

function entity(id: string, name: string, extra: Partial<TreeNode> = {}): TreeNode {
  return {
    id,
    name,
    type: 'entity',
    parentId: null,
    details: { id, name, kind: 'credential', isSshEnabled: false },
    ...extra,
  } as unknown as TreeNode;
}

/** An entity that declares a dependency on `targetId`. */
function dependent(id: string, name: string, targetId: string): TreeNode {
  return entity(id, name, {
    details: { id, name, kind: 'credential', isSshEnabled: false, dependsOn: [targetId] },
  } as unknown as Partial<TreeNode>);
}

/**
 * A dependency TARGET wearing a colour.
 *
 * <p>`depColor` lives on the TARGET, not on the entity that points at it — `colorOf(targetId)`
 * reads it off the target node, and a dependent borrows it. Putting it on the dependent instead
 * is silent: the relationship still forms, the colour is simply `undefined`, and a test asserting
 * a colour fails while a test asserting the relationship passes for the wrong reason.</p>
 */
function target(id: string, name: string, color: string): TreeNode {
  return entity(id, name, {
    details: { id, name, kind: 'credential', isSshEnabled: false, depColor: color },
  } as unknown as Partial<TreeNode>);
}

interface Counting {
  cache: DepIndexCache;
  /** How many times the node array was asked for — one per index BUILD. */
  reads(): number;
  setNodes(nodes: TreeNode[]): void;
}

function counting(initial: TreeNode[], accounts: Record<string, TreeNode[]> = {}): Counting {
  let nodes = initial;
  let reads = 0;
  const source = {
    getNodes: (accountId: string): readonly TreeNode[] => {
      reads += 1;
      return accounts[accountId] ?? nodes;
    },
    getNode: (accountId: string, id: string): TreeNode | undefined =>
      (accounts[accountId] ?? nodes).find((n) => n.id === id),
  };
  return {
    cache: new DepIndexCache(source),
    reads: (): number => reads,
    setNodes: (next: TreeNode[]): void => {
      nodes = next;
    },
  };
}

const TARGET = entity('t1', 'prod-db');

test('the index is built ONCE per account, however many rows ask', () => {
  // The whole reason this class exists. Both readers are called per row, so a rebuild per call
  // would put an O(n) walk on every row of an n-entity folder.
  const w = counting([TARGET, dependent('d1', 'api', 't1')]);

  for (let row = 0; row < 300; row += 1) {
    w.cache.hasDependents('a1', 't1');
    w.cache.tintColorKey('a1', 'd1');
    w.cache.relationLabel('a1', 'd1');
  }

  assert.equal(w.reads(), 1, 'nine hundred lookups, one walk');
});

test('a second account gets its OWN index, not the first one', () => {
  // One shared index would show account A's relationships on account B's rows — and a restore
  // can legitimately put the same entity id into two profiles.
  const w = counting([], {
    a1: [TARGET, dependent('d1', 'api', 't1')],
    a2: [TARGET],
  });

  assert.equal(w.cache.hasDependents('a1', 't1'), true);
  assert.equal(w.cache.hasDependents('a2', 't1'), false, 'nothing depends on it over here');
  assert.equal(w.reads(), 2, 'one walk each');
});

test('clear() makes the next read see an edit — a stale index paints the tree wrong', () => {
  // The correctness half. Without this the row keeps the relationship it had before the edit
  // until something unrelated happens to refresh it.
  const w = counting([TARGET]);
  assert.equal(w.cache.hasDependents('a1', 't1'), false);

  w.setNodes([TARGET, dependent('d1', 'api', 't1')]);
  assert.equal(w.cache.hasDependents('a1', 't1'), false, 'not until the refresh — that is the contract');

  w.cache.clear();

  assert.equal(w.cache.hasDependents('a1', 't1'), true);
});

test('clear() throws away EVERY account, not just the one that changed', () => {
  // Nothing is invalidated by hand, so a per-account clear would be a second thing to remember
  // — and the one that gets forgotten is the account nobody was looking at.
  const accounts: Record<string, TreeNode[]> = { a1: [TARGET], a2: [TARGET] };
  const w = counting([], accounts);
  w.cache.hasDependents('a1', 't1');
  w.cache.hasDependents('a2', 't1');
  assert.equal(w.reads(), 2);

  w.cache.clear();
  w.cache.hasDependents('a1', 't1');
  w.cache.hasDependents('a2', 't1');

  assert.equal(w.reads(), 4, 'both were rebuilt');
});

test('a dependent BORROWS the target’s colour, so a relationship reads as one colour', () => {
  // The colour belongs to the target; everything pointing at it takes the same one, which is
  // what makes a relationship visible at a glance rather than a legend to memorise.
  const w = counting([target('t1', 'prod-db', 'depColor3'), dependent('d1', 'api', 't1')]);

  assert.equal(w.cache.tintColorKey('a1', 't1'), 'depColor3', 'the target wears it');
  assert.equal(w.cache.tintColorKey('a1', 'd1'), 'depColor3', 'and the dependent borrows it');
});

test('a target nobody points at yet wears nothing, even with a colour stored', () => {
  // Otherwise a colour set once and then orphaned keeps painting a row that is in no
  // relationship at all — and everything tinted is nothing tinted.
  const w = counting([target('t1', 'prod-db', 'depColor3')]);

  assert.equal(w.cache.tintColorKey('a1', 't1'), undefined);
});

test('an entity in no relationship has no colour and no label', () => {
  // Everything tinted is nothing tinted; a row only takes a colour once there is a relationship.
  const w = counting([entity('lonely', 'nothing points here')]);

  assert.equal(w.cache.tintColorKey('a1', 'lonely'), undefined);
  assert.equal(w.cache.relationLabel('a1', 'lonely'), undefined);
});

test('an entity that no longer exists is undefined, never a crash', () => {
  // A repaint can race a deletion: the tree still holds the id, the vault no longer does.
  const w = counting([TARGET]);

  assert.equal(w.cache.tintColorKey('a1', 'deleted'), undefined);
  assert.equal(w.cache.relationLabel('a1', 'deleted'), undefined);
  assert.doesNotThrow(() => w.cache.hasDependents('a1', 'deleted'));
});

test('a missing entity is answered WITHOUT building an index it does not need', () => {
  // `getNode` says no before `indexFor` is reached, so a repaint full of stale ids costs nothing.
  const w = counting([TARGET]);

  w.cache.tintColorKey('a1', 'deleted');

  assert.equal(w.reads(), 0, 'no walk for a row that is not there');
});

test('clearing a cache nobody has read is harmless', () => {
  const w = counting([TARGET]);

  assert.doesNotThrow(() => w.cache.clear());
  assert.equal(w.reads(), 0);
});

test('the same instance answers both readers — the tree and the decorations cannot disagree', () => {
  // The class's stated purpose. Two indexes built from one node array would agree today and
  // drift the first time one of them is refreshed and the other is not.
  const w = counting([target('t1', 'prod-db', 'depColor5'), dependent('d1', 'api', 't1')]);

  const fromTree = w.cache.hasDependents('a1', 't1');
  const fromDecoration = w.cache.tintColorKey('a1', 't1');

  assert.equal(fromTree, true);
  assert.equal(fromDecoration, 'depColor5');
  assert.equal(w.reads(), 1, 'one index answered both');
});
