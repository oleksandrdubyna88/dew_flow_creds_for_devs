/**
 * Starting `creds relay` inside WSL, and the one line a shell there needs to find it.
 *
 * <p>Pure: argv, parsing, and text. The process itself is `wslRelayManager.ts`.</p>
 *
 * <p><b>The socket path is NOT computed here, deliberately.</b> `AgentRelay.DefaultSocketPath` in
 * the CLI already decides it — `$XDG_RUNTIME_DIR` when the distribution has one, `/tmp` with the
 * user in the name otherwise — and a second implementation of that rule on this side would be two
 * places that must agree about a path, which is the shape of defect the contract rule exists for.
 * The relay prints `export SSH_AUTH_SOCK=…` on stdout as its first line; we read the answer rather
 * than deriving it.</p>
 *
 * <p><b>Why the extension can start this but cannot set `SSH_AUTH_SOCK` for you.</b> VS Code's
 * environment collection is one namespace for every terminal of a window, and the two kinds want
 * different values: a Windows terminal needs the agent's named pipe, a WSL one needs this relay's
 * unix path. There is no per-shell scope in the API. Worse, a Windows variable does not reach the
 * distribution at all unless it is named in `WSLENV` — measured 2026-08-26. So the export belongs
 * in the shell's own rc, which is why there is a command that offers to put it there once instead
 * of a mechanism that half-works.</p>
 */

/** Marks the block we append, so appending twice does nothing the second time. */
export const RC_MARKER = '# CredsForDevs — the SSH agent, relayed from the VS Code window';

/**
 * A relay command and a distribution name are spliced into an argv that reaches `bash -lc`.
 *
 * <p>Both come from settings, which are workspace-writable — a repository can ship a
 * `.vscode/settings.json`. So they are REFUSED rather than escaped: the character set is what a
 * command name and a distribution name actually need, and anything else is a different question
 * being asked. There is nothing to quote correctly if nothing quotable is accepted.</p>
 */
export function isSafeShellWord(value: string): boolean {
  return value.length > 0 && value.length <= 200 && /^[A-Za-z0-9_./:-]+$/.test(value);
}

/**
 * The argv for `wsl.exe`.
 *
 * <p>A login shell, because `creds` is usually on a PATH set by the person's own profile, and
 * `wsl.exe -e creds` would search the default one. `exec` so bash replaces itself: the relay is
 * then the process the parent holds, and killing the child kills the relay rather than a shell
 * that owns it — measured, the relay does die with `wsl.exe`, and the socket it leaves behind is
 * reclaimed by the next start.</p>
 */
export function relayArgv(command: string, distro: string): string[] {
  const distroArgv = distro.length > 0 ? ['-d', distro] : [];
  return [...distroArgv, '-e', 'bash', '-lc', `exec ${command} relay`];
}

/** The path out of the relay's own first line, or empty when that is not what it said. */
export function socketFromExportLine(line: string): string {
  const match = /^export SSH_AUTH_SOCK=(\S+)$/.exec(line.trim());
  return match === null ? '' : match[1];
}

/** The block to append to a shell rc. */
export function rcSnippet(socketPath: string): string {
  return `\n${RC_MARKER}\nexport SSH_AUTH_SOCK=${socketPath}\n`;
}

/**
 * Whether an rc file already points at this relay.
 *
 * <p>The marker rather than the path: a person who moved the socket with `CREDS_RELAY_SOCKET` has
 * a line we wrote and a path we would not recognise, and appending a second one would leave the
 * last-wins export fighting their choice.</p>
 */
export function rcAlreadyHasIt(text: string): boolean {
  return text.includes(RC_MARKER);
}

/**
 * Distributions that are plumbing rather than somewhere a person works.
 *
 * <p>Filtered from the picker rather than hidden everywhere: Docker Desktop installs these and
 * they have no login shell to put an export line into, so offering them is offering a choice
 * that cannot work. Anything else WSL reports is shown, because guessing which of someone's own
 * distributions is 'real' is not ours to do.</p>
 */
const SYSTEM_DISTROS = new Set(['docker-desktop', 'docker-desktop-data']);

/**
 * The distributions `wsl -l -q` reported.
 *
 * <p><b>Takes a Buffer, not a string, and that is the whole point.</b> WSL answers in UTF-16LE
 * with CRLF — measured 2026-08-27: the bytes begin `55 00 62 00`. Decoded as UTF-8 every name
 * comes back interleaved with NUL characters and matches nothing, which is the kind of failure
 * that looks like "no distributions found" rather than like an encoding bug.</p>
 */
export function parseDistros(raw: Buffer): string[] {
  return raw
    .toString('utf16le')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((name) => name.length > 0 && !SYSTEM_DISTROS.has(name));
}
