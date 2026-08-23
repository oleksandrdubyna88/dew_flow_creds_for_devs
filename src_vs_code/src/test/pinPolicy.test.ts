import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { MIN_PIN_LENGTH, validatePin } from '../pinPolicy';

test('empty and short PINs are rejected, long ones accepted', () => {
  assert.match(validatePin('') ?? '', /must not be empty/);
  assert.match(validatePin('123') ?? '', /at least/);
  assert.equal((('x'.repeat(MIN_PIN_LENGTH))).length, MIN_PIN_LENGTH);
  assert.equal(validatePin('x'.repeat(MIN_PIN_LENGTH)), undefined);
  assert.equal(validatePin('correct horse battery'), undefined);
});
