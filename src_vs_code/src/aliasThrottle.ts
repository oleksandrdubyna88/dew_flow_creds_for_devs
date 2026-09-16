/**
 * How often a caller with no token may make this window ask a human — and, since a consent policy
 * can answer for the human (#95), how often it may make this window act without asking at all.
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
 * <p><b>A second construction, for the calls that raise no modal.</b> An entry whose consent
 * policy has already answered — "never ask", or asked inside the last twelve hours — lets an MCP
 * call through with no dialog. The modal budget must not count it: spending one of five on a
 * dialog nobody was going to see refuses a later call for nothing. But on this route the prompt
 * was also the limiter, so taking the prompt away took the limiter away, and a loop that never
 * terminates, or a process working through the entries a policy opened, was bounded by nothing.
 * So the quiet path answers to its own instance of the same window — {@link SILENT_CEILING} calls
 * a minute, and no in-flight rule, because that rule protects a human from a pile-up and this path
 * has no human to protect; serialising an agent's concurrent calls would refuse them for nobody's
 * benefit. One class, two constructions: the sliding window is the same rule either way, and a
 * second copy is how the two would drift apart.</p>
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

/**
 * How many calls a consent policy may let through WITHOUT a prompt inside {@link WINDOW_MS}.
 *
 * <p>Sixty — one a second, sustained — is far beyond legitimate agent use: an agent runs a
 * command, reads the answer, thinks, and runs the next, and a session that does that a few
 * hundred times an hour is a busy one. What sixty still bounds is the case with no thinking in
 * it — a loop that never terminates, or a compromised local process working through the entries
 * a policy opened — which before this ceiling was bounded by nothing at all. Deliberately not the
 * modal budget's number: that one protects a person's patience, this one a credential's exposure,
 * and a single figure tuned for either would be wrong for the other.</p>
 */
export const SILENT_CEILING = 60;

export type ThrottleVerdict = 'allow' | 'busy' | 'too-many';

export class AliasThrottle {
  /** Timestamps of admissions inside the current window, oldest first. */
  private admitted: number[] = [];
  /** Calls admitted and not yet released. Moved and read only while `serialized`. */
  private pending = 0;

  /**
   * The defaults ARE the modal budget, so `new AliasThrottle()` is the alias door's throttle to
   * the byte. The other construction is the silent ceiling: a higher `max`, the same window, and
   * `serialized` off. That one bit says whether a human stands behind the throttle — which is
   * what decides both whether the in-flight rule applies and whether what it counts is prompts
   * or calls, so the refusal's wording follows it too.
   */
  constructor(
    private readonly max = MAX_PROMPTS,
    private readonly windowMs = WINDOW_MS,
    private readonly serialized = true,
  ) {}

  /**
   * Whether a call may proceed — to ask, or to act without asking.
   *
   * <p>Recorded at the moment of admission rather than of completion: a caller that opens a
   * dialog and never has it answered has still spent the window, which is exactly the abuse
   * being prevented.</p>
   */
  admit(nowMs: number): ThrottleVerdict {
    if (this.inFlight()) {
      return 'busy';
    }
    this.admitted = this.admitted.filter((at) => inWindow(at, nowMs, this.windowMs));
    if (this.admitted.length >= this.max) {
      return 'too-many';
    }
    this.admitted.push(nowMs);
    this.hold();
    return 'allow';
  }

  /**
   * The call this admitted has been answered, dismissed, or timed out. A no-op on an unserialized
   * throttle, which never held anything — so a caller may release on whichever ceiling admitted
   * it without first asking which kind that was.
   */
  release(): void {
    if (this.serialized) {
      this.pending = Math.max(0, this.pending - 1);
    }
  }

  /**
   * The one-in-flight rule, and the only reader of `pending`. It guards a HUMAN — a stack of
   * modals is unusable long before any count is reached — so a throttle with nobody behind it
   * never applies it and never answers `busy`, however many calls are in flight.
   */
  private inFlight(): boolean {
    return this.serialized && this.pending > 0;
  }

  /** Count a call as in flight — only where `inFlight` will ever read it, so the two stay symmetric. */
  private hold(): void {
    if (this.serialized) {
      this.pending += 1;
    }
  }

  /**
   * What to tell a caller that was refused, in words it can act on.
   *
   * <p>An instance method since the second construction exists: a refusal is a sentence about
   * THIS ceiling — its number, its window, and whether what it counted was prompts or calls — and
   * a static one could only ever describe the modal budget. A silent call refused at sixty and
   * told it "may prompt at most 5 times a minute" would be wrong in the number and in the verb,
   * and an agent reading it would set about fixing the wrong thing.</p>
   */
  describe(verdict: Exclude<ThrottleVerdict, 'allow'>): string {
    if (verdict === 'busy') {
      return 'Another request is already waiting for the person to answer. Try again once they have.';
    }
    return this.serialized
      ? `Too many requests: a caller without a token may prompt at most ${this.max} times ${over(this.windowMs)}.`
      : `Too many requests: a caller without a token may make at most ${this.max} silent calls ${over(this.windowMs)} — ones a consent policy lets through without a prompt.`;
  }
}

/**
 * Is this timestamp inside the window that ends now? BOTH bounds, and the lower one is the story.
 *
 * <p>A stamp AHEAD of now means the host clock was corrected backward — a resume from sleep, an NTP
 * step. `now - at` is then negative, and a one-sided test reads that as "recent": a full window
 * would stay full until the clock caught up, refusing every call for as long as the jump was. That
 * is an outage produced by a clock rather than by a caller, and it would hit hardest on the machine
 * least able to explain it. A stamp in the future is simply not in the window, so it is dropped and
 * the window begins again.</p>
 *
 * <p>The other way round is the weaker of the two failures and deliberately chosen: moving a
 * machine's clock backward needs administrator rights here, and an attacker holding those has no
 * need of this route at all.</p>
 */
function inWindow(at: number, nowMs: number, windowMs: number): boolean {
  const since = nowMs - at;
  return since >= 0 && since < windowMs;
}

/** The window in a refusal's words: `WINDOW_MS` is "a minute", and any other window is said exactly. */
function over(windowMs: number): string {
  return windowMs === WINDOW_MS ? 'a minute' : `every ${windowMs / 1000} seconds`;
}

/**
 * A slot an admitted call holds until it is finished with it.
 *
 * <p>Handed out by the ceiling that granted it, rather than named again at release. The difference
 * matters because the two decisions can disagree: a call admitted as one that will prompt and
 * released as one that will not leaves the modal budget holding an in-flight slot forever, and
 * every later prompting call is answered `busy` by a call that ended minutes ago. Released the
 * other way round it frees ANOTHER call's slot. A handle cannot be wrong about which ceiling it
 * came from, so the pairing stops being something each route has to remember.</p>
 */
export interface Slot {
  /** Give the slot back. Releasing twice is safe, and releasing a refusal does nothing at all. */
  release(): void;
}

/**
 * What a refused call gives back: nothing, because it took nothing.
 *
 * <p>Not the ceiling's own `release`. A route releases in a `finally` without asking what it got,
 * so a refusal that delegated would hand back the in-flight slot of the call it was refused
 * BEHIND — and the person would then be shown two modals at once, which is the one thing the
 * in-flight rule exists to prevent.</p>
 */
const TOOK_NOTHING = (): void => undefined;

/** A held slot, or — when there was none to take — the refusal to answer with. */
export interface Admission extends Slot {
  /** `undefined` is admission; otherwise what to tell the caller, and whether to write it down. */
  readonly refusal?: { message: string; report: boolean };
}

/**
 * The two ceilings a caller with no token answers to, and which one a given call gets.
 *
 * <p>Held together because the rule that picks between them is the whole of what the quiet path
 * changed at the door: a call that will ask answers to the modal budget, a call that will not
 * answers to the silent ceiling. A server holding two fields and choosing in every admit and
 * every release is a server that one day chooses differently in one of them — and a slot
 * released on the wrong ceiling frees ANOTHER call's.</p>
 */
export class TokenlessCeilings {
  /** The rate at which a caller with no token may make this window ask a human. */
  private readonly modalBudget = new AliasThrottle();
  /**
   * The rate at which a consent policy may let such a caller through WITHOUT asking (#95).
   * Unserialized, because the in-flight rule protects a human from a stack of dialogs and this
   * path has neither — and it says so in its refusal, which names calls rather than prompts.
   */
  private readonly silentCeiling = new AliasThrottle(SILENT_CEILING, WINDOW_MS, false);

  /**
   * When the last silent refusal was WRITTEN DOWN — not when one last happened.
   *
   * <p>The ceiling bounds actions and not refusals: a loop calling a thousand times a minute is
   * refused nine hundred and forty times, and a line each would be a journal nobody can read about
   * a machine nobody can diagnose. One line a window says everything the second one would — that
   * this ceiling fired, and when it started — so that is what is written.</p>
   */
  private reportedAt: number | undefined;

  /**
   * Whether this call may proceed, and — when it may not — what to say and whether to record it.
   *
   * <p>`undefined` is admission. The decision lives here rather than at the server because picking
   * the ceiling, asking it, wording its refusal and rationing the record are one rule with four
   * parts, and a server that held them apart is a server that one day answers one ceiling's verdict
   * with the other's sentence.</p>
   */
  admit(prompts: boolean, nowMs: number): Admission {
    const ceiling = this.for(prompts);
    const verdict = ceiling.admit(nowMs);
    if (verdict === 'allow') {
      return { release: () => ceiling.release() };
    }
    return {
      refusal: { message: ceiling.describe(verdict), report: !prompts && this.firstThisWindow(nowMs) },
      release: TOOK_NOTHING,
    };
  }

  /** `prompts` is what the door already decided: whether this call will raise a modal. */
  private for(prompts: boolean): AliasThrottle {
    return prompts ? this.modalBudget : this.silentCeiling;
  }

  /**
   * True once per window, so a runaway loop leaves one line rather than one line per call.
   *
   * <p>Measured with {@link inWindow} for the same reason the counts are: a mark left in the future
   * by a clock that has since moved back would silence the journal for the length of the jump, and
   * the one fact worth having about a runaway loop is the one that would never arrive.</p>
   */
  private firstThisWindow(nowMs: number): boolean {
    if (this.reportedAt !== undefined && inWindow(this.reportedAt, nowMs, WINDOW_MS)) {
      return false;
    }
    this.reportedAt = nowMs;
    return true;
  }
}
