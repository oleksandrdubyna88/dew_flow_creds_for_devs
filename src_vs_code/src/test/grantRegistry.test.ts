import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GrantRegistry } from '../grantRegistry';

/**
 * The consent state machine. A grant is minted pending, settles once, and
 * never un-settles — the rule that makes "Deny" mean something and keeps a
 * late consent timeout from demoting a grant the human already allowed.
 */

const mint = (registry: GrantRegistry) =>
  registry.mint('acct-1', 'entity-1', 'prod-db', 'ssh');

test('a minted grant is pending and addressable by its secret', () => {
  const registry = new GrantRegistry();
  const grant = mint(registry);

  assert.equal(grant.status, 'pending');
  assert.equal(registry.get(grant.secret)?.entityName, 'prod-db');
  assert.equal(registry.get(grant.secret)?.kind, 'ssh');
});

test('two grants on the same entity are separate capabilities', () => {
  const registry = new GrantRegistry();
  const first = mint(registry);
  const second = mint(registry);

  assert.notEqual(first.secret, second.secret);
  registry.deny(first.secret);
  assert.equal(registry.get(first.secret)?.status, 'denied');
  assert.equal(registry.get(second.secret)?.status, 'pending');
});

test('allow and deny each settle exactly once', () => {
  const registry = new GrantRegistry();
  const allowed = mint(registry);
  const denied = mint(registry);

  registry.allow(allowed.secret);
  registry.deny(allowed.secret); // late timeout, or a second dialog: ignored
  assert.equal(registry.get(allowed.secret)?.status, 'allowed');

  registry.deny(denied.secret);
  registry.allow(denied.secret); // a denied token never comes back
  assert.equal(registry.get(denied.secret)?.status, 'denied');
});

test('settling replaces the record instead of mutating the one handed out', () => {
  const registry = new GrantRegistry();
  const grant = mint(registry);

  registry.allow(grant.secret);

  assert.equal(grant.status, 'pending', 'the caller’s copy must not change under it');
  assert.equal(registry.get(grant.secret)?.status, 'allowed');
});

test('an unknown secret is undefined, and settling it is a no-op', () => {
  const registry = new GrantRegistry();

  assert.equal(registry.get('nope'), undefined);
  assert.equal(registry.allow('nope'), undefined);
  assert.equal(registry.deny('nope'), undefined);
});

test('the log label never contains the whole secret', () => {
  const registry = new GrantRegistry();
  const grant = mint(registry);

  assert.equal(GrantRegistry.describe(grant).includes(grant.secret), false);
});

test('denied grants do not accumulate — the next mint reclaims them', () => {
  // Every share adds a grant; without this, a long-lived window grows the map forever.
  const registry = new GrantRegistry();
  const a = mint(registry);
  registry.deny(a.secret);
  const b = mint(registry);
  registry.deny(b.secret);

  mint(registry); // triggers the sweep

  // A refused token being unknown afterwards is the same refusal to any agent holding it.
  assert.equal(registry.get(a.secret), undefined);
  assert.equal(registry.get(b.secret), undefined);
});

test('an allowed grant is a live capability and survives later mints', () => {
  const registry = new GrantRegistry();
  const allowed = mint(registry);
  registry.allow(allowed.secret);

  for (let i = 0; i < 20; i += 1) {
    mint(registry);
  }

  assert.equal(registry.get(allowed.secret)?.status, 'allowed');
});

test('a pending grant mid-consent is not swept by a concurrent mint', () => {
  const registry = new GrantRegistry();
  const pending = mint(registry); // never settled — its modal is still open

  mint(registry);

  assert.equal(registry.get(pending.secret)?.status, 'pending');
});

test('the 256-grant cap reclaims pending grants but keeps a live allowed one', () => {
  // An allowed grant is a live agent token. The cap used to evict strictly by insertion
  // order, so this oldest grant — allowed and in use — was the FIRST thing dropped once a
  // busy window crossed 256 shares. It must survive; the pending overflow is what goes.
  const registry = new GrantRegistry();
  const live = mint(registry); // the oldest entry
  registry.allow(live.secret);

  for (let i = 0; i < 300; i += 1) {
    mint(registry); // 300 pending grants, well past the 256 cap
  }

  assert.equal(registry.get(live.secret)?.status, 'allowed', 'the live token must not be evicted');
});
