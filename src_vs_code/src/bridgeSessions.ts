import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { BridgeSession, type BridgeConnection, type SessionState } from './bridgeSession';
import { HEARTBEAT_MS, type LockFs, WindowLock, nodeLockFs } from './windowLock';

/**
 * The Remote Bridges of this window, one session each (change 11.1, the 72-hour slice, S2), and the rule that ONE window owns a bridge.
 *
 * <p>Every window of a profile shares the storage folder, so two windows could each keep a bridge to the same server, and their notes
 * would replace each other on every reconnect. A bridge's owner is a {@link WindowLock} in that folder: the window that takes it keeps it
 * with a heartbeat; a second window is refused ("owned elsewhere"), it does not take the bridge over. A window frozen past the lock's TTL
 * can lose it; its session learns that at the next retry and closes.</p>
 */

/** The owner of one bridge, while held. */
export interface Ownership {
  owns(): boolean;
  release(): Promise<void>;
}

/** Takes the owner lock of `key` in `ownersDir`, or `undefined` when another window holds it. */
export type TakeOwnership = (key: string) => Promise<Ownership | undefined>;

/** The production owner: a {@link WindowLock} per bridge, beaten every {@link HEARTBEAT_MS}, asked after each beat whether it is still ours. */
export function windowOwnership(ownersDir: string, io: LockFs = nodeLockFs()): TakeOwnership {
  return async (key) => {
    await fs.promises.mkdir(ownersDir, { recursive: true });
    const lock = new WindowLock(path.join(ownersDir, crypto.createHash('sha256').update(key).digest('hex').slice(0, 32)), io);
    const held = await lock.take();
    if (held === undefined) {
      return undefined;
    }
    let ours = true;
    const beat = setInterval(() => {
      void lock
        .beat(held)
        .then(() => lock.holds(held))
        .then((still) => {
          ours = still;
        }, () => undefined);
    }, HEARTBEAT_MS);
    beat.unref();
    return {
      owns: () => ours,
      release: async () => {
        clearInterval(beat);
        ours = false;
        await lock.release(held);
      },
    };
  };
}

interface Held {
  readonly session: BridgeSession;
  readonly ownership: Ownership;
}

export interface BridgeSessionsDeps {
  readonly takeOwnership: TakeOwnership;
  readonly unlocked: () => boolean;
  /** A session changed state: the tree repaints, the log says what happened. */
  readonly onState: (key: string, state: SessionState) => void;
}

export class BridgeSessions {
  private readonly held = new Map<string, Held>();
  /** The release of each owner lock let go, so a Close that comes after the session's own `closed` still waits for it. */
  private readonly releases = new Map<string, Promise<void>>();

  constructor(private readonly deps: BridgeSessionsDeps) {}

  /** Whether `key` has a bridge this window keeps: open, reconnecting, or waiting for the unlock. */
  has(key: string): boolean {
    const held = this.held.get(key);
    return held !== undefined && held.session.state !== 'closed';
  }

  remotePathFor(key: string): string | undefined {
    return this.held.get(key)?.session.remotePath;
  }

  /**
   * A new session for `key`, replacing this window's own if it had one. Its first connection is the person's: when it fails, the session
   * ends and the owner lock is let go. `'owned-elsewhere'` when another window holds the bridge.
   */
  async open(key: string, connect: (first: boolean) => Promise<BridgeConnection | undefined>): Promise<{ readonly remotePath: string } | 'owned-elsewhere' | undefined> {
    const session = await this.start(key, connect);
    return session === undefined ? 'owned-elsewhere' : session.begin();
  }

  /**
   * A bridge the person opened before this window started (D8): its session connects in the background and retries until it can, with
   * no person asked. `false` when another window holds it (that window keeps it; this one stays out).
   */
  async restore(key: string, connect: (first: boolean) => Promise<BridgeConnection | undefined>): Promise<boolean> {
    const session = await this.start(key, connect);
    session?.resume();
    return session !== undefined;
  }

  /** A new session for `key` under this window's ownership, replacing this window's own; `undefined` when another window owns it. */
  private async start(key: string, connect: (first: boolean) => Promise<BridgeConnection | undefined>): Promise<BridgeSession | undefined> {
    await this.close(key);
    const ownership = await this.deps.takeOwnership(key);
    if (ownership === undefined) {
      return undefined;
    }
    const session = new BridgeSession({
      connect,
      unlocked: this.deps.unlocked,
      owns: ownership.owns,
      onState: (state) => {
        if (state === 'closed') {
          void this.forget(key, session);
        }
        this.deps.onState(key, state);
      },
    });
    this.held.set(key, { session, ownership });
    return session;
  }

  /** Close `key`'s bridge: no reconnect, the owner lock let go. `true` when there was one. */
  async close(key: string): Promise<boolean> {
    const held = this.held.get(key);
    if (held === undefined) {
      return false;
    }
    held.session.close();
    await this.forget(key, held.session);
    return true;
  }

  /** The vault locked: every connection ends now, and each session waits for the unlock. */
  lockAll(): void {
    for (const held of this.held.values()) {
      held.session.lock();
    }
  }

  /** The vault unlocked: every waiting session connects again. */
  unlockAll(): void {
    for (const held of this.held.values()) {
      held.session.unlock();
    }
  }

  /** The window is going: every bridge closes and every owner lock is let go. */
  dispose(): void {
    for (const key of [...this.held.keys()]) {
      void this.close(key);
    }
  }

  private forget(key: string, session: BridgeSession): Promise<void> {
    const held = this.held.get(key);
    if (held?.session !== session) {
      return this.releases.get(key) ?? Promise.resolve();
    }
    this.held.delete(key);
    const released = held.ownership.release().finally(() => {
      if (this.releases.get(key) === released) {
        this.releases.delete(key);
      }
    });
    this.releases.set(key, released);
    return released;
  }
}
