import * as vscode from 'vscode';
import { EntityMetadata } from './types';
import { SshCommandOptions, buildSshCommand, describeSshTarget } from './sshCommand';

// Re-exported so existing callers keep one import site.
export { buildSshCommand, describeSshTarget };

// eslint-disable-next-line complexity -- pre-existing guards plus the options parameter; each clause is an independent usability check
export function openSshTerminal(
  entity: EntityMetadata,
  options: SshCommandOptions = {},
): vscode.Terminal | undefined {
  const command = buildSshCommand(entity, process.platform, options);
  const target = describeSshTarget(entity);
  if (command === undefined || target === undefined) {
    void vscode.window.showWarningMessage(
      `"${entity.name}" has no host configured — cannot start SSH.`,
    );
    return undefined;
  }

  const name = `SSH: ${target}`;
  const existing = vscode.window.terminals.find(
    (t) => t.name === name && t.exitStatus === undefined,
  );
  if (existing) {
    existing.show();
    return existing;
  }

  const terminal = vscode.window.createTerminal({ name });
  terminal.show();
  terminal.sendText(command, true);
  return terminal;
}
