import * as vscode from 'vscode';
import { clampScale, offsetLabel, scalePx } from './zoomControl';

/**
 * The host half of the ± text zoom (tails T28): read the setting, apply a press, keep every
 * open page in step.
 *
 * <p>The value is `credSshManager.uiScale` — global scope, so it syncs. A press from any page
 * lands here, is clamped, and is WRITTEN; the write raises `onDidChangeConfiguration`, and
 * every panel that registered through {@link pushUiScaleTo} repaints from the one stored value.
 * That is the "two open pages never show two sizes" guarantee: there is no per-panel state to
 * disagree.</p>
 */

const SECTION = 'credSshManager';
const KEY = 'uiScale';

export function currentUiScale(): number {
  return clampScale(vscode.workspace.getConfiguration(SECTION).get(KEY));
}

/**
 * Apply one press. Clamped here — the page reports the press, never the result.
 *
 * <p>A delta that is not a finite number is IGNORED rather than clamped. `Math.sign(NaN)` is NaN
 * and `clampScale(NaN)` is 0, so a malformed press would have WRITTEN the base size — silently
 * undoing five presses somebody made on purpose. Four pages post this message and every one of
 * them is a webview, so the guard belongs here, once, rather than in each page script.</p>
 *
 * <p>It takes `unknown` for the same reason, and that is why the call sites hand over
 * `message.delta` exactly as it arrived. They used to spell it `message.delta ?? 0`, which turned
 * a `{type:'zoom'}` carrying no delta into a real write of the size already stored — and the
 * write raises `onDidChangeConfiguration`, so every open page is pushed a `uiScale` it already
 * has, for a press that said nothing. A message with no delta is not a press.</p>
 */
export async function applyZoomDelta(delta: unknown): Promise<void> {
  if (typeof delta !== 'number' || !Number.isFinite(delta)) {
    return;
  }
  const next = clampScale(currentUiScale() + Math.sign(delta));
  await vscode.workspace
    .getConfiguration(SECTION)
    .update(KEY, next, vscode.ConfigurationTarget.Global);
}

/**
 * Keep one webview's text size in step with the setting for as long as it lives.
 * Posts immediately and on every change; the returned disposable unhooks the listener.
 */
export function pushUiScaleTo(webview: vscode.Webview): vscode.Disposable {
  const push = (): void => {
    const offset = currentUiScale();
    void webview.postMessage({ type: 'uiScale', px: scalePx(offset), label: offsetLabel(offset) });
  };
  push();
  return vscode.workspace.onDidChangeConfiguration((change) => {
    if (change.affectsConfiguration(`${SECTION}.${KEY}`)) {
      push();
    }
  });
}
