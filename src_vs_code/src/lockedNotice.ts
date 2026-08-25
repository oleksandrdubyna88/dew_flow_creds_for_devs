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
