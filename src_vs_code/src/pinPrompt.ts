import * as vscode from 'vscode';
import { PinGate } from './pinGate';
import { pinValidator } from './pinInput';

/**
 * The one place an entry's PIN is asked for, in `vscode`'s words.
 *
 * <p>Its own module for the reason `pinInput.ts` is: everything else in the PIN story is pure and
 * therefore tested, and this is the thin edge that cannot be. It is also the one place the wording
 * lives, so the box says the same thing whichever surface opened it.</p>
 */

/** A gate for one entry, with the prompt wired to a real input box. */
export function entryPinGate(accountId: string, entityId: string, entryName: string): PinGate {
  return {
    accountId,
    entityId,
    entryName,
    ask: (prompt, name) =>
      vscode.window.showInputBox({
        title: `PIN for "${name}"`,
        prompt,
        password: true,
        ignoreFocusOut: true,
        // `entry`, not the vault default: the second lock has its own floor (issue #55, `pinPolicy.ts`).
        // `entering`, not `choosing`: this box takes a PIN that already exists, so it must not
        // lecture somebody about the strength of a value they cannot change from here.
        validateInput: pinValidator('entering', 'entry'),
      }),
  };
}

/**
 * A NEW pin: typed twice, because there is nothing to check it against.
 *
 * <p>Both boxes or nothing — a mismatch returns `undefined` rather than the first value, so a
 * caller cannot half-succeed into wrapping something under a PIN the person typed once by
 * accident and could never reproduce. (A reviewer asked for the mismatch outcome to be named;
 * it is this, and it is checked before anything is written.)</p>
 *
 * <p>Here rather than in `pinCommands` because the accept flow needs the same two boxes with the
 * same wording, and a second copy is how the two would come to disagree about the stakes.</p>
 */
export async function newPin(subject: string, prompt: string = NEW_PIN): Promise<string | undefined> {
  const first = await vscode.window.showInputBox({
    title: `A PIN for "${subject}"`,
    prompt,
    password: true,
    ignoreFocusOut: true,
    // The entry scope (issue #55): one entry's second lock, behind an open vault — not the vault's rule.
    validateInput: pinValidator('choosing', 'entry'),
  });
  return first === undefined || first.length === 0 ? undefined : confirmed(subject, first);
}

/** The second box. A mismatch answers `undefined`, so a caller can never half-succeed. */
async function confirmed(subject: string, first: string): Promise<string | undefined> {
  const again = await vscode.window.showInputBox({
    title: `A PIN for "${subject}"`,
    prompt: 'Type it once more. There is no way to recover it.',
    password: true,
    ignoreFocusOut: true,
    validateInput: (value) => (value === first ? undefined : 'The two do not match.'),
  });
  return again === first ? first : undefined;
}

const NEW_PIN =
  'This PIN wraps every secret this entry holds. It is stored NOWHERE — not here, not in a backup, '
  + 'not in the sync — so a forgotten PIN means the values are gone. The vault recovery code opens '
  + 'the VAULT; it does not open an entry.';
