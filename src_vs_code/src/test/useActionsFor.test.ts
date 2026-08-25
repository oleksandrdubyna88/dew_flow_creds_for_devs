import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UseAction, UseActionRegistry } from '../useActions';

/**
 * The consent dialog has to name everything a grant buys, and only the registry knows.
 *
 * <p>Consent is per GRANT. An Allow given while the dialog said "open a terminal to" also
 * authorised every future `exec` on the same host — which the dialog never mentioned. The
 * words come from the actions themselves, in registration order, so the dialog cannot drift
 * from what is actually registered.</p>
 */

function action(kind: string, name: string, verb: string): UseAction {
  return {
    kind,
    action: name,
    verb,
    validate: () => ({ ok: true }),
    summarize: () => '',
    describeOutcome: () => '',
    run: () => Promise.resolve({ status: 200, body: {} }),
  };
}

test('actionsFor lists every action of the kind, in registration order, and nothing else', () => {
  const registry = new UseActionRegistry();
  registry.register(action('ssh', 'exec', 'run a command on'));
  registry.register(action('db', 'query', 'run a query against'));
  registry.register(action('ssh', 'terminal', 'open the terminal of'));

  assert.deepEqual(
    registry.actionsFor('ssh').map((a) => a.verb),
    ['run a command on', 'open the terminal of'],
  );
  assert.deepEqual(registry.actionsFor('db').map((a) => a.action), ['query']);
  assert.deepEqual(registry.actionsFor('vpn'), []);
});

test('the consent wording is derived from the same list the broker resolves against', () => {
  // The two must agree: an action resolvable under a kind is one the dialog names.
  const registry = new UseActionRegistry();
  registry.register(action('ssh', 'exec', 'run a command on'));
  registry.register(action('ssh', 'terminal', 'open the terminal of'));

  for (const a of registry.actionsFor('ssh')) {
    assert.equal(registry.resolve('ssh', a.action), a);
  }
});
