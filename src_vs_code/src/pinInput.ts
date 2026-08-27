import * as vscode from 'vscode';
import { PinFeedback, pinFeedback } from './pinPolicy';

/**
 * `pinFeedback` in the shape `showInputBox` wants — the only `vscode` in the PIN story.
 *
 * <p>Everything decidable lives in `pinPolicy.ts`, pure and tested; what remains here is one
 * enum mapping. `Error` blocks Enter exactly as the plain-string `validateInput` contract did,
 * so the six input boxes that switched to this lost nothing; `Information` is how the live
 * crack-time estimate appears WITHOUT blocking — the half of audit item 3 that was documented
 * as shipped while nothing called it (PLAN_tails T1).</p>
 */
export function pinValidator(
  mode: 'choosing' | 'entering',
): (value: string) => vscode.InputBoxValidationMessage | undefined {
  return (value) => toValidationMessage(pinFeedback(value, mode));
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
