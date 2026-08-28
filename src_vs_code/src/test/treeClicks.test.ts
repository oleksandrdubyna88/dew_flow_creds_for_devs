import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { DOUBLE_CLICK_MS, isDoubleClick, restoreNeeded } from '../treeClicks';

/**
 * T11 — the double click that toggled the twisty. The guarantee, named: opening an entry does
 * not change what is expanded.
 */

test('a second click on the same row inside the window is a double click; outside it is not', () => {
  const first = { id: 'e1', time: 1_000, wasOpen: true };
  assert.equal(isDoubleClick(first, 'e1', 1_000 + DOUBLE_CLICK_MS - 1), true);
  assert.equal(isDoubleClick(first, 'e1', 1_000 + DOUBLE_CLICK_MS), false);
  assert.equal(isDoubleClick(first, 'e2', 1_100), false, 'another row is a new first click');
});

test('opening an entry does not change what is expanded — the restore fires only when the toggle flipped it', () => {
  assert.equal(restoreNeeded(true, false, true), true, 'was open, now shut: put it back');
  assert.equal(restoreNeeded(false, true, true), true, 'was shut, now open: put it back');
  assert.equal(restoreNeeded(true, true, true), false, 'unchanged: no repaint');
  assert.equal(restoreNeeded(false, true, false), false, 'a row with no twisty has nothing to restore');
});
