import type { NoteWriteOutcome } from './bridgeNoteWriter';

/**
 * One Remote Bridge kept alive (change 11.1, the 72-hour slice, S2): it reconnects with backoff after a drop, and Lock and Close win
 * over a reconnect that is in flight.
 *
 * <p><b>Each connection is new.</b> A reconnect opens a fresh listener (a fresh key) and a fresh socket path, and replaces the note on
 * the server by a rename. A fresh path is not a choice: on a server that keeps `StreamLocalBindUnlink no` (the default, and the
 * owner's), the old socket file stays and a forward to the same path is refused. `creds` and `creds-mcp` read the note again on every
 * call, so the same tmux pane and the same `creds-mcp` process go on working.</p>
 *
 * <p><b>A note is published only by a session that still may.</b> Between the connect and the note there is an await; a Lock or a
 * Close that lands there must leave no note and no access. So after the connect, and again after the note is written, the session asks
 * whether it is still the live attempt, the vault is unlocked and this window still owns the bridge; if not, the connection is ended
 * (its listener closes, so a note that was written names a door that no longer opens).</p>
 *
 * <p><b>Nothing interrupted is replayed.</b> A request that was in flight when the connection dropped fails on the server; the session
 * reconnects, it does not resend anything.</p>
 *
 * <p>Pure of `vscode`: the connect, the clock and the checks are injected, so the races are unit tests.</p>
 */

/** One live connection: its forward, its listener, its note. `stop` ends the ssh and closes the listener. */
export interface BridgeConnection {
  readonly remotePath: string;
  /** Settles when the forward's ssh ends, for whatever reason. */
  readonly exited: Promise<unknown>;
  stop(): void;
  /** Writes this connection's note on the server. */
  publish(): Promise<NoteWriteOutcome>;
}

export type SessionState = 'connecting' | 'open' | 'waiting' | 'locked' | 'closed';

export interface SessionDeps {
  /** One attempt: listener, credential, forward. `undefined` when it could not start (its reason is the connect's to tell). */
  readonly connect: (first: boolean) => Promise<BridgeConnection | undefined>;
  readonly unlocked: () => boolean;
  /** Whether this window still owns the bridge (one owning window). */
  readonly owns: () => boolean;
  /** The test seam where a reconnect is held just before it publishes. */
  readonly beforePublish?: () => Promise<void>;
  /** Milliseconds before each retry; the last one repeats. */
  readonly delays?: readonly number[];
  readonly setTimer?: (run: () => void, ms: number) => unknown;
  readonly clearTimer?: (timer: unknown) => void;
  /** Told of every state change: the tree repaints, the log says why. */
  readonly onState?: (state: SessionState) => void;
}

/** A retry does not keep the process alive on its own: a window that is closing, or a test that ended, is not held by a pending reconnect. */
function unrefTimer(run: () => void, ms: number): NodeJS.Timeout {
  const timer = setTimeout(run, ms);
  timer.unref();
  return timer;
}

/** 1 s, 2 s, 5 s, 10 s, 30 s, then every 60 s. */
export const RECONNECT_DELAYS_MS: readonly number[] = [1_000, 2_000, 5_000, 10_000, 30_000, 60_000];

export class BridgeSession {
  private current: BridgeConnection | undefined;
  private timer: unknown;
  private failures = 0;
  /** Bumped by every Lock and Close: an attempt that started under an older generation may not publish. */
  private generation = 0;
  private stateNow: SessionState = 'connecting';

  constructor(private readonly deps: SessionDeps) {}

  get state(): SessionState {
    return this.stateNow;
  }

  /** The socket path of the live connection, if there is one. */
  get remotePath(): string | undefined {
    return this.current?.remotePath;
  }

  /**
   * The first connection, which the person asked for. A first attempt that fails ends the session: a bad host or a refused key is the
   * person's to see, not something to retry in the background.
   */
  async begin(): Promise<{ readonly remotePath: string } | undefined> {
    const connection = await this.once(true);
    if (connection === undefined) {
      this.close();
      return undefined;
    }
    return { remotePath: connection.remotePath };
  }

  /** Lock: the connection ends now, a pending retry is cancelled, and the session waits for {@link unlock}. */
  lock(): void {
    if (this.stateNow === 'closed') {
      return;
    }
    this.end();
    this.set('locked');
  }

  /**
   * A restored bridge (D8: after a reload or a reboot): it connects in the background, as a reconnect does: no person is asked, and an
   * attempt that fails is retried with backoff instead of ending the session.
   */
  resume(): void {
    void this.retry();
  }

  /** Unlock: a locked session connects again, and one waiting for its next retry tries now, both from the first delay. */
  unlock(): void {
    if (this.stateNow !== 'locked' && this.stateNow !== 'waiting') {
      return;
    }
    this.cancelTimer();
    this.failures = 0;
    void this.retry();
  }

  /** Close: the connection ends, nothing is retried, and the session never connects again. */
  close(): void {
    if (this.stateNow === 'closed') {
      return;
    }
    this.end();
    this.set('closed');
  }

  private end(): void {
    this.generation += 1;
    this.cancelTimer();
    const connection = this.current;
    this.current = undefined;
    connection?.stop();
  }

  private cancelTimer(): void {
    if (this.timer !== undefined) {
      (this.deps.clearTimer ?? clearTimeout)(this.timer as NodeJS.Timeout);
      this.timer = undefined;
    }
  }

  /** Whether an attempt of `generation` may still go on: not superseded, the vault unlocked, the bridge still ours. */
  private mayGoOn(generation: number): boolean {
    return generation === this.generation && this.deps.unlocked() && this.deps.owns();
  }

  private async once(first: boolean): Promise<BridgeConnection | undefined> {
    const generation = this.generation;
    this.set('connecting');
    const connection = await this.deps.connect(first);
    return connection === undefined ? undefined : this.publishIfStill(connection, generation);
  }

  /** The note goes out only while the attempt may still go on, and the attempt counts only if it still may after the note is written. */
  private async publishIfStill(connection: BridgeConnection, generation: number): Promise<BridgeConnection | undefined> {
    await this.heldBeforePublish();
    if (!this.mayGoOn(generation)) {
      return this.abandon(connection);
    }
    const written = await connection.publish();
    return written.ok && this.mayGoOn(generation) ? this.opened(connection) : this.abandon(connection);
  }

  private heldBeforePublish(): Promise<void> {
    return this.deps.beforePublish?.() ?? Promise.resolve();
  }

  /** The attempt may not go on: its connection ends (the listener closes, so a note already written names a door that no longer opens). */
  private abandon(connection: BridgeConnection): undefined {
    connection.stop();
    return undefined;
  }

  private opened(connection: BridgeConnection): BridgeConnection {
    this.current = connection;
    this.failures = 0;
    this.set('open');
    void connection.exited.then(() => this.dropped(connection));
    return connection;
  }

  /** The forward ended. Unless the session ended it (Lock, Close), it reconnects after the next delay. */
  private dropped(connection: BridgeConnection): void {
    if (this.current !== connection) {
      return;
    }
    this.current = undefined;
    connection.stop(); // the listener closes with the forward
    this.later();
  }

  private later(): void {
    const delays = this.deps.delays ?? RECONNECT_DELAYS_MS;
    const ms = delays[Math.min(this.failures, delays.length - 1)];
    this.failures += 1;
    this.set('waiting');
    this.timer = (this.deps.setTimer ?? unrefTimer)(() => {
      this.timer = undefined;
      void this.retry();
    }, ms);
  }

  private async retry(): Promise<void> {
    if (this.blocked()) {
      return;
    }
    const generation = this.generation;
    const connection = await this.once(false);
    if (connection === undefined && this.stillWaiting(generation)) {
      this.later();
    }
  }

  /** Whether a retry must not connect now: the session is closed, another window owns the bridge (it closes), or the vault is locked (it waits). */
  private blocked(): boolean {
    if (this.isClosed()) {
      return true;
    }
    if (!this.deps.owns()) {
      this.close();
      return true;
    }
    if (!this.deps.unlocked()) {
      this.set('locked');
      return true;
    }
    return false;
  }

  /** A failed attempt is retried only if no Lock or Close came while it ran. */
  private stillWaiting(generation: number): boolean {
    return generation === this.generation && !this.isClosed();
  }

  /** A method, not a comparison inline: the state changes across awaits, which a narrowed type would hide. */
  private isClosed(): boolean {
    return this.stateNow === 'closed';
  }

  private set(state: SessionState): void {
    if (this.stateNow !== state) {
      this.stateNow = state;
      this.deps.onState?.(state);
    }
  }
}
