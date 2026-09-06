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
