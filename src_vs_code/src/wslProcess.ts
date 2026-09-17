import * as childProcess from 'node:child_process';
import * as path from 'node:path';
import { killChild } from './childKill';
import { withTimeout } from './withTimeout';
import { wslPathArgv } from './wslMcpInstall';

/**
 * Running `wsl.exe` and reading what it said.
 *
 * <p>Extracted from `extension.ts` when a second feature needed it — the MCP install, which puts
 * the Linux half of the bridge into a distribution. A second copy of a spawn that has one
 * measured encoding rule in it is exactly the drift the shared-implementation rule exists for.</p>
 *
 * <p>Neither ever rejects. A missing `wsl.exe` is the ordinary case on a machine without WSL, and
 * a caller asking "which distributions are there" wants an empty answer, not an exception to
 * catch. Every failure therefore reads as "it said nothing".</p>
 */

/**
 * The launcher to spawn — by its full path, never by the bare name.
 *
 * <p><b>CWE-426, and this repository has already had it once.</b> `spawn(name, …, { shell: false })`
 * resolves a relative name the way `CreateProcess` does, and `CreateProcess` searches the CURRENT
 * DIRECTORY **before** `PATH`. A `wsl.exe` left in the extension host's working directory is then the
 * program that runs — with our arguments, on every distribution listing, path translation and relay
 * start. `sshProgram.ts` names the same defect for `ssh.exe` and fixes it the same way; flagged here
 * by SonarCloud (`typescript:S4036`) on the one new call site, and fixed at all four, because leaving
 * three behind would be fixing the instance and not the class.</p>
 *
 * <p><b>ALWAYS absolute, with no fallback to the bare name</b> — a review caught the first version
 * returning `'wsl.exe'` when the absolute file was missing, which hands the search back to
 * `CreateProcess` in precisely the case the guard exists for. There is nothing to fall back TO: a
 * machine with no `wsl.exe` in System32 has no WSL, and pointing `spawn` at a path that is not there
 * produces an `error` event, which every caller in this module already answers with "it said
 * nothing". `SystemRoot` is read rather than hard-coded, and `windir` after it, because a Windows
 * that is not on C: is unusual and not impossible.</p>
 */
export function wslBinary(env: NodeJS.ProcessEnv = process.env): string {
  const root = env.SystemRoot ?? env.windir ?? 'C:\\Windows';
  return path.win32.join(root, 'System32', 'wsl.exe');
}

/** Text out of a WSL child, with whatever it wrote to stdin first. Empty when it could not run. */
export function runWsl(args: readonly string[], stdin?: string): Promise<string> {
  return new Promise((resolve) => {
    const child = childProcess.spawn(wslBinary(), [...args], {
      stdio: ['pipe', 'pipe', 'ignore'],
      windowsHide: true,
    });
    let out = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      out += chunk;
    });
    child.on('error', () => resolve(''));
    child.on('close', () => resolve(out));
    child.stdin.end(stdin ?? '');
  });
}

/**
 * The same child, but handing back BYTES.
 *
 * <p>`wsl -l -q` answers in UTF-16LE — measured, the bytes begin `55 00 62 00`. Decoding it as
 * UTF-8 gives names interleaved with NULs that match nothing, and the symptom is "no
 * distributions found" rather than anything that points at an encoding.</p>
 */
export function runWslRaw(args: readonly string[]): Promise<Buffer> {
  return new Promise((resolve) => {
    const child = childProcess.spawn(wslBinary(), [...args], {
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
    const chunks: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.on('error', () => resolve(Buffer.alloc(0)));
    child.on('close', () => resolve(Buffer.concat(chunks)));
  });
}

/**
 * How a `wsl.exe` child is started, injectable so the bounded path can be tested.
 *
 * <p>The precedent is `RelaySpawner` in `wslRelayManager.ts`: CI is Linux and has no `wsl.exe`, so
 * a hang test that could only run on a Windows machine with WSL installed is a test that never
 * runs. Both defaults below are the real thing.</p>
 */
export type WslSpawner = (args: readonly string[]) => childProcess.ChildProcess;

const spawnWsl: WslSpawner = (args) =>
  childProcess.spawn(wslBinary(), [...args], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });

/**
 * `runWsl` with a deadline, and a child that is actually killed when the deadline passes.
 *
 * <p><b>Why this exists beside `runWsl`.</b> `runWsl` never rejects, which is the right shape for
 * "which distributions are there" — but it also never gives up. A stopped distribution, or one
 * waiting on a lock, leaves the promise pending for ever; when that promise is on the path of a
 * button click the person sees an editor that has simply stopped answering, with no error anywhere.
 * Raised by the plan round, and the code it is built from was already here: `withTimeout` for the
 * deadline, `killChild(child, {tree: true})` for the part a bare timeout gets wrong — `wsl.exe`
 * starts a distribution process that outlives the signal, so without the tree step the deadline
 * abandons a child rather than ending it.</p>
 *
 * <p>Every failure is the same answer — the empty string — because every one of them means the same
 * thing to a caller: the distribution did not tell us. A non-zero exit is a failure too: `wslpath`
 * prints its complaint on stderr and exits 1, and treating that as an answer would hand a caller
 * the empty stdout as though it were a path.</p>
 */
export async function runWslBounded(
  args: readonly string[],
  ms: number,
  spawn: WslSpawner = spawnWsl,
): Promise<string> {
  const child = spawn(args);
  const answered = await withTimeout(collect(child), ms);
  if (answered === undefined) {
    killChild(child, { tree: true });
    return '';
  }
  return answered;
}

/** Stdout if it exited cleanly, `''` for every other ending. Never rejects — `withTimeout` forbids it. */
function collect(child: childProcess.ChildProcess): Promise<string> {
  return new Promise((resolve) => {
    let out = '';
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      out += chunk;
    });
    child.on('error', () => resolve(''));
    child.on('close', (code) => resolve(code === 0 ? out : ''));
  });
}

/** How long a path translation may take before the click is refused instead of waiting. */
export const TRANSLATE_TIMEOUT_MS = 5_000;

/**
 * Where a Windows path is, as the distribution itself reports it — `''` when it would not say.
 *
 * <p><b>Asked, never composed.</b> `/mnt/c/...` is the DEFAULT automount root and not a rule: it is
 * configurable in `/etc/wsl.conf`, so composing the path is a guess that breaks on the first machine
 * that moved it — the same reasoning `mcpInstallTarget.ts` records for the MCP install, and the
 * reason `wslPathArgv` is imported rather than re-written here.</p>
 *
 * <p>One absolute POSIX line or nothing. A timeout, a non-zero exit, empty output and anything that
 * is not a single absolute path all answer `''`, so the caller has ONE failure to handle and cannot
 * accidentally pass a greeting to `ssh`.</p>
 */
export async function translateWindowsPath(
  distro: string,
  windowsPath: string,
  ms: number = TRANSLATE_TIMEOUT_MS,
  spawn?: WslSpawner,
): Promise<string> {
  return onlyAbsolutePath(await runWslBounded(wslPathArgv(distro, windowsPath), ms, spawn));
}

function onlyAbsolutePath(text: string): string {
  const lines = text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
  const only = lines.length === 1 ? lines[0] : '';
  return only.startsWith('/') ? only : '';
}
