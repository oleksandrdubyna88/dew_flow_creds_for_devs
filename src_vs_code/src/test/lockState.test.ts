import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LockState } from '../lockState';

/**
 * What "locked" is allowed to mean.
 *
 * The bug this exists for: pressing *Lock Vaults* cleared the cached master key and
 * nothing else, so the next automatic sync — five minutes later by default — silently
 * re-opened the vault using the Sync PIN saved in the OS keychain. The button said the
 * next sync "will ask for the PIN or a key touch". It did not ask. It just used it.
 *
 * So locking has to do more than forget: it has to REFUSE the stored secret until a
 * person says otherwise.
 */

const MINUTE = 60_000;

test('a fresh state is unlocked, and background work may use a stored PIN', () => {
  const state = new LockState();

  assert.equal(state.isLocked(), false);
  assert.equal(state.allowsSilentUnlock(), true);
});

test('locking refuses the stored PIN, which is the whole point', () => {
  const state = new LockState();

  state.lock();

  assert.equal(state.isLocked(), true);
  assert.equal(
    state.allowsSilentUnlock(),
    false,
    'otherwise auto-sync undoes the lock within minutes and nobody is told',
  );
});

test('a person unlocking clears the lock', () => {
  const state = new LockState();
  state.lock();

  state.noteUnlocked(0);

  assert.equal(state.isLocked(), false);
  assert.equal(state.allowsSilentUnlock(), true);
});

test('auto-lock is off when the setting is zero, whatever the idle time', () => {
  const state = new LockState();
  state.noteUnlocked(0);

  assert.equal(state.dueForAutoLock(999 * MINUTE, 0), false);
});

test('auto-lock waits for the idle window and then fires', () => {
  const state = new LockState();
  state.noteUnlocked(0);

  assert.equal(state.dueForAutoLock(59 * MINUTE, 60), false);
  assert.equal(state.dueForAutoLock(60 * MINUTE, 60), true);
});

test('using the vault postpones auto-lock', () => {
  const state = new LockState();
  state.noteUnlocked(0);

  state.noteUnlocked(50 * MINUTE);

  assert.equal(state.dueForAutoLock(100 * MINUTE, 60), false, 'the window restarts on use');
  assert.equal(state.dueForAutoLock(110 * MINUTE, 60), true);
});

test('a vault that was never unlocked has nothing to auto-lock', () => {
  const state = new LockState();

  assert.equal(state.dueForAutoLock(999 * MINUTE, 60), false);
});

test('an already-locked vault is not locked again', () => {
  const state = new LockState();
  state.noteUnlocked(0);
  state.lock();

  assert.equal(state.dueForAutoLock(999 * MINUTE, 60), false, 'nothing to do, and no second notification');
});

test('a clock that jumped backwards does not trigger a surprise lock', () => {
  const state = new LockState();
  state.noteUnlocked(100 * MINUTE);

  // "now" is before the last use. Elapsed is negative, not enormous.
  assert.equal(state.dueForAutoLock(10 * MINUTE, 60), false);
});

test('locking twice is harmless', () => {
  const state = new LockState();
  state.lock();
  state.lock();

  assert.equal(state.isLocked(), true);
});
