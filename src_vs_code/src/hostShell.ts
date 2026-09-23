import { windowSide } from './remoteWindow';

/**
 * Which shell parses a line the extension composes — decided, not inherited (issue #103).
 *
 * <p>A line was composed for the extension host's platform and typed into whatever terminal the
 * window opened by default. On a Windows machine whose default profile is WSL bash those are two
 * different machines' syntaxes: `Start-Process -Verb RunAs …` reached bash and answered
 * `Start-Process: command not found`. The two questions — "what OS is this line for" and "which
 * shell will read it" — are answered HERE, once, and a terminal that runs a composed line is opened
 * with that shell pinned rather than with the window's default.</p>
 *
 * <p>Pure and `vscode`-free: the platform, the filesystem probe and the remote name are arguments,
 * so every branch is a unit test rather than a machine configuration.</p>
 */

/** How a shell reads a variable and quotes a word. cmd.exe is the one that cannot use `$NAME`. */
export type ShellFamily = 'cmd' | 'powershell' | 'posix';

/** The OS a Terminal entry is written for — the three the owner named, in the form's order. */
export type OsName = 'windows' | 'macos' | 'linux';

export const OS_NAMES: readonly OsName[] = ['windows', 'macos', 'linux'];

export const OS_LABELS: Readonly<Record<OsName, string>> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
};

/** The OS of a Node platform. Everything that is neither Windows nor macOS runs a POSIX shell. */
export function osOf(platform: NodeJS.Platform): OsName {
  if (platform === 'win32') {
    return 'windows';
  }
  return platform === 'darwin' ? 'macos' : 'linux';
}

/**
 * An OS name read from vault data, or `undefined` for anything else.
 *
 * <p>The stored field is a loose string (`typeGuards.ts` does not close the list), so a value a
 * newer build writes must not make this one reject the entity. It is shown as stored and kept on
 * save; running it is refused like any other system that is not this one (`osMismatch`).</p>
 */
export function asOsName(value: unknown): OsName | undefined {
  return typeof value === 'string' && (OS_NAMES as readonly string[]).includes(value)
    ? (value as OsName)
    : undefined;
}

export function osLabel(value: unknown): string {
  const os = asOsName(value);
  return os === undefined ? String(value) : OS_LABELS[os];
}

const SHELL_PREFIXES: ReadonlyArray<[string, ShellFamily]> = [
  ['cmd', 'cmd'],
  ['powershell', 'powershell'],
  ['pwsh', 'powershell'],
];

/**
 * Which family a shell path belongs to. Windows with nothing reported means PowerShell.
 *
 * <p>The ONE detector. `runPlan.ts` and `envProbe.ts` used to carry a copy each of the same
 * basename test; both now call this.</p>
 */
export function shellFamily(platform: NodeJS.Platform, shellPath?: string): ShellFamily {
  const base = basenameOf(shellPath);
  const known = SHELL_PREFIXES.find(([prefix]) => base.startsWith(prefix));
  if (known !== undefined) {
    return known[1];
  }
  // No shell reported: on Windows the default is PowerShell in every supported VS Code.
  return base.length === 0 && platform === 'win32' ? 'powershell' : 'posix';
}

function basenameOf(shellPath: string | undefined): string {
  const normalized = (shellPath ?? '').toLowerCase().split('\\').join('/');
  return normalized.split('/').pop() ?? '';
}

/** The two families a PINNED terminal can be — never cmd, which has no shell integration. */
export type PinnedFamily = 'powershell' | 'posix';

export interface HostShell {
  /** Passed to `createTerminal({ shellPath })` — never the window's default profile. */
  readonly shellPath: string;
  readonly family: PinnedFamily;
}

/**
 * The native shell of this platform — what a line composed for it is typed into.
 *
 * <p>On Windows PowerShell 7 (`pwsh.exe`) when it is installed, else Windows PowerShell 5.1, which
 * ships with every supported Windows. Every line composed for win32 here (`Start-Process -Verb
 * RunAs`, the winget recipes) runs in both; a person's own line is likelier to work in 7 (`&&`
 * exists there and not in 5.1). On POSIX `/bin/bash` when it exists, else `/bin/sh`.</p>
 */
export function hostShell(platform: NodeJS.Platform, exists: (path: string) => boolean, hasPwsh?: boolean): HostShell {
  if (platform === 'win32') {
    return { shellPath: hasPwsh === true ? 'pwsh.exe' : 'powershell.exe', family: 'powershell' };
  }
  return { shellPath: exists('/bin/bash') ? '/bin/bash' : '/bin/sh', family: 'posix' };
}

/**
 * One word, quoted so the given shell passes it through unchanged — spaces, `$`, backticks,
 * apostrophes and double quotes included.
 *
 * <p>PowerShell and POSIX single quotes are literal; each doubles or escapes the one character
 * that ends them. cmd.exe has no literal quote at all: its form is a plain double-quoted word,
 * adequate for the one thing it is used for — a Windows PATH, which cannot contain `"` — typed
 * into a person's cmd.exe default profile by a launcher that records no OS.</p>
 */
export function quoteFor(family: ShellFamily, value: string): string {
  if (family === 'powershell') {
    return "'" + value.replace(/'/g, "''") + "'";
  }
  if (family === 'posix') {
    return "'" + value.replace(/'/g, `'"'"'`) + "'";
  }
  return '"' + value + '"';
}

/** Whether an entry records an OS at all. Absent and empty both mean "never set". */
export function hasOs(terminalOs: string | undefined): terminalOs is string {
  return terminalOs !== undefined && terminalOs !== '';
}

/**
 * Why a command written for `terminalOs` may NOT run on `platform` — or `undefined` when it may.
 *
 * <p>No OS recorded (every entry written before the field existed) never refuses. A value this
 * build does not know — one a newer build wrote — is compared as written and so refused: running
 * a line on a system it does not claim to be for is the one thing this field exists to prevent,
 * and an unknown claim is still not this machine's.</p>
 */
export function osMismatch(entryName: string, terminalOs: string | undefined, platform: NodeJS.Platform): string | undefined {
  return !hasOs(terminalOs) || terminalOs === osOf(platform) ? undefined : mismatchSentence(entryName, terminalOs, platform);
}

function mismatchSentence(entryName: string, terminalOs: string, platform: NodeJS.Platform): string {
  return `"${entryName}" is written for ${osLabel(terminalOs)}, and this terminal runs ${OS_LABELS[osOf(platform)]}. Edit it and change "Runs on" — or set it to "not set" to run it in your default terminal as before.`;
}

/**
 * Where the window's terminals run: this machine, its WSL side, or another computer. The one
 * classification `remoteWindow.windowSide` already makes — asked of it, never made again here.
 */
export type WindowKind = 'local' | 'wsl' | 'other';

export function windowKind(remoteName: string | undefined): WindowKind {
  return windowSide(remoteName, []).kind;
}

/** What decides which shell reads a Terminal entry's own line. All three are the editor's facts. */
export interface ShellContext {
  /** The extension host — the machine VS Code itself runs on (`extensionKind: ui`). */
  readonly platform: NodeJS.Platform;
  /** `vscode.env.remoteName`. */
  readonly remoteName: string | undefined;
  /** `vscode.env.shell` — the window's default profile. */
  readonly defaultShell: string | undefined;
}

/**
 * Which shell reads a Terminal ENTRY's own line (issue #103) — the person's syntax, not ours.
 *
 * <ul>
 *   <li><b>No OS recorded</b>: the default profile, exactly as before the field existed.</li>
 *   <li><b>Another computer's window</b> (Remote-SSH, a container): the default profile. Its
 *       terminal is not this machine and its OS is not ours to know; the person chose the window.</li>
 *   <li><b>The OS of the window's terminal</b> (this machine locally; Linux in a WSL window): the
 *       default profile when it is a shell of that OS — pwsh 7, zsh with its aliases, whatever the
 *       person set up — and the native shell pinned when it is not (the #103 case: a Windows line,
 *       a WSL-bash default).</li>
 *   <li><b>This machine's OS from a WSL window</b>: pinned — interop runs Windows' shell there.</li>
 *   <li>Anything else is refused, naming both systems and the way back to "not set".</li>
 * </ul>
 */
export type EntryShell = { kind: 'default' } | { kind: 'pinned' } | { kind: 'refused'; reason: string };

export function entryShell(entryName: string, terminalOs: string | undefined, ctx: ShellContext): EntryShell {
  const kind = windowKind(ctx.remoteName);
  if (!hasOs(terminalOs) || kind === 'other') {
    return { kind: 'default' };
  }
  return shellFor(entryName, terminalOs, kind === 'wsl' ? 'linux' : ctx.platform, ctx);
}

/** An entry WITH an OS, in a window whose terminal runs on `terminalPlatform`. */
function shellFor(entryName: string, terminalOs: string, terminalPlatform: NodeJS.Platform, ctx: ShellContext): EntryShell {
  if (terminalOs === osOf(terminalPlatform)) {
    return defaultReads(terminalOs, shellFamily(terminalPlatform, ctx.defaultShell)) ? { kind: 'default' } : { kind: 'pinned' };
  }
  return terminalOs === osOf(ctx.platform)
    ? { kind: 'pinned' }
    : { kind: 'refused', reason: mismatchSentence(entryName, terminalOs, terminalPlatform) };
}

/** Whether a default profile of `family` is a shell of `os` — Windows' own, or any POSIX one. */
function defaultReads(os: string, family: ShellFamily): boolean {
  return os === 'windows' ? family !== 'posix' : family === 'posix';
}

/**
 * The family of the shell that will READ a line typed under `choice` — what `{config}` is quoted
 * for. Pinned: the native shell's. Default: the default profile's, which is the shell that reads it.
 */
export function readerFamily(choice: EntryShell, pinned: HostShell, ctx: ShellContext): ShellFamily {
  return choice.kind === 'pinned' ? pinned.family : shellFamily(ctx.platform, ctx.defaultShell);
}

/**
 * The OS a NEW Terminal entry's dropdown starts on: the system of the window's terminal — this
 * machine's locally, Linux in a WSL window, and nothing in another computer's window, where the
 * person knows the answer and the editor does not.
 */
export function newEntryOs(remoteName: string | undefined, platform: NodeJS.Platform): OsName | undefined {
  const kind = windowKind(remoteName);
  if (kind === 'other') {
    return undefined;
  }
  return kind === 'wsl' ? 'linux' : osOf(platform);
}

/**
 * How to hand one line to `shell` WITHOUT a terminal — the agent's captured run. The same shell
 * the human path pins, so a line behaves the same whichever door ran it.
 */
export function shellInvocation(shell: HostShell, line: string): { program: string; args: string[] } {
  return shell.family === 'powershell'
    ? { program: shell.shellPath, args: ['-NoProfile', '-NonInteractive', '-Command', line] }
    : { program: shell.shellPath, args: ['-c', line] };
}

/**
 * The captured (terminal-less) run of a Terminal entry's line — what an agent's `creds_run` spawns.
 *
 * <p>With an OS recorded, the host's native shell. Without one, exactly what it always was —
 * Node's `shell: true` (cmd.exe on Windows, /bin/sh elsewhere) — so no entry an agent already runs
 * changes under it.</p>
 */
export function capturedRun(
  terminalOs: string | undefined,
  line: string,
  shell: HostShell,
): { program: string; args: string[]; shell: boolean } {
  return hasOs(terminalOs) ? { ...shellInvocation(shell, line), shell: false } : { program: line, args: [], shell: true };
}

/**
 * Why a PINNED terminal may not be opened in this window — or `undefined` when it may.
 *
 * <p>The extension runs on the machine the editor runs on (`extensionKind: ui`), so a line it
 * composes is for THAT machine. A local window is that machine. A WSL window is that machine too:
 * its terminal is on the Linux side, where interop resolves `powershell.exe` — and when interop is
 * off, the terminal exits at once, which the chain reports by name rather than waiting on. Any
 * other remote window (Remote-SSH, a container, a Codespace) has its terminals on a different
 * computer, and a tunnel or an install started there is not the one the person asked for.</p>
 */
export function pinnedShellRefusal(remoteName: string | undefined): string | undefined {
  return windowKind(remoteName) === 'other'
    ? `This window's terminals run on another computer (${remoteName ?? 'remote'}), and CredsForDevs runs ` +
        'this on the computer VS Code itself runs on. Open a local window and run it from there.'
    : undefined;
}
