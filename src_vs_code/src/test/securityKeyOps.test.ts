import * as assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import { test } from 'node:test';
import {
  envelopeWithAddedKey,
  envelopeWithRecoveryCode,
  envelopeWithRemovedKey,
  envelopeWithoutRecoveryCode,
  hasRecoveryCode,
  removalWouldRekey,
  vaultKeyWraps,
  isSecurityKeyRefusal,
} from '../securityKeyOps';
import {
  newMasterKey,
  recoveryWrap,
  unwrapWithPinAsync,
  unwrapWithRecoveryCode,
  webauthnWraps,
  wrapWithPinAsync,
} from '../keyWrap';
import { generateRecoveryCode } from '../recoveryCode';
import { decryptJsonWithMasterKey, encryptJsonWrapped } from '../cryptoUtils';
import type { VaultKey } from '../vaultKeys';
import { StoredAccount } from '../types';

/**
 * The four regimes of Add/Remove Security Key (audit 2026-08-25, A1), against the REAL
 * envelope crypto. What each must guarantee:
 *
 *  - add-to-wrapped: one more slot around the SAME master — the PIN still opens it;
 *  - add-to-legacy: refuses without a PIN (a key-only vault bricks when the key is lost);
 *  - remove-last-key: a FRESH master — the removed key's wrap opens nothing written after;
 *  - remove-one-of-many: same master (the absent keys could not re-wrap a new one), and the
 *    caller is told `rekeyed: false` so it can say backups stay openable.
 */

const ACCOUNT: StoredAccount = { accountId: 'acc-1', email: 'me@corp.com', provider: 'google' };
const PIN = 'a-vault-pin-123';
const NOW = 1_756_000_000_000;
const PAYLOAD = { nodes: [], marker: 'the-vault-payload' };

function prf(id: string): { credentialId: string; prfSalt: string; secret: Buffer } {
  return {
    credentialId: id,
    prfSalt: crypto.randomBytes(32).toString('base64'),
    secret: crypto.randomBytes(32),
  };
}

/** A real wrapped vault: payload sealed under `master`, one PIN wrap. */
async function wrappedVault(master: Buffer): Promise<string> {
  return encryptJsonWrapped(
    PAYLOAD,
    master.toString('base64'),
    [await wrapWithPinAsync(master, ACCOUNT.accountId, PIN, NOW)],
    ACCOUNT,
  );
}

function argsFor(raw: string, key: VaultKey, storedPin: string = PIN) {
  return {
    raw,
    key,
    account: ACCOUNT,
    storedPin,
    now: NOW,
    pendingShares: undefined,
    decrypt: (): Promise<unknown> => Promise.resolve(PAYLOAD),
  };
}

function wrappedKey(raw: string, master: Buffer): VaultKey {
  return { version: 2, masterKey: master, wraps: vaultKeyWraps(raw) };
}

test('adding a key to a wrapped vault adds a slot around the SAME master', async () => {
  const master = newMasterKey();
  const raw = await wrappedVault(master);

  const next = await envelopeWithAddedKey(argsFor(raw, wrappedKey(raw, master)), prf('cred-a'), '  YubiKey  ');

  assert.ok(!isSecurityKeyRefusal(next));
  assert.equal(next.rekeyed, false);
  const wraps = vaultKeyWraps(next.content);
  assert.equal(webauthnWraps(wraps).length, 1);
  assert.equal(webauthnWraps(wraps)[0].label, 'YubiKey', 'the label is trimmed');
  const pinWrap = wraps.find((w) => w.kind === 'pin');
  assert.ok(pinWrap);
  const unwrapped = await unwrapWithPinAsync(pinWrap, ACCOUNT.accountId, PIN);
  assert.deepEqual(unwrapped, master, 'the PIN still opens the very same master key');
  assert.deepEqual(decryptJsonWithMasterKey(next.content, master), PAYLOAD, 'payload untouched');
});

test('adding a key to a legacy (v1) unlock refuses without a stored PIN', async () => {
  const key: VaultKey = { version: 1, passphrase: 'acc-1oldpin', pin: 'oldpin' };

  // Spread-override rather than a third argument: passing `undefined` to a defaulted
  // parameter takes the default, and this test would silently test the wrong thing.
  const next = await envelopeWithAddedKey(
    { ...argsFor('irrelevant-v1-bytes', key), storedPin: undefined },
    prf('cred-a'),
    'K',
  );

  assert.equal(next, 'pin-required');
});

test('adding a key to a legacy unlock upgrades: fresh master, PIN wrap + key wrap, payload carried', async () => {
  const key: VaultKey = { version: 1, passphrase: 'acc-1oldpin', pin: 'oldpin' };

  const next = await envelopeWithAddedKey(argsFor('irrelevant-v1-bytes', key), prf('cred-a'), 'K');

  assert.ok(!isSecurityKeyRefusal(next));
  assert.equal(next.rekeyed, true);
  const wraps = vaultKeyWraps(next.content);
  assert.equal(wraps.length, 2);
  const pinWrap = wraps.find((w) => w.kind === 'pin');
  assert.ok(pinWrap);
  const master = await unwrapWithPinAsync(pinWrap, ACCOUNT.accountId, PIN);
  assert.deepEqual(decryptJsonWithMasterKey(next.content, master), PAYLOAD);
});

test('removing the LAST key with a PIN re-keys: the old master opens nothing written after', async () => {
  const master = newMasterKey();
  let raw = await wrappedVault(master);
  const added = await envelopeWithAddedKey(argsFor(raw, wrappedKey(raw, master)), prf('cred-a'), 'K');
  assert.ok(!isSecurityKeyRefusal(added));
  raw = added.content;
  const keyWrapId = webauthnWraps(vaultKeyWraps(raw))[0].id;

  const next = await envelopeWithRemovedKey(argsFor(raw, wrappedKey(raw, master)), keyWrapId);

  assert.ok(!isSecurityKeyRefusal(next));
  assert.equal(next.rekeyed, true);
  const wraps = vaultKeyWraps(next.content);
  assert.equal(webauthnWraps(wraps).length, 0, 'the key slot is gone');
  assert.equal(wraps.length, 1, 'only the PIN remains');
  assert.throws(
    () => decryptJsonWithMasterKey(next.content, master),
    'the OLD master must not open the re-keyed vault',
  );
  const fresh = await unwrapWithPinAsync(wraps[0], ACCOUNT.accountId, PIN);
  assert.deepEqual(decryptJsonWithMasterKey(next.content, fresh), PAYLOAD);
});

test('removing one of TWO keys drops the slot and keeps the master — and says rekeyed: false', async () => {
  const master = newMasterKey();
  let raw = await wrappedVault(master);
  for (const id of ['cred-a', 'cred-b']) {
    const added = await envelopeWithAddedKey(argsFor(raw, wrappedKey(raw, master)), prf(id), id);
    assert.ok(!isSecurityKeyRefusal(added));
    raw = added.content;
  }
  const [first, second] = webauthnWraps(vaultKeyWraps(raw));

  const next = await envelopeWithRemovedKey(argsFor(raw, wrappedKey(raw, master)), first.id);

  assert.ok(!isSecurityKeyRefusal(next));
  assert.equal(next.rekeyed, false, 'the caller must warn that old copies stay openable');
  const left = webauthnWraps(vaultKeyWraps(next.content));
  assert.deepEqual(left.map((w) => w.id), [second.id]);
  assert.deepEqual(decryptJsonWithMasterKey(next.content, master), PAYLOAD, 'same master');
});

test('the resign path refuses a legacy unlock instead of writing something it cannot sign', async () => {
  const master = newMasterKey();
  let raw = await wrappedVault(master);
  for (const id of ['cred-a', 'cred-b']) {
    const added = await envelopeWithAddedKey(argsFor(raw, wrappedKey(raw, master)), prf(id), id);
    assert.ok(!isSecurityKeyRefusal(added));
    raw = added.content;
  }
  const [first] = webauthnWraps(vaultKeyWraps(raw));
  const legacy: VaultKey = { version: 1, passphrase: 'x', pin: 'x' };

  const next = await envelopeWithRemovedKey(argsFor(raw, legacy), first.id);

  assert.equal(next, 'not-wrapped');
});

test('setting a recovery code adds a slot around the SAME master, beside the key', async () => {
  const master = newMasterKey();
  let raw = await wrappedVault(master);
  const added = await envelopeWithAddedKey(argsFor(raw, wrappedKey(raw, master)), prf('cred-a'), 'K');
  assert.ok(!isSecurityKeyRefusal(added));
  raw = added.content;
  const code = generateRecoveryCode();

  const next = await envelopeWithRecoveryCode(argsFor(raw, wrappedKey(raw, master)), code.secret);

  assert.ok(!isSecurityKeyRefusal(next));
  assert.equal(next.rekeyed, false, 'a printed code must not re-encrypt the payload');
  assert.equal(hasRecoveryCode(next.content), true);
  const wraps = vaultKeyWraps(next.content);
  assert.equal(webauthnWraps(wraps).length, 1, 'the security key is untouched');
  assert.deepEqual(unwrapWithRecoveryCode(recoveryWrap(wraps)!, code.secret), master);
  assert.deepEqual(decryptJsonWithMasterKey(next.content, master), PAYLOAD, 'payload untouched');
});

test('a recovery code on a legacy vault refuses without a PIN, and upgrades with one', async () => {
  const key: VaultKey = { version: 1, passphrase: 'acc-1oldpin', pin: 'oldpin' };
  const code = generateRecoveryCode();

  // Without a PIN the vault would end up openable by a piece of paper alone.
  const refused = await envelopeWithRecoveryCode(
    { ...argsFor('irrelevant-v1-bytes', key), storedPin: undefined },
    code.secret,
  );
  assert.equal(refused, 'pin-required');

  const next = await envelopeWithRecoveryCode(argsFor('irrelevant-v1-bytes', key), code.secret);
  assert.ok(!isSecurityKeyRefusal(next));
  assert.equal(next.rekeyed, true);
  const wraps = vaultKeyWraps(next.content);
  assert.equal(wraps.length, 2, 'the PIN wrap and the recovery wrap');
  const master = await unwrapWithPinAsync(wraps.find((w) => w.kind === 'pin')!, ACCOUNT.accountId, PIN);
  assert.deepEqual(unwrapWithRecoveryCode(recoveryWrap(wraps)!, code.secret), master);
  assert.deepEqual(decryptJsonWithMasterKey(next.content, master), PAYLOAD);
});

test('regenerating a recovery code retires the printed one — the OLD code opens nothing', async () => {
  // The whole reason the slot has a constant id: replace, never accumulate. A second
  // printed page must make the first one worthless the moment it is written.
  const master = newMasterKey();
  const raw = await wrappedVault(master);
  const first = generateRecoveryCode();
  const second = generateRecoveryCode();

  const once = await envelopeWithRecoveryCode(argsFor(raw, wrappedKey(raw, master)), first.secret);
  assert.ok(!isSecurityKeyRefusal(once));
  const twice = await envelopeWithRecoveryCode(
    argsFor(once.content, wrappedKey(once.content, master)),
    second.secret,
  );
  assert.ok(!isSecurityKeyRefusal(twice));

  const wraps = vaultKeyWraps(twice.content);
  assert.equal(wraps.filter((w) => w.kind === 'recovery').length, 1, 'one slot, not two');
  assert.deepEqual(unwrapWithRecoveryCode(recoveryWrap(wraps)!, second.secret), master);
  assert.throws(
    () => unwrapWithRecoveryCode(recoveryWrap(wraps)!, first.secret),
    'the previously printed code must be dead',
  );
});

test('removing the recovery code drops the slot, keeps the master, and refuses a legacy key', async () => {
  const master = newMasterKey();
  const raw = await wrappedVault(master);
  const code = generateRecoveryCode();
  const withCode = await envelopeWithRecoveryCode(argsFor(raw, wrappedKey(raw, master)), code.secret);
  assert.ok(!isSecurityKeyRefusal(withCode));

  const next = envelopeWithoutRecoveryCode(withCode.content, wrappedKey(withCode.content, master));
  assert.ok(!isSecurityKeyRefusal(next));
  assert.equal(hasRecoveryCode(next), false);
  assert.deepEqual(decryptJsonWithMasterKey(next, master), PAYLOAD, 'no re-key, same master');

  const legacy: VaultKey = { version: 1, passphrase: 'x', pin: 'x' };
  assert.equal(envelopeWithoutRecoveryCode(withCode.content, legacy), 'not-wrapped');
});

test('removalWouldRekey: last key + PIN → yes; other keys left or no PIN → no', async () => {
  const master = newMasterKey();
  let raw = await wrappedVault(master);
  const added = await envelopeWithAddedKey(argsFor(raw, wrappedKey(raw, master)), prf('cred-a'), 'K');
  assert.ok(!isSecurityKeyRefusal(added));
  raw = added.content;
  const wraps = vaultKeyWraps(raw);
  const keyId = webauthnWraps(wraps)[0].id;

  assert.equal(removalWouldRekey(wraps, keyId, PIN), true);
  assert.equal(removalWouldRekey(wraps, keyId, undefined), false);
  assert.equal(removalWouldRekey(wraps, 'some-other-id', PIN), false, 'a key remains');
});
