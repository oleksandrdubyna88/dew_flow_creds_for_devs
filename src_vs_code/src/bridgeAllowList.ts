import type { BridgeContext } from './bridgeContext';
import { BRIDGE_ENTRY_FIELDS } from './bridgeScope';
import { ALIAS_ROUTE_PREFIX, EXPORT_REFUSED, type ErrorCode } from './brokerProtocol';
import type { Refusal } from './brokerRequests';

/**
 * What a Remote Bridge listener serves: default deny, and a table of everything it knows by name.
 *
 * <p>Pure: imports no `vscode`. Every route `contract/broker-v1.json` names has a row here, served or refused and
 * why, and a route that is in neither is refused at run time all the same: a request is looked up by METHOD and
 * PATHNAME, exactly, and what is not found is `not_supported`. A new route is therefore refused on a bridge from
 * the day it exists, and `bridgeAllowList.test.ts` turns red until somebody decides about it in writing.</p>
 *
 * <p>The table is a decision, not a convenience: what a server's agent may do through the person's laptop. It
 * serves the reads, and `exec` and `query` on the three prefixes (token, alias, MCP) behind the scope wall of
 * `bridgeScope.ts`. `run` waits for E3, which decides where a stored command runs; `terminal` opens a window an
 * agent on a server cannot type into; `up` and `down` act on the laptop's VPN; `rotate`, delete, create, the folder
 * verbs and the config read are the person's alone (parent plan §4.2).</p>
 */

export const BRIDGE_NOT_SERVED = 'A Remote Bridge does not serve this request. A person can do it in the VS Code window.';

export type BridgeRouteDecision =
  | { readonly served: true; readonly walled: boolean; readonly why: string }
  | { readonly served: false; readonly code: ErrorCode; readonly message: string; readonly why: string };

export interface BridgeRoute {
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly decision: BridgeRouteDecision;
}

/** The three prefixes a use action is posted under: a token the person copied, an alias, an MCP entry id. */
const USE_PREFIX = '/v1/use/';
const MCP_USE_PREFIX = '/v1/mcp/use/';
const MCP_FOLDER_PREFIX = '/v1/mcp/folder/';
const USE_PREFIXES = [USE_PREFIX, ALIAS_ROUTE_PREFIX, MCP_USE_PREFIX] as const;

/** The CLI's verbs as route words, the vocabulary `emit-contract.mjs` writes under `routes`. */
const USE_ACTIONS = ['exec', 'terminal', 'query', 'run', 'exportEnv', 'up', 'down'] as const;
/** What a bridge serves of them. */
const SERVED_ACTIONS: ReadonlySet<string> = new Set(['exec', 'query']);
const EXPORT_ACTION = 'exportEnv';
const FOLDER_VERBS = ['create', 'edit', 'delete'] as const;

const served = (method: 'GET' | 'POST', path: string, walled: boolean, why: string): BridgeRoute =>
  Object.freeze({ method, path, decision: Object.freeze({ served: true as const, walled, why }) });

const refused = (path: string, why: string, code: ErrorCode = 'not_supported', message: string = BRIDGE_NOT_SERVED): BridgeRoute =>
  Object.freeze({ method: 'POST' as const, path, decision: Object.freeze({ served: false as const, code, message, why }) });

/** One use action under one prefix: `exec` and `query` are served and walled, `exportEnv` is refused in its own words. */
function useRoute(prefix: string, action: string): BridgeRoute {
  const path = `${prefix}${action}`;
  if (SERVED_ACTIONS.has(action)) {
    return served('POST', path, true, 'runs on this computer, against an entry the scope admits');
  }
  if (action === EXPORT_ACTION) {
    return refused(path, 'a value written to this window\'s terminals would land on the server', 'denied', EXPORT_REFUSED);
  }
  return refused(path, 'not named by the parent plan; default deny decides (run waits for E3)');
}

/** The routes that answer from the vault and so go through the wall, and the three that answer the same to anyone. */
const READS: readonly BridgeRoute[] = [
  served('GET', '/v1/health', false, 'says only that this port is ours'),
  served('GET', '/v1/mcp/kinds', false, 'the product\'s own catalogue; no vault data'),
  served('GET', '/v1/mcp/kind-help', false, 'the product\'s own help; no vault data'),
  served('GET', '/v1/aliases', true, 'the names whose entries are in scope'),
  served('GET', '/v1/mcp/entries', true, 'the entries in scope, with what this door permits'),
  served('GET', '/v1/mcp/config-snippet', true, 'a config in scope, else the usual not-found body'),
  served('GET', '/v1/mcp/folders', true, 'always empty: a folder is in no scope'),
];

const FIXED_POSTS: readonly BridgeRoute[] = [
  refused('/v1/config/read', 'returns a config file entire; the person\'s alone (parent plan §4.2)'),
  refused('/v1/mcp/create', 'writes the vault; the person\'s alone'),
  refused('/v1/mcp/delete', 'moves an entry to the Trash; the person\'s alone'),
  ...FOLDER_VERBS.map((verb) => refused(`${MCP_FOLDER_PREFIX}${verb}`, 'changes the vault\'s folders; the person\'s alone')),
];

/** Every route of `contract/broker-v1.json`, and `/v1/alias/<action>`, by name. Built from the vocabulary above, not retyped. */
export const BRIDGE_ROUTES: readonly BridgeRoute[] = Object.freeze([
  ...READS,
  ...USE_PREFIXES.flatMap((prefix) => USE_ACTIONS.map((action) => useRoute(prefix, action))),
  refused(`${MCP_USE_PREFIX}rotate`, 'replaces a stored secret; on the edit rung, and the person\'s alone'),
  ...FIXED_POSTS,
]);

/**
 * `undefined` admits. Exact method and pathname (the query string is not part of a pathname); anything not in the
 * table is `not_supported` with the bridge's sentence.
 */
export function bridgeRouteRefusal(method: string | undefined, pathname: string): Refusal | undefined {
  const decision = BRIDGE_ROUTES.find((route) => route.method === method && route.path === pathname)?.decision;
  if (decision === undefined) {
    return { code: 'not_supported', message: BRIDGE_NOT_SERVED };
  }
  return decision.served ? undefined : { code: decision.code, message: decision.message };
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

/**
 * What each served read may carry, at EVERY depth of its body (Amendment 6, F.3). A served GET with no row here and none in
 * {@link BRIDGE_BYTE_EQUAL_READS} fails the read-shape test: default deny, the same rule as the route table above.
 */
export const BRIDGE_READ_SHAPES: Readonly<Record<string, readonly string[]>> = {
  '/v1/aliases': ['aliases', 'name', 'kind'],
  '/v1/mcp/entries': ['entries', ...BRIDGE_ENTRY_FIELDS, 'use', 'edit', 'create', 'delete'],
  '/v1/mcp/config-snippet': ['envVar', 'languages', 'snippet', 'error', 'id', 'label', 'variants', 'language', 'variant', 'code', 'where', 'does'],
  '/v1/mcp/folders': ['folders'],
};

/** The served reads that carry the product's own text and no vault data: pinned byte-equal instead of by field. */
export const BRIDGE_BYTE_EQUAL_READS: readonly string[] = ['/v1/health', '/v1/mcp/kinds', '/v1/mcp/kind-help'];
