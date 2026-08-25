import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GrantRegistry, MAX_DENIED_TOMBSTONES } from '../grantRegistry';

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

test('a denied grant stays denied, however many grants are minted after it', () => {
  // It used to be swept on the next mint, on the reasoning that "unknown" refuses just as
  // well as "denied". It does not: they are different answers to whoever holds the token.
  // Denied means a person said no — retrying is pointless. Unknown means the token is not
  // recognised — asking for a fresh one is the obvious next move, and that reopens the
  // modal the person just refused. The broker maps the two to 403 and 401, and the CLI to
  // exit 92 and 91, so the difference is visible all the way out.
  const registry = new GrantRegistry();
  const refused = mint(registry);
  registry.deny(refused.secret);

  for (let i = 0; i < 5; i += 1) {
    mint(registry);
  }

  assert.equal(registry.get(refused.secret)?.status, 'denied');
  assert.equal(registry.lookup(refused.secret).kind, 'live', 'still addressable, so it can refuse');
});

test('denied tombstones are bounded — they answer, they do not accumulate forever', () => {
  // The sweep existed for a real reason: every share adds a grant, and a long-lived window
  // would grow the map without limit. Keeping the answer costs a bounded number of entries.
  const registry = new GrantRegistry();
  const first = mint(registry);
  registry.deny(first.secret);

  for (let i = 0; i < MAX_DENIED_TOMBSTONES + 10; i += 1) {
    const g = mint(registry);
    registry.deny(g.secret);
  }
  mint(registry); // one more sweep

  assert.equal(registry.get(first.secret), undefined, 'the oldest refusal is the one that goes');
  assert.ok(
    registry.deniedCount() <= MAX_DENIED_TOMBSTONES,
    `kept ${registry.deniedCount()} tombstones`,
  );
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
