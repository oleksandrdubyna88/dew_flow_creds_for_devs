import * as vscode from 'vscode';
import { EntityMetadata } from './types';
import { SshCommandOptions, buildSshCommand, describeSshTarget } from './sshCommand';

// Re-exported so existing callers keep one import site.
export { buildSshCommand, describeSshTarget };

/**
 * @param platform the platform whose SHELL will parse this line — the TERMINAL's, not the extension
 *   host's. They are the same machine only in a local window: `extensionKind: ["ui"]` keeps the host
 *   on the local computer while `createTerminal` opens the WINDOW's profile, so in a WSL window this
 *   read `process.platform` and composed Windows quoting and a `C:\…\ssh.exe` program word for a
 *   bash shell. Defaulted, so the local callers are unchanged.
 * @param prefix an `env NAME='value' ` prefix from `envPrefix`, or empty. It points ONE command at
 *   the WSL agent relay's socket without touching the window-wide environment collection, which has
 *   no per-shell scope and so cannot serve a Windows terminal and a WSL one at the same time.
 */
// eslint-disable-next-line complexity -- pre-existing guards plus the options parameter; each clause is an independent usability check
export function openSshTerminal(
  entity: EntityMetadata,
  options: SshCommandOptions = {},
  platform: NodeJS.Platform = process.platform,
  prefix = '',
): vscode.Terminal | undefined {
  const command = buildSshCommand(entity, platform, options);
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
  terminal.sendText(`${prefix}${command}`, true);
  return terminal;
}

