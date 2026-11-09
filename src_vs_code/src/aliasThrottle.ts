import type { AuditDoor } from './agentAuditLog';

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
 * <p><b>One door, one window; one human, one dialog (E1.3 epoch 3).</b> A Remote Bridge is a third door, and its agent
 * must not spend the laptop's five prompts or another server's: each door has its own sliding windows, keyed by the
 * bridge's id, and the local door keeps the key {@link LOCAL_DOOR}. The one-in-flight rule is NOT per door, because the
 * human it protects is one person with one screen. And the modal window counts DIALOGS RAISED, stamped by the consent
 * gate at the moment it shows one ({@link TokenlessCeilings.prompted}), not calls admitted: a call refused before its
 * dialog (an out-of-scope reference, an entry the wall refuses) shows nobody anything and spends nothing. That holds
 * for the local alias and MCP doors too.</p>
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

/**
 * How many calls that ASK (raise a dialog, or would have, had nothing refused them first) a door may make inside
 * {@link WINDOW_MS}, refusals included — Amendment 2, B.1.
 *
 * <p>The dialog budget counts dialogs SHOWN, which is right for a person's patience and leaves a hole: a call refused
 * before its dialog (an empty command, an entry the wall bars) showed nobody anything, spent nothing, and cost the broker
 * a minted grant and two journal lines. A loop of them was bounded by nothing. This is the same number as
 * {@link SILENT_CEILING} for the same kind of loop — one with no human in it — and it narrows nothing a person can do:
 * a terminal or an agent that thinks between calls is nowhere near sixty a minute.</p>
 */
export const ASKING_CEILING = 60;


export type ThrottleVerdict = 'allow' | 'busy' | 'too-many';

/** The count: stamps inside the window that ends now, both bounds ({@link inWindow}). */
export class SlidingWindow {
  /** Timestamps inside the current window, oldest first. */
  private stamps: number[] = [];

  constructor(
    readonly max: number,
    readonly windowMs: number,
  ) {}

  /** Whether `max` stamps are already inside the window that ends at `nowMs`. */
  full(nowMs: number): boolean {
    this.prune(nowMs);
    return this.stamps.length >= this.max;
  }

  /**
   * Count one at `nowMs`.
   *
   * <p>Only the newest `max` are kept: the window is full exactly when the `max`-th newest stamp is still inside it, so
   * older ones decide nothing, and a flood of refusals that are stamped (B.1) cannot grow this array — or the cost of
   * pruning it — with the request rate.</p>
   */
  stamp(nowMs: number): void {
    this.prune(nowMs);
    this.stamps.push(nowMs);
    if (this.stamps.length > this.max) {
      this.stamps.shift();
    }
  }

  /** Full: `too-many`, nothing counted. Otherwise count it and allow. */
  admit(nowMs: number): 'allow' | 'too-many' {
    if (this.full(nowMs)) {
      return 'too-many';
    }
    this.stamp(nowMs);
    return 'allow';
  }

  /** How many stamps are kept: at most `max`. For the test. */
  stored(): number {
    return this.stamps.length;
  }

  /** Nothing is inside the window: the coordinator may forget the door this belongs to. */
  idle(nowMs: number): boolean {
    this.prune(nowMs);
    return this.stamps.length === 0;
  }

  private prune(nowMs: number): void {
    this.stamps = this.stamps.filter((at) => inWindow(at, nowMs, this.windowMs));
  }
}

/**
 * One dialog at a time, for a HUMAN: a stack of modals is unusable long before any count is reached. Global, never per
 * door: the person is one person with one screen, whichever door the second dialog would come from.
 */
export class OneInFlight {
  private nextId = 1;
  /** The holding that has the place now, if any. */
  private owner: number | undefined;
  /** A dialog of that holding is on screen. */
  private dialog = false;
  /** The holding whose call has already ended (`released` while its dialog was up), so a kept place must not outlive it. */
  private endedId: number | undefined;

  /** Take the place; `undefined` while it is held. The holding is this ADMISSION's, so a stale release cannot free a later holder's place. */
  hold(): Holding | undefined {
    if (this.owner !== undefined) {
      return undefined;
    }
    const held: Holding = { id: this.nextId };
    this.nextId += 1;
    this.owner = held.id;
    return held;
  }

  /** The holding that has the place now, or `undefined` while it is free. */
  holder(): Holding | undefined {
    return this.owner === undefined ? undefined : { id: this.owner };
  }

  /** A dialog is on screen for the holder: the place now belongs to the dialog. */
  prompted(held: Holding): void {
    if (this.owner === held.id) {
      this.dialog = true;
    }
  }

  /**
   * The dialog closed — the person's click or dismissal (never a timer, E1.5): the place is free, whatever the call does next. `keep` (an
   * Allow of a call that may show a prompt of its own next, Amendment 3, C.3): the place stays the call's until it is released
   * — unless the call has already ended, which a kept place must not outlive.
   */
  dialogClosed(held: Holding, keep?: boolean): void {
    if (this.owner === held.id) {
      this.dialog = false;
      if (keep !== true || this.endedId === held.id) {
        this.owner = undefined;
      }
    }
  }

  /** The call ended. Frees the place only if no dialog of this holding is on screen, and only if it still holds the place. */
  released(held: Holding): void {
    if (this.owner === held.id) {
      this.endedId = held.id;
      if (!this.dialog) {
        this.owner = undefined;
      }
    }
  }
}

/** One admission's claim on the one place: the id lets a late release tell that the place is no longer its own. */
export interface Holding {
  readonly id: number;
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
export function over(windowMs: number): string {
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
  /**
   * `undefined` is admission; otherwise what to tell the caller, whether to write it down, and — when it is written down —
   * the door the line may name: `mcp` for the silent ceiling, which only the MCP door has a policy to reach, and none for an
   * asking call, which can come by any door.
   */
  readonly refusal?: { message: string; report: boolean; via?: AuditDoor };
}

/** The key of the local door: the main port and the socket, which are one window's callers with no token. */
export const LOCAL_DOOR = 'local';

/**
 * The `busy` answer, with the help a caller can act on: the four things that may hold the place (§4.10), and where to answer them. Tests import it, never retype it.
 * Its wording for the local-token exception waits for M10 (parent §7).
 */
export const BUSY_PLACE =
  "Another request holds this window's dialog place. A consent dialog may be standing unanswered, a prompt that followed an Allow may be open (a PIN box, an install offer, a trust modal), or a dependency step may still be running in a terminal, in the VS Code window that owns the place. Answer or finish it there; the next request is then asked.";

/** Whether a dialog raised for this call is counted on the place: its bridge's door, or the local door; none for a local token call. */
export function countedOnPlace(bridgeId: string | undefined, via: AuditDoor): boolean {
  return doorOfDialog(bridgeId, via) !== undefined;
}

/** Which door a dialog is counted on: its bridge's, the local door for a local alias or MCP call, and none for a local token call, which is not throttled. */
function doorOfDialog(bridgeId: string | undefined, via: AuditDoor): string | undefined {
  if (bridgeId !== undefined) {
    return bridgeId;
  }
  return via === 'token' ? undefined : LOCAL_DOOR;
}

/** One door's counts: its three windows, and when its last refusal was written down. */
interface DoorCounts {
  readonly modal: SlidingWindow;
  readonly silent: SlidingWindow;
  /** Calls that ask, stamped at admission AND at refusal, because a refusal is a call (B.1). */
  readonly asking: SlidingWindow;
  reportedAt: number | undefined;
}

const idle = (counts: DoorCounts, nowMs: number): boolean => counts.modal.idle(nowMs) && counts.silent.idle(nowMs) && counts.asking.idle(nowMs);

/** The door a journalled refusal may name: `mcp` for the silent ceiling (only that door has a policy to reach it), none for an asking call. */
const viaOf = (ceiling: Ceiling): AuditDoor | undefined => (ceiling === 'silent' ? 'mcp' : undefined);

/** Which ceiling refused: the sentence and whether the journal hears of it follow from it. */
type Ceiling = 'busy' | 'modal' | 'asking' | 'silent';

/**
 * What a caller with no token answers to, per door, and which ceiling a given call gets.
 *
 * <p>Held together because the rule that picks between them is the whole of what the quiet path changed at the door: a
 * call that will ask answers to the asking ceiling and the modal budget, a call that will not answers to the silent
 * ceiling. A server holding the pieces and choosing in every admit and every release is a server that one day chooses
 * differently in one of them.</p>
 *
 * <p>The modal window is NOT stamped here. A call admitted as one that will ask holds the one place and is checked
 * against its door's windows; the modal stamp is written by {@link prompted}, from the consent gate, when a dialog is
 * shown, and the place is the dialog's from then until {@link dialogClosed}. The asking and silent windows are stamped at
 * admission, because for a call that raises no dialog admission is the only moment there is; the asking window is also
 * stamped by a refusal.</p>
 */
export class TokenlessCeilings {
  /** The one dialog in flight, for every door together. */
  private readonly flight = new OneInFlight();
  private readonly doors = new Map<string, DoorCounts>();
  /** The holding whose dialog is on screen, set by {@link prompted} and consumed by {@link dialogClosed}. */
  private open: Holding | undefined;

  /**
   * Whether this call may proceed, and — when it may not — what to say and whether to record it. `undefined` refusal is
   * admission.
   *
   * <p>Prompts: the place held → `busy`; this door's asking window full → `too-many`; its modal window full →
   * `too-many`; else the place is held and the call allowed. Neither refusal holds the place, and both count as a call in
   * the asking window. Silent: this door's silent window admits (and stamps) or refuses; no place is taken, because that
   * rule protects a human from a pile-up and this path has no human to protect — except a quiet call whose action may prompt again
   * (`followUp`, D.3): it holds the place from admission to its release, with no dialog, so its next prompt opens over nothing.</p>
   */
  admit(prompts: boolean, nowMs: number, door: string = LOCAL_DOOR, followUp: boolean = false): Admission {
    const counts = this.countsOf(door, nowMs);
    return prompts ? this.admitAsking(counts, door, nowMs) : this.admitQuiet(counts, door, nowMs, followUp);
  }

  /** A call that raises no dialog: it holds the place only when its action may prompt again. */
  private admitQuiet(counts: DoorCounts, door: string, nowMs: number, followUp: boolean): Admission {
    return followUp ? this.admitSilentPlace(counts, door, nowMs) : this.admitSilent(counts, door, nowMs);
  }

  /** The mirror of {@link admitAsking} on the quiet path: the place first, then the silent window, which gives the place back when it refuses. No modal stamp, no asking stamp: the call raises no dialog. */
  private admitSilentPlace(counts: DoorCounts, door: string, nowMs: number): Admission {
    const held = this.flight.hold();
    if (held === undefined) {
      return this.refused('busy', door, counts, nowMs);
    }
    if (counts.silent.admit(nowMs) !== 'allow') {
      this.flight.released(held);
      return this.refused('silent', door, counts, nowMs);
    }
    return this.holding(held);
  }

  private admitSilent(counts: DoorCounts, door: string, nowMs: number): Admission {
    return counts.silent.admit(nowMs) === 'allow' ? { release: TOOK_NOTHING } : this.refused('silent', door, counts, nowMs);
  }

  private admitAsking(counts: DoorCounts, door: string, nowMs: number): Admission {
    const held = this.flight.hold();
    if (held === undefined) {
      return this.refused('busy', door, counts, nowMs);
    }
    const over = this.askingRefusal(counts, nowMs);
    if (over !== undefined) {
      this.flight.released(held);
      return this.refused(over, door, counts, nowMs);
    }
    return this.holding(held);
  }

  /** Why an asking call is refused by a count, in the order of the checks, stamping the asking window when it is admitted. */
  private askingRefusal(counts: DoorCounts, nowMs: number): Ceiling | undefined {
    const ceiling = counts.asking.full(nowMs) ? 'asking' : counts.modal.full(nowMs) ? 'modal' : undefined;
    counts.asking.stamp(nowMs);
    return ceiling;
  }

  private refused(ceiling: Ceiling, door: string, counts: DoorCounts, nowMs: number): Admission {
    const writtenDown = (ceiling === 'silent' || ceiling === 'asking') && this.firstThisWindow(counts, nowMs);
    return { refusal: { message: this.describe(ceiling, door), report: writtenDown, via: viaOf(ceiling) }, release: TOOK_NOTHING };
  }

  /**
   * A dialog was raised for this grant: count it in the modal window of its door, and make the place the dialog's.
   * Nothing for a local token call (`via === 'token'` and no bridge), which is not throttled and never was. On a bridge
   * every door, token included, is bridged and counted.
   */
  prompted(grant: { bridge?: { context: { bridgeId: string } } }, via: AuditDoor, nowMs: number): void {
    const door = doorOfDialog(grant.bridge?.context.bridgeId, via);
    if (door === undefined) {
      return;
    }
    this.countsOf(door, nowMs).modal.stamp(nowMs);
    this.open = this.flight.holder();
    if (this.open !== undefined) {
      this.flight.prompted(this.open);
    }
  }

  /**
   * The dialog raised for this grant closed — answered or dismissed by a person, never by a timer: the place is free again, whatever its call does
   * next. Pairs with {@link prompted} and frees only the holding that one marked: a second or late close names a holding
   * that no longer has the place, so it frees nothing of the next holder. `keep`: see {@link OneInFlight.dialogClosed}.
   */
  dialogClosed(grant: { bridge?: { context: { bridgeId: string } } }, via: AuditDoor, keep?: boolean): void {
    const held = this.open;
    if (held !== undefined && doorOfDialog(grant.bridge?.context.bridgeId, via) !== undefined) {
      this.flight.dialogClosed(held, keep);
    }
  }

  /** A bridge closed (E2 wires it): its counts go, and so does any door whose windows have nothing in them. */
  forget(door: string, nowMs: number = Date.now()): void {
    this.doors.delete(door);
    this.prune(nowMs);
  }

  /** How many doors hold counts: the memory a closed bridge would leave if nothing forgot it. For the test. */
  doorCount(): number {
    return this.doors.size;
  }

  /** The place this call holds, given back by the call that took it — and only if the place is still its own, so a second release frees nothing. */
  private holding(held: Holding): Slot {
    return { release: () => this.flight.released(held) };
  }

  private countsOf(door: string, nowMs: number): DoorCounts {
    let counts = this.doors.get(door);
    if (counts === undefined) {
      this.prune(nowMs);
      counts = {
        modal: new SlidingWindow(MAX_PROMPTS, WINDOW_MS),
        silent: new SlidingWindow(SILENT_CEILING, WINDOW_MS),
        asking: new SlidingWindow(ASKING_CEILING, WINDOW_MS),
        reportedAt: undefined,
      };
      this.doors.set(door, counts);
    }
    return counts;
  }

  /** Doors with nothing in any window, except the local one, which is always there. */
  private prune(nowMs: number): void {
    for (const [door, counts] of this.doors) {
      if (door !== LOCAL_DOOR && idle(counts, nowMs)) {
        this.doors.delete(door);
      }
    }
  }

  /** What to tell a caller that was refused, in words it can act on: a sentence about THIS ceiling, in the door's own terms. */
  private describe(ceiling: Ceiling, door: string): string {
    if (ceiling === 'busy') {
      return BUSY_PLACE;
    }
    const who = door === LOCAL_DOOR ? 'a caller without a token' : 'this Remote Bridge';
    const says = {
      modal: `may prompt at most ${MAX_PROMPTS} times ${over(WINDOW_MS)}.`,
      asking: `may ask at most ${ASKING_CEILING} times ${over(WINDOW_MS)}, calls refused before any dialog included.`,
      silent: `may make at most ${SILENT_CEILING} silent calls ${over(WINDOW_MS)} — ones a consent policy lets through without a prompt.`,
    };
    return `Too many requests: ${who} ${says[ceiling]}`;
  }

  /**
   * True once per window per door, so a runaway loop leaves one line rather than one line per call.
   *
   * <p>Measured with {@link inWindow} for the same reason the counts are: a mark left in the future by a clock that has
   * since moved back would silence the journal for the length of the jump, and the one fact worth having about a runaway
   * loop is the one that would never arrive.</p>
   */
  private firstThisWindow(counts: DoorCounts, nowMs: number): boolean {
    if (counts.reportedAt !== undefined && inWindow(counts.reportedAt, nowMs, WINDOW_MS)) {
      return false;
    }
    counts.reportedAt = nowMs;
    return true;
  }
}
