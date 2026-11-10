import * as vscode from 'vscode';
import { EntityMetadata } from './types';
import { SshCommandOptions, buildSshCommand, describeSshTarget } from './sshCommand';
import { composedShellPath } from './pinnedTerminal';
import { claimSshTerminal, isSshTerminalOf } from './sshTerminalOwners';
import { entryTerminalKey, sshTerminalTitle } from './terminalTitles';

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
 * @param title the tab, built by `sshTerminalTitle` from the entry's folder and name (`connectEntity` reads the folder
 *   from storage). It is also the lookup key, so a live terminal is reused only when this window opened it for the
 *   same entry (`sshTerminalOwners`). Defaulted to the entry name alone, without a folder.
 */
// eslint-disable-next-line complexity -- pre-existing guards plus the options parameter; each clause is an independent usability check
export function openSshTerminal(
  entity: EntityMetadata,
  options: SshCommandOptions = {},
  platform: NodeJS.Platform = process.platform,
  prefix = '',
  title = sshTerminalTitle(entryTerminalKey(entity.name, undefined)),
): vscode.Terminal | undefined {
  const command = buildSshCommand(entity, platform, options);
  const target = describeSshTarget(entity);
  if (command === undefined || target === undefined) {
    void vscode.window.showWarningMessage(
      `"${entity.name}" has no host configured — cannot start SSH.`,
    );
    return undefined;
  }

  const existing = vscode.window.terminals.find(
    (t) => t.name === title && t.exitStatus === undefined && isSshTerminalOf(t, entity.id),
  );
  if (existing) {
    existing.show();
    return existing;
  }

  // The line is composed for `platform`; in a local window that is this machine, so its shell is
  // pinned — a Windows ssh line typed into a WSL-bash default profile is issue #103 again.
  const terminal = vscode.window.createTerminal({ name: title, shellPath: composedShellPath() });
  claimSshTerminal(terminal, entity.id);
  terminal.show();
  terminal.sendText(`${prefix}${command}`, true);
  return terminal;
}

