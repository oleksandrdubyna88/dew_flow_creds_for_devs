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
  isConfigReadRoute,
  isMcpEntriesRoute,
  isMcpFoldersRoute,
  parseAliasRoute,
  parseMcpUseRoute,
  parseUseRoute,
  isMcpConfigSnippetRoute,
  statusForErrorCode,
} from '../brokerProtocol';
import { readRouteBody } from '../brokerReadRoutes';
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
  reads: Record<string, { method: string; path: string; authenticated: boolean }>;
  configRead: { method: string; path: string; authenticated: boolean; bearer: string };
  mcpUsePrefix: string;
  mcpActions: string[];
  mcpDeleteRoute: string;
  mcpCreateRoute: string;
  mcpFolderPrefix: string;
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

  assert.deepEqual(Object.keys(reads).sort(), [
    'aliases',
    'mcpConfigSnippet',
    'mcpEntries',
    'mcpFolders',
  ]);
  assert.equal(isAliasListRoute(reads.aliases.path), true);
  assert.equal(isMcpEntriesRoute(reads.mcpEntries.path), true);
  assert.equal(isMcpConfigSnippetRoute(reads.mcpConfigSnippet.path), true);
  assert.equal(isMcpFoldersRoute(reads.mcpFolders.path), true);
  for (const route of Object.values(reads)) {
    assert.match(route.path, /^\/v1\//, route.path);
  }
});

test('a read states its VERB, which is the field whose absence cost five releases', () => {
  // `health` and `configRead` carried a method from the beginning; the reads were bare paths, so
  // the verb was inferred — and `mcpFolders` could be filed here, where every client GETs, while
  // the window served it under POST alone. Both sides asserted the same PATH and neither could
  // say anything about the verb. Asserted over the whole table so the fifth read added tomorrow
  // is covered the day it is added.
  const { reads } = load();

  for (const [name, route] of Object.entries(reads)) {
    assert.equal(route.method, 'GET', `${name} is fetched with a GET by every client`);
    assert.equal(route.authenticated, false, `${name} is in \`reads\`, where nothing carries a token`);
  }
});

test('every route the contract files under `reads` is actually ANSWERED as a read', async () => {
  // The check the two agreeing tables could not make, and the reason `creds_folders` was dead in
  // 0.85.0 through 0.89.0. The contract records a route's PATH; it has no field for its METHOD.
  // Both sides asserted they meant the same path and neither asserted the window answers it on
  // GET — so a listing filed here and wired into the POST-only MCP dispatch was green on both
  // sides and 404 in the field, reported to the agent as "No CredsForDevs window answered".
  //
  // Iterating the contract rather than naming four routes is the point: a fifth read added
  // tomorrow is covered on the day it is added, which a fourth hand-written assertion is not.
  const { reads } = load();
  const sources = {
    aliases: () => [],
    mcpEntries: () => Promise.resolve([]),
    visibleConfig: () => undefined,
    folders: () => [],
  };

  for (const [name, route] of Object.entries(reads)) {
    const body = await readRouteBody(route.path, sources);
    assert.notEqual(body, undefined, `${name} (${route.path}) is filed as a read and answers nothing`);
  }
});

test('and nothing that PERFORMS is answered as one — the same mistake in the other direction', async () => {
  // The pair matters. A route filed under `reads` and served behind POST is dead (that was
  // `mcpFolders`); a route that performs something and is served as an unauthenticated GET is
  // worse than dead, because the read router answers before any token or modal is reached. Both
  // are classification errors and neither is visible in a table of paths.
  const contract = load();
  const sources = {
    aliases: () => [],
    mcpEntries: () => Promise.resolve([]),
    visibleConfig: () => undefined,
    folders: () => [],
  };
  const performing = [
    contract.configRead.path,
    contract.mcpDeleteRoute,
    contract.mcpCreateRoute,
    `${contract.mcpUsePrefix}exec`,
    `${contract.mcpFolderPrefix}create`,
    ...Object.values(contract.routes),
  ];

  for (const route of performing) {
    const body = await readRouteBody(route, sources);
    assert.equal(body, undefined, `${route} performs something and must never answer as a read`);
  }
});

test('the config read route travels too, and it is NOT one of the reads', () => {
  // The distinction the contract has to carry, because a second implementation cannot infer it:
  // everything under `reads` answers without a token and performs nothing, while this checks a
  // key against a stored hash and returns a config file entire. Filing it with them would have
  // told the other side it needs no credential.
  const { configRead, reads } = load();

  assert.equal(isConfigReadRoute(configRead.path), true);
  assert.equal(configRead.method, 'POST', 'a GET would put the key somewhere caches record it');
  assert.equal(configRead.authenticated, true);
  assert.equal(
    Object.values(reads).some((route) => route.path === configRead.path),
    false,
    'it is filed as unauthenticated',
  );
});

test('the read routes are not use routes — nothing under them performs anything', () => {
  const { reads } = load();

  for (const route of Object.values(reads)) {
    assert.equal(parseUseRoute(route.path), undefined, route.path);
    assert.equal(parseAliasRoute(route.path), undefined, route.path);
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
