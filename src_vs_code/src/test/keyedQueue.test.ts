import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KeyedQueue } from '../keyedQueue';

/**
 * The per-key queue `OneUseLane` and the SSH agent's `ConsentTurns` share (#197, E2.3). Pure: no editor, no clock.
 * K1–K5 of the E2.3 spec; each has a break-it in the story's record (the mutation that turns it red).
 */

/** A job the test settles by hand; `started` says whether the queue has run it yet. */
function job<T = string>(): {
  work: () => Promise<T>;
  started: () => boolean;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
} {
  let started = false;
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const settled = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {
    work: () => {
      started = true;
      return settled;
    },
    started: () => started,
    resolve: (value) => resolve(value),
    reject: (error) => reject(error),
  };
}

const tick = (): Promise<void> => new Promise((r) => setImmediate(r));

test('K1 jobs of one key run one at a time, in arrival order', async () => {
  const queue = new KeyedQueue();
  const first = job();
  const second = job();
  const third = job();
  const done = [queue.run('k', first.work), queue.run('k', second.work), queue.run('k', third.work)];
  await tick();
  assert.deepEqual([first.started(), second.started(), third.started()], [true, false, false]);

  first.resolve('one');
  await tick();
  assert.deepEqual([first.started(), second.started(), third.started()], [true, true, false]);

  second.resolve('two');
  await tick();
  third.resolve('three');
  assert.deepEqual(await Promise.all(done), ['one', 'two', 'three']);
});

test('K6 a key with nothing in flight starts its job synchronously — and a synchronous throw is a rejection', async () => {
  const queue = new KeyedQueue();
  const first = job();
  const running = queue.run('k', first.work);
  assert.equal(first.started(), true, 'started before run() returned');

  await assert.rejects(
    queue.run('other', () => {
      throw new Error('thrown, not rejected');
    }),
    /thrown, not rejected/,
  );
  first.resolve('x');
  await running;
});

test('K2 a job that rejects fails only its own caller — the job behind it still runs', async () => {
  const queue = new KeyedQueue();
  const first = job();
  const second = job();
  const failing = queue.run('k', first.work);
  const behind = queue.run('k', second.work);
  first.reject(new Error('boom'));
  await assert.rejects(failing, /boom/);
  await tick();
  assert.equal(second.started(), true, 'the queue advanced past the failure');
  second.resolve('fine');
  assert.equal(await behind, 'fine');
});

test('K3 two keys never wait for each other', async () => {
  const queue = new KeyedQueue();
  const held = job();
  const other = job();
  const first = queue.run('a', held.work);
  const second = queue.run('b', other.work);
  await tick();
  assert.deepEqual([held.started(), other.started()], [true, true]);
  other.resolve('b done');
  assert.equal(await second, 'b done');
  held.resolve('a done');
  assert.equal(await first, 'a done');
});

test('K4 a key whose last job settled holds nothing', async () => {
  const queue = new KeyedQueue();
  const fine = job();
  const failing = job();
  const ok = queue.run('k', fine.work);
  assert.equal(queue.size(), 1, 'a job in flight is held');
  fine.resolve('x');
  await ok;
  assert.equal(queue.size(), 0, 'after a resolve');

  const bad = queue.run('k', failing.work);
  failing.reject(new Error('boom'));
  await assert.rejects(bad, /boom/);
  assert.equal(queue.size(), 0, 'after a reject');
});

test('K4b a key another job queued behind is not deleted by the one ahead', async () => {
  const queue = new KeyedQueue();
  const first = job();
  const second = job();
  const a = queue.run('k', first.work);
  const b = queue.run('k', second.work);
  first.resolve('a');
  await a;
  assert.equal(queue.size(), 1, 'the second job still owns the key');
  second.resolve('b');
  await b;
  assert.equal(queue.size(), 0);
});

test('K5 run answers the job\'s value and its rejection', async () => {
  const queue = new KeyedQueue();
  assert.equal(await queue.run('k', () => Promise.resolve(42)), 42);
  await assert.rejects(
    queue.run('k', () => Promise.reject(new Error('the work broke'))),
    /the work broke/,
  );
});
