import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localRequestTimeLine, requestTimeLine } from '../requestTime';

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
