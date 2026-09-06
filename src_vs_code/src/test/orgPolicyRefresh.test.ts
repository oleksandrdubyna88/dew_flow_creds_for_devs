import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CorpPolicyState } from '../corpPolicy';
import { MemberListEntry, MemberSelf, OrgMembersClient } from '../orgMembersClient';
import { OrgPolicyHost, refreshOrgPolicy } from '../orgPolicyRefresh';
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
}

function host(fake: Fake | undefined, now = 1_000): OrgPolicyHost & { beats: [string, number][] } {
  const beats: [string, number][] = [];
  const client = fake === undefined ? undefined : ({ readMe: fake.me, listMembers: fake.members } as unknown as OrgMembersClient);
  return {
    beats,
    clientFor: () => client,
    orgPolicy: new Map<string, CorpPolicyState>(),
    orgRoster: new Map<string, readonly MemberListEntry[]>(),
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
