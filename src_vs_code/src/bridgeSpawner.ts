import * as childProcess from 'node:child_process';
import { describeError } from './describeError';
import type { BridgeProcess, BridgeSpawner } from './sshBridgeManager';

/**
 * How this window starts the `ssh` of a bridge. It stood inside `activate` (`extension.ts`); it is a module of its own so that a
 * test can hand it a child (N16).
 *
 * <p><b>`exited` always settles.</b> The row of a bridge leaves the tree, and the key file written for the bridge is deleted, when
 * `exited` settles (`sshBridgeManager.ts`, `writtenKey.ts`). A child that cannot start (`ssh` is not found) emits `'error'` and no
 * `'exit'`, so `exited` settles on that `'error'` too. And with no `'error'` listener Node throws the event in the extension
 * host.</p>
 *
 * <p><b>Every `'error'` is reported.</b> The listener takes the event, so nothing else would ever say why a bridge did not start,
 * or that a kill failed. The reporter is not optional: a spawner that is made without one does not compile.</p>
 */

/** As much of a child process as a bridge reads. A `ChildProcess` is one; a test hands in an `EventEmitter` with a `pid`. */
export interface BridgeChild {
  /** Absent when the child never started. */
  readonly pid?: number;
  kill(): boolean;
  once(event: 'exit', listener: (code: number | null) => void): unknown;
  /** `on`, not `once`: every `'error'` of the child needs a listener, for as long as the child lives. */
  on(event: 'error', listener: (error: Error) => void): unknown;
}

/** How a child is started: `child_process.spawn`, or a test's stand-in. */
export type ChildSpawn = (command: string, args: string[], options: childProcess.SpawnOptions) => BridgeChild;

/**
 * Told every `'error'` of a bridge's child: one that never started, and one that started (a kill that failed).
 *
 * <p>It must not throw. Node emits a failed kill's `'error'` synchronously inside `child.kill()`, so a throw here leaves the
 * manager's `stop()` or `dispose()` halfway, with the other bridges not killed. The product's reporter writes the diagnostic log,
 * which never throws.</p>
 */
export type BridgeErrorReport = (error: Error) => void;

/** What a spawner is made of. */
export interface BridgeSpawnerParts {
  readonly report: BridgeErrorReport;
  /** Default: `child_process.spawn`. */
  readonly spawn?: ChildSpawn;
}

/**
 * The line of the diagnostic log for an `'error'` of a bridge's child. Only the text of the error: Node's error object also holds
 * the argv (`spawnargs`), and the argv of a bridge names its key file.
 */
export function describeBridgeError(error: Error): string {
  return `the ssh of a bridge did not start, or could not be stopped: ${describeError(error)}`;
}

/**
 * The `BridgeProcess` of a child. `exited` settles ONCE, with the first of: the code of its `'exit'`; `null` on an `'error'` while
 * the child has no `pid` (it never started). An `'error'` of a STARTED child (Node emits one when a kill fails) settles nothing:
 * its `ssh` may still run and read its key file, and its `'exit'` settles `exited` later. Every `'error'` goes to `report`, AFTER
 * the settle, so that a reporter that throws cannot keep `exited` from settling.
 */
export function bridgeProcessOf(child: BridgeChild, report: BridgeErrorReport): BridgeProcess {
  return {
    kill: () => child.kill(),
    exited: new Promise<number | null>((resolve) => {
      child.once('exit', (code) => resolve(code));
      child.on('error', (error) => {
        if (child.pid === undefined) {
          resolve(null);
        }
        report(error);
      });
    }),
  };
}

/** The spawner of `SshBridgeManager`: the argv copied, the environment it is given, no window on Windows, no stdio. */
export function bridgeSpawner(parts: BridgeSpawnerParts): BridgeSpawner {
  const spawn = parts.spawn ?? childProcess.spawn;
  return (command, args, env) => bridgeProcessOf(spawn(command, [...args], { env, windowsHide: true, stdio: 'ignore' }), parts.report);
}
