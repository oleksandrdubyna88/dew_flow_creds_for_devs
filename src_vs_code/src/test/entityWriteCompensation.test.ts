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
 * claiming a record that is not there — the one state the invariant forbids, and the one that syncs.
 * So the undo is a removal and obeys Rule A in turn: node first, secrets second, and neither if the
 * node will not go.</p>
 */

/** What was asked of the two stores, in order — so the sequence can be watched, not trusted. */
function recorder(): { log: string[]; chain: Set<string>; tree: Set<string> } {
  return { log: [], chain: new Set(), tree: new Set() };
}

test('a create that fails at the node write leaves nothing in either store', async () => {
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
        undoNode: () => {
          r.tree.delete('ent');
          r.log.push('undoNode');
          return Promise.resolve();
        },
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
  assert.deepEqual(r.log, ['secret', 'undoNode', 'undoSecrets'], 'referrer before referent, both ways');
});

test('a node that was PERSISTED before the failure is removed before its secrets are', async () => {
  // The finding that reshaped this function. A memento can take the value and then report an error
  // while flushing; the node is live and syncing. Deleting the secret first — or only — would leave
  // an entry showing a field it cannot open, on every machine.
  const r = recorder();

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
      undoNode: () => {
        assert.deepEqual([...r.chain], ['ent'], 'the secret is still there while the node is removed');
        r.tree.delete('ent');
        return Promise.resolve();
      },
      undoSecrets: () => {
        assert.deepEqual([...r.tree], [], 'and only once the node is gone');
        r.chain.delete('ent');
        return Promise.resolve();
      },
    }),
  );

  assert.deepEqual([...r.tree], []);
  assert.deepEqual([...r.chain], []);
});

test('when the node cannot be removed, the secrets are LEFT — an orphan beats a broken entry', async () => {
  // Refusing to tidy is the correct answer when the thing that would make tidying safe failed.
  const r = recorder();
  let secretsTouched = false;

  await assert.rejects(() =>
    createEntityWithSecrets({
      writeSecrets: () => {
        r.chain.add('ent');
        return Promise.resolve();
      },
      writeNode: () => {
        r.tree.add('ent');
        return Promise.reject(new Error('flush failed'));
      },
      undoNode: () => Promise.reject(new Error('and the tree will not take a write either')),
      undoSecrets: () => {
        secretsTouched = true;
        return Promise.resolve();
      },
    }),
  );

  assert.equal(secretsTouched, false, 'the node may still be live — its record must stay readable');
  assert.deepEqual([...r.chain], ['ent']);
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
      undoNode: () => Promise.resolve(),
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
        undoNode: () => Promise.resolve(),
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
    undoNode: () => {
      undone = true;
      return Promise.resolve();
    },
    undoSecrets: () => {
      undone = true;
      return Promise.resolve();
    },
  });

  assert.deepEqual(order, ['secret', 'node'], 'Rule A');
  assert.equal(undone, false, 'nothing is undone when nothing failed');
});
