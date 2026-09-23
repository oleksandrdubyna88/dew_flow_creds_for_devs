import * as vscode from 'vscode';
import { TrustStore, confirmCommandMessage, isCommandTrusted, trustCommand } from './commandTrust';

/**
 * Read before it runs, once per exact line per machine — the modal half of `commandTrust.ts`.
 *
 * <p>One helper for every place a stored line is about to run: *Run in Terminal*, a VPN's launcher
 * (issue #103). The justification for running unconfirmed was "these are commands you wrote
 * yourself" — true until sync and Accept Share, both of which can deliver a command entry from
 * somewhere else, under a name the reader has no reason to distrust.</p>
 */
export async function confirmTrusted(store: TrustStore, entityId: string, entityName: string, line: string): Promise<boolean> {
  if (isCommandTrusted(store, entityId, line)) {
    return true;
  }
  const choice = await vscode.window.showWarningMessage(confirmCommandMessage(entityName, line), { modal: true }, 'Run');
  if (choice !== 'Run') {
    return false;
  }
  await trustCommand(store, entityId, line);
  return true;
}
