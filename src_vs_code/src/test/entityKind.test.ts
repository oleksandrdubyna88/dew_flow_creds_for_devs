import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canBurnOnAgentUse,
  canConnectSsh,
  permittedBurnPolicy,
  resolveKind,
  stampKind,
} from '../entityKind';
import { ENTITY_KINDS, EntityKind, EntityMetadata, kindOf } from '../types';

/**
 * One place of truth for "what kind is this" (audit 2026-08-25, A4).
 *
 * <p>The kind used to be re-derived from a bag of flags by everyone who needed it, which cost
 * two shipped-but-unreachable features. It is now carried on the record, with the flags kept
 * in step so a machine on an older build reads the same entity.</p>
 */

function details(over: Partial<EntityMetadata> = {}): EntityMetadata {
  return { id: 'e1', name: 'thing', isSshEnabled: false, ...over };
}

test('a record written before `kind` existed still answers, via its flags', () => {
  // The migration IS the fallback: nothing rewrites old vaults, they are simply read right.
  assert.equal(resolveKind(details({ isVpn: true })), 'vpn');
  assert.equal(resolveKind(details({ isDb: true })), 'db');
  assert.equal(resolveKind(details({ isSshKey: true })), 'sshkey');
  assert.equal(resolveKind(details({ isTerminal: true })), 'terminal');
  assert.equal(resolveKind(details({ isScript: true })), 'script');
  assert.equal(resolveKind(details({ isSshEnabled: true })), 'ssh');
  assert.equal(resolveKind(details()), 'credential');
  assert.equal(resolveKind(undefined), 'credential');
});

test('a stated kind wins over the flags — that is what makes it the source of truth', () => {
  // A record whose flags disagree (an older machine wrote them, an edit changed the type)
  // must read as what it SAYS it is, or the discriminant is just another opinion.
  assert.equal(resolveKind(details({ kind: 'terminal', isVpn: true })), 'terminal');
});

test('an unknown kind from a NEWER build falls back instead of throwing the entity away', () => {
  const fromTheFuture = { ...details({ isDb: true }), kind: 'quantum-tunnel' } as unknown as EntityMetadata;

  assert.equal(resolveKind(fromTheFuture), 'db', 'read what this build can still understand');
});

test('every kind survives a write/read round trip', () => {
  for (const kind of ENTITY_KINDS) {
    assert.equal(resolveKind(stampKind(details({ kind }))), kind, kind);
  }
});

test('a write states the kind AND keeps the legacy flags in step for older machines', () => {
  // Dropping the flags would make every synced entity read as a plain credential on a build
  // that predates `kind` — silently taking away its Connect, its Start, its Run.
  const stamped = stampKind(details({ kind: 'vpn' }));

  assert.equal(stamped.kind, 'vpn');
  assert.equal(stamped.isVpn, true);
  assert.equal(kindOf(stamped), 'vpn', 'an older build derives the same kind from the flags');
});

test('changing the type clears the flags of what it used to be', () => {
  // A stale flag would win on the older machine, so the entity would be two things at once.
  const wasDb = stampKind(details({ kind: 'db', isDb: true }));
  const nowTerminal = stampKind({ ...wasDb, kind: 'terminal' });

  assert.equal(nowTerminal.isDb, undefined);
  assert.equal(nowTerminal.isTerminal, true);
  assert.equal(kindOf(nowTerminal), 'terminal');
});

test('a one-use burn is refused for a kind the broker never serves', () => {
  // `oneUse` fires only through the broker, and the broker does not serve a key pair — so the
  // entry would live forever while the UI promised it would vanish after first use. Temporary
  // SSH keys for a customer's instance are the first thing anyone reaches for here.
  assert.equal(canBurnOnAgentUse('sshkey'), false);
  assert.equal(permittedBurnPolicy('sshkey', 'oneUse'), undefined);
  assert.equal(stampKind(details({ kind: 'sshkey', burnPolicy: 'oneUse' })).burnPolicy, undefined);
});

test('every other kind may burn on agent use, and keeps the policy through a write', () => {
  for (const kind of ENTITY_KINDS.filter((k) => k !== 'sshkey')) {
    assert.equal(canBurnOnAgentUse(kind), true, kind);
    assert.equal(stampKind(details({ kind, burnPolicy: 'oneUse' })).burnPolicy, 'oneUse', kind);
  }
});

test('a time-based burn is allowed for every kind, sshkey included', () => {
  // TTL is a property of the entry's lifetime, not of who can use it — the sweep deletes any
  // entity. Only the AGENT-use burn depends on the broker serving that kind.
  for (const kind of ENTITY_KINDS) {
    const stamped = stampKind(details({ kind, burnPolicy: 'ttl', expiresAt: 123 }));
    assert.equal(stamped.burnPolicy, 'ttl', kind);
    assert.equal(stamped.expiresAt, 123, kind);
  }
});

test('"can I connect over SSH" is broader than the KIND, on purpose and in one place', () => {
  // The tree keyed its :ssh menu on a host; kindOf keys the kind on isSshEnabled. Both are
  // now this predicate. It stays broad because narrowing it would take Connect away from
  // host-bearing entries that have it today — a product decision, not a refactor.
  assert.equal(canConnectSsh(details({ isSshEnabled: true })), true);
  assert.equal(canConnectSsh(details({ host: 'box.example.com' })), true, 'host but not marked');
  assert.equal(resolveKind(details({ host: 'box.example.com' })), 'credential', 'still not the KIND');
  assert.equal(canConnectSsh(details()), false);
  assert.equal(canConnectSsh(details({ host: '' })), false, 'an empty host is no host');
});

test('the kind list and its labels stay in step — a new kind cannot be half-added', () => {
  // A type-level guard cannot run, so this is the runtime half: ENTITY_KINDS is the list every
  // switch is checked against by the compiler, and assertNever is what makes that a build error.
  const known: EntityKind[] = [...ENTITY_KINDS];
  assert.equal(new Set(known).size, known.length, 'no duplicates');
  assert.ok(known.includes('credential') && known.includes('sshkey'));
});
