import * as vscode from 'vscode';
import { describeError } from './describeError';
import { withTimeout } from './withTimeout';
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
  /** How long the stored-PIN lookup may take before it counts as unknown. Tests shorten it. */
  timeoutMs?: number;
}

/**
 * How long a keychain gets to answer "is a PIN stored" before the offer goes ahead without it.
 *
 * <p>Generous, because the answer is worth waiting for — but bounded, because the account has
 * already been deduped for this session by the time we ask. A lookup that never settles would
 * mean no notification at all, and nothing asking again until the window is reloaded.</p>
 */
const STORED_PIN_TIMEOUT_MS = 5_000;

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
  // Detached, and every detached edge carries its own catch: the whole chain — the
  // notification, the picker, and the offer that follows it — runs on a promise nobody
  // awaits, so a rejection anywhere in it would surface as an unhandled one.
  void vscode.window
    .showWarningMessage(notice.message, unlock)
    .then((choice) => (choice === unlock ? pickAndUnlock(locked, offer) : undefined))
    .then(undefined, (error: unknown) => {
      offer.log?.(`offering to unlock ${locked.length} vaults failed: ${describeError(error)}`);
    });
}

/**
 * Fire-and-forget, deliberately: the offer is raised from a cycle nobody awaits, and the
 * popup itself only resolves when a person answers it — which may be never.
 */
export function showUnlockOffer(account: StoredAccount, offer: UnlockOffer): void {
  void offerUnlock(account, offer).catch((error: unknown) => {
    offer.log?.(`offering to unlock ${account.email} failed: ${describeError(error)}`);
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
  const answer = await withTimeout(lookupStoredPin(account, offer), offer.timeoutMs ?? STORED_PIN_TIMEOUT_MS);
  if (answer === undefined) {
    offer.log?.(`the stored-PIN lookup for ${account.email} timed out — offering unlock only`);
    return 'unknown';
  }
  return answer;
}

/** A stored value, as an answer: absent or empty is "no PIN on this machine". */
function answerFor(pin: string | undefined): StoredPinAnswer {
  return pin !== undefined && pin.length > 0 ? 'yes' : 'no';
}

/** The lookup itself, which resolves its own failures so the bound above never sees a rejection. */
async function lookupStoredPin(account: StoredAccount, offer: UnlockOffer): Promise<StoredPinAnswer> {
  try {
    return answerFor(await offer.storedPin(account));
  } catch (error: unknown) {
    // Said out loud: an outage that silently removed the PIN offer would look exactly like an
    // ordinary stored PIN, leaving nothing to read when somebody asks why sync stopped.
    offer.log?.(`could not read the stored PIN for ${account.email}: ${describeError(error)}`);
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
  if (picked === undefined) {
    // Nothing will ask again this session — `warnedAccounts` has deduped every one of them —
    // so the abandoned pick is recorded rather than being indistinguishable from silence.
    offer.log?.(`the choice of which locked vault to unlock was cancelled (${locked.length} still locked)`);
    return;
  }
  showUnlockOffer(picked.account, offer);
}
