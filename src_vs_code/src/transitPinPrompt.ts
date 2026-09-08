import * as vscode from 'vscode';
import { SharePin, generateSharePin, sharePinNotice, typedPin } from './sharePin';
import { clearIfUnchanged, copySecret, secretClipboardTtl } from './secretClipboard';
import { pinValidator } from './pinInput';
import { validatePin } from './pinPolicy';

/**
 * The one place a TRANSIT secret is asked for, in `vscode`'s words — the sibling of `pinPrompt.ts`,
 * and here for the same two reasons: everything decidable about a PIN is pure and tested
 * elsewhere, and the WORDING must live in one file or the box comes to say two different things.
 *
 * <p>A transit secret is one that crosses to another person, out-of-band, once: the share PIN and
 * the export password. This file was called `sharePinPrompt.ts` until the export password started
 * asking through the same box — the name had to move with the job, or it would have been a file
 * called `share…` holding the wording of something that is not a share. It still answers with the
 * share transport's `SharePin` type, because the two are the same shape; the day the export path
 * needs a field the share path does not, that is the thing to revisit.</p>
 *
 * <p>It is the extension's first `createInputBox`, which buys a button and gives away three things
 * `showInputBox` did for free. Each is a defect waiting to ship, and each is a test:</p>
 *
 * <ol>
 *   <li><b>Enter is not blocked.</b> `InputBoxOptions.validateInput` refuses to accept an Error
 *   severity; `InputBox.validationMessage` promises nothing of the kind, so the refusal is
 *   re-checked in `onDidAccept` here. Without it this box — the one where `pinPolicy` says the PIN
 *   is the ENTIRE secret on a server transport — would be the only one in the extension with no
 *   strength floor.</li>
 *   <li><b>The field stays editable after we write into it.</b> A generated PIN reaches the
 *   clipboard the moment it is drawn; a keystroke afterwards changes what gets SEALED and nothing
 *   else, and the box is masked, so the two diverge invisibly and the recipient's paste simply
 *   fails. So `generated` is <b>derived</b> — the value still equals the drawn string — rather than
 *   latched in a flag. A flag has to be remembered on every path that could change the text
 *   (a keystroke, a paste, an IME commit, our own assignment); a comparison cannot be forgotten.
 *   An edited value is a TYPED value, and takes the whole typed path, confirmation included.</li>
 *   <li><b>Nothing resolves unless we resolve it.</b> `onDidHide` answers `undefined` and disposes
 *   — on Escape it is the answer, and on the accept path it is a no-op after the real one, which
 *   is what disposes the box exactly once either way.</li>
 * </ol>
 */

const GENERATE = 'Generate a PIN and copy it';
const REVEAL = 'Show or hide the PIN';

/**
 * What a transit-secret box calls itself. The two callers differ in these two strings and in
 * NOTHING else — same generator, same reveal, same strength floor, same confirmation of a typed
 * value — which is the point: they ask for the same kind of secret, one that crosses to another
 * person out-of-band, once.
 */
export interface Wording {
  readonly title: string;
  readonly prompt: string;
  /**
   * What the reveal modal calls this secret. Here rather than hard-coded at the reveal because
   * that is the ONE surface the value itself appears on, and it used to say "this share" on the
   * export path — where nothing was shared and the box two steps earlier had called the very same
   * secret a password. One flow may not use two names for one secret.
   */
  readonly reveal: string;
};

export const SHARE_PIN: Wording = {
  title: 'One-time share PIN',
  prompt: 'Encrypts the shared item. Tell it to the recipient out-of-band.',
  reveal: 'The one-time PIN for this share. Read it to the recipient, then close this.',
};

export const EXPORT_PASSWORD: Wording = {
  title: 'Password for the export',
  prompt: 'Tell it to the recipient out-of-band — it is the only key to this file.',
  reveal: 'The password for this export. Read it to the recipient, then close this.',
};

/** The PIN to seal a share with, or nothing when the person backed out. */
export function chooseSharePin(): Promise<SharePin | undefined> {
  return chooseTransitPin(SHARE_PIN);
}

/**
 * The password to seal an exported file with, or nothing when the person backed out.
 *
 * <p>The same box, and that is the whole change: this one used to be a bare `showInputBox` with no
 * generator, no reveal, and — alone among the transit-secret boxes here — no confirmation of a
 * typed value, for a password that is the ONLY key to a file outliving the session. A typo was
 * discovered by the recipient who could not open it, long after the plaintext was gone.</p>
 */
export function chooseExportPassword(): Promise<SharePin | undefined> {
  return chooseTransitPin(EXPORT_PASSWORD);
}

async function chooseTransitPin(wording: Wording): Promise<SharePin | undefined> {
  const chosen = await askOnce(wording);
  return chosen === undefined || chosen.generated ? chosen : confirmTyped(wording, chosen);
}

interface Drawn {
  /** The last value this extension generated, '' when it has generated none. */
  value: string;
  /**
   * True once `accepted` has resolved with the drawn value ITSELF. It is what lets `onDidHide`
   * tell a cancellation from the hide `accepted` performs on its way out — the two are the same
   * event, and only one of them may leave the clipboard alone.
   */
  kept: boolean;
  /** Set the moment the box goes away: nothing may be written on its behalf after this. */
  closed: boolean;
  /**
   * Every draw this box has started, chained. Two jobs, and both were defects the code review
   * found: the cancel path AWAITS it, so a wipe can never run before the copy it is meant to undo
   * lands; and chaining serialises rapid redraws instead of racing them onto the clipboard.
   */
  pending: Promise<void>;
}

function askOnce(wording: Wording): Promise<SharePin | undefined> {
  return new Promise((resolve) => {
    const box = vscode.window.createInputBox();
    const drawn: Drawn = { value: '', kept: false, closed: false, pending: Promise.resolve() };
    box.title = wording.title;
    box.prompt = wording.prompt;
    box.password = true;
    box.ignoreFocusOut = true;
    box.buttons = [
      { iconPath: new vscode.ThemeIcon('sparkle'), tooltip: GENERATE },
      { iconPath: new vscode.ThemeIcon('eye'), tooltip: REVEAL },
    ];
    box.onDidTriggerButton((button) => void pressed(box, drawn, button));
    box.onDidChangeValue((value) => {
      box.validationMessage = pinValidator('choosing')(value);
      // The moment the text stops being the drawn string, that string seals nothing — and the
      // person may well go and paste before coming back to press Enter. Waiting for the box to
      // close was the whole window in which they could paste a PIN that opens nothing.
      if (drawn.value.length > 0 && value !== drawn.value) {
        const stale = drawn.value;
        drawn.value = '';
        void discard(stale);
      }
    });
    box.onDidAccept(() => accepted(box, drawn, resolve));
    box.onDidHide(() => {
      drawn.closed = true;
      resolve(undefined);
      // Every route out of this box that is not "the drawn value is the one being delivered" is a
      // cancellation for clipboard purposes: Escape, and an accepted value the person typed over
      // the draw. The repeat box is covered too, because `accepted` hides BEFORE `confirmTyped`
      // runs, so a mismatch or an Escape there has already been taken back by this line.
      if (!drawn.kept) {
        void discardAfterDraw(drawn);
      }
      box.dispose();
    });
    // Drawn before the box is shown, so it is never seen empty — `generateSharePin` is synchronous
    // and `box.value` is assigned before the copy is even started. The generator used to sit behind
    // a button, and VS Code renders `InputBox.buttons` as dimmed glyphs in the TITLE row: it
    // shipped, worked, was tested, and was not found. An affordance nobody sees is not one.
    startDraw(box, drawn);
    box.show();
  });
}

/** A button press: reveal is a toggle, anything else is a REdraw. */
async function pressed(
  box: vscode.InputBox,
  drawn: Drawn,
  button: vscode.QuickInputButton,
): Promise<void> {
  if (button.tooltip === REVEAL) {
    box.password = !box.password;
    return;
  }
  startDraw(box, drawn);
  await drawn.pending;
}

/**
 * Draw a PIN: the half that must happen NOW, and the half that has to wait its turn.
 *
 * <p>The split is load-bearing in both directions. Generating and putting the value in the field is
 * synchronous and runs before `box.show()`, so the box is never rendered empty — which is the whole
 * reason the pre-fill reads as a value rather than as a form still loading. The clipboard write is
 * the part that goes through the queue: chaining turns a rapid double-press into two ORDERED draws
 * instead of two writes whose landing order nobody controls, and it is what lets one await on
 * `drawn.pending` cover every copy this box has issued.</p>
 */
function startDraw(box: vscode.InputBox, drawn: Drawn): void {
  if (drawn.closed) {
    return;
  }
  const replaced = drawn.value;
  const pin = generateSharePin();
  // `drawn.value` is updated BEFORE the assignment below, because assigning `box.value` fires
  // `onDidChangeValue` — which would otherwise read our own write as the person editing the draw.
  drawn.value = pin.value;
  box.value = pin.value;
  drawn.pending = drawn.pending.then(() => copyDrawn(box, drawn, pin.value, replaced));
}

/** The queued half: put the drawn PIN on the clipboard, and say honestly whether it got there. */
async function copyDrawn(
  box: vscode.InputBox,
  drawn: Drawn,
  value: string,
  replaced: string,
): Promise<void> {
  const wasCopied = await copySafely(value);
  if (drawn.closed) {
    // The box went away while the OS was taking the copy. What landed belongs to an operation that
    // no longer exists — and the box is disposed, so its message must not be touched either.
    await discard(value);
    return;
  }
  if (!wasCopied) {
    // The new PIN never reached the clipboard, so the one it REPLACED may still be sitting there
    // while the box seals with the new one. The same silent shape as typing over the draw.
    await discard(replaced);
  }
  sayWhatWasDrawn(box, drawn, value, wasCopied);
}

/**
 * The line under the field, written only by the draw that still owns the box.
 *
 * <p>A copy that was superseded by a later draw — or typed over while it was in flight — would
 * otherwise describe a value the box no longer holds, which in a MASKED field is a sentence the
 * person has no way to check.</p>
 */
function sayWhatWasDrawn(
  box: vscode.InputBox,
  drawn: Drawn,
  value: string,
  wasCopied: boolean,
): void {
  if (drawn.value !== value) {
    return;
  }
  box.validationMessage = advice(wasCopied ? DRAWN : DRAWN_UNCOPIED);
}

/**
 * The cancel path's wipe, held until every copy this box started has landed.
 *
 * <p>Without the await this is the race the code review found from three directions at once:
 * Escape during the copy runs `clearIfUnchanged` against a clipboard that does not hold the PIN
 * YET, so it correctly declines to touch it — and then the copy lands, leaving a transit secret
 * for a share that was cancelled, written on behalf of a box that no longer exists.</p>
 */
async function discardAfterDraw(drawn: Drawn): Promise<void> {
  await drawn.pending;
  await discard(drawn.value);
}

/**
 * Take back a drawn value when the operation it was drawn for did not happen after all.
 *
 * <p>Exported because the export path's last cancellation point is nowhere near this file: the save
 * dialog is raised long AFTER the password is chosen, and a person who backs out of it — or a write
 * that fails — is left holding the password to a file that does not exist. Same invariant as every
 * route out of the box itself, just reached from further away.</p>
 *
 * <p>A TYPED value is never touched. It was never ours to copy, so it is not ours to erase.</p>
 */
export async function discardTransitPin(pin: SharePin): Promise<void> {
  if (pin.generated) {
    await discard(pin.value);
  }
}

/**
 * Take back a copy nobody asked for.
 *
 * <p>Under the button, every copy was the person's own act. Drawing on open makes it OURS, and that
 * changes what is owed: a drawn value must never outlive the operation it was drawn for. Four ways
 * it could — Escape, typing over the draw and accepting, cancelling the repeat box, and (in the
 * export path) cancelling the save dialog — and the second is silent. The clipboard would hold the
 * DRAWN value while the item was sealed with the TYPED one, so the recipient is sent a PIN that
 * looks right, opens nothing, and reports no error anywhere.</p>
 *
 * <p>`clearIfUnchanged` is what makes this safe rather than destructive: it touches the clipboard
 * only while it still holds exactly the string we put there, so work the person copied themselves
 * while the box was open is never wiped. Nothing here may throw — it runs from `onDidHide`, where
 * a rejection has nowhere to go.</p>
 */
async function discard(value: string): Promise<void> {
  if (value.length === 0) {
    return;
  }
  try {
    await clearIfUnchanged(vscode.env.clipboard, value);
  } catch {
    // A clipboard that cannot be read or written is one we cannot have left anything on either.
  }
}

/**
 * What the box says about a value it drew, and never a copy that did not happen.
 *
 * <p>`writeText` rejects on a machine with no clipboard provider or a locked session. The drawn
 * value is kept in the box regardless — throwing it away would be the worst of both — and the
 * person is pointed at the eye button, which is the way out that needs no clipboard at all.</p>
 *
 * <p>The second sentence of `DRAWN` is the discoverability fix itself: a pre-filled masked field
 * reads as a fixture rather than as something the person may replace unless it says so.</p>
 */
const DRAWN = 'Generated, and copied to your clipboard. Type over it to use your own.';
const DRAWN_UNCOPIED =
  'Generated, but copying to the clipboard failed — reveal it with the eye and copy it by hand.';

/** Enter: refuse what the policy refuses, and answer with what the value's ORIGIN actually is. */
function accepted(
  box: vscode.InputBox,
  drawn: Drawn,
  resolve: (pin: SharePin | undefined) => void,
): void {
  if (validatePin(box.value) !== undefined) {
    box.validationMessage = pinValidator('choosing')(box.value);
    return;
  }
  const untouched = drawn.value.length > 0 && box.value === drawn.value;
  drawn.kept = untouched;
  resolve(untouched ? { value: box.value, generated: true } : typedPin(box.value));
  box.hide();
}

function advice(message: string): vscode.InputBoxValidationMessage {
  return { message, severity: vscode.InputBoxValidationSeverity.Info };
}

const COPY_AGAIN = 'Copy again';
const SHOW_PIN = 'Show PIN';
const REVEAL_INSTEAD = 'Use Show PIN and copy it by hand.';
const COPY_FAILED = ` Copying it to the clipboard failed. ${REVEAL_INSTEAD}`;

/**
 * The end of the conversation: the share landed, and now the PIN has to reach a person.
 *
 * <p>Here rather than in `shareInbox` for the reason the prompt is: this file is where everything
 * SAID about a share PIN lives, and the two halves have to agree about what the person was
 * promised.</p>
 *
 * <p>Three decisions, and each of them was a defect in the first draft of the plan:</p>
 *
 * <ul>
 *   <li><b>The message never contains the PIN.</b> A notification is retained in the Notification
 *   Center until it is dismissed — `withheldNote` refuses to put anything but field NAMES there
 *   for exactly that reason. So the value is behind `Show PIN`, and that reveal is a
 *   <b>modal</b>: a dialog is transient and is gone when it is dismissed, which is the difference
 *   that makes offering it at all defensible.</li>
 *   <li><b>The clipboard is written again, here.</b> The 45-second wipe starts at the copy, and an
 *   unbounded amount of time passes between drawing the PIN and the share landing — other prompts,
 *   a slow transport. Re-copying restarts the window at the moment the person actually goes to
 *   paste, which is the only way the sentence about it is true when it is read.</li>
 *   <li><b>A typed PIN gets none of this.</b> It is already theirs; offering to re-copy something
 *   this extension never had would be a lie about where it came from.</li>
 * </ul>
 */
export function announceHandover(
  wording: Wording,
  headline: string,
  withheld: string,
  pin: SharePin,
): Promise<void> {
  return announce(vscode.window.showInformationMessage, wording, headline, withheld, pin, pin.generated);
}

/**
 * The same offer on the failure path, when SOMEBODY still received the share.
 *
 * <p>A partial failure is the sharpest case this feature has, and the first version of it walked
 * past: some recipients hold a sealed entry, the PIN is stored nowhere, and the window opened when
 * it was drawn may well have closed while delivery was running. An error message with no way to
 * reproduce the PIN leaves those recipients with something nobody alive can open. When NOTHING was
 * delivered there is nobody to give it to, and the offer would be noise.</p>
 */
export function announceDeliveredWithErrors(
  message: string,
  pin: SharePin,
  anyDelivered: boolean,
): Promise<void> {
  return announce(
    vscode.window.showErrorMessage,
    SHARE_PIN,
    message,
    '',
    pin,
    pin.generated && anyDelivered,
  );
}

/** What either terminal message does about the PIN. */
type Show = (message: string, ...actions: string[]) => Thenable<string | undefined>;

async function announce(
  show: Show,
  wording: Wording,
  headline: string,
  withheld: string,
  pin: SharePin,
  offer: boolean,
): Promise<void> {
  if (!offer) {
    void show(`${headline}${withheld}`);
    return;
  }
  // The clipboard sentence is composed HERE, from whether the copy actually happened, rather than
  // upstream from the intention to try it. Composing it earlier is how a message comes to promise
  // a clipboard that rejected.
  const notice = (await copySafely(pin.value)) ? sharePinNotice(pin, secretClipboardTtl()) : COPY_FAILED;
  const choice = await show(`${headline}${notice}${withheld}`, COPY_AGAIN, SHOW_PIN);
  await actOn(wording, choice, pin.value);
}

/**
 * Copy, and answer whether it worked.
 *
 * <p>Nothing here may throw. The share has ALREADY been delivered by the time this runs, and
 * `deliverBatch` carries a comment about precisely this trap two methods away: post-delivery
 * enrichment must never decide the outcome of an operation that already happened. An escaping
 * rejection would replace the success message with a generic command failure — for a share that
 * went through — and take the `Show PIN` offer down with it, which is the one route left to a PIN
 * the clipboard did not accept.</p>
 */
async function copySafely(value: string): Promise<boolean> {
  try {
    await copySecret(vscode.env.clipboard, value);
    return true;
  } catch {
    return false;
  }
}

async function actOn(wording: Wording, choice: string | undefined, value: string): Promise<void> {
  if (choice === COPY_AGAIN) {
    if (!(await copySafely(value))) {
      void vscode.window.showWarningMessage(`Copying failed. ${REVEAL_INSTEAD}`);
    }
    return;
  }
  if (choice === SHOW_PIN) {
    await vscode.window.showWarningMessage(value, { modal: true, detail: wording.reveal });
  }
}

/**
 * The second box, for a PIN a person invented. Both boxes or nothing: a mismatch answers
 * `undefined` rather than the first value, so a caller can never half-succeed into sealing a share
 * under something typed once by accident and never reproducible.
 */
async function confirmTyped(wording: Wording, pin: SharePin): Promise<SharePin | undefined> {
  const repeat = await vscode.window.showInputBox({
    title: wording.title,
    prompt: 'Repeat the PIN',
    password: true,
    ignoreFocusOut: true,
  });
  // Escape is not a mismatch. Telling somebody their PINs did not match when they simply backed
  // out describes a mistake they did not make, and sends them looking for a typo that is not there.
  if (repeat === undefined) {
    return undefined;
  }
  if (repeat !== pin.value) {
    void vscode.window.showErrorMessage('PINs do not match — cancelled.');
    return undefined;
  }
  return pin;
}
