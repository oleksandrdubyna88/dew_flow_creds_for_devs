import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NODES_KEY_PREFIX, orphanedAccountIds } from '../accountRemoval';

/**
 * Removing an account cannot be atomic, so the only question is which torn state a kill leaves.
 *
 * <p>Round 1 of the S1.4 review found the previous answer wrong, and both providers found it
 * independently: it wrote tombstones and then wiped the tree, so a kill in between left ids that
 * were both tombstoned and live — the state `orphanCandidates` deliberately refuses to sweep,
 * because for an ENTITY it means a deletion merely unfinished. Nothing ever finished this one. The
 * entries stayed visible here, their tombstones synced a deletion to every other machine, and their
 * secrets were never collected.</p>
 *
 * <p>The order now needs no new durable record at all: <b>unlist the account first</b>. It is then
 * invisible to the UI and to the sync cycle (which iterates `getAccounts()`), while its node list
 * key — the thing that NAMES every id whose secrets are still to be deleted — is still in
 * `globalState`. The durable record Rule B asks for is the tree itself, which is exactly what used
 * to be destroyed first.</p>
 */

test('a node list whose account is no longer listed is work left over from a killed window', () => {
  const keys = [
    `${NODES_KEY_PREFIX}acct-live`,
    `${NODES_KEY_PREFIX}acct-half-removed`,
    'credSshManager.accounts',
    'credSshManager.tombstones.acct-half-removed',
  ];

  assert.deepEqual(orphanedAccountIds(keys, ['acct-live']), ['acct-half-removed']);
});

test('nothing is left over when every stored tree belongs to a listed account', () => {
  const keys = [`${NODES_KEY_PREFIX}a`, `${NODES_KEY_PREFIX}b`];
  assert.deepEqual(orphanedAccountIds(keys, ['a', 'b']), []);
  assert.deepEqual(orphanedAccountIds([], ['a']), [], 'a fresh install has nothing to resume');
});

test('only the node list key names an account — the others are keyed beside it', () => {
  // Deliberately narrow. Tombstones and horizons are dropped with the tree, so a stray one is not a
  // reason to re-run a wipe; and matching them would make the sweep sensitive to the drop ORDER.
  const keys = ['credSshManager.tombstones.ghost', 'credSshManager.horizon.ghost'];
  assert.deepEqual(orphanedAccountIds(keys, []), []);
});

test('a key that is the bare prefix names no account and is ignored', () => {
  assert.deepEqual(orphanedAccountIds([NODES_KEY_PREFIX], []), []);
});

test('an account id containing dots survives the split', () => {
  // Ids are uuids today, but the key is built by concatenation and `quarantineUnsafeIds` renames
  // only what would BREAK a key. Slicing the prefix rather than splitting on '.' costs nothing and
  // cannot mis-parse.
  const id = 'tenant.eu.west-1';
  assert.deepEqual(orphanedAccountIds([`${NODES_KEY_PREFIX}${id}`], []), [id]);
});
