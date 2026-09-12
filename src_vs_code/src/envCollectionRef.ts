import * as vscode from 'vscode';
import { EnvApplyResult, envAppliedNotice } from './envApplyNotice';

/**
 * The window's environment-variable collection, kept where every command module can reach it.
 * Set once in `activate`; read where a secret is exposed as a terminal variable or the bindings
 * of an entry are re-applied. It used to be a module-level `let` in `extension.ts`, which is the
 * one place a function moved out of that file could not see.
 */
let collection: vscode.GlobalEnvironmentVariableCollection | undefined;

export function setEnvCollection(value: vscode.GlobalEnvironmentVariableCollection): void {
  collection = value;
}

export function envCollection(): vscode.GlobalEnvironmentVariableCollection {
  if (collection === undefined) {
    throw new Error('The environment collection is read before activate set it.');
  }
  return collection;
}

/**
 * Say what applying the bindings did — the one sentence pair, on every surface that applies one:
 * the create, the edit, and the viewer's `ENV` button (issue #48). Nothing is said for a save that
 * bound nothing, so the notice never becomes noise on an ordinary save.
 *
 * <p>Here and not in `envApply.ts`, deliberately. That module names `vscode` only in TYPE positions,
 * so the compiler elides the import and the module is pure at run time — which is what lets
 * `wovenPasswordForm.test.ts` and its neighbours import `automaticRefusal` with no stub. A single
 * `vscode.window` call there brought the `require` back and failed those tests at load. The
 * sentences themselves are `envApplyNotice.ts`, pure and tested; this is only the edge.</p>
 */
export function showEnvNotice(result: EnvApplyResult): void {
  const notice = envAppliedNotice(result);
  if (notice.info !== undefined) {
    void vscode.window.showInformationMessage(notice.info);
  }
  if (notice.warning !== undefined) {
    void vscode.window.showWarningMessage(notice.warning);
  }
}
