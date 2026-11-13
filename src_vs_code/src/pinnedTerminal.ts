import * as fs from 'node:fs';
import * as vscode from 'vscode';
import {
  EntryShell,
  HostShell,
  ShellContext,
  ShellFamily,
  entryShell,
  hostShell,
  pinnedShellRefusal,
  readerFamily,
  windowKind,
} from './hostShell';
import { onPath } from './installFlow';
import { EntryTerminalKey, entryTerminalTitle } from './terminalTitles';
import { DepColorKey } from './depColors';
import { folderColorOption } from './terminalColor';

/**
 * The `vscode` half of "which shell reads this line" (issue #103); the decisions are `hostShell.ts`.
 *
 * <p>`createTerminal({ name })` opens the window's default profile, which is the person's choice for
 * their own typing — WSL bash, Git-bash, cmd — and says nothing about the syntax of a line composed
 * for this platform. Every terminal that runs a line the extension COMPOSES is opened here with the
 * host's native shell as `shellPath`, so `Start-Process` reaches PowerShell whatever the default is.
 * A Terminal entry's OWN line goes through `findEntryTerminal` / `openEntryTerminal`, which ask `entryShell` instead.</p>
 */
export type PinnedTerminal =
  | { ok: true; terminal: vscode.Terminal; shell: HostShell }
  | { ok: false; reason: string };

let cachedShell: HostShell | undefined;

/** The shell a composed line is for on this machine — `pwsh` looked up once per session. */
export function pinnedShell(): HostShell {
  cachedShell ??= hostShell(process.platform, fs.existsSync, process.platform === 'win32' && onPath('pwsh.exe'));
  return cachedShell;
}

/** The editor's three facts `entryShell` decides from. */
export function shellContext(): ShellContext {
  return { platform: process.platform, remoteName: vscode.env.remoteName, defaultShell: vscode.env.shell };
}

/** Why a pinned terminal cannot be opened in this window, or `undefined` when it can. */
export function pinnedRefusal(): string | undefined {
  return pinnedShellRefusal(vscode.env.remoteName);
}

/**
 * The shell to pin for a line composed for THIS platform in this window — or `undefined` for the
 * default profile. Local: the native shell. A WSL window composes for Linux (`terminalPlatform`), and
 * its default profile is that Linux shell, so nothing is pinned there. Used by SSH connect, whose
 * refusal of another computer's window is its own (`remoteRoute`).
 */
export function composedShellPath(): string | undefined {
  return windowKind(vscode.env.remoteName) === 'local' ? pinnedShell().shellPath : undefined;
}

/**
 * The shell that READS a typed ssh line (E2-D7 of `PLAN_terminal_command_over_ssh.md`): the pinned native shell in a
 * local window, else the window's default profile, which in a WSL window is a posix shell. It feeds only `typedLine`'s
 * PowerShell 5.1 check; the quoting of the line itself follows the platform of the prepared session.
 */
export function sshReaderShell(): HostShell {
  return composedShellPath() === undefined ? { shellPath: vscode.env.shell ?? '', family: 'posix' } : pinnedShell();
}

export interface PinnedOptions {
  /** Only settable at creation, so a terminal given one is never reused (see `runScript`). */
  env?: Record<string, string>;
  /** Dispose a live terminal of this name first — a script re-run must not inherit old values. */
  fresh?: boolean;
  /** The folder's colour. Like `env`, only settable at creation: a terminal that is found keeps the colour it was made with. */
  color?: DepColorKey;
}

export function pinnedTerminal(name: string, options: PinnedOptions = {}): PinnedTerminal {
  const refusal = pinnedRefusal();
  if (refusal !== undefined) {
    return { ok: false, reason: refusal };
  }
  const shell = pinnedShell();
  const terminal =
    reusableTerminal(name, shell, options) ??
    vscode.window.createTerminal({ name, shellPath: shell.shellPath, env: options.env, ...folderColorOption(options.color) });
  terminal.show();
  return { ok: true, terminal, shell };
}

/**
 * Open a pinned terminal and type one composed line into it — `false`, having said why, when this
 * window may not. The shape every composed-line caller had written out for itself.
 */
export function sendPinned(name: string, line: string, options: PinnedOptions = {}): boolean {
  const opened = pinnedTerminal(name, options);
  if (!opened.ok) {
    void vscode.window.showWarningMessage(opened.reason);
    return false;
  }
  opened.terminal.sendText(line, true);
  return true;
}

/**
 * A live terminal of this name that runs the SAME shell — or `undefined` when a new one is owed.
 *
 * <p>One of this name opened by an older build runs the default profile, and may be holding a
 * foreground `openvpn` — it is left alone, not disposed, and a pinned one is opened beside it.
 * `fresh` disposes instead, and a terminal with an `env` is never reused: VS Code sets a
 * terminal's environment only at creation, so reuse would run with the PREVIOUS values.</p>
 */
function reusableTerminal(name: string, shell: HostShell, options: PinnedOptions): vscode.Terminal | undefined {
  const live = vscode.window.terminals.filter((t) => t.name === name && t.exitStatus === undefined);
  if (options.fresh === true) {
    live.forEach((t) => t.dispose());
    return undefined;
  }
  return options.env === undefined ? live.find((t) => !carriesEnvironment(t) && shellPathOf(t) === shell.shellPath) : undefined;
}

/**
 * True for a terminal opened WITH an environment (a password session's askpass variables, a script's resolved secrets). VS Code
 * sets the environment only at creation, so such a terminal holds it for as long as it lives: any later line typed into it
 * would run with those values. It is therefore NEVER found for reuse, by any road. Read from `creationOptions.env`, which the
 * terminal carries whichever module opened it — not from a set kept here, which a second load of this module would not see.
 */
function carriesEnvironment(terminal: vscode.Terminal): boolean {
  return (terminal.creationOptions as vscode.TerminalOptions).env !== undefined;
}

export type EntryTerminal =
  | { ok: true; terminal: vscode.Terminal; family: ShellFamily }
  | { ok: false; reason: string };

export type EntryLookup =
  | { ok: false; reason: string } // entryShell or pinned refusal
  | { ok: true; terminal: vscode.Terminal | undefined; family: ShellFamily }; // the live terminal the line would go to today, or none

/**
 * The terminal a Terminal ENTRY's line would be typed into, if one is LIVE — found, never created, never shown.
 * Default road: the first live terminal of the key's title (`terminalTitles.ts`). Pinned road: a live one of the title running the pinned
 * shell (`reusableTerminal`'s rule). Live means `exitStatus === undefined` — a closed terminal still in the list is
 * not a target. See `entryShell` for the rule, and `family` for the shell that will read what is typed (what
 * `{config}` is quoted for).
 */
export function findEntryTerminal(key: EntryTerminalKey, terminalOs: string | undefined): EntryLookup {
  const usable = usableEntryShell(key.entryName, terminalOs);
  return usable.ok ? { ok: true, terminal: liveEntryTerminal(key, usable.choice), family: usable.family } : usable;
}

/** A NEW terminal for the entry, shown — created, never found. The guard calls it only when `findEntryTerminal` answered none. */
export function openEntryTerminal(key: EntryTerminalKey, terminalOs: string | undefined): EntryTerminal {
  const usable = usableEntryShell(key.entryName, terminalOs);
  if (!usable.ok) {
    return usable;
  }
  const name = entryTerminalTitle(key);
  const shell = usable.choice.kind === 'pinned' ? { shellPath: pinnedShell().shellPath } : {};
  const terminal = vscode.window.createTerminal({ name, ...shell, ...folderColorOption(key.folderColor) });
  terminal.show();
  return { ok: true, terminal, family: usable.family };
}

/**
 * The terminal an SSH-linked line would be typed into, if one is LIVE (E2.S1): a live terminal of the entry's title
 * running SSH Connect's own shell (`composedShellPath`, D14) — in a WSL window both are `undefined`, so the default-profile
 * terminal matches. Found, never created, never shown. A terminal opened with an environment is NEVER found, by this or
 * any other finder (`carriesEnvironment`): a key session of the same entry, or an unlinked entry's local line, would run
 * with a password session's askpass variables. The caller opens a new one instead (D10).
 */
export function findSshTerminal(key: EntryTerminalKey): vscode.Terminal | undefined {
  return liveTerminalsOfEntry(key).find((t) => !carriesEnvironment(t) && shellPathOf(t) === composedShellPath());
}

/**
 * A NEW terminal for an SSH-linked line, shown — created, never found, nothing disposed (D10). `env` is a password
 * session's askpass environment: VS Code sets a terminal's environment only at creation, so a terminal with one is
 * never reused. Its shell is SSH Connect's (`composedShellPath`, D14); *Runs on* is the REMOTE's system and is not read.
 */
export function openSshEntryTerminal(key: EntryTerminalKey, env: Record<string, string> | undefined): vscode.Terminal {
  const terminal = vscode.window.createTerminal({ name: entryTerminalTitle(key), shellPath: composedShellPath(), env, ...folderColorOption(key.folderColor) });
  terminal.show();
  return terminal;
}

/**
 * Every LIVE terminal of the key's title, ANY shell, in list order: found, never created, never shown. The folder run's
 * reading. The pinned road's same-shell test (`liveEntryTerminal`) would miss one running another shell, and that
 * terminal would then sit beside a second `tmux attach`, or survive a close the person asked for.
 */
export function liveTerminalsOfEntry(key: EntryTerminalKey): readonly vscode.Terminal[] {
  const name = entryTerminalTitle(key);
  return vscode.window.terminals.filter((t) => t.name === name && t.exitStatus === undefined);
}

/** Why `openEntryTerminal` would refuse this entry in this window, or `undefined`. Opens nothing. */
export function entryOpenRefusal(entryName: string, terminalOs: string | undefined): string | undefined {
  return entryRefusal(entryShell(entryName, terminalOs, shellContext()));
}

/** Why the entry's shell cannot be had in this window — `entryShell`'s refusal, or a pinned shell's — or `undefined`. */
function entryRefusal(choice: EntryShell): string | undefined {
  if (choice.kind === 'refused') {
    return choice.reason;
  }
  return choice.kind === 'pinned' ? pinnedRefusal() : undefined;
}

function liveEntryTerminal(key: EntryTerminalKey, choice: EntryShell): vscode.Terminal | undefined {
  const live = liveTerminalsOfEntry(key).filter((t) => !carriesEnvironment(t));
  return choice.kind === 'pinned' ? live.find((t) => shellPathOf(t) === pinnedShell().shellPath) : live[0];
}

/** The shell an entry's line goes to in this window and the family that reads it, or why there is none: `entryShell`'s rule, then the pinned shell's. */
function usableEntryShell(
  entryName: string,
  terminalOs: string | undefined,
): { ok: false; reason: string } | { ok: true; choice: EntryShell; family: ShellFamily } {
  const ctx = shellContext();
  const choice = entryShell(entryName, terminalOs, ctx);
  const refusal = entryRefusal(choice);
  return refusal === undefined ? { ok: true, choice, family: readerFamily(choice, pinnedShell(), ctx) } : { ok: false, reason: refusal };
}

function shellPathOf(terminal: vscode.Terminal): string | undefined {
  const options = terminal.creationOptions as vscode.TerminalOptions;
  return typeof options.shellPath === 'string' ? options.shellPath : undefined;
}
