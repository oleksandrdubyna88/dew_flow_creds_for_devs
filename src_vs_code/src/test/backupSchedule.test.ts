import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  dueForSnapshot,
  isSnapshotOf,
  snapshotFileName,
  snapshotsToPrune,
  describeInterval,
  INTERVAL_CHOICES,
} from '../backupSchedule';

/**
 * Scheduled snapshots.
 *
 * The rules here are the ones the SERVER's backup learned the hard way when its restore
 * was first rehearsed, applied to the client: never let retention empty the destination,
 * never let an empty snapshot shadow a good one, and do not re-upload identical bytes to
 * a metered folder every day.
 */

const AUGUST = new Date('2026-08-23T14:05:09Z');

test('a snapshot is named by account and by the instant it was taken', () => {
  const name = snapshotFileName('Me@Corp.com', 'microsoft', AUGUST);

  assert.equal(name, 'vault_me_at_corp_com_microsoft_20260823T140509Z.enc');
});

test('the timestamp is UTC, so snapshots from two machines interleave correctly', () => {
  // Same instant, and nothing about the local zone may appear in the name.
  const name = snapshotFileName('me@corp.com', 'google', new Date('2026-01-02T03:04:05Z'));

  assert.match(name, /_20260102T030405Z\.enc$/);
});

test('names sort lexically into chronological order, which is what "newest" relies on', () => {
  const names = [
    snapshotFileName('me@corp.com', 'microsoft', new Date('2026-08-23T14:00:00Z')),
    snapshotFileName('me@corp.com', 'microsoft', new Date('2026-08-22T23:59:59Z')),
    snapshotFileName('me@corp.com', 'microsoft', new Date('2026-09-01T00:00:00Z')),
  ];

  const sorted = [...names].sort();

  assert.deepEqual(sorted, [names[1], names[0], names[2]]);
});

test('one account does not claim another account snapshots', () => {
  const mine = snapshotFileName('me@corp.com', 'microsoft', AUGUST);

  assert.equal(isSnapshotOf(mine, 'me@corp.com', 'microsoft'), true);
  assert.equal(isSnapshotOf(mine, 'someone@corp.com', 'microsoft'), false);
  // The same address under a different provider is a different vault.
  assert.equal(isSnapshotOf(mine, 'me@corp.com', 'google'), false);
});

test('the live sync file is not mistaken for a snapshot', () => {
  // `vault_me_at_corp_com.enc` is what sync maintains; deleting it as an expired
  // snapshot would destroy the working vault.
  assert.equal(isSnapshotOf('vault_me_at_corp_com.enc', 'me@corp.com', 'microsoft'), false);
});

test('snapshots past the retention window are pruned', () => {
  const now = new Date('2026-08-23T00:00:00Z');
  const names = [
    snapshotFileName('me@corp.com', 'microsoft', new Date('2026-08-22T00:00:00Z')), // 1 day
    snapshotFileName('me@corp.com', 'microsoft', new Date('2026-07-01T00:00:00Z')), // 53 days
    snapshotFileName('me@corp.com', 'microsoft', new Date('2026-06-01T00:00:00Z')), // 83 days
  ];

  const pruned = snapshotsToPrune(names, 30, now);

  assert.deepEqual(pruned.sort(), [names[1], names[2]].sort());
});

test('retention NEVER empties the folder, however old everything is', () => {
  // A laptop closed for a year, or a clock that jumped. "Prune old backups" must not
  // become "delete every backup".
  const now = new Date('2027-08-23T00:00:00Z');
  const names = [
    snapshotFileName('me@corp.com', 'microsoft', new Date('2026-08-01T00:00:00Z')),
    snapshotFileName('me@corp.com', 'microsoft', new Date('2026-08-02T00:00:00Z')),
  ];

  const pruned = snapshotsToPrune(names, 30, now);

  assert.equal(pruned.length, 1, 'the newest one is kept whatever its age');
  assert.equal(pruned[0], names[0], 'and it is the OLDEST that goes');
});

test('retention of zero keeps everything forever', () => {
  const names = [snapshotFileName('me@corp.com', 'microsoft', new Date('2020-01-01T00:00:00Z'))];

  assert.deepEqual(snapshotsToPrune(names, 0, new Date('2026-08-23T00:00:00Z')), []);
});

test('an unparseable name is left alone rather than deleted', () => {
  // Somebody else's file in the same folder is not ours to remove.
  const names = ['vault_me_at_corp_com_microsoft_not-a-date.enc', 'holiday-photo.jpg'];

  assert.deepEqual(snapshotsToPrune(names, 1, new Date('2026-08-23T00:00:00Z')), []);
});

test('the first run is always due', () => {
  assert.equal(dueForSnapshot(undefined, AUGUST, 24), true);
});

test('a run inside the interval is not due, and one past it is', () => {
  const last = new Date('2026-08-23T00:00:00Z');

  assert.equal(dueForSnapshot(last, new Date('2026-08-23T12:00:00Z'), 24), false);
  assert.equal(dueForSnapshot(last, new Date('2026-08-24T00:00:01Z'), 24), true);
});

test('an interval of zero disables snapshots entirely', () => {
  assert.equal(dueForSnapshot(undefined, AUGUST, 0), false);
  assert.equal(dueForSnapshot(new Date('2020-01-01T00:00:00Z'), AUGUST, 0), false);
});

test('a clock that jumped backwards does not disable snapshots forever', () => {
  // Last run "in the future". Waiting for the interval to elapse from THERE would mean
  // no backups until the clock catches up, which could be months.
  const last = new Date('2027-01-01T00:00:00Z');

  assert.equal(dueForSnapshot(last, AUGUST, 24), true);
});

test('an interval reads as a schedule, not as a number of hours', () => {
  // The setting is hours because a timer needs hours. Nobody picks a backup schedule by
  // thinking "168", so the menu must not ask them to.
  assert.equal(describeInterval(0), 'Off');
  assert.equal(describeInterval(1), 'Hourly');
  assert.equal(describeInterval(6), 'Every 6 hours');
  assert.equal(describeInterval(24), 'Daily');
  assert.equal(describeInterval(168), 'Weekly');
  assert.equal(describeInterval(72), 'Every 3 days');
  assert.equal(describeInterval(2), 'Every 2 hours');
});

test('a half-day and other odd values still describe themselves', () => {
  assert.equal(describeInterval(12), 'Every 12 hours');
  assert.equal(describeInterval(336), 'Every 14 days');
});

test('a negative interval is Off, not a schedule running backwards', () => {
  assert.equal(describeInterval(-5), 'Off');
});

test('the offered choices cover the schedules people actually ask for', () => {
  const hours = INTERVAL_CHOICES.map((c) => c.hours);

  assert.deepEqual(hours, [1, 6, 24, 168, 0]);
  // Every choice must be able to say what it is, or the menu shows a bare number.
  for (const choice of INTERVAL_CHOICES) {
    assert.equal(choice.label, describeInterval(choice.hours));
    assert.ok(choice.detail.length > 0, `no detail for ${choice.hours}`);
  }
});
