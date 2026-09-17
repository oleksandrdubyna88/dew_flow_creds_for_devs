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
 * <p><b>It also tells the relay where the Windows half is, and that is not a nicety.</b> A relay
 * spawns `creds.exe relay-pipe` for every connection it accepts, and finds it on the PATH. The
 * extension installs that binary into its own global storage, which is on nobody's PATH — so a
 * person could install both halves through the buttons provided and still get "communication with
 * agent failed" from `ssh-add`, with the real reason only in a log. Passing the path removes the
 * question rather than documenting it.</p>
 */
export function relayArgv(command: string, distro: string, windowsBinary = ''): string[] {
  const distroArgv = distro.length > 0 ? ['-d', distro] : [];
  return [...distroArgv, '-e', 'bash', '-lc', `exec ${binaryPrefix(windowsBinary)}${command} relay`];
}

/**
 * `env VAR='…' ` in front of the command, or nothing when we have no path to give.
 *
 * <p>`env` rather than a bare `VAR=value` assignment, because `exec` takes a COMMAND and an
 * assignment prefix is not one — measured in a real shell before it was written this way.</p>
 *
 * <p>A path holding a single quote cannot be single-quoted, and building a shell line out of one
 * would be the escaping question this file refuses everywhere else. It is dropped instead: the
 * relay then falls back to the PATH, which is exactly where it was before.</p>
 */
function binaryPrefix(windowsBinary: string): string {
  return envPrefix(WINDOWS_BINARY_VARIABLE, windowsBinary);
}

/** The variable this file's own prefix sets, named rather than spelled inside a template. */
const WINDOWS_BINARY_VARIABLE = 'CREDS_WINDOWS_BINARY';

/**
 * One environment variable in front of a command, for a shell line somebody else will run.
 *
 * <p>Extracted when the SSH connect path needed the same thing for `SSH_AUTH_SOCK`. It was this
 * file's private `binaryPrefix` and is now its only implementation, because two copies of an
 * escaping rule are two escaping rules.</p>
 *
 * <p><b>`env NAME=value command`, never a bare `NAME=value command` assignment prefix.</b> Measured
 * in a real shell before it was first written this way, and confirmed from the other direction by
 * the connect path's plan round: a bare assignment is not a command, so `exec` rejects it — and so
 * do `fish` and `pwsh`, either of which can be a WSL window's default terminal profile. `env` is an
 * ordinary command word that every one of them runs.</p>
 *
 * <p>A value containing a single quote cannot be single-quoted, and building a line out of one would
 * be the escaping question this file refuses everywhere else. It is DROPPED instead: the caller gets
 * no prefix, so the command runs with whatever the environment already had rather than as a broken
 * line.</p>
 */
export function envPrefix(name: string, value: string): string {
  const usable = value.length > 0 && !value.includes("'");
  return usable ? `env ${name}='${value}' ` : '';
}

/**
 * A Windows path as WSL sees it: `C:\a\b` becomes `/mnt/c/a/b`.
 *
 * <p>Only the drive-letter form, and anything else is handed back untouched — a UNC path or a
 * path that is already `/mnt/...` has no translation to make, and guessing at one would produce a
 * path that exists nowhere.</p>
 */
export function toWslPath(windowsPath: string): string {
  const match = /^([A-Za-z]):[\\/](.*)$/.exec(windowsPath);
  return match === null
    ? windowsPath
    : `/mnt/${match[1].toLowerCase()}/${match[2].replace(/\\/g, '/')}`;
}

/** The path out of the relay's own first line, or empty when that is not what it said. */
export function socketFromExportLine(line: string): string {
  const match = /^export SSH_AUTH_SOCK=(\S+)$/.exec(line.trim());
  return match === null ? '' : match[1];
}

/**
 * The socket a relay names when it REFUSES to start because one is already serving that path.
 *
 * <p>Found by a person clicking the button, 2026-09-17. A relay was up and working — `ssh-add -l`
 * through it listed the key, and it had a dozen live connections — and starting a second one is
 * correctly refused rather than allowed to hijack the socket. But the refusal goes to STDERR, which
 * the manager forwarded to the log without reading, so it learned no socket and the setup said
 * <i>the relay in Ubuntu reported no socket. Check that `creds` is installed there</i>: a false
 * statement, pointing at the wrong thing, about a relay that was working.</p>
 *
 * <p>The refusal NAMES the path and its own advice is "use that one", so it is read rather than
 * discarded — the same rule as `socketFromExportLine`: the CLI decides the path, this side reads
 * the answer instead of deriving it. If the CLI ever rewords that sentence this returns `''` and
 * the behaviour falls back to exactly what it was, which is why it is a parse and not a contract.</p>
 */
export function socketFromBusyLine(line: string): string {
  const match = /(\S+) is already served by a live relay/.exec(line.trim());
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

/** Feeds whole lines out of a stream that arrives in arbitrary slices. */
export interface LineAssembler {
  /** A chunk as `data` delivered it — any number of lines, or part of one. */
  push(chunk: string): void;
  /** The stream ended: release whatever was left, newline or not. */
  end(): void;
}

/**
 * Whole lines out of a byte stream, which is not what a `data` event gives you.
 *
 * <p><b>Why this exists as one thing rather than twice inside a spawn.</b> A relay's stdout is read
 * for the line that says where it listens, and its STDERR for the line that says somebody else is
 * already listening there. The first was assembled from a buffer; the second was split chunk by
 * chunk as it arrived, so a refusal delivered as</p>
 *
 * <pre>
 *   "/run/user/1000/creds.sock is alre"   "ady served by a live relay"
 * </pre>
 *
 * <p>matched nothing in either half — and the consequence is not a missed log line: the manager
 * then declares a working relay broken, drops the entry on exit, and spends the retry budget
 * restarting something that was never down. Raised by a review of the adoption change; the first
 * fix read stderr and the second had to read it correctly.</p>
 *
 * <p>Blank lines are dropped: both streams emit them and no handler here has anything to do with
 * one. `end()` releases a trailing fragment, because a stream's last line need not end in a
 * newline — and a relay that refuses and exits writes exactly one line.</p>
 */
export function lineAssembler(deliver: (line: string) => void): LineAssembler {
  let pending = '';
  const emit = (line: string): void => {
    if (line.trim().length > 0) {
      deliver(line);
    }
  };
  return {
    push(chunk: string): void {
      pending += chunk;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? '';
      lines.forEach(emit);
    },
    end(): void {
      const last = pending;
      pending = '';
      emit(last);
    },
  };
}
