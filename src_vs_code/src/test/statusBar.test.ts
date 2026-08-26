import assert from 'node:assert/strict';
import { test } from 'node:test';
import { statusCommand, statusText, statusTooltip } from '../lockStatus';

/**
 * The wording is the whole feature — a status item nobody can read is decoration — so it is a
 * test rather than something checked once on a screenshot.
 */

test('locked and open are distinguishable at a glance, by icon and by word', () => {
  assert.equal(statusText(true, false), '$(lock) Vault locked');
  assert.equal(statusText(false, false), '$(unlock) Vault open');
});

test('syncing outranks both — it is the transient state worth showing while it lasts', () => {
  assert.equal(statusText(true, true), '$(sync~spin) CredsForDevs');
  assert.equal(statusText(false, true), '$(sync~spin) CredsForDevs');
});

test('the locked tooltip says the consequence, not just the state', () => {
  // "Locked" alone does not tell anyone that their background sync has stopped.
  assert.match(statusTooltip(true, false), /background sync is paused/);
  assert.match(statusTooltip(true, false), /Click to unlock/);
});

test('the open tooltip offers the opposite action', () => {
  assert.match(statusTooltip(false, false), /Click to lock/);
  assert.match(statusTooltip(false, false), /cached key/);
});

test('while syncing the tooltip says so rather than claiming a lock state', () => {
  assert.match(statusTooltip(true, true), /syncing/);
});

test('clicking does the opposite of the current state — never a menu of one option', () => {
  assert.equal(statusCommand(true), 'credSshManager.unlockWithSecurityKey');
  assert.equal(statusCommand(false), 'credSshManager.lockVaults');
});
