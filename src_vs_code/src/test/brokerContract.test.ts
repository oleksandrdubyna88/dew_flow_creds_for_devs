import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  DEFAULT_EXEC_TIMEOUT_MS,
  MAX_CONCURRENT_EXECS,
  MAX_EXEC_TIMEOUT_MS,
  MAX_REQUEST_BODY_BYTES,
  MAX_STREAM_BYTES,
  MIN_EXEC_TIMEOUT_MS,
  SERVICE_NAME,
  isAliasListRoute,
  isMcpEntriesRoute,
  parseAliasRoute,
  parseMcpUseRoute,
  parseUseRoute,
  statusForErrorCode,
} from '../brokerProtocol';
import { EXIT } from '../agentCliOutcome';
import { switchForAction } from '../mcpEntries';

/**
 * The TypeScript side of the two-sided contract check.
 *
 * <p>`contract/broker-v1.json` is generated from this code, and a second implementation in
 * another language reads the same file at build time. That only prevents drift if somebody
 * notices when the two stop agreeing — so this asserts the file matches the code it was
 * generated from. Regenerating without the code change, or changing the code without
 * regenerating, both turn this red.</p>
 *
 * <p>The failure it exists to prevent is specific and nasty: a client in another language
 * sending `vpn-up` to a route the broker renamed, or reporting exit 95 where this one reports
 * 0. Neither shows up as an error anywhere — it shows up as an agent drawing a wrong
 * conclusion in somebody's terminal.</p>
 */

interface Contract {
  version: number;
  service: string;
  health: { method: string; path: string; authenticated: boolean };
  limits: Record<string, number>;
  routes: Record<string, string>;
  reads: Record<string, string>;
  mcpUsePrefix: string;
  mcpActions: string[];
  errors: Record<string, number>;
  exitCodes: Record<string, number>;
}

const CONTRACT_PATH = path.resolve(__dirname, '..', '..', '..', 'contract', 'broker-v1.json');

function load(): Contract {
  return JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8')) as Contract;
}

test('the generated contract file exists where both implementations look for it', () => {
  assert.equal(fs.existsSync(CONTRACT_PATH), true, `expected ${CONTRACT_PATH}`);
});

test('the service name matches — it is what the CLI checks before sending a token', () => {
  // `isOurBroker` compares this before a token leaves the process, so a mismatch would let a
  // token go to whatever unrelated program inherited a freed port.
  assert.equal(load().service, SERVICE_NAME);
});

test('every limit in the file is the constant it was generated from', () => {
  const { limits } = load();

  assert.equal(limits.maxRequestBodyBytes, MAX_REQUEST_BODY_BYTES);
  assert.equal(limits.maxStreamBytes, MAX_STREAM_BYTES);
  assert.equal(limits.maxConcurrentExecs, MAX_CONCURRENT_EXECS);
  assert.equal(limits.defaultExecTimeoutMs, DEFAULT_EXEC_TIMEOUT_MS);
  assert.equal(limits.minExecTimeoutMs, MIN_EXEC_TIMEOUT_MS);
  assert.equal(limits.maxExecTimeoutMs, MAX_EXEC_TIMEOUT_MS);
});

test('every error code maps to the status the broker actually answers with', () => {
  const { errors } = load();

  assert.ok(Object.keys(errors).length > 0, 'the file lists error codes');
  for (const [code, status] of Object.entries(errors)) {
    assert.equal(statusForErrorCode(code as never), status, code);
  }
});

test('every exit code matches, because an agent reads them and decides what to do', () => {
  const { exitCodes } = load();

  assert.deepEqual(exitCodes, { ...EXIT });
});

test('every verb the CLI can send is in the file, with its route', () => {
  // The route table lives in `agentCli.main`, which is not importable; this pins the file
  // against the verbs the outcome module knows how to report, so adding a verb to one and
  // not the other is caught here rather than at runtime in another language.
  const { routes } = load();

  assert.deepEqual(
    Object.keys(routes).sort(),
    ['db', 'env', 'exec', 'run', 'script', 'terminal', 'vpn-down', 'vpn-up'],
  );
  for (const route of Object.values(routes)) {
    assert.match(route, /^\/v1\/use\//, route);
  }
});

test('health is unauthenticated, and says so, because that is load-bearing', () => {
  // If a future change quietly required a token here, `isOurBroker` would fail closed and
  // every CLI call would report the window as gone.
  const { health } = load();

  assert.equal(health.authenticated, false);
  assert.equal(health.path, '/v1/health');
  assert.equal(health.method, 'GET');
});

test('the read routes travel in the contract, and the code agrees with what it says', () => {
  // Two GET routes now, and the second is read by a binary with no other way to learn its path.
  // Asserted against the predicates themselves rather than against a copy of the strings: a
  // route renamed in `brokerProtocol.ts` and not regenerated fails here.
  const { reads } = load();

  assert.deepEqual(Object.keys(reads).sort(), ['aliases', 'mcpEntries']);
  assert.equal(isAliasListRoute(reads.aliases), true);
  assert.equal(isMcpEntriesRoute(reads.mcpEntries), true);
  for (const route of Object.values(reads)) {
    assert.match(route, /^\/v1\//, route);
  }
});

test('the read routes are not use routes — nothing under them performs anything', () => {
  const { reads } = load();

  for (const route of Object.values(reads)) {
    assert.equal(parseUseRoute(route), undefined, route);
    assert.equal(parseAliasRoute(route), undefined, route);
  }
});

test('the MCP action prefix travels too, and is a prefix rather than eight more routes', () => {
  // The verb vocabulary is the `routes` table; repeating it here would be two lists to keep in
  // step. What a second implementation cannot guess is where the prefix lives.
  const { mcpUsePrefix, routes } = load();

  assert.equal(mcpUsePrefix, '/v1/mcp/use/');
  for (const verb of Object.keys(routes)) {
    const action = routes[verb].replace('/v1/use/', '');
    assert.equal(parseMcpUseRoute(`${mcpUsePrefix}${action}`), action, verb);
  }
});

test('an MCP action route is not a use route and not an alias route', () => {
  // Three prefixes, three authorization stories. A path that parsed as two of them would mean
  // one of the three gates could be reached through the wrong door.
  const path = '/v1/mcp/use/exec';

  assert.equal(parseMcpUseRoute(path), 'exec');
  assert.equal(parseUseRoute(path), undefined);
  assert.equal(parseAliasRoute(path), undefined);
  assert.equal(isMcpEntriesRoute(path), false);
});

test('the MCP action list is the CLI verb set PLUS rotate, and says so', () => {
  // Not the same set, and the difference is the point: the CLI has no `rotate`, because rotation
  // is a thing an agent asks for with a placeholder and not a shape a terminal command has.
  const { mcpActions, routes } = load();
  const cliActions = new Set(Object.values(routes).map((r) => r.replace('/v1/use/', '')));

  assert.ok(mcpActions.includes('rotate'));
  for (const action of cliActions) {
    assert.ok(mcpActions.includes(action), action);
  }
  assert.equal(mcpActions.length, cliActions.size + 1);
});

test('every MCP action asks for a switch, and rotate asks for a higher one than the rest', () => {
  // The ladder, at the one place it decides something. A rotation riding in on a permission
  // somebody granted for a read-only query is exactly what the per-action gate prevents.
  const { mcpActions } = load();

  assert.equal(switchForAction('rotate'), 'edit');
  for (const action of mcpActions.filter((a) => a !== 'rotate')) {
    assert.equal(switchForAction(action), 'use', action);
  }
  // A verb added to the broker and forgotten in the table must fail closed, not open.
  assert.equal(switchForAction('somethingNew'), 'delete');
});
