import type { BridgeContext } from './bridgeContext';
import type { ErrorCode } from './brokerProtocol';

/**
 * What a Remote Bridge listener serves: default deny.
 *
 * <p>Pure: imports no `vscode`. From the first commit the table knows ONE route, so the wider reach never
 * exists unscoped, even between two commits of a branch. E1.3 fills the table.</p>
 */

export const BRIDGE_NOT_SERVED = 'A Remote Bridge does not serve this request. A person can do it in the VS Code window.';

/** `undefined` admits. Exactly `GET /v1/health`; every other method and path is `not_supported`. */
export function bridgeRouteRefusal(
  method: string | undefined,
  pathname: string,
): { code: ErrorCode; message: string } | undefined {
  return method === 'GET' && pathname === '/v1/health' ? undefined : { code: 'not_supported', message: BRIDGE_NOT_SERVED };
}

/**
 * The guard `handle` calls first. Off a bridge: `false`, nothing called, `res` untouched. On a bridge:
 * `false` when the route is served; else `Connection: close`, the answer, and `true`.
 *
 * <p>`Connection: close` because the body is never read for a refused route, and a keep-alive socket
 * holding an unread body is a socket doing nothing for anybody (the reason at `brokerOrigin.ts`).</p>
 */
export function refusedOnBridge(
  bridge: BridgeContext | undefined,
  method: string | undefined,
  pathname: string,
  res: { setHeader(name: string, value: string): void },
  respond: (code: ErrorCode, message: string) => void,
): boolean {
  const refusal = bridge === undefined ? undefined : bridgeRouteRefusal(method, pathname);
  if (refusal === undefined) {
    return false;
  }
  res.setHeader('Connection', 'close');
  respond(refusal.code, refusal.message);
  return true;
}
