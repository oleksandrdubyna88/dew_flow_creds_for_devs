import { GrantOutcome } from './allowWindows';
import { RefusalKind } from './consentTurns';
import { SignPurpose, describePurposeForLog } from './sshAgentProtocol';
import { AgentKey } from './sshAgentServer';

/**
 * The words the SSH agent's gate says about a request that was not simply answered (#197, E2.3): the log line of every
 * way a request is refused, the information message when a timed answer crossed a fence, and how a duration reads.
 * Pure text with no `vscode` and no state — moved out of `sshAgentManager.ts` so that file stays under its size limit
 * and the wording can be read in one place.
 */

/**
 * What a person is TOLD when a timed answer crossed a fence (#197, E2.3) — the information message that goes with
 * `CROSSED_LINE`, the log line in `sshAgentManager.ts`. The click they made allowed one signature and opened no
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

/**
 * A FIXED bound, to the nearest unit: "5 minutes", "1 minute" — or seconds under a minute, so a short bound never
 * reads "0 minutes". Not for a time that is running out: see `timeLeftText`.
 */
export function durationText(ms: number): string {
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
