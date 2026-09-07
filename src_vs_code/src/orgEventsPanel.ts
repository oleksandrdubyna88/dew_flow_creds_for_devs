import * as vscode from 'vscode';
import { EventTab, isEventPageMessage } from './eventTab';
import { OrgEventsClient } from './orgEventsClient';
import { StoredAccount } from './types';

/**
 * The **Event log** tab: the `vscode` half, and only that.
 *
 * <p>It creates the panel, routes its messages to `EventTab` and redraws when the tab comes back
 * into view. Everything that decides anything is in `eventTab.ts`, which imports no `vscode` and is
 * therefore a unit test — the split CLAUDE.md rule 3 asks for, and the reason this file has no
 * branches worth arguing about.</p>
 *
 * <p>The state lives in the TAB, not in the webview: VS Code throws a hidden panel's DOM away, so a
 * tab somebody switched away from and back would otherwise lose every page they had loaded.</p>
 */
export function showOrgEventLog(client: OrgEventsClient, account: StoredAccount): void {
  const panel = vscode.window.createWebviewPanel(
    'credSshOrgEvents',
    `CredsForDevs: Event log — ${account.email}`,
    vscode.ViewColumn.Active,
    { enableScripts: true, localResourceRoots: [] },
  );
  // A request in flight when somebody closes the tab still answers, and assigning to a disposed
  // webview throws — inside a promise nobody is awaiting, which is an unhandled rejection in the
  // extension host rather than anything a person sees. So the draw stops at the door.
  let closed = false;
  panel.onDidDispose(() => {
    closed = true;
  });
  const tab = new EventTab(client, account, (html) => {
    if (!closed) {
      panel.webview.html = html;
    }
  });
  panel.webview.onDidReceiveMessage((message: unknown) => {
    if (isEventPageMessage(message)) {
      void tab.handle(message);
    }
  });
  panel.onDidChangeViewState(() => {
    if (panel.visible) {
      tab.redraw();
    }
  });
  void tab.start();
}
