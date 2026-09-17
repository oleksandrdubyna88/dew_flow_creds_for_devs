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

/** What the MCP door and the alias route mint: one request's capability, never handed out. */
const mintForOneCall = (registry: GrantRegistry) =>
  registry.mint('acct-1', 'entity-1', 'prod-db', 'ssh', Date.now(), 'call');

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

test('a shared token survives sustained SILENT mcp use, which mints allowed grants', () => {
  // The row above passes because its overflow is PENDING, and pending is what the cap prefers to
  // reclaim. Issue #95 broke that assumption: the MCP door mints a fresh grant per call and a
  // pre-consented call marks it ALLOWED immediately, at up to sixty calls a minute. So the map
  // fills with allowed grants, `oldestEvictable` runs out of pending victims and falls back to the
  // oldest ALLOWED — which is the long-lived token somebody shared with Claude Code, because map
  // order is insertion order and using a grant does not move it.
  //
  // 256 at 60/min is about four minutes of unattended agent work, and this registry's own docblock
  // says the cap was a backstop that "in practice only the denied-grant sweep ever fires". It fires
  // routinely now. Reported by CodeRabbit on PR #106 as a merge risk, and it was right.
  const registry = new GrantRegistry();
  const shared = mint(registry); // the token an integration is still using
  registry.allow(shared.secret);

  for (let i = 0; i < 300; i += 1) {
    const quiet = mintForOneCall(registry);
    registry.allow(quiet.secret); // what `preConsent` does on every silent use call
  }

  assert.equal(
    registry.get(shared.secret)?.status,
    'allowed',
    'sustained silent use evicted a live shared token — the integration stops working with no event anywhere',
  );
});

test('and the window still bounds itself — the call grants are what went', () => {
  // The other half of the same guarantee, and the reason the fix is a preference rather than an
  // exemption: if call grants were merely spared, 256 would become a floor that nothing reclaims.
  const registry = new GrantRegistry();
  const shared = mint(registry);
  registry.allow(shared.secret);
  const first = mintForOneCall(registry);
  registry.allow(first.secret);

  for (let i = 0; i < 300; i += 1) {
    registry.allow(mintForOneCall(registry).secret);
  }

  assert.equal(registry.get(shared.secret)?.status, 'allowed', 'the token stays');
  assert.equal(registry.get(first.secret), undefined, 'the oldest call grant is what the cap reclaimed');
});

test('a door that mints per call says so; everything else is a token by default', () => {
  // The default is the conservative one on purpose: a new door that forgets to declare its scope
  // gets a grant the cap protects, not one it throws away first.
  const registry = new GrantRegistry();

  assert.equal(mint(registry).scope, 'token');
  assert.equal(mintForOneCall(registry).scope, 'call');
});
