import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  auditDayFolder,
  auditFileName,
  auditLogsToPrune,
  auditStartedAt,
} from '../agentAuditFile';

/**
 * The agent broker's audit used to exist only in an output channel — a buffer in
 * the window. Since closing the window is ALSO how a grant is revoked, the record
 * of what an agent did was destroyed at the moment it became history. These are
 * the rules for the file that replaces it, and they are the shared logging rule's
 * rules: a folder per day, a file per run, UTC throughout.
 */

test('a run gets its own file, named by the hour it started and its pid', () => {
  const started = new Date('2026-08-25T09:07:03.412Z');

  assert.equal(auditFileName(started, 4242), 'agent-09-07-03-4242.log');
  assert.equal(auditDayFolder(started), '2026-08-25');
});

test('two windows opened in the same second still get separate files', () => {
  // Which is the whole reason the pid is in the name.
  const started = new Date('2026-08-25T09:07:03.000Z');

  assert.notEqual(auditFileName(started, 111), auditFileName(started, 222));
});

test('the name is UTC, so two machines never split one evening across two folders', () => {
  // 23:30 in a UTC+3 zone is the NEXT day locally and the same day in UTC. A local
  // stamp would file the halves of one incident under different dates.
  const late = new Date('2026-08-25T23:30:00.000Z');

  assert.equal(auditDayFolder(late), '2026-08-25');
  assert.match(auditFileName(late, 1), /^agent-23-30-00-/);
});

test('a name that is not ours reads back as undefined rather than as a guess', () => {
  assert.equal(auditStartedAt('2026-08-25', 'agent-09-07-03-42.log')?.toISOString(), '2026-08-25T09:07:03.000Z');
  assert.equal(auditStartedAt('2026-08-25', 'notes.txt'), undefined);
  assert.equal(auditStartedAt('2026-08-25', 'agent-9-7-3-42.log'), undefined);
  assert.equal(auditStartedAt('not-a-day', 'agent-09-07-03-42.log'), undefined);
});

test('logs past the retention window are pruned, and a foreign file is never touched', () => {
  const now = new Date('2026-08-25T12:00:00Z');
  const files = [
    { day: '2026-08-25', fileName: 'agent-09-00-00-1.log' }, // today
    { day: '2026-08-01', fileName: 'agent-09-00-00-2.log' }, // 24 days old
    { day: '2026-08-20', fileName: 'agent-09-00-00-3.log' }, // 5 days old
    { day: '2026-08-01', fileName: 'somebody-elses.log' }, // not ours
  ];

  const pruned = auditLogsToPrune(files, 14, now);

  assert.deepEqual(pruned, [{ day: '2026-08-01', fileName: 'agent-09-00-00-2.log' }]);
});

test('the newest audit file survives however old it is — it covers the session being asked about', () => {
  const now = new Date('2027-08-25T12:00:00Z');
  const files = [{ day: '2026-08-01', fileName: 'agent-09-00-00-1.log' }]; // a year old

  assert.deepEqual(auditLogsToPrune(files, 14, now), []);
});

test('a retention of zero keeps everything forever', () => {
  const now = new Date('2027-08-25T12:00:00Z');
  const files = [
    { day: '2026-08-01', fileName: 'agent-09-00-00-1.log' },
    { day: '2026-08-02', fileName: 'agent-09-00-00-2.log' },
  ];

  assert.deepEqual(auditLogsToPrune(files, 0, now), []);
});
