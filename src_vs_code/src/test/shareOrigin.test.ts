import assert from 'node:assert/strict';
import { test } from 'node:test';
import { originKey, recordOrigin, resolveOrigin } from '../shareOrigin';

/**
 * Which local entry a re-shared item is an update OF.
 *
 * The problem this solves: accepting a share always minted a fresh local id, so a
 * colleague who re-sent the same credential six months later gave you a second copy next
 * to the first, with nothing saying which was current.
 *
 * The problem it must NOT create: letting the sender name a local id would let them
 * address — and silently overwrite — an entry of yours they never sent. So the map is
 * ours, keyed by the pair (who sent it, what they called it), and a sender who never sent
 * you a thing can never match one.
 */

const empty: Record<string, string> = {};

test('the key is the sender AND their id — neither alone', () => {
  // Their id alone would collide across senders; their address alone would collapse
  // every entry one person ever sent into a single slot.
  assert.notEqual(originKey('alice@corp', 'e1'), originKey('bob@corp', 'e1'));
  assert.notEqual(originKey('alice@corp', 'e1'), originKey('alice@corp', 'e2'));
  assert.equal(originKey('Alice@Corp', 'e1'), originKey('alice@corp', 'e1'));
});

test('a first-time share from anyone resolves to nothing', () => {
  assert.equal(resolveOrigin(empty, 'alice@corp', 'e1', () => true), undefined);
});

test('a re-share from the same sender finds what it updated before', () => {
  const map = recordOrigin(empty, 'alice@corp', 'e1', 'local-1');

  assert.equal(resolveOrigin(map, 'alice@corp', 'e1', () => true), 'local-1');
});

test('a different sender with the same id of their own matches nothing', () => {
  const map = recordOrigin(empty, 'alice@corp', 'e1', 'local-1');

  assert.equal(resolveOrigin(map, 'bob@corp', 'e1', () => true), undefined);
});

test('a mapping to an entry that has since been deleted resolves to nothing', () => {
  // Otherwise the update path would try to overwrite a node that is gone and the
  // recipient would see a failure instead of an ordinary new item.
  const map = recordOrigin(empty, 'alice@corp', 'e1', 'local-1');

  assert.equal(resolveOrigin(map, 'alice@corp', 'e1', () => false), undefined);
});

test('re-recording the same pair points at the newest local entry', () => {
  // "Keep both" is a legitimate answer; the next share should offer to update the copy
  // that was accepted most recently, not the one from a year ago.
  const map = recordOrigin(recordOrigin(empty, 'alice@corp', 'e1', 'local-1'), 'alice@corp', 'e1', 'local-2');

  assert.equal(resolveOrigin(map, 'alice@corp', 'e1', () => true), 'local-2');
});

test('recording never mutates the map it was given', () => {
  const before = recordOrigin(empty, 'alice@corp', 'e1', 'local-1');
  const after = recordOrigin(before, 'bob@corp', 'e2', 'local-2');

  assert.equal(Object.keys(before).length, 1);
  assert.equal(Object.keys(after).length, 2);
});
