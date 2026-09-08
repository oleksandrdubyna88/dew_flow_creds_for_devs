import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  NOTICE_WINDOWS,
  backupNotice,
  forget,
  healthOf,
  joinNotices,
  remember,
} from '../backupNotice';
import { BackupStatus } from '../orgBackupClient';

/**
 * The nag's cadence and its wording.
 *
 * <p>The property that matters is not the words but the SILENCE: a notice that fires too often
 * teaches people to dismiss it, and a dismissed notice is the same as no notice at all on the day it
 * would have mattered. So every case here is about when it stays quiet.</p>
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = 1_757_260_800_000;

const BASE: BackupStatus = {
    configured: true,
    keyState: 'Ready',
    scheduleHourUtc: 3,
    retentionDays: 30,
    lastRunAt: NOW - HOUR,
    lastResult: 'ok',
    lastError: '',
    running: false,
    localArchiveBytes: 4096,
    localArchiveName: 'cred-vault-20260907-030405Z.cvbk',
  targets: [],
};

function status(over: Partial<BackupStatus> = {}): BackupStatus {
  return { ...BASE, ...over };
}

/** A notice's words, so an assertion is not four operators deep. */
function words(notice: { message: string } | undefined): string {
  return notice === undefined ? '' : notice.message;
}

test('a healthy deployment says nothing at all', () => {
  assert.equal(healthOf(status()), 'healthy');
  assert.equal(backupNotice('acct-1', 'anna@corp.com', status(), {}, NOW), undefined);
});

test('a server too old for the feature is not nagged about', () => {
  // There is nothing an administrator can press here to change it, so a daily reminder would be a
  // daily reminder to upgrade somebody else's deployment.
  assert.equal(healthOf(status({ configured: false })), 'healthy');
});

test('a key nobody has acknowledged counts as UNCONFIGURED, because every run is refusing', () => {
  // The silent state this notice exists to end: the scheduler ticks every five minutes, refuses
  // every time, and says so once per tick at Information — which is the definition of nowhere.
  const awaiting = status({ keyState: 'AwaitingAcknowledgement' });

  assert.equal(healthOf(awaiting), 'unconfigured');
  const notice = backupNotice('acct-1', 'anna@corp.com', awaiting, {}, NOW);
  assert.match(words(notice), /nobody has confirmed/);
  assert.match(words(notice), /Mint again/);
});

test('no key at all names what minting means, since the words cannot be produced twice', () => {
  const notice = backupNotice('acct-1', 'anna@corp.com', status({ keyState: 'Absent' }), {}, NOW);

  assert.match(words(notice), /shown once/);
});

test('a key this server cannot open says what changed, not "mint one"', () => {
  const notice = backupNotice('acct-1', 'anna@corp.com', status({ keyState: 'Unreadable' }), {}, NOW);

  assert.match(words(notice), /KEK changed/);
});

test('unconfigured interrupts once a DAY and is silent in between', () => {
  const absent = status({ keyState: 'Absent' });

  const first = backupNotice('acct-1', 'anna@corp.com', absent, {}, NOW);
  assert.equal(first?.windowMs, NOTICE_WINDOWS.unconfigured);

  const shown = remember({}, ['acct-1'], NOW);
  assert.equal(backupNotice('acct-1', 'anna@corp.com', absent, shown, NOW + HOUR), undefined);
  assert.equal(backupNotice('acct-1', 'anna@corp.com', absent, shown, NOW + DAY - 1), undefined);
  assert.notEqual(backupNotice('acct-1', 'anna@corp.com', absent, shown, NOW + DAY), undefined);
});

test('a failed run interrupts once an HOUR, because every hour is an hour with no fresh copy', () => {
  const failed = status({ lastResult: 'failed', lastError: 'the bucket refused: 403' });
  const shown = remember({}, ['acct-1'], NOW);

  assert.equal(healthOf(failed), 'failing');
  assert.equal(backupNotice('acct-1', 'anna@corp.com', failed, shown, NOW + HOUR - 1), undefined);
  const later = backupNotice('acct-1', 'anna@corp.com', failed, shown, NOW + HOUR);
  assert.equal(later?.windowMs, NOTICE_WINDOWS.failing);
  assert.match(words(later), /403/, 'the reason travels, not just the word "failed"');
});

test('a PARTIAL run is failing too — an archive that reached one target of two is not fine', () => {
  assert.equal(healthOf(status({ lastResult: 'partial' })), 'failing');
});

test('a deployment that has never run is unconfigured, whatever its key says', () => {
  assert.equal(healthOf(status({ lastRunAt: 0 })), 'unconfigured');
});

test('the window is per ACCOUNT, so one deployment cannot silence another', () => {
  const absent = status({ keyState: 'Absent' });
  const shown = remember({}, ['acct-1'], NOW);

  assert.equal(backupNotice('acct-1', 'anna@corp.com', absent, shown, NOW), undefined);
  assert.notEqual(backupNotice('acct-2', 'bob@corp.com', absent, shown, NOW), undefined);
});

test('several accounts become ONE message, with every name in it', () => {
  // Three popups stack in the corner and cover each other's buttons; with four, the last is
  // off-screen. The same reading lockedNotice.ts makes.
  const absent = status({ keyState: 'Absent' });
  const notices = [
    backupNotice('acct-1', 'anna@corp.com', absent, {}, NOW)!,
    backupNotice('acct-2', 'bob@corp.com', absent, {}, NOW)!,
  ];

  const joined = joinNotices(notices);

  assert.match(joined, /2 deployments/);
  assert.match(joined, /anna@corp\.com/);
  assert.match(joined, /bob@corp\.com/);
});

test('one notice is its own message, with no count in front of it', () => {
  const only = backupNotice('acct-1', 'anna@corp.com', status({ keyState: 'Absent' }), {}, NOW)!;

  assert.equal(joinNotices([only]), only.message);
});

test('a run that succeeds FORGETS the window, so the next failure is heard at once', () => {
  // Without it: failed at 10:00, fixed at 10:05, failed again at 10:20 — and nothing until 11:00,
  // because the window would be measuring the trouble that is over.
  const failed = status({ lastResult: 'failed' });
  const shown = remember({}, ['acct-1'], NOW);

  assert.equal(backupNotice('acct-1', 'anna@corp.com', failed, shown, NOW + 60_000), undefined);
  const cleared = forget(shown, 'acct-1');
  assert.notEqual(backupNotice('acct-1', 'anna@corp.com', failed, cleared, NOW + 60_000), undefined);
});

test('remember does not disturb the accounts it was not asked about', () => {
  const shown = remember({ 'acct-9': 1 }, ['acct-1'], NOW);

  assert.equal(shown['acct-9'], 1);
  assert.equal(shown['acct-1'], NOW);
});
