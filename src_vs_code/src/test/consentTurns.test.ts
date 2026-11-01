import assert from 'node:assert/strict';
import { test, TestContext } from 'node:test';
import * as v8 from 'node:v8';
import * as vm from 'node:vm';
import { ConsentTurns, MAX_RETAINED, MIN_PROMPT_MS, Refusal, TurnOutcome, promptFloor } from '../consentTurns';

/**
 * The turn each signing request takes at the prompt (#197, E2.3) — C1–C16 of the spec. Pure, so the whole suite
 * runs on the mocked `setTimeout` and a clock the test moves; nothing here waits on a real timer.
 *
 * <p>`work` is a deferred the test settles by hand, which is what lets a test say "the outcome is decided but the
 * modal is still on screen" — the state the whole class exists for.</p>
 */

const BOUND = 1000;
/** A monotonic clock never starts at 0 (a `0` would read as "unset" in too many places). */
const M = 50_000;

const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));
const signal = (): AbortController => new AbortController();

/** A `work` the test settles by hand, remembering how it was called. */
interface Job {
  work: (turn: AbortSignal, leftMs: number) => Promise<string>;
  started: () => boolean;
  turn: () => AbortSignal | undefined;
  leftMs: () => number;
  settle: (value: string) => void;
  fail: (error: Error) => void;
}

function job(): Job {
  let started = false;
  let turn: AbortSignal | undefined;
  let leftMs = -1;
  let settle: (value: string) => void = () => undefined;
  let fail: (error: Error) => void = () => undefined;
  const settled = new Promise<string>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  return {
    work: (t, left) => {
      started = true;
      turn = t;
      leftMs = left;
      return settled;
    },
    started: () => started,
    turn: () => turn,
    leftMs: () => leftMs,
    settle: (value) => settle(value),
    fail: (error) => fail(error),
  };
}

/** The outcome if it is decided by the time everything ready has run — `'pending'` if not. */
function peek<T>(outcome: Promise<TurnOutcome<T>>): Promise<TurnOutcome<T> | 'pending'> {
  return Promise.race([outcome, new Promise<'pending'>((resolve) => setImmediate(() => resolve('pending')))]);
}

/** A service on the mocked `setTimeout`, with a monotonic clock `advance` moves together with the timers. */
function setup(t: TestContext, options: { bound?: number; maxWaiting?: number } = {}): {
  turns: ConsentTurns;
  advance: (ms: number) => Promise<void>;
  moveClockOnly: (ms: number) => void;
} {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const clock = { mono: M };
  return {
    turns: new ConsentTurns(options.bound ?? BOUND, () => clock.mono, options.maxWaiting),
    advance: async (ms) => {
      clock.mono += ms;
      t.mock.timers.tick(ms);
      await tick();
    },
    moveClockOnly: (ms) => {
      clock.mono += ms;
    },
  };
}

const refusal = (kind: Refusal['kind'], first: boolean): Refusal => ({ kind, first });

test('C1 the first request\'s work starts at once with the full bound', async (t) => {
  const { turns } = setup(t);
  const a = job();
  const outcome = turns.take('k', signal().signal, a.work);

  assert.equal(a.started(), true, 'a request nobody is ahead of is shown at once — before take() returns');
  assert.equal(a.leftMs(), BOUND);
  assert.equal(turns.pending(), 1, 'the key is held while its turn is open');

  a.settle('yes');
  assert.deepEqual(await outcome, { kind: 'answered', value: 'yes' });
  assert.equal(turns.pending(), 0);
});

test('C2 a second request waits, and its turn starts when the first work SETTLES', async (t) => {
  const { turns } = setup(t);
  let applied = false;
  const b = job();
  const seenAtStart: boolean[] = [];
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = turns.take('k', signal().signal, async () => {
    await held;
    applied = true; // what the first turn writes before it returns — R4
    return 'one';
  });
  const second = turns.take('k', signal().signal, (turn, left) => {
    seenAtStart.push(applied);
    return b.work(turn, left);
  });
  await tick();

  assert.equal(seenAtStart.length, 0, 'the second work did not start beside the first');
  release();
  assert.deepEqual(await first, { kind: 'answered', value: 'one' });
  await tick();
  assert.deepEqual(seenAtStart, [true], 'it started after the first turn had applied its answer');
  b.settle('two');
  assert.deepEqual(await second, { kind: 'answered', value: 'two' });
});

test('C3 an already-aborted request is gone at once and never joins', async (t) => {
  const { turns } = setup(t);
  const a = job();
  const gone = signal();
  gone.abort();

  assert.deepEqual(await turns.take('k', gone.signal, a.work), refusal('gone', true));
  assert.equal(turns.pending(), 0, 'nothing joined the queue');
  assert.equal(a.started(), false);
});

test('C4 a waiter whose signal fires leaves at once, its work never runs, and the next waiter takes the slot', async (t) => {
  const { turns } = setup(t);
  const [a, b, c] = [job(), job(), job()];
  const leaving = signal();
  const first = turns.take('k', signal().signal, a.work);
  const second = turns.take('k', leaving.signal, b.work);
  const third = turns.take('k', signal().signal, c.work);
  await tick();

  leaving.abort();
  assert.deepEqual(await peek(second), refusal('gone', true), 'it left at once, not when the first turn ended');
  a.settle('one');
  await first;
  await tick();

  assert.equal(b.started(), false, 'the request that left was never shown');
  assert.equal(c.started(), true, 'the next waiter took the slot');
  c.settle('three');
  assert.deepEqual(await third, { kind: 'answered', value: 'three' });
});

test('C5 the cap counts waiters only: the fifth request is full, the sixth repeats it, a new burst is first again', async (t) => {
  const { turns } = setup(t);
  const jobs = [job(), job(), job(), job()];
  const admitted = jobs.map((j) => turns.take('k', signal().signal, j.work));
  const fifth = turns.take('k', signal().signal, job().work);
  const sixth = turns.take('k', signal().signal, job().work);

  assert.deepEqual(await peek(fifth), refusal('full', true), 'the open turn is not counted: 1 open + 3 waiting fit');
  assert.deepEqual(await peek(sixth), refusal('full', false), 'a burst is one refusal to report');
  assert.equal(await peek(admitted[3]), 'pending', 'the fourth is waiting, not refused');

  // The first turn ends, the second opens (the key stays held): a new burst at the cap is "first" again.
  jobs[0].settle('done 0');
  assert.deepEqual(await admitted[0], { kind: 'answered', value: 'done 0' });
  await tick();
  const refill = turns.take('k', signal().signal, job().work);
  assert.equal(await peek(refill), 'pending', 'the place the first turn left is free');
  assert.deepEqual(await peek(turns.take('k', signal().signal, job().work)), refusal('full', true), 'first again, per open turn');

  for (const [index, j] of jobs.entries()) {
    if (index > 0) {
      await tick();
      j.settle(`done ${index}`);
      assert.deepEqual(await admitted[index], { kind: 'answered', value: `done ${index}` });
    }
  }
});

test('C6 a gone waiter frees its place at the cap', async (t) => {
  const { turns } = setup(t);
  const leaving = signal();
  const jobs = [job(), job(), job(), job()];
  const takes = jobs.map((j, index) => turns.take('k', index === 2 ? leaving.signal : signal().signal, j.work));
  assert.equal(takes.length, 4);
  await tick();

  leaving.abort();
  const fifth = turns.take('k', signal().signal, job().work);

  assert.equal(await peek(fifth), 'pending', 'the place the gone waiter held is free again');
});

test('C7 the bound ends the open turn and orphans the slot until the work settles', async (t) => {
  const { turns, advance } = setup(t);
  const [a, b] = [job(), job()];
  const first = turns.take('k', signal().signal, a.work);
  const second = turns.take('k', signal().signal, job().work);
  const third = turns.take('k', signal().signal, job().work);
  await tick();

  await advance(BOUND);

  assert.deepEqual(await peek(first), refusal('timed-out', true), 'the first is refused at once');
  assert.equal(a.turn()?.aborted, true, 'its work is told the turn is over');
  assert.deepEqual(await peek(second), refusal('orphaned', true), 'every waiter is refused now');
  assert.deepEqual(await peek(third), refusal('orphaned', false));
  assert.deepEqual(await peek(turns.take('k', signal().signal, b.work)), refusal('orphaned', false), 'and so is a new request');
  assert.equal(b.started(), false, 'no second modal beside the orphan');
  assert.equal(turns.pending(), 1, 'the key stays held while the orphaned modal is up');

  a.settle('late');
  await tick();
  assert.equal(turns.pending(), 0, 'it frees when the work settles');
  const next = turns.take('k', signal().signal, b.work);
  await tick();
  assert.equal(b.started(), true, 'the next request is shown');
  b.settle('now');
  assert.deepEqual(await next, { kind: 'answered', value: 'now' });
});

test('C8 the request\'s signal during the turn is gone, and orphans the same way', async (t) => {
  const { turns } = setup(t);
  const a = job();
  const client = signal();
  const first = turns.take('k', client.signal, a.work);
  const second = turns.take('k', signal().signal, job().work);
  await tick();

  client.abort();

  assert.deepEqual(await peek(first), refusal('gone', true));
  assert.equal(a.turn()?.aborted, true);
  assert.deepEqual(await peek(second), refusal('orphaned', true));
  assert.equal(turns.pending(), 1, 'the modal is still up');
  a.settle('late');
});

test('C9 the floor: a waiter with less than promptFloor left is too-late, with exactly the floor it runs', async (t) => {
  const bound = 300_000;
  const { turns, moveClockOnly } = setup(t, { bound });
  const [a, b] = [job(), job()];
  const first = turns.take('k', signal().signal, a.work);
  const second = turns.take('k', signal().signal, b.work);
  await tick();

  moveClockOnly(285_000);
  a.settle('one');
  await first;
  await tick();
  assert.equal(b.started(), true, 'exactly the floor left: shown');
  assert.equal(b.leftMs(), 15_000);
  b.settle('two');
  await second;

  const [c, d] = [job(), job()];
  const third = turns.take('k2', signal().signal, c.work);
  const fourth = turns.take('k2', signal().signal, d.work);
  await tick();
  moveClockOnly(285_001);
  c.settle('three');
  await third;
  assert.deepEqual(await fourth, refusal('too-late', true));
  assert.equal(d.started(), false, 'a modal it cannot answer is never shown');

  assert.equal(promptFloor(300_000), 15_000);
  assert.equal(promptFloor(20), 1, 'scaled down for a short bound');
  assert.equal(promptFloor(1_000_000), MIN_PROMPT_MS, 'and never above MIN_PROMPT_MS');
});

test('C10 the time left is measured from arrival', async (t) => {
  const { turns, moveClockOnly } = setup(t);
  const [a, b] = [job(), job()];
  const first = turns.take('k', signal().signal, a.work);
  const second = turns.take('k', signal().signal, b.work);
  await tick();

  moveClockOnly(100);
  a.settle('one');
  await first;
  await tick();

  assert.equal(b.leftMs(), 900, 'it waited 100 of its 1000');
  b.settle('two');
  await second;
});

test('C11 a value after the outcome is dropped and a rejection after it is swallowed', async (t) => {
  const { turns, advance } = setup(t);
  const unhandled: unknown[] = [];
  const spy = (reason: unknown): void => {
    unhandled.push(reason);
  };
  process.on('unhandledRejection', spy);
  try {
    const [a, b] = [job(), job()];
    const first = turns.take('k', signal().signal, a.work);
    await tick();
    await advance(BOUND);
    a.settle('too late');
    assert.deepEqual(await first, refusal('timed-out', true), 'the outcome stays what was decided');

    const second = turns.take('k', signal().signal, b.work);
    await tick();
    await advance(BOUND);
    b.fail(new Error('the modal failed after its turn'));
    assert.deepEqual(await second, refusal('timed-out', true));
    await tick();
    await tick();
    assert.deepEqual(unhandled, [], 'nothing escaped as an unhandled rejection');
  } finally {
    process.off('unhandledRejection', spy);
  }
});

test('C12 a rejection before the outcome rejects take and frees the slot', async (t) => {
  const { turns } = setup(t);
  const [a, b] = [job(), job()];
  const first = turns.take('k', signal().signal, a.work);
  await tick();

  a.fail(new Error('boom'));
  await assert.rejects(first, /boom/);
  await tick();
  assert.equal(turns.pending(), 0);

  const next = turns.take('k', signal().signal, b.work);
  await tick();
  assert.equal(b.started(), true, 'the next request is not stuck behind the failure');
  b.settle('fine');
  assert.deepEqual(await next, { kind: 'answered', value: 'fine' });
});

test('C13 an answered turn leaves no timer behind', async () => {
  const timers = (): number => process.getActiveResourcesInfo().filter((resource) => resource === 'Timeout').length;
  const turns = new ConsentTurns(60_000, () => performance.now());
  const before = timers();

  const outcome = await turns.take('k', signal().signal, () => Promise.resolve('quick'));
  await tick();

  assert.equal(outcome.kind, 'answered');
  assert.equal(timers(), before, 'the five-minute bound would hold a test run open');
});

test('C14 clear() resolves the open turn and every waiter gone, and the old work settling afterwards touches nothing', async (t) => {
  const { turns } = setup(t);
  const [a, c] = [job(), job()];
  const first = turns.take('k', signal().signal, a.work);
  const second = turns.take('k', signal().signal, job().work);
  await tick();

  turns.clear();

  assert.deepEqual(await peek(first), refusal('gone', true));
  assert.deepEqual(await peek(second), refusal('gone', true));
  assert.equal(a.turn()?.aborted, true);
  assert.equal(turns.pending(), 0);

  const fresh = turns.take('k', signal().signal, c.work);
  await tick();
  assert.equal(c.started(), true, 'after clear() the key runs its work at once');
  a.settle('old');
  await tick();
  assert.equal(turns.pending(), 1, 'the old work settling freed nothing of the new turn');
  assert.equal(await peek(fresh), 'pending');
  c.settle('new');
  assert.deepEqual(await fresh, { kind: 'answered', value: 'new' });
});

test('C15 different keys are independent: two turns are open at once', async (t) => {
  const { turns } = setup(t);
  const [a, b] = [job(), job()];
  const first = turns.take('a', signal().signal, a.work);
  const second = turns.take('b', signal().signal, b.work);
  await tick();

  assert.deepEqual([a.started(), b.started()], [true, true]);
  assert.equal(turns.pending(), 2);
  a.settle('a');
  b.settle('b');
  await Promise.all([first, second]);
});

test('C16 the per-key bookkeeping is empty again after every outcome', async (t) => {
  const { turns, advance, moveClockOnly } = setup(t, { bound: 300_000 });
  const outcomes: Record<string, () => Promise<unknown>> = {
    answered: async () => {
      const a = job();
      const p = turns.take('k', signal().signal, a.work);
      await tick();
      a.settle('x');
      return p;
    },
    'gone at arrival': () => {
      const ac = signal();
      ac.abort();
      return turns.take('k', ac.signal, job().work);
    },
    'gone while waiting': async () => {
      const [a, leaving] = [job(), signal()];
      const p1 = turns.take('k', signal().signal, a.work);
      const p2 = turns.take('k', leaving.signal, job().work);
      await tick();
      leaving.abort();
      await p2;
      a.settle('x');
      return p1;
    },
    full: async () => {
      const jobs = [job(), job(), job(), job()];
      const all = jobs.map((j) => turns.take('k', signal().signal, j.work));
      await turns.take('k', signal().signal, job().work);
      for (const [index, j] of jobs.entries()) {
        await tick();
        j.settle(String(index));
        await all[index];
      }
    },
    'too-late': async () => {
      const a = job();
      const p1 = turns.take('k', signal().signal, a.work);
      const p2 = turns.take('k', signal().signal, job().work);
      await tick();
      moveClockOnly(299_999);
      a.settle('x');
      await p1;
      return p2;
    },
    'timed-out, then settled': async () => {
      const a = job();
      const p = turns.take('k', signal().signal, a.work);
      await tick();
      await advance(300_000);
      await p;
      a.settle('late');
    },
    'orphaned, then settled': async () => {
      const a = job();
      const p = turns.take('k', signal().signal, a.work);
      await tick();
      await advance(300_000);
      await p;
      await turns.take('k', signal().signal, job().work);
      a.settle('late');
    },
    rejected: async () => {
      const a = job();
      const p = turns.take('k', signal().signal, a.work);
      await tick();
      a.fail(new Error('boom'));
      await p.catch(() => undefined);
    },
    cleared: async () => {
      const p = turns.take('k', signal().signal, job().work);
      await tick();
      turns.clear();
      await p;
    },
  };

  for (const [name, run] of Object.entries(outcomes)) {
    await run();
    await tick();
    assert.equal(turns.pending(), 0, `${name}: nothing is left held`);
  }
});

test('C17 a request that something already covers is answered before the floor is applied', async (t) => {
  const bound = 300_000;
  const { turns, moveClockOnly } = setup(t, { bound });
  const a = job();
  const asked: boolean[] = [];
  const first = turns.take('k', signal().signal, a.work, (waited) => {
    asked.push(waited);
    return undefined;
  });
  const covered = job();
  const second = turns.take('k', signal().signal, covered.work, (waited) => {
    asked.push(waited);
    return 'covered';
  });
  await tick();

  moveClockOnly(bound - 1_000); // 1 s left: far under the 15 s floor
  a.settle('one');
  await first;

  assert.deepEqual(await second, { kind: 'answered', value: 'covered' }, 'answered by what covers it, not refused for want of time');
  assert.equal(covered.started(), false, 'and no prompt was opened');
  assert.deepEqual(asked, [false, true], 'the first request did not wait; the second did — said, not inferred');
  assert.equal(turns.pending(), 0);
});

test('C18 with nothing to cover it, a waiter under the floor is still too-late — after it was asked', async (t) => {
  const bound = 300_000;
  const { turns, moveClockOnly } = setup(t, { bound });
  const [a, b] = [job(), job()];
  let waitedSeen: boolean | undefined;
  const first = turns.take('k', signal().signal, a.work);
  const second = turns.take('k', signal().signal, b.work, (waited) => {
    waitedSeen = waited;
    return undefined;
  });
  await tick();

  moveClockOnly(bound - 1_000);
  a.settle('one');
  await first;

  assert.deepEqual(await second, refusal('too-late', true));
  assert.equal(waitedSeen, true);
  assert.equal(b.started(), false);
});

test('C19 a `before` that throws rejects take and frees the slot', async (t) => {
  const { turns } = setup(t);
  const [a, b] = [job(), job()];
  const first = turns.take('k', signal().signal, a.work);
  const second = turns
    .take('k', signal().signal, job().work, () => {
      throw new Error('the check broke');
    })
    .then(
      () => 'answered',
      (error: unknown) => (error as Error).message,
    );
  await tick();

  a.settle('one');
  await first;
  await tick();
  const verdict = await Promise.race([second, new Promise<string>((resolve) => setImmediate(() => resolve('still waiting')))]);
  assert.equal(verdict, 'the check broke');
  assert.equal(turns.pending(), 0);

  const next = turns.take('k', signal().signal, b.work);
  await tick();
  assert.equal(b.started(), true, 'the next request is not stuck behind it');
  b.settle('fine');
  assert.deepEqual(await next, { kind: 'answered', value: 'fine' });
});

/** A request whose work closure holds `payload`; the only reference the test keeps is a weak one. */
function takeHolding(turns: ConsentTurns, request: AbortSignal): WeakRef<object> {
  const payload = { data: 'the signing request the closure holds' };
  void turns.take('k', request, () => Promise.resolve(payload.data.length));
  return new WeakRef(payload);
}

test('C20 a request that was decided while it waited does not keep its data alive until the open modal settles', async (t) => {
  v8.setFlagsFromString('--expose-gc');
  const collect = vm.runInNewContext('gc') as () => void;
  const { turns } = setup(t);
  const a = job();
  const first = turns.take('k', signal().signal, a.work);
  const leaving = signal();
  const held = takeHolding(turns, leaving.signal);
  await tick();

  leaving.abort(); // the waiter is gone; the open modal (job `a`) is still on screen, so its queued job is not run yet
  for (let round = 0; round < 3; round += 1) {
    collect();
    await tick();
  }

  assert.equal(held.deref(), undefined, 'the departed request\'s closure was released');
  a.settle('done');
  await first;
});

test('C21 queued is told once per request that joins behind an open turn — never for the first, a refusal or a gone request', async (t) => {
  const { turns } = setup(t, { maxWaiting: 1 });
  const told: string[] = [];
  const queued = (name: string) => (): void => void told.push(name);
  const a = job();
  const first = turns.take('k', signal().signal, a.work, () => undefined, queued('first'));
  assert.deepEqual(told, [], 'the request nobody is ahead of is not queued');

  const b = job();
  const second = turns.take('k', signal().signal, b.work, () => undefined, queued('second'));
  assert.deepEqual(told, ['second'], 'told when it joins, before its turn');

  const full = turns.take('k', signal().signal, job().work, () => undefined, queued('third'));
  assert.deepEqual(await peek(full), refusal('full', true));
  const gone = signal();
  gone.abort();
  const aborted = turns.take('k', gone.signal, job().work, () => undefined, queued('fourth'));
  assert.deepEqual(await peek(aborted), refusal('gone', true));
  assert.deepEqual(told, ['second'], 'a refused or already-gone request never joined the queue');

  a.settle('done');
  await first;
  await tick();
  b.settle('done too');
  await second;
});

test('C22 cancellation churn behind an open modal keeps the retained jobs bounded, and the key frees when the modal settles', async (t) => {
  const { turns } = setup(t);
  const open = job();
  const first = turns.take('k', signal().signal, open.work);
  const churn = 200;
  const refused: string[] = [];
  let admitted = 0;

  for (let attempt = 0; attempt < churn; attempt += 1) {
    const client = signal();
    const verdict = await peek(turns.take('k', client.signal, job().work));
    if (verdict === 'pending') {
      admitted += 1;
    } else {
      refused.push(verdict.kind);
    }
    client.abort(); // the program hangs up: its place at the waiting cap is free again, its job is still chained
  }

  assert.ok(admitted <= MAX_RETAINED, `${admitted} of ${churn} requests were admitted behind one open modal; the cap is ${MAX_RETAINED}`);
  assert.ok(turns.retained('k') <= MAX_RETAINED, 'the jobs the key holds that have not run stay under the cap');
  assert.equal(refused.length, churn - admitted, 'every request that was not admitted was refused');
  assert.deepEqual([...new Set(refused)], ['full'], 'with the refusal the waiting cap gives');

  open.settle('done');
  await first;
  await tick();
  assert.equal(turns.retained('k'), 0, 'the ghosts ran as no-ops and the count is back to zero');
  assert.equal(turns.pending(), 0, 'and the key holds nothing');
  const next = job();
  const fresh = turns.take('k', signal().signal, next.work);
  assert.equal(next.started(), true, 'a request after the modal is shown at once: no ghost is left in front of it');
  next.settle('yes');
  assert.deepEqual(await fresh, { kind: 'answered', value: 'yes' });
});
