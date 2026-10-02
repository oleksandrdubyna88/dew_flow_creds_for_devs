import * as vscode from 'vscode';
import { PinGate } from './pinGate';
import { coolingAmong, coolingReason } from './pinAttempts';
import { pinValidator } from './pinInput';
import { PinScope } from './pinPolicy';
import { admit } from './pinAdmission';
import { healKeptVersions } from './historyHeal';
import { settleRelease } from './rotationWaiting';
import type { Release } from './rotationQuarantine';
import { StorageManager } from './storageManager';

/**
 * The one place an entry's PIN is asked for, in `vscode`'s words.
 *
 * <p>Its own module for the reason `pinInput.ts` is: everything else in the PIN story is pure and
 * therefore tested, and this is the thin edge that cannot be. It is also the one place the wording
 * lives, so the box says the same thing whichever surface opened it.</p>
 */

/**
 * A gate for one entry, with the prompt wired to a real input box.
 *
 * <p>`purpose` is what the box says pressing OK will do — <i>"edit it"</i>, <i>"copy its password"</i>
 * — and `pinGate.pinPromptFor` turns it into the sentence; the gate only carries it. Absent, the
 * generic question is asked, which is what every surface said before the entry-PIN plan.</p>
 */
export function entryPinGate(accountId: string, entityId: string, entryName: string, purpose?: string): PinGate {
  return {
    accountId,
    entityId,
    entryName,
    purpose,
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
export async function newPin(
  subject: string,
  scope: PinScope = 'vault',
  prompt: string = NEW_PIN,
  token?: vscode.CancellationToken,
): Promise<string | undefined> {
  const first = await vscode.window.showInputBox({
    title: `A PIN for "${subject}"`,
    prompt,
    password: true,
    ignoreFocusOut: true,
    // The scope is the CALLER's to state, and the default is the stricter one. This used to be
    // hardcoded to `entry` because every caller was an entry PIN (issue #55) — and a caller added
    // later that wanted the vault's floor would have got the four-character one in silence, which
    // is the one direction a PIN policy must never drift in.
    validateInput: pinValidator('choosing', scope),
  }, token);
  return typedNothing(first) ? undefined : confirmed(subject, first as string, token);
}

/** Dismissed, or an empty box: either way there is no PIN to confirm and nothing to wrap. */
function typedNothing(value: string | undefined): boolean {
  return value === undefined || value.length === 0;
}

/** The second box. A mismatch answers `undefined`, so a caller can never half-succeed. */
async function confirmed(subject: string, first: string, token?: vscode.CancellationToken): Promise<string | undefined> {
  const again = await vscode.window.showInputBox({
    title: `A PIN for "${subject}"`,
    prompt: 'Type it once more. There is no way to recover it.',
    password: true,
    ignoreFocusOut: true,
    validateInput: (value) => (value === first ? undefined : 'The two do not match.'),
  }, token);
  return again === first ? first : undefined;
}

/**
 * D16 at a sibling check (§5.10): while any of the protected entries a folder-wide PIN would be tried
 * on is cooling, the check cannot be run — a cooling entry opens for nobody, so it would report
 * "opens none" and invite a new entry sealed under a PIN nothing verified. So it refuses before any
 * box is raised, and says which entry is cooling and for how long. Answers whether it refused.
 */
export function refusedWhileCooling(accountId: string, siblings: readonly { readonly id: string; readonly name: string }[]): boolean {
  const cooling = coolingAmong(accountId, siblings);
  if (cooling !== undefined) {
    void vscode.window.showWarningMessage(coolingReason(cooling.ms, cooling.entry.name));
  }
  return cooling !== undefined;
}

const NEW_PIN =
  'This PIN wraps every secret this entry holds. It is stored NOWHERE — not here, not in a backup, '
  + 'not in the sync — so a forgotten PIN means the values are gone. The vault recovery code opens '
  + 'the VAULT; it does not open an entry.';

/**
 * The door before a read: ask this entry's PIN when it has one, and answer the gate that opens its
 * values — or `undefined`, having said why. Declining says nothing more (the person chose); a wrong
 * PIN says the gate's own reason. The viewer and *Open Site in Browser* (issue #104) both stand here;
 * it was written out at each until then. `purpose` names what the click will do (`entryPinGate`).
 */
export async function admitEntry(
  storage: StorageManager,
  accountId: string,
  entityId: string,
  entryName: string,
  purpose?: string,
): Promise<PinGate | undefined> {
  return (await admitted(storage, accountId, entityId, entryName, purpose))?.gate;
}

/**
 * `admitEntry`, saying also what the door RELEASED — a rotated value that waited beside the entry and is in a
 * slot now (`rotationQuarantine.ts`). A click that read its value before the door reads it again from this
 * (`pinClick.clickOpener`; the security review, finding 2): the value it holds is the one the door replaced.
 */
export async function admitted(
  storage: StorageManager,
  accountId: string,
  entityId: string,
  entryName: string,
  purpose?: string,
): Promise<{ readonly gate: PinGate; readonly release: Release } | undefined> {
  const gate = entryPinGate(accountId, entityId, entryName, purpose);
  const admission = await admit(storage, accountId, entityId, gate);
  if (admission.kind === 'refused') {
    void vscode.window.showWarningMessage(admission.reason);
  }
  if (admission.kind !== 'in') {
    return undefined;
  }
  healKeptVersions(storage, accountId, entityId, entryName);
  // A rotated value that waited beside the entry went in at the door: said, and a conflict asked (§4.6).
  return { gate, release: await settleRelease(storage, accountId, entityId, entryName, admission) };
}
