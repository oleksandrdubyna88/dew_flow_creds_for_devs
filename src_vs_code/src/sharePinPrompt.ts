import * as vscode from 'vscode';
import { SharePin, generateSharePin, typedPin } from './sharePin';
import { copySecret } from './secretClipboard';
import { pinValidator } from './pinInput';
import { validatePin } from './pinPolicy';

/**
 * The one place the share PIN is asked for, in `vscode`'s words — the sibling of `pinPrompt.ts`,
 * and here for the same two reasons: everything decidable about a PIN is pure and tested
 * elsewhere, and the WORDING must live in one file or the box comes to say two different things.
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

const TITLE = 'One-time share PIN';
const PROMPT = 'Encrypts the shared item. Tell it to the recipient out-of-band.';
const GENERATE = 'Generate a PIN and copy it';
const REVEAL = 'Show or hide the PIN';

/** The PIN to seal a share with, or nothing when the person backed out. */
export async function chooseSharePin(): Promise<SharePin | undefined> {
  const chosen = await askOnce();
  return chosen === undefined || chosen.generated ? chosen : confirmTyped(chosen);
}

interface Drawn {
  /** The last value this extension generated, '' when it has generated none. */
  value: string;
}

function askOnce(): Promise<SharePin | undefined> {
  return new Promise((resolve) => {
    const box = vscode.window.createInputBox();
    const drawn: Drawn = { value: '' };
    box.title = TITLE;
    box.prompt = PROMPT;
    box.password = true;
    box.ignoreFocusOut = true;
    box.buttons = [
      { iconPath: new vscode.ThemeIcon('sparkle'), tooltip: GENERATE },
      { iconPath: new vscode.ThemeIcon('eye'), tooltip: REVEAL },
    ];
    box.onDidTriggerButton((button) => void pressed(box, drawn, button));
    box.onDidChangeValue((value) => {
      box.validationMessage = pinValidator('choosing')(value);
    });
    box.onDidAccept(() => accepted(box, drawn, resolve));
    box.onDidHide(() => {
      resolve(undefined);
      box.dispose();
    });
    box.show();
  });
}

/** A button press: reveal is a toggle, anything else is the generator. */
async function pressed(
  box: vscode.InputBox,
  drawn: Drawn,
  button: vscode.QuickInputButton,
): Promise<void> {
  if (button.tooltip === REVEAL) {
    box.password = !box.password;
    return;
  }
  const pin = generateSharePin();
  drawn.value = pin.value;
  // Assigning `value` fires `onDidChangeValue`, which sets the advisory message; the line below
  // therefore runs after it and is what the person is left reading.
  box.value = pin.value;
  box.validationMessage = await copyOrSayWhyNot(pin.value);
}

/**
 * Copy the drawn PIN, and never claim a copy that did not happen.
 *
 * <p>`writeText` rejects on a machine with no clipboard provider or a locked session. The drawn
 * value is kept in the box regardless — throwing it away would be the worst of both — and the
 * person is pointed at the eye button, which is the way out that needs no clipboard at all.</p>
 */
async function copyOrSayWhyNot(value: string): Promise<vscode.InputBoxValidationMessage> {
  try {
    await copySecret(vscode.env.clipboard, value);
    return advice('Generated, and copied to your clipboard.');
  } catch {
    return advice(
      'Generated, but copying to the clipboard failed — reveal it with the eye and copy it by hand.',
    );
  }
}

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
  resolve(untouched ? { value: box.value, generated: true } : typedPin(box.value));
  box.hide();
}

function advice(message: string): vscode.InputBoxValidationMessage {
  return { message, severity: vscode.InputBoxValidationSeverity.Info };
}

const COPY_AGAIN = 'Copy again';
const SHOW_PIN = 'Show PIN';

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
export async function announceShared(message: string, pin: SharePin): Promise<void> {
  if (!pin.generated) {
    void vscode.window.showInformationMessage(message);
    return;
  }
  await copySecret(vscode.env.clipboard, pin.value);
  const choice = await vscode.window.showInformationMessage(message, COPY_AGAIN, SHOW_PIN);
  await actOn(choice, pin.value);
}

async function actOn(choice: string | undefined, value: string): Promise<void> {
  if (choice === COPY_AGAIN) {
    await copySecret(vscode.env.clipboard, value);
    return;
  }
  if (choice === SHOW_PIN) {
    await vscode.window.showWarningMessage(value, {
      modal: true,
      detail: 'The one-time PIN for this share. Read it to the recipient, then close this.',
    });
  }
}

/**
 * The second box, for a PIN a person invented. Both boxes or nothing: a mismatch answers
 * `undefined` rather than the first value, so a caller can never half-succeed into sealing a share
 * under something typed once by accident and never reproducible.
 */
async function confirmTyped(pin: SharePin): Promise<SharePin | undefined> {
  const repeat = await vscode.window.showInputBox({
    title: TITLE,
    prompt: 'Repeat the PIN',
    password: true,
    ignoreFocusOut: true,
  });
  if (repeat !== pin.value) {
    void vscode.window.showErrorMessage('PINs do not match — cancelled.');
    return undefined;
  }
  return pin;
}
