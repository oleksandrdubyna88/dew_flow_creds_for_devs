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

test('the person using the vault postpones auto-lock', () => {
  const state = new LockState();
  state.noteUnlocked(0);

  state.noteUserActivity(50 * MINUTE);

  assert.equal(state.dueForAutoLock(100 * MINUTE, 60), false, 'the window restarts on use');
  assert.equal(state.dueForAutoLock(110 * MINUTE, 60), true);
});

test('BACKGROUND sync does not postpone auto-lock', () => {
  // The defect this pins: auto-lock measured "time since the vault key was last used",
  // and auto-sync uses it every five minutes. With auto-sync on, the window never
  // elapsed and auto-lock silently never fired — two features cancelling each other.
  const state = new LockState();
  state.noteUnlocked(0);

  for (let t = 5 * MINUTE; t <= 90 * MINUTE; t += 5 * MINUTE) {
    state.noteBackgroundUnlock(t);
  }

  assert.equal(
    state.dueForAutoLock(61 * MINUTE, 60),
    true,
    'idle means the PERSON has been idle, not that nothing has run',
  );
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

test('a LOCKED vault refuses the secret already on this machine, even to a person', () => {
  // The hole this closes: Lock is for an unattended machine, and Unlock asked for
  // nothing. The stored Sync PIN opened the vault before the security-key branch was
  // ever reached, so anyone who walked up and clicked Unlock was in — and the vault
  // reported itself "unlocked" without a single gesture.
  const state = new LockState();

  assert.equal(state.requiresPresence(), false);

  state.lock();
  assert.equal(state.requiresPresence(), true);
  // The silent rule still holds too: neither kind of caller gets a free pass.
  assert.equal(state.allowsSilentUnlock(), false);
});

test('proving presence clears the requirement, and the idle window restarts', () => {
  const state = new LockState();
  state.lock();
  state.noteUnlocked(1_000);

  assert.equal(state.requiresPresence(), false);
  assert.equal(state.isLocked(), false);
  assert.equal(state.dueForAutoLock(1_000 + 59 * 60_000, 60), false);
  assert.equal(state.dueForAutoLock(1_000 + 60 * 60_000, 60), true);
});

test('ordinary use of an unlocked vault never demands presence', () => {
  // Opening a credential must not turn into a key touch. Presence is demanded by the
  // LOCK, not by the fact that a secret is being read.
  const state = new LockState();
  state.noteUserActivity(5_000);

  assert.equal(state.requiresPresence(), false);
});
