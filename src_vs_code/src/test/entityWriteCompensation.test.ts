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
 */

/** A keychain fake small enough to read: what is in it, and what was asked of it, in order. */
function chain(): { map: Map<string, string>; log: string[] } {
  return { map: new Map(), log: [] };
}

test('a create that fails at the node write leaves nothing in the keychain', async () => {
  const c = chain();
  const boom = new Error('globalState refused the write');

  await assert.rejects(
    () =>
      createEntityWithSecrets(
        () => {
          c.map.set('acct_ent', 'hunter2');
          c.log.push('store');
          return Promise.resolve();
        },
        () => Promise.reject(boom),
        () => {
          c.map.delete('acct_ent');
          c.log.push('delete');
          return Promise.resolve();
        },
      ),
    (e) => e === boom,
    'the ORIGINAL failure is what the caller hears',
  );

  assert.deepEqual([...c.map.keys()], [], 'the secret went back');
  assert.deepEqual(c.log, ['store', 'delete']);
});

test('a create that fails DURING the secret writes still undoes the ones that landed', async () => {
  // The realistic keychain failure: three of five stored, the fourth refused. Undoing "everything
  // this id owns" is safe here precisely because the id is new — there is nothing else to lose.
  const c = chain();

  await assert.rejects(() =>
    createEntityWithSecrets(
      async () => {
        c.map.set('pw', 'a');
        c.map.set('notes', 'b');
        await Promise.reject(new Error('keychain locked'));
      },
      () => {
        c.log.push('node');
        return Promise.resolve();
      },
      () => {
        c.map.clear();
        return Promise.resolve();
      },
    ),
  );

  assert.deepEqual([...c.map.keys()], []);
  assert.deepEqual(c.log, [], 'the node was never written, so nothing broken ever synced');
});

test('an undo that fails too does not replace the error that made it necessary', async () => {
  // A failure to tidy up must not mask the failure being tidied — the caller would then be told
  // about a keychain delete when what actually went wrong was the node write.
  const original = new Error('the real problem');

  await assert.rejects(
    () =>
      createEntityWithSecrets(
        () => Promise.resolve(),
        () => Promise.reject(original),
        () => Promise.reject(new Error('and the cleanup failed as well')),
      ),
    (e) => e === original,
  );
});

test('the happy path writes the secret BEFORE the node, and returns', async () => {
  const order: string[] = [];
  let undone = false;

  await createEntityWithSecrets(
    () => {
      order.push('secret');
      return Promise.resolve();
    },
    () => {
      order.push('node');
      return Promise.resolve();
    },
    () => {
      undone = true;
      return Promise.resolve();
    },
  );

  assert.deepEqual(order, ['secret', 'node'], 'Rule A');
  assert.equal(undone, false, 'nothing is undone when nothing failed');
});
