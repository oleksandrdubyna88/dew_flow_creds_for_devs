/**
 * The live `ssh -R` bridges this window is holding open.
 *
 * <p>Separate from `sshBridge.ts` — which is pure argv — because something has to own a
 * long-lived child process, and separate from `sshExecRunner.ts` because that one is built for
 * the opposite lifetime: it resolves when the process EXITS, which for a bridge is the failure.</p>
 *
 * <p><b>A bridge cannot outlive the window, and that is the whole revocation story again.</b>
 * The forwarded socket is an opening into this machine's broker; leaving one behind after the
 * window that authorized it has gone would mean a remote host could still reach a broker nobody
 * is watching. So every child is killed on dispose, and the manager refuses to hold a second
 * bridge for the same entity rather than leaking the first one's handle.</p>
 *
 * <p>That holds only while the spawned process IS the connection that carries the forward. With connection sharing in the
 * person's `ssh` config it was not: the process exited at once, a master kept the forward, and `kill()` reached nothing. The
 * tunnel's argv now asks for no sharing (`NO_CONNECTION_SHARING`, `sshBridge.ts`), and section 9 of
 * `scripts/ssh-agent-itest.cjs` drives THIS class against a real `sshd`: after `stop()` the forward is not served. Not covered:
 * an extension host that is killed runs no `dispose`, and the `ssh` it started lives on.</p>
 *
 * <p>The spawner is injected, so the lifetime rules are a unit test instead of something you
 * find out by leaving a jump box connected overnight.</p>
 */

/** A running `ssh`, as much of it as this needs. */
export interface BridgeProcess {
  kill(): void;
  /** Resolves when the process ends, with its exit code when there was one. */
  readonly exited: Promise<number | null>;
}

export type BridgeSpawner = (
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
) => BridgeProcess;

export interface OpenBridge {
  readonly key: string;
  readonly remotePath: string;
  readonly process: BridgeProcess;
}

export class SshBridgeManager {
  private readonly open = new Map<string, OpenBridge>();
  /** Set by `dispose()`: a start that comes after the window is gone spawns nothing (it answers `undefined`). */
  private disposed = false;

  constructor(
    private readonly spawn: BridgeSpawner,
    /** Told when a bridge ends by itself — a dropped network, a refused forward. */
    private readonly onEnded: (key: string, code: number | null) => void = () => {},
  ) {}

  isOpen(key: string): boolean {
    return this.open.has(key);
  }

  remotePathFor(key: string): string | undefined {
    return this.open.get(key)?.remotePath;
  }

  keys(): string[] {
    return [...this.open.keys()];
  }

  /**
   * Start a bridge for this entity, replacing any it already had.
   *
   * <p>Replacing rather than refusing: the common reason to ask twice is that the first one
   * died and the person cannot tell. Refusing would leave them with a bridge that looks open
   * and is not, which is worse than a moment's churn.</p>
   *
   * <p>After `dispose()` NOTHING is spawned and `undefined` is returned: the bridge guard awaits the pin question before it starts, and
   * a window that closed meanwhile has already run `dispose`. The check stands BEFORE the spawn, not after it: an `ssh` that is spawned
   * and killed at once can still connect in between, and a bridge may not connect after its owner is gone. The caller reads `undefined`
   * as "nothing started" and deletes the key file and the pin file of the call at once (`withWrittenKeyUntilExit`, `writtenKey.ts`).</p>
   */
  start(key: string, remotePath: string, command: string, argv: readonly string[], env: NodeJS.ProcessEnv): OpenBridge | undefined {
    if (this.disposed) {
      return undefined;
    }
    this.stop(key);
    const bridge: OpenBridge = { key, remotePath, process: this.spawn(command, argv, env) };
    this.open.set(key, bridge);
    void bridge.process.exited.then((code) => {
      // Only forget it if this is still the bridge we are holding: a restart may already have
      // replaced it, and removing the new one because the old one ended would close a live
      // tunnel and leave the map lying about it.
      if (this.open.get(key) === bridge) {
        this.open.delete(key);
        this.onEnded(key, code);
      }
    });
    return bridge;
  }

  stop(key: string): boolean {
    const bridge = this.open.get(key);
    if (bridge === undefined) {
      return false;
    }
    this.open.delete(key);
    bridge.process.kill();
    return true;
  }

  /** Every bridge goes with the window. */
  dispose(): void {
    this.disposed = true;
    for (const key of [...this.open.keys()]) {
      this.stop(key);
    }
  }
}
