/**
 * Where the time goes — at activation, and in any command that keeps somebody waiting.
 *
 * <p><b>Why this exists rather than a fix.</b> The owner reported that starting up became slow and
 * that a command, a database or a terminal can take about five seconds. Five candidates were read
 * and eliminated in turn: the cross-window lock (only four operations take it, and none of them is
 * a launch), the tool probes (they run only after a binary is already found missing), the mask
 * table (scoped to one entity since 0.57.0, deliberately), `StorageManager.init` (one keychain read
 * plus one AES-GCM open per account), and the bundle (2.5 MB, of which the eleven wordlists are
 * 11%). None of them accounts for seconds.</p>
 *
 * <p>So the honest next step is a measurement rather than a guess. A speculative optimisation of a
 * path nobody has timed is how a fix ships that changes nothing and is believed to have worked. One
 * run with this in place says which phase, and which command, actually spends the time — in the
 * per-run diagnostic file that already exists, so the answer is in the file the reporter is already
 * asked to attach.</p>
 *
 * <p>Pure: the clock is a parameter and nothing here imports `vscode`.</p>
 */

/** How slow a command has to be before it is worth a line. Below this, nobody noticed. */
export const SLOW_COMMAND_MS = 750;

export interface Phase {
  readonly name: string;
  readonly ms: number;
}

/**
 * Elapsed time between marks, in the order they were made.
 *
 * <p>Between marks, not since the start: a cumulative reading makes the reader do the subtraction,
 * and the question is always which STEP was slow rather than what the clock said when it ended.</p>
 */
export class PhaseTimer {
  private readonly phases: Phase[] = [];
  private readonly began: number;
  private last: number;

  constructor(private readonly clock: () => number = () => Date.now()) {
    this.began = clock();
    this.last = this.began;
  }

  /** Close the phase that was running and name it. */
  mark(name: string): void {
    const now = this.clock();
    this.phases.push({ name, ms: now - this.last });
    this.last = now;
  }

  /** Everything measured so far, in order. */
  get marks(): readonly Phase[] {
    return [...this.phases];
  }

  get totalMs(): number {
    return this.last - this.began;
  }

  /**
   * One line, and it leads with the total because that is the number being complained about.
   *
   * <p>Phases are listed in the order they ran, slowest FIRST inside that line would reorder a
   * sequence into a ranking and lose which step follows which — the ordering is itself evidence
   * when one phase is waiting on another.</p>
   */
  summary(): string {
    const parts = this.phases.map((phase) => `${phase.name} ${phase.ms}ms`).join(', ');
    return this.phases.length === 0
      ? `${this.totalMs}ms`
      : `${this.totalMs}ms — ${parts}`;
  }
}

/** Just the sink this needs, so a test does not build a diagnostic channel. */
export interface TimingSink {
  info(source: string, message: string): void;
}

/**
 * Wrap a command handler so a slow one says so, by name, in the run's own log.
 *
 * <p>Every command goes through it — there is one registration helper, which is what makes this a
 * single change rather than a decision at each of the ninety call sites. A command under the
 * threshold logs nothing at all: a line per click would bury the one line that matters.</p>
 *
 * <p>The handler's result is passed through untouched, including a rejection: an instrument that
 * swallows an error is worse than no instrument. The duration is recorded on BOTH paths, because a
 * command that takes five seconds and then fails is exactly the report worth having.</p>
 */
export function timed<A extends unknown[], R>(
  command: string,
  handler: (...args: A) => R | Promise<R>,
  sink: TimingSink,
  clock: () => number = () => Date.now(),
  thresholdMs: number = SLOW_COMMAND_MS,
): (...args: A) => Promise<R> {
  return async (...args: A): Promise<R> => {
    const began = clock();
    const say = (outcome: string): void => {
      const ms = clock() - began;
      if (ms >= thresholdMs) {
        sink.info('timing', `${command} took ${ms}ms${outcome}`);
      }
    };
    try {
      const answer = await handler(...args);
      say('');
      return answer;
    } catch (error) {
      say(' and failed');
      throw error;
    }
  };
}
