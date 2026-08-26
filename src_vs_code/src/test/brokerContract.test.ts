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
  statusForErrorCode,
} from '../brokerProtocol';
import { EXIT } from '../agentCliOutcome';

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
