import * as fs from 'node:fs';
import * as vscode from 'vscode';
import { HostShell, hostShell, osMismatch, pinnedShellRefusal } from './hostShell';

/**
 * The one way this extension opens a terminal for a line it COMPOSED (issue #103).
 *
 * <p>`createTerminal({ name })` opens the window's default profile, which is the person's
 * choice for their own typing — WSL bash, Git-bash, cmd — and says nothing about the syntax of a
 * line composed for this platform. Every such terminal is opened here, with the host's native
 * shell passed as `shellPath`, so `Start-Process` reaches PowerShell whatever the default is.</p>
 *
 * <p>A terminal the person's own entry runs in with no OS recorded keeps the default profile; that
 * decision belongs to the caller, not to this helper.</p>
 */
export type PinnedTerminal =
  | { ok: true; terminal: vscode.Terminal; shell: HostShell }
  | { ok: false; reason: string };

/** The shell a composed line is for on this machine. */
export function pinnedShell(): HostShell {
  return hostShell(process.platform, fs.existsSync);
}

/** Why a pinned terminal cannot be opened in this window, or `undefined` when it can. */
export function pinnedRefusal(): string | undefined {
  return pinnedShellRefusal(vscode.env.remoteName);
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

/**
 * The terminal a Terminal ENTRY's own line runs in (issue #103).
 *
 * <p>With an OS recorded, the line is the person's syntax FOR that OS: refused on another OS, and
 * run in that OS's native shell when it matches. With none recorded — every entry written before
 * the field existed — it keeps today's behaviour exactly: the window's default profile, the
 * dedicated terminal of this name reused.</p>
 */
export function entryTerminal(entryName: string, terminalOs: string | undefined): PinnedTerminal | { ok: true; terminal: vscode.Terminal; shell: undefined } {
  const mismatch = osMismatch(entryName, terminalOs, process.platform);
  if (mismatch !== undefined) {
    return { ok: false, reason: mismatch };
  }
  const name = `CredsForDevs: ${entryName}`;
  return (terminalOs ?? '') === '' ? defaultProfileTerminal(name) : pinnedTerminal(name);
}

/** Today's behaviour for an entry with no OS: the window's default profile, reused by name. */
function defaultProfileTerminal(name: string): { ok: true; terminal: vscode.Terminal; shell: undefined } {
  const terminal = vscode.window.terminals.find((t) => t.name === name) ?? vscode.window.createTerminal({ name });
  terminal.show();
  return { ok: true, terminal, shell: undefined };
}

function shellPathOf(terminal: vscode.Terminal): string | undefined {
  const options = terminal.creationOptions as vscode.TerminalOptions;
  return typeof options.shellPath === 'string' ? options.shellPath : undefined;
}
