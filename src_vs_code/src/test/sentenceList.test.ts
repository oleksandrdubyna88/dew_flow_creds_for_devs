import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listOf } from '../sentenceList';

/** The one "a, b and c" every sentence that names several things uses. */

test('none, one, two and three names read as a sentence, without an Oxford comma', () => {
  assert.equal(listOf([]), '');
  assert.equal(listOf(['a']), 'a');
  assert.equal(listOf(['a', 'b']), 'a and b');
  assert.equal(listOf(['a', 'b', 'c']), 'a, b and c');
});
