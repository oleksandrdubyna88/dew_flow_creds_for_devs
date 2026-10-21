import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeLockNow } from '../lockNow';

/**
 * `lockNow` — the one function the idle timer and *Lock Vaults* both go through (#197, E2.1 review).
 *
 * <p>Plain fakes that record the order of what happened: the guarantee is that a lock really calls
 * `vaultKeys.lock()` (everything that ends on a lock — the SSH windows, the cached master key — hangs on that
 * one call), and that the forms are closed, the readiness repainted and the person told, in that order.</p>
 */

function rig(closedForms = 0): { calls: string[]; messages: string[]; lockNow: (notice: string) => void } {
  const calls: string[] = [];
  const messages: string[] = [];
  const lockNow = makeLockNow({
    vaultKeys: { lock: () => void calls.push('lock') },
    closeForms: () => {
      calls.push('closeForms');
      return closedForms;
    },
    refreshReadiness: () => {
      calls.push('refreshReadiness');
      return Promise.resolve(undefined);
    },
    say: (message) => {
      calls.push('say');
      messages.push(message);
    },
  });
  return { calls, messages, lockNow };
}

test('lockNow locks the vaults first, then closes the forms, repaints, and says so', () => {
  const { calls, lockNow } = rig();

  lockNow('Vaults locked.');

  assert.deepEqual(calls, ['lock', 'closeForms', 'refreshReadiness', 'say'], 'a lock left a step out or did them in another order');
});

test('lockNow says what it was told when no form was open', () => {
  const { messages, lockNow } = rig(0);

  lockNow('Vaults locked. Background sync is paused.');

  assert.deepEqual(messages, ['Vaults locked. Background sync is paused.']);
});

test('lockNow names the forms it closed, so losing typed input is never silent', () => {
  const { messages, lockNow } = rig(2);

  lockNow('Vaults locked.');

  assert.deepEqual(messages, ['Vaults locked. 2 open forms were closed — anything typed into it was not saved.']);
});

test('every call locks again: the idle timer and the command are not one-shot', () => {
  const { calls, lockNow } = rig();

  lockNow('first');
  lockNow('second');

  assert.equal(calls.filter((call) => call === 'lock').length, 2, 'the second lock did not reach vaultKeys.lock()');
});
