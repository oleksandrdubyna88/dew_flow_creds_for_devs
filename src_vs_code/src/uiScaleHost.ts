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

/** Apply one press. Clamped here — the page reports the press, never the result. */
export async function applyZoomDelta(delta: number): Promise<void> {
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
