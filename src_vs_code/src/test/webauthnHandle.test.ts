import assert from 'node:assert/strict';
import { test } from 'node:test';
import { webauthnUserHandle } from '../cryptoUtils';

/**
 * The user handle a security key files a resident credential under.
 *
 * A discoverable credential is keyed by (RP ID, user.id). The RP ID is fixed, so user.id
 * is the whole of the identity — and it used to be 16 random bytes generated at each
 * registration. Every attempt therefore claimed ANOTHER slot on the key instead of
 * replacing its own. A YubiKey 5 holds about 25; five retries on one account is a fifth
 * of the key spent, and a full key fails `create()` outright.
 */

test('the same account always yields the same handle', () => {
  const a = webauthnUserHandle('me@corp.dev');
  const b = webauthnUserHandle('me@corp.dev');

  assert.deepEqual(a, b);
});

test('registering again replaces that account\'s slot rather than taking a new one', () => {
  // The property that makes it a replacement: identical bytes, so the authenticator sees
  // the same (rp, user) pair. This is the whole fix, stated as an assertion.
  assert.equal(webauthnUserHandle('me@corp.dev').equals(webauthnUserHandle('ME@Corp.Dev')), true);
});

test('two accounts never share a slot', () => {
  assert.equal(
    webauthnUserHandle('me@corp.dev').equals(webauthnUserHandle('other@corp.dev')),
    false,
  );
});

test('the handle is a legal WebAuthn user id — 1 to 64 bytes', () => {
  for (const email of ['a@b.c', 'someone.with.a.very.long.address@a-long-domain.example.com', '']) {
    const h = webauthnUserHandle(email);
    assert.ok(h.length >= 1 && h.length <= 64, `${email} -> ${h.length} bytes`);
  }
});

test('the handle is not the email in plain bytes', () => {
  // It lands in the key's account list next to the readable name; there is no reason
  // for the identifier itself to be reversible as well.
  assert.equal(webauthnUserHandle('me@corp.dev').toString('utf8').includes('me@corp.dev'), false);
});
