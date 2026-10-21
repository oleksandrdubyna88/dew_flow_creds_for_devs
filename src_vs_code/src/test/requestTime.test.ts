import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clockUntil, localRequestTimeLine, requestTimeLine } from '../requestTime';

/**
 * Issue #131 — the consent modal says WHEN the request was made, in local time with its offset.
 * The arithmetic is tested with explicit offsets, so the result does not depend on the zone of the
 * machine running the suite.
 */

const AT = Date.UTC(2026, 8, 23, 11, 5, 12); // 2026-09-23 11:05:12 UTC

test('the owner\'s example: local time and the offset it is in', () => {
  assert.equal(requestTimeLine(AT, 180), 'Requested 2026-09-23 14:05:12 (UTC+03:00).');
});

test('west of UTC, UTC itself, and zones off the hour', () => {
  assert.equal(requestTimeLine(AT, -300), 'Requested 2026-09-23 06:05:12 (UTC-05:00).');
  assert.equal(requestTimeLine(AT, 0), 'Requested 2026-09-23 11:05:12 (UTC+00:00).');
  assert.equal(requestTimeLine(AT, 330), 'Requested 2026-09-23 16:35:12 (UTC+05:30).');
  assert.equal(requestTimeLine(AT, -210), 'Requested 2026-09-23 07:35:12 (UTC-03:30).');
});

test('the LOCAL date, forward into the next day and back across a month and a year', () => {
  assert.equal(requestTimeLine(Date.UTC(2026, 8, 23, 23, 30, 0), 180), 'Requested 2026-09-24 02:30:00 (UTC+03:00).');
  assert.equal(requestTimeLine(Date.UTC(2026, 0, 1, 0, 30, 0), -300), 'Requested 2025-12-31 19:30:00 (UTC-05:00).');
});

test('single-digit fields are zero-padded', () => {
  assert.equal(requestTimeLine(Date.UTC(2026, 0, 2, 3, 4, 5), 0), 'Requested 2026-01-02 03:04:05 (UTC+00:00).');
});

test('a Date is read in its OWN offset, with the sign getTimezoneOffset reverses', () => {
  const now = new Date(AT);
  // getTimezoneOffset is minutes BEHIND UTC — the opposite sign of "UTC+03:00".
  assert.equal(localRequestTimeLine(now), requestTimeLine(AT, -now.getTimezoneOffset()));
  const faked = Object.assign(new Date(AT), { getTimezoneOffset: () => -180 });
  assert.equal(localRequestTimeLine(faked), 'Requested 2026-09-23 14:05:12 (UTC+03:00).');
});

/**
 * The end time of an open SSH window as a clock time (#197, E2.2). Fixtures are LOCAL noon in a zone given as a
 * number, so nothing here depends on the machine's own zone.
 */
const NOON = Date.UTC(2026, 8, 24, 9, 0, 0); // 12:00 in UTC+03:00
const MIN = 60_000;

test('clockUntil says HH:MM in the zone of the offset it is given', () => {
  assert.equal(clockUntil(NOON + 10 * MIN, NOON, 180), '12:10');
  assert.equal(clockUntil(NOON + 10 * MIN, NOON, -300), '04:10');
});

test('clockUntil rounds UP to the minute: the text is never earlier than the end', () => {
  assert.equal(clockUntil(NOON + 10 * MIN + 30_000, NOON, 180), '12:11');
  assert.equal(clockUntil(NOON + 10 * MIN + 1, NOON, 180), '12:11');
});

test('clockUntil says "tomorrow" across local midnight, and not before it', () => {
  const lateEvening = Date.UTC(2026, 8, 24, 20, 55, 0); // 23:55 in UTC+03:00
  assert.equal(clockUntil(lateEvening + 10 * MIN, lateEvening, 180), '00:05 tomorrow');
  assert.equal(clockUntil(lateEvening + 4 * MIN, lateEvening, 180), '23:59');
});

test('clockUntil measures "today" in the zone of the offset, not in UTC', () => {
  // 23:55 in UTC+03:00 is still the same UTC day: the end (00:05 local) is NOT, but a UTC-based check says it is.
  const lateEvening = Date.UTC(2026, 8, 24, 20, 55, 0);
  assert.equal(clockUntil(lateEvening + 10 * MIN, lateEvening, 180).endsWith('tomorrow'), true);
  assert.equal(clockUntil(lateEvening + 10 * MIN, lateEvening, 0), '21:05');
});
