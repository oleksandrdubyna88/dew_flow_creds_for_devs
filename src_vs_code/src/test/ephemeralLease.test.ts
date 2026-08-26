import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LEASE_MS, LeaseMap, classifyLeases, leaseKey, prunedLeases } from '../ephemeralLease';

const NOW = 1_700_000_000_000;
const A = leaseKey('acct-1', 'e1');
const B = leaseKey('acct-1', 'e2');

test('an entry a window is still vouching for is renewed, never swept', () => {
  const map: LeaseMap = { [A]: NOW - 60_000 };

  const { renewed, lapsed } = classifyLeases([A], map, NOW);

  assert.deepEqual(lapsed, []);
  assert.equal(renewed[A], NOW, 'the lease moved forward');
});

test('an entry no window has vouched for since the lease ran out is swept', () => {
  const map: LeaseMap = { [A]: NOW - LEASE_MS - 1 };

  const { renewed, lapsed } = classifyLeases([A], map, NOW);

  assert.deepEqual(lapsed, [A]);
  assert.equal(A in renewed, false, 'and is not kept alive by the same pass that condemned it');
});

test('an entry never seen on this machine is adopted, not destroyed', () => {
  // This is what an entry synced from another machine looks like, forever — and what a
  // freshly created one looks like until its first renewal. Sweeping the unleased would
  // delete a live entry from the other laptop the moment it arrived.
  const { renewed, lapsed } = classifyLeases([A], {}, NOW);

  assert.deepEqual(lapsed, []);
  assert.equal(renewed[A], NOW);
});

test('a lease exactly at the boundary has not lapsed yet', () => {
  assert.deepEqual(classifyLeases([A], { [A]: NOW - LEASE_MS + 1 }, NOW).lapsed, []);
  assert.deepEqual(classifyLeases([A], { [A]: NOW - LEASE_MS }, NOW).lapsed, [A]);
});

test('two profiles holding the same entity id keep separate leases', () => {
  assert.notEqual(leaseKey('acct-1', 'e1'), leaseKey('acct-2', 'e1'));
});

test('each key is decided on its own', () => {
  const map: LeaseMap = { [A]: NOW - LEASE_MS - 1, [B]: NOW };

  const { renewed, lapsed } = classifyLeases([A, B], map, NOW);

  assert.deepEqual(lapsed, [A]);
  assert.deepEqual(Object.keys(renewed), [B]);
});

test('the map forgets keys that no longer name anything', () => {
  // Otherwise it is append-only: a lengthening list of entity ids, rewritten every tick.
  const map: LeaseMap = { [A]: NOW, [B]: NOW };

  assert.deepEqual(prunedLeases(map, [B]), { [B]: NOW });
  assert.deepEqual(prunedLeases(map, []), {});
});

test('a stored value of the wrong shape is treated as no lease, not as a live one', () => {
  // globalState is machine-local and survives upgrades; a value from a future or corrupt
  // build must not read as "vouched for forever".
  const map = { [A]: 'not a number' } as unknown as LeaseMap;

  const { renewed, lapsed } = classifyLeases([A], map, NOW);

  assert.deepEqual(lapsed, [A], 'a shape we do not understand cannot vouch for anything');
  assert.equal(A in renewed, false);
});
