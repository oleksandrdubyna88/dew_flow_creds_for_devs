import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CorpPolicyState } from '../corpPolicy';
import { standingGate } from '../corpBindingWiring';
import { StoredAccount } from '../types';

const account: StoredAccount = { accountId: 'acct-1', email: 'alice@example.com', provider: 'microsoft' };

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
    leaseHours: 24,
    fetchedAt: 1_000_000,
    ...over,
  };
}

const HOUR = 60 * 60 * 1000;

test('an account in good standing is not gated at all', () => {
  const gate = standingGate(() => state(), () => 1_000_000, () => 1_000_000);

  assert.equal(gate(account), '');
});

test('a deactivated account is refused before any secret is touched', () => {
  const gate = standingGate(() => state({ active: false }), () => 1_000_000, () => 1_000_000);

  assert.match(gate(account), /deactivated by an administrator/);
  assert.match(gate(account), /alice@example\.com/);
});

test('an account past its lease is refused, and told what to do', () => {
  const gate = standingGate(() => state({ leaseHours: 24 }), () => 1_000_000, () => 1_000_000 + 25 * HOUR);

  assert.match(gate(account), /Sync Now/);
  assert.match(gate(account), /nothing has been deleted/);
});

test('a personal account is never gated, however old its last anything', () => {
  const gate = standingGate(() => state({ corpMode: false }), () => undefined, () => 1_000_000 + 5_000 * HOUR);

  assert.equal(gate(account), '');
});

test('a corporate account whose document was lost is still gated by its heartbeat', () => {
  // Otherwise clearing the cache is a way out of the lease.
  const gate = standingGate(() => undefined, () => 1_000_000, () => 1_000_000 + 3 * HOUR);

  assert.match(gate(account), /Sync Now/);
});

test('a window that has never seen a corporate server gates nothing', () => {
  const gate = standingGate(() => undefined, () => undefined, () => Date.now());

  assert.equal(gate(account), '');
});
