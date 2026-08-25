import assert from 'node:assert/strict';
import { test } from 'node:test';
import { REMIND_EVERY_MS, STALE_AFTER_MS, syncReminderDue } from '../syncReminder';

/**
 * "Your vault has not synced for N days" — when to say it, and when to stop repeating.
 * Pure, because a nag with a timing bug is worse than no nag: too often and it gets
 * dismissed forever, too rare and it fails its one job.
 */

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

test('a vault synced this morning is left alone', () => {
  const r = syncReminderDue({ lastSyncMs: NOW - 6 * HOUR, nowMs: NOW });

  assert.equal(r.due, false);
});

test('three days of silence is the line', () => {
  assert.equal(syncReminderDue({ lastSyncMs: NOW - 3 * DAY + 1000, nowMs: NOW }).due, false);
  const r = syncReminderDue({ lastSyncMs: NOW - 3 * DAY - 1000, nowMs: NOW });
  assert.equal(r.due, true);
  assert.equal(r.staleDays, 3);
});

test('once shown, it repeats every 4 hours — not on every timer tick', () => {
  const stale = NOW - 5 * DAY;

  assert.equal(
    syncReminderDue({ lastSyncMs: stale, lastRemindedMs: NOW - 1 * HOUR, nowMs: NOW }).due,
    false,
  );
  assert.equal(
    syncReminderDue({ lastSyncMs: stale, lastRemindedMs: NOW - 4 * HOUR - 1000, nowMs: NOW }).due,
    true,
  );
});

test('a successful sync ends the nagging entirely', () => {
  // The repeat gate must not survive the thing it nags about: freshly synced, recently
  // reminded — silence.
  const r = syncReminderDue({
    lastSyncMs: NOW - 1 * HOUR,
    lastRemindedMs: NOW - 5 * HOUR,
    nowMs: NOW,
  });

  assert.equal(r.due, false);
});

test('never synced counts from when the account was first seen', () => {
  // A brand-new account must not be nagged at minute one; one abandoned for a week must.
  assert.equal(syncReminderDue({ firstSeenMs: NOW - 1 * DAY, nowMs: NOW }).due, false);
  const r = syncReminderDue({ firstSeenMs: NOW - 7 * DAY, nowMs: NOW });
  assert.equal(r.due, true);
  assert.equal(r.staleDays, 7);
});

test('no sync ever and no first-seen record: not due, never a crash', () => {
  assert.equal(syncReminderDue({ nowMs: NOW }).due, false);
});

test('a clock that moved backwards stays silent instead of nagging', () => {
  assert.equal(syncReminderDue({ lastSyncMs: NOW + 1 * DAY, nowMs: NOW }).due, false);
});

test('the constants are what the requirement said', () => {
  assert.equal(STALE_AFTER_MS, 3 * DAY);
  assert.equal(REMIND_EVERY_MS, 4 * HOUR);
});
