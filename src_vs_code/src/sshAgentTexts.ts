import { ALLOW_LONGER, LONGER_WINDOWS_MS } from './agentConsent';
import { GrantOutcome, OpenWindow, WindowScope } from './allowWindows';
import { RefusalKind } from './consentTurns';
import { clockUntil, localWallTime } from './requestTime';
import { MAX_DISPLAY, SignPurpose, describePurposeForLog, displayText } from './sshAgentProtocol';
import { AgentKey } from './sshAgentServer';

/**
 * The words the SSH agent's gate says about a request that was not simply answered (#197, E2.3): the log line of every
 * way a request is refused, the information message when a timed answer crossed a fence, and how a duration reads.
 * Pure text with no `vscode` and no state — moved out of `sshAgentManager.ts` so that file stays under its size limit
 * and the wording can be read in one place.
 */

/**
 * What a person is TOLD when a timed answer crossed a fence (#197, E2.3) — the information message that goes with
 * `CROSSED_LINE`, the log line just below. The click they made allowed one signature and opened no
 * window; without the message the window simply never appears and nothing says why.
 */
export const CROSSING_NOTICE: ReadonlyMap<GrantOutcome, string> = new Map([
  [
    'fenced-key',
    'Ask for Every Use Again was used while you were choosing — this signature was allowed once; no window was opened.',
  ],
  [
    'fenced-lock',
    'The vault locked while you were choosing — this signature was allowed once; no window was opened.',
  ],
]);

/**
 * What the agent log says when a timed answer crossed something (#197, E2.1/E2.2): the key was removed or replaced
 * while the prompt was open, or the vault was locked, or *Ask for Every Use Again* was used. The last two still
 * allow the ONE signature; none opens a window. The record must say which, because the outcome differs from the
 * click the person made. For the last two the person is told as well, in an information message
 * (`CROSSING_NOTICE`, just above). Moved here from `sshAgentManager.ts` in E3.1.
 */
const CROSSED_LINE: ReadonlyMap<GrantOutcome, (answered: string) => string> = new Map<GrantOutcome, (answered: string) => string>([
  ['stale-key', () => 'answered after the key was removed or replaced — no window was opened'],
  ['fenced-key', (answered) => `answered ${answered} after Ask for Every Use Again — allowed once, no window was opened`],
  ['fenced-lock', (answered) => `answered ${answered} after the vaults were locked — allowed once, no window was opened`],
]);

/** The answer as the log quotes it: its label, and the length when it was a long one — `"Allow longer…" (4 hours)`. */
function answeredText(answer: string, ms: number | undefined): string {
  return ms === undefined ? `"${answer}"` : `"${answer}" (${durationText(ms)})`;
}

/**
 * The log line for a timed answer that crossed something, naming the ANSWER that was given (E3.2: the table used to
 * quote *Allow for 10 minutes* for every crossing). `undefined` for an outcome that crossed nothing.
 */
export function crossedLine(outcome: GrantOutcome, answer: string, ms?: number): string | undefined {
  return CROSSED_LINE.get(outcome)?.(answeredText(answer, ms));
}

/** A reason *Allow longer…* cannot be honoured, as the person is told — `why` has no trailing period. */
export function pickRefusedNotice(why: string): string {
  return `${why}. This signature was allowed once; no window was opened.`;
}

/** A reason as it reads in the MIDDLE of a log sentence (`… but longer windows need …`): the reasons are written to stand alone, capitalised. */
function midSentence(why: string): string {
  return why.charAt(0).toLowerCase() + why.slice(1);
}

/** The log line when *Allow longer…* came back but could no longer be honoured, so no list was opened (the middle check). */
export function noListLine(key: Pick<AgentKey, 'name'>, why: string): string {
  return `"${key.name}": answered "${ALLOW_LONGER}" but ${midSentence(why)} — allowed once, no list was opened`;
}

/** The log line when a length was picked but could no longer be honoured at the pick. */
export function pickRefusedLine(key: Pick<AgentKey, 'name'>, ms: number, why: string): string {
  return `"${key.name}": picked ${durationText(ms)} but ${midSentence(why)} — allowed once, no window was opened`;
}

/**
 * The log line when a shorter length was picked while a longer login window still stands: the pick changed nothing
 * (`grantWindow` keeps the later window), and the record must say so — otherwise the person's 1 hour simply vanishes.
 */
export function keptLaterLine(ms: number, standingUntil: number): string {
  return `answered ${answeredText(ALLOW_LONGER, ms)} — the earlier login window until ${localWallTime(new Date(standingUntil))} stands, no new window was opened`;
}

/** What the person is told, once, when the length they picked was shorter than the login window that still stands. */
export function keptLaterNotice(standingUntil: number): string {
  return `Your earlier login window until ${localWallTime(new Date(standingUntil))} still stands — the shorter length you picked was not applied.`;
}

/** What the person is told when idle auto-lock is turned off and login windows were open. */
export function loginWindowsEndedNotice(keys: number): string {
  return `Idle auto-lock is off, so the login windows of ${plural(keys, 'key')} were ended — a long window needs a lock in this VS Code window to end it.`;
}

/** One entry of the list of lengths: the label the person sees, when it ends, and the length it stands for. */
export interface LongerItem {
  readonly label: string;
  readonly description: string;
  readonly ms: number;
}

/**
 * The list *Allow longer…* opens: 1, 4, 8 and 12 hours with the time each would end, computed when the list opens —
 * so it says "from your pick, about …": the window itself starts at the pick, not at the list (E3.3 review L5/F3; the
 * row shows the true end afterwards) — and the sentence that says a lock in this VS Code window ends it earlier.
 * `offsetMinutes` is the zone, as a number, like the rest of `requestTime.ts`.
 */
export function longerItems(now: number, offsetMinutes: number, autoLockMinutes: number): LongerItem[] {
  return LONGER_WINDOWS_MS.map((ms) => ({
    label: durationText(ms),
    description:
      `from your pick, about ${clockUntil(now + ms, now, offsetMinutes)}, ` +
      `or until the vault locks in this VS Code window (idle auto-lock: ${autoLockMinutes} min)`,
    ms,
  }));
}

/** The list's title: the key's name is somebody else's text, so it goes through `displayText` like every name in a prompt. */
export function listTitle(name: string): string {
  return `How long may "${displayText(name, MAX_DISPLAY)}" log in without asking?`;
}

/** The list's placeholder: what it covers, what Escape does, and the time this request really has left. */
export function listPlaceholder(leftMs: number): string {
  return (
    'SSH logins only, git push and fetch included. Escape refuses this signature. ' +
    `Unanswered, it is refused after ${timeLeftText(leftMs)}.`
  );
}

/** What each window is called in the agent log (I10) — a closed Map, never a computed name. */
const WINDOW_NAME: ReadonlyMap<WindowScope, string> = new Map<WindowScope, string>([
  ['all', '10-minute window'],
  ['login', 'login window'],
]);

/** I10: a silent signature says which window allowed it, until when, and when it was granted. */
export function coveredLine(name: string, scope: WindowScope, window: OpenWindow, purposeText: string): string {
  return (
    `allowed without asking: ${WINDOW_NAME.get(scope) ?? 'window'} of "${name}" until ${localWallTime(new Date(window.until))} ` +
    `(granted ${localWallTime(new Date(window.grantedAt))}) for ${purposeText}`
  );
}

/** Told to a person whose click arrived after its request was refused — VS Code cannot close a modal or a list for them. */
export function staleNotice(bound: string): string {
  return `That signing request had already been refused — it waited longer than ${bound}, or its program had gone. Nothing was signed.`;
}

/** Told once when a prompt is still open from an earlier request and new ones are refused behind it. */
export function orphanNotice(name: string): string {
  return `A signing prompt for "${displayText(name, MAX_DISPLAY)}" is still open from an earlier request — answer or close it.`;
}

export type RefusalLine = (key: AgentKey, purpose: SignPurpose, bound: string) => string;

/** The log line of each way a request is refused without being answered. A Map, never a computed lookup (C8). */
export const REFUSAL: ReadonlyMap<RefusalKind, RefusalLine> = new Map<RefusalKind, RefusalLine>([
  ['timed-out', (_key, purpose, bound) => `no answer in ${bound} — refused ${describePurposeForLog(purpose)}`],
  ['gone', (key) => `"${key.name}": the program that asked has gone — refused`],
  ['full', (key) => `"${key.name}": too many requests are waiting for an answer — refused (one line for this burst)`],
  [
    'orphaned',
    (key) =>
      `"${key.name}": a signing prompt is still open from an earlier request — new requests are refused until it is answered or closed`,
  ],
  ['too-late', (key) => `"${key.name}": the request waited too long behind another prompt — refused without a prompt`],
]);

/**
 * The log line of a request that joined the queue behind the prompt already open for its key — so a request that is
 * only waiting is never mistaken for a hung one. One per waiter; the bound is the fixed one, counted from arrival.
 */
export function queuedLine(key: AgentKey, bound: string): string {
  return (
    `"${key.name}": waiting behind the signing prompt already open for this key — ` +
    `it is asked when that one is answered (refused if it waits past ${bound})`
  );
}

/** The log line for a refusal — a fallback keeps the lookup total should a kind ever be added without a line. */
export function refusalLine(kind: RefusalKind, key: AgentKey, purpose: SignPurpose, bound: string): string {
  return (REFUSAL.get(kind) ?? ((k: AgentKey) => `"${k.name}": refused`))(key, purpose, bound);
}

const plural = (count: number, unit: string): string => `${count} ${unit}${count === 1 ? '' : 's'}`;

const HOUR_MS = 3_600_000;

/** An exact number of hours, one or more — "1 hour", "12 hours"; an hour and a half stays "90 minutes". */
function isWholeHours(ms: number): boolean {
  return ms >= HOUR_MS && ms % HOUR_MS === 0;
}

/**
 * A FIXED bound, to the nearest unit: "5 minutes", "1 minute", "1 hour" (a whole number of hours only) — or seconds
 * under a minute, so a short bound never reads "0 minutes". Not for a time that is running out: see `timeLeftText`.
 */
export function durationText(ms: number): string {
  if (isWholeHours(ms)) {
    return plural(ms / HOUR_MS, 'hour');
  }
  const minutes = Math.round(ms / 60_000);
  return minutes >= 1 ? plural(minutes, 'minute') : plural(Math.max(1, Math.round(ms / 1000)), 'second');
}

/**
 * The time a prompt has LEFT, as the person is told it: rounded DOWN (a prompt never promises more time than it
 * has — 30 s left must not read "1 minute"), and in seconds below two minutes, where a minute is too coarse to act on.
 */
export function timeLeftText(ms: number): string {
  if (ms >= 120_000) {
    return plural(Math.floor(ms / 60_000), 'minute');
  }
  return plural(Math.max(1, Math.floor(ms / 1000)), 'second');
}
