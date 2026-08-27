import * as vscode from 'vscode';
import { McpAccess, readMcpAccess } from './mcpAccess';
import { FolderFormOptions, renderFolderHtml } from './folderFormPage';
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
  type: 'save' | 'cancel';
  data?: { name?: unknown; mcp?: unknown };
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
  panel.webview.html = renderFolderHtml(options);

  return new Promise((resolve) => {
    let settled = false;
    panel.webview.onDidReceiveMessage((message: FolderFormMessage) => {
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
