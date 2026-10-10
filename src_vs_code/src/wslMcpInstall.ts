import { compareVersions } from './credsInstall';
import { bashInstall } from './installCommand';
import { mcpServerBlock } from './mcpClientConfig';

/**
 * Putting the MCP server where an agent that lives in WSL can actually start it.
 *
 * <p><b>The gap this closes.</b> `Install the MCP Server…` installs for the machine the extension
 * host runs on, which — because the extension is `extensionKind: ["ui"]` — is always Windows,
 * even in a Remote-WSL window. The config block it hands you names that `.exe`, and an MCP client
 * running inside a distribution cannot start a Windows executable by that path. So a person could
 * follow the menu exactly and end up with a server their agent cannot launch.</p>
 *
 * <p><b>Both halves are needed, and that is not a workaround.</b> The Linux binary does not talk
 * to the vault: it re-executes the Windows one through interop and carries its stdio. So the WSL
 * route installs the Linux half INTO the distribution and points it at the Windows half already
 * on this machine.</p>
 *
 * <p><b>The Windows path is translated by `wslpath`, never composed here.</b> `/mnt/c/...` is the
 * default automount root, not a rule — it is configurable in `/etc/wsl.conf`, and a path we made
 * up would be a path that exists nowhere on a machine that changed it. The distribution can
 * answer the question, so it is asked. Pure decisions live here; the process that asks is
 * `mcpInstallTarget.ts`.</p>
 */

/** The variable the Linux binary reads to find the Windows one. Its own, never the CLI's. */
export const WINDOWS_BINARY_VARIABLE = 'CREDS_MCP_WINDOWS_BINARY';

/**
 * The argv that asks a distribution to translate a Windows path.
 *
 * <p>`-e wslpath`, not `bash -lc`: the path goes across as an ARGUMENT rather than as text inside
 * a shell line, so a space or a quote in somebody's user name is not a quoting problem. `-a`
 * makes it absolute, which it already is — cheap, and it fails loudly on a relative path rather
 * than answering something plausible.</p>
 */
export function wslPathArgv(distro: string, windowsPath: string): string[] {
  return [...distroArgv(distro), '-e', 'wslpath', '-a', windowsPath];
}

/** The argv that runs the published install one-liner inside a distribution. */
export function installArgv(distro: string): string[] {
  return [...distroArgv(distro), '-e', 'bash', '-lc', bashInstall('creds-mcp')];
}

/**
 * `-d <name>` only when there is a name.
 *
 * <p>An empty name means "whatever WSL calls default", which is a real choice and not a missing
 * one — the same convention `relayArgv` uses.</p>
 */
function distroArgv(distro: string): string[] {
  return distro.length > 0 ? ['-d', distro] : [];
}

/**
 * Where the script says it put the binary.
 *
 * <p><b>Read, never re-derived.</b> `bashInstall` ends with `echo "installed: $HOME/.local/bin/…"`
 * and expanding `$HOME` here would be a second implementation of a path rule that already has
 * one — the same reasoning that made the SSH relay parse its own `export SSH_AUTH_SOCK=` line
 * instead of computing the socket path twice.</p>
 *
 * <p>The LAST match, because a login shell is free to print its own greeting first, and empty
 * when the script did not get that far — which is what the caller reports as a failure.</p>
 */
export function installedPathFrom(output: string): string {
  const matches = [...output.matchAll(/^installed:[ \t]*(\S.*?)[ \t]*$/gm)];
  return matches.length === 0 ? '' : matches[matches.length - 1][1];
}

/**
 * The block for a client running inside a distribution.
 *
 * <p>The command is the LINUX binary, and the Windows one is named in `env` rather than left to
 * the interop PATH — the extension installs it into its own storage, which is deliberately on
 * nobody's PATH, so a block without this would be a block that cannot start. The same reasoning,
 * and the same shape, as the `env CREDS_WINDOWS_BINARY=` the SSH relay passes.</p>
 */
export function wslServerBlock(linuxBinary: string, windowsBinaryInWsl: string): string {
  return mcpServerBlock(linuxBinary, { [WINDOWS_BINARY_VARIABLE]: windowsBinaryInWsl });
}

/** The argv that asks the freshly installed binary to describe itself. */
export function helpArgv(distro: string, linuxBinary: string): string[] {
  return [...distroArgv(distro), '-e', linuxBinary, '--help'];
}

/**
 * Does the binary we just installed know how to cross the bridge at all?
 *
 * <p><b>This check exists because the failure without it is silent and misattributed.</b> A
 * `creds-mcp` published before the WSL bridge ignores the variable this install writes and dials
 * `127.0.0.1` inside the distribution, where nothing of ours listens — so it answers "No
 * CredsForDevs window answered", which is exactly what a CLOSED window says. Measured on
 * 2026-08-28 against the real `mcp-v0.1.0`, cut hours before the bridge: the config was correct,
 * the window was open and healthy, and the agent was told the vault was unreachable.</p>
 *
 * <p>The binary's own help is the signal because it is the one this build controls and the one a
 * person can check by hand. The word looked for is the variable we are about to write into their
 * client's config: if the binary has never heard of it, the block would name something it will
 * not read.</p>
 */
export function knowsTheBridge(helpText: string): boolean {
  return helpText.includes(WINDOWS_BINARY_VARIABLE);
}

/** What to say when the published release predates the bridge. */
export function staleBinaryWarning(distro: string, linuxBinary: string): string {
  const where = distro.length > 0 ? distro : 'your WSL distribution';
  return (
    `Installed ${linuxBinary} in ${where}, but that published release predates the WSL bridge: it ` +
    'cannot reach a window on Windows and will report that none answered, however healthy yours ' +
    'is. The configuration is still on your clipboard — it becomes correct as soon as a newer ' +
    'creds-mcp release is published and you run this again.'
  );
}

/** What the person is told once both halves are in place. */
export function wslInstalledMessage(distro: string, linuxBinary: string): string {
  const where = distro.length > 0 ? distro : 'your WSL distribution';
  return (
    `The MCP server is installed in ${where} at ${linuxBinary}, pointed at the Windows binary it ` +
    'relays through. Its configuration is on your clipboard — paste it into the MCP client ' +
    'running INSIDE that distribution and restart it. Nothing in your vault is visible to an ' +
    'agent until you turn on Agent access for an entry.'
  );
}

/** What went wrong, in a sentence naming the thing to fix. */
export function installFailure(distro: string, output: string): string {
  const where = distro.length > 0 ? `in ${distro}` : 'in your WSL distribution';
  const said = output.trim().split(/\r?\n/).filter((line) => line.trim().length > 0).slice(-2).join(' ');
  return (
    `Could not install the MCP server ${where}. The distribution needs curl, tar and sha256sum, ` +
    `and a network path to GitHub.${said.length > 0 ? ` It said: ${said}` : ''}`
  );
}

// ---------- a stale install says so (plan §5.8, E4.S2) ----------

/**
 * The first `creds-mcp` release that answers `--version` (E2, #211 — released as mcp 0.10.0).
 *
 * <p>Below it nothing can be judged: a CURRENT install of an older release has no `--version`
 * either, so the check would call it older and Update would install the same release again — a
 * loop offered to a person as a fix.</p>
 */
export const VERSION_FLAG_SINCE = '0.10.0';

/** Whether a check against `expected` can say anything at all. Empty: no Windows install recorded. */
export function canJudge(expected: string): boolean {
  return expected !== '' && compareVersions(expected, VERSION_FLAG_SINCE) >= 0;
}

/**
 * The two values a copied WSL block names — remembered, because the extension never sees the
 * client's config itself (it copies the block, it does not write the file).
 */
export interface RecordedWslInstall {
  /** The Linux binary — the block's `command`. */
  readonly linuxBinary: string;
  /** The Windows binary as the distribution sees it — the block's `CREDS_MCP_WINDOWS_BINARY`. */
  readonly windowsBinary: string;
}

/**
 * The argv that asks the recorded install its version — or `[]` when its paths cannot be passed safely.
 *
 * <p><b>The block, replayed.</b> `env CREDS_MCP_WINDOWS_BINARY=… <linux> --version`: the Windows half
 * `--version` reports is resolved from that variable, so without it the probe would describe a
 * DIFFERENT Windows half than the client launches. `env` is a program, not a shell — every word goes
 * across as an argument, so a quote or a space in a path is never a command (E2 plan round, finding
 * 0).</p>
 *
 * <p><b>Refused, never quoted:</b> a Linux path that is not absolute (it would be resolved through
 * PATH — exactly the binary we must not ask, E1 plan round, finding 1) or that holds `=` (which `env`
 * reads as one more assignment, so the binary would never run), a Windows path that is not a
 * distribution path, and any line break.</p>
 */
export function versionArgv(distro: string, install: RecordedWslInstall): string[] {
  if (!probeSafe(install)) {
    return [];
  }
  return [
    ...distroArgv(distro),
    '-e',
    'env',
    `${WINDOWS_BINARY_VARIABLE}=${install.windowsBinary}`,
    install.linuxBinary,
    '--version',
  ];
}

function probeSafe(install: RecordedWslInstall): boolean {
  const absolute = install.linuxBinary.startsWith('/') && install.windowsBinary.startsWith('/');
  const plain = !/[\r\n\0]/.test(`${install.linuxBinary}${install.windowsBinary}`);
  return absolute && plain && !install.linuxBinary.includes('=');
}

/** What the bounded probe came back with — `wslProcess.ts`'s `WslOutcome`, restated so this file stays pure. */
export type ProbeAnswer = { kind: 'timeout' } | { kind: 'exited'; code: number | null; stdout: string };

/** Which half of the bridge is behind. */
export type Half = 'linux' | 'windows';

/** What the probe read, for the person: each half's answer and the Windows path the Linux half asked. */
export interface VersionReading {
  /** The Linux half's version; `''` when it has no `--version`. */
  readonly linux: string;
  /** The Windows half's answer as printed — `creds-mcp 0.12.0`, or one of E2's three words; `''` when absent. */
  readonly windows: string;
  /** The Windows executable the Linux half asked; `''` when it did not say. */
  readonly windowsPath: string;
  /** Which halves are older than expected — empty when current. */
  readonly behind: readonly Half[];
}

export type StaleVerdict =
  | ({ kind: 'current' } & VersionReading)
  | ({ kind: 'older' } & VersionReading)
  | { kind: 'unknown' };

/**
 * Current, older, or unknown — for both halves of the bridge (plan §5.8).
 *
 * <p><b>Older</b>: the Linux half has no `--version` (every release before 0.10.0 answers it with a
 * usage error and a non-zero exit — and so does a binary that is no longer there), or a half reports
 * a version below `expected`, or the Windows half reports no version at all (E2's words *older than
 * --version, or no answer*, *answered without a version*, *not started*). The Windows half is judged
 * too because the motivating config pointed at a manual Windows install: a current Linux binary in
 * front of it still withheld every fix.</p>
 *
 * <p><b>Unknown</b>: the probe timed out. A distribution that did not answer is no evidence of an old
 * binary (question consultation `85327e0e`), so it is never reported as one.</p>
 */
export function staleVerdict(answer: ProbeAnswer, expected: string): StaleVerdict {
  if (answer.kind === 'timeout') {
    return { kind: 'unknown' };
  }
  const reading = readVersion(answer.code === 0 ? answer.stdout : '', expected);
  return { kind: reading.behind.length === 0 ? 'current' : 'older', ...reading };
}

function readVersion(stdout: string, expected: string): VersionReading {
  const lines = stdout.split(/\r?\n/).map((line) => line.trim());
  const linux = versionIn(lineStarting(lines, 'creds-mcp '));
  const { windows, windowsPath } = windowsHalfIn(lineStarting(lines, 'windows half: '));
  const halves: [Half, string][] = [['linux', linux], ['windows', versionIn(windows)]];
  return {
    linux,
    windows,
    windowsPath,
    behind: halves.filter(([, version]) => isBehind(version, expected)).map(([half]) => half),
  };
}

function lineStarting(lines: readonly string[], prefix: string): string {
  return lines.find((line) => line.startsWith(prefix)) ?? '';
}

/**
 * `windows half: <answer> (<path>)` → its two parts. The answer never holds ` (` — a version or one of
 * E2's fixed words — so the FIRST ` (` splits, and a path like `Program Files (x86)` stays whole.
 */
function windowsHalfIn(line: string): { windows: string; windowsPath: string } {
  // String steps, not a regular expression: `(.*?) \((.*)\)` backtracks super-linearly on a long line
  // (SonarCloud S8786 on #213), and the line comes from a binary inside the distribution.
  const rest = line.slice('windows half: '.length);
  const open = rest.indexOf(' (');
  const whole = line.startsWith('windows half: ') && open > 0 && rest.endsWith(')');
  return whole ? { windows: rest.slice(0, open), windowsPath: rest.slice(open + 2, -1) } : { windows: '', windowsPath: '' };
}

/** `creds-mcp 0.12.0` → `0.12.0`; anything else → `''`. */
function versionIn(line: string): string {
  const rest = line.startsWith('creds-mcp ') ? line.slice('creds-mcp '.length) : '';
  return /^\d\S*$/.test(rest) ? rest : '';
}

function isBehind(version: string, expected: string): boolean {
  return version === '' || compareVersions(version, expected) < 0;
}

/** `''` shown as the words a person can read. */
function said(value: string, nothing: string): string {
  return value === '' ? nothing : value;
}

/**
 * What the person reads when the install is older: the distribution, both versions, both paths, the remedy.
 *
 * <p>It claims only what was checked — the binaries of the block this extension LAST COPIED for that
 * distribution (plan round, finding 1): copying a block does not prove the client pasted it, so the
 * message never says "your client runs …".</p>
 */
export function staleInstallMessage(
  distro: string,
  linuxBinary: string,
  expected: string,
  reading: VersionReading,
): string {
  return (
    `The MCP server whose config this extension last copied for ${distro} is older than this ` +
    `window's creds-mcp ${expected}: ${linuxBinary} answers ${said(reading.linux, 'no --version')}, and ` +
    `the Windows half it starts, ${said(reading.windowsPath, '(not named)')}, answers ` +
    `${said(reading.windows, 'nothing')}. Fixes released since do not reach an agent in ${distro} until ` +
    'it is updated. Update installs the current one there and puts its config block on your clipboard — ' +
    'paste it into the MCP client inside that distribution and restart it.'
  );
}

/** What the person reads when the install is current — with the same honest limit. */
export function currentInstallMessage(distro: string, linuxBinary: string, reading: VersionReading): string {
  return (
    `The MCP server whose config this extension last copied for ${distro} is current: ${linuxBinary} ` +
    `answers ${reading.linux}, and the Windows half ${reading.windowsPath} answers ${reading.windows}. ` +
    'A client whose config names a different path is not covered by this check.'
  );
}

/** What the person reads when the extension never set up an install in that distribution. */
export function notRecordedMessage(distro: string): string {
  return (
    `This extension has not recorded an MCP install in ${distro}, so it cannot tell which build an ` +
    'agent there starts — a config written by hand names a path it never saw. Update installs the ' +
    'current one there and puts its config block on your clipboard; paste it into the MCP client ' +
    'inside that distribution and restart it.'
  );
}

/** What the person reads when the probe did not answer in time. */
export function unansweredMessage(distro: string): string {
  return (
    `creds-mcp in ${distro} did not answer --version in time — the distribution may be busy. Nothing ` +
    'was concluded; check again in a moment.'
  );
}

/** What the person reads when the recorded paths cannot be passed to the probe safely. */
export function refusedPathMessage(distro: string): string {
  return (
    `The path recorded for ${distro} cannot be checked safely, so it was not run. Update installs the ` +
    'current MCP server there and records a fresh one.'
  );
}

/** What the person reads when this window's own Windows half is too old (or absent) for a check to mean anything. */
export function cannotJudgeMessage(expected: string): string {
  const have = expected === '' ? 'no creds-mcp installed by this extension' : `creds-mcp ${expected}`;
  return (
    `This window has ${have}; the WSL check needs ${VERSION_FLAG_SINCE} or later, the first release ` +
    'that answers --version. Install the MCP Server… first, then check again.'
  );
}
