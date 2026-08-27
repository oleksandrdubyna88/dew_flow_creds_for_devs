import * as fs from 'fs';
import * as path from 'path';

/**
 * Which OpenSSH binary this extension launches, and the environment that lets it reach the
 * agent this extension serves.
 *
 * <p><b>Why this module exists — measured 2026-08-26.</b> Agent forwarding had been wired end
 * to end for months: a per-entity checkbox, `-A` in the argv (`sshOptions.ts`), and an agent
 * serving keys from memory with a dialog per signature (`sshAgentServer.ts`). On Windows it
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

/** How the probe sees the PATH: injectable, so the decision is a unit test. */
export interface PathProbe {
  readonly pathDirs: readonly string[];
  /** Whether this directory holds an `ssh` executable. */
  readonly hasTool: (dir: string) => boolean;
}

function defaultProbe(): PathProbe {
  return {
    pathDirs: (process.env.PATH ?? '').split(';').filter((dir) => dir.length > 0),
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
  probe: PathProbe = defaultProbe(),
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
