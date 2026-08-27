import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import { test } from 'node:test';
import {
  ESCROW_WRAP_INFO,
  RECOVERY_SESSION_INFO,
  generateOrgRecoveryKeypair,
  isSealedToPublicKey,
  openWithPrivateKey,
  publicKeyForPrivate,
  sealToPublicKey,
} from '../orgEscrowCrypto';
import { keyFingerprint } from '../shareSignature';
import { combineShares, mintShareSet, verifyRecombined } from '../shamir';

/**
 * The asymmetric half of corporate escrow: seal to a public key whose private half exists
 * only as Shamir shares in other people's vaults.
 */

const MASTER = crypto.randomBytes(32);

test('an org keypair is two raw 32-byte halves, and the public one is derivable from the private', () => {
  // Raw and structureless is the requirement, not a convenience: a private key with ASN.1
  // around it cannot be split into Shamir shares and put back together byte for byte.
  const org = generateOrgRecoveryKeypair();
  assert.equal(org.publicKey.length, 32);
  assert.equal(org.privateKey.length, 32);
  assert.deepEqual(publicKeyForPrivate(org.privateKey), org.publicKey);
});

test('seal → open round-trips the master key', () => {
  const org = generateOrgRecoveryKeypair();
  const sealed = sealToPublicKey(MASTER, org.publicKey, ESCROW_WRAP_INFO);
  assert.ok(isSealedToPublicKey(sealed));
  assert.deepEqual(openWithPrivateKey(sealed, org.privateKey, ESCROW_WRAP_INFO), MASTER);
});

test('a foreign private key cannot open it', () => {
  const org = generateOrgRecoveryKeypair();
  const other = generateOrgRecoveryKeypair();
  const sealed = sealToPublicKey(MASTER, org.publicKey, ESCROW_WRAP_INFO);
  assert.throws(() => openWithPrivateKey(sealed, other.privateKey, ESCROW_WRAP_INFO));
});

test('the two contexts are separated by their info string, not by hope', () => {
  // The same ECIES seals an escrow wrap and re-seals a share to a live recovery session. A
  // key derived for one context must be useless in the other, or a blob captured from one
  // could be replayed into the other.
  const org = generateOrgRecoveryKeypair();
  const sealed = sealToPublicKey(MASTER, org.publicKey, ESCROW_WRAP_INFO);
  assert.throws(
    () => openWithPrivateKey(sealed, org.privateKey, RECOVERY_SESSION_INFO),
    'the wrong context must fail the GCM tag, not decrypt',
  );
  assert.notEqual(ESCROW_WRAP_INFO, RECOVERY_SESSION_INFO);
});

test('every seal mints a fresh ephemeral key', () => {
  // Two seals sharing an ephemeral key share a derived key, which is the one mistake in this
  // construction that leaves no visible trace.
  const org = generateOrgRecoveryKeypair();
  const seen = new Set<string>();
  for (let i = 0; i < 25; i++) {
    seen.add(sealToPublicKey(MASTER, org.publicKey, ESCROW_WRAP_INFO).ephemeralPublicKey);
  }
  assert.equal(seen.size, 25);
});

test('a tampered blob fails the tag rather than yielding a wrong key', () => {
  const org = generateOrgRecoveryKeypair();
  const sealed = sealToPublicKey(MASTER, org.publicKey, ESCROW_WRAP_INFO);
  const flipped = Buffer.from(sealed.data, 'base64');
  flipped[0] ^= 0x01;
  assert.throws(() =>
    openWithPrivateKey(
      { ...sealed, data: flipped.toString('base64') },
      org.privateKey,
      ESCROW_WRAP_INFO,
    ),
  );
});

test('a key of the wrong length is refused with a message that names the length', () => {
  const org = generateOrgRecoveryKeypair();
  assert.throws(
    () => sealToPublicKey(MASTER, Buffer.alloc(31), ESCROW_WRAP_INFO),
    /must be exactly 32 bytes, not 31/,
  );
  const sealed = sealToPublicKey(MASTER, org.publicKey, ESCROW_WRAP_INFO);
  assert.throws(
    () => openWithPrivateKey(sealed, Buffer.alloc(16), ESCROW_WRAP_INFO),
    /must be exactly 32 bytes, not 16/,
  );
});

test('the org public key gets a readable fingerprint from the EXISTING helper', () => {
  // Reuse rather than a second fingerprint format: `keyFingerprint` already turns a base64
  // key into the grouped hex two people read to each other over a phone, and a product with
  // two fingerprint spellings is a product where nobody can compare anything.
  const org = generateOrgRecoveryKeypair();
  const printed = keyFingerprint(org.publicKey.toString('base64'));
  assert.match(printed, /^[0-9A-F]{4}( [0-9A-F]{4}){7}$/);
  assert.equal(printed, keyFingerprint(publicKeyForPrivate(org.privateKey).toString('base64')));
});

// ---------------------------------------------------------------- the two halves together

test('the whole escrow shape: split the org key, seal a vault to it, recover with a quorum', () => {
  // The end-to-end claim of PLAN_org_recovery.md, in miniature: a vault seals its master key
  // to the org public key while nobody holds the private half assembled; later, two of three
  // officers' shares reconstruct that half and open the wrap.
  const org = generateOrgRecoveryKeypair();
  const escrowWrap = sealToPublicKey(MASTER, org.publicKey, ESCROW_WRAP_INFO);

  const set = mintShareSet(org.privateKey, 3, 2);
  // The assembled private key is destroyed here — from now on only shares exist.
  const officerB = set.shares[1];
  const officerC = set.shares[2];

  const recovered = combineShares([officerB, officerC]);
  assert.equal(
    verifyRecombined(recovered, 3, 2, set.integrityTag),
    true,
    'the quorum must prove it rebuilt the real key before anything is decrypted',
  );
  assert.deepEqual(publicKeyForPrivate(recovered), org.publicKey, 'and it matches the published half');
  assert.deepEqual(openWithPrivateKey(escrowWrap, recovered, ESCROW_WRAP_INFO), MASTER);

  // One officer alone reconstructs a well-formed key that opens nothing — the failure mode
  // the integrity tag exists to name before it reaches a decrypt.
  const alone = combineShares([officerB, { index: 200, bytes: crypto.randomBytes(32) }]);
  assert.equal(verifyRecombined(alone, 3, 2, set.integrityTag), false);
  assert.throws(() => openWithPrivateKey(escrowWrap, alone, ESCROW_WRAP_INFO));
});
