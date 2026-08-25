import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GrantRegistry, NO_LIMITS, grantExpiry } from '../grantRegistry';

/**
 * A token's lifetime used to be the window's. That is the right ceiling and the wrong floor:
 * a token pasted into an agent transcript that outlives the task kept buying unattended access
 * for days. These pin the two limits that end it sooner — an idle window and a call cap —
 * and the one thing they must never do: cut off a token an agent is actively using.
 */

const T0 = 1_700_000_000_000;
const HOUR = 60 * 60_000;
const IDLE_HOUR = { idleMs: HOUR, maxUses: 0 };

const mint = (registry: GrantRegistry, now = T0) => registry.mint('acct', 'ent', 'prod-db', 'db', now);

test('with no limits a grant lives as long as the registry does', () => {
  const registry = new GrantRegistry();
  const grant = mint(registry);
  const found = registry.lookup(grant.secret, T0 + 400 * 24 * HOUR, NO_LIMITS);
  assert.equal(found.kind, 'live');
});

test('an unused token expires after the idle window, and says why', () => {
  const registry = new GrantRegistry();
  const grant = mint(registry);

  assert.equal(registry.lookup(grant.secret, T0 + HOUR, IDLE_HOUR).kind, 'live', 'exactly at the edge is still live');
  const later = registry.lookup(grant.secret, T0 + HOUR + 1, IDLE_HOUR);
  assert.deepEqual(later, { kind: 'expired', reason: 'idle' });
});

test('a token in use never goes idle: every touch restarts the clock', () => {
  const registry = new GrantRegistry();
  const grant = mint(registry);
  registry.allow(grant.secret);

  // Fifty minutes apart, for a day — each call inside the window keeps the next one live.
  let now = T0;
  for (let i = 0; i < 30; i += 1) {
    now += 50 * 60_000;
    assert.equal(registry.lookup(grant.secret, now, IDLE_HOUR).kind, 'live', `call ${i}`);
    registry.touch(grant.secret, now);
  }
  assert.equal(registry.get(grant.secret)?.uses, 30);
});

test('an expired token is gone: the second lookup reads unknown, not expired again', () => {
  // Deleted on the way out, so nothing downstream can accidentally revive or count it.
  const registry = new GrantRegistry();
  const grant = mint(registry);

  assert.equal(registry.lookup(grant.secret, T0 + 2 * HOUR, IDLE_HOUR).kind, 'expired');
  assert.equal(registry.lookup(grant.secret, T0 + 2 * HOUR, IDLE_HOUR).kind, 'unknown');
  assert.equal(registry.get(grant.secret), undefined);
});

test('a call cap spends the token after exactly that many uses', () => {
  const registry = new GrantRegistry();
  const grant = mint(registry);
  const limits = { idleMs: 0, maxUses: 3 };

  for (let i = 0; i < 3; i += 1) {
    assert.equal(registry.lookup(grant.secret, T0, limits).kind, 'live', `use ${i + 1}`);
    registry.touch(grant.secret, T0);
  }
  assert.deepEqual(registry.lookup(grant.secret, T0, limits), { kind: 'expired', reason: 'uses' });
});

test('the cap is checked before the clock, so a spent token reads as spent', () => {
  const grant = { ...mint(new GrantRegistry()), uses: 5, lastUsedAt: T0 - 3 * HOUR };
  assert.equal(grantExpiry(grant, T0, { idleMs: HOUR, maxUses: 5 }), 'uses');
  assert.equal(grantExpiry({ ...grant, uses: 1 }, T0, { idleMs: HOUR, maxUses: 5 }), 'idle');
  assert.equal(grantExpiry({ ...grant, uses: 1, lastUsedAt: T0 }, T0, { idleMs: HOUR, maxUses: 5 }), undefined);
});

test('touching an unknown secret does nothing and mints nothing', () => {
  const registry = new GrantRegistry();
  assert.equal(registry.touch('not-a-secret', T0), undefined);
  assert.equal(registry.lookup('not-a-secret', T0, NO_LIMITS).kind, 'unknown');
});

test('a fresh grant is minted with its clock started and no uses', () => {
  const grant = mint(new GrantRegistry(), T0);
  assert.equal(grant.mintedAt, T0);
  assert.equal(grant.lastUsedAt, T0);
  assert.equal(grant.uses, 0);
});

test('a denial outranks the idle clock — a refusal never decays into "unknown"', () => {
  // Found by an adversarial review, and it is the collision of two of this file's own
  // features: 0.57.0 gave tokens an idle life, 0.57.2 made a refusal keep answering. A denied
  // grant is never touch()ed — nothing uses it — so its idle clock ran from mint, and an hour
  // after the person pressed Deny the tombstone was swept and the broker answered 401 "ask for
  // a fresh Share with Claude Code". That is precisely the re-prompt loop the refusal
  // tombstone exists to prevent, restored by the clock.
  const registry = new GrantRegistry();
  const refused = mint(registry);
  registry.deny(refused.secret);

  const muchLater = T0 + 100 * HOUR;
  const found = registry.lookup(refused.secret, muchLater, IDLE_HOUR);

  assert.equal(found.kind, 'live', 'still addressable, so it can still refuse');
  assert.equal(found.kind === 'live' && found.grant.status, 'denied');
  // And it stays that way — the second call must not find it swept either.
  assert.equal(registry.lookup(refused.secret, muchLater + HOUR, IDLE_HOUR).kind, 'live');
});

test('a call cap does not spend a denial either', () => {
  const registry = new GrantRegistry();
  const refused = mint(registry);
  registry.deny(refused.secret);

  const spent = { idleMs: 0, maxUses: 1 };
  registry.touch(refused.secret);
  registry.touch(refused.secret);

  assert.equal(registry.lookup(refused.secret, T0, spent).kind, 'live', 'denied outranks the cap');
});

test('an ALLOWED grant still expires — precedence is about refusals, not about immunity', () => {
  const registry = new GrantRegistry();
  const allowed = mint(registry);
  registry.allow(allowed.secret);

  assert.deepEqual(registry.lookup(allowed.secret, T0 + 2 * HOUR, IDLE_HOUR), {
    kind: 'expired',
    reason: 'idle',
  });
});
