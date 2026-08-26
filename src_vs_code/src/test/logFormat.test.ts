import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { dayFolder, formatLine, isExpiredLogDay, logFilePath, timeOfDay } from '../logFormat';

/**
 * The shape of a diagnostic line and of a run's file (audit A6), against the family logging
 * rule: a folder per day, a file per RUN, and UTC everywhere.
 */

// 2026-08-26T23:45:07Z — deliberately late in the UTC day, because that is when a local-time
// implementation and a UTC one disagree about which folder a line belongs in.
const LATE = new Date(Date.UTC(2026, 7, 26, 23, 45, 7));

test('a line is level-aligned, sourced, and greppable', () => {
  assert.equal(
    formatLine(LATE, 'error', 'sync', 'the vault did not decrypt'),
    '[23:45:07 ERR] sync: the vault did not decrypt',
  );
  assert.equal(formatLine(LATE, 'info', 'backup', 'wrote 1 file'), '[23:45:07 INF] backup: wrote 1 file');
  assert.equal(formatLine(LATE, 'warn', 'transport', 'slow'), '[23:45:07 WRN] transport: slow');
});

test('a multi-line message is folded, so one event is one line', () => {
  // A log where an event can span lines is a log where grep lies about what happened.
  assert.equal(
    formatLine(LATE, 'error', 'sync', 'first\nsecond\r\nthird'),
    '[23:45:07 ERR] sync: first second third',
  );
});

test('the clock is UTC, not local — the whole point of the rule', () => {
  // If this ever reads local time, a window opened either side of midnight files its lines
  // under two different days, and correlating them is the one time anyone reads these.
  assert.equal(timeOfDay(LATE), '23:45:07');
  assert.equal(dayFolder(LATE), '2026-08-26');
});

test('a run gets its own file, named by time and pid', () => {
  assert.equal(logFilePath(LATE, 4321), 'logs/2026-08-26/creds-23-45-07-4321.log');
});

test('two runs in the same second still get different files', () => {
  // VS Code restoring a workspace starts several windows at once; a shared name would have
  // them interleaving lines into one file, or fighting over it.
  assert.notEqual(logFilePath(LATE, 1), logFilePath(LATE, 2));
});

test('retention keeps the boundary day and drops what is past it', () => {
  const now = new Date(Date.UTC(2026, 7, 26));
  assert.equal(isExpiredLogDay('2026-08-26', now, 7), false, 'today');
  assert.equal(isExpiredLogDay('2026-08-19', now, 7), false, 'exactly 7 days — "7 days" means 7');
  assert.equal(isExpiredLogDay('2026-08-18', now, 7), true, '8 days');
});

test('retention never deletes what it does not recognise, and 0 disables it', () => {
  const now = new Date(Date.UTC(2026, 7, 26));
  assert.equal(isExpiredLogDay('not-a-day', now, 7), false, 'a stranger folder is left alone');
  assert.equal(isExpiredLogDay('2020-01-01', now, 0), false, '0 means keep forever');
});
