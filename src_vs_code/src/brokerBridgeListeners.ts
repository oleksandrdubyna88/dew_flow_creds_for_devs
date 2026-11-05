import { randomBytes } from 'node:crypto';
import type * as http from 'node:http';
import { type BridgeContext, freezeBridgeContext } from './bridgeContext';
import type { Served } from './brokerOrigin';
import { startLoopbackServer } from './loopbackServer';

/**
 * One loopback listener per open Remote Bridge, each behind its own door and its own key.
 *
 * <p>Pure: imports no `vscode`. The door is handed in (`doorFor`), so a listener cannot be built without
 * going through `doorsFor`, which keeps "every listener is covered" structural.</p>
 */

export interface BridgeListener {
  readonly port: number;
  /** `randomBytes(32).toString('base64url')`, minted per open, compared by the door, never logged. */
  readonly key: string;
  /** `server.close()` and `server.closeAllConnections()`; a second call returns the same promise. */
  close(): Promise<void>;
}

interface Live {
  readonly listener: BridgeListener;
  readonly server: http.Server;
}

const DISPOSED = 'The broker is disposed; no Remote Bridge can open.';

const noPreparation = (): Promise<void> => Promise.resolve();

export class BridgeListeners {
  private readonly turns = new Map<string, Promise<unknown>>();
  private readonly live = new Map<string, Live>();
  private disposed = false;

  constructor(
    private readonly doorFor: (port: number, key: string, context: BridgeContext) => Served,
    /** Injected so a test can make two opens overlap. */
    private readonly start: () => Promise<{ server: http.Server; port: number }> = startLoopbackServer,
  ) {}

  /**
   * One listener per open; opens for one `bridgeId` run one after another.
   *
   * <p>A reconnect can begin before the previous attempt's `start()` resolved. Without a chain a map write
   * drops the earlier server without closing it, leaving its port and key usable. The chain entry is set
   * before the first `await`, so a third open waits for the second whatever became of it.</p>
   *
   * <p>`prepare` is what the caller needs before a listener can exist (the broker's own start). It runs only
   * once this open is known to be wanted: after the disposed check and after the identity is validated, so a
   * late or malformed call starts nothing.</p>
   */
  open(context: BridgeContext, prepare: () => Promise<void> = noPreparation): Promise<BridgeListener> {
    if (this.disposed) {
      return Promise.reject(new Error(DISPOSED));
    }
    const id = context.bridgeId;
    const prior = this.turns.get(id) ?? Promise.resolve();
    const turn = prior.then(
      () => this.openNow(context, prepare),
      () => this.openNow(context, prepare),
    );
    this.turns.set(
      id,
      turn.then(
        () => undefined,
        () => undefined,
      ),
    );
    return turn;
  }

  /** Every live listener is closed, synchronously, and later opens reject. */
  closeAll(): void {
    this.disposed = true;
    for (const { server } of this.live.values()) {
      server.close();
      server.closeAllConnections();
    }
    this.live.clear();
  }

  /** The live listeners' ports, for tests. */
  ports(): readonly number[] {
    return [...this.live.values()].map((entry) => entry.listener.port);
  }

  private async openNow(given: BridgeContext, prepare: () => Promise<void>): Promise<BridgeListener> {
    this.refuseIfDisposed();
    const context = freezeBridgeContext(given);
    await prepare();
    this.refuseIfDisposed();
    const { server, port } = await this.start();
    this.refuseIfDisposed(server);
    const key = randomBytes(32).toString('base64url');
    server.on('request', this.doorFor(port, key, context));
    const next: Live = { listener: this.listenerFor(context.bridgeId, server, port, key, () => next), server };
    const previous = this.live.get(context.bridgeId);
    this.live.set(context.bridgeId, next);
    if (previous !== undefined) {
      await previous.listener.close();
      // A `closeAll` can land while the superseded listener is still closing. It has closed `next` too, so
      // handing it out would be handing out a dead listener; the open fails as every open after dispose does.
      this.refuseIfDisposed();
    }
    return next.listener;
  }

  /** Throws the disposed sentence once `closeAll` has run, first shutting down a server that was bound meanwhile. */
  private refuseIfDisposed(bound?: http.Server): void {
    if (this.disposed) {
      bound?.close();
      bound?.closeAllConnections();
      throw new Error(DISPOSED);
    }
  }

  private listenerFor(id: string, server: http.Server, port: number, key: string, self: () => Live): BridgeListener {
    let closing: Promise<void> | undefined;
    const close = (): Promise<void> => {
      closing ??= this.closeServer(id, server, self());
      return closing;
    };
    return { port, key, close };
  }

  /** Closes the server, and forgets the entry only if it is still this one: a later open's entry stays. */
  private closeServer(id: string, server: http.Server, entry: Live): Promise<void> {
    if (this.live.get(id) === entry) {
      this.live.delete(id);
    }
    return new Promise((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  }
}
