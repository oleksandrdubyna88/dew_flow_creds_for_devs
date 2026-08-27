import * as vscode from 'vscode';
import { copySecret } from './secretClipboard';
import { applyZoomDelta, currentUiScale, pushUiScaleTo } from './uiScaleHost';
import { BINDABLE_FIELDS, BindableField } from './envBinding';
import {
  CopyMessage,
  EntityViewOptions,
  copyValueFor,
  renderEntityViewHtml,
  snippetAnswer,
} from './entityViewPage';

export { EntityViewOptions } from './entityViewPage';

/**
 * Read-only entity viewer (opened by double-click): the edit form's layout with nothing
 * editable and no Save — just values and a Copy button per field. Secrets are shown masked and
 * are NEVER sent into the webview; their Copy buttons round-trip through the extension host,
 * which reads the value and writes it to the clipboard.
 *
 * <p>The markup itself lives in `entityViewPage.ts`, which imports no `vscode` and is therefore
 * testable — this file is the panel, its message loop and the clipboard.</p>
 */

// One webview's wiring: the panel, its message loop and the clipboard; the logic it used to
// hold moved to entityViewPage.ts, where it is tested.
// eslint-disable-next-line max-lines-per-function
export function showEntityView(options: EntityViewOptions): void {
  const panel = vscode.window.createWebviewPanel(
    'credSshEntityView',
    options.details.name,
    vscode.ViewColumn.Active,
    { enableScripts: true, localResourceRoots: [] },
  );
  panel.webview.html = renderEntityViewHtml({ ...options, uiScale: currentUiScale() });
  // T28: this page follows the shared setting for as long as it lives.
  const zoomHook = pushUiScaleTo(panel.webview);
  panel.onDidDispose(() => zoomHook.dispose());

  // eslint-disable-next-line complexity, max-lines-per-function
  panel.webview.onDidReceiveMessage(async (message: CopyMessage) => {
    const d = options.details;
    if (message.type === 'close') {
      panel.dispose();
      return;
    }
    if ((message as { type: string }).type === 'zoom') {
      await applyZoomDelta((message as unknown as { delta: number }).delta);
      return;
    }
    if (message.type === 'snippet') {
      // The same round-trip the form's highlighter makes: one highlighter, host-side, rather
      // than a second one living in a template string where nothing can check it.
      void panel.webview.postMessage(snippetAnswer(options, message.field));
      return;
    }
    if (message.type === 'totp') {
      // Asked for on load and again each time the shown code expires — computed here, from
      // the seed the host holds, so the page only ever sees the expiring result.
      const snapshot = await options.totp?.();
      if (snapshot !== undefined) {
        void panel.webview.postMessage({ type: 'totp', ...snapshot });
      }
      return;
    }
    if (message.type === 'env' || message.type === 'envcheck') {
      const field = message.field as BindableField;
      if (!(BINDABLE_FIELDS as readonly string[]).includes(field)) {
        return;
      }
      const bound = d.envBindings?.[field];
      if (bound === undefined) {
        return;
      }
      if (message.type === 'env') {
        await options.setEnv(field, bound);
      } else {
        options.checkEnv(bound);
      }
      return;
    }
    if (message.type === 'download' && message.field === 'vpnConfig') {
      await options.saveVpnConfig();
      return;
    }
    if (message.type === 'download' && (message.field === 'attachment' || message.field === 'image')) {
      await options.saveAttachment(message.field);
      return;
    }
    if (message.type !== 'copy') {
      return;
    }
    const value = await copyValueFor(options, message.field);
    if (value === undefined || value.length === 0) {
      void vscode.window.showWarningMessage('Nothing to copy — the field is empty.');
      return;
    }
    await copySecret(vscode.env.clipboard, value);
    void panel.webview.postMessage({ type: 'copied', field: message.field });
  });
}
