import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NoticeMemory } from '../backupNotice';
import { BackupWatchHost, checkBackups, checkOneBackup } from '../backupWatch';
import { CorpPolicyState } from '../corpPolicy';
import { BackupStatus } from '../orgBackupClient';
import { StoredAccount } from '../types';

/**
 * The watch's three rules, each of which exists because breaking it produces a notice people learn
 * to dismiss — and a dismissed notice is the same as no notice at all on the day it matters.
 */

const NOW = 1_757_260_800_000;

const anna: StoredAccount = { accountId: 'acct-1', email: 'anna@corp.com', provider: 'microsoft' };
const bob: StoredAccount = { accountId: 'acct-2', email: 'bob@corp.com', provider: 'microsoft' };

function policy(isAdmin: boolean): CorpPolicyState {
  return { isAdmin } as CorpPolicyState;
}

const BASE: BackupStatus = {
    configured: true,
    keyState: 'Absent',
    scheduleHourUtc: 3,
    retentionDays: 30,
    lastRunAt: 0,
    lastResult: 'never run',
    lastError: '',
    running: false,
    localArchiveBytes: 0,
    localArchiveName: '',
  targets: [],
};

function status(over: Partial<BackupStatus> = {}): BackupStatus {
  return { ...BASE, ...over };
}

interface World {
  readonly host: BackupWatchHost;
  readonly shown: string[];
  readonly reads: string[];
  memory: NoticeMemory;
}

function world(
  answers: (account: StoredAccount) => Promise<BackupStatus>,
  memory: NoticeMemory = {},
  hasClient = true,
): World {
  const shown: string[] = [];
  const reads: string[] = [];
  const state = { memory, shown, reads } as unknown as World;
  const host: BackupWatchHost = {
    clientFor: () => (hasClient ? reader(answers, reads) : undefined),
    shown: () => state.memory,
    remember: (next) => {
      state.memory = next;
      return Promise.resolve(undefined);
    },
    show: (message) => shown.push(message),
    now: () => NOW,
  };
  return Object.assign(state, { host, shown, reads });
}

/** A status reader that records who it was asked about. */
function reader(
  answers: (account: StoredAccount) => Promise<BackupStatus>,
  reads: string[],
): { readStatus: (account: StoredAccount) => Promise<BackupStatus> } {
  return {
    readStatus: (account) => {
      reads.push(account.email);
      return answers(account);
    },
  };
}

/** A notice's words, so an assertion is not four operators deep. */
function words(notice: { message: string } | undefined): string {
  return notice === undefined ? '' : notice.message;
}

test('a member is never polled, because every backup route is admin-only', () => {
  // A member's poll would be refused on every cycle, and the only thing that refusal could do is put
  // a red message in front of somebody who cannot act on it.
  const w = world(() => Promise.resolve(status()));

  return checkOneBackup(w.host, anna, policy(false)).then((notice) => {
    assert.equal(notice, undefined);
    assert.deepEqual(w.reads, [], 'nothing reached the network');
  });
});

test('an account with no server is not polled either', async () => {
  const w = world(() => Promise.resolve(status()), {}, false);

  assert.equal(await checkOneBackup(w.host, anna, policy(true)), undefined);
});

test('a FAILED read changes nothing — not the screen, not the windows, not the belief', async () => {
  // The rule that keeps a network blip from producing a nag. A notice that fires on a transient
  // failure trains people to dismiss it, which is worse than never firing.
  const before: NoticeMemory = { 'acct-1': NOW - 1000 };
  const w = world(() => Promise.reject(new Error('unreachable')), before);

  const notice = await checkOneBackup(w.host, anna, policy(true));

  assert.equal(notice, undefined);
  assert.deepEqual(w.memory, before, 'the window is untouched');
  assert.deepEqual(w.shown, []);
});

test('an unconfigured deployment produces a notice naming the account', async () => {
  const w = world(() => Promise.resolve(status()));

  const notice = await checkOneBackup(w.host, anna, policy(true));

  assert.match(words(notice), /anna@corp\.com/);
  assert.match(words(notice), /no backup key/);
});

test('a healthy deployment FORGETS its window, so the next failure is heard at once', async () => {
  const w = world(
    () => Promise.resolve(status({ keyState: 'Ready', lastRunAt: NOW - 3_600_000, lastResult: 'ok' })),
    { 'acct-1': NOW - 1000 },
  );

  assert.equal(await checkOneBackup(w.host, anna, policy(true)), undefined);
  assert.equal('acct-1' in w.memory, false, 'the window is cleared, not left to expire');
});

test('two unhappy deployments interrupt ONCE, with both names in the message', async () => {
  const w = world(() => Promise.resolve(status()));

  await checkBackups(w.host, new Map([[anna, policy(true)], [bob, policy(true)]]));

  assert.equal(w.shown.length, 1, 'one popup, never one per account');
  assert.match(w.shown[0], /anna@corp\.com/);
  assert.match(w.shown[0], /bob@corp\.com/);
});

test('and the windows are remembered, so the next cycle is silent', async () => {
  const w = world(() => Promise.resolve(status()));

  await checkBackups(w.host, new Map([[anna, policy(true)]]));
  await checkBackups(w.host, new Map([[anna, policy(true)]]));

  assert.equal(w.shown.length, 1, 'the second cycle said nothing');
  assert.equal(w.memory['acct-1'], NOW);
});

test('nothing to say means nothing is shown and nothing is written', async () => {
  const w = world(
    () => Promise.resolve(status({ keyState: 'Ready', lastRunAt: NOW - 3_600_000, lastResult: 'ok' })),
  );

  await checkBackups(w.host, new Map([[anna, policy(true)]]));

  assert.deepEqual(w.shown, []);
});
