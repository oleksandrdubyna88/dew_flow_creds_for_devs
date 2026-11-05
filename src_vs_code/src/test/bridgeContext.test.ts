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

test('D15: an empty target is accepted, an undefined remoteOs too, and the result is a frozen copy with no key', () => {
  const frozen = freezeBridgeContext({ ...FULL, target: '', remoteOs: undefined });
  assert.equal(frozen.target, '');
  assert.equal(frozen.remoteOs, undefined);
  assert.ok(Object.isFrozen(frozen));
  assert.ok(!('key' in frozen));
  assert.deepEqual(Object.keys(frozen).sort(), ['accountId', 'bridgeId', 'remoteOs', 'serverEntityId', 'serverName', 'target']);
});

test('D15: it is a copy — the caller keeps an object it can still change, the context does not follow', () => {
  const mine = { ...FULL };
  const frozen = freezeBridgeContext(mine);
  mine.serverEntityId = 'someone-else';
  assert.notEqual(frozen, mine);
  assert.equal(frozen.serverEntityId, 'e1');
});
