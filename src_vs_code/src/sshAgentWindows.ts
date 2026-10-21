import { unrefTimer } from './withTimeout';
import { AllowWindows, KeyRef, NO_WINDOWS, ScopeWindows, WindowScope, nextExpiry, windowsFor as windowsInBook, withoutExpired } from './allowWindows';

/**
 * How long the expiry timer may sleep (#197, E2.2). The row repaints when a window ends; a timer armed for the
 * full ten minutes would sleep through a wall clock that jumped (a laptop waking), so it looks every five at most.
 */
const EXPIRY_LOOK_MS = 5 * 60_000;

/** Both of the window book's clocks at one instant: the wall clock and the monotonic one. */
export interface Moment {
  readonly wall: number;
  readonly mono: number;
}

/**
 * The holder of the SSH agent's open "allow without asking" windows (#197, E3.1): the book, the two clocks it is asked
 * with, and the timer that repaints the row when the nearest window ends. `allowWindows.ts` holds the RULES; this is
 * the one place the book is replaced. No `vscode` here — the manager hands in what to do when the book changes.
 */
export class SigningWindows {
  /**
   * The open "allow without asking" windows — `allowWindows.ts` holds the rules. In memory only, by design.
   * Replaced, never mutated: the book is an immutable value.
   */
  private book: AllowWindows = NO_WINDOWS;
  /** The timer that repaints the row when the nearest window ends; re-armed by every change of the book. */
  private expiry: ReturnType<typeof setTimeout> | undefined;

  constructor(
    /** What time it is — the manager's own clock, so a test about the prompt's time can stop it. */
    private readonly clock: () => Date,
    /** The window book's second clock (see `monotonicSource` in the manager). */
    private readonly monotonic: () => number,
    /** Told whenever the book changes, so the key's row can repaint. */
    private readonly changed: () => void,
  ) {}

  /** The book as it is now — an immutable value, never to be mutated. */
  get current(): AllowWindows {
    return this.book;
  }

  /**
   * THE one place the book is replaced. A new book is a change: the row is told to repaint (`changed`, which the
   * manager silences once it is gone), and the expiry timer is armed again for whatever is nearest to ending.
   */
  set(next: AllowWindows, at?: Moment): void {
    const changed = next !== this.book;
    this.book = next;
    if (changed) {
      this.changed();
    }
    this.arm(at);
  }

  /** Both clocks, read side by side — what the book's rules are asked with. */
  moment(): Moment {
    return { wall: this.clock().getTime(), mono: this.monotonic() };
  }

  /** The windows of this key that cover a request at `at`, on BOTH clocks (the gate's own rule). */
  live(key: KeyRef, scopes: readonly WindowScope[], at: Moment): ScopeWindows {
    return windowsInBook(this.book, key, scopes, at.wall, at.mono);
  }

  /** Stop the expiry timer for good — the book is not read again. */
  dispose(): void {
    clearTimeout(this.expiry);
    this.expiry = undefined;
  }

  /**
   * Clear the old timer, then sleep until the nearest window ends — never longer than `EXPIRY_LOOK_MS`. With no
   * window open it reads NO clock: the gate's "one reading of the clock at the click" counts reads, and a load
   * or an unload with nothing open has nothing to time. `at` is the caller's own reading when it has one.
   */
  private arm(at?: Moment): void {
    clearTimeout(this.expiry);
    this.expiry = this.book.open.size === 0 ? undefined : this.timerFor(at ?? this.moment());
  }

  /**
   * A book that holds something always gets a look. When nothing is left to wait for (`nextExpiry` finds no end
   * ahead) yet the book still holds a window — a clock jump ended it between two looks — the look is at once, so
   * the entry is dropped and the row repainted instead of both lingering until some unrelated change (E2.2 L2).
   * It cannot loop: `expired` drops every window `nextExpiry` ignores, and an empty book arms nothing.
   */
  private timerFor(at: Moment): ReturnType<typeof setTimeout> {
    const next = nextExpiry(this.book, at.wall, at.mono);
    const delay = next === undefined ? 0 : Math.min(next - at.wall, EXPIRY_LOOK_MS);
    return unrefTimer(setTimeout(() => this.expired(), delay));
  }

  /** The timer fired: drop what ended (the same book, silently, when nothing did) and look again. */
  private expired(): void {
    const at = this.moment();
    this.set(withoutExpired(this.book, at.wall, at.mono), at);
  }
}
