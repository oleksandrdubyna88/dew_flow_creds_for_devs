import * as vscode from 'vscode';
import { OrgRecoveryClient } from './orgRecoveryClient';
import { renderServerMetricsHtml } from './serverMetricsPage';
import { StoredAccount } from './types';
import { describeError } from './describeError';

/**
 * *Server Metrics…* — the officers' page (server-ops item 5). Reads the one JSON document from
 * the account's server and shows it in a tab; whoever is not on the roster gets the server's
 * own 403, in words.
 */
export async function runServerMetrics(
  account: StoredAccount,
  clientFor: (account: StoredAccount) => OrgRecoveryClient | undefined,
): Promise<void> {
  const client = clientFor(account);
  if (client === undefined) {
    void vscode.window.showInformationMessage(`${account.email} does not sync through a server — there are no server metrics to read.`);
    return;
  }
  try {
    const metrics = await client.readMetrics(account);
    const panel = vscode.window.createWebviewPanel(
      'credSshServerMetrics',
      `Server metrics — ${client.location}`,
      vscode.ViewColumn.Active,
      { enableScripts: false, localResourceRoots: [] },
    );
    panel.webview.html = renderServerMetricsHtml({
      location: client.location,
      officerEmail: account.email,
      metrics,
      readAt: Date.now(),
    });
  } catch (error) {
    void vscode.window.showErrorMessage(`Server metrics: ${describeError(error)}`);
  }
}
