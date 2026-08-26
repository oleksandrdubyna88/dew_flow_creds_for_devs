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
   */
  start(key: string, remotePath: string, command: string, argv: readonly string[], env: NodeJS.ProcessEnv): OpenBridge {
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
    for (const key of [...this.open.keys()]) {
      this.stop(key);
    }
  }
}
