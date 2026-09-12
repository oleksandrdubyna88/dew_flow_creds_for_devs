import * as vscode from 'vscode';
import { McpAccess, readMcpAccess } from './mcpAccess';
import { FolderFormOptions, renderFolderHtml } from './folderFormPage';
import { applyZoomDelta, currentUiScale, pushUiScaleTo } from './uiScaleHost';
import { FORM_WEBVIEW_OPTIONS, formPanels } from './formPanels';

/**
 * The folder form's webview: lifecycle and messages, no markup.
 *
 * <p>The split is `entityFormPanel.ts`'s, for the same reason — the page is a pure function that
 * a test can render, and this half never learns what a fieldset looks like.</p>
 */

export type { FolderFormOptions };

export interface FolderFormValues {
  name: string;
  /**
   * `undefined` means the folder still has no answer of its own.
   *
   * <p>The same absent-versus-empty distinction the entity form carries: a folder that has never
   * been given a setting must not acquire one merely because somebody opened this form and
   * pressed Save. The page script decides that — see `mcpSwitchScript` — and this half only
   * passes on what it said.</p>
   */
  mcp?: McpAccess;
}

interface FolderFormMessage {
  type: 'save' | 'cancel' | 'zoom';
  data?: { name?: unknown; mcp?: unknown };
  /** `zoom` only (T28): which way the press went. The page reports the press, the host clamps. */
  delta?: number;
}

/**
 * A text-size press, handled and reported as handled (T28).
 *
 * <p>Its own function, in the shape `entityFormPanel`'s `answerRoundTrip` has: a press is
 * neither a save nor a cancel, and falling through to either of them would CLOSE a form
 * somebody was filling in — a far worse defect than a size that does not change.</p>
 */
function answeredZoom(message: FolderFormMessage): boolean {
  if (message.type !== 'zoom') {
    return false;
  }
  void applyZoomDelta(message.delta);
  return true;
}

export function showFolderForm(options: FolderFormOptions): Promise<FolderFormValues | undefined> {
  const panel = vscode.window.createWebviewPanel(
    'credSshFolderForm',
    `Folder: ${options.name}`,
    vscode.ViewColumn.Active,
    FORM_WEBVIEW_OPTIONS,
  );
  // No secret of its own, but it is closed on lock with the entity form all the same: two
  // forms with two different answers to "does a lock reach this" is a rule nobody can state.
  const unregister = formPanels.register(panel);
  // The scale is read HERE rather than asked of the caller: everything that opens a folder form
  // describes a folder, and none of it should have to know that a page has a text size. Mirrors
  // `mountForm` in `entityFormHost.ts`, which is the shape this page was missing (#53).
  panel.webview.html = renderFolderHtml({ ...options, uiScale: currentUiScale() });
  // T28: this page follows the shared setting for as long as it lives.
  const zoomHook = pushUiScaleTo(panel.webview);
  panel.onDidDispose(() => zoomHook.dispose());

  return new Promise((resolve) => {
    let settled = false;
    panel.webview.onDidReceiveMessage((message: FolderFormMessage) => {
      if (answeredZoom(message)) {
        return;
      }
      if (message.type === 'cancel') {
        panel.dispose();
        return;
      }
      settled = true;
      resolve(readValues(message.data ?? {}));
      panel.dispose();
    });
    panel.onDidDispose(() => {
      unregister();
      if (!settled) {
        resolve(undefined);
      }
    });
  });
}

/** Everything from a webview is untrusted input, including a message this extension sent for. */
export function readValues(data: { name?: unknown; mcp?: unknown }): FolderFormValues {
  return {
    name: typeof data.name === 'string' ? data.name.trim() : '',
    mcp: readMcpAccess(data.mcp),
  };
}
