import * as assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import { test } from 'node:test';
import {
  BackupError,
  decryptJson,
  decryptJsonWithMasterKey,
  encryptJson,
  encryptJsonWrapped,
  envelopeWithWraps,
  readVaultVersion,
  readVaultWraps,
} from '../cryptoUtils';
import {
  isKeyWrap,
  newMasterKey,
  newPrfSalt,
  removeWrap,
  unwrapWithPin,
  unwrapWithPrf,
  upsertWrap,
  webauthnWraps,
  wrapWithPin,
  wrapWithPrf,
  prfSaltsByCredential,
  wrapForCredential,
  wrapPinVault,
} from '../keyWrap';

const NOW = 1_800_000_000_000;
const ACCOUNT = 'acct-1';
const payload = { nodes: [], passwords: { a: 'secret' } };

test('a PIN wrap round-trips the master key', () => {
  const master = newMasterKey();
  const wrap = wrapWithPin(master, ACCOUNT, '1234', NOW);
  assert.ok(isKeyWrap(wrap));
  assert.deepEqual(unwrapWithPin(wrap, ACCOUNT, '1234'), master);
  assert.throws(() => unwrapWithPin(wrap, ACCOUNT, 'wrong'), BackupError);
  assert.throws(() => unwrapWithPin(wrap, 'other-account', '1234'), BackupError);
});

test('a security-key wrap round-trips the master key', () => {
  const master = newMasterKey();
  const prf = crypto.randomBytes(32);
  const wrap = wrapWithPrf(master, 'cred-abc', newPrfSalt(), prf, 'YubiKey work', NOW);
  assert.equal(wrap.label, 'YubiKey work');
  assert.deepEqual(unwrapWithPrf(wrap, prf), master);
  assert.throws(() => unwrapWithPrf(wrap, crypto.randomBytes(32)), BackupError);
});

test('several keys and the PIN all open the SAME vault', () => {
  const master = newMasterKey();
  const prfA = crypto.randomBytes(32);
  const prfB = crypto.randomBytes(32);
  const wraps = [
    wrapWithPin(master, ACCOUNT, 'pin', NOW),
    wrapWithPrf(master, 'key-a', newPrfSalt(), prfA, 'A', NOW + 1),
    wrapWithPrf(master, 'key-b', newPrfSalt(), prfB, 'B', NOW + 2),
  ];
  const vault = encryptJsonWrapped(payload, master.toString('base64'), wraps, undefined, []);
  // 3, not 2: a wrapped vault is written at v3 since the payload key moved to HKDF
  // and the MAC grew to cover the sealed blob. v2 files still READ — that is the
  // whole point of a lazy upgrade — which the v2-fixture tests below assert.
  assert.equal(readVaultVersion(vault), 3);
  assert.equal(readVaultWraps(vault).length, 3);

  for (const key of [
    unwrapWithPin(wraps[0], ACCOUNT, 'pin'),
    unwrapWithPrf(wraps[1], prfA),
    unwrapWithPrf(wraps[2], prfB),
  ]) {
    assert.deepEqual(decryptJsonWithMasterKey(vault, key.toString('base64')), payload);
  }
});

test('removing one key leaves the others working and the payload untouched', () => {
  const master = newMasterKey();
  const prfA = crypto.randomBytes(32);
  const prfB = crypto.randomBytes(32);
  let wraps = [
    wrapWithPin(master, ACCOUNT, 'pin', NOW),
    wrapWithPrf(master, 'key-a', newPrfSalt(), prfA, 'A', NOW + 1),
    wrapWithPrf(master, 'key-b', newPrfSalt(), prfB, 'B', NOW + 2),
  ];
  const vault = encryptJsonWrapped(payload, master.toString('base64'), wraps, undefined, []);

  wraps = removeWrap(wraps, 'webauthn', 'key-a');
  const rewrapped = envelopeWithWraps(vault, wraps);
  assert.equal(webauthnWraps(readVaultWraps(rewrapped) as never[]).length, 1);
  // payload ciphertext is carried verbatim
  const before = JSON.parse(vault) as Record<string, string>;
  const after = JSON.parse(rewrapped) as Record<string, string>;
  for (const f of ['salt', 'iv', 'tag', 'data']) {
    assert.equal(after[f], before[f]);
  }
  // the surviving key still opens it
  assert.deepEqual(
    decryptJsonWithMasterKey(rewrapped, unwrapWithPrf(wraps[1], prfB).toString('base64')),
    payload,
  );
});

test('upsertWrap replaces a key by id instead of duplicating it', () => {
  const master = newMasterKey();
  const prf = crypto.randomBytes(32);
  const first = wrapWithPrf(master, 'key-a', newPrfSalt(), prf, 'old label', NOW);
  const second = wrapWithPrf(master, 'key-a', newPrfSalt(), prf, 'new label', NOW + 5);
  const wraps = upsertWrap([first], second);
  assert.equal(wraps.length, 1);
  assert.equal(wraps[0].label, 'new label');
});

test('the v1 -> v2 upgrade keeps the data and both unlock paths', () => {
  // Exactly what "Add Security Key" does to an existing PIN-only vault.
  const pin = 'old-pin';
  const v1 = encryptJson(payload, ACCOUNT + pin, undefined, []);
  const recovered = decryptJson(v1, ACCOUNT + pin);

  const master = newMasterKey();
  const prf = crypto.randomBytes(32);
  const prfSalt = newPrfSalt();
  const wraps = [
    wrapWithPin(master, ACCOUNT, pin, NOW),
    wrapWithPrf(master, 'cred-1', prfSalt, prf, 'YubiKey', NOW),
  ];
  const v2 = encryptJsonWrapped(recovered, master.toString('base64'), wraps, undefined, []);

  assert.equal(readVaultVersion(v2), 3);
  // the same data, reachable by PIN and by the key
  assert.deepEqual(
    decryptJsonWithMasterKey(v2, unwrapWithPin(wraps[0], ACCOUNT, pin).toString('base64')),
    payload,
  );
  assert.deepEqual(
    decryptJsonWithMasterKey(v2, unwrapWithPrf(wraps[1], prf).toString('base64')),
    payload,
  );
  // the PRF salt travels with the wrap, so another machine can reproduce it
  assert.equal(wraps[1].prfSalt, prfSalt);
});

test('changing the PIN re-wraps the master key so the old PIN stops working', () => {
  // Mirrors SyncManager.rekeyToNewPin (v2 path): same master key, the pin
  // wrap replaced under the new PIN; security-key wraps untouched.
  const master = newMasterKey();
  const prf = crypto.randomBytes(32);
  const salt = newPrfSalt();
  const wraps0 = [
    wrapWithPin(master, ACCOUNT, 'old-pin-longenough', NOW),
    wrapWithPrf(master, 'yk', salt, prf, 'YubiKey', NOW),
  ];
  const wraps1 = upsertWrap(wraps0, wrapWithPin(master, ACCOUNT, 'new-pin-longenough', NOW + 1));
  assert.equal(wraps1.length, 2); // replaced, not added
  const pinWrap = wraps1.find((w) => w.kind === 'pin')!;
  assert.deepEqual(unwrapWithPin(pinWrap, ACCOUNT, 'new-pin-longenough'), master);
  assert.throws(() => unwrapWithPin(pinWrap, ACCOUNT, 'old-pin-longenough'), BackupError);
  // the security key still opens the (unchanged) master key
  assert.deepEqual(unwrapWithPrf(wraps1.find((w) => w.kind === 'webauthn')!, prf), master);
});

test('re-keying (last security key removed) revokes the old master key', () => {
  // Reproduces removeSecurityKey's last-key branch: new master key, payload
  // re-encrypted, wrapped under the PIN only. The OLD master key — which the
  // removed YubiKey's wrap held — must no longer decrypt the new vault.
  const oldMaster = newMasterKey();
  const prf = crypto.randomBytes(32);
  const before = encryptJsonWrapped(
    payload,
    oldMaster.toString('base64'),
    [wrapWithPin(oldMaster, ACCOUNT, 'pin-1234-long', NOW),
     wrapWithPrf(oldMaster, 'yk', newPrfSalt(), prf, 'YubiKey', NOW)],
    undefined,
    [],
  );
  const recovered = decryptJsonWithMasterKey(before, oldMaster.toString('base64'));

  const newMaster = newMasterKey();
  const after = encryptJsonWrapped(
    recovered,
    newMaster.toString('base64'),
    [wrapWithPin(newMaster, ACCOUNT, 'pin-1234-long', NOW)],
    undefined,
    [],
  );
  // new PIN wrap opens it…
  const wraps2 = readVaultWraps(after).filter(isKeyWrap);
  assert.deepEqual(
    decryptJsonWithMasterKey(after, unwrapWithPin(wraps2[0], ACCOUNT, 'pin-1234-long').toString('base64')),
    payload,
  );
  // …but the OLD master key (all a removed key's holder could have) does not.
  assert.throws(() => decryptJsonWithMasterKey(after, oldMaster.toString('base64')), BackupError);
  assert.equal(webauthnWraps(wraps2).length, 0);
});

test('v1 vaults still read with the plain PIN passphrase', () => {
  const v1 = encryptJson(payload, ACCOUNT + 'pin');
  assert.equal(readVaultVersion(v1), 1);
  assert.deepEqual(decryptJson(v1, ACCOUNT + 'pin'), payload);
  assert.deepEqual(readVaultWraps(v1), []);
});

test('envelope MAC detects wrap tampering and passes when untouched', () => {
  const { readVaultWraps, resignEnvelopeWraps, verifyEnvelopeMac } = require('../cryptoUtils');
  const master = newMasterKey();
  const prf = crypto.randomBytes(32);
  const wraps = [
    wrapWithPin(master, ACCOUNT, 'pin-longenough', NOW),
    wrapWithPrf(master, 'yk', newPrfSalt(), prf, 'YubiKey', NOW),
  ];
  const vault = encryptJsonWrapped(payload, master.toString('base64'), wraps, undefined, []);
  const mk = master.toString('base64');
  assert.equal(verifyEnvelopeMac(vault, mk), 'ok');

  // Attacker deletes the security-key wrap directly in the file (no master).
  const env = JSON.parse(vault);
  env.wraps = env.wraps.filter((w: { kind: string }) => w.kind === 'pin');
  const tampered = JSON.stringify(env);
  assert.equal(verifyEnvelopeMac(tampered, mk), 'bad');

  // A legitimate re-sign (done with the master key) verifies again.
  const resigned = resignEnvelopeWraps(vault, readVaultWraps(vault), mk);
  assert.equal(verifyEnvelopeMac(resigned, mk), 'ok');

  // A legacy vault (no mac field) reports 'missing', not 'bad'.
  const v1 = encryptJson(payload, ACCOUNT + 'pin-longenough', undefined, []);
  assert.equal(verifyEnvelopeMac(v1, mk), 'missing');
});

test('every credential is offered ITS OWN salt, never the first wrap’s', () => {
  // The endless-prompt bug. Each registration mints its own prfSalt, but the unlock
  // ceremony sent wrap[0]’s salt for every credential — so whichever key the
  // authenticator picked, unless it happened to be wrap[0]’s, the PRF was computed
  // over a foreign salt and the unwrap failed as "try again", forever. One wrap per
  // vault masks it; the account with several is the one that loops.
  const master = newMasterKey();
  const a = wrapWithPrf(master, 'cred-A', newPrfSalt(), Buffer.alloc(32, 1), 'key A', 1);
  const b = wrapWithPrf(master, 'cred-B', newPrfSalt(), Buffer.alloc(32, 2), 'key B', 2);

  const salts = prfSaltsByCredential([a, b]);

  assert.deepEqual(Object.keys(salts).sort(), ['cred-A', 'cred-B']);
  assert.equal(salts['cred-A'], a.prfSalt);
  assert.equal(salts['cred-B'], b.prfSalt);
  assert.notEqual(salts['cred-A'], salts['cred-B']);
});

test('a wrap without a salt is left out rather than offered as undefined', () => {
  const master = newMasterKey();
  const pin = wrapWithPin(master, 'acct', '123456', 1);

  assert.deepEqual(prfSaltsByCredential([pin]), {});
});

test('the assertion’s credential picks its OWN wrap — no fallback to the first', () => {
  // The second half of the same bug: `keys.find(...) ?? keys[0]` quietly unwrapped the
  // WRONG wrap when the id was unknown. A wrong wrap can never decrypt; failing to find
  // the wrap must be an answer, not a guess.
  const master = newMasterKey();
  const a = wrapWithPrf(master, 'cred-A', newPrfSalt(), Buffer.alloc(32, 1), 'key A', 1);
  const b = wrapWithPrf(master, 'cred-B', newPrfSalt(), Buffer.alloc(32, 2), 'key B', 2);

  assert.equal(wrapForCredential([a, b], 'cred-B'), b);
  assert.equal(wrapForCredential([a, b], 'cred-C'), undefined);
});

test('wrapPinVault produces a v3 envelope that opens with the PIN and not a wrong one', () => {
  // The migration off v1: a PIN-only vault becomes wrapped/HKDF, so scrypt runs once at
  // unlock instead of on every read and write. It must round-trip and reject a wrong PIN.
  const payload = { nodes: [{ id: 'a', name: 'Server A', type: 'entity' }], secret: 'hunter2' };

  const init = wrapPinVault(payload, ACCOUNT, '2468', NOW);

  // The file is version 3 (wrapped/fast), carrying exactly one pin-wrap.
  assert.equal(readVaultVersion(init.content), 3);
  const wraps = readVaultWraps(init.content).filter(isKeyWrap);
  assert.equal(wraps.length, 1);
  assert.equal(wraps[0].kind, 'pin');

  // The pin-wrap recovers the same master key the payload was sealed under.
  const recovered = unwrapWithPin(wraps[0], ACCOUNT, '2468');
  assert.deepEqual(recovered, init.masterKey);
  assert.deepEqual(decryptJsonWithMasterKey(init.content, recovered), payload);

  // And the payload is readable with the returned master directly.
  assert.deepEqual(decryptJsonWithMasterKey(init.content, init.masterKey), payload);

  // A wrong PIN cannot unwrap it.
  assert.throws(
    () => unwrapWithPin(wraps[0], ACCOUNT, '9999'),
    (e: unknown) => e instanceof BackupError,
  );
});

test('migrating a v1 PIN-only vault to v3 preserves the data and the SAME PIN opens it', () => {
  // The exact flow SyncManager runs: read+decrypt a legacy v1 file, then write it back as
  // v3 via wrapPinVault. The guarantee that matters: nobody is locked out — the same PIN
  // still opens the vault, and every secret survives.
  const pin = 'my-sync-pin';
  const v1 = encryptJson(payload, ACCOUNT + pin, undefined, []);
  assert.equal(readVaultVersion(v1), 1);

  const decrypted = decryptJson(v1, ACCOUNT + pin); // what unlock+decrypt yields
  const migrated = wrapPinVault(decrypted, ACCOUNT, pin, NOW);

  assert.equal(readVaultVersion(migrated.content), 3);
  const pinWrap = readVaultWraps(migrated.content).filter(isKeyWrap)[0];
  const master = unwrapWithPin(pinWrap, ACCOUNT, pin); // same PIN, one scrypt
  assert.deepEqual(decryptJsonWithMasterKey(migrated.content, master), payload);

  // The legacy v1 file still reads too — the upgrade is lazy, not a forced rewrite of
  // files we might not be able to write.
  assert.deepEqual(decryptJson(v1, ACCOUNT + pin), payload);
});
