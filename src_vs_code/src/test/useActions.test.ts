import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UseAction, UseActionRegistry } from '../useActions';

/**
 * The registry is the seam for entity kinds beyond SSH. Its one rule worth a
 * test: a duplicate registration throws at wiring time instead of silently
 * shadowing the action already there — a shadowed action is a capability that
 * quietly stops being the one you audited.
 */

const stub = (kind: string, action: string): UseAction => ({
  kind,
  action,
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
