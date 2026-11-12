import * as vscode from 'vscode';
import { EntityMetadata } from './types';
import { DepColorKey } from './depColors';
import { folderColorOption } from './terminalColor';
import { SshCommandOptions, buildSshCommand, describeSshTarget, noHostSentence } from './sshCommand';
import { composedShellPath } from './pinnedTerminal';
import { claimSshTerminal, isSshTerminalOf } from './sshTerminalOwners';
import { entryTerminalKey, sshTerminalTitle } from './terminalTitles';

// Re-exported so existing callers keep one import site.
export { buildSshCommand, describeSshTarget };

/** What an SSH terminal shows, and whose it is: the tab, and the account of the entry it is opened for. */
export interface SshTerminalPlace {
  readonly title: string;
  readonly accountId: string;
  /** The folder's colour, when it has one: the new terminal wears it (VS Code fixes it at creation). */
  readonly color?: DepColorKey;
}

/**
 * @param platform the platform whose SHELL will parse this line — the TERMINAL's, not the extension
 *   host's. They are the same machine only in a local window: `extensionKind: ["ui"]` keeps the host
 *   on the local computer while `createTerminal` opens the WINDOW's profile, so in a WSL window this
 *   read `process.platform` and composed Windows quoting and a `C:\…\ssh.exe` program word for a
 *   bash shell. Defaulted, so the local callers are unchanged.
 * @param prefix an `env NAME='value' ` prefix from `envPrefix`, or empty. It points ONE command at
 *   the WSL agent relay's socket without touching the window-wide environment collection, which has
 *   no per-shell scope and so cannot serve a Windows terminal and a WSL one at the same time.
 * @param place the tab and the account: `title` is built by `sshTerminalTitle` from the entry's folder and name
 *   (`connectEntity` reads the folder from storage), and is ONLY what the tab shows. A live terminal is reused when
 *   this window opened it for the same entry of the same account (`sshTerminalOwners`), whatever its title — so after a
 *   move the entry's own session still comes forward, and a same-named entry never gets it. Without a place the tab
 *   is the entry name alone and the account is empty.
 */
// eslint-disable-next-line complexity -- pre-existing guards plus the options parameter; each clause is an independent usability check
export function openSshTerminal(
  entity: EntityMetadata,
  options: SshCommandOptions = {},
  platform: NodeJS.Platform = process.platform,
  prefix = '',
  place: SshTerminalPlace = { title: sshTerminalTitle(entryTerminalKey(entity.name, undefined)), accountId: '' },
): vscode.Terminal | undefined {
  const command = buildSshCommand(entity, platform, options);
  const target = describeSshTarget(entity);
  if (command === undefined || target === undefined) {
    void vscode.window.showWarningMessage(noHostSentence(entity.name));
    return undefined;
  }

  const existing = vscode.window.terminals.find(
    (t) => t.exitStatus === undefined && isSshTerminalOf(t, place.accountId, entity.id),
  );
  if (existing) {
    existing.show();
    return existing;
  }

  // The line is composed for `platform`; in a local window that is this machine, so its shell is
  // pinned — a Windows ssh line typed into a WSL-bash default profile is issue #103 again.
  const terminal = vscode.window.createTerminal({ name: place.title, shellPath: composedShellPath(), ...folderColorOption(place.color) });
  claimSshTerminal(terminal, place.accountId, entity.id);
  terminal.show();
  terminal.sendText(`${prefix}${command}`, true);
  return terminal;
}

