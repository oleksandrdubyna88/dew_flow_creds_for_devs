import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browserErrorHint } from '../webauthnHint';

/**
 * The vault now asks the key to VERIFY the person, not merely to be touched —
 * because the RP ID is the bare `localhost` and any other local page can ask for
 * the same credential, with `credentialId` and `prfSalt` sitting in the envelope
 * in plaintext by design. Requiring the key's PIN or a biometric does not close
 * that hole (only a real TLS domain would), but it stops a stolen prompt from
 * costing nothing more than a fingertip.
 *
 * The cost is that refusals get vaguer, and the message has to be honest about it.
 */

test('a NotAllowedError names BOTH causes, because the browser will not say which', () => {
  // WebAuthn deliberately returns one generic error for a cancelled prompt, a
  // timeout and a missing PIN — telling them apart would let a page fingerprint
  // the authenticator. Claiming a cause here would be a guess presented as fact.
  const hint = browserErrorHint('NotAllowedError: The operation either timed out or was not allowed.');

  assert.match(hint, /cancelled or timed out/);
  assert.match(hint, /no PIN|biometric/);
  assert.match(hint, /does not say which/);
});

test('it tells the person what to actually do', () => {
  const hint = browserErrorHint('NotAllowedError');

  assert.match(hint, /ykman fido access change-pin|Windows Hello|Touch ID/);
});

test('the PRF-support hint still wins for a PRF failure', () => {
  const hint = browserErrorHint('PRF extension not supported');

  assert.match(hint, /hmac-secret|YubiKey 5/);
  assert.doesNotMatch(hint, /cancelled or timed out/);
});

test('an unrecognised error is passed through unchanged rather than reinterpreted', () => {
  assert.equal(browserErrorHint('SomethingElse: nope'), 'SomethingElse: nope');
});
