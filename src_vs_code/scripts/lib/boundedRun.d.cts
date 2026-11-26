// Types for `boundedRun.cjs`: one program, bounded, whose timeout ends the whole process tree.

export interface BoundedResult {
  /** The exit code; `null` when the program was ended by a signal, by the limit, by the output bound, or never started. */
  code: number | null;
  signal: string | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
}

/** One program with `args`, a limit in milliseconds, and stdin closed. Its tree is ended when the limit passes. */
export function boundedRun(program: string, args: string[], options?: { env?: NodeJS.ProcessEnv; timeoutMs?: number; maxOutputBytes?: number }): Promise<BoundedResult>;
export const DEFAULT_TIMEOUT_MS: number;
