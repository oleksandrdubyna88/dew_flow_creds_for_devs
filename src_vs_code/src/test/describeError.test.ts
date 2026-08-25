import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeError } from '../describeError';
import { BackupError } from '../cryptoUtils';

/** The one error-to-sentence rule 21 call sites now share (audit 2026-08-25, A1). */

test('an Error yields its message; a non-Error yields its string form', () => {
  assert.equal(describeError(new Error('the disk is full')), 'the disk is full');
  assert.equal(describeError('just a string'), 'just a string');
  assert.equal(describeError(42), '42');
  assert.equal(describeError(undefined), 'undefined');
});

test('a BackupError needs no special case — its message IS the user-facing sentence', () => {
  assert.equal(
    describeError(new BackupError('corrupted', 'Stored vault content does not match the schema.')),
    'Stored vault content does not match the schema.',
  );
});
