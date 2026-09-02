import assert from 'node:assert/strict';
import { test } from 'node:test';
import { orphanCandidates, sweepOrphanSecrets } from '../orphanSweep';
import { entitySecretKeys, paymentSecretKey, secretKey } from '../secretKeys';

/**
 * The one torn state allowed to exist, and the sweep that collects it.
 *
 * <p>Not a payment test — a test for EVERY kind. The plan filed this as a payment story and the
 * exploration found it is not one: `§3d`'s rule ("secret, then node") is per-OPERATION, and read as
 * a global rule it breaks deletion. Two rounds of the review gate shaped the invariant, including
 * finding that my first version of it destroyed data on delete and that a single `applySecrets` call
 * cannot be right for a save that both adds and clears.</p>
 *
 * <blockquote>An orphaned secret — bytes in the keychain that no node references — is the only torn
 * state allowed to exist. It is invisible, harmless and collectable. A node claiming a record that is
 * not there is visible, broken, and it SYNCS.</blockquote>
 *
 * <p>From which: <b>Rule A</b> — the referrer is written on the safe side of its referent. Adding a
 * reference writes the referent first (secret, then node); removing one writes the referrer first
 * (node, then secret). <b>Rule B</b> — a durable record naming what is about to become unreachable
 * exists BEFORE it becomes unreachable; for a deletion that record is the tombstone.</p>
 */

const A = 'acct-1';

test('a recorded deletion whose node is gone is a candidate; one whose node is live is not', () => {
  assert.deepEqual(orphanCandidates(['gone', 'alive'], ['alive']), ['gone']);
  assert.deepEqual(orphanCandidates([], ['alive']), [], 'nothing recorded, nothing to sweep');
  assert.deepEqual(orphanCandidates(['gone'], []), ['gone']);
});

test('an id that is BOTH tombstoned and live is never swept', () => {
  // Not a nicety — it is the state an interrupted deletion LEAVES, because the tombstone is now
  // written before the node is removed. Sweeping it would delete the secrets of a live entry, which
  // is the data loss the ordering exists to prevent.
  assert.deepEqual(orphanCandidates(['recreated'], ['recreated']), []);
});

/** A keychain fake that records what was deleted, so the sweep can be watched rather than trusted. */
function store(initial: Record<string, string>): {
  get(key: string): Promise<string | undefined>;
  delete(key: string): Promise<void>;
  keys(): string[];
  deletes: string[];
} {
  const map = new Map(Object.entries(initial));
  const deletes: string[] = [];
  return {
    get: (key) => Promise.resolve(map.get(key)),
    delete: (key) => {
      deletes.push(key);
      map.delete(key);
      return Promise.resolve();
    },
    keys: () => [...map.keys()],
    deletes,
  };
}

test('the sweep deletes every key a departed entity owned, and nothing a live one does', async () => {
  const s = store({
    [secretKey(A, 'gone')]: 'pw',
    [paymentSecretKey(A, 'gone')]: '{"cvv":"123"}',
    [secretKey(A, 'alive')]: 'keep me',
  });

  const result = await sweepOrphanSecrets(s, A, ['gone', 'alive'], ['alive']);

  assert.equal(result.deleted, 2, 'both of the departed entity’s keys');
  assert.equal(result.checked, 1, 'one candidate — the live id was not a candidate at all');
  assert.deepEqual(s.keys(), [secretKey(A, 'alive')], 'the live entry is untouched');
});

test('the sweep reports what was really there, not how many keys it tried', async () => {
  // An entity owns twelve keys and almost never holds twelve secrets. A sweep that claimed twelve
  // deletions per entry would make every log line about it useless.
  const s = store({ [secretKey(A, 'gone')]: 'pw' });

  const result = await sweepOrphanSecrets(s, A, ['gone'], []);

  assert.equal(result.deleted, 1);
  assert.deepEqual(s.deletes, [secretKey(A, 'gone')], 'and empty slots are not deleted for show');
});

test('a tombstone with nothing left in the keychain is a no-op, not an error', async () => {
  const s = store({});
  const result = await sweepOrphanSecrets(s, A, ['swept-already'], []);
  assert.deepEqual(result, { deleted: 0, checked: 1 });
});

test('the sweep covers EVERY key an entity owns, including its revision history', async () => {
  // Driven from `entitySecretKeys` rather than a list written here, so a twelfth kind is swept the
  // day it is added. The history key is included on purpose: previous versions of a secret are
  // secrets, and an orphaned history is the one nobody thinks to look for.
  const keys = entitySecretKeys(A, 'gone');
  const s = store(Object.fromEntries(keys.map((k) => [k, 'x'])));

  const result = await sweepOrphanSecrets(s, A, ['gone'], []);

  assert.equal(result.deleted, keys.length, `all ${keys.length} keys`);
  assert.deepEqual(s.keys(), []);
  assert.ok(keys.some((k) => k.endsWith(':history')), 'the history key is one of them');
});
