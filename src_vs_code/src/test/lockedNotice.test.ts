import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LOCKED_BUTTON_LABELS, lockedButtons, lockedNotice } from '../lockedNotice';

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

test('a vault whose Sync PIN is stored is offered only the unlock', () => {
  // Setting a PIN is not what a locked vault needs, and the action behind that button is a
  // fleet-wide re-key — the worst thing to put beside a lock somebody expected to unlock.
  assert.deepEqual(lockedButtons('yes'), ['unlock']);
});

test('a vault with no stored Sync PIN is offered both, unlock FIRST', () => {
  // Here the PIN offer is real — background sync cannot run unattended without one — but the
  // destructive action is never the first button.
  assert.deepEqual(lockedButtons('no'), ['unlock', 'setPin']);
});

test('an UNKNOWN stored-PIN answer is treated exactly like a stored one', () => {
  // A keychain that will not open says nothing about whether a PIN is stored. Guessing "no"
  // there puts a vault rewrite one click away from somebody whose PIN is perfectly fine.
  assert.deepEqual(lockedButtons('unknown'), ['unlock']);
});

test('the unlock label does not claim to need a security key', () => {
  // The command behind it opens the vault by whatever the vault has — a key touch, a typed
  // PIN, or a choice. Labelled "Unlock with Security Key", a person with no key reads it as
  // "not for me" and presses the other one.
  assert.equal(LOCKED_BUTTON_LABELS.unlock, 'Unlock…');
  assert.equal(LOCKED_BUTTON_LABELS.setPin, 'Set Sync PIN…');
});
