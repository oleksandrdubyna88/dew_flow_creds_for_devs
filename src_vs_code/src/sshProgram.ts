import * as fs from 'fs';
import * as path from 'path';
import type { EntityMetadata } from './types';

/**
 * Which OpenSSH binary this extension launches, and the environment that lets it reach the
 * agent this extension serves.
 *
 * <p><b>Why this module exists — measured 2026-08-26.</b> Agent forwarding had been wired end
 * to end for months: a per-entity checkbox, `-A` in the argv (`sshOptions.ts`), and an agent
 * serving keys from memory, asking before it signs (`sshAgentServer.ts`). On Windows it
 * forwarded nothing, and could not have. Two independent reasons, neither of which produces an
 * error:</p>
 *
 * <ul>
 *   <li><b>The wrong binary.</b> The extension spawned a bare `ssh`, resolved from `PATH`.
 *       Wherever Git for Windows is installed — which is everywhere this extension is useful —
 *       that is an MSYS build, and an MSYS binary <b>cannot open a named pipe</b>: it answers
 *       `Bad file descriptor`. Our agent listens on a named pipe on Windows. The built-in
 *       `C:\Windows\System32\OpenSSH\ssh.exe` reaches it — observed through
 *       `scripts/ssh-agent-itest.cjs`, which drives the real client against the real server.</li>
 *   <li><b>The variable never arrived.</b> `SSH_AUTH_SOCK` is published through VS Code's
 *       `EnvironmentVariableCollection`, which by contract reaches TERMINALS. A child spawned by
 *       the extension host inherits `process.env`, where it was never set.</li>
 * </ul>
 *
 * <p>An `ssh` that cannot find an agent does not fail — it authenticates some other way and
 * forwards nothing. That is how this survived a review: there is no error to notice, and the
 * unit test asserting `-A` is in the argv was green the entire time. It proved the flag was
 * SENT. Whether anything received it is a fact about a different process. See the shared rule
 * <i>A measure you have not OBSERVED working is a comment</i>.</p>
 *
 * <p><b>Both substitutions happen only when the entity asks for agent forwarding</b>, because
 * that is the only case where either is load-bearing and both cost something elsewhere: the
 * built-in client is not the one a person's own `~/.ssh/config` was written against, and
 * exporting `SSH_AUTH_SOCK` makes our agent the AUTHENTICATION agent for that connection —
 * which means a consent dialog for a key nobody chose. Tying both to the checkbox leaves every
 * other connection exactly as it was.</p>
 *
 * <p>Pure, apart from one injected existence check.</p>
 */

/** Where Windows keeps the OpenSSH that can talk to a named pipe. */
export const WINDOWS_OPENSSH_DIR = 'C:/Windows/System32/OpenSSH';

export type OpenSshTool = 'ssh' | 'ssh-add' | 'ssh-keygen' | 'ssh-keyscan';

/** The built-in tool's full path. Not a promise that it is installed — ask `openSshProgram`. */
export function builtInOpenSsh(tool: OpenSshTool): string {
  return `${WINDOWS_OPENSSH_DIR}/${tool}.exe`;
}

/**
 * The same directory as a WSL distribution sees it, under the default automount root.
 *
 * <p>A constant rather than a `wslpath` call, and that is a trade worth naming. `wslpath -a` is the
 * general answer and this repository already asks it (`translateWindowsPath`), but it costs a
 * `wsl.exe` subprocess on a path that runs on every Connect click, to translate a string that is
 * fixed on every machine with the default `[automount] root`. Verified on the reporting machine:
 * `wslpath -u 'C:\Windows\System32\OpenSSH\ssh.exe'` answers exactly this.</p>
 *
 * <p>What a non-default automount root gets is a terminal saying the file does not exist, in front
 * of a person who is looking at it — visible, not silent, which is the property that matters.</p>
 */
export const WSL_WINDOWS_OPENSSH_DIR = '/mnt/c/Windows/System32/OpenSSH';

/**
 * The Windows OpenSSH client as the WSL shell must spell it to launch it, or `''` when this machine
 * has no such client to lend.
 *
 * <p><b>Why a Windows client is worth launching from a Linux shell at all.</b> A vault key lives on
 * Windows, and the whole defect this answers is that the distribution's own `ssh` cannot use it:
 * /mnt/c reports 0777, `chmod` there is a no-op, and OpenSSH refuses a key whose permissions it
 * cannot trust. The Windows client reads the same file under Windows ACLs, where those permissions
 * are real — so the key stays exactly where it already is, which is also the strongest thing that
 * can be said about it.</p>
 *
 * <p>Checked from the WINDOWS side, because that is the side the extension host runs on and a stat
 * there costs nothing. The distribution's ability to launch it needs interop, which is on by default
 * and whose absence, again, lands in a terminal rather than in silence.</p>
 */
export function wslWindowsSshClient(
  platform: NodeJS.Platform = process.platform,
  exists: (candidate: string) => boolean = fs.existsSync,
): string {
  return wslWindowsSshClientOn(platform, exists);
}

/** Split from its defaults exactly as `sshClientPresent` is, and for the same ceiling. */
function wslWindowsSshClientOn(
  platform: NodeJS.Platform,
  exists: (candidate: string) => boolean,
): string {
  if (platform !== 'win32') {
    return ''; // WSL runs on Windows; no other host has one to lend
  }
  return exists(builtInOpenSsh('ssh')) ? `${WSL_WINDOWS_OPENSSH_DIR}/ssh.exe` : '';
}

/** How the probe sees the PATH: injectable, so the decision is a unit test. */
export interface PathProbe {
  readonly pathDirs: readonly string[];
  /** Whether this directory holds an `ssh` executable. */
  readonly hasTool: (dir: string) => boolean;
}

/**
 * The directories a `PATH` value names.
 *
 * <p>Exported and given its delimiter because the split used to be a hard-coded `;`, and that is
 * not a Windows detail that stays harmlessly wrong off Windows: on Linux the whole colon-joined
 * `PATH` became ONE bogus entry, `hasTool` was never true, and `pathSshIsBuiltIn` always answered
 * false. CI runs on Linux — so the two tests that assert this logic passed there for that reason and
 * for no other, while failing on any Windows machine whose `PATH` puts the built-in client first
 * (audit 2026-09-09, finding #8).</p>
 */
export function pathDirsOf(value: string | undefined, delimiter: string): string[] {
  return (value ?? '').split(delimiter).filter((dir) => dir.length > 0);
}

/**
 * The probe production uses when no caller injects one.
 *
 * <p>Exported so a test can assert what it actually SEES. The review gate's point: a test that only
 * checks `pathSshIsBuiltIn` on a Linux runner gets `false` whether the probe read the environment or
 * ignored it entirely — which is the shape of a test with no teeth, and exactly the defect this
 * change is about.</p>
 *
 * <p>The delimiter follows the TARGET platform, not the host. They are the same in every shipped
 * path, and differ only for a caller that names `win32` while running elsewhere — where taking the
 * host's `:` would split a Windows `PATH` into one bogus entry, which is the bug this change
 * removes, reintroduced from the other side.</p>
 */
export function defaultProbe(platform: NodeJS.Platform = process.platform): PathProbe {
  return {
    pathDirs: pathDirsOf(process.env.PATH, platform === 'win32' ? ';' : ':'),
    hasTool: (dir) => fs.existsSync(path.join(dir, 'ssh.exe')),
  };
}

/** A PATH entry, comparable: separators unified, trailing separator dropped, case folded. */
function normalizeDir(dir: string): string {
  return dir.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
}

/**
 * Whether the FIRST `ssh` a bare spawn would find on this machine's PATH is the built-in
 * Windows OpenSSH — the one that can open our agent's named pipe.
 *
 * <p>This is what deletes the `C:/Windows/System32/OpenSSH/ssh.exe` path from the viewer on a
 * modern Windows (tails T20): System32\OpenSSH is usually ON the PATH, and when it wins the
 * race the bare word `ssh` already does everything the full path was defending against — so
 * the command a person copies is the command they would have typed. Only when an MSYS ssh
 * (Git for Windows) shadows it does the full path still earn its place.</p>
 *
 * <p>First hit decides, exactly as `CreateProcess` would resolve the bare word.</p>
 */
export function pathSshIsBuiltIn(
  platform: NodeJS.Platform,
  probe: PathProbe = defaultProbe(platform),
): boolean {
  if (platform !== 'win32') {
    return false; // off Windows there is no built-in/MSYS split to detect
  }
  const builtIn = normalizeDir(WINDOWS_OPENSSH_DIR);
  const first = probe.pathDirs.find((dir) => probe.hasTool(dir));
  return first !== undefined && normalizeDir(first) === builtIn;
}

/**
 * The binary to launch for `tool`.
 *
 * <p>`needsAgent` is the whole switch: false, or off Windows, and this is the bare name so the
 * person's own `PATH` decides, as it always did. Only when a connection actually depends on
 * reaching our agent does the built-in client get named — and even then, only if it is there.
 * A Windows install without it falls back rather than failing to spawn, which is the difference
 * between a connection that forwards nothing and no connection at all.</p>
 */
/**
 * The one situation where the binary is not a matter of taste: our agent is a named pipe, and
 * only the built-in client can open one.
 */
function mustUseBuiltIn(needsAgent: boolean, platform: NodeJS.Platform): boolean {
  return needsAgent && platform === 'win32';
}

/**
 * The binary to SPAWN — which is not always the one to show.
 *
 * <p>`openSshProgram` hands back the bare word whenever the PATH already resolves `ssh` to the
 * built-in client, so that the command in the viewer is one a person could have typed. For a
 * string that is read or pasted into a shell that is right. For `spawn(program, …, { shell: false
 * })` it is not: on Windows a relative name is resolved the way `CreateProcess` resolves one, and
 * the CURRENT DIRECTORY is searched ahead of `PATH`. An `ssh.exe` left in the extension host's
 * working directory would be the client launched with `-A` and with `SSH_AUTH_SOCK` pointing at our
 * agent — the single connection where the client is handed keys. CWE-426; found by CodeRabbit.</p>
 *
 * <p>It also closes a smaller hole that needs no attacker at all: `PATH` is read when the probe
 * runs and again when the process starts, and nothing holds it still in between.</p>
 *
 * <p>Only where the built-in is REQUIRED — agent forwarding, on Windows, and only if it is there.
 * Everywhere else this is the bare word, because everywhere else the person's own `PATH` should
 * decide, exactly as it always did. It takes no `PathProbe`: what the PATH resolves to is the
 * question the VIEWER asks, and the answer this one needs does not depend on it.</p>
 */
export function openSshBinary(
  tool: OpenSshTool,
  needsAgent: boolean,
  platform: NodeJS.Platform,
  exists: (candidate: string) => boolean = fs.existsSync,
): string {
  if (!mustUseBuiltIn(needsAgent, platform)) {
    return tool;
  }
  const builtIn = builtInOpenSsh(tool);
  return exists(builtIn) ? builtIn : tool;
}

export function openSshProgram(
  tool: OpenSshTool,
  needsAgent: boolean,
  platform: NodeJS.Platform,
  exists: (candidate: string) => boolean = fs.existsSync,
  probe?: PathProbe,
): string {
  // The bare word is preferred whenever it can serve: no agent needed, not Windows, or —
  // since T20 — the PATH already resolves ssh to the built-in, so the command shown in the
  // viewer is the one a person could have typed.
  return mustUseBuiltIn(needsAgent, platform) ? forcedProgram(tool, platform, exists, probe) : tool;
}

/** The full path remains only where an MSYS ssh shadows the built-in on the PATH. */
function forcedProgram(
  tool: OpenSshTool,
  platform: NodeJS.Platform,
  exists: (candidate: string) => boolean,
  probe?: PathProbe,
): string {
  if (pathSshIsBuiltIn(platform, probe)) {
    return tool;
  }
  const builtIn = builtInOpenSsh(tool);
  return exists(builtIn) ? builtIn : tool;
}

/**
 * Said when forwarding was asked for and there is no agent behind it.
 *
 * <p>The point of saying anything at all: this is the exact state the whole module is about, and
 * left alone it looks identical to success.</p>
 */
export const NO_AGENT_TO_FORWARD =
  'agent forwarding is on for this connection, but no key is loaded — ' +
  'nothing will be forwarded until one is loaded into the agent';

export interface AgentForwardEnv {
  env: NodeJS.ProcessEnv;
  /** Present when `-A` was asked for with no agent running. */
  warning?: string;
}

/**
 * The child's environment, with `SSH_AUTH_SOCK` added when — and only when — this connection
 * asked to forward the agent and there is one to forward.
 *
 * <p>Returns a new object; the caller's environment is never mutated.</p>
 */
export function agentForwardEnv(
  base: NodeJS.ProcessEnv,
  agentForward: boolean,
  socketPath: string | undefined,
): AgentForwardEnv {
  if (!agentForward) {
    return { env: base };
  }
  if (socketPath === undefined || socketPath.length === 0) {
    return { env: base, warning: NO_AGENT_TO_FORWARD };
  }
  return { env: { ...base, SSH_AUTH_SOCK: socketPath } };
}

/**
 * Whether ANY usable ssh client exists on this machine (tails T20): the built-in Windows one,
 * or something answering to the bare word on PATH. Cheap stats only — this runs on every
 * connect click.
 */
export function sshClientPresent(
  platform?: NodeJS.Platform,
  env?: NodeJS.ProcessEnv,
  exists?: (p: string) => boolean,
): boolean {
  return sshClientPresentOn(
    platform ?? process.platform,
    env ?? process.env,
    exists ?? fs.existsSync,
  );
}

function sshClientPresentOn(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  exists: (p: string) => boolean,
): boolean {
  return (
    (platform === 'win32' && exists(builtInOpenSsh('ssh'))) ||
    pathHoldsSsh(platform, env.PATH ?? '', exists)
  );
}

/** Whether any PATH directory holds an ssh executable, judged with the ARGUMENT platform's
 * separator — the host's `path.join` would build `/usr/bin\ssh` when a Windows machine
 * reasons about a Linux PATH, which is exactly what the test does. */
function pathHoldsSsh(
  platform: NodeJS.Platform,
  pathValue: string,
  exists: (p: string) => boolean,
): boolean {
  const dirs = pathValue.split(platform === 'win32' ? ';' : ':');
  const names = platform === 'win32' ? ['ssh.exe', 'ssh'] : ['ssh'];
  const join = platform === 'win32' ? path.win32.join : path.posix.join;
  return dirs.some((dir) => dir.length > 0 && names.some((n) => exists(join(dir, n))));
}

// ---- the spawn of Run with Secrets over SSH (E3.S1) ---------------------------------------------------------------------

/**
 * The program and environment of an `ssh` that the extension host SPAWNS for `entity` (not one typed into a terminal): the agent's
 * `ssh:exec` (`agentAwareLaunch`) and Run with Secrets over SSH (`SshRoad.spawnLaunch`) both use it, so the composition lives once.
 * `openSshBinary` chooses the program (the built-in Windows client only when agent forwarding needs a named pipe) and
 * `agentForwardEnv` adds `SSH_AUTH_SOCK` when — and only when — the entry forwards the agent and there is one. `warning` is
 * `NO_AGENT_TO_FORWARD`, present only when forwarding was asked for with no agent behind it.
 */
export function sshSpawnLaunch(
  entity: EntityMetadata,
  socket: string | undefined,
  platform: NodeJS.Platform,
): { program: string; env: NodeJS.ProcessEnv; warning?: string } {
  const wanted = entity.agentForward === true;
  const forwarding = agentForwardEnv({}, wanted, socket);
  const launch = { program: openSshBinary('ssh', wanted, platform), env: forwarding.env };
  return forwarding.warning === undefined ? launch : { ...launch, warning: forwarding.warning };
}

/** Said when no ssh client can be started for Run with Secrets over SSH (E3-D5): nothing was run, and nothing was asked. */
export const NO_SSH_TO_SPAWN =
  'No ssh client was found to start: no absolute folder of PATH holds ssh.exe, and C:\\Windows\\System32\\OpenSSH\\ssh.exe is not there. ' +
  'Nothing was run: install the OpenSSH client, then run this again.';

/** A Windows path that names its own drive or share: a drive letter, or a `\\` (two backslashes) prefix. `.`, `tools` and `\dir` are relative to something. */
function isAbsoluteWindows(candidate: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(candidate) || candidate.startsWith('\\\\');
}

/**
 * The program to SPAWN for Run with Secrets over SSH, from the one `openSshBinary` chose: never a bare name on Windows (CWE-426).
 *
 * <p>`openSshBinary` answers the bare word `ssh` without agent forwarding, and a bare name given to `spawn(…, { shell: false })` on
 * Windows is resolved the way `CreateProcess` resolves one: the CURRENT folder is searched ahead of `PATH` (the hole named in
 * `openSshBinary`'s doc). An `ssh.exe` in a repository would receive the askpass password and every value on stdin. So on Windows a
 * program with a drive letter or a `\\` (two backslashes) prefix is kept (the built-in client `openSshBinary` named), and a bare name becomes the FIRST
 * `ssh.exe` in an ABSOLUTE folder of `PATH` (a relative entry — `.`, `tools`, `\dir` — is skipped and never asked), else the
 * built-in OpenSSH when it exists, else `undefined` (the caller says `NO_SSH_TO_SPAWN`). That keeps the client a bare spawn would
 * find, minus the current folder, as `openSshBinary`'s doc wants. Off Windows the program is kept: `execvp` searches `PATH`, not
 * the current folder. The caller also gives the child a folder of its own, which closes the same hole on POSIX with a `.` in `PATH`.</p>
 */
export function spawnableSshProgram(
  program: string,
  platform: NodeJS.Platform,
  pathValue: string | undefined,
  exists: (candidate: string) => boolean,
): string | undefined {
  if (platform !== 'win32' || isAbsoluteWindows(program)) {
    return program;
  }
  const found = pathDirsOf(pathValue, ';')
    .filter(isAbsoluteWindows)
    .map((dir) => path.win32.join(dir, 'ssh.exe'))
    .find(exists);
  return found ?? builtInIfThere(exists);
}

function builtInIfThere(exists: (candidate: string) => boolean): string | undefined {
  return exists(builtInOpenSsh('ssh')) ? builtInOpenSsh('ssh') : undefined;
}

// ---- what E3's two roads take out of the inherited environment (parent D17 (a)) --------------------------------------------

/** The name of the variable through which an ssh finds an agent. */
export const AGENT_SOCKET_ENV = 'SSH_AUTH_SOCK';

/** What is taken out of an inherited environment: the names, and every name that starts with one of the prefixes. */
export interface EnvDrop {
  readonly names: readonly string[];
  readonly prefixes: readonly string[];
}

/** Nothing is taken out: the environment of a masked run that names no `withoutEnv`. */
export const NOTHING_DROPPED: EnvDrop = { names: [], prefixes: [] };

/**
 * What E3's two roads (Run with Secrets over SSH, the agent's linked run) remove from the ssh child's inherited environment: the
 * extension host's own `SSH_AUTH_SOCK`, so the person's own agent is not offered through the inherited variable, and every
 * `CREDS_REF_` name, so no reference variable of another run reaches the remote through a `SendEnv` pattern (parent D17 (a)).
 */
export const E3_INHERITED_DROP: EnvDrop = { names: [AGENT_SOCKET_ENV], prefixes: ['CREDS_REF_'] };

/**
 * A COPY of `base` without each key that equals one of `drop.names` or starts with one of `drop.prefixes`. On Windows both match in any
 * letter case, because a Windows environment does not tell `SSH_AUTH_SOCK` from `Ssh_Auth_Sock`; on every other platform exactly.
 * Pure, with no condition: the caller lays what it adds (askpass, its own socket) on top of the result.
 */
export function envWithout(base: NodeJS.ProcessEnv, drop: EnvDrop, platform: NodeJS.Platform): NodeJS.ProcessEnv {
  const fold = platform === 'win32' ? (text: string): string => text.toUpperCase() : (text: string): string => text;
  const names = new Set(drop.names.map(fold));
  const prefixes = drop.prefixes.map(fold);
  const dropped = (key: string): boolean => names.has(fold(key)) || prefixes.some((prefix) => fold(key).startsWith(prefix));
  return Object.fromEntries(Object.entries(base).filter(([key]) => !dropped(key)));
}
