import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CorpPolicyFacts,
  MOST_RESTRICTIVE_POLICY,
  afterPolicyFetch,
  corpPolicy,
  describeLease,
  factsOf,
  isCorpAdmin,
  policyHeartbeatKey,
  roleLabel,
  teamMemberDescription,
  teamRowRole,
} from '../corpPolicy';
import { MemberListEntry, MemberSelf } from '../orgMembersClient';

/**
 * What the extension makes of the role-and-policy document — the decision layer between
 * `GET /api/org/me` and the tree. Pure, so every row of the table below is a test rather than a
 * comment in a `vscode`-bound file nobody can load.
 */

const PERMISSIVE = { export: true, share: 'any', moveOutOfProject: true };

function facts(overrides: Partial<CorpPolicyFacts> = {}): CorpPolicyFacts {
  return {
    corpMode: true,
    role: 'member',
    isOfficer: false,
    active: true,
    policy: PERMISSIVE,
    projects: [],
    offlineLeaseHours: 24,
    fetchedAt: 1_700_000_000_000,
    ...overrides,
  };
}

// ------------------------------------------------------------- the role → what-the-UI-shows table

test('an admin gets the admin view; a member and a dev do not', () => {
  assert.equal(corpPolicy(facts({ role: 'admin' })).isAdmin, true);
  assert.equal(corpPolicy(facts({ role: 'member' })).isAdmin, false);
  assert.equal(corpPolicy(facts({ role: 'dev' })).isAdmin, false);
});

test('an officer whose registry role is `member` STILL gets the admin view', () => {
  // The server's RequireAdmin admits an officer unconditionally, and an officer cannot be given a
  // registry role (that is the 409). Gating the UI on the role alone would show the CTO no
  // management actions while the server served every one of them.
  const state = corpPolicy(facts({ role: 'member', isOfficer: true }));
  assert.equal(state.isAdmin, true);
  assert.equal(isCorpAdmin(state), true);
  assert.equal(roleLabel(state.role, state.isOfficer), 'officer', 'and the row says officer, not member');
});

test('the client TRUSTS the policy the server sent and never re-derives it from the role', () => {
  // A second implementation of the same rule drifts the day either side changes it. So a dev
  // whose server says export is allowed is shown export allowed — the server is the one that
  // decides, and if the two disagree the disagreement must be visible, not papered over here.
  const state = corpPolicy(facts({ role: 'dev', policy: PERMISSIVE }));
  assert.deepEqual(state.policy, PERMISSIVE);
});

test('both dev share defaults arrive as the policy says them', () => {
  const project = corpPolicy(facts({ role: 'dev', policy: { export: false, share: 'project', moveOutOfProject: false } }));
  const none = corpPolicy(facts({ role: 'dev', policy: { export: false, share: 'none', moveOutOfProject: false } }));
  assert.equal(project.policy.share, 'project');
  assert.equal(none.policy.share, 'none');
  assert.equal(project.policy.export, false);
  assert.equal(none.policy.export, false);
});

test('an unknown role from a newer server shows no admin actions', () => {
  // A role this build has never heard of is one whose rights it cannot honestly grant. The
  // policy it came with is still trusted — that is the server's — but nothing here promotes.
  const state = corpPolicy(facts({ role: 'auditor' }));
  assert.equal(state.isAdmin, false);
  assert.equal(state.role, 'auditor', 'the row still says what the server said');
  assert.equal(roleLabel(state.role, false), 'auditor');
});

test('a malformed or absent policy degrades to the MOST restrictive, never the member default', () => {
  // The one case where the client fills in: the document says nothing usable about what is
  // allowed, and guessing "everything" would hand a developer an export on a parse error.
  for (const broken of [undefined, null, 'export', 42, {}, { export: 'yes' }, { export: true, share: 'any' }]) {
    assert.deepEqual(corpPolicy(facts({ policy: broken })).policy, MOST_RESTRICTIVE_POLICY, String(broken));
  }
  assert.deepEqual(MOST_RESTRICTIVE_POLICY, { export: false, share: 'none', moveOutOfProject: false });
});

test('a failed fetch keeps the previous answer — not knowing changes nothing', () => {
  // The org-escrow rule applied here: an unreachable server for one cycle must not strip an
  // admin of the admin view, nor hand a dev the member's. The heartbeat does not advance either.
  const previous = corpPolicy(facts({ role: 'admin', fetchedAt: 1_000 }));
  assert.equal(afterPolicyFetch(previous, undefined), previous);
  assert.equal(afterPolicyFetch(undefined, undefined), undefined, 'nothing known stays nothing known');
  const fresh = afterPolicyFetch(previous, facts({ role: 'dev', fetchedAt: 2_000 }));
  assert.equal(fresh?.role, 'dev');
  assert.equal(fresh?.fetchedAt, 2_000);
});

test('the lease is carried as the server said it, and a nonsense value is strictly online', () => {
  assert.equal(corpPolicy(facts({ offlineLeaseHours: 24 })).leaseHours, 24);
  assert.equal(corpPolicy(facts({ offlineLeaseHours: 0 })).leaseHours, 0, '0 is the legal strictly-online');
  assert.equal(corpPolicy(facts({ offlineLeaseHours: -3 })).leaseHours, 0, 'negative is not a lease');
  assert.equal(corpPolicy(facts({ offlineLeaseHours: Number.NaN })).leaseHours, 0);
  assert.match(describeLease(0), /strictly online/);
  assert.match(describeLease(24), /24 hours/);
});

test('corp mode off is carried through, so the page can say so instead of showing a member', () => {
  assert.equal(corpPolicy(facts({ corpMode: false })).corpMode, false);
  assert.equal(isCorpAdmin(undefined), false, 'no document yet means no admin view');
});

test('the heartbeat key is per account, in the style of the sync reminder', () => {
  assert.equal(policyHeartbeatKey('acct-1'), 'orgPolicy.lastOk.acct-1');
  assert.notEqual(policyHeartbeatKey('acct-1'), policyHeartbeatKey('acct-2'));
});

// ------------------------------------------------------------------ the facts from the wire

test('the facts are taken from the document field by field, with the fetch time stamped in', () => {
  const me: MemberSelf = {
    corpMode: true,
    email: 'dev@corp.com',
    role: 'dev',
    active: true,
    isOfficer: false,
    shareDefault: 'none',
    projects: [{ projectId: 'p1', share: 'inherit' }],
    pendingFolderRemovals: [],
    policy: { export: false, share: 'none', moveOutOfProject: false },
    offlineLeaseHours: 8,
    loginKeyVersion: 0,
    serverContract: 3,
  };
  const state = corpPolicy(factsOf(me, 5_000));
  assert.equal(state.role, 'dev');
  assert.equal(state.leaseHours, 8);
  assert.equal(state.fetchedAt, 5_000);
  assert.deepEqual(state.projects, [{ projectId: 'p1', share: 'inherit' }]);
  assert.equal(state.policy.share, 'none');
});

// ------------------------------------------------------------------------- the Team row

const roster: MemberListEntry[] = [
  { email: 'CTO@corp.com', role: 'member', active: true, shareDefault: 'project', projectIds: [], isOfficer: true, updatedAt: 0, updatedBy: '' },
  { email: 'boris@corp.com', role: 'dev', active: true, shareDefault: 'none', projectIds: [], isOfficer: false, updatedAt: 1, updatedBy: 'anna@corp.com' },
];

test('a colleague’s role comes from the roster, matched without regard to case', () => {
  // The roster is what the admin typed and what the token said; neither normalises for the other.
  assert.equal(teamRowRole({ email: 'boris@corp.com', isSelf: false }, undefined, roster), 'dev');
  assert.equal(teamRowRole({ email: 'cto@corp.com', isSelf: false }, undefined, roster), 'officer');
});

test('with no roster a member sees their own role on the (you) row and nothing on the others', () => {
  // A member cannot list the roster — GET /api/org/members is the admin's — so the only role a
  // member's window knows is their own, from /api/org/me. Inventing one for a colleague would be
  // a guess drawn as a fact.
  const viewer = corpPolicy(facts({ role: 'member' }));
  assert.equal(teamRowRole({ email: 'me@corp.com', isSelf: true }, viewer, undefined), 'member');
  assert.equal(teamRowRole({ email: 'boris@corp.com', isSelf: false }, viewer, undefined), undefined);
});

test('on a personal server nobody has a role to show', () => {
  const viewer = corpPolicy(facts({ corpMode: false }));
  assert.equal(teamRowRole({ email: 'me@corp.com', isSelf: true }, viewer, undefined), undefined);
});

test('the description keeps the provider and adds the role only when there is one', () => {
  // Ordinary accounts must read exactly as they did: `microsoft`, nothing more.
  assert.equal(teamMemberDescription('microsoft', undefined), 'microsoft');
  assert.equal(teamMemberDescription('microsoft', 'dev'), 'microsoft · dev');
});
