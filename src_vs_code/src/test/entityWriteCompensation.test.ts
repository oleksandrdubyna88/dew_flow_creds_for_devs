import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EntryLandedError, createEntityWithSecrets } from '../entityWrite';

/**
 * Rule A leaves one torn state — a secret nothing points at — and on a CREATE nothing can collect it.
 *
 * <p>A deletion's orphan is collectable because the tombstone names it (`orphanSweep.ts`). A create
 * has no tombstone: if the node write fails after the secret is stored, that id is in neither the
 * tree nor any record, and the bytes stay in the keychain until the machine is wiped. The review
 * called that a security point rather than a tidiness one, which is why the create paths compensate
 * for every failure they can OBSERVE.</p>
 *
 * <p>The second round found the case that makes a naive compensation WORSE than none: a `writeNode`
 * that fails AFTER the node is persisted. Delete the secrets then and the result is a live node
 * claiming a record that is not there — the one state the invariant forbids, and the one that syncs.</p>
 *
 * <p>The third round settled what to do about it, by having the two providers demand OPPOSITE things
 * about the node retraction added in answer: one, that its tombstone might not dominate a concurrent
 * remote edit, so the remote node syncs back over deleted secrets; the other, that a tombstone which
 * DOES dominate will clobber a peer where the entity legitimately exists. Both are right, and together
 * they say there is no local answer. So the compensation covers only what one machine can settle
 * alone: <b>the node never landed</b>.</p>
 */

/** What was asked of the two stores, in order — so the sequence can be watched, not trusted. */
function recorder(): { log: string[]; chain: Set<string>; tree: Set<string> } {
  return { log: [], chain: new Set(), tree: new Set() };
}

test('a create whose node never landed leaves nothing in the keychain', async () => {
  const r = recorder();
  const boom = new Error('globalState refused the write');

  await assert.rejects(
    () =>
      createEntityWithSecrets({
        writeSecrets: () => {
          r.chain.add('ent');
          r.log.push('secret');
          return Promise.resolve();
        },
        writeNode: () => Promise.reject(boom),
        presence: () => (r.tree.has('ent') ? 'present' : 'absent'),
        deferCleanup: () => Promise.resolve(),
        finishCleanup: () => Promise.resolve(),
        undoSecrets: () => {
          r.chain.delete('ent');
          r.log.push('undoSecrets');
          return Promise.resolve();
        },
      }),
    (e) => e === boom,
    'the ORIGINAL failure is what the caller hears',
  );

  assert.deepEqual([...r.chain], [], 'the secret went back');
  assert.deepEqual(r.log, ['secret', 'undoSecrets']);
});

test('a node that DID land keeps its secrets, however the create ended', async () => {
  // A memento can take the value and then report an error while flushing. The entry is live, it may
  // already have synced, and it holds its values — a consistent entry reached by a failing path.
  // Deleting its secrets would be data loss on every machine that can see it; retracting it would be
  // this machine deciding what its peers may keep, which the review showed it cannot do safely.
  const r = recorder();
  let secretsTouched = false;

  await assert.rejects(() =>
    createEntityWithSecrets({
      writeSecrets: () => {
        r.chain.add('ent');
        return Promise.resolve();
      },
      writeNode: () => {
        r.tree.add('ent'); // persisted…
        return Promise.reject(new Error('…and then the flush failed')); // …but reported as a failure
      },
      presence: () => (r.tree.has('ent') ? 'present' : 'absent'),
      deferCleanup: () => Promise.resolve(),
      finishCleanup: () => Promise.resolve(),
      undoSecrets: () => {
        secretsTouched = true;
        return Promise.resolve();
      },
    }),
  );

  assert.equal(secretsTouched, false, 'nothing was taken away from a live entry');
  assert.deepEqual([...r.chain], ['ent'], 'the entry can still open every field it shows');
  assert.deepEqual([...r.tree], ['ent']);
});

test('a landed entry is REPORTED as landed, so a retry is not a blind duplicate', async () => {
  // Both providers raised the same consequence of leaving the entry alone: the person is shown
  // "creating failed", retries the same form, and ends up with two entries and no way to tell which
  // is real. Leaving the entry is still right — the alternative is deleting a credential from under a
  // node other machines can see — so what changes is what the person is TOLD.
  const boom = new Error('the flush failed');

  const thrown = await createEntityWithSecrets({
    writeSecrets: () => Promise.resolve(),
    writeNode: () => Promise.reject(boom),
    presence: () => 'present',
    deferCleanup: () => Promise.resolve(),
    finishCleanup: () => Promise.resolve(),
    undoSecrets: () => Promise.reject(new Error('never reached')),
  }).then(
    () => undefined,
    (e: unknown) => e,
  );

  assert.ok(thrown instanceof EntryLandedError, 'a distinct error, not a bare failure');
  assert.equal(thrown.cause, boom, 'wrapped AROUND the original, so the log still says what broke');
  assert.match(thrown.message, /created/, 'and the sentence says the entry exists');
  assert.match(thrown.message, /the flush failed/, 'with the real cause inside it');
});

test('a create that fails DURING the secret writes still undoes the ones that landed', async () => {
  // The realistic keychain failure: three of five stored, the fourth refused. `undoNode` runs first
  // as always and is a no-op — the node was never attempted.
  const r = recorder();

  await assert.rejects(() =>
    createEntityWithSecrets({
      writeSecrets: async () => {
        r.chain.add('pw');
        r.chain.add('notes');
        await Promise.reject(new Error('keychain locked'));
      },
      writeNode: () => {
        r.log.push('node');
        return Promise.resolve();
      },
      presence: () => 'absent',
      deferCleanup: () => Promise.resolve(),
      finishCleanup: () => Promise.resolve(),
      undoSecrets: () => {
        r.chain.clear();
        return Promise.resolve();
      },
    }),
  );

  assert.deepEqual([...r.chain], []);
  assert.deepEqual(r.log, [], 'the node was never written, so nothing broken ever synced');
});

test('an undo that fails too does not replace the error that made it necessary', async () => {
  const original = new Error('the real problem');

  await assert.rejects(
    () =>
      createEntityWithSecrets({
        writeSecrets: () => Promise.resolve(),
        writeNode: () => Promise.reject(original),
        presence: () => 'absent',
        deferCleanup: () => Promise.resolve(),
        finishCleanup: () => Promise.resolve(),
        undoSecrets: () => Promise.reject(new Error('and the cleanup failed as well')),
      }),
    (e) => e === original,
  );
});

test('the happy path writes the secret BEFORE the node, and undoes nothing', async () => {
  const order: string[] = [];
  let undone = false;

  await createEntityWithSecrets({
    writeSecrets: () => {
      order.push('secret');
      return Promise.resolve();
    },
    writeNode: () => {
      order.push('node');
      return Promise.resolve();
    },
    presence: () => 'present',
    deferCleanup: () => Promise.resolve(),
    finishCleanup: () => Promise.resolve(),
    undoSecrets: () => {
      undone = true;
      return Promise.resolve();
    },
  });

  assert.deepEqual(order, ['secret', 'node'], 'Rule A');
  assert.equal(undone, false, 'nothing is undone when nothing failed');
});

test('a tree that cannot be READ deletes nothing — and hands the id to the sweep', async () => {
  // The review's sharpest finding, twice over. `openNodesSlot` answers `[]` and records a
  // metadataFault when the sealed cache will not open — a device key reset, a corrupted cache — so
  // every node reads as missing. Harmless for rendering; catastrophic here, where it would mean
  // "nothing landed" for entities that all exist, and delete their secrets.
  //
  // Failing closed alone was not enough either: it left the aborted create's secrets with nothing
  // naming them, which is the uncollectable orphan this whole story exists to shrink. So it DEFERS.
  let deleted = false;
  let deferred = false;

  await assert.rejects(() =>
    createEntityWithSecrets({
      writeSecrets: () => Promise.resolve(),
      writeNode: () => Promise.reject(new Error('the write failed while the cache was unreadable')),
      presence: () => 'unknown',
      deferCleanup: () => {
        deferred = true;
        return Promise.resolve();
      },
      finishCleanup: () => Promise.resolve(),
      undoSecrets: () => {
        deleted = true;
        return Promise.resolve();
      },
    }),
  );

  assert.equal(deleted, false, 'absence must be PROVEN before anything is deleted');
  assert.equal(deferred, true, 'and the id is written down, so the sweep can finish the job later');
});

test('the id is written into the sweep record BEFORE the first secret, and taken out after the node', async () => {
  // The residual this story documented for seven rounds — a process kill between the first secret
  // write and the node write leaves an orphan nothing can name — is closed by writing the record
  // first. There is no expiry rule to invent, because the sweep never guesses: it acts on a pending id
  // only when that id's NODE IS ABSENT, so a create in flight is skipped for the same reason a create
  // that landed is.
  const order: string[] = [];

  await createEntityWithSecrets({
    deferCleanup: () => {
      order.push('defer');
      return Promise.resolve();
    },
    writeSecrets: () => {
      order.push('secret');
      return Promise.resolve();
    },
    writeNode: () => {
      order.push('node');
      return Promise.resolve();
    },
    finishCleanup: () => {
      order.push('finish');
      return Promise.resolve();
    },
    presence: () => 'present',
    undoSecrets: () => Promise.reject(new Error('never reached')),
  });

  assert.deepEqual(order, ['defer', 'secret', 'node', 'finish']);
});

test('a create killed after its record is written leaves an id the sweep can name', async () => {
  // Simulated by stopping at the secret write: whatever happens after `defer`, the id is on the list.
  const pending = new Set<string>();

  await assert.rejects(() =>
    createEntityWithSecrets({
      deferCleanup: () => {
        pending.add('e1');
        return Promise.resolve();
      },
      writeSecrets: () => Promise.reject(new Error('killed here')),
      writeNode: () => Promise.reject(new Error('never reached')),
      finishCleanup: () => {
        pending.delete('e1');
        return Promise.resolve();
      },
      presence: () => 'unknown',
      undoSecrets: () => Promise.reject(new Error('not on an unknown tree')),
    }),
  );

  assert.deepEqual([...pending], ['e1'], 'the sweep has something to find, whatever happened after');
});
