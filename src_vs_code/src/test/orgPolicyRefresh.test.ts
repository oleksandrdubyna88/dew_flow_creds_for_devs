import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CorpPolicyState } from '../corpPolicy';
import { MemberListEntry, MemberSelf, OrgMembersClient, ProjectRow } from '../orgMembersClient';
import { OrgPolicyHost, ServerSectionHost, refreshOrgPolicy } from '../orgPolicyRefresh';
import { BackupRead, BackupStatus } from '../orgBackupClient';
import { MetricsProbe, ServerRead } from '../orgRecoveryClient';
import { ReleaseMemo } from '../githubReleases';
import { ServerMetrics } from '../serverMetricsPage';
import { StoredAccount } from '../types';

/**
 * The per-account refresh that fills the tree's `orgPolicy` cache — the vscode-free half of what
 * `extension.ts` runs in its readiness loop. Tested here because the loop's guarantees are the
 * ones a repaint depends on: a failure never throws (it would break the repaint that draws every
 * other row), a failure keeps the previous answer, and only a success advances the heartbeat.
 */

const account: StoredAccount = { accountId: 'a1', email: 'anna@corp.com', provider: 'microsoft' };

const ME: MemberSelf = {
  corpMode: true,
  email: 'anna@corp.com',
  role: 'member',
  active: true,
  isOfficer: false,
  shareDefault: 'project',
  projects: [],
  pendingFolderRemovals: [],
  policy: { export: true, share: 'any', moveOutOfProject: true },
  offlineLeaseHours: 24,
  loginKeyVersion: 0,
  serverContract: 3,
};

const ROW: MemberListEntry = {
  email: 'boris@corp.com',
  role: 'dev',
  active: true,
  shareDefault: 'none',
  projectIds: [],
  isOfficer: false,
  updatedAt: 0,
  updatedBy: '',
};

interface Fake {
  me: () => Promise<MemberSelf>;
  members: () => Promise<MemberListEntry[]>;
  /** Optional: most tests do not care, and an absent one answers an empty list. */
  projects?: () => Promise<ProjectRow[]>;
}

function host(fake: Fake | undefined, now = 1_000): OrgPolicyHost & { beats: [string, number][] } {
  const beats: [string, number][] = [];
  const client = fake === undefined ? undefined : ({ readMe: fake.me, listMembers: fake.members, listProjects: fake.projects ?? (async () => []) } as unknown as OrgMembersClient);
  return {
    beats,
    clientFor: () => client,
    orgPolicy: new Map<string, CorpPolicyState>(),
    orgRoster: new Map<string, readonly MemberListEntry[]>(),
    orgProjects: new Map<string, readonly ProjectRow[]>(),
    orgPolicyServer: new Map<string, string>(),
    heartbeat: (accountId, at) => {
      beats.push([accountId, at]);
      return Promise.resolve();
    },
    now: () => now,
  };
}

test('a success caches the state and writes the heartbeat — the offline lease reads it later', async () => {
  const h = host({ me: () => Promise.resolve(ME), members: () => Promise.reject(new Error('not asked')) }, 5_000);

  await refreshOrgPolicy(h, account);

  assert.equal(h.orgPolicy.get('a1')?.role, 'member');
  assert.equal(h.orgPolicy.get('a1')?.fetchedAt, 5_000);
  assert.deepEqual(h.beats, [['a1', 5_000]]);
});

test('a failed fetch keeps the previous answer, advances nothing, and never throws', async () => {
  // Not knowing changes nothing. An unreachable server for one cycle must not demote an admin
  // in the tree, and a heartbeat written on a failure would be a lie the lease later believes.
  let calls = 0;
  const h = host({
    me: () => (calls++ === 0 ? Promise.resolve({ ...ME, role: 'admin' }) : Promise.reject(new Error('ECONNREFUSED'))),
    members: () => Promise.resolve([ROW]),
  });
  await refreshOrgPolicy(h, account);
  const before = h.orgPolicy.get('a1');

  await refreshOrgPolicy(h, account);

  assert.equal(h.orgPolicy.get('a1'), before, 'the same object — nothing replaced it');
  assert.equal(h.beats.length, 1, 'one heartbeat, from the one success');
  assert.deepEqual(h.orgRoster.get('a1'), [ROW], 'the roster survives too');
});

test('an admin viewer gets the roster; a member does not ask for it', async () => {
  // GET /api/org/members is the admin's route. A member asking would be refused every cycle,
  // and the only thing that refusal could do is put a red message in front of an ordinary user.
  let rosterAsked = 0;
  const members = (): Promise<MemberListEntry[]> => {
    rosterAsked++;
    return Promise.resolve([ROW]);
  };
  const admin = host({ me: () => Promise.resolve({ ...ME, role: 'admin' }), members });
  await refreshOrgPolicy(admin, account);
  assert.deepEqual(admin.orgRoster.get('a1'), [ROW]);
  assert.equal(rosterAsked, 1);

  const member = host({ me: () => Promise.resolve(ME), members });
  await refreshOrgPolicy(member, account);
  assert.equal(member.orgRoster.get('a1'), undefined);
  assert.equal(rosterAsked, 1, 'the member’s window never called it');
});

test('an officer with a member role is an admin viewer and gets the roster', async () => {
  const h = host({ me: () => Promise.resolve({ ...ME, isOfficer: true }), members: () => Promise.resolve([ROW]) });

  await refreshOrgPolicy(h, account);

  assert.equal(h.orgPolicy.get('a1')?.isAdmin, true);
  assert.deepEqual(h.orgRoster.get('a1'), [ROW]);
});

test('a roster that cannot be read keeps the previous roster and the fresh policy', async () => {
  let rosterCalls = 0;
  const h = host({
    me: () => Promise.resolve({ ...ME, role: 'admin' }),
    members: () => (rosterCalls++ === 0 ? Promise.resolve([ROW]) : Promise.reject(new Error('HTTP 503'))),
  });
  await refreshOrgPolicy(h, account);

  await refreshOrgPolicy(h, account);

  assert.deepEqual(h.orgRoster.get('a1'), [ROW]);
  assert.equal(h.beats.length, 2, 'the policy itself succeeded twice');
});

test('a demoted admin loses the roster on the next successful read', async () => {
  // A roster kept after the role went would keep drawing colleagues’ roles from a list this
  // window may no longer read — stale facts drawn as current ones.
  let role = 'admin';
  const h = host({ me: () => Promise.resolve({ ...ME, role }), members: () => Promise.resolve([ROW]) });
  await refreshOrgPolicy(h, account);
  role = 'member';

  await refreshOrgPolicy(h, account);

  assert.equal(h.orgRoster.get('a1'), undefined);
  assert.equal(h.orgPolicy.get('a1')?.isAdmin, false);
});

test('an account that syncs to no server has no policy, and a stale one is dropped', async () => {
  const h = host(undefined);
  h.orgPolicy.set('a1', { corpMode: true } as CorpPolicyState);
  h.orgRoster.set('a1', [ROW]);

  await refreshOrgPolicy(h, account);

  assert.equal(h.orgPolicy.get('a1'), undefined);
  assert.equal(h.orgRoster.get('a1'), undefined);
  assert.deepEqual(h.beats, []);
});

test('a heartbeat store that throws does not take the refresh down with it', async () => {
  const h = host({ me: () => Promise.resolve(ME), members: () => Promise.resolve([]) });
  h.heartbeat = () => Promise.reject(new Error('globalState is read-only right now'));

  await refreshOrgPolicy(h, account);

  assert.equal(h.orgPolicy.get('a1')?.role, 'member', 'the state is still cached');
});

test('an account repointed at another server loses the previous one’s answer before anything is asked', async () => {
  // The id survives a change of sync location, so the id alone would let the old server's role
  // outlive a failed first read against the new one — and the tree would offer management actions
  // there on an authority nobody granted.
  const h = host({ me: async () => ({ ...ME, role: 'admin' }), members: async () => [] });
  await refreshOrgPolicy(h, account);
  assert.equal(h.orgPolicy.get(account.accountId)?.isAdmin, true, 'precondition: admin on the first server');

  // The same account, a different server, and that server cannot be reached.
  const moved = host(undefined);
  moved.orgPolicy.set(account.accountId, h.orgPolicy.get(account.accountId)!);
  moved.orgPolicyServer.set(account.accountId, 'https://old.example.com');
  await refreshOrgPolicy(moved, account);

  assert.equal(moved.orgPolicy.has(account.accountId), false, 'the old server’s answer is gone');
});

test('the refresh reports what it managed, so a caller that just wrote knows the tree may lag', async () => {
  // It never throws — a throw would break the repaint that draws every other row — so an outcome is
  // the only way the role command can tell "the write landed and the view is behind" from "all done".
  const unreachable = host({ me: async () => { throw new Error('no'); }, members: async () => [] });

  const outcome = await refreshOrgPolicy(unreachable, account);

  assert.deepEqual(outcome, { policyRead: false, rosterRead: false, projectsRead: false });
});

// --- the Server section's half of the same cycle ----------------------------------------------

/**
 * The metrics half rides this loop rather than owning a timer, for the reason `backupWatch.ts`
 * already argues: the readiness cycle runs on activation, after every unlock and after the commands
 * that call it, so the cost is bounded by what a person does.
 */
type ServerFake = OrgPolicyHost & { server: ServerSectionHost; asked: number; role: { value: string } };

function serverHost(
  probes: MetricsProbe[],
  published: ReleaseMemo = { version: '0.7.0', at: 1_000 },
): ServerFake {
  const role = { value: 'admin' };
  const h = host({
    me: () => Promise.resolve({ ...ME, role: role.value }),
    members: () => Promise.resolve([]),
  }) as unknown as ServerFake;
  let at = 0;
  h.role = role;
  h.asked = 0;
  h.server = {
    readerFor: () => ({
      probeMetrics: (): Promise<MetricsProbe> => {
        h.asked += 1;
        const probe = probes[Math.min(at, probes.length - 1)];
        at += 1;
        return probe === undefined ? Promise.reject(new Error('boom')) : Promise.resolve(probe);
      },
    }),
    metrics: new Map<string, ServerRead>(),
    backup: new Map<string, BackupRead>(),
    release: undefined,
    published: () => Promise.resolve(published),
  };
  return h;
}

const METRICS = { version: '0.6.0', vaults: 41 } as ServerMetrics;
const NEWER = { version: '0.7.0', vaults: 42 } as ServerMetrics;

test('a first refusal records itself with no value to keep', async () => {
  const h = serverHost([{ failure: 'refused' }]);

  await refreshOrgPolicy(h, account);

  assert.deepEqual(h.server.metrics.get('a1'), { value: undefined, failure: 'refused', at: 1_000 });
});

test('a success replaces it, a later failure KEEPS the value, and a success clears the failure', async () => {
  // The whole reason the cache holds an envelope rather than a bare document: the version and the
  // footprint must stay readable while the scope row says the answer is old, and a row that had
  // succeeded once must not look healthy for ever afterwards.
  const h = serverHost([
    { failure: 'refused' },
    { metrics: METRICS },
    { failure: 'unreachable' },
    { metrics: NEWER },
  ]);

  await refreshOrgPolicy(h, account);
  await refreshOrgPolicy(h, account);
  assert.deepEqual(h.server.metrics.get('a1'), { value: METRICS, at: 1_000 });

  await refreshOrgPolicy(h, account);
  assert.deepEqual(h.server.metrics.get('a1'), { value: METRICS, failure: 'unreachable', at: 1_000 });

  await refreshOrgPolicy(h, account);
  assert.deepEqual(h.server.metrics.get('a1'), { value: NEWER, at: 1_000 });
});

test('a reader that THROWS is an unreachable server, never an exception into the repaint', async () => {
  // A throw here would break the repaint that draws every other row — the one thing this module
  // promises not to do.
  const h = serverHost([]);

  await refreshOrgPolicy(h, account);

  assert.deepEqual(h.server.metrics.get('a1'), { value: undefined, failure: 'unreachable', at: 1_000 });
});

test('a developer is never asked, and a demotion takes the cached facts with the section', async () => {
  const h = serverHost([{ metrics: METRICS }]);
  await refreshOrgPolicy(h, account);
  h.server.backup.set('a1', { value: { lastResult: 'ok' } as BackupStatus, at: 0 });
  assert.equal(h.asked, 1);

  // The next cycle says this account is a plain member: the section goes, and so do its answers —
  // a version drawn from a server this window may no longer read is a stale fact drawn as a fresh one.
  h.role.value = 'member';

  await refreshOrgPolicy(h, account);

  assert.equal(h.asked, 1, 'a developer’s window makes no outbound metrics request at all');
  assert.equal(h.server.metrics.has('a1'), false);
  assert.equal(h.server.backup.has('a1'), false);
});

test('the published release is read once per cycle into ONE memo, not one per account', async () => {
  const h = serverHost([{ metrics: METRICS }]);

  await refreshOrgPolicy(h, account);

  assert.deepEqual(h.server.release, { version: '0.7.0', at: 1_000 });
});

test('a repoint drops the Server section’s caches with the policy ones', async () => {
  // An account repointed at another corporate server keeps its id, so without this the previous
  // server's version and backup state would survive the move and be drawn as this one's.
  const h = serverHost([{ metrics: METRICS }]);
  await refreshOrgPolicy(h, account);
  h.server.backup.set('a1', { value: { lastResult: 'ok' } as BackupStatus, at: 0 });

  h.orgPolicyServer.set('a1', 'https://somewhere-else.example.com');
  await refreshOrgPolicy(h, account);

  assert.equal(h.server.backup.has('a1'), false, 'the backup answer went with the server it came from');
});

test('a read still in flight when the account is repointed is never written down', async () => {
  // The code round's finding. The repoint above clears the caches, but a probe that was ALREADY
  // awaiting when it happened used to complete afterwards and write the old server's version and
  // footprint back under the same account id — and the tree drew them as the new server's, with
  // nothing on the row saying otherwise. The server a read was asked OF is part of what the answer
  // is, so it is captured before the await and checked before the write.
  let release: ((probe: MetricsProbe) => void) | undefined;
  const waiting = new Promise<MetricsProbe>((resolve) => { release = resolve; });
  const h = serverHost([]);
  Object.defineProperty(h.server, 'readerFor', {
    value: () => ({ probeMetrics: (): Promise<MetricsProbe> => waiting }),
  });

  const inFlight = refreshOrgPolicy(h, account);
  // Let the refresh reach the probe, then repoint while it is still out.
  for (let turn = 0; turn < 20; turn += 1) {
    await Promise.resolve();
  }
  h.orgPolicyServer.set('a1', 'https://somewhere-else.example.com');
  release?.({ metrics: METRICS });
  await inFlight;

  assert.equal(
    h.server.metrics.has('a1'),
    false,
    'the old server’s facts must not be drawn as the new one’s',
  );
});
