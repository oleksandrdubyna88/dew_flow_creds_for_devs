import { spawn } from 'node:child_process';
import { MAX_STREAM_BYTES } from './brokerProtocol';

/**
 * Running one `ssh` for an agent. The part that cannot be unit tested honestly
 * — spawning someone else's binary — kept apart from `sshExecCommand.ts`,
 * which holds the argv rules that can.
 *
 * <p>Three ceilings, all of them enforced here rather than hoped for: bytes
 * (capped while streaming, so a runaway remote process cannot grow the
 * extension host's memory no matter how much it prints), wall-clock (a hung
 * ssh is killed, not waited on), and a kill escalation (SIGTERM, then SIGKILL)
 * so a child that ignores the polite signal still goes.</p>
 *
 * <p>`shell: false` is not a default worth relying on silently: the whole
 * point of the argv array is that nothing the agent wrote is ever parsed by a
 * local shell, and the one existing `execFile` in this codebase does set
 * `shell` on Windows for `.cmd` shims. `ssh` is a native binary; it needs no
 * shell, and adding one would reopen local injection.</p>
 */

const KILL_GRACE_MS = 2_000;

export interface SshExecOptions {
  env: NodeJS.ProcessEnv;
  /**
   * The ssh binary to launch. Absent means the bare name, resolved from `PATH` — right for
   * everything that does not depend on reaching the agent this extension serves. The one case
   * that does, and why, is `sshProgram.ts`.
   */
  program?: string;
  timeoutMs: number;
  /**
   * Kills the child when it fires — the window going away, or the request it serves ending — so no ssh
   * outlives what it was for. Already fired: nothing is launched at all.
   */
  signal?: AbortSignal;
  /**
   * Refuses the LAUNCH once it has fired, without killing a child already running. For work that must
   * finish once started (a rotation's statement, `useActions.launchSignals`), where `signal` is only the
   * window's and the request's end may still stop the start but not the run.
   */
  startGate?: AbortSignal;
  /**
   * Working directory for the child. Absent means this process's own, which is what every
   * ssh caller wants; the git transport needs its clone, and `git -C` would have to be
   * threaded through every argv builder to say the same thing.
   */
  cwd?: string;
}

export interface SshExecOutcome {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  timedOut: boolean;
  durationMs: number;
}

/** Accumulates up to a cap, keeps draining past it, and says so. */
class Bounded {
  private readonly chunks: Buffer[] = [];
  private size = 0;
  truncated = false;

  append(chunk: Buffer): void {
    if (this.size >= MAX_STREAM_BYTES) {
      this.truncated = true;
      return;
    }
    const room = MAX_STREAM_BYTES - this.size;
    if (chunk.length > room) {
      this.chunks.push(chunk.subarray(0, room));
      this.size = MAX_STREAM_BYTES;
      this.truncated = true;
      return;
    }
    this.chunks.push(chunk);
    this.size += chunk.length;
  }

  text(): string {
    return Buffer.concat(this.chunks).toString('utf8');
  }
}

export function runSshExec(argv: string[], options: SshExecOptions): Promise<SshExecOutcome> {
  return runBounded(options.program ?? 'ssh', argv, false, options);
}

/**
 * The same bounded child for any command: byte caps per stream, a wall-clock timeout
 * escalating SIGTERM → SIGKILL, and an AbortSignal so nothing outlives the broker.
 *
 * <p>Extracted when a second kind needed it. None of these ceilings were ever
 * ssh-specific — only the binary's name was, and leaving the generic machinery in a file
 * whose doc says "running one ssh for an agent" would make that doc false the first time
 * a `psql` came through it.</p>
 *
 * <p>`shell` is false for everything the agent influences. It is true for exactly one
 * caller — a saved terminal command, which is human-authored shell syntax and contains
 * no agent input at all.</p>
 */
// eslint-disable-next-line max-lines-per-function
export function runBounded(
  command: string,
  args: string[],
  shell: boolean,
  options: SshExecOptions,
): Promise<SshExecOutcome> {
  // eslint-disable-next-line complexity, max-lines-per-function
  return new Promise((resolve, reject) => {
    // Spawning and only then subscribing to the abort would launch a child for a caller already gone —
    // and kill it a moment later, after it may have done its work (`PLAN_wsl_bridge_outlives_its_client.md` §5.7).
    if (alreadyGone(options)) {
      reject(notStarted());
      return;
    }
    const startedAt = Date.now();
    let child;
    try {
      child = spawn(command, args, {
        shell,
        env: options.env,
        cwd: options.cwd,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    const out = new Bounded();
    const err = new Bounded();
    let timedOut = false;
    let settled = false;

    const kill = (): void => {
      child.kill('SIGTERM');
      const escalate = setTimeout(() => child.kill('SIGKILL'), KILL_GRACE_MS);
      (escalate as unknown as { unref?: () => void }).unref?.();
    };

    const timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, options.timeoutMs);

    const onAbort = (): void => {
      kill();
    };
    options.signal?.addEventListener('abort', onAbort, { once: true });

    const finish = (fn: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      fn();
    };

    // Past the cap the output is being discarded, so there is nothing left to
    // wait for: stop the remote command instead of letting it run to the
    // timeout producing bytes nobody keeps.
    const appendAndMaybeStop = (bounded: Bounded, chunk: Buffer): void => {
      bounded.append(chunk);
      if (bounded.truncated) {
        kill();
      }
    };
    child.stdout?.on('data', (chunk: Buffer) => appendAndMaybeStop(out, chunk));
    child.stderr?.on('data', (chunk: Buffer) => appendAndMaybeStop(err, chunk));
    // `error` fires when ssh is not on PATH at all — a mechanism failure, not
    // a remote one, so it must not be reported as an exit code.
    child.on('error', (error) => finish(() => reject(error)));
    child.on('close', (code) =>
      finish(() =>
        resolve({
          exitCode: code,
          stdout: out.text(),
          stderr: err.text(),
          stdoutTruncated: out.truncated,
          stderrTruncated: err.truncated,
          timedOut,
          durationMs: Date.now() - startedAt,
        }),
      ),
    );
  });
}

/** Whether whatever this child was for has already ended — the window, or the request it serves. */
function alreadyGone(options: SshExecOptions): boolean {
  return options.signal?.aborted === true || options.startGate?.aborted === true;
}

/** The refusal to launch for a caller already gone; named `AbortError`, as an aborted spawn is. */
function notStarted(): Error {
  const error = new Error('Not started: the request it was for had already ended.');
  error.name = 'AbortError';
  return error;
}
