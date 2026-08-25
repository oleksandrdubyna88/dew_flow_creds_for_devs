import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  bumpVector,
  concurrent,
  covers,
  dominates,
  lastWriter,
  mergeVectors,
} from '../versionVector';

/**
 * The causal-merge primitives. syncMerge.test.ts exercises them through whole scenarios,
 * but the exact boundaries — an equal vector, an empty one, a genuine seq tie — are what a
 * regression would slip through, so they get their own assertions here.
 */

test('a vector covers and does not dominate itself', () => {
  const v = { A: 2, B: 1 };
  assert.equal(covers(v, v), true);
  assert.equal(covers(v, { ...v }), true);
  assert.equal(dominates(v, { ...v }), false, 'equal is not strictly ahead');
  assert.equal(dominates({ ...v }, v), false);
  assert.equal(concurrent(v, { ...v }), false, 'equal vectors are not concurrent');
});

test('dominates is strict causal order; concurrent is neither-way', () => {
  const ahead = { A: 2, B: 1 };
  const behind = { A: 1, B: 1 };
  assert.equal(dominates(ahead, behind), true);
  assert.equal(dominates(behind, ahead), false);
  assert.equal(concurrent(ahead, behind), false);

  // Each has something the other lacks — a real concurrent edit.
  assert.equal(concurrent({ A: 2, B: 1 }, { A: 1, B: 2 }), true);
});

test('a missing component counts as zero', () => {
  assert.equal(covers({ A: 1 }, { A: 1, B: 0 }), true);
  assert.equal(covers({ A: 1 }, { A: 1, B: 1 }), false);
});

test('lastWriter is empty for an empty vector and breaks a seq tie by larger id', () => {
  assert.equal(lastWriter({}), '');
  assert.equal(lastWriter({ A: 5 }), 'A');
  assert.equal(lastWriter({ A: 1, B: 1 }), 'B', 'a tie goes to the lexicographically larger id');
  assert.equal(lastWriter({ A: 3, B: 1 }), 'A', 'highest seq wins over id order');
});

test('bumpVector sets one device without disturbing the rest; mergeVectors takes the max', () => {
  assert.deepEqual(bumpVector({ A: 1 }, 'B', 2), { A: 1, B: 2 });
  assert.deepEqual(bumpVector({ A: 1, B: 1 }, 'A', 5), { A: 5, B: 1 });
  assert.deepEqual(mergeVectors({ A: 2, B: 1 }, { A: 1, B: 3 }), { A: 2, B: 3 });
});
