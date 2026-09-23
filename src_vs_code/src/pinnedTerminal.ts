import * as fs from 'node:fs';
import * as vscode from 'vscode';
import {
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

/**
 * The `vscode` half of "which shell reads this line" (issue #103); the decisions are `hostShell.ts`.
 *
 * <p>`createTerminal({ name })` opens the window's default profile, which is the person's choice for
 * their own typing — WSL bash, Git-bash, cmd — and says nothing about the syntax of a line composed
 * for this platform. Every terminal that runs a line the extension COMPOSES is opened here with the
 * host's native shell as `shellPath`, so `Start-Process` reaches PowerShell whatever the default is.
 * A Terminal entry's OWN line goes through `entryTerminal`, which asks `entryShell` instead.</p>
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

export interface PinnedOptions {
  /** Only settable at creation, so a terminal given one is never reused (see `runScript`). */
  env?: Record<string, string>;
  /** Dispose a live terminal of this name first — a script re-run must not inherit old values. */
  fresh?: boolean;
}

export function pinnedTerminal(name: string, options: PinnedOptions = {}): PinnedTerminal {
  const refusal = pinnedRefusal();
  if (refusal !== undefined) {
    return { ok: false, reason: refusal };
  }
  const shell = pinnedShell();
  const terminal =
    reusableTerminal(name, shell, options) ??
    vscode.window.createTerminal({ name, shellPath: shell.shellPath, env: options.env });
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
  return options.env === undefined ? live.find((t) => shellPathOf(t) === shell.shellPath) : undefined;
}

export type EntryTerminal =
  | { ok: true; terminal: vscode.Terminal; family: ShellFamily }
  | { ok: false; reason: string };

/**
 * The terminal a Terminal ENTRY's own line runs in — see `entryShell` for the rule, and `family`
 * for the shell that will read what is typed (what `{config}` is quoted for).
 */
export function entryTerminal(entryName: string, terminalOs: string | undefined): EntryTerminal {
  const ctx = shellContext();
  const choice = entryShell(entryName, terminalOs, ctx);
  if (choice.kind === 'refused') {
    return { ok: false, reason: choice.reason };
  }
  const name = `CredsForDevs: ${entryName}`;
  const opened = choice.kind === 'pinned' ? pinnedTerminal(name) : defaultProfileTerminal(name);
  return opened.ok ? { ok: true, terminal: opened.terminal, family: readerFamily(choice, pinnedShell(), ctx) } : opened;
}

/** The behaviour before the field existed: the window's default profile, reused by name. */
function defaultProfileTerminal(name: string): { ok: true; terminal: vscode.Terminal } {
  const terminal = vscode.window.terminals.find((t) => t.name === name) ?? vscode.window.createTerminal({ name });
  terminal.show();
  return { ok: true, terminal };
}

function shellPathOf(terminal: vscode.Terminal): string | undefined {
  const options = terminal.creationOptions as vscode.TerminalOptions;
  return typeof options.shellPath === 'string' ? options.shellPath : undefined;
}
