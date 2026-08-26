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
    '/v1/use/Exec', // uppercase is not a registered action name
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
  assert.equal(parseAliasRoute('/v1/alias/exportEnv'), undefined, 'uppercase is not in the grammar');
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
