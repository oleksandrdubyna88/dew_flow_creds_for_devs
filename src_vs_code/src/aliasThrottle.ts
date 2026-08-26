/**
 * How often a caller with no token may make this window ask a human.
 *
 * <p><b>Why this exists at all.</b> Every other broker route carries a bearer token the person
 * copied out of a snippet. The alias route carries only a NAME, and names are not secret — so
 * the consent modal is the entire authorization, and the RATE of modals stops being a nicety
 * and becomes the property that holds the door.</p>
 *
 * <p>Without it a local process that guesses or reads a name can make this window raise dialogs
 * as fast as it can post. Two consequences, and the second is the dangerous one: the editor is
 * unusable while it happens, and the twentieth identical dialog is the one somebody clicks
 * through to make it stop. Consent fatigue is the documented way a gate like this is defeated,
 * not a theoretical concern.</p>
 *
 * <p><b>Two rules, because they stop different things.</b> A single in-flight prompt stops the
 * pile-up — a stack of modals is unusable long before any count is reached. A sliding window
 * stops the slow grind, where one prompt at a time, answered and re-asked, is just as effective
 * at wearing someone down.</p>
 *
 * <p>Deliberately NOT applied to token calls. A caller holding a real token has already been
 * consented once by a human who chose to; throttling them for a local process's behaviour would
 * turn a defence into an outage in the path people actually use.</p>
 *
 * <p>Pure, with the clock injected, so the rules are a unit test rather than a wait.</p>
 */

/** How many prompts an unauthenticated caller may cause inside {@link WINDOW_MS}. */
export const MAX_PROMPTS = 5;

/**
 * The window the count is measured over.
 *
 * <p>A minute rather than a second: the point is to stop a grind that wears a person down, and
 * a per-second limit would still permit three hundred dialogs an hour. Legitimate use is a
 * person running a command in a terminal, which is nowhere near five a minute.</p>
 */
export const WINDOW_MS = 60_000;

export type ThrottleVerdict = 'allow' | 'busy' | 'too-many';

export class AliasThrottle {
  /** Timestamps of prompts inside the current window, oldest first. */
  private prompts: number[] = [];
  private pending = 0;

  /**
   * Whether an alias call may proceed to ask.
   *
   * <p>Recorded at the moment of asking rather than of answering: a caller that opens a dialog
   * and never has it answered has still spent the window, which is exactly the abuse being
   * prevented.</p>
   */
  admit(nowMs: number): ThrottleVerdict {
    if (this.pending > 0) {
      return 'busy';
    }
    this.prompts = this.prompts.filter((at) => nowMs - at < WINDOW_MS);
    if (this.prompts.length >= MAX_PROMPTS) {
      return 'too-many';
    }
    this.prompts.push(nowMs);
    this.pending += 1;
    return 'allow';
  }

  /** The prompt this admitted has been answered, dismissed, or timed out. */
  release(): void {
    this.pending = Math.max(0, this.pending - 1);
  }

  /** What to tell a caller that was refused, in words it can act on. */
  static describe(verdict: Exclude<ThrottleVerdict, 'allow'>): string {
    return verdict === 'busy'
      ? 'Another request is already waiting for the person to answer. Try again once they have.'
      : `Too many requests: a caller without a token may prompt at most ${MAX_PROMPTS} times a minute.`;
  }
}
