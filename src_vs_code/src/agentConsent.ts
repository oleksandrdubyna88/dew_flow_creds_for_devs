/**
 * What the SSH agent's confirmation dialog MEANS — the decision, without the dialog.
 *
 * <p>Carved out of `sshAgentManager.ts` for the reason this repository has learned more than
 * once (`entityText.ts` and `sshCommand.ts` were extracted from `dialogs.ts` and
 * `terminalManager.ts` because of a bug, not for tidiness): a rule that lives beside a `vscode`
 * import is a rule no `node:test` can reach, and this one decides whether a private key signs.</p>
 *
 * <p>The three answers are not symmetric, and that asymmetry is the whole content:</p>
 *
 * <ul>
 *   <li><b>Deny</b> refuses THIS signature. It is not remembered — the next request asks again,
 *       because a key that could not be used once is not a key that should be unusable.</li>
 *   <li><b>A dismissed dialog</b> (Escape, a missed notification) refuses too, and additionally
 *       counts as no evidence that a person was present. The broker's consent follows the same
 *       rule for the same reason: a mis-click must not lock something out.</li>
 *   <li><b>Allow for 10 minutes</b> is the only answer that remembers anything, and only for that
 *       key. It exists because `git push` signs and authenticates in one breath, and two modals
 *       per push is how people learn to click without reading.</li>
 * </ul>
 */

/** The labels the dialog offers. Exported so the dialog and this decision cannot drift apart. */
export const ALLOW_ONCE = 'Allow once';
export const ALLOW_WINDOW = 'Allow for 10 minutes';
export const DENY = 'Deny';

/** How long `ALLOW_WINDOW` covers. */
export const ALLOW_WINDOW_MS = 10 * 60_000;

export interface ConsentDecision {
  /** Whether this signature goes ahead. */
  allow: boolean;
  /**
   * Until when this key may sign without asking again, or `undefined` for "ask every time".
   * Only ever set by `ALLOW_WINDOW`.
   */
  allowedUntil?: number;
  /**
   * Whether a person demonstrably answered. A dismissed dialog is NOT presence — the same rule
   * that stops agent traffic from postponing the idle auto-lock.
   */
  present: boolean;
}

/** Read the dialog's answer. `undefined` is a dismissal, which is the common case, not an error. */
export function consentFromChoice(choice: string | undefined, now: number): ConsentDecision {
  if (choice === undefined) {
    return { allow: false, present: false };
  }
  if (choice === DENY) {
    return { allow: false, present: true };
  }
  if (choice === ALLOW_WINDOW) {
    return { allow: true, present: true, allowedUntil: now + ALLOW_WINDOW_MS };
  }
  // `ALLOW_ONCE`, and anything unrecognised, allows exactly this one signature and remembers
  // nothing. Erring toward "ask again" is the safe direction for an unexpected label.
  return { allow: true, present: true };
}

/** Whether an earlier "allow for 10 minutes" still covers a request now. */
export function withinAllowWindow(allowedUntil: number | undefined, now: number): boolean {
  return allowedUntil !== undefined && allowedUntil > now;
}
