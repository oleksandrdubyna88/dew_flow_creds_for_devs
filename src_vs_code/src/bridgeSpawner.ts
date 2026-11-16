import * as childProcess from 'node:child_process';
import type { BridgeProcess, BridgeSpawner } from './sshBridgeManager';

/**
 * How this window starts the `ssh` of a bridge. It stood inside `activate` (`extension.ts`); it is a module of its own so that a
 * test can hand it a child (N16).
 */

/** As much of a child process as a bridge reads. A `ChildProcess` is one; a test hands in an `EventEmitter`. */
export interface BridgeChild {
  kill(): boolean;
  once(event: 'exit', listener: (code: number | null) => void): unknown;
}

/** How a child is started: `child_process.spawn`, or a test's stand-in. */
export type ChildSpawn = (command: string, args: string[], options: childProcess.SpawnOptions) => BridgeChild;

/** What a spawner is made of. */
export interface BridgeSpawnerParts {
  /** Default: `child_process.spawn`. */
  readonly spawn?: ChildSpawn;
}

/** The `BridgeProcess` of a child: `exited` settles with the code of its `'exit'`. */
export function bridgeProcessOf(child: BridgeChild): BridgeProcess {
  return {
    kill: () => child.kill(),
    exited: new Promise<number | null>((resolve) => child.once('exit', (code) => resolve(code))),
  };
}

/** The spawner of `SshBridgeManager`: the argv copied, the environment it is given, no window on Windows, no stdio. */
export function bridgeSpawner(parts: BridgeSpawnerParts = {}): BridgeSpawner {
  const spawn = parts.spawn ?? childProcess.spawn;
  return (command, args, env) => bridgeProcessOf(spawn(command, [...args], { env, windowsHide: true, stdio: 'ignore' }));
}
