import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ALLOW_WINDOW } from '../agentConsent';
import {
  crossedLine,
  durationText,
  loginWindowsEndedNotice,
  longerItems,
  noListLine,
  pickRefusedLine,
  pickRefusedNotice,
  timeLeftText,
} from '../sshAgentTexts';

/** How the SSH agent's prompt words a duration — a fixed bound to the nearest unit, a time running out rounded down. */

test('a fixed bound reads to the nearest unit: minutes, or seconds under a minute', () => {
  assert.equal(durationText(300_000), '5 minutes');
  assert.equal(durationText(60_000), '1 minute');
  assert.equal(durationText(90_000), '2 minutes');
  assert.equal(durationText(20), '1 second');
  assert.equal(durationText(45_000), '1 minute', 'it rounds — which is why a time that is running out does not use it');
});

test('a whole number of hours reads in hours: 1 hour, 4 hours, 12 hours', () => {
  assert.equal(durationText(3_600_000), '1 hour');
  assert.equal(durationText(4 * 3_600_000), '4 hours');
  assert.equal(durationText(12 * 3_600_000), '12 hours');
});

test('a bound under an hour, or not a whole hour, still reads in minutes or seconds', () => {
  assert.equal(durationText(300_000), '5 minutes');
  assert.equal(durationText(1_000), '1 second');
  assert.equal(durationText(90 * 60_000), '90 minutes', 'an hour and a half is not a whole hour');
  assert.equal(durationText(61 * 60_000), '61 minutes');
});

test('the time left is rounded DOWN — 30 seconds never reads "1 minute"', () => {
  assert.equal(timeLeftText(30_000), '30 seconds');
  assert.equal(timeLeftText(210_000), '3 minutes', 'three and a half minutes is three');
  assert.equal(timeLeftText(300_000), '5 minutes');
});

test('the time left is in seconds below two minutes, minutes from two', () => {
  assert.equal(timeLeftText(119_999), '119 seconds');
  assert.equal(timeLeftText(120_000), '2 minutes');
  assert.equal(timeLeftText(60_000), '60 seconds');
  assert.equal(timeLeftText(45_000), '45 seconds');
});

test('the time left never reads "0 seconds", and one second is singular', () => {
  assert.equal(timeLeftText(0), '1 second');
  assert.equal(timeLeftText(20), '1 second');
  assert.equal(timeLeftText(1_999), '1 second');
  assert.equal(timeLeftText(2_000), '2 seconds');
});

// ---- #197 E3.2: the list, the crossing line and the notices ---------------------------------------------------------

const KEY = { entityId: 'e-1', name: 'prod', fingerprint: 'SHA256:abc' };
const MINUTE = 60_000;

test('the list offers four items with their end times and the auto-lock sentence', () => {
  const now = Date.UTC(2026, 8, 24, 11, 55);

  const items = longerItems(now, 0, 60);

  assert.deepEqual(
    items.map((item) => [item.label, item.description, item.ms]),
    [
      ['1 hour', 'until 12:55, or until the vault locks (idle auto-lock: 60 min)', 3_600_000],
      ['4 hours', 'until 15:55, or until the vault locks (idle auto-lock: 60 min)', 4 * 3_600_000],
      ['8 hours', 'until 19:55, or until the vault locks (idle auto-lock: 60 min)', 8 * 3_600_000],
      ['12 hours', 'until 23:55, or until the vault locks (idle auto-lock: 60 min)', 12 * 3_600_000],
    ],
  );
});

test('the list says "tomorrow" across midnight and reads the zone as an offset number, not the machine', () => {
  const evening = Date.UTC(2026, 8, 24, 16, 55);
  assert.deepEqual(
    longerItems(evening, 0, 15).map((item) => item.description),
    [
      'until 17:55, or until the vault locks (idle auto-lock: 15 min)',
      'until 20:55, or until the vault locks (idle auto-lock: 15 min)',
      'until 00:55 tomorrow, or until the vault locks (idle auto-lock: 15 min)',
      'until 04:55 tomorrow, or until the vault locks (idle auto-lock: 15 min)',
    ],
  );
  // 08:55 UTC is 11:55 in UTC+03:00: the end times are wall-clock times of THAT zone.
  const east = longerItems(Date.UTC(2026, 8, 24, 8, 55), 180, 60);
  assert.equal(east[0].description.startsWith('until 12:55,'), true);
  assert.equal(east[3].description.startsWith('until 23:55,'), true);
});

test('the crossing line names the answer that was given', () => {
  assert.equal(
    crossedLine('fenced-lock', 'Allow longer\u2026', 4 * 3_600_000),
    'answered "Allow longer\u2026" (4 hours) after the vaults were locked \u2014 allowed once, no window was opened',
  );
  assert.equal(
    crossedLine('fenced-key', 'Allow longer\u2026', 3_600_000),
    'answered "Allow longer\u2026" (1 hour) after Ask for Every Use Again \u2014 allowed once, no window was opened',
  );
});

test('the crossing line for the 10-minute answer is today\'s line, word for word', () => {
  assert.equal(
    crossedLine('fenced-key', ALLOW_WINDOW),
    'answered "Allow for 10 minutes" after Ask for Every Use Again \u2014 allowed once, no window was opened',
  );
  assert.equal(
    crossedLine('fenced-lock', ALLOW_WINDOW),
    'answered "Allow for 10 minutes" after the vaults were locked \u2014 allowed once, no window was opened',
  );
  assert.equal(
    crossedLine('stale-key', ALLOW_WINDOW),
    'answered after the key was removed or replaced \u2014 no window was opened',
  );
  assert.equal(crossedLine('opened', ALLOW_WINDOW), undefined, 'an answer that crossed nothing has no line');
  assert.equal(crossedLine('kept-later', ALLOW_WINDOW), undefined);
});

test('the notices read as the plan says', () => {
  assert.equal(
    pickRefusedNotice('Longer windows need the vault unlocked \u2014 a lock ends them'),
    'Longer windows need the vault unlocked \u2014 a lock ends them \u2014 this signature was allowed once; no window was opened.',
  );
  assert.equal(
    loginWindowsEndedNotice(1),
    'Idle auto-lock is off, so the login windows of 1 key were ended \u2014 a long window needs a lock to end it.',
  );
  assert.equal(
    loginWindowsEndedNotice(2),
    'Idle auto-lock is off, so the login windows of 2 keys were ended \u2014 a long window needs a lock to end it.',
  );
});

test('the two log lines of the answer table name the key, the answer and the reason', () => {
  assert.equal(
    noListLine(KEY, 'Longer windows need idle auto-lock: credSshManager.autoLockMinutes is off'),
    '"prod": answered "Allow longer\u2026" but Longer windows need idle auto-lock: credSshManager.autoLockMinutes is off \u2014 allowed once, no list was opened',
  );
  assert.equal(
    pickRefusedLine(KEY, 12 * 60 * MINUTE, 'Longer windows need the vault unlocked \u2014 a lock ends them'),
    '"prod": picked 12 hours but Longer windows need the vault unlocked \u2014 a lock ends them \u2014 allowed once, no window was opened',
  );
});
