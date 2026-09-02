import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEntityWithSecrets } from '../entityWrite';

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
        nodeLanded: () => r.tree.has('ent'),
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
      nodeLanded: () => r.tree.has('ent'),
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

test('the caller still hears the failure even when nothing was undone', async () => {
  // The person is told the save failed and then finds the entry. A surprise, and the right trade:
  // the alternative is a credential deleted from under a node other machines can see.
  const boom = new Error('the flush failed');

  await assert.rejects(
    () =>
      createEntityWithSecrets({
        writeSecrets: () => Promise.resolve(),
        writeNode: () => Promise.reject(boom),
        nodeLanded: () => true,
        undoSecrets: () => Promise.reject(new Error('never reached')),
      }),
    (e) => e === boom,
  );
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
      nodeLanded: () => false,
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
        nodeLanded: () => false,
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
    nodeLanded: () => true,
    undoSecrets: () => {
      undone = true;
      return Promise.resolve();
    },
  });

  assert.deepEqual(order, ['secret', 'node'], 'Rule A');
  assert.equal(undone, false, 'nothing is undone when nothing failed');
});
