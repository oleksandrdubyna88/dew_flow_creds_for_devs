import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadWithVscode } from './vscodeStub';
import { OwnedShare, StoredAccount, TeamMember } from '../types';

/**
 * Team discovery and the pending-share inbox (audit A3).
 *
 * <p>What is pinned here is mostly about FAILURE, because this class scans other people's
 * locations and a scan can fail in three different ways that must not look alike: one
 * account's location being unreachable must not empty the others; an empty team must record
 * WHICH kind of empty it is, since "nobody has synced here yet" and "the server refused you"
 * are different problems with different fixes; and a failure listing shares must not take the
 * team down with it.</p>
 */

type Sharing = typeof import('../sharingManager');

const ME: StoredAccount = { accountId: 'a1', email: 'me@corp.com', provider: 'microsoft' };
const OTHER: StoredAccount = { accountId: 'a2', email: 'personal@gmail.com', provider: 'google' };

function member(email: string, location: string): TeamMember {
  return {
    account: { accountId: `id-${email}`, email, provider: 'google' },
    location,
    shareKeyId: `key-${email}`,
    isSelf: false,
  } as TeamMember;
}

function share(accountId: string, id: string, createdAt: number): OwnedShare {
  return {
    accountId,
    shareKeyId: 'k',
    item: { id, fromEmail: 'peer@corp.com', entityName: id, createdAt } as never,
  };
}

interface Transport {
  listTeam?: () => Promise<TeamMember[]>;
  listShares?: () => Promise<OwnedShare[]>;
  appendShares?: () => Promise<void>;
  removeShare?: () => Promise<void>;
}

function world(options: {
  accounts?: StoredAccount[];
  transports?: Record<string, Transport | undefined>;
  apiScope?: string;
}): { mod: Sharing; manager: InstanceType<Sharing['SharingManager']>; changed: () => number } {
  let changed = 0;
  const accounts = options.accounts ?? [ME];
  const mod = loadWithVscode<Sharing>('../sharingManager', {
    workspace: {
      getConfiguration: () => ({
        get: <T>(key: string, fallback: T): T =>
          (key === 'microsoftApiScope' ? (options.apiScope as T) : undefined) ?? fallback,
      }),
    },
  });
  const storage = {
    getAccounts: () => accounts,
    getAccount: (id: string) => accounts.find((a) => a.accountId === id),
  };
  const transports = {
    forAccount: (a: StoredAccount): Transport | undefined =>
      (options.transports ?? {})[a.accountId],
  };
  const manager = new mod.SharingManager(storage as never, transports as never, () => {
    changed += 1;
  });
  return { mod, manager, changed: () => changed };
}

const ok = (members: TeamMember[], shares: OwnedShare[] = []): Transport => ({
  listTeam: () => Promise.resolve(members),
  listShares: () => Promise.resolve(shares),
});

test('a reload lists the team and the inbox, then says it changed once', async () => {
  const w = world({ transports: { a1: ok([member('peer@corp.com', '/mnt/nas')], [share('a1', 's1', 1)]) } });

  await w.manager.reload();

  assert.deepEqual(w.manager.teamFor(ME).map((m) => m.account.email), ['peer@corp.com']);
  assert.deepEqual(w.manager.ownShares.map((s) => s.item.id), ['s1']);
  assert.equal(w.changed(), 1);
});

test('ONE account failing does not empty the others', async () => {
  // A NAS that is unplugged must not make the colleague list vanish for an unrelated account.
  const w = world({
    accounts: [ME, OTHER],
    transports: {
      a1: { listTeam: () => Promise.reject(new Error('unreachable')), listShares: () => Promise.resolve([]) },
      a2: ok([member('friend@gmail.com', '/mnt/home')]),
    },
  });

  await w.manager.reload();

  assert.deepEqual(w.manager.teamFor(ME), [], 'the broken one is empty');
  assert.deepEqual(w.manager.teamFor(OTHER).map((m) => m.account.email), ['friend@gmail.com']);
});

test('a failed team scan records WHY, so an empty list can say which kind of empty it is', async () => {
  // "Nobody has synced here yet" and "the server refused you" look identical in the UI unless
  // this map says otherwise — and they need different fixes.
  const w = world({
    transports: { a1: { listTeam: () => Promise.reject(new Error('403')), listShares: () => Promise.resolve([]) } },
  });

  await w.manager.reload();

  const failure = w.manager.teamFailures.get('a1');
  assert.ok(failure !== undefined, 'the reason is recorded');
  assert.equal(failure.provider, 'microsoft');
});

test('a successful scan CLEARS a previous failure rather than leaving it to mislead', async () => {
  const w = world({
    transports: { a1: { listTeam: () => Promise.reject(new Error('down')), listShares: () => Promise.resolve([]) } },
  });
  await w.manager.reload();
  assert.ok(w.manager.teamFailures.has('a1'));

  (w.manager as unknown as { transports: unknown }).transports = undefined;
  const healthy = world({ transports: { a1: ok([member('peer@corp.com', '/mnt/nas')]) } });
  await healthy.manager.reload();

  assert.equal(healthy.manager.teamFailures.has('a1'), false);
});

test('shares that cannot be listed do not take the TEAM down with them', async () => {
  // Different calls, different failures: an expired token on the inbox says nothing about
  // whether the colleague list was read.
  const w = world({
    transports: {
      a1: {
        listTeam: () => Promise.resolve([member('peer@corp.com', '/mnt/nas')]),
        listShares: () => Promise.reject(new Error('token expired')),
      },
    },
  });

  await w.manager.reload();

  assert.deepEqual(w.manager.teamFor(ME).map((m) => m.account.email), ['peer@corp.com']);
  assert.deepEqual(w.manager.ownShares, []);
});

test('the inbox is newest first, across accounts', async () => {
  const w = world({
    accounts: [ME, OTHER],
    transports: {
      a1: ok([], [share('a1', 'old', 100)]),
      a2: ok([], [share('a2', 'new', 900)]),
    },
  });

  await w.manager.reload();

  assert.deepEqual(w.manager.ownShares.map((s) => s.item.id), ['new', 'old']);
});

test('an account with no location configured is skipped, not treated as a failure', async () => {
  const w = world({ transports: { a1: undefined } });

  await w.manager.reload();

  assert.deepEqual(w.manager.teamFor(ME), []);
  assert.equal(w.manager.teamFailures.has('a1'), false, 'unconfigured is not broken');
});

test('sending a share without a location REFUSES loudly rather than dropping it', async () => {
  // Silently succeeding here would tell the sender their colleague has the credential.
  const w = world({ transports: { a1: undefined } });

  await assert.rejects(
    () => w.manager.appendShares(ME, member('peer@corp.com', '/mnt/nas'), []),
    /No sync location configured/,
  );
});

test('removing a share of an account that no longer exists is a no-op, not a crash', async () => {
  let removed = 0;
  const w = world({
    transports: { a1: { removeShare: () => { removed += 1; return Promise.resolve(); } } },
  });

  await w.manager.removeOwnShare(share('gone-account', 's1', 1));

  assert.equal(removed, 0);
});

test('the deduped team view counts one person at one location once', async () => {
  const w = world({
    accounts: [ME, OTHER],
    transports: {
      a1: ok([member('peer@corp.com', '/mnt/shared')]),
      a2: ok([member('peer@corp.com', '/mnt/shared')]),
    },
  });

  await w.manager.reload();

  assert.equal(w.manager.team.length, 1, 'two accounts seeing one shared folder is one colleague');
});
