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
        // `entering`, not `choosing`: this box takes a PIN that already exists, so it must not
        // lecture somebody about the strength of a value they cannot change from here.
        validateInput: pinValidator('entering'),
      }),
  };
}
