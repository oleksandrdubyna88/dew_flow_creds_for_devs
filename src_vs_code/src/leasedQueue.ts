import { SerialQueue } from './serialQueue';
import { HEARTBEAT_MS, Holding, LOCK_TTL_MS, WindowLock } from './windowLock';

/**
 * `SerialQueue`, plus the other windows.
 *
 * <p>Same `run` shape on purpose. `storageManager.ts` sits at its size-ratchet baseline and may not
 * grow, so the five call sites that already say `this.writes.run(…)` are not touched at all — the
 * field changes type and nothing else does. That was a review finding on the plan and it is the
 * reason this file exists rather than a wrapper at each call.</p>
 *
 * <p><b>Without a lock it IS a `SerialQueue`</b>, which is what every test that builds a
 * `StorageManager` with two arguments gets, and what a build with no writable storage directory
 * falls back to. The degradation is the behaviour this extension had until now, not a failure.</p>
 */

/** What waiting looks like to a person. Returns the way to take the notice down again. */
export type WaitNotice = () => () => void;

export interface LeaseDeps {
  /** Shown while this window waits for another to finish. Never names a window id — see below. */
  readonly notice?: WaitNotice;
  readonly wait?: (ms: number) => Promise<void>;
  readonly every?: (ms: number, tick: () => void) => { stop: () => void };
}

const POLL_MS = 250;

export class LeasedQueue {
  private readonly inner = new SerialQueue();

  constructor(
    private readonly lock: WindowLock | undefined,
    private readonly deps: LeaseDeps = {},
  ) {}

  /**
   * Run after everything this window has queued, and after every other window has let go.
   *
   * <p>Waits INDEFINITELY rather than on a timeout, which the review round settled: a bounded wait
   * abandons a command the person asked for while another window is still mutating the same data,
   * and that is a worse state than waiting. What makes it bearable is that the wait is visible.</p>
   */
  run<T>(work: () => Promise<T>): Promise<T> {
    return this.inner.run(() => this.holding(work, true)) as Promise<T>;
  }

  /**
   * Run it, or answer `skipped()` because another window holds the lock.
   *
   * <p>For the startup sweep and nothing else: another window holding the lock IS the other window
   * doing that work. Everything a person asked for waits — an operation that reports success having
   * done nothing is the failure the reproduction already named.</p>
   */
  runOrSkip<T>(work: () => Promise<T>, skipped: () => T): Promise<T> {
    return this.inner.run(async () => {
      const done = await this.holding(work, false);
      return done === UNHELD ? skipped() : (done as T);
    });
  }

  /** Take the lock (or not), keep it alive while the work runs, and let it go on every path out. */
  private async holding<T>(work: () => Promise<T>, patient: boolean): Promise<T | typeof UNHELD> {
    if (this.lock === undefined) {
      return work();
    }
    const held = patient ? await this.await(this.lock) : await this.lock.take();
    if (held === undefined) {
      return UNHELD;
    }
    const beat = this.beating(this.lock, held);
    try {
      return await work();
    } finally {
      beat.stop();
      await this.lock.release(held);
    }
  }

  /** Poll until it is ours, telling the person what we are waiting for while we do. */
  private async await(lock: WindowLock): Promise<Holding> {
    const first = await lock.take();
    if (first !== undefined) {
      return first;
    }
    const hide = this.deps.notice?.() ?? ((): void => undefined);
    try {
      return await this.poll(lock);
    } finally {
      hide();
    }
  }

  private async poll(lock: WindowLock): Promise<Holding> {
    const pause = this.deps.wait ?? ((ms: number) => new Promise<void>((go) => setTimeout(go, ms)));
    for (;;) {
      await pause(POLL_MS);
      const held = await lock.take();
      if (held !== undefined) {
        return held;
      }
    }
  }

  /**
   * The heartbeat, for as long as the work runs.
   *
   * <p>This is what makes the TTL a liveness signal rather than a deadline: an operation may take as
   * long as it takes, and a window that dies stops saying so within one interval.</p>
   */
  private beating(lock: WindowLock, held: Holding): { stop: () => void } {
    const start = this.deps.every ?? defaultEvery;
    return start(HEARTBEAT_MS, () => void lock.beat(held).catch(() => undefined));
  }
}

/** Answered by `holding` when the lock was not free and the caller asked not to wait. */
const UNHELD = Symbol('lock held by another window');

function defaultEvery(ms: number, tick: () => void): { stop: () => void } {
  const timer = setInterval(tick, ms);
  // Never hold the host open for a heartbeat; the work does that on its own account.
  timer.unref?.();
  return { stop: () => clearInterval(timer) };
}

/**
 * The sweep: skip while another window has the lock, and COME BACK.
 *
 * <p>Skipping is right — the other window is doing this work — and on its own it is a leak. The sweep
 * runs once, at startup: if the holder is then killed, the removal it had half-finished is left for
 * nobody, which is the state the sweep exists to clean up. So a skip schedules another attempt after
 * the lock's own TTL, by which time a dead holder's lock is breakable.</p>
 *
 * <p>Bounded, because an unbounded retry against a window that is simply busy for an hour is a timer
 * nobody asked for. After the attempts are spent the work stays undone and stays SAFE: the record it
 * reads is durable, and the next window to start will find it.</p>
 */
export function sweepWithRetry(
  queue: LeasedQueue,
  work: () => Promise<readonly string[]>,
  deps: { after?: (ms: number, run: () => void) => void; attempts?: number } = {},
): Promise<readonly string[]> {
  const later = deps.after ?? ((ms, run) => void setTimeout(run, ms).unref?.());
  const left = deps.attempts ?? 3;
  return queue.runOrSkip(work, () => {
    if (left > 0) {
      later(LOCK_TTL_MS, () => void sweepWithRetry(queue, work, { ...deps, attempts: left - 1 }));
    }
    return [];
  });
}
