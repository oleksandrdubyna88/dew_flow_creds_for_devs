import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lockedNotice } from '../lockedNotice';

test('one locked vault reads exactly as it always did', () => {
  const notice = lockedNotice(['a@example.com']);

  assert.equal(notice.message, 'Auto-sync: the vault of a@example.com is locked on this machine.');
  assert.equal(notice.single, true, 'a single vault keeps its own two buttons');
});

test('three locked vaults are one message that names all three', () => {
  // The defect: three separate popups, stacked in the corner, each covering the previous
  // one's buttons — and with four accounts the last one is off-screen entirely.
  const notice = lockedNotice(['a@example.com', 'b@example.com', 'c@example.com']);

  assert.equal(
    notice.message,
    'Auto-sync: 3 vaults are locked on this machine — a@example.com, b@example.com, c@example.com.',
  );
  assert.equal(notice.single, false);
  for (const email of ['a@example.com', 'b@example.com', 'c@example.com']) {
    assert.ok(notice.message.includes(email), `${email} must be named, not counted away`);
  }
});

test('the same account listed twice is one entry', () => {
  // A cycle can visit an account more than once; the reader should not be told twice.
  const notice = lockedNotice(['a@example.com', 'a@example.com']);

  assert.equal(notice.single, true);
  assert.equal(notice.message.includes('2 vaults'), false);
});

test('an empty email is not listed as a blank name', () => {
  const notice = lockedNotice(['', 'b@example.com']);

  assert.equal(notice.single, true);
  assert.equal(notice.message, 'Auto-sync: the vault of b@example.com is locked on this machine.');
});
