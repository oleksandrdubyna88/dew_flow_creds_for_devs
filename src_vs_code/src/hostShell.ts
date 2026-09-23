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
 * newer build writes must not make this one reject the entity — it is simply not an OS this build
 * knows, and the entry behaves as one without an OS.</p>
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

export interface HostShell {
  /** Passed to `createTerminal({ shellPath })` — never the window's default profile. */
  readonly shellPath: string;
  readonly family: ShellFamily;
}

/**
 * The native shell of this platform — what a line composed for it is typed into.
 *
 * <p>Windows PowerShell rather than `pwsh`: it ships with every supported Windows, and every line
 * composed for win32 here (`Start-Process -Verb RunAs`, the winget recipes) is 5.1-compatible.
 * On POSIX `/bin/bash` when it exists, else `/bin/sh` — the composed lines are plain POSIX.</p>
 */
export function hostShell(platform: NodeJS.Platform, exists: (path: string) => boolean): HostShell {
  if (platform === 'win32') {
    return { shellPath: 'powershell.exe', family: 'powershell' };
  }
  return { shellPath: exists('/bin/bash') ? '/bin/bash' : '/bin/sh', family: 'posix' };
}

/**
 * One word, quoted so the given shell passes it through unchanged — spaces, `$`, backticks,
 * apostrophes and double quotes included.
 *
 * <p>PowerShell and POSIX single quotes are literal; each doubles or escapes the one character
 * that ends them. cmd.exe has no literal quote at all: its form is a plain double-quoted word,
 * adequate for the one thing it is used for — a Windows PATH, which cannot contain `"`. No pinned
 * terminal is ever cmd (see `hostShell`), so nothing composed here depends on more.</p>
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

/**
 * Why a command written for `terminalOs` may NOT run on this platform — or `undefined` when it
 * may (no OS recorded, which is every entry written before the field existed, or the same OS).
 */
export function osMismatch(entryName: string, terminalOs: string | undefined, platform: NodeJS.Platform): string | undefined {
  if (terminalOs === undefined || terminalOs === '' || terminalOs === osOf(platform)) {
    return undefined;
  }
  return `"${entryName}" is written for ${osLabel(terminalOs)}, and this machine runs ${OS_LABELS[osOf(platform)]}. Edit it and change "Runs on", or run it on a ${osLabel(terminalOs)} machine.`;
}

/**
 * How to hand one line to `shell` WITHOUT a terminal — the agent's captured run. The same shell
 * the human path pins, so a line behaves the same whichever door ran it.
 */
export function shellInvocation(shell: HostShell, line: string): { program: string; args: string[] } {
  if (shell.family === 'powershell') {
    return { program: shell.shellPath, args: ['-NoProfile', '-NonInteractive', '-Command', line] };
  }
  return shell.family === 'posix'
    ? { program: shell.shellPath, args: ['-c', line] }
    : { program: shell.shellPath, args: ['/d', '/s', '/c', line] };
}

/**
 * The captured (terminal-less) run of a Terminal entry's line — what an agent's `creds_run` spawns.
 *
 * <p>With an OS recorded, the host's native shell, as the human Run button now uses. Without one,
 * exactly what it always was — Node's `shell: true` (cmd.exe on Windows, /bin/sh elsewhere) — so no
 * entry an agent already runs changes under it.</p>
 */
export function capturedRun(
  terminalOs: string | undefined,
  line: string,
  platform: NodeJS.Platform,
  exists: (path: string) => boolean,
): { program: string; args: string[]; shell: boolean } {
  if (terminalOs === undefined || terminalOs === '') {
    return { program: line, args: [], shell: true };
  }
  return { ...shellInvocation(hostShell(platform, exists), line), shell: false };
}

/**
 * Why a pinned terminal may NOT be opened in this window — or `undefined` when it may.
 *
 * <p>The extension runs on the machine the editor runs on (`extensionKind: ui`), so a line it
 * composes is for THAT machine. A local window is that machine. A WSL window is that machine too:
 * its terminal is on the Linux side, where interop resolves `powershell.exe` — and when interop is
 * off, the terminal exits at once, which the host half reports by name rather than waiting on. Any
 * other remote window (Remote-SSH, a container, a Codespace) has its terminals on a different
 * computer, and a tunnel or an install started there is not the one the person asked for.</p>
 */
export function pinnedShellRefusal(remoteName: string | undefined): string | undefined {
  if (remoteName === undefined || remoteName.length === 0 || remoteName === 'wsl') {
    return undefined;
  }
  return (
    `This window's terminals run on another computer (${remoteName}), and CredsForDevs runs ` +
    'this on the computer VS Code itself runs on. Open a local window and run it from there.'
  );
}
