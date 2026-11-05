import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { BridgeContext, freezeBridgeContext } from '../bridgeContext';

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
