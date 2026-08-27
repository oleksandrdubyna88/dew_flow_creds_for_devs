import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARRIVAL_WINDOW_MS, ArrivalHighlights } from '../arrivalHighlight';

/**
 * The "here it is" tint (tails T13): a row that just APPEARED — an accepted share, an import, a
 * fresh entity or folder, the row you had selected when a filter closed — glows for a few
 * seconds so "it worked" and "here it is" are one event. Pure: the clock is an argument.
 */

test('an announced row is highlighted, and stops being highlighted when the window lapses', () => {
  const highlights = new ArrivalHighlights();
  highlights.announce('a1', 'e1', 1_000);

  assert.equal(highlights.isActive('a1', 'e1', 1_000), true);
  assert.equal(highlights.isActive('a1', 'e1', 1_000 + ARRIVAL_WINDOW_MS - 1), true);
  assert.equal(highlights.isActive('a1', 'e1', 1_000 + ARRIVAL_WINDOW_MS), false);
});

test('a row nobody announced is not highlighted', () => {
  const highlights = new ArrivalHighlights();
  assert.equal(highlights.isActive('a1', 'e1', 0), false);
});

test('a second arrival does not cut the first one short', () => {
  const highlights = new ArrivalHighlights();
  highlights.announce('a1', 'first', 1_000);
  highlights.announce('a1', 'second', 3_000);

  assert.equal(highlights.isActive('a1', 'first', 1_000 + ARRIVAL_WINDOW_MS - 1), true);
  assert.equal(highlights.isActive('a1', 'second', 3_000 + ARRIVAL_WINDOW_MS - 1), true);
});

test('re-announcing the same row restarts its window rather than stacking entries', () => {
  const highlights = new ArrivalHighlights();
  highlights.announce('a1', 'e1', 1_000);
  highlights.announce('a1', 'e1', 4_000);

  assert.equal(highlights.isActive('a1', 'e1', 4_000 + ARRIVAL_WINDOW_MS - 1), true);
  assert.equal(highlights.size, 1);
});

test('the sweep forgets lapsed rows so the map cannot grow for a long-lived window', () => {
  const highlights = new ArrivalHighlights();
  highlights.announce('a1', 'e1', 1_000);
  highlights.announce('a1', 'e2', 2_000);

  highlights.sweep(1_000 + ARRIVAL_WINDOW_MS);
  assert.equal(highlights.size, 1, 'the lapsed row should be gone, the live one kept');
});

test('accounts do not bleed into each other', () => {
  const highlights = new ArrivalHighlights();
  highlights.announce('a1', 'e1', 1_000);
  assert.equal(highlights.isActive('a2', 'e1', 1_000), false);
});
