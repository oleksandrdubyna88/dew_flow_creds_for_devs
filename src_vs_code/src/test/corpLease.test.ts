import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CorpPolicyState, MOST_RESTRICTIVE_POLICY } from '../corpPolicy';
import { STRICT_ONLINE_GRACE_MS, describeLocked, leaseExpired, leaseWindowMs, lockedReason } from '../corpLease';
import { refuseExit } from '../corpExits';

const HOUR = 60 * 60 * 1000;

function state(over: Partial<CorpPolicyState> = {}): CorpPolicyState {
  return {
    corpMode: true,
    role: 'dev',
    isOfficer: false,
    isAdmin: false,
    active: true,
    policy: { export: false, share: 'project', moveOutOfProject: false },
    policyFromServer: true,
    projects: [],
    pendingFolderRemovals: [],
    leaseHours: 24,
    fetchedAt: 1_000_000,
    ...over,
  };
}

test('a personal account never expires', () => {
  // A corporate rule must not reach an account that is not subject to one.
  assert.equal(leaseExpired({ state: state({ corpMode: false }) }, 1_000_000 + 500 * HOUR), false);
});

test('a corporate account expires when its last read is older than its lease', () => {
  const facts = { state: state({ leaseHours: 24 }) };

  assert.equal(leaseExpired(facts, 1_000_000 + 23 * HOUR), false);
  assert.equal(leaseExpired(facts, 1_000_000 + 25 * HOUR), true);
});

test('strictly online means one refresh of slack, not one millisecond', () => {
  // The plan round's finding: `0` read literally would expire between two refreshes and lock
  // somebody out while they were online and the client was working perfectly.
  const facts = { state: state({ leaseHours: 0 }) };

  assert.equal(leaseExpired(facts, 1_000_000 + 1), false);
  assert.equal(leaseExpired(facts, 1_000_000 + STRICT_ONLINE_GRACE_MS - 1), false);
  assert.equal(leaseExpired(facts, 1_000_000 + STRICT_ONLINE_GRACE_MS + 1), true);
  assert.equal(leaseWindowMs(0), STRICT_ONLINE_GRACE_MS);
  assert.equal(leaseWindowMs(-3), STRICT_ONLINE_GRACE_MS, 'a negative lease is not a lease');
});

test('a corporate account whose document is missing fails CLOSED', () => {
  // Otherwise clearing a cache buys unlimited offline use: no document, no lease, no limit.
  const known = { lastHeartbeat: 1_000_000 };

  assert.equal(leaseExpired(known, 1_000_000 + 60_000), false, 'inside the strictest window it still works');
  assert.equal(leaseExpired(known, 1_000_000 + STRICT_ONLINE_GRACE_MS + 1), true);
});

test('a window that has never seen a corporate server has nothing to expire', () => {
  assert.equal(leaseExpired({}, Date.now()), false);
});

test('deactivation outranks the lease, because it sends the person somewhere else', () => {
  const blocked = { state: state({ active: false }) };

  assert.equal(lockedReason(blocked, 1_000_000), 'deactivated');
  assert.equal(lockedReason({ state: state() }, 1_000_000 + 100 * HOUR), 'leaseExpired');
  assert.equal(lockedReason({ state: state() }, 1_000_000), '');
});

test('each locked sentence names what to DO', () => {
  assert.match(describeLocked('deactivated', 'a@b.com'), /re-activate/);
  assert.match(describeLocked('leaseExpired', 'a@b.com'), /Sync Now/);
  assert.match(describeLocked('leaseExpired', 'a@b.com'), /nothing has been deleted/);
  assert.equal(describeLocked('', 'a@b.com'), '');
});

test('a developer is refused all three exits, in their own words', () => {
  const dev = state();

  assert.match(refuseExit(dev, 'export'), /^Exporting is not allowed/);
  assert.match(refuseExit(dev, 'backup'), /^Backing this account up to disk is not allowed/);
  assert.match(refuseExit(dev, 'clone'), /^Cloning into another account is not allowed/);
  assert.match(refuseExit(dev, 'export'), /\(dev\)/);
});

test('a member is refused nothing, and a personal account is not asked', () => {
  assert.equal(refuseExit(state({ role: 'member', policy: { export: true, share: 'any', moveOutOfProject: true } }), 'export'), '');
  assert.equal(refuseExit(state({ corpMode: false }), 'export'), '');
  assert.equal(refuseExit(undefined, 'export'), '');
});

test('an unreadable document arrives here as a refusal, not as an absence', () => {
  // The fail-closed fallback epic 1 built: the client fills in DOWN.
  assert.notEqual(refuseExit(state({ policy: MOST_RESTRICTIVE_POLICY, policyFromServer: false }), 'export'), '');
});

test('the clone command is not gated, because it does not leave the account', () => {
  // The permission is "clone into ANOTHER account", and this product has no such operation:
  // `cloneNode` copies within one account and the drop handler moves within one. The sentence for a
  // cross-account move exists for epic 3 to use at the call site it will add.
  assert.match(refuseExit(state(), 'clone'), /into another account/);
});
