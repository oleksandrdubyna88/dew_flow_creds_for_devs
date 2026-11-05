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
   */
  open(context: BridgeContext): Promise<BridgeListener> {
    const id = context.bridgeId;
    const prior = this.turns.get(id) ?? Promise.resolve();
    const turn = prior.then(
      () => this.openNow(context),
      () => this.openNow(context),
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

  private async openNow(given: BridgeContext): Promise<BridgeListener> {
    if (this.disposed) {
      throw new Error(DISPOSED);
    }
    const context = freezeBridgeContext(given);
    const { server, port } = await this.start();
    if (this.disposed) {
      server.close();
      server.closeAllConnections();
      throw new Error(DISPOSED);
    }
    const key = randomBytes(32).toString('base64url');
    server.on('request', this.doorFor(port, key, context));
    const next: Live = { listener: this.listenerFor(context.bridgeId, server, port, key, () => next), server };
    const previous = this.live.get(context.bridgeId);
    this.live.set(context.bridgeId, next);
    if (previous !== undefined) {
      await previous.listener.close();
    }
    return next.listener;
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
