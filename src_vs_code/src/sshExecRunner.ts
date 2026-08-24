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
  timeoutMs: number;
  /** Aborted when the window goes away, so no ssh outlives its broker. */
  signal?: AbortSignal;
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
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    let child;
    try {
      child = spawn('ssh', argv, {
        env: options.env,
        windowsHide: true,
        shell: false,
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
