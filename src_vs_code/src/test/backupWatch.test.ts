import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BackupNotice, NoticeMemory } from '../backupNotice';
import { BackupWatchHost, checkBackups, checkOneBackup } from '../backupWatch';
import { CorpPolicyState, MOST_RESTRICTIVE_POLICY } from '../corpPolicy';
import { BackupStatus } from '../orgBackupClient';
import { StoredAccount } from '../types';

/**
 * The watch's three rules, each of which exists because breaking it produces a notice people learn
 * to dismiss — and a dismissed notice is the same as no notice at all on the day it matters.
 */

const NOW = 1_757_260_800_000;

const anna: StoredAccount = { accountId: 'acct-1', email: 'anna@corp.com', provider: 'microsoft' };
const bob: StoredAccount = { accountId: 'acct-2', email: 'bob@corp.com', provider: 'microsoft' };

/**
 * A whole `CorpPolicyState`, not a cast.
 *
 * <p>`{ isAdmin } as CorpPolicyState` compiles today and goes on compiling the day the interface
 * gains a required field — and what appears instead is a runtime failure in every test that used
 * the fixture, none of them pointing at the interface that changed
 * (`.claude/rules/shared/typescript/doctrine.md` rule 3). Real defaults cost four lines and fail at
 * the compiler instead.</p>
 */
function policy(isAdmin: boolean): CorpPolicyState {
  return {
    corpMode: true,
    role: isAdmin ? 'admin' : 'member',
    isOfficer: false,
    isAdmin,
    active: true,
    policy: MOST_RESTRICTIVE_POLICY,
    policyFromServer: true,
    projects: [],
    pendingFolderRemovals: [],
    leaseHours: 0,
    fetchedAt: NOW,
  };
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
  /** What the host has persisted so far. Read-only here: only the host writes it. */
  readonly memory: NoticeMemory;
  /** How many times it was persisted — the difference between "settled" and "written per account". */
  readonly writes: number;
}

function world(
  answers: (account: StoredAccount) => Promise<BackupStatus>,
  memory: NoticeMemory = {},
  hasClient = true,
): World {
  const shown: string[] = [];
  const reads: string[] = [];
  // A one-field box rather than `as unknown as World`. The host's closures need somewhere mutable to
  // keep the persisted map, and the World the caller reads needs the same place — a cast would have
  // bought that by turning the compiler off for this shape, which is the pattern the doctrine names.
  const box: { memory: NoticeMemory; writes: number } = { memory, writes: 0 };
  const host: BackupWatchHost = {
    clientFor: () => (hasClient ? reader(answers, reads) : undefined),
    shown: () => box.memory,
    remember: (next) => {
      box.memory = next;
      box.writes += 1;
      return Promise.resolve(undefined);
    },
    show: (message) => shown.push(message),
    now: () => NOW,
  };
  return {
    host,
    shown,
    reads,
    get memory(): NoticeMemory {
      return box.memory;
    },
    get writes(): number {
      return box.writes;
    },
  };
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
function words(notice: BackupNotice | undefined): string {
  return notice === undefined ? '' : notice.message;
}

test('a member is never polled, because every backup route is admin-only', async () => {
  // A member's poll would be refused on every cycle, and the only thing that refusal could do is put
  // a red message in front of somebody who cannot act on it.
  const w = world(() => Promise.resolve(status()));

  const check = await checkOneBackup(w.host, anna, policy(false));

  assert.equal(check.notice, undefined);
  assert.equal(check.healthy, false, 'not polled is not the same as fine');
  assert.deepEqual(w.reads, [], 'nothing reached the network');
});

test('an account with no server is not polled either', async () => {
  const w = world(() => Promise.resolve(status()), {}, false);

  const check = await checkOneBackup(w.host, anna, policy(true));

  assert.equal(check.notice, undefined);
  assert.deepEqual(w.reads, []);
});

test('a FAILED read changes nothing — not the screen, not the windows, not the belief', async () => {
  // The rule that keeps a network blip from producing a nag. A notice that fires on a transient
  // failure trains people to dismiss it, which is worse than never firing. It must not read as
  // HEALTHY either: that would clear the window and let the nag return on the next cycle.
  const before: NoticeMemory = { 'acct-1': NOW - 1000 };
  const w = world(() => Promise.reject(new Error('unreachable')), before);

  await checkBackups(w.host, new Map([[anna, policy(true)]]));

  assert.deepEqual(w.memory, before, 'the window is untouched');
  assert.deepEqual(w.shown, []);
});

test('an unconfigured deployment produces a notice naming the account', async () => {
  const w = world(() => Promise.resolve(status()));

  const check = await checkOneBackup(w.host, anna, policy(true));

  assert.match(words(check.notice), /anna@corp\.com/);
  assert.match(words(check.notice), /no backup key/);
});

test('a healthy deployment FORGETS its window, so the next failure is heard at once', async () => {
  const w = world(
    () => Promise.resolve(status({ keyState: 'Ready', lastRunAt: NOW - 3_600_000, lastResult: 'ok' })),
    { 'acct-1': NOW - 1000 },
  );

  await checkBackups(w.host, new Map([[anna, policy(true)]]));

  assert.equal('acct-1' in w.memory, false, 'the window is cleared, not left to expire');
});

test('a cycle where nothing changed writes NOTHING', async () => {
  // A hundred healthy accounts used to persist the notice map a hundred times per policy fetch, each
  // write saying that nothing had changed. The map is settled once now, and only written when it
  // actually moved.
  const w = world(
    () => Promise.resolve(status({ keyState: 'Ready', lastRunAt: NOW - 3_600_000, lastResult: 'ok' })),
  );

  await checkBackups(w.host, new Map([[anna, policy(true)], [bob, policy(true)]]));

  assert.equal(w.writes, 0, 'two healthy accounts with no windows to clear: nothing to persist');
});

test('the accounts are checked TOGETHER, not one after another', async () => {
  // Inside the readiness cycle that repaints the tree, and each read carries a five-second deadline:
  // serially, one unreachable server per account delays the repaint by five seconds each.
  let live = 0;
  let mostAtOnce = 0;
  const w = world(() => {
    live += 1;
    mostAtOnce = Math.max(mostAtOnce, live);
    return new Promise<BackupStatus>((resolve) => {
      setTimeout(() => {
        live -= 1;
        resolve(status());
      }, 10);
    });
  });

  await checkBackups(w.host, new Map([[anna, policy(true)], [bob, policy(true)]]));

  assert.equal(mostAtOnce, 2, 'both reads were in flight at the same time');
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

// --- the status this poll already read, handed to whoever else wants it -------------------------

test('the status the check READ is handed back, instead of being thrown away', async () => {
  // The tree's Backup row needs exactly this document, and this loop already fetches it once per
  // readiness cycle for every admin account. A second poll would be a second timer to get wrong
  // about backoff, sleep and four open windows — which this module's own header argues against.
  const healthy = status({ keyState: 'Ready', lastRunAt: NOW - 3_600_000, lastResult: 'ok' });
  const w = world(() => Promise.resolve(healthy));

  const check = await checkOneBackup(w.host, anna, policy(true));

  assert.equal(check.healthy, true);
  assert.equal(check.status, healthy, 'the same document, not a re-read of it');
});

test('a member and a failed read hand back nothing, because they answered nothing', async () => {
  const w = world(() => Promise.reject(new Error('ECONNREFUSED')));

  assert.equal(
    (await checkOneBackup(w.host, anna, policy(true))).status,
    undefined,
    'a read that FAILED is not an answer, and must not be written down as one',
  );
  assert.deepEqual(w.reads, ['anna@corp.com'], 'the administrator was polled');

  assert.equal((await checkOneBackup(w.host, bob, policy(false))).status, undefined);
  assert.deepEqual(w.reads, ['anna@corp.com'], 'and the member was not polled at all');
});

test('every account that answered is recorded, by id, in one pass', async () => {
  const recorded: [string, string][] = [];
  const w = world((account) =>
    account.accountId === 'acct-1'
      ? Promise.resolve(status({ keyState: 'Ready', lastRunAt: NOW - 1, lastResult: 'ok' }))
      : Promise.reject(new Error('offline')));
  const host: BackupWatchHost = {
    ...w.host,
    record: (accountId, read) => recorded.push([accountId, read.lastResult]),
  };

  await checkBackups(host, new Map([[anna, policy(true)], [bob, policy(true)]]));

  assert.deepEqual(recorded, [['acct-1', 'ok']], 'and the one that failed recorded nothing');
});

test('a host with no recorder behaves exactly as it did before there was one', async () => {
  // The seam is optional, so every existing caller — and every test written before it — is unchanged.
  const w = world(() => Promise.resolve(status()));

  await checkBackups(w.host, new Map([[anna, policy(true)]]));

  assert.equal(w.shown.length, 1);
});
