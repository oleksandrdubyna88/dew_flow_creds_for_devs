import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import { test } from 'node:test';
import {
  EscrowShareMeta,
  isEscrowShareWrap,
  openShareWithPin,
  openShareWithPrf,
  sealShareWithPin,
  sealShareWithPrf,
  shareMatchesCurrentKey,
} from '../orgEscrowShareWrap';
import { generateOrgRecoveryKeypair, openWithPrivateKey, sealToPublicKey, ESCROW_WRAP_INFO } from '../orgEscrowCrypto';
import { combineShares, mintShareSet, verifyRecombined } from '../shamir';
import { newPrfSalt } from '../keyWrap';
import { BackupError } from '../cryptoUtils';

/**
 * An officer's share, sealed under the officer's own factors and carried in the officer's own
 * vault — so accepting once on one machine is enough to contribute from any of them.
 */

const ACCOUNT = 'acc-officer';
const PIN = 'officer-vault-pin-1';
const NOW = 1_756_000_000_000;

function meta(overrides: Partial<EscrowShareMeta> = {}): EscrowShareMeta {
  return {
    setupId: '3f1c0f0e-0000-4000-8000-000000000001',
    shareIndex: 2,
    threshold: 2,
    totalShares: 3,
    integrityTag: 'tag',
    orgPublicKeyFingerprint: 'AAAA BBBB',
    ...overrides,
  };
}

test('a share sealed under the PIN comes back with its index intact', async () => {
  const bytes = crypto.randomBytes(32);

  const wrap = await sealShareWithPin(bytes, meta(), ACCOUNT, PIN, NOW);

  assert.ok(isEscrowShareWrap(wrap));
  assert.equal(wrap.sealed.kind, 'pin');
  const opened = await openShareWithPin(wrap, ACCOUNT, PIN);
  assert.equal(opened.index, 2, 'the x coordinate is not secret and must survive');
  assert.deepEqual(opened.bytes, bytes);
});

test('a wrong PIN does not open it', async () => {
  const wrap = await sealShareWithPin(crypto.randomBytes(32), meta(), ACCOUNT, PIN, NOW);
  await assert.rejects(() => openShareWithPin(wrap, ACCOUNT, 'not-the-pin'), BackupError);
});

test('a share sealed under a security key round-trips too', () => {
  const bytes = crypto.randomBytes(32);
  const secret = crypto.randomBytes(32);

  const wrap = sealShareWithPrf(bytes, meta(), 'cred-a', newPrfSalt(), secret, 'YubiKey', NOW);

  assert.equal(wrap.sealed.kind, 'webauthn');
  assert.deepEqual(openShareWithPrf(wrap, secret).bytes, bytes);
  assert.throws(() => openShareWithPrf(wrap, crypto.randomBytes(32)), BackupError);
});

test('a share from a superseded ceremony is recognisable as worthless', () => {
  // It still opens perfectly — it just reconstructs a key nothing is sealed to any more. Kept
  // silently it would only waste a quorum's time during a real emergency.
  const wrap = sealShareWithPrf(
    crypto.randomBytes(32), meta(), 'c', newPrfSalt(), crypto.randomBytes(32), undefined, NOW);

  assert.equal(shareMatchesCurrentKey(wrap, 'AAAA BBBB'), true);
  assert.equal(shareMatchesCurrentKey(wrap, 'CCCC DDDD'), false);
});

test('the guard rejects a wrap missing its sealed half', () => {
  assert.equal(isEscrowShareWrap({ ...meta(), createdAt: NOW }), false, 'no sealed blob');
  assert.equal(isEscrowShareWrap(null), false);
  assert.equal(isEscrowShareWrap({}), false);
});

test('the whole officer path: accept two shares, recover the key, open a vault escrow wrap', async () => {
  // What the feature is for, exercised end to end through the real modules: the org key is
  // split, two officers seal their shares under DIFFERENT factors, and later those two shares
  // — opened the way each officer would open theirs — rebuild the key that opens an escrow
  // wrap sealed while nobody held the private half at all.
  const org = generateOrgRecoveryKeypair();
  const set = mintShareSet(org.privateKey, 3, 2);
  const vaultMaster = crypto.randomBytes(32);
  const escrow = sealToPublicKey(vaultMaster, org.publicKey, ESCROW_WRAP_INFO);

  const shared = {
    setupId: meta().setupId,
    threshold: 2,
    totalShares: 3,
    integrityTag: set.integrityTag,
    orgPublicKeyFingerprint: 'AAAA BBBB',
  };
  const ctoSecret = crypto.randomBytes(32);
  const ctoWrap = sealShareWithPrf(
    set.shares[0].bytes, { ...shared, shareIndex: set.shares[0].index },
    'cto-key', newPrfSalt(), ctoSecret, 'CTO YubiKey', NOW);
  const leadWrap = await sealShareWithPin(
    set.shares[1].bytes, { ...shared, shareIndex: set.shares[1].index }, ACCOUNT, PIN, NOW);

  const recovered = combineShares([
    openShareWithPrf(ctoWrap, ctoSecret),
    await openShareWithPin(leadWrap, ACCOUNT, PIN),
  ]);

  assert.equal(
    verifyRecombined(recovered, 3, 2, set.integrityTag),
    true,
    'the quorum proves it rebuilt the real key BEFORE anything is decrypted',
  );
  assert.deepEqual(openWithPrivateKey(escrow, recovered, ESCROW_WRAP_INFO), vaultMaster);
});
