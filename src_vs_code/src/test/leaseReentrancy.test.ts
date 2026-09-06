import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LeasedQueue } from '../leasedQueue';

/**
 * Taking the write lease from inside the write lease.
 *
 * <p>The question `PLAN_node_writes_are_last_write_wins.md` opens with, and it had to be answered
 * before anything could be moved behind the lease: `LeasedQueue.run` goes through a `SerialQueue`,
 * whose whole implementation is `tail.then(work)`. A nested `run` therefore queues BEHIND the task
 * that is calling it, and that task is waiting for the nested one. Neither ever finishes.</p>
 *
 * <p>That is not a hypothetical shape here: `createEntityWithSecrets` already runs inside the lease,
 * and a node write behind the lease would be reachable from it. So the answer is not "be careful" —
 * it is that the queue has to know it is already held, and run the inner work inline.</p>
 *
 * <p>Inline is the correct answer rather than a convenient one: the caller is ALREADY the exclusive
 * holder, of this window's queue and of the cross-window lock. Waiting would be waiting for itself;
 * running immediately preserves exactly the exclusivity the outer call took.</p>
 */

test('the lease taken from INSIDE the lease runs, rather than waiting for itself', async () => {
  const queue = new LeasedQueue(undefined);
  const order: string[] = [];

  await queue.run(async () => {
    order.push('outer start');
    await queue.run(async () => {
      order.push('inner');
    });
    order.push('outer end');
  });

  assert.deepEqual(order, ['outer start', 'inner', 'outer end'], 'the inner work ran between the outer halves');
});

/** Two separate calls still take their turns — re-entrancy must not become a free-for-all. */
test('two independent runs are still serialized', async () => {
  const queue = new LeasedQueue(undefined);
  const order: string[] = [];
  const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 5));

  const first = queue.run(async () => {
    order.push('a in');
    await settle();
    order.push('a out');
  });
  const second = queue.run(async () => {
    order.push('b in');
    await settle();
    order.push('b out');
  });
  await Promise.all([first, second]);

  assert.deepEqual(order, ['a in', 'a out', 'b in', 'b out'], 'b waited for a');
});

/** And the flag is released even when the outer work throws, or the next call deadlocks instead. */
test('a throw inside the lease does not leave it believing it is still held', async () => {
  const queue = new LeasedQueue(undefined);

  await assert.rejects(queue.run(() => Promise.reject(new Error('boom'))), /boom/);

  const order: string[] = [];
  await queue.run(async () => {
    order.push('ran after the throw');
    await queue.run(async () => order.push('and nested still works'));
  });

  assert.deepEqual(order, ['ran after the throw', 'and nested still works']);
});

/**
 * Nested does not mean unordered — the hole a review round found in the first guard.
 *
 * <p>`AsyncLocalStorage` is inherited by every task the holder starts, so two writes fired
 * CONCURRENTLY from inside the lease both see the context and, under a naive "run inline", both
 * execute at once. Each reads before either writes, and the second erases the first — which is
 * exactly the defect the lease was being extended to close, reintroduced one level down.</p>
 *
 * <p>Running inline is right for a call the holder AWAITS; it is wrong for siblings. So nested work
 * runs on a queue of its own: no waiting for the parent that is waiting for it, and no interleaving
 * between children.</p>
 */
test('two writes fired at once from INSIDE the lease still take their turns', async () => {
  const queue = new LeasedQueue(undefined);
  const order: string[] = [];
  const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 5));

  await queue.run(async () => {
    await Promise.all([
      queue.run(async () => {
        order.push('a in');
        await settle();
        order.push('a out');
      }),
      queue.run(async () => {
        order.push('b in');
        await settle();
        order.push('b out');
      }),
    ]);
  });

  assert.deepEqual(order, ['a in', 'a out', 'b in', 'b out'], 'the two children did not interleave');
});

/** And a child awaiting a GRANDCHILD must not queue behind itself. */
test('a grandchild of the lease runs rather than deadlocking behind its parent', async () => {
  const queue = new LeasedQueue(undefined);
  const order: string[] = [];

  await queue.run(async () => {
    await queue.run(async () => {
      order.push('child');
      await queue.run(async () => order.push('grandchild'));
      order.push('child end');
    });
  });

  assert.deepEqual(order, ['child', 'grandchild', 'child end']);
});

/**
 * The context dies with the lease, so late work does not slip through inline.
 *
 * <p>A reviewer's finding, and it is real: `AsyncLocalStorage` is kept by anything the holder
 * SCHEDULED, so a `setTimeout(() => void queue.run(…))` fired inside the lease still sees the
 * context when it runs — which may be long after the lock was released. Under a plain "inside means
 * inline" it would then write unserialized against another window.</p>
 *
 * <p>Their proposed fix was to hold the lease until such work finishes. That is worse than the
 * disease: a forgotten timer would hold the lock for ever, against a design whose whole point is a
 * TTL that a dead holder cannot outlive. What closes it instead is that the context is CLOSED when
 * the work returns — a late arrival sees a spent context and takes the ordinary path, waiting for
 * the lease like any other caller.</p>
 */
test('work scheduled inside the lease but running after it does NOT run inline', async () => {
  const queue = new LeasedQueue(undefined);
  const order: string[] = [];
  let late: Promise<void> | undefined;

  await queue.run(async () => {
    order.push('holder');
    // Scheduled and NOT awaited, so it fires after the holder has returned — which is the whole
    // case. Awaiting it here would make it an ordinary nested call, and running inline would be
    // right; the first version of this test did exactly that and went red for the wrong reason.
    setTimeout(() => {
      late = queue.run(async () => {
        order.push('late');
      });
    }, 10);
  });

  // The second version of the test was weak rather than wrong: the late work lands after the
  // holder either way, so the order alone proved nothing. What discriminates is whether it can cut
  // INTO somebody else's turn — so there is now somebody else's turn for it to try.
  const other = queue.run(async () => {
    order.push('other in');
    await new Promise<void>((resolve) => setTimeout(resolve, 40));
    order.push('other out');
  });
  await other;
  await late;

  assert.deepEqual(
    order,
    ['holder', 'other in', 'other out', 'late'],
    'the late work waited its turn instead of running inside another operation',
  );
});
