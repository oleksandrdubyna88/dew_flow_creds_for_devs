import * as vscode from 'vscode';
import { PinFeedback, PinScope, pinFeedback } from './pinPolicy';

/**
 * `pinFeedback` in the shape `showInputBox` wants — the only `vscode` in the PIN story.
 *
 * <p>Everything decidable lives in `pinPolicy.ts`, pure and tested; what remains here is one
 * enum mapping. `Error` blocks Enter exactly as the plain-string `validateInput` contract did,
 * so the six input boxes that switched to this lost nothing; `Information` is how the live
 * crack-time estimate appears WITHOUT blocking — the half of audit item 3 that was documented
 * as shipped while nothing called it (PLAN_tails T1).</p>
 *
 * <p>`scope` defaults to `vault` (issue #55): a box that asks for an ENTRY's PIN says `'entry'` and
 * gets the four-character floor; a box that forgets to say gets the vault's rules, which is the
 * safe direction — a share PIN accidentally judged as an entry PIN would be the defect, and the
 * default makes it impossible to write by omission.</p>
 */
export function pinValidator(
  mode: 'choosing' | 'entering',
  scope: PinScope = 'vault',
): (value: string) => vscode.InputBoxValidationMessage | undefined {
  return (value) => toValidationMessage(pinFeedback(value, mode, scope));
}

function toValidationMessage(
  feedback: PinFeedback | undefined,
): vscode.InputBoxValidationMessage | undefined {
  if (feedback === undefined) {
    return undefined;
  }
  return {
    message: feedback.message,
    severity:
      feedback.kind === 'error'
        ? vscode.InputBoxValidationSeverity.Error
        : vscode.InputBoxValidationSeverity.Info,
  };
}
