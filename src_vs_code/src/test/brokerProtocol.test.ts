import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_EXEC_TIMEOUT_MS,
  ErrorCode,
  MAX_EXEC_TIMEOUT_MS,
  MIN_EXEC_TIMEOUT_MS,
  clampExecTimeout,
  errorBody,
  parseBearer,
  parseJsonObject,
  isAliasListRoute,
  parseAliasRoute,
  parseUseRoute,
  statusForErrorCode,
} from '../brokerProtocol';

/**
 * The contract both halves read. Parsing is asserted at its edges because
 * every one of these functions sits in front of something that spawns a
 * process or authorizes a caller.
 */

test('the use route yields the action name, and nothing else does', () => {
  assert.equal(parseUseRoute('/v1/use/exec'), 'exec');
  assert.equal(parseUseRoute('/v1/use/terminal'), 'terminal');

  for (const bad of [
    '/v1/use/',
    '/v1/use/../health',
    '/v1/use/Exec', // a LEADING capital: never a second spelling of a real action
    '/v1/use/exec/extra',
    '/v1/health',
    '/',
    '/v2/use/exec',
  ]) {
    assert.equal(parseUseRoute(bad), undefined, `expected "${bad}" to be refused`);
  }
});

test('only a well-formed Bearer header yields a secret', () => {
  assert.equal(parseBearer('Bearer abc-123_XYZ'), 'abc-123_XYZ');
  assert.equal(parseBearer('  Bearer abc  '), 'abc');

  for (const bad of [undefined, '', 'abc', 'Basic abc', 'Bearer', 'Bearer ', 'Bearer a b', 'bearer abc']) {
    assert.equal(parseBearer(bad), undefined, `expected "${String(bad)}" to be refused`);
  }
});

test('a body must be a JSON object; an empty body is an empty object', () => {
  assert.deepEqual(parseJsonObject('{"command":"ls"}'), { command: 'ls' });
  assert.deepEqual(parseJsonObject(''), {});
  assert.deepEqual(parseJsonObject('   '), {});

  for (const bad of ['[]', '"text"', 'null', '42', '{oops', '{"a":]']) {
    assert.equal(parseJsonObject(bad), undefined, `expected "${bad}" to be refused`);
  }
});

test('every error code maps to its documented status', () => {
  const expected: Record<ErrorCode, number> = {
    invalid_request: 400,
    unauthorized: 401,
    denied: 403,
    not_found: 404,
    not_supported: 404,
    no_credential: 409,
    payload_too_large: 413,
    too_many_requests: 429,
    consent_timeout: 504,
    tool_missing: 412,
    internal: 500,
  };
  for (const [code, status] of Object.entries(expected) as [ErrorCode, number][]) {
    assert.equal(statusForErrorCode(code), status, code);
  }
});

test('an error body carries a code and a message, and nothing else', () => {
  assert.deepEqual(errorBody('denied', 'no'), { error: { code: 'denied', message: 'no' } });
});

test('a requested timeout is clamped into the broker band, never trusted', () => {
  assert.equal(clampExecTimeout(undefined), DEFAULT_EXEC_TIMEOUT_MS);
  assert.equal(clampExecTimeout('60000'), DEFAULT_EXEC_TIMEOUT_MS);
  assert.equal(clampExecTimeout(Number.NaN), DEFAULT_EXEC_TIMEOUT_MS);
  assert.equal(clampExecTimeout(Number.POSITIVE_INFINITY), DEFAULT_EXEC_TIMEOUT_MS);
  assert.equal(clampExecTimeout(0), MIN_EXEC_TIMEOUT_MS);
  assert.equal(clampExecTimeout(-5), MIN_EXEC_TIMEOUT_MS);
  assert.equal(clampExecTimeout(7 * 24 * 3600_000), MAX_EXEC_TIMEOUT_MS);
  assert.equal(clampExecTimeout(45_000), 45_000);
  assert.equal(clampExecTimeout(45_000.6), 45_001);
});

test('a missing local tool is its own answer, not "no credential"', () => {
  // The entity is fine and the request is fine — this machine simply has no psql. A 409
  // would tell the agent to fix the vault, which is the wrong instruction.
  assert.equal(statusForErrorCode('tool_missing'), 412);
});

/**
 * The alias route.
 *
 * <p>A separate prefix from `/v1/use/`, deliberately, because the two carry different
 * authorization stories: a use route requires a bearer token the human copied, an alias route
 * requires only a name and leans entirely on the consent modal. Anything that blurs them at
 * the parser is a way for one caller to end up on the other's terms.</p>
 */
test('an alias route yields its action', () => {
  assert.equal(parseAliasRoute('/v1/alias/exec'), 'exec');
  assert.equal(parseAliasRoute('/v1/alias/vpn-up'), 'vpn-up');
  // Reachable, and it has to be: `exportEnv` is what agentUseActions.ts registers. An earlier
  // version of this line asserted the opposite, which is how the `env` verb stayed a 404.
  assert.equal(parseAliasRoute('/v1/alias/exportEnv'), 'exportEnv');
});

test('the two route families never answer for each other', () => {
  assert.equal(parseAliasRoute('/v1/use/exec'), undefined);
  assert.equal(parseUseRoute('/v1/alias/exec'), undefined);
});

test('an alias route refuses anything that is not a plain action word', () => {
  for (const bad of [
    '/v1/alias/',
    '/v1/alias/../use/exec',
    '/v1/alias/exec/extra',
    '/v1/alias/-leading',
    '/v1/alias/9starts-with-a-digit',
    '/v1/alias/' + 'a'.repeat(64),
    '/v1/aliasexec',
  ]) {
    assert.equal(parseAliasRoute(bad), undefined, bad);
  }
});

/**
 * Every action the registry actually registers must be reachable.
 *
 * <p>The defect this was written against had shipped: `parseUseRoute`'s grammar was
 * lowercase-only, but `agentUseActions.ts` registers `exportEnv`. So `/v1/use/exportEnv`
 * answered 404 and the `env` verb had **never worked from any client** — not the Node CLI, not
 * the .NET one. Nothing caught it because no test drove that verb end to end; the unit tests
 * asserted the grammar against a assumption about the registry rather than against the
 * registry, and the neighbouring case even wrote that assumption down as a comment.</p>
 */
test('every registered action name is reachable as a route', () => {
  // These are the action strings in sshUseActions.ts and agentUseActions.ts, verbatim.
  for (const action of ['exec', 'terminal', 'run', 'query', 'exportEnv', 'up', 'down']) {
    assert.equal(parseUseRoute(`/v1/use/${action}`), action, `"${action}" is registered but unreachable`);
    assert.equal(parseAliasRoute(`/v1/alias/${action}`), action, `"${action}" unreachable by alias`);
  }
});

test('a leading capital is still refused, so no case variant aliases a real action', () => {
  // The half of the old rule that was right: an action starts lowercase, so `/v1/use/Exec`
  // must not become a second spelling of `exec`.
  assert.equal(parseUseRoute('/v1/use/Exec'), undefined);
  assert.equal(parseUseRoute('/v1/use/EXPORTENV'), undefined);
  assert.equal(parseAliasRoute('/v1/alias/Exec'), undefined);
});

test('the listing route is its own path, and a GET', () => {
  // Never the same path as an action: one answers a question and raises nothing, the other
  // performs something and raises a modal. A shape that could be confused for the other is a
  // shape somebody eventually confuses.
  assert.equal(isAliasListRoute('/v1/aliases'), true);

  for (const other of ['/v1/alias/exec', '/v1/alias', '/v1/aliases/', '/v1/aliases/exec', '/v1/health']) {
    assert.equal(isAliasListRoute(other), false, other);
  }
});

test('the listing path is not an action route, and an action path is not the listing', () => {
  assert.equal(parseAliasRoute('/v1/aliases'), undefined);
  assert.equal(isAliasListRoute('/v1/alias/exec'), false);
});
