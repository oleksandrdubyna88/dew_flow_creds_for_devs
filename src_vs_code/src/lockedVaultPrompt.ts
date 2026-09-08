import * as vscode from 'vscode';
import { LOCKED_BUTTON_LABELS, LockedButton, lockedButtons, lockedNotice, StoredPinAnswer } from './lockedNotice';
import { StoredAccount } from './types';

/**
 * What auto-sync OFFERS when it finds a vault locked — the surface, beside the wording it
 * shows (`lockedNotice.ts`) and the rule it follows (`lockedButtons`).
 *
 * <p>It lived inside `syncManager`, which is how it came to disagree with the readiness icon
 * about the one question they both answer. Out here it has its own tests, and the manager
 * hands it the two things it cannot know: how to read the stored PIN, and how to change it.</p>
 */

/** What the offer needs from the manager. Passed in, so this module owns no state. */
export interface UnlockOffer {
  /** Whether a Sync PIN is stored on this machine. May reject — a keychain that will not open. */
  storedPin(account: StoredAccount): Promise<string | undefined>;
  /** Change the Sync PIN. Re-keys the vault and rewrites the remote — the destructive route. */
  setPin(account: StoredAccount): Promise<void>;
  /** Where a failure goes. A notification must not become an unhandled rejection. */
  log?(message: string): void;
}

/** One message for however many vaults a cycle found locked, with the right buttons on it. */
export function reportLockedVaults(locked: readonly StoredAccount[], offer: UnlockOffer): void {
  if (locked.length === 0) {
    return;
  }
  const notice = lockedNotice(locked.map((account) => account.email));
  if (notice.single) {
    showUnlockOffer(locked[0], offer);
    return;
  }
  // With several vaults the buttons cannot act on "the" account, so the one button asks
  // which — and then offers that vault exactly the choice a single one would have had.
  const unlock = LOCKED_BUTTON_LABELS.unlock;
  void vscode.window.showWarningMessage(notice.message, unlock).then((choice) => {
    if (choice === unlock) {
      void pickAndUnlock(locked, offer);
    }
  });
}

/**
 * Fire-and-forget, deliberately: the offer is raised from a cycle nobody awaits, and the
 * popup itself only resolves when a person answers it — which may be never.
 */
export function showUnlockOffer(account: StoredAccount, offer: UnlockOffer): void {
  void offerUnlock(account, offer).catch((error: unknown) => {
    offer.log?.(`offering to unlock ${account.email} failed: ${String(error)}`);
  });
}

/**
 * What a locked vault is offered.
 *
 * <p>NOT "set a PIN" for a vault that has one. That button is not a label: `setPin` re-wraps
 * the vault under a NEW PIN and writes it to the sync location, after which every other
 * machine stops opening the file until the same new PIN is typed there. A lock is not a PIN
 * problem — usually it is a timer that elapsed — and the readiness icon has said so all
 * along (`syncReadiness`, `isLocked`).</p>
 */
export async function offerUnlock(account: StoredAccount, offer: UnlockOffer): Promise<void> {
  const buttons = lockedButtons(await storedPinAnswer(account, offer));
  const choice = await vscode.window.showWarningMessage(
    lockedNotice([account.email]).message,
    ...buttons.map((button) => LOCKED_BUTTON_LABELS[button]),
  );
  await act(
    buttons.find((button) => LOCKED_BUTTON_LABELS[button] === choice),
    account,
    offer,
  );
}

/** The chosen button, as an action. Undefined = the notification was dismissed. */
async function act(
  picked: LockedButton | undefined,
  account: StoredAccount,
  offer: UnlockOffer,
): Promise<void> {
  if (picked === 'setPin') {
    await offer.setPin(account);
  } else if (picked === 'unlock') {
    // Despite the command's name this is the GENERAL unlock: `unlockPlan` decides between a
    // key touch, a typed PIN, or a choice between them.
    await vscode.commands.executeCommand('credSshManager.unlockWithSecurityKey', account);
  }
}

/**
 * Whether this machine has a Sync PIN — with the third answer the keychain can give.
 *
 * <p>A lookup that THREW says nothing about whether a PIN is stored, and the two answers are
 * only interchangeable if the extra offer is harmless. This one rewrites the vault for every
 * machine, so an unknown answer degrades towards the side that does not.</p>
 */
export async function storedPinAnswer(account: StoredAccount, offer: UnlockOffer): Promise<StoredPinAnswer> {
  try {
    const pin = await offer.storedPin(account);
    return pin !== undefined && pin.length > 0 ? 'yes' : 'no';
  } catch {
    return 'unknown';
  }
}

/** Several locked vaults: ask which, then offer that one exactly what a single one gets. */
export async function pickAndUnlock(locked: readonly StoredAccount[], offer: UnlockOffer): Promise<void> {
  const picked = await vscode.window.showQuickPick(
    locked.map((account) => ({
      label: account.email,
      description: account.provider,
      account,
    })),
    { title: 'Unlock a vault', placeHolder: 'All of these are locked on this machine' },
  );
  if (picked !== undefined) {
    showUnlockOffer(picked.account, offer);
  }
}
