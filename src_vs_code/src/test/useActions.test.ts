import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UseAction, UseActionRegistry, launchGuards } from '../useActions';

/**
 * The registry is the seam for entity kinds beyond SSH. Its one rule worth a
 * test: a duplicate registration throws at wiring time instead of silently
 * shadowing the action already there — a shadowed action is a capability that
 * quietly stops being the one you audited.
 */

const stub = (kind: string, action: string): UseAction => ({
  kind,
  action,
  mutatesSecrets: false,
  verb: `${action} on`,
  validate: () => ({ ok: true }),
  summarize: () => `${kind}:${action}`,
  describeOutcome: () => 'ok',
  run: async () => ({ status: 200, body: {} }),
});

test('an action is resolved by its (kind, action) pair', () => {
  const registry = new UseActionRegistry();
  registry.register(stub('ssh', 'exec'));
  registry.register(stub('ssh', 'terminal'));
  registry.register(stub('db', 'exec'));

  assert.equal(registry.resolve('ssh', 'exec')?.summarize({}), 'ssh:exec');
  assert.equal(registry.resolve('ssh', 'terminal')?.summarize({}), 'ssh:terminal');
  // Same action name, different kind: separate entries, no collision.
  assert.equal(registry.resolve('db', 'exec')?.summarize({}), 'db:exec');
});

test('an unregistered pair resolves to undefined, never to a near match', () => {
  const registry = new UseActionRegistry();
  registry.register(stub('ssh', 'exec'));

  assert.equal(registry.resolve('ssh', 'query'), undefined);
  assert.equal(registry.resolve('vpn', 'exec'), undefined);
});

test('registering the same pair twice throws', () => {
  const registry = new UseActionRegistry();
  registry.register(stub('ssh', 'exec'));

  assert.throws(() => registry.register(stub('ssh', 'exec')), /Duplicate use-action/);
});

test('the consent wording comes from the action, so the broker needs no list of them', () => {
  // The first version chose it with `action === 'exec' ? … : …`, which would
  // have offered to "open a terminal to" a database.
  const registry = new UseActionRegistry();
  registry.register(stub('db', 'query'));

  assert.equal(registry.resolve('db', 'query')?.verb, 'query on');
});

/**
 * `launchGuards` — which end stops a launched child (`PLAN_wsl_bridge_outlives_its_client.md` §5.7).
 *
 * <p>An ordinary action is cancelled by either end: the window closing or the request's client hanging
 * up. A rotation's statement is not — once it runs it may have changed the far side, and its new value is
 * stored only after it succeeds — so the request's end may stop its LAUNCH but never the run.</p>
 */
const ctxFor = (signal: AbortSignal, finishOnceStarted?: boolean) => ({
  accountId: 'a1',
  entityId: 'e1',
  entityName: 'prod',
  signal,
  ...(finishOnceStarted === undefined ? {} : { finishOnceStarted }),
});

/** Whether a launched child would be killed now — any of its kill signals has fired. */
const kills = (guards: { signal: readonly AbortSignal[] }): boolean => guards.signal.some((signal) => signal.aborted);

test('an ordinary action: the request hanging up both refuses the start and kills the run', () => {
  const window = new AbortController();
  const request = new AbortController();
  const guards = launchGuards(window.signal, ctxFor(request.signal));

  request.abort();

  assert.equal(guards.startGate.aborted, true, 'the start was not refused for a gone request');
  assert.equal(kills(guards), true, 'a running child would outlive its gone request');
});

test('the window closing stops an ordinary action too', () => {
  const window = new AbortController();
  const guards = launchGuards(window.signal, ctxFor(new AbortController().signal));

  window.abort();

  assert.equal(kills(guards), true, 'a child would outlive the window that started it');
});

test('work that must finish once started: the request ending refuses the start but never kills the run', () => {
  const window = new AbortController();
  const request = new AbortController();
  const guards = launchGuards(window.signal, ctxFor(request.signal, true));

  request.abort();

  assert.equal(guards.startGate.aborted, true, 'a rotation launched for a request already gone');
  assert.equal(kills(guards), false, 'a started rotation would be killed half-way, losing its new value');
  window.abort();
  assert.equal(kills(guards), true, 'only the window ending stops it');
});
