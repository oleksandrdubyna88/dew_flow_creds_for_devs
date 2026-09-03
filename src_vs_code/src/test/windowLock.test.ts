import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LOCK_TTL_MS, LockFs, WindowLock } from '../windowLock';
import { LeasedQueue, sweepWithRetry } from '../leasedQueue';

/**
 * The lock, and the queue that uses it.
 *
 * <p>Everything here is over a fake filesystem, which is the point of the port: the claim, the stale
 * break and the fenced release are decisions, and a decision that can only be shown by opening two
 * real VS Code windows is one nobody checks again.</p>
 *
 * <p>The first test is the one the whole design rests on. `mkdir` without `recursive` either creates
 * the directory or fails — that is the atomic operation the review round said to name before building
 * anything, after three vendors independently refuted a lease built on a store with no
 * compare-and-swap.</p>
 */

interface FakeFs extends LockFs {
  readonly dirs: Set<string>;
  readonly files: Map<string, string>;
  clock: number;
}

function fakeFs(): FakeFs {
  const dirs = new Set<string>();
  const files = new Map<string, string>();
  const made = new Map<string, number>();
  const io: FakeFs = {
    dirs,
    files,
    clock: 1_000_000,
    mkdir: (dir) => {
      // The whole primitive: creating an existing directory is a FAILURE, never a success.
      if (dirs.has(dir)) {
        return Promise.reject(new Error('EEXIST'));
      }
      dirs.add(dir);
      made.set(dir, io.clock);
      return Promise.resolve();
    },
    writeFile: (file, text) => {
      files.set(file, text);
      return Promise.resolve();
    },
    readFile: (file) => Promise.resolve(files.get(file)),
    remove: (dir) => {
      dirs.delete(dir);
      made.delete(dir);
      [...files.keys()].filter((f) => f.startsWith(dir)).forEach((f) => files.delete(f));
      return Promise.resolve();
    },
    createdAt: (dir) => Promise.resolve(made.get(dir)),
    now: () => io.clock,
  };
  return io;
}

const DIR = '/profile/write.lock';

function lock(io: LockFs, id: string): WindowLock {
  return new WindowLock(DIR, io, () => id);
}

test('the second window does not get the lock — the atomic mkdir is the whole primitive', async () => {
  const io = fakeFs();

  const first = await lock(io, 'A').take();
  const second = await lock(io, 'B').take();

  assert.notEqual(first, undefined, 'the first claim creates the directory');
  assert.equal(second, undefined, 'and the second finds it there, which is a failure and not a merge');
});

test('a released lock is takeable again', async () => {
  const io = fakeFs();
  const a = lock(io, 'A');
  const held = await a.take();

  await a.release(held!);

  assert.notEqual(await lock(io, 'B').take(), undefined);
});

test('a holder that stopped saying it was alive is broken, and only then', async () => {
  // The TTL is a liveness signal, not a deadline: it is the heartbeat going quiet that makes a lock
  // takeable, which is what a killed window and a wedged one have in common.
  const io = fakeFs();
  await lock(io, 'A').take();

  io.clock += LOCK_TTL_MS - 1;
  assert.equal(await lock(io, 'B').take(), undefined, 'still fresh, still held');

  io.clock += 2;
  assert.notEqual(await lock(io, 'B').take(), undefined, 'gone quiet for longer than the TTL');
});

test('a heartbeat keeps a long operation holding it, however long it runs', async () => {
  const io = fakeFs();
  const a = lock(io, 'A');
  const held = await a.take();

  for (let elapsed = 0; elapsed < LOCK_TTL_MS * 3; elapsed += LOCK_TTL_MS / 2) {
    io.clock += LOCK_TTL_MS / 2;
    await a.beat(held!);
  }

  assert.equal(await lock(io, 'B').take(), undefined, 'three TTLs later and still legitimately held');
});

test('a broken holder cannot delete the lock of the window that replaced it', async () => {
  // The fencing check. Without it the release is the failure the lock exists to prevent, arriving
  // through the exit: A overruns, B takes over, A finishes and removes B's lock, and two run.
  const io = fakeFs();
  const a = lock(io, 'A');
  const stale = await a.take();
  io.clock += LOCK_TTL_MS + 1;
  const b = lock(io, 'B');
  const fresh = await b.take();
  assert.notEqual(fresh, undefined, 'B broke the stale lock and holds it');

  await a.release(stale!);

  assert.equal(await lock(io, 'C').take(), undefined, "A's release did not free B's lock");
  await b.release(fresh!);
  assert.notEqual(await lock(io, 'C').take(), undefined, 'and B releasing it does free it');
});

test('a broken holder cannot resurrect its claim with a heartbeat either', async () => {
  const io = fakeFs();
  const a = lock(io, 'A');
  const stale = await a.take();
  io.clock += LOCK_TTL_MS + 1;
  const fresh = await lock(io, 'B').take();

  await a.beat(stale!);
  io.clock += LOCK_TTL_MS - 1;

  assert.equal(await lock(io, 'C').take(), undefined, "B's lock is what stands");
  assert.notEqual(fresh, undefined);
});

test('a window killed between its mkdir and its write does not lock the profile for ever', async () => {
  // The directory exists and names nobody. Without the created-at fallback its age is unknowable and
  // the profile is held by a claim that never finished.
  const io = fakeFs();
  await io.mkdir(DIR);

  assert.equal(await lock(io, 'B').take(), undefined, 'fresh enough to respect');
  io.clock += LOCK_TTL_MS + 1;
  assert.notEqual(await lock(io, 'B').take(), undefined, 'and stale enough to break');
});

test('a holder file that is corrupt is no holder, and never a throw', async () => {
  const io = fakeFs();
  await io.mkdir(DIR);
  await io.writeFile(`${DIR}/holder.json`, 'not json at all');

  io.clock += LOCK_TTL_MS + 1;

  assert.notEqual(await lock(io, 'B').take(), undefined);
});

test('with no lock at all the queue is exactly a SerialQueue', async () => {
  const queue = new LeasedQueue(undefined);
  const order: string[] = [];

  const first = queue.run(async () => {
    await Promise.resolve();
    order.push('first');
  });
  const second = queue.run(() => {
    order.push('second');
    return Promise.resolve();
  });
  await Promise.all([first, second]);

  assert.deepEqual(order, ['first', 'second'], 'one at a time, in order — the behaviour we had');
});

test('the queue waits for another window and says so where a person can see it', async () => {
  const io = fakeFs();
  const other = lock(io, 'OTHER');
  const held = await other.take();
  let showing = 0;
  const queue = new LeasedQueue(lock(io, 'MINE'), {
    notice: () => {
      showing += 1;
      return () => {
        showing -= 1;
      };
    },
    // The poll: hand the lock over on the first tick rather than sleeping in a test.
    wait: async () => {
      await other.release(held!);
    },
    every: () => ({ stop: () => undefined }),
  });

  const ran = await queue.run(() => Promise.resolve('done'));

  assert.equal(ran, 'done', 'it waited and then ran — it did not fail and it did not skip');
  assert.equal(showing, 0, 'and the notice came down again');
});

test('the sweep SKIPS while another window holds it — and comes back', async () => {
  // Skipping is right: the other window is doing this work. Skipping and never returning is a leak,
  // because the sweep runs once at startup and the holder may be killed a moment later.
  const io = fakeFs();
  await lock(io, 'OTHER').take();
  const queue = new LeasedQueue(lock(io, 'MINE'), { every: () => ({ stop: () => undefined }) });
  const retries: number[] = [];
  let ran = 0;

  const answer = await sweepWithRetry(queue, () => {
    ran += 1;
    return Promise.resolve(['acc-1']);
  }, { after: (ms) => retries.push(ms), attempts: 3 });

  assert.deepEqual(answer, [], 'it finished nothing, and said so honestly');
  assert.equal(ran, 0, 'the work did not run');
  assert.deepEqual(retries, [LOCK_TTL_MS], 'and it asked to be tried again once the lock could be broken');
});

test('the sweep runs normally when nothing holds the lock', async () => {
  const io = fakeFs();
  const queue = new LeasedQueue(lock(io, 'MINE'), { every: () => ({ stop: () => undefined }) });

  const answer = await sweepWithRetry(queue, () => Promise.resolve(['acc-1']), { after: () => undefined });

  assert.deepEqual(answer, ['acc-1']);
});

test('the lock is given back even when the work throws', async () => {
  const io = fakeFs();
  const queue = new LeasedQueue(lock(io, 'MINE'), { every: () => ({ stop: () => undefined }) });

  await assert.rejects(() => queue.run(() => Promise.reject(new Error('the work failed'))));

  assert.notEqual(await lock(io, 'OTHER').take(), undefined, 'a failed operation is not a wedged profile');
});
