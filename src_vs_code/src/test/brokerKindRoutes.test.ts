import assert from 'node:assert/strict';
import { test } from 'node:test';
import { agentKindHelp, agentKinds } from '../agentKindFields';
import { isMcpKindHelpRoute, isMcpKindsRoute, parseAliasRoute, parseMcpUseRoute, parseUseRoute } from '../brokerProtocol';
import { readRouteBody } from '../brokerReadRoutes';

/**
 * The catalogue, served: `GET /v1/mcp/kinds` and `GET /v1/mcp/kind-help?kind=…`.
 *
 * <p>Reads, like the entries and the folders — no token, no prompt, no throttle — and unlike them
 * they need no vault at all: the answer is the table in `agentKindFields.ts`, the same on every
 * window. That is why they are driven through `readRouteBody` with EMPTY sources here: a window
 * that has opened nothing to agents still tells an agent what a kind is.</p>
 */

const NO_SOURCES = {};

test('the kinds route answers the catalogue as a read, with no source behind it', async () => {
  const body = await readRouteBody('/v1/mcp/kinds', NO_SOURCES);

  assert.notEqual(body, undefined, 'the route is not served as a read');
  assert.deepEqual(body, { kinds: agentKinds() });
});

test('the kind-help route answers one kind, named in the query', async () => {
  const body = await readRouteBody('/v1/mcp/kind-help', NO_SOURCES, new URLSearchParams('kind=terminal'));

  assert.deepEqual(body, agentKindHelp('terminal'));
});

test('a word that is not a kind is refused IN the body, naming the kinds and creds_kinds', async () => {
  // 200 with `error`, the way the config-snippet route refuses: the relay reads the JSON either way,
  // and "which kinds exist" is not a disclosure worth a status code.
  const body = (await readRouteBody('/v1/mcp/kind-help', NO_SOURCES, new URLSearchParams('kind=sudo'))) as {
    error?: string;
    hint?: string;
  };

  assert.match(String(body.error), /"sudo" is not a kind of entry/);
  assert.match(String(body.error), /credential, ssh, sshkey, vpn, db, terminal, script, config, payment/);
  assert.match(String(body.hint), /creds_kinds/);
});

test('no kind at all is the same refusal', async () => {
  const body = (await readRouteBody('/v1/mcp/kind-help', NO_SOURCES)) as { error?: string };

  assert.match(String(body.error), /not a kind of entry/);
});

test("payment's help says an agent cannot create it, and offers no example", async () => {
  const body = (await readRouteBody('/v1/mcp/kind-help', NO_SOURCES, new URLSearchParams('kind=payment'))) as unknown as {
    creatable: boolean;
    refusal?: string;
    example?: unknown;
  };

  assert.equal(body.creatable, false);
  assert.match(String(body.refusal), /cannot be created by an agent/);
  assert.equal(body.example, undefined);
});

test('the two routes are reads and nothing else — not a use, not an alias, not each other', () => {
  assert.equal(isMcpKindsRoute('/v1/mcp/kinds'), true);
  assert.equal(isMcpKindHelpRoute('/v1/mcp/kind-help'), true);
  assert.equal(isMcpKindsRoute('/v1/mcp/kind-help'), false);
  assert.equal(isMcpKindHelpRoute('/v1/mcp/kinds'), false);
  for (const path of ['/v1/mcp/kinds', '/v1/mcp/kind-help']) {
    assert.equal(parseUseRoute(path), undefined, path);
    assert.equal(parseAliasRoute(path), undefined, path);
    assert.equal(parseMcpUseRoute(path), undefined, path);
  }
});
