import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';
import {
  CURRENT_WRAPPED_VERSION,
  encryptJson,
  encryptJsonWrapped,
  requireIntactEnvelope,
  resignEnvelopeWraps,
  sealBlob,
  verifyEnvelopeMac,
} from '../cryptoUtils';
import { isKeyWrap, openEscrowedVault, wrapWithOrgEscrow } from '../keyWrap';
import { generateOrgRecoveryKeypair } from '../orgEscrowCrypto';

/**
 * A signed envelope without its signature is tampered, not legacy (audit 2026-09-09, finding #2).
 *
 * <p>The envelope MAC exists for exactly one threat, and `cryptoUtils.ts` names it where the MAC is
 * computed: on a shared-folder transport a write-capable attacker could forge the owner account or
 * <b>delete unlock wraps</b> to lock the owner out. `headerAad` deliberately does not bind `wraps` —
 * adding a security key rewrites them without re-sealing the payload — so the MAC is the only thing
 * that authenticates the list of ways into a vault.</p>
 *
 * <p>And it was removable. `verifyEnvelopeMac` answered `'missing'` for an absent `mac` at every
 * version, `macStatusBlocksSync` blocks only `'bad'`, so deleting the signature along with a wrap
 * passed every check. The attack is not a read: it is a <b>downgrade</b> — strip the security-key
 * wrap and the recovery wrap, leave the PIN, and every device now opens by PIN alone and re-signs
 * that state as legitimate.</p>
 *
 * <p>"Legacy" is therefore an allow-list of the two versions that were ever written unsigned, not a
 * range: a `>=` test would let `version: "3"` read as legacy, and a v3 file is sealed without AAD, so
 * a mutated version still decrypts.</p>
 */

const master = randomBytes(32);
const PIN = 'a-pin-nobody-guesses';

/** A real v4 envelope with two wraps, as a vault with a PIN and a recovery code carries. */
function v4(wraps: unknown[] = [{ kind: 'pin', id: 'pin' }, { kind: 'recovery', id: 'recovery' }]): string {
  return encryptJsonWrapped({ secret: 'the vault' }, master, wraps);
}

/** The same envelope with named fields rewritten — what a hand edit at the sync location produces. */
function edited(content: string, changes: Record<string, unknown>): string {
  const env = JSON.parse(content) as Record<string, unknown>;
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) {
      delete env[key];
    } else {
      env[key] = value;
    }
  }
  return JSON.stringify(env);
}

/** A v2 envelope as an older build wrote it: wraps, no AAD, and no `mac` at all. */
function unsignedV2(wraps: unknown[] = []): string {
  const blob = sealBlob({ secret: 'from the old build' }, master.toString('base64'));
  return JSON.stringify({ format: 'cred-ssh-manager-backup', version: 2, kdf: 'scrypt', wraps, ...blob });
}

// ---- verifyEnvelopeMac: which versions may be unsigned -------------------------------------

test('a v4 envelope with its MAC stripped is BAD, not missing', () => {
  // The whole finding in one assertion: this answered 'missing', and 'missing' does not block a
  // sync cycle, so removing the signature removed the check.
  assert.equal(verifyEnvelopeMac(v4(), master), 'ok', 'the untouched file verifies');
  assert.equal(verifyEnvelopeMac(edited(v4(), { mac: undefined }), master), 'bad');
});

test('a v3 envelope with its MAC stripped is BAD — v3 was never written unsigned either', () => {
  // Its own test rather than implied by v4: an implementation that checked only the current
  // constant would pass the v4 case and still accept an unsigned v3 file.
  const three = edited(v4(), { version: 3, mac: undefined });
  assert.equal(verifyEnvelopeMac(three, master), 'bad');
});

test('an unsigned v2 vault still reads as MISSING, and so does v1 — they were written that way', () => {
  assert.equal(verifyEnvelopeMac(unsignedV2(), master), 'missing');
  assert.equal(verifyEnvelopeMac(encryptJson({ a: 1 }, PIN), master), 'missing', 'v1 has no MAC at all');
});

test('a version that is not exactly 1 or 2 never reads as legacy — it is an allow-list, not a range', () => {
  // `typeof v === 'number' && v >= 3` would let every one of these through as "legacy", and a v3
  // payload is sealed without AAD, so a mutated version still decrypts.
  for (const version of ['2', '1', null, undefined, 2.5, 5, 99, true]) {
    assert.equal(
      verifyEnvelopeMac(edited(v4(), { version, mac: undefined }), master),
      'bad',
      `version ${JSON.stringify(version)} must not excuse a missing MAC`,
    );
  }
});

test('a non-string mac is treated as absent, and answers by version', () => {
  for (const mac of [null, 42, {}, []]) {
    assert.equal(verifyEnvelopeMac(edited(v4(), { mac }), master), 'bad', `v4 with mac ${JSON.stringify(mac)}`);
    assert.equal(
      verifyEnvelopeMac(edited(unsignedV2(), { mac }), master),
      'missing',
      `v2 with mac ${JSON.stringify(mac)}`,
    );
  }
});

test('a v2-shaped signature does not verify a v4 file — a downgraded signature is not a signature', () => {
  // The v2 MAC covered {format, version, account, wraps} and nothing else; v3 grew it to cover the
  // sealed blob, which is what closed the rollback. `resignEnvelopeWraps` signs whatever version the
  // file declares, so signing a v2 copy of this envelope produces a genuine v2-shaped MAC over the
  // same wraps. Moved onto the v4 file it must NOT verify, or the rollback reopens through the
  // signature instead of through the payload.
  const file = v4();
  const wraps = (JSON.parse(file) as { wraps: unknown[] }).wraps;
  const v2Signed = resignEnvelopeWraps(edited(file, { version: 2 }), wraps, master);
  const v2Mac = (JSON.parse(v2Signed) as { mac: string }).mac;

  assert.equal(verifyEnvelopeMac(v2Signed, master), 'ok', 'the v2 copy verifies under the v2 rules');
  assert.equal(verifyEnvelopeMac(edited(file, { mac: v2Mac }), master), 'bad');
});

// ---- requireIntactEnvelope: one gate, before anything is adopted ---------------------------

test('requireIntactEnvelope passes an intact envelope and an unsigned legacy one', () => {
  requireIntactEnvelope(v4(), master);
  requireIntactEnvelope(unsignedV2(), master);
  requireIntactEnvelope(encryptJson({ a: 1 }, PIN), master);
});

test('requireIntactEnvelope throws TAMPERED when a v4 loses its MAC, and says so as its own kind', () => {
  // Not 'corrupted' and not 'wrong-password': a person told their PIN is wrong types it twenty
  // times, and a person told the file is damaged restores a backup. The truth is that somebody
  // with write access to the sync location edited it.
  assert.throws(
    () => requireIntactEnvelope(edited(v4(), { mac: undefined }), master),
    (e: unknown) => (e as { kind?: string }).kind === 'tampered',
  );
});

test('requireIntactEnvelope throws TAMPERED when a wrap is removed and the MAC is left behind', () => {
  const oneWrapLeft = edited(v4(), { wraps: [{ kind: 'pin', id: 'pin' }] });
  assert.throws(
    () => requireIntactEnvelope(oneWrapLeft, master),
    (e: unknown) => (e as { kind?: string }).kind === 'tampered',
  );
});

test('the stripped-MAC downgrade that started this: a wrap removed AND the signature deleted', () => {
  // The audit's exact reproduction. Before the fix: macStatus=missing, blocksSync=false,
  // payloadOpens=true, wrapsRemaining=1 — the file was accepted and would have been re-signed.
  const downgraded = edited(v4(), { wraps: [{ kind: 'pin', id: 'pin' }], mac: undefined });
  assert.equal(verifyEnvelopeMac(downgraded, master), 'bad', 'no longer an excusable "missing"');
  assert.throws(
    () => requireIntactEnvelope(downgraded, master),
    (e: unknown) => (e as { kind?: string }).kind === 'tampered',
  );
});

test('the current wrapped version is one that must carry a MAC', () => {
  // A guard for the day CURRENT_WRAPPED_VERSION moves: the new version must not silently land in
  // the unsigned allow-list.
  assert.equal(
    verifyEnvelopeMac(edited(v4(), { version: CURRENT_WRAPPED_VERSION, mac: undefined }), master),
    'bad',
  );
});

// ---- the paths that used to adopt a tampered list before checking it -----------------------

test('the recovery quorum refuses a tampered vault instead of re-signing its wrap list', () => {
  // The sharpest of the three, and the one the plan's first draft had no test for: the officers'
  // re-key carries `previousWraps` forward and signs them itself, so a stripped wrap accepted here
  // is laundered into a legitimate file BY the recovery. Extracted out of `recoveryCommands.ts`
  // (which imports `vscode`) precisely so this can be asserted.

  const pair = generateOrgRecoveryKeypair();
  const pin = { kind: 'pin', id: 'pin', createdAt: 1, salt: 'x', iv: 'x', tag: 'x', data: 'x' };
  const escrow = wrapWithOrgEscrow(master, pair.publicKey, 'fingerprint', Date.now());
  const file = encryptJsonWrapped({ secret: 'the vault' }, master, [pin, escrow]);
  const wrapsOf = (content: string) =>
    (JSON.parse(content) as { wraps: unknown[] }).wraps.filter(isKeyWrap);

  // Intact: the quorum opens it.
  assert.equal(openEscrowedVault(file, pair.privateKey, wrapsOf(file)).ok, true);

  // A wrap removed and the signature deleted with it — the audit's downgrade, arriving by the
  // recovery door.
  const downgraded = edited(file, { wraps: [escrow], mac: undefined });
  assert.throws(
    () => openEscrowedVault(downgraded, pair.privateKey, wrapsOf(downgraded)),
    (e: unknown) => (e as { kind?: string }).kind === 'tampered',
    'the officers must not re-key a list somebody else shortened',
  );
});
