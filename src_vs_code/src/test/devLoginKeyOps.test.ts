import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  boundFingerprint,
  isBoundVault,
  loginKeyAction,
  wrapsToStripForDeveloper,
} from '../devLoginKeyOps';
import { KeyWrap } from '../keyWrap';

const blob = { salt: 's', iv: 'i', tag: 't', data: 'd' };

const pin = (bound?: string): KeyWrap => ({
  kind: 'pin',
  id: 'pin',
  createdAt: 1,
  ...blob,
  ...(bound === undefined ? {} : { serverBound: true, loginKeyFingerprint: bound }),
});

const key = (id: string, bound?: string): KeyWrap => ({
  kind: 'webauthn',
  id,
  createdAt: 1,
  ...blob,
  ...(bound === undefined ? {} : { serverBound: true, loginKeyFingerprint: bound }),
});

const recovery: KeyWrap = { kind: 'recovery', id: 'recovery', createdAt: 1, ...blob };

const dev = { role: 'dev', active: true };

test('a cycle that could not ask the server changes nothing', () => {
  // The rule escrowAction states, and the one that matters most here: treating "we could not ask"
  // as "not a developer" would strip the binding once per flaky network.
  const wraps = [pin('abc')];

  assert.deepEqual(loginKeyAction(wraps, { canRewritePinWrap: true, loginKey: { fingerprint: 'abc' } }), {
    kind: 'unchanged',
  });
});

test('a bound vault with no key in hand REFUSES rather than writing itself unbound', () => {
  // The difference between unchanged and refuse is the whole point: unchanged lets the caller write
  // the file, and a bound wrap rewritten by a write that has no key is an unbound wrap.
  const wraps = [pin('abc')];

  assert.deepEqual(loginKeyAction(wraps, { canRewritePinWrap: true }), {
    kind: 'refuse',
    reason: 'noLoginKey',
  });
  assert.deepEqual(loginKeyAction(wraps, { policy: dev, canRewritePinWrap: true }), {
    kind: 'refuse',
    reason: 'noLoginKey',
  });
});

test('an unbound vault with no key simply waits', () => {
  assert.deepEqual(loginKeyAction([pin()], { policy: dev, canRewritePinWrap: true }), { kind: 'unchanged' });
});

test('a developer with a key binds on the first write that can rewrite the PIN wrap', () => {
  assert.deepEqual(
    loginKeyAction([pin()], { policy: dev, loginKey: { fingerprint: 'abc' }, canRewritePinWrap: true }),
    { kind: 'bind', reason: 'first' },
  );
});

test('without the PIN, binding waits for a write that has it', () => {
  // Background sync holds the master key, not the PIN — and the PIN wrap's key cannot be re-derived
  // without it. Inventing a prompt in a background cycle is the thing that must not happen.
  assert.deepEqual(
    loginKeyAction([pin()], { policy: dev, loginKey: { fingerprint: 'abc' }, canRewritePinWrap: false }),
    { kind: 'unchanged' },
  );
});

test('a vault already bound to the current key is left alone', () => {
  assert.deepEqual(
    loginKeyAction([pin('abc')], { policy: dev, loginKey: { fingerprint: 'abc' }, canRewritePinWrap: true }),
    { kind: 'unchanged' },
  );
});

test('a server key that has moved on rebinds when it can and refuses when it cannot', () => {
  const wraps = [pin('old')];

  assert.deepEqual(
    loginKeyAction(wraps, { policy: dev, loginKey: { fingerprint: 'new' }, canRewritePinWrap: true }),
    { kind: 'bind', reason: 'rekeyed' },
  );
  assert.deepEqual(
    loginKeyAction(wraps, { policy: dev, loginKey: { fingerprint: 'new' }, canRewritePinWrap: false }),
    { kind: 'refuse', reason: 'keyChanged' },
  );
});

test('somebody who is no longer a developer is unbound, and a member was never bound', () => {
  const member = { role: 'member', active: true };

  assert.deepEqual(loginKeyAction([pin('abc')], { policy: member, canRewritePinWrap: true }), { kind: 'unbind' });
  assert.deepEqual(loginKeyAction([pin()], { policy: member, canRewritePinWrap: true }), { kind: 'unchanged' });
});

test('a blocked developer is treated as not a developer', () => {
  // Belt and braces: the server refuses them long before this, but the client must not hold a
  // binding open for somebody the roster says is inactive.
  assert.deepEqual(
    loginKeyAction([pin('abc')], { policy: { role: 'dev', active: false }, canRewritePinWrap: true }),
    { kind: 'unbind' },
  );
});

test('a developer loses the recovery code and any UNBOUND security key', () => {
  // Both are doors that open the file without the server: a printed code needs no PIN at all, and an
  // unbound security key opens it offline with the thing in their pocket.
  const stripped = wrapsToStripForDeveloper([pin('abc'), key('yubi'), recovery]);

  assert.deepEqual(stripped.map((w) => w.kind).sort(), ['recovery', 'webauthn']);
});

test('a BOUND security key stays', () => {
  assert.deepEqual(wrapsToStripForDeveloper([pin('abc'), key('yubi', 'abc')]), []);
});

test('the last way in is never stripped', () => {
  // A vault whose only wrap is an unbound security key: dropping it would lock the person out of
  // their own credentials, which is worse than a door that closes one sync later.
  assert.deepEqual(wrapsToStripForDeveloper([key('yubi'), recovery]), []);
});

test('the shape helpers read what the wraps say', () => {
  assert.equal(isBoundVault([pin(), key('yubi')]), false);
  assert.equal(isBoundVault([pin('abc')]), true);
  assert.equal(boundFingerprint([pin(), key('yubi', 'xyz')]), 'xyz');
  assert.equal(boundFingerprint([pin()]), undefined);
});
