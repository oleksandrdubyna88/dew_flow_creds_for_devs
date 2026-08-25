import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ShareTranscript,
  generateSigningKeypair,
  keyFingerprint,
  signShare,
  verifyShare,
} from '../shareSignature';

/**
 * On a shared folder nobody stamps who sent a share, so anyone with write access
 * can label an item as coming from a colleague. These are the properties the
 * signature has to have for that to stop working — and each test is one of the
 * attacks, not one of the functions.
 */

const alice = generateSigningKeypair();
const mallory = generateSigningKeypair();

const transcript = (over: Partial<ShareTranscript> = {}): ShareTranscript => ({
  shareId: 'a1b2c3',
  fromEmail: 'alice@corp.com',
  toEmail: 'bob@corp.com',
  createdAt: 1_756_000_000_000,
  senderPublicKey: alice.publicKey,
  kdfN: 131072,
  kdfR: 8,
  kdfP: 1,
  data: 'c2VhbGVkLXBheWxvYWQ=',
  tag: 'dGFn',
  ...over,
});

test('a share Alice signed verifies against Alice’s key', () => {
  const t = transcript();
  assert.equal(verifyShare(alice.publicKey, t, signShare(alice.privateKey, t)), true);
});

test('Mallory cannot sign as Alice — that is the whole point', () => {
  const t = transcript();
  // She signs a transcript that names Alice; the key is hers.
  assert.equal(verifyShare(alice.publicKey, t, signShare(mallory.privateKey, t)), false);
});

test('changing the claimed sender after signing breaks it', () => {
  const t = transcript();
  const signature = signShare(alice.privateKey, t);

  assert.equal(verifyShare(alice.publicKey, { ...t, fromEmail: 'ceo@corp.com' }, signature), false);
});

test('a captured share cannot be re-aimed at somebody else', () => {
  // Without toEmail in the transcript, an item addressed to Bob could be copied
  // into Carol's file and would still verify.
  const t = transcript();
  const signature = signShare(alice.privateKey, t);

  assert.equal(verifyShare(alice.publicKey, { ...t, toEmail: 'carol@corp.com' }, signature), false);
});

test('swapping the payload for another one breaks it', () => {
  const t = transcript();
  const signature = signShare(alice.privateKey, t);

  assert.equal(verifyShare(alice.publicKey, { ...t, data: 'b3RoZXItcGF5bG9hZA==' }, signature), false);
  assert.equal(verifyShare(alice.publicKey, { ...t, tag: 'b3RoZXItdGFn' }, signature), false);
});

test('the sender’s own key is inside the signed data, so it cannot be substituted', () => {
  // Otherwise Mallory could keep Alice's signature and publish her own key beside
  // it, and a recipient checking "signature matches published key" would agree.
  const t = transcript();
  const signature = signShare(alice.privateKey, t);

  assert.equal(
    verifyShare(mallory.publicKey, { ...t, senderPublicKey: mallory.publicKey }, signature),
    false,
  );
});

test('the KDF parameters are signed, so nobody can weaken them in transit', () => {
  const t = transcript();
  const signature = signShare(alice.privateKey, t);

  assert.equal(verifyShare(alice.publicKey, { ...t, kdfN: 1024 }, signature), false);
});

test('a shifted field boundary is not the same transcript', () => {
  // Length-prefixed canonicalisation: plain concatenation would hash
  // fromEmail="ab", toEmail="c" the same as fromEmail="a", toEmail="bc".
  const t = transcript({ fromEmail: 'ab', toEmail: 'c' });
  const signature = signShare(alice.privateKey, t);

  assert.equal(verifyShare(alice.publicKey, { ...t, fromEmail: 'a', toEmail: 'bc' }, signature), false);
});

test('a malformed key or signature is unverified, never a crash', () => {
  // The caller is deciding which badge to draw, not asserting an invariant.
  const t = transcript();
  assert.equal(verifyShare('not-a-key', t, 'nonsense'), false);
  assert.equal(verifyShare(alice.publicKey, t, 'nonsense'), false);
  assert.equal(verifyShare('', t, ''), false);
});

test('the fingerprint is grouped, because a human reads it aloud', () => {
  const print = keyFingerprint(alice.publicKey);

  assert.match(print, /^[0-9A-F]{4}( [0-9A-F]{4}){7}$/);
  assert.notEqual(print, keyFingerprint(mallory.publicKey));
  assert.equal(keyFingerprint(alice.publicKey), print, 'the same key always reads the same');
});
