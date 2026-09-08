/**
 * One notification for however many vaults auto-sync found locked.
 *
 * <p>It used to be one per account, and the reason it was wrong is not that three popups are
 * untidy: three popups stack in the corner, cover each other's buttons, and each asks a
 * question about an account whose name is on a different line than the button you are about to
 * press. With four accounts the last one is off-screen. The information — "these vaults are
 * locked" — is one fact about this machine, so it is one message.</p>
 *
 * <p>Pure, so the wording is a test rather than something to be read off a screenshot.</p>
 */

export interface LockedNotice {
  message: string;
  /** True when the message speaks about exactly one vault, so it can offer that vault's own buttons. */
  single: boolean;
}

/**
 * The message for a set of locked accounts.
 *
 * <p>Names are listed, never counted away. "3 vaults are locked" without saying which ones
 * leaves the reader to open the tree and compare — and the reason they are being interrupted
 * is precisely that they cannot see it.</p>
 */
export function lockedNotice(emails: readonly string[]): LockedNotice {
  const unique = [...new Set(emails.filter((email) => email.length > 0))];
  if (unique.length === 1) {
    return {
      message: `Auto-sync: the vault of ${unique[0]} is locked on this machine.`,
      single: true,
    };
  }
  return {
    message: `Auto-sync: ${unique.length} vaults are locked on this machine — ${unique.join(', ')}.`,
    single: false,
  };
}

/** What the single-vault notification may offer, as an action rather than a label. */
export type LockedButton = 'unlock' | 'setPin';

/**
 * Whether a Sync PIN is stored on this machine — with the third answer that matters.
 *
 * <p>`unknown` is a keychain that would not say: locked, unavailable, or erroring. It is not
 * the same as `no`, and treating it as one is what the review round caught in this fix's own
 * plan. See {@link lockedButtons}.</p>
 */
export type StoredPinAnswer = 'yes' | 'no' | 'unknown';

/** The words on those buttons — shared, so no second surface may invent its own. */
export const LOCKED_BUTTON_LABELS: Readonly<Record<LockedButton, string>> = {
  // Not "Unlock with Security Key": the command behind it opens the vault by whatever the
  // vault has — a key touch, a typed PIN, or a choice between them (see unlockPlan). Named
  // for the key, a person without one reads it as "not for me" and presses the other button.
  unlock: 'Unlock…',
  setPin: 'Set Sync PIN…',
};

/**
 * What to offer for ONE locked vault, in the order it is offered.
 *
 * <p>A locked vault is a LOCK, not a PIN problem, and the two must not be confused here
 * because the PIN button is not a label — `setPin` re-wraps the vault under a new PIN and
 * writes it to the sync location, so every other machine stops opening the file until the
 * same new PIN is typed there. Proposing that to somebody whose auto-lock timer elapsed is
 * offering a fleet-wide credential rotation as the fix for a five-minute idle window.</p>
 *
 * <p>So it is offered only where it is genuinely the fix: no PIN stored at all, where
 * background sync cannot run unattended. And never first — the destructive action is not the
 * one under the cursor. An `unknown` answer counts as `yes`: a lookup that failed is no
 * evidence that nothing is stored, and the safe side of that guess is the one that does not
 * rewrite a vault.</p>
 */
export function lockedButtons(storedPin: StoredPinAnswer): readonly LockedButton[] {
  return storedPin === 'no' ? ['unlock', 'setPin'] : ['unlock'];
}
