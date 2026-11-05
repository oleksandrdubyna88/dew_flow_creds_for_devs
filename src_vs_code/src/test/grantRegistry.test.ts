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

/* ---------------------------------------------------------------------------------------------------------------
 * Amendment 2, B.1 — a call refused before anybody was asked holds nothing, and the cap reaches a token last (A4)
 * ------------------------------------------------------------------------------------------------------------- */

/** The status the registry holds for a grant, or `undefined` when it holds none (evicted). */
const statusOf = (registry: GrantRegistry, grant: { secret: string }): string | undefined => registry.get(grant.secret)?.status;

/** Assert, for each grant, the status the registry should still hold for it. */
function assertStatuses(registry: GrantRegistry, expected: ReadonlyArray<readonly [{ secret: string }, string | undefined, string]>): void {
  for (const [grant, status, why] of expected) {
    assert.equal(statusOf(registry, grant), status, why);
  }
}

/** A denied token: a tombstone. */
function tombstone(registry: GrantRegistry): { secret: string } {
  const grant = mint(registry);
  registry.deny(grant.secret);
  return grant;
}

/** A call grant the person refused: its secret is in no response, it answers nobody. */
function deniedCallOf(registry: GrantRegistry): { secret: string } {
  const grant = mintForOneCall(registry);
  registry.deny(grant.secret);
  return grant;
}

/** A call grant the person (or a quiet policy) allowed, not yet reserved. */
function allowedCall(registry: GrantRegistry): { secret: string } {
  const grant = mintForOneCall(registry);
  registry.allow(grant.secret);
  return grant;
}

/** An allowed token. */
function allowedToken(registry: GrantRegistry): { secret: string } {
  const grant = mint(registry);
  registry.allow(grant.secret);
  return grant;
}

test('A4: 300 pending calls evict only calls — every token and tombstone is still there', () => {
  const registry = new GrantRegistry();
  const idleToken = mint(registry);
  const openToken = mint(registry); // a shared token whose first dialog is open: pending
  const allowed = allowedToken(registry);
  const tombstones = [tombstone(registry), tombstone(registry), tombstone(registry)];

  for (let i = 0; i < 300; i += 1) {
    mintForOneCall(registry); // a refused-before-the-dialog loop: pending call grants
  }

  assertStatuses(registry, [
    [idleToken, 'pending', 'a token whose first dialog is open is not evicted while a call grant exists'],
    [openToken, 'pending', 'nor another'],
    [allowed, 'allowed', 'an allowed token stays'],
    ...tombstones.map((grant) => [grant, 'denied', 'a denied tombstone still answers denied, not unknown'] as const),
  ]);
});

test('A4: 300 allowed call grants (silent MCP use) evict only calls — a tombstone, an open token and an allowed token all stay', () => {
  const registry = new GrantRegistry();
  const open = mint(registry);
  const dead = tombstone(registry);
  const allowed = allowedToken(registry);
  for (let i = 0; i < 300; i += 1) {
    registry.allow(mintForOneCall(registry).secret);
  }
  assertStatuses(registry, [
    [open, 'pending', 'allowed calls are tier two: an open token is not reached'],
    [dead, 'denied', 'nor a tombstone'],
    [allowed, 'allowed', 'nor an allowed token'],
  ]);
});

test('A4: drop deletes a call grant that is still pending, and nothing else', () => {
  const registry = new GrantRegistry();
  const pendingCall = mintForOneCall(registry);
  const allowedCall = mintForOneCall(registry);
  registry.allow(allowedCall.secret);
  const deniedCall = mintForOneCall(registry);
  registry.deny(deniedCall.secret);
  const pendingToken = mint(registry);
  const allowed = allowedToken(registry);
  const denied = tombstone(registry);

  for (const grant of [pendingCall, allowedCall, deniedCall, pendingToken, allowed, denied, { secret: 'nobody-minted-this' }]) {
    registry.drop(grant.secret);
  }

  assertStatuses(registry, [
    [pendingCall, undefined, 'a pending call grant is gone'],
    [allowedCall, 'allowed', 'an allowed call grant is not dropped'],
    [deniedCall, 'denied', 'a denied call grant is not dropped'],
    [pendingToken, 'pending', 'a token is never dropped, pending included'],
    [allowed, 'allowed', 'an allowed token stays'],
    [denied, 'denied', 'a denied token stays'],
  ]);
});

test('A4: each tier of the eviction list is reached only when the ones before it are empty, whatever the insertion order', () => {
  // Filler: allowed TOKENS, the last tier, so the map is full (256) and the next mint must evict exactly one grant.
  // The grants under test are minted FIRST, so by insertion order the one the list should leave for last is the oldest.
  const full = (...firstMinted: Array<(r: GrantRegistry) => string>): { registry: GrantRegistry; ids: string[] } => {
    const registry = new GrantRegistry();
    const ids = firstMinted.map((make) => make(registry));
    while (ids.length < 256) {
      const filler = mint(registry);
      registry.allow(filler.secret);
      ids.push(filler.secret);
    }
    return { registry, ids };
  };
  const anAllowedToken = (r: GrantRegistry): string => allowedToken(r).secret;
  const openToken = (r: GrantRegistry): string => mint(r).secret;
  const aTombstone = (r: GrantRegistry): string => tombstone(r).secret;
  const unusedAllowedCall = (r: GrantRegistry): string => allowedCall(r).secret;
  const usedAllowedCall = (r: GrantRegistry): string => {
    const g = allowedCall(r);
    r.reserve(g.secret);
    return g.secret;
  };
  const pendingCall = (r: GrantRegistry): string => mintForOneCall(r).secret;
  const deniedCall = (r: GrantRegistry): string => deniedCallOf(r).secret;

  const cases: Array<[string, Array<(r: GrantRegistry) => string>, number]> = [
    ['a denied call before a call that ran', [usedAllowedCall, deniedCall], 1],
    ['a call that ran before a call whose dialog may be open (pending)', [pendingCall, usedAllowedCall], 1],
    ['a call that ran before an Allow not yet reserved', [unusedAllowedCall, usedAllowedCall], 1],
    ['a pending call before a tombstone', [aTombstone, pendingCall], 1],
    ['an allowed, unreserved call before a tombstone', [aTombstone, unusedAllowedCall], 1],
    ['a tombstone before an open token', [openToken, aTombstone], 1],
    ['an open token before an allowed token', [anAllowedToken, openToken], 1],
  ];
  for (const [what, makers, victimAt] of cases) {
    const { registry, ids } = full(...makers);
    mintForOneCall(registry); // one more: the cap evicts one
    const gone = ids.filter((id) => registry.get(id) === undefined);
    assert.deepEqual(gone, [ids[victimAt]], what);
  }
});

test('A4 (Amendment 3, C.4): a live dialog pending call survives 300 calls that ran; denied calls go first, then calls that ran, oldest first', () => {
  const registry = new GrantRegistry();
  const dialogOpen = mintForOneCall(registry); // the call whose dialog is on screen
  const unreserved = allowedCall(registry); // an Allow not yet reserved: older than every call that ran below
  const denied = [deniedCallOf(registry), deniedCallOf(registry)];
  const openToken = mint(registry);
  const allowed = allowedToken(registry);
  const tombstones = [tombstone(registry), tombstone(registry), tombstone(registry)];
  const ran: Array<{ secret: string }> = [];
  for (let i = 0; i < 300; i += 1) {
    const call = allowedCall(registry);
    registry.reserve(call.secret); // silent MCP use: allowed at once, then reserved
    ran.push(call);
  }

  // 9 + 300 = 309 grants went in against a cap of 256: 53 were evicted, the 2 denied calls and the 51 oldest calls that ran.
  assertStatuses(registry, [
    [dialogOpen, 'pending', 'a dialog is open on this call: it is not reached while a call that ran exists'],
    [unreserved, 'allowed', 'an Allow not yet reserved is older than every call that ran and still outlives them'],
    ...denied.map((grant) => [grant, undefined, 'a refused call goes first'] as const),
    [openToken, 'pending', 'no token while a call grant exists'],
    [allowed, 'allowed', 'nor an allowed token'],
    ...tombstones.map((grant) => [grant, 'denied', 'nor a tombstone'] as const),
    ...ran.slice(0, 51).map((grant) => [grant, undefined, 'the oldest calls that ran go next'] as const),
    ...ran.slice(51).map((grant) => [grant, 'allowed', 'the newer calls that ran stay'] as const),
  ]);
});
