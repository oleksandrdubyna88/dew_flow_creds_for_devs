import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CleanupPort,
  EMPTY_PENDING,
  PendingCleanup,
  clearAccountRemoving,
  clearSecretsPending,
  isEmptyPending,
  markAccountRemoving,
  markSecretsPending,
  parsePendingCleanup,
  removeWithIntent,
  resumePending,
} from '../pendingCleanup';

/**
 * Work in flight, recorded LOCALLY — the answer two review rounds arrived at by killing the other one.
 *
 * <p>Both operations that remove things in an interruptible sequence first tried a <b>tombstone</b> as
 * their Rule B record, and both were wrong for the same reason: a tombstone syncs. Account removal
 * left ids tombstoned-and-live, which the sweep refuses forever while the record told every other
 * machine to delete them. The restore path tried making the tombstone weak instead, and the review
 * pointed out that a weak record loses the merge to a live remote node, which then syncs back over
 * secrets already deleted.</p>
 *
 * <p>What these operations need is a note to THIS machine about work in flight. Never published,
 * never in a bundle, cleared when the work lands.</p>
 */

test('a corrupt or missing record reads as nothing pending, never as a crash', () => {
  for (const raw of [undefined, null, 42, 'nonsense', [], { accounts: 'no' }]) {
    assert.deepEqual(parsePendingCleanup(raw), EMPTY_PENDING, `${JSON.stringify(raw)} is not a record`);
  }
});

test('a record survives the round trip, and junk inside it does not', () => {
  const parsed = parsePendingCleanup({ accounts: ['a1', 7, 'a2'], secrets: { a1: ['e1', null, 'e2'], a2: 'no' } });

  assert.deepEqual(parsed.accounts, ['a1', 'a2']);
  assert.deepEqual(parsed.secrets, { a1: ['e1', 'e2'], a2: [] });
});

test('marking is idempotent, so a retried removal does not list an account twice', () => {
  const once = markAccountRemoving(EMPTY_PENDING, 'a1');
  assert.deepEqual(markAccountRemoving(once, 'a1').accounts, ['a1']);
  assert.deepEqual(clearAccountRemoving(once, 'a1').accounts, []);
  assert.deepEqual(clearAccountRemoving(EMPTY_PENDING, 'never-marked').accounts, [], 'and clearing what is not there is fine');
});

test('marking no ids at all writes nothing — an import that drops nothing costs no write', () => {
  assert.equal(markSecretsPending(EMPTY_PENDING, 'a1', []), EMPTY_PENDING, 'the same record, untouched');
});

test('an empty record is recognised, so the key is dropped instead of left as an empty shell', () => {
  assert.equal(isEmptyPending(EMPTY_PENDING), true);
  assert.equal(isEmptyPending(markAccountRemoving(EMPTY_PENDING, 'a1')), false);
  assert.equal(isEmptyPending(markSecretsPending(EMPTY_PENDING, 'a1', ['e1'])), false);
  assert.equal(isEmptyPending(clearSecretsPending(markSecretsPending(EMPTY_PENDING, 'a1', ['e1']), 'a1')), true);
});

/** A port that records the sequence, so intent-before-work can be watched rather than trusted. */
function port(initial: PendingCleanup, live: readonly string[] = [], listed: readonly string[] = []): {
  port: CleanupPort;
  order: string[];
  saved: PendingCleanup;
} {
  const state = { current: initial };
  const order: string[] = [];
  const made: CleanupPort = {
    read: () => state.current,
    write: (next) => {
      order.push(`write:${next.accounts.join(',')}|${Object.keys(next.secrets).join(',')}`);
      state.current = next;
      return Promise.resolve();
    },
    wipeAccount: (accountId) => {
      order.push(`wipe:${accountId}`);
      return Promise.resolve();
    },
    liveIds: () => live,
    isListed: (accountId) => listed.includes(accountId),
    forgetSecrets: (_a, entityId) => {
      order.push(`forget:${entityId}`);
      return Promise.resolve();
    },
  };
  return { port: made, order, get saved() { return state.current; } };
}

test('a removal records its intent BEFORE it unlists, and clears it only after the wipe', async () => {
  const p = port(EMPTY_PENDING);

  await removeWithIntent(p.port, 'a1', () => {
    p.order.push('unlist');
    return Promise.resolve();
  });

  assert.deepEqual(p.order, ['write:a1|', 'unlist', 'wipe:a1', 'write:|']);
  assert.equal(isEmptyPending(p.saved), true, 'and the record is gone once there is nothing to finish');
});

test('an interrupted removal is finished by the resume, and named in what it returns', async () => {
  const p = port({ accounts: ['a1'], secrets: {} });

  const finished = await resumePending(p.port);

  assert.deepEqual(finished, ['a1']);
  assert.deepEqual(p.order, ['wipe:a1', 'write:|']);
});

test('the resume deletes secrets ONLY for ids that really did leave the tree', async () => {
  // The trap, and the reason this is not a plain loop: interrupted BEFORE the tree was replaced,
  // those entities are still live and still hold their values. Deleting them then would be exactly
  // the data loss the whole invariant exists to prevent.
  const p = port({ accounts: [], secrets: { a1: ['gone', 'still-here'] } }, ['still-here']);

  await resumePending(p.port);

  assert.deepEqual(p.order, ['forget:gone', 'write:|'], 'the live entry keeps everything it has');
});

test('the resume is idempotent — a second run has nothing left to do', async () => {
  const p = port({ accounts: ['a1'], secrets: { a1: ['e1'] } });

  await resumePending(p.port);
  p.order.length = 0;
  const second = await resumePending(p.port);

  assert.deepEqual(second, []);
  assert.deepEqual(p.order, ['write:|'], 'one write that changes nothing, and no wipe');
});

test('a healthy install resumes nothing at all', async () => {
  const p = port(EMPTY_PENDING);
  assert.deepEqual(await resumePending(p.port), []);
  assert.deepEqual(p.order, ['write:|']);
});

test('an account that was ADDED BACK before the resume ran is never wiped', () => {
  // Account ids are stable per provider account, so "sign out, sign in again, then open a window" is
  // an ordinary sequence — and a stale marker would otherwise destroy the tree just re-added. The
  // account list IS the lifecycle identity the review asked for, because a removal unlists first.
  const p = port({ accounts: ['a1'], secrets: {} }, [], ['a1']);

  return resumePending(p.port).then((finished) => {
    assert.deepEqual(finished, [], 'nothing was finished, because nothing was still being removed');
    assert.deepEqual(p.order, ['write:|'], 'and above all: no wipe');
  });
});

test('two interrupted removals both survive in the record and are both finished', async () => {
  // The record is a LIST. A second removal starting before the first is resumed adds to it; it does
  // not replace it.
  const marked = markAccountRemoving(markAccountRemoving(EMPTY_PENDING, 'a1'), 'a2');
  const p = port(marked);

  const finished = await resumePending(p.port);

  assert.deepEqual(finished, ['a1', 'a2']);
  assert.deepEqual(p.order, ['wipe:a1', 'wipe:a2', 'write:|']);
});

test('liveness is re-read per id, so an entity that arrives mid-sweep keeps its secrets', async () => {
  // There is an await between every delete and a sync apply can land in one. A liveness answer from
  // before the previous await is an answer about a tree that may no longer be the tree.
  const live: string[] = [];
  const order: string[] = [];
  const state = { current: { accounts: [], secrets: { a1: ['first', 'arrives-late'] } } as PendingCleanup };
  const p: CleanupPort = {
    read: () => state.current,
    write: (next) => {
      state.current = next;
      return Promise.resolve();
    },
    wipeAccount: () => Promise.resolve(),
    isListed: () => false,
    liveIds: () => [...live],
    forgetSecrets: (_a, entityId) => {
      order.push(entityId);
      // Between this delete and the next check, a sync apply lands the second entity.
      live.push('arrives-late');
      return Promise.resolve();
    },
  };

  await resumePending(p);

  assert.deepEqual(order, ['first'], 'the id that became live again was not touched');
});
