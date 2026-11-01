import { KeyedQueue } from './keyedQueue';

/**
 * The turn each signing request takes at the prompt, one key at a time (#197, E2.3) — pure, no editor.
 *
 * <p>The SSH agent shows ONE modal per key. A second request for the same key waits for the open prompt; a third
 * and a fourth wait behind it; the fifth is refused at once. A request whose program has gone leaves the queue
 * and is never shown. All of that is this class; what a turn DOES (the modal, the window, the presence signal) is
 * the manager's `work`.</p>
 *
 * <p><b>The slot.</b> A turn holds its key from its start until its `work` SETTLES — not until its outcome is
 * decided. VS Code cannot close a modal, so a turn that ends first (the bound ran out, the client went away)
 * leaves an ORPHANED modal on screen; the key's slot stays held until that modal settles, every request already
 * waiting for the key is refused `orphaned` at that moment, and every new request for it is refused at once. A
 * second modal beside the orphan would put two prompts for one key in front of a person who can only close one.</p>
 *
 * <p><b>The outcome is decided once</b> — by `work`'s value (`answered`) or by the turn ending, whichever comes
 * first. A value after it is dropped and a rejection after it swallowed; a rejection BEFORE it rejects `take`
 * (the caller's bug surfaces; the SSH server turns it into a refusal). `work` applies its own answer before it
 * returns, so the key's next turn — which starts after `work` settled — always sees what the last one wrote.</p>
 */

/** The shortest prompt worth showing, in production — a request left with less is refused at its turn. */
export const MIN_PROMPT_MS = 15_000;

/** What a request that waited must still have left to be shown a modal: 15 s of a 5-minute bound, scaled for tests. */
export function promptFloor(boundMs: number): number {
  return Math.min(MIN_PROMPT_MS, boundMs / 20);
}

/**
 * How many jobs one key may hold in its queue that have not RUN yet — live waiters and the ghosts of gone ones alike.
 *
 * <p>A waiter whose client went away frees its place at `maxWaiting` at once (a real next request must not be blocked
 * by a ghost), but its job stays chained behind the open modal until that modal settles — up to the whole bound. A
 * local program that asks for a key and hangs up in a loop would otherwise grow that chain without limit for the
 * five minutes. Real use never comes near this: ssh and git ask one thing at a time, so at most `maxWaiting` (3)
 * jobs are ever live, and a few more may be ghosts of clients that gave up. 32 is about ten times that — loose
 * enough that no honest burst is refused, tight enough that churn stops growing the queue after a few dozen jobs.</p>
 */
export const MAX_RETAINED = 32;

export type RefusalKind = 'timed-out' | 'gone' | 'full' | 'orphaned' | 'too-late';

/**
 * `first`: the first refusal of this kind since the key's slot was last free. `full` and `orphaned` repeat — one
 * log line (and one notice) per burst, not per refused request; the others are always first.
 */
export interface Refusal {
  readonly kind: RefusalKind;
  readonly first: boolean;
}

export type TurnOutcome<T> = { readonly kind: 'answered'; readonly value: T } | Refusal;

/** The turn's work: given the turn's signal (aborted when the turn ends) and the time left, answer. */
type Work<T> = (turn: AbortSignal, leftMs: number) => Promise<T>;

/**
 * What a request may be answered WITHOUT a prompt when its turn arrives — before the floor is applied, so a request
 * that something already covers is never refused for want of time. `waited` says whether anybody was ahead of it
 * (explicitly: the caller must not infer it from a time that a frozen clock cannot move). `undefined` = go on.
 */
type Before<T> = (waited: boolean) => T | undefined;

/**
 * Told once, at admission, to a request that joins the queue behind an open turn — so the caller can say that the
 * request is waiting (and not hung). Never told for the first request, a refused one or one already gone.
 */
type Queued = () => void;

/** The three things a request brings. Dropped (`FORGOTTEN`) once the request is decided: its data is not kept alive. */
interface Steps<T> {
  readonly work: Work<T>;
  readonly before: Before<T>;
  readonly queued: Queued;
}

const FORGOTTEN: Steps<never> = {
  work: () => Promise.reject(new Error('this request was decided before its turn')),
  before: () => undefined,
  queued: () => undefined,
};

/** One request's place in the queue: its outcome, and whether it has been decided. */
class Waiter<T> {
  done = false;

  private cleanup: () => void = () => undefined;

  constructor(
    private readonly resolveWith: (outcome: TurnOutcome<T>) => void,
    private readonly rejectWith: (error: unknown) => void,
  ) {}

  /** What to undo when the outcome is decided (the request-signal listener). */
  onDone(cleanup: () => void): void {
    this.cleanup = cleanup;
  }

  /** Decide the outcome; `false` when it was already decided (and nothing happens). */
  resolve(outcome: TurnOutcome<T>): boolean {
    return this.decide(() => this.resolveWith(outcome));
  }

  reject(error: unknown): boolean {
    return this.decide(() => this.rejectWith(error));
  }

  private decide(deliver: () => void): boolean {
    if (this.done) {
      return false;
    }
    this.done = true;
    this.cleanup();
    deliver();
    return true;
  }
}

/** What a slot needs of its open turn: to end it, whatever the type of its answer. */
interface Endable {
  end(kind: 'timed-out' | 'gone'): void;
}

/** Everything held for one key. Deleted again the moment nothing is held (`idle`). */
class KeySlot {
  /** Requests admitted and not yet decided: the open turn plus those waiting for it. */
  live = 0;

  /** Jobs that joined the key's queue and have not run yet — live waiters AND the ghosts of gone ones (`MAX_RETAINED`). */
  retained = 0;

  /** A turn's `work` has not settled yet — the slot is held, whatever its outcome says. */
  working = false;

  /** The turn that ended while its modal is still on screen. */
  orphan = false;

  open: Endable | undefined;

  readonly said = new Set<RefusalKind>();

  readonly waiters = new Set<Waiter<never>>();

  /** Nothing held — and no job left in the key's queue either: a gone waiter's ghost still counts until it has run. */
  idle(): boolean {
    return this.live === 0 && !this.working && this.retained === 0;
  }

  /** The refusal a request gets at arrival, if any: an orphaned modal first, then the caps (`full`). */
  refusalAtArrival(maxWaiting: number): Refusal | undefined {
    if (this.orphan) {
      return this.refusal('orphaned');
    }
    return this.full(maxWaiting) ? this.refusal('full') : undefined;
  }

  /** The waiting cap (live waiters only — a gone one freed its place) or the retention cap (ghosts count too). */
  private full(maxWaiting: number): boolean {
    return this.live > maxWaiting || this.retained >= MAX_RETAINED;
  }

  refusal(kind: RefusalKind): Refusal {
    const first = !this.said.has(kind);
    this.said.add(kind);
    return { kind, first };
  }

  /** Decide a waiter's outcome and give its place back; `false` when it was decided already. */
  finish<T>(waiter: Waiter<T>, decide: (waiter: Waiter<T>) => boolean): boolean {
    const decided = decide(waiter);
    if (decided) {
      this.live -= 1;
      this.waiters.delete(waiter as Waiter<never>);
    }
    return decided;
  }

  /** The open turn ended with its modal still up: refuse everyone waiting, now. */
  orphaned(): void {
    this.orphan = true;
    for (const waiter of [...this.waiters]) {
      this.finish(waiter, (w) => w.resolve(this.refusal('orphaned')));
    }
  }

  /** The service is going away: everything held resolves `gone`. */
  cancelAll(): void {
    for (const waiter of [...this.waiters]) {
      this.finish(waiter, (w) => w.resolve({ kind: 'gone', first: true }));
    }
    this.open?.end('gone');
  }

  /** The turn's `work` settled: the slot is free for the next. */
  freed(): void {
    this.working = false;
    this.orphan = false;
    this.open = undefined;
    this.said.clear();
  }
}

/** One request, from arrival to outcome. */
interface Entry<T> {
  readonly key: string;
  readonly slot: KeySlot;
  readonly waiter: Waiter<T>;
  /** What to run at its turn; replaced by `FORGOTTEN` the moment the request is decided, wherever that happens. */
  steps: Steps<T>;
  /** Someone was ahead of it — only such a request can be short of time at its turn. */
  readonly waited: boolean;
  readonly arrivedAt: number;
  /** This request's own turn, once it has one — the slot's `open` may be somebody else's. */
  open: OpenTurn<T> | undefined;
}

/** The turn that is on screen: its signal, its bound timer, and the ways it ends. */
class OpenTurn<T> {
  readonly controller = new AbortController();

  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly entry: Entry<T>) {}

  /**
   * The bound. NOT unref'd: an unref'd timer lets a process with nothing else alive exit before the refusal
   * (`withTimeout.ts` has the lesson). Cleared in `close`, so an answered turn leaves none behind.
   */
  arm(leftMs: number): void {
    this.timer = setTimeout(() => this.end('timed-out'), leftMs);
  }

  close(): void {
    clearTimeout(this.timer);
  }

  answered(value: T): void {
    const { slot, waiter } = this.entry;
    slot.finish(waiter, (w) => w.resolve({ kind: 'answered', value }));
  }

  failed(error: unknown): void {
    const { slot, waiter } = this.entry;
    slot.finish(waiter, (w) => w.reject(error));
  }

  /** The turn ends while `work` still runs: decide now, orphan the slot, tell the work its turn is over. */
  end(kind: 'timed-out' | 'gone'): void {
    const { slot, waiter } = this.entry;
    if (slot.finish(waiter, (w) => w.resolve({ kind, first: true }))) {
      this.close();
      slot.orphaned();
      this.controller.abort();
    }
  }
}

export class ConsentTurns {
  private slots = new Map<string, KeySlot>();

  private queue = new KeyedQueue();

  /**
   * @param boundMs how long a request may take from ARRIVAL, waiting included.
   * @param now the manager's MONOTONIC clock — never the wall clock, which a laptop waking can move.
   * @param maxWaiting how many may wait behind the open turn; the next is refused at once.
   */
  constructor(
    private readonly boundMs: number,
    private readonly now: () => number,
    private readonly maxWaiting = 3,
  ) {}

  /**
   * Run `work` for this request when it is its turn, or say why it will not be. At its turn `before` is asked first
   * (it may answer the request without a prompt), then the floor is applied, then `work` runs. `queued` is told when
   * the request is admitted behind an open turn — before its turn, once.
   */
  take<T>(
    key: string,
    request: AbortSignal,
    work: Work<T>,
    before: Before<T> = () => undefined,
    queued: Queued = () => undefined,
  ): Promise<TurnOutcome<T>> {
    const refused = this.refusedAtArrival(this.slots.get(key), request);
    if (refused !== undefined) {
      return Promise.resolve(refused);
    }
    return new Promise((resolve, reject) => this.enqueue(key, request, { work, before, queued }, new Waiter<T>(resolve, reject)));
  }

  /** How many keys hold ANY state (an open turn, waiters, an orphaned slot) — for tests, deciding nothing. */
  pending(): number {
    return this.slots.size;
  }

  /** How many jobs the key holds that have not run yet (0 for an unknown key) — for tests, deciding nothing. */
  retained(key: string): number {
    return this.slots.get(key)?.retained ?? 0;
  }

  /** Dispose: every open turn and waiter resolves `gone`, every slot frees, and a fresh queue replaces the old. */
  clear(): void {
    for (const slot of this.slots.values()) {
      slot.cancelAll();
    }
    this.slots = new Map();
    this.queue = new KeyedQueue();
  }

  private refusedAtArrival(slot: KeySlot | undefined, request: AbortSignal): Refusal | undefined {
    if (request.aborted) {
      return { kind: 'gone', first: true };
    }
    return slot?.refusalAtArrival(this.maxWaiting);
  }

  private enqueue<T>(key: string, request: AbortSignal, steps: Steps<T>, waiter: Waiter<T>): void {
    const slot = this.slots.get(key) ?? this.created(key);
    const waited = slot.live > 0;
    if (waited) {
      steps.queued();
    }
    const entry: Entry<T> = { key, slot, waiter, steps, waited, arrivedAt: this.now(), open: undefined };
    slot.live += 1;
    slot.retained += 1;
    slot.waiters.add(waiter as Waiter<never>);
    const onAbort = (): void => this.requestAborted(entry);
    request.addEventListener('abort', onAbort, { once: true });
    waiter.onDone(() => {
      request.removeEventListener('abort', onAbort);
      // The queued job still holds this entry until the open modal settles; it must not hold the request's data too.
      entry.steps = FORGOTTEN;
    });
    this.queue.run(key, () => this.turn(entry)).catch((error: unknown) => this.crashed(entry, error));
  }

  /** A turn that failed before its work began (`before` threw): the caller's bug surfaces as `take` rejecting. */
  private crashed<T>(entry: Entry<T>, error: unknown): void {
    entry.slot.finish(entry.waiter, (w) => w.reject(error));
    this.release(entry.key, entry.slot);
  }

  private created(key: string): KeySlot {
    const slot = new KeySlot();
    this.slots.set(key, slot);
    return slot;
  }

  /** The request's own signal fired: leave the queue, or end the turn that is open. */
  private requestAborted<T>(entry: Entry<T>): void {
    if (entry.open !== undefined) {
      entry.open.end('gone');
      return;
    }
    entry.slot.finish(entry.waiter, (w) => w.resolve({ kind: 'gone', first: true }));
    this.release(entry.key, entry.slot);
  }

  private async turn<T>(entry: Entry<T>): Promise<void> {
    if (this.drained(entry)) {
      return;
    }
    entry.slot.waiters.delete(entry.waiter as Waiter<never>);
    const leftMs = this.leftMs(entry);
    const outcome = this.withoutPrompt(entry, leftMs);
    if (outcome === undefined) {
      await this.run(entry, leftMs);
      return;
    }
    entry.slot.finish(entry.waiter, (w) => w.resolve(outcome));
    this.release(entry.key, entry.slot);
  }

  /**
   * The job leaves the queue's backlog now that it runs. `true` when its request was decided while it waited (a
   * ghost): nothing to do but give the key back if that was the last thing it held.
   */
  private drained<T>(entry: Entry<T>): boolean {
    entry.slot.retained -= 1;
    if (!entry.waiter.done) {
      return false;
    }
    this.release(entry.key, entry.slot);
    return true;
  }

  /**
   * The outcome of a request that needs no modal: answered by `before` (a window an earlier turn opened covers it),
   * or too late. `before` comes FIRST — a request that something already covers is not refused for want of time.
   */
  private withoutPrompt<T>(entry: Entry<T>, leftMs: number): TurnOutcome<T> | undefined {
    const early = entry.steps.before(entry.waited);
    if (early !== undefined) {
      return { kind: 'answered', value: early };
    }
    return entry.waited && leftMs < promptFloor(this.boundMs) ? { kind: 'too-late', first: true } : undefined;
  }

  /** What is left of the bound — measured from arrival for a request that waited, the whole bound otherwise. */
  private leftMs<T>(entry: Entry<T>): number {
    return entry.waited ? this.boundMs - (this.now() - entry.arrivedAt) : this.boundMs;
  }

  private async run<T>(entry: Entry<T>, leftMs: number): Promise<void> {
    const open = new OpenTurn(entry);
    entry.open = open;
    entry.slot.working = true;
    entry.slot.open = open;
    open.arm(leftMs);
    try {
      open.answered(await entry.steps.work(open.controller.signal, leftMs));
    } catch (error) {
      open.failed(error);
    } finally {
      open.close();
      entry.slot.freed();
      this.release(entry.key, entry.slot);
    }
  }

  /** Delete the key's entry when it holds nothing — and only if it is still the one this request used. */
  private release(key: string, slot: KeySlot): void {
    if (slot.idle() && this.slots.get(key) === slot) {
      this.slots.delete(key);
    }
  }
}
