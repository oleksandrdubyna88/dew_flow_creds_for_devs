import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { BRIDGE_NOT_SERVED, bridgeRouteRefusal, refusedOnBridge } from '../bridgeAllowList';
import { BridgeContext } from '../bridgeContext';
import { ErrorCode } from '../brokerProtocol';

/** D14 and the default-deny table of E1.2: one route is known, and everything else is refused. */

const CONTEXT: BridgeContext = { bridgeId: 'b1', accountId: 'a1', serverEntityId: 'e1', serverName: 'prod', target: '', remoteOs: undefined };

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

test('the sentence is the E1 one', () => {
  assert.equal(BRIDGE_NOT_SERVED, 'A Remote Bridge does not serve this request. A person can do it in the VS Code window.');
});

test('D9 table: GET /v1/health is the one route served; every other method and path is not_supported', () => {
  assert.equal(bridgeRouteRefusal('GET', '/v1/health'), undefined);
  const refused: [string | undefined, string][] = [
    ['POST', '/v1/health'],
    ['HEAD', '/v1/health'],
    ['get', '/v1/health'],
    [undefined, '/v1/health'],
    ['GET', '/v1/health/'],
    ['GET', '/v1/health/x'],
    ['GET', '/v1/aliases'],
    ['GET', '/v1/mcp/entries'],
    ['GET', '/v1/nope'],
    ['GET', '/'],
    ['GET', ''],
    ['POST', '/v1/use/exec'],
    ['POST', '/v1/config/read'],
    ['POST', '/v1/alias/exec'],
    ['POST', '/v1/mcp/use/exec'],
    ['DELETE', '/v1/mcp/delete'],
  ];
  for (const [method, route] of refused) {
    assert.deepEqual(bridgeRouteRefusal(method, route), { code: 'not_supported', message: BRIDGE_NOT_SERVED }, `${String(method)} ${route}`);
  }
});

test('D14: off a bridge nothing is called — the main broker keeps every route', () => {
  const s = spies();
  assert.equal(refusedOnBridge(undefined, 'POST', '/v1/config/read', s.res, s.respond), false);
  assert.equal(refusedOnBridge(undefined, 'GET', '/v1/nope', s.res, s.respond), false);
  assert.deepEqual(s.headers, [], 'setHeader never called');
  assert.deepEqual(s.answers, [], 'respond never called');
});

test('D14: on a bridge, health is served and anything else is refused with Connection: close', () => {
  const served = spies();
  assert.equal(refusedOnBridge(CONTEXT, 'GET', '/v1/health', served.res, served.respond), false);
  assert.deepEqual([served.headers, served.answers], [[], []]);

  const refused = spies();
  assert.equal(refusedOnBridge(CONTEXT, 'POST', '/v1/use/exec', refused.res, refused.respond), true);
  assert.deepEqual(refused.headers, [['Connection', 'close']]);
  assert.deepEqual(refused.answers, [['not_supported', BRIDGE_NOT_SERVED]]);
});

test('D14: Connection: close is set BEFORE the answer is written, so the answer carries it', () => {
  const order: string[] = [];
  const res = { setHeader: () => void order.push('header') };
  refusedOnBridge(CONTEXT, 'GET', '/v1/aliases', res, () => void order.push('respond'));
  assert.deepEqual(order, ['header', 'respond']);
});
