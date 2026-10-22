/**
 * What the SSH agent's confirmation dialog MEANS — the decision, without the dialog.
 *
 * <p>Carved out of `sshAgentManager.ts` for the reason this repository has learned more than
 * once (`entityText.ts` and `sshCommand.ts` were extracted from `dialogs.ts` and
 * `terminalManager.ts` because of a bug, not for tidiness): a rule that lives beside a `vscode`
 * import is a rule no `node:test` can reach, and this one decides whether a private key signs.</p>
 *
 * <p>The four answers are not symmetric, and that asymmetry is the whole content:</p>
 *
 * <ul>
 *   <li><b>Deny</b> refuses THIS signature. It is not remembered — the next request asks again,
 *       because a key that could not be used once is not a key that should be unusable.</li>
 *   <li><b>A dismissed dialog</b> (Escape, a missed notification) refuses too, and additionally
 *       counts as no evidence that a person was present. The broker's consent follows the same
 *       rule for the same reason: a mis-click must not lock something out.</li>
 *   <li><b>Allow for 10 minutes</b> remembers, for that key, every purpose. It exists because `git push`
 *       signs and authenticates in one breath, and two modals per push is how people learn to click without
 *       reading.</li>
 *   <li><b>Allow longer…</b> authorises NOTHING by itself: it opens a list of lengths (1, 4, 8, 12 hours), and
 *       only a length picked from that list remembers anything — for SSH logins only, from the pick. Escape on the
 *       list refuses this signature and counts as presence (a person clicked and then declined); the bound running
 *       out does not. A length the list never offered allows once and arms nothing (#197 E3).</li>
 * </ul>
 *
 * <p>What may be OFFERED a long window is decided here too (`longWindowClaim`, `longerOffer`): a login only, never
 * one whose signature would be SHA-1 RSA (the owner's decision of 2026-10-21; a 10-minute window still covers it),
 * never while the vault is locked, never with idle auto-lock off. `decideSigning` is the table of what each answer
 * means; the dialog, the list and the manager only carry the answer to it.</p>
 *
 * <p><b>Not the same thing as `mcpConsentPolicy.ts`</b>, which asks a question that looks identical
 * — may this proceed without asking again? — and is deliberately a second module. What is stored
 * here is an absolute DEADLINE fixed at the click, because "allow for ten minutes" must mean ten
 * minutes from that moment and changing the constant must not extend a window already granted.
 * What is stored there is a START, because a policy is a setting read fresh at every call: flipping
 * a folder from twelve hours to every-time has to take effect at once, and flipping it back must
 * not retroactively authorise anything. One comparison is shared — `withinAllowWindow` below — and
 * the two shapes stay apart until there is a third instance to learn from.</p>
 *
 * <p>#197 (a window per generation of a key, longer windows for logins) was considered and is NOT that third
 * instance: it widens the SAME instance — still a deadline fixed at the click, per key, in memory, in one
 * window — and its rules live in `allowWindows.ts`. The MCP stamp keeps every property that made it different
 * (persisted, read fresh, a START, fenced by a timestamp because another window can write the store).</p>
 */

import type { WindowScope } from './allowWindows';
import type { SignPurpose } from './sshAgentProtocol';

/** The labels the dialog offers. Exported so the dialog and this decision cannot drift apart. */
export const ALLOW_ONCE = 'Allow once';
export const ALLOW_WINDOW = 'Allow for 10 minutes';
/** One character, U+2026 — never three ASCII dots (#197 E3, C15). */
export const ALLOW_LONGER = 'Allow longer…';
export const DENY = 'Deny';

/**
 * Every answer the signing prompt offers, in the order the buttons stand. The dialog spreads this list and
 * the help test loops over it, so a button added here that no help article names turns that test red by
 * itself. `ALLOW_LONGER` stands third, before `DENY` (#197 E3.3); the prompt leaves it out when `longerOffer` says no.
 */
export const SIGNING_BUTTONS = [ALLOW_ONCE, ALLOW_WINDOW, ALLOW_LONGER, DENY] as const;

/** How long `ALLOW_WINDOW` covers. */
export const ALLOW_WINDOW_MS = 10 * 60_000;

/**
 * How long a consent dialog waits before it refuses — the broker's modal and the SSH agent's signing
 * prompt alike. One constant for both, because they are the same promise to the person: an
 * unanswered request does not stay live. Moved here from `credsAgentServer.ts`, where it was private,
 * when the signing prompt got the same bound (it had none: one found an hour later still signed).
 */
export const CONSENT_TIMEOUT_MS = 5 * 60_000;

/** Whether an earlier "allow for 10 minutes" still covers a request now. */
export function withinAllowWindow(allowedUntil: number | undefined, now: number): boolean {
  return allowedUntil !== undefined && allowedUntil > now;
}

// ---- #197 E3.2: what an answer means, what may be offered ---------------------------------------------------------

/** The lengths *Allow longer…* offers, shortest first. None may pass the login ceiling (`MAX_WINDOW_MS.login`). */
export const LONGER_WINDOWS_MS: readonly number[] = Object.freeze([1, 4, 8, 12].map((hours) => hours * 3_600_000));

/**
 * What a person's answer to the signing prompt MEANS, before any rule about whether it may be honoured.
 * `window` carries the scope and the length; the clock is read once, at the pick, by whoever calls `decideSigning`.
 */
export type SigningAnswer =
  | { kind: 'unanswered' }
  | { kind: 'deny' }
  | { kind: 'once' }
  | { kind: 'window'; scope: WindowScope; ms: number }
  | { kind: 'declined-longer' };

/** What an answer decides: whether this signature goes ahead, whether a person was present, and the window it opens. */
export interface SigningDecision {
  allow: boolean;
  present: boolean;
  window?: { scope: WindowScope; until: number };
}

// Shared by every prompt, so frozen: a caller that wrote to one would change the answer of every later prompt.
// Exported for the manager's two answers that are not a click: a list that failed (`unanswered`) and a pick that could
// no longer be honoured (`once`).
export const UNANSWERED: SigningAnswer = Object.freeze({ kind: 'unanswered' as const });
export const ONCE: SigningAnswer = Object.freeze({ kind: 'once' as const });

/**
 * What each button means. A closed `Map` of small functions (complexity), looked up by the dialog's own return
 * value — never a computed name. `ALLOW_LONGER` is not an answer: it asks for the list.
 */
const MODAL_ANSWERS: ReadonlyMap<string, () => SigningAnswer | 'pick-longer'> = new Map<string, () => SigningAnswer | 'pick-longer'>([
  [ALLOW_ONCE, () => ONCE],
  [ALLOW_WINDOW, () => ({ kind: 'window', scope: 'all', ms: ALLOW_WINDOW_MS })],
  [ALLOW_LONGER, () => 'pick-longer'],
  [DENY, () => ({ kind: 'deny' })],
]);

/**
 * Read the modal's answer. `undefined` is a dismissal. *Allow longer…* authorises nothing by itself: it comes back
 * as `'pick-longer'`, never as an answer. An unrecognised label allows once and arms nothing — a renamed button
 * must fail as "asks every time", never as "signs silently".
 */
export function answerFromModal(choice: string | undefined): SigningAnswer | 'pick-longer' {
  if (choice === undefined) {
    return UNANSWERED;
  }
  return (MODAL_ANSWERS.get(choice) ?? (() => ONCE))();
}

/**
 * Read the list's answer, the length in milliseconds. `undefined` (Escape, or VS Code closed the list) refuses and
 * counts as presence; a length the list never offered allows once and arms nothing.
 */
export function answerFromPick(ms: number | undefined): SigningAnswer {
  if (ms === undefined) {
    return { kind: 'declined-longer' };
  }
  return LONGER_WINDOWS_MS.includes(ms) ? { kind: 'window', scope: 'login', ms } : ONCE;
}

/**
 * How the list ended. `picked` carries the length read from the ITEM the list returned (never from its label);
 * `escaped` is Escape, or VS Code closing the list for another one; `failed` is a list that rejected (the window
 * closing under it) — a dismissal like a modal that fails, and NOT Escape: it counts no presence.
 */
export type ListPick = { kind: 'picked'; ms: number } | { kind: 'escaped' } | { kind: 'failed' };

/** What the end of the list means: a failed list is `unanswered`, anything else is `answerFromPick`. */
export function answerFromList(pick: ListPick): SigningAnswer {
  if (pick.kind === 'failed') {
    return UNANSWERED;
  }
  return answerFromPick(pick.kind === 'picked' ? pick.ms : undefined);
}

const REFUSED_BUT_PRESENT = (): SigningDecision => ({ allow: false, present: true });
const ALLOWED_ONCE = (): SigningDecision => ({ allow: true, present: true });

/** A window answer: allowed, present, and the window ends `ms` after `now` — the moment of the click or the pick. */
function windowDecision(answer: SigningAnswer, now: number): SigningDecision {
  return answer.kind === 'window'
    ? { allow: true, present: true, window: { scope: answer.scope, until: now + answer.ms } }
    : { allow: false, present: false };
}

/** The table: one small function per kind of answer. */
const DECISIONS: ReadonlyMap<SigningAnswer['kind'], (answer: SigningAnswer, now: number) => SigningDecision> = new Map<
  SigningAnswer['kind'],
  (answer: SigningAnswer, now: number) => SigningDecision
>([
  ['unanswered', () => ({ allow: false, present: false })],
  ['deny', REFUSED_BUT_PRESENT],
  ['once', ALLOWED_ONCE],
  ['window', windowDecision],
  ['declined-longer', REFUSED_BUT_PRESENT],
]);

/** What an answer means. An answer this table does not know refuses and counts as nobody present. */
export function decideSigning(answer: SigningAnswer, now: number): SigningDecision {
  return (DECISIONS.get(answer.kind) ?? (() => ({ allow: false, present: false })))(answer, now);
}

/**
 * Whether a request may be covered by a long window, and if not, why. `login`: an SSH login whose signature is not
 * SHA-1 RSA. `sha1-login`: an RSA login the signer would sign with SHA-1 (the owner's decision of 2026-10-21: SHA-1
 * stays signable, and a 10-minute window still covers it, but no long window ever does). `not-login`: everything else.
 */
export type LongWindowClaim = 'login' | 'sha1-login' | 'not-login';

/** The one place the claim is made; the gate and the offer both read it. `sha1` is `signsWithSha1`'s answer. */
export function longWindowClaim(purpose: SignPurpose, sha1: boolean): LongWindowClaim {
  if (purpose.kind !== 'ssh-login') {
    return 'not-login';
  }
  return sha1 ? 'sha1-login' : 'login';
}

export type LongerOffer = { offer: true } | { offer: false; why: string };

interface OfferFacts {
  claim: LongWindowClaim;
  locked: boolean;
  autoLockMinutes: number;
}

/**
 * The claims that are a login at all. The first reason refuses everything NOT in this closed set rather than
 * comparing against `'not-login'`, so a claim nobody foresaw (a widened union, a cast) is refused, not offered
 * (E3.2 review M2). `longWindowClaim` is the same shape: only an `ssh-login` purpose ever leaves `'not-login'`.
 */
const LOGIN_CLAIMS: ReadonlySet<LongWindowClaim> = new Set<LongWindowClaim>(['login', 'sha1-login']);

/** Idle auto-lock is on only for a positive number: `0`, a negative one and `NaN` all read as off. */
function autoLockIsOn(minutes: number): boolean {
  return minutes > 0;
}

/**
 * The reasons *Allow longer…* is not offered, in the order they are reported — the first that applies wins. No
 * trailing period: the modal appends one, the notices append their dash clause.
 */
const NO_OFFER: readonly { why: string; applies: (facts: OfferFacts) => boolean }[] = [
  { why: 'Longer windows cover SSH logins only', applies: (facts) => !LOGIN_CLAIMS.has(facts.claim) },
  {
    why: 'Longer windows need a SHA-2 signature: this RSA login asked for SHA-1',
    applies: (facts) => facts.claim === 'sha1-login',
  },
  { why: 'Longer windows need the vault unlocked — a lock ends them', applies: (facts) => facts.locked },
  {
    why: 'Longer windows need idle auto-lock: credSshManager.autoLockMinutes is off',
    applies: (facts) => !autoLockIsOn(facts.autoLockMinutes),
  },
];

/** Whether the prompt may offer *Allow longer…* — and the first reason it may not. */
export function longerOffer(claim: LongWindowClaim, locked: boolean, autoLockMinutes: number): LongerOffer {
  const refusal = NO_OFFER.find((reason) => reason.applies({ claim, locked, autoLockMinutes }));
  return refusal === undefined ? { offer: true } : { offer: false, why: refusal.why };
}
