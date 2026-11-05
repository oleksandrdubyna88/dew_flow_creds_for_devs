import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { BRIDGE_NOT_SERVED, BRIDGE_ROUTES, bridgeRouteRefusal, refusedOnBridge } from '../bridgeAllowList';
import { BridgeContext } from '../bridgeContext';
import { EXPORT_REFUSED, ErrorCode } from '../brokerProtocol';
import { contractRoutes, strayRoutes, unnamedMessage, unnamedRoutes } from './contractRoutes';

/**
 * The allow-list of a Remote Bridge (E1.2's table of one route, filled by E1.3): default deny, every contract
 * route named, and the table able to notice a route it has never seen.
 */

const CONTEXT: BridgeContext = { bridgeId: 'b1', accountId: 'a1', serverEntityId: 'e1', serverName: 'prod', target: '', remoteOs: undefined };
const CONTRACT: unknown = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'contract', 'broker-v1.json'), 'utf8'));
const tablePaths = (): string[] => BRIDGE_ROUTES.map((route) => route.path);

function spies(): { headers: [string, string][]; answers: [ErrorCode, string][]; res: { setHeader(n: string, v: string): void }; respond(c: ErrorCode, m: string): void } {
  const headers: [string, string][] = [];
  const answers: [ErrorCode, string][] = [];
  return {
    headers,
    answers,
    res: { setHeader: (name, value) => void headers.push([name, value]) },
    respond: (code, message) => void answers.push([code, message]),
  };
}

/**
 * What a bridge may do, written out — deliberately NOT derived from the table. This is the authorization
 * decision itself, and a test that took its expectation from the thing it checks would agree with a third
 * served route. Adding one is a change to this list, in the same commit, and a reviewer reads it.
 */
const SERVED: readonly string[] = [
  'GET /v1/health',
  'GET /v1/mcp/kinds',
  'GET /v1/mcp/kind-help',
  'GET /v1/aliases',
  'GET /v1/mcp/entries',
  'GET /v1/mcp/config-snippet',
  'GET /v1/mcp/folders',
  'POST /v1/mcp/use/exec',
  'POST /v1/mcp/use/query',
  'POST /v1/alias/exec',
  'POST /v1/alias/query',
  'POST /v1/use/exec',
  'POST /v1/use/query',
];

/** The served routes that touch the vault, and so go through the wall. */
const WALLED: readonly string[] = SERVED.filter((route) => !['GET /v1/health', 'GET /v1/mcp/kinds', 'GET /v1/mcp/kind-help'].includes(route));

const named = (route: { method: string; path: string }): string => `${route.method} ${route.path}`;

test('the sentence is the E1 one', () => {
  assert.equal(BRIDGE_NOT_SERVED, 'A Remote Bridge does not serve this request. A person can do it in the VS Code window.');
});

test('S1: every route the contract names is named in the table, and every table route is in the contract', () => {
  for (const route of unnamedRoutes(CONTRACT, tablePaths())) {
    assert.fail(unnamedMessage(route));
  }
  const inContract = new Set(contractRoutes(CONTRACT));
  for (const route of BRIDGE_ROUTES) {
    assert.ok(inContract.has(route.path), `${named(route)} is named in bridgeAllowList.ts and not in contract/broker-v1.json`);
  }
  assert.deepEqual(strayRoutes(CONTRACT), [], 'the contract holds no route string the enumeration does not know');
});

test('S1 companion: the enumeration finds the routes it is meant to (it would pass forever on an empty list)', () => {
  const found = contractRoutes(CONTRACT);
  for (const known of ['/v1/health', '/v1/aliases', '/v1/use/exportEnv', '/v1/alias/exec', '/v1/mcp/use/rotate', '/v1/mcp/folder/delete', '/v1/config/read', '/v1/mcp/create']) {
    assert.ok(found.includes(known), `${known} is enumerated`);
  }
  assert.ok(found.length >= 30, `the enumeration found ${found.length} routes`);
});

test('S2: a route the contract gains later is reported unnamed, however it is filed', () => {
  const grown = {
    ...(CONTRACT as Record<string, unknown>),
    mcpFutureRoute: '/v1/mcp/future',
    mcpActions: [...(CONTRACT as { mcpActions: string[] }).mcpActions, 'future'],
    elsewhere: { deeper: ['/v1/x'] },
  };
  const unnamed = unnamedRoutes(grown, tablePaths());
  assert.deepEqual([...unnamed].sort(), ['/v1/mcp/future', '/v1/mcp/use/future', '/v1/x']);
});

test('the table serves exactly the routes the authorization decision names, and walls every one that reaches the vault', () => {
  const served = BRIDGE_ROUTES.filter((route) => route.decision.served);
  assert.deepEqual(served.map(named).sort(), [...SERVED].sort());
  const walled = served.filter((route) => route.decision.served && route.decision.walled).map(named);
  assert.deepEqual(walled.sort(), [...WALLED].sort());
  for (const route of BRIDGE_ROUTES) {
    assert.ok(route.decision.why.length > 10, `${named(route)} says why`);
  }
});

test('S6: every route of the table answers as its row says, and the table is not named twice', () => {
  const seen = new Set<string>();
  for (const route of BRIDGE_ROUTES) {
    assert.ok(!seen.has(named(route)), `${named(route)} is listed once`);
    seen.add(named(route));
    const refusal = bridgeRouteRefusal(route.method, route.path);
    if (route.decision.served) {
      assert.equal(refusal, undefined, named(route));
    } else if (route.path.endsWith('/exportEnv')) {
      assert.deepEqual(refusal, { code: 'denied', message: EXPORT_REFUSED }, named(route));
    } else {
      assert.deepEqual(refusal, { code: 'not_supported', message: BRIDGE_NOT_SERVED }, named(route));
    }
  }
});

test('S6: exportEnv is refused with the export sentence on all three prefixes, and nothing else is', () => {
  for (const prefix of ['/v1/use/', '/v1/alias/', '/v1/mcp/use/']) {
    assert.deepEqual(bridgeRouteRefusal('POST', `${prefix}exportEnv`), { code: 'denied', message: EXPORT_REFUSED }, prefix);
  }
  const exportRows = BRIDGE_ROUTES.filter((route) => !route.decision.served && route.decision.message === EXPORT_REFUSED);
  assert.deepEqual(exportRows.map((route) => route.path).sort(), ['/v1/alias/exportEnv', '/v1/mcp/use/exportEnv', '/v1/use/exportEnv']);
});

test('row 11 and 12: run, terminal, up, down, rotate, delete, create, the folder verbs and the config read are not served', () => {
  const refused = [
    '/v1/use/run', '/v1/use/terminal', '/v1/use/up', '/v1/use/down', '/v1/alias/run', '/v1/alias/terminal', '/v1/alias/up', '/v1/alias/down',
    '/v1/mcp/use/run', '/v1/mcp/use/terminal', '/v1/mcp/use/up', '/v1/mcp/use/down', '/v1/mcp/use/rotate', '/v1/use/rotate', '/v1/alias/rotate',
    '/v1/config/read', '/v1/mcp/create', '/v1/mcp/delete', '/v1/mcp/folder/create', '/v1/mcp/folder/edit', '/v1/mcp/folder/delete',
  ];
  for (const route of refused) {
    assert.deepEqual(bridgeRouteRefusal('POST', route), { code: 'not_supported', message: BRIDGE_NOT_SERVED }, route);
  }
});

test('row 13: any other method or path is refused, whether or not such a route exists', () => {
  const refused: [string | undefined, string][] = [
    ['POST', '/v1/health'], ['HEAD', '/v1/health'], ['get', '/v1/health'], [undefined, '/v1/health'], ['GET', '/v1/health/'], ['GET', '/v1/health/x'],
    ['GET', '/v1/use/exec'], ['GET', '/v1/alias/exec'], ['GET', '/v1/mcp/use/exec'], ['GET', '/v1/use/exportEnv'], ['PUT', '/v1/use/exec'],
    ['POST', '/v1/aliases'], ['POST', '/v1/mcp/entries'], ['POST', '/v1/mcp/folders'], ['POST', '/v1/mcp/config-snippet'],
    ['POST', '/v1/use/Exec'], ['POST', '/v1/use/exec/'], ['POST', '/v1/use/'], ['POST', '/v1/use/exec?x=1'], ['POST', '/V1/use/exec'],
    ['POST', '/v1/use/future'], ['POST', '/v1/mcp/use/future'], ['POST', '/v1/alias/future'], ['GET', '/v1/mcp/future'],
    ['GET', '/v1/nope'], ['GET', '/'], ['GET', ''], ['DELETE', '/v1/mcp/delete'],
  ];
  for (const [method, route] of refused) {
    assert.deepEqual(bridgeRouteRefusal(method, route), { code: 'not_supported', message: BRIDGE_NOT_SERVED }, `${String(method)} ${route}`);
  }
});

test('the table cannot be changed from outside', () => {
  assert.ok(Object.isFrozen(BRIDGE_ROUTES), 'the list is frozen');
  assert.ok(BRIDGE_ROUTES.every((route) => Object.isFrozen(route)), 'and so is every row');
});

test('D14: off a bridge nothing is called — the main broker keeps every route', () => {
  const s = spies();
  assert.equal(refusedOnBridge(undefined, 'POST', '/v1/config/read', s.res, s.respond), false);
  assert.equal(refusedOnBridge(undefined, 'GET', '/v1/nope', s.res, s.respond), false);
  assert.deepEqual(s.headers, [], 'setHeader never called');
  assert.deepEqual(s.answers, [], 'respond never called');
});

test('D14: on a bridge, a served route passes and anything else is refused with Connection: close', () => {
  const served = spies();
  assert.equal(refusedOnBridge(CONTEXT, 'GET', '/v1/health', served.res, served.respond), false);
  assert.equal(refusedOnBridge(CONTEXT, 'POST', '/v1/use/exec', served.res, served.respond), false);
  assert.deepEqual([served.headers, served.answers], [[], []]);

  const refused = spies();
  assert.equal(refusedOnBridge(CONTEXT, 'POST', '/v1/use/run', refused.res, refused.respond), true);
  assert.deepEqual(refused.headers, [['Connection', 'close']]);
  assert.deepEqual(refused.answers, [['not_supported', BRIDGE_NOT_SERVED]]);
});

test('D14: Connection: close is set BEFORE the answer is written, so the answer carries it', () => {
  const order: string[] = [];
  const res = { setHeader: () => void order.push('header') };
  refusedOnBridge(CONTEXT, 'GET', '/v1/mcp/future', res, () => void order.push('respond'));
  assert.deepEqual(order, ['header', 'respond']);
});
