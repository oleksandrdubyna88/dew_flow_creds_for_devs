import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { BridgeContext, auditGrantMark, bridgeAuditName, freezeBridgeContext } from '../bridgeContext';

/** D15: a context with an empty identity cannot be built, because E1.3 and E1.4 compare these strings. */

const FULL: BridgeContext = {
  bridgeId: 'b1',
  accountId: 'a1',
  serverEntityId: 'e1',
  serverName: 'prod',
  target: 'me@host:22',
  remoteOs: 'linux',
};

test('D15: each of the four identity fields refuses to be empty, naming itself', () => {
  for (const field of ['bridgeId', 'accountId', 'serverEntityId', 'serverName'] as const) {
    assert.throws(
      () => freezeBridgeContext({ ...FULL, [field]: '' }),
      new Error(`A BridgeContext needs a non-empty ${field}.`),
    );
  }
});

test('D15: the first empty field is the one named', () => {
  assert.throws(() => freezeBridgeContext({ ...FULL, accountId: '', serverName: '' }), /non-empty accountId/);
});

const IDENTITY = ['bridgeId', 'accountId', 'serverEntityId', 'serverName'] as const;

/** `FULL` with one field taken away altogether — what a JavaScript caller or a cast can hand over. */
function without(field: keyof BridgeContext): BridgeContext {
  const copy: Record<string, unknown> = { ...FULL };
  delete copy[field];
  return copy as unknown as BridgeContext;
}

test('D15: a field that is missing is refused like an empty one — it must not pass as undefined', () => {
  for (const field of IDENTITY) {
    assert.throws(() => freezeBridgeContext(without(field)), new Error(`A BridgeContext needs a non-empty ${field}.`));
  }
});

test('D15: a field that is not a string is refused — a number, null or an object is not an identity', () => {
  for (const field of IDENTITY) {
    for (const value of [42, null, {}, ['x']]) {
      assert.throws(
        () => freezeBridgeContext({ ...FULL, [field]: value } as unknown as BridgeContext),
        new Error(`A BridgeContext needs a non-empty ${field}.`),
        `${field} = ${JSON.stringify(value)}`,
      );
    }
  }
});

test('D15: target must be a string (empty is fine) and remoteOs a string or undefined', () => {
  assert.throws(() => freezeBridgeContext(without('target')), new Error('A BridgeContext needs a string target (it may be empty).'));
  assert.throws(
    () => freezeBridgeContext({ ...FULL, remoteOs: 7 } as unknown as BridgeContext),
    new Error('A BridgeContext needs remoteOs to be a string or undefined.'),
  );
  assert.equal(freezeBridgeContext(without('remoteOs')).remoteOs, undefined, 'an absent remoteOs is the one field that may be');
});

test('D15: the frozen object is built from the six named fields only — a key, or anything else riding on the input, is dropped', () => {
  const carrying = { ...FULL, key: 'the-bridge-key-0123456789', token: 'tok-abc', nested: { key: 'deep' } } as unknown as BridgeContext;
  assert.ok('key' in carrying, 'the input really carries a key');
  const frozen = freezeBridgeContext(carrying);
  assert.ok(!('key' in frozen));
  assert.ok(!('token' in frozen));
  assert.ok(!('nested' in frozen));
  assert.deepEqual(Object.keys(frozen).sort(), ['accountId', 'bridgeId', 'remoteOs', 'serverEntityId', 'serverName', 'target']);
  assert.ok(!JSON.stringify(frozen).includes('the-bridge-key-0123456789'), 'the key is nowhere in what is handed on');
  assert.ok(!JSON.stringify(frozen).includes('tok-abc'));
});

test('D15: an empty target is accepted, an undefined remoteOs too, and the result is a frozen copy', () => {
  const frozen = freezeBridgeContext({ ...FULL, target: '', remoteOs: undefined });
  assert.equal(frozen.target, '');
  assert.equal(frozen.remoteOs, undefined);
  assert.ok(Object.isFrozen(frozen));
  assert.deepEqual(Object.keys(frozen).sort(), ['accountId', 'bridgeId', 'remoteOs', 'serverEntityId', 'serverName', 'target']);
});

test('D15: it is a copy — the caller keeps an object it can still change, the context does not follow', () => {
  const mine = { ...FULL };
  const frozen = freezeBridgeContext(mine);
  mine.serverEntityId = 'someone-else';
  assert.notEqual(frozen, mine);
  assert.equal(frozen.serverEntityId, 'e1');
});

/* ---------------------------------------------------------------------------------------------------------------
 * E1.4 — the server's name on the audit line (C14, C13's mark, Q7, Q13)
 * ------------------------------------------------------------------------------------------------------------- */

test('C14: the audit name has no whitespace, parenthesis or arrow — a run of them is one underscore', () => {
  assert.equal(bridgeAuditName('prod (eu) → db'), 'prod_eu_db');
  assert.equal(bridgeAuditName('ai-runner1'), 'ai-runner1', 'a plain name is untouched');
  assert.equal(bridgeAuditName('a\tb\nc  d'), 'a_b_c_d');
  assert.equal(bridgeAuditName('x)(y'), 'x_y', 'the two parentheses are one run');
  assert.equal(bridgeAuditName('→→'), '_', 'a name of nothing but separators is still a name, and not empty');
  assert.equal(bridgeAuditName(''), '_', 'and an empty one reads as one');
  assert.match(bridgeAuditName('a ( b ) → c\u00a0d\u2003e'), /^[^\s()→]+$/u, 'Unicode spaces count as whitespace');
});

test('C14: control and format characters cannot ride into the journal in a name', () => {
  // The caller label's sanitiser strips both classes (`brokerCaller.ts`); a bidi override in a server name would
  // re-order the line a person reads, and a control character would end it.
  assert.equal(bridgeAuditName('a\u202eb\u0007c\u200bd'), 'a_b_c_d');
  assert.doesNotMatch(bridgeAuditName('evil\u202e\u0000'), /[\p{Cc}\p{Cf}]/u);
});

test('C14: the audit name is at most 40 code points, cut by code point', () => {
  assert.equal(bridgeAuditName('x'.repeat(40)), 'x'.repeat(40));
  assert.equal(bridgeAuditName('x'.repeat(41)), 'x'.repeat(40), 'the 41st is cut');
  const astral = '\u{1F600}'.repeat(41);
  assert.equal(Array.from(bridgeAuditName(astral)).length, 40, 'counted in code points, so no half of a surrogate pair is left');
  assert.equal(bridgeAuditName(astral), '\u{1F600}'.repeat(40));
});

test('C13: the grant mark is a dash off a bridge and a dash and the name on one', () => {
  assert.equal(auditGrantMark(undefined), '—');
  assert.equal(auditGrantMark({ ...FULL, serverName: 'ai-runner1' }), '— bridge=ai-runner1');
  assert.equal(auditGrantMark({ ...FULL, serverName: 'prod (eu)' }), '— bridge=prod_eu_');
});
