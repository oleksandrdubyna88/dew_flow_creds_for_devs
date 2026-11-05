import * as http from 'node:http';
import * as net from 'node:net';
import type { BridgeContext } from '../bridgeContext';
import type { BridgeListener } from '../brokerBridgeListeners';
import type { BridgeWallSource } from '../bridgeScope';
import { NO_SUPPLIERS, loadBridgeModules, memoryScopes } from './bridgeModules';

/**
 * What the Remote Bridge door tests share: two contexts, a request that keeps its `Host`, and the small
 * questions a listener test asks (is that port dead, what did it say). Not a test file: `node:test` is
 * pointed at `*.test.js` only.
 */

export const CONTEXT: BridgeContext = {
  bridgeId: 'bridge-1',
  accountId: 'acct-1',
  serverEntityId: 'entry-server-1',
  serverName: 'prod-server',
  target: 'me@host:22',
  remoteOs: 'linux',
};
export const SMUGGLED_KEY = 'smuggled-key-0123456789';
export const OTHER: BridgeContext = { ...CONTEXT, bridgeId: 'bridge-2', serverEntityId: 'entry-server-2', serverName: 'other-server' };

export interface Reply {
  readonly status: number;
  readonly body: string;
  readonly connection: string | undefined;
}

/** A request with the headers a test chooses, `Host` included — `fetch` would replace it. */
export function raw(
  port: number,
  route: string,
  headers: http.OutgoingHttpHeaders,
  options: { method?: string; agent?: http.Agent; body?: string; socketPath?: string } = {},
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const where = options.socketPath === undefined ? { host: '127.0.0.1', port } : { socketPath: options.socketPath };
    const request = http.request(
      { ...where, path: route, method: options.method ?? 'GET', headers, agent: options.agent },
      (response) => {
        let text = '';
        response.on('data', (chunk) => {
          text += String(chunk);
        });
        response.on('end', () => resolve({ status: response.statusCode ?? 0, body: text, connection: response.headers.connection }));
      },
    );
    request.on('error', reject);
    request.setTimeout(5_000, () => request.destroy(new Error(`no answer from port ${port} for ${route}`)));
    request.end(options.body);
  });
}

export const message = (reply: Reply): string => (JSON.parse(reply.body) as { error: { message: string } }).error.message;
export const code = (reply: Reply): string => (JSON.parse(reply.body) as { error: { code: string } }).error.code;

/** A connection attempt to a port nothing listens on is refused; this resolves true when it is. */
export function refuses(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.on('connect', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => resolve(true));
  });
}

export const keyed = (listener: BridgeListener, extra: http.OutgoingHttpHeaders = {}): http.OutgoingHttpHeaders => ({
  Host: `127.0.0.1:${listener.port}`,
  'X-Creds-Bridge': listener.key,
  ...extra,
});

export const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A wall with an empty scope, for a test of the DOOR: a broker cannot open a bridge without one (R4), and what these
 * tests ask about is the key, the Host and the table, none of which the scope decides. Everything the wall decides is in
 * `bridgeScopeWalk.test.ts`.
 */
export function emptyWall(): { bridgeWall: BridgeWallSource } {
  return { bridgeWall: { scopes: memoryScopes(loadBridgeModules()), storedTexts: () => [], refSource: { accounts: () => [], entities: () => [] }, ...NO_SUPPLIERS } };
}
