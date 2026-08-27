import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import { test } from 'node:test';
import { backupWriteMode } from '../backupPlan';
import {
  decryptJson,
  decryptJsonWithMasterKey,
  encryptJson,
  encryptJsonWrapped,
  readVaultWraps,
  readVaultVersion,
  BackupError,
  CURRENT_WRAPPED_VERSION,
} from '../cryptoUtils';
import {
  newMasterKey,
  newPrfSalt,
  unwrapWithPin,
  wrapPinVault,
  wrapWithPin,
  wrapWithPrf,
  wrapWithRecoveryCode,
} from '../keyWrap';
import { generateRecoveryCode } from '../recoveryCode';

const account = { accountId: 'a1', email: 'me@x.dev', provider: 'microsoft' as const };

// A backup opened by the vault's own key slots carries a SECURITY-KEY wrap — that is what
// makes it vault-keyed (its master is the sync vault's master).
function wrappedVault(): string {
  const master = newMasterKey();
  const wraps = [
    wrapWithPin(master, account.accountId, '123456', 1_700_000_000_000),
    wrapWithPrf(master, 'cred-1', newPrfSalt(), crypto.randomBytes(32), 'YubiKey', 1_700_000_000_000),
  ];
  return encryptJsonWrapped({ nodes: [] }, master.toString('base64'), wraps, account, undefined);
}

test('the v1 write path really does destroy the key wraps', () => {
  // The reason the rule below exists, demonstrated rather than asserted from memory:
  // "Backup to NAS" wrote with the PIN-only path over the same file sync uses, so a
  // vault with a YubiKey registered came back as one without.
  const before = wrappedVault();
  assert.equal(readVaultWraps(before).length > 0, true);

  const after = encryptJson({ nodes: [] }, account.accountId + '123456', account, undefined);
  assert.equal(readVaultWraps(after).length, 0);
});

test('a backup with a security-key wrap is written through the vault key', () => {
  assert.deepEqual(backupWriteMode(wrappedVault()), { kind: 'wrapped' });
});

test('a v3 backup with ONLY a pin-wrap is opened by its own PIN, not the vault key', () => {
  // The self-contained backup: a PIN-only user's backup is v3 now, but keyed by its
  // standalone backup PIN. It must NOT route through vaultKeys.unlock, whose per-account
  // cache would shadow the sync vault's master with this backup's freshly-minted one.
  const v3PinOnly = wrapPinVault({ nodes: [] }, account.accountId, 'backup-pin', 1_700_000_000_000);
  assert.equal(readVaultVersion(v3PinOnly.content), CURRENT_WRAPPED_VERSION);
  assert.deepEqual(backupWriteMode(v3PinOnly.content), { kind: 'pin' });
});

test('a vault whose only non-PIN slot is a RECOVERY CODE is still vault-keyed', () => {
  // The routing was "has a webauthn wrap", written when webauthn was the only other kind.
  // A vault with PIN + recovery code has no webauthn wrap, so it read as a self-contained
  // PIN backup — and that write path replaces the wraps wholesale, silently destroying the
  // printed code's slot. Exactly the class of defect backupWriteMode's doc comment exists
  // to prevent, one kind later.
  const master = newMasterKey();
  const wraps = [
    wrapWithPin(master, account.accountId, '123456', 1_700_000_000_000),
    wrapWithRecoveryCode(master, generateRecoveryCode().secret, 1_700_000_000_000),
  ];
  const file = encryptJsonWrapped({ nodes: [] }, master.toString('base64'), wraps, account, undefined);

  assert.deepEqual(backupWriteMode(file), { kind: 'wrapped' });
});

test('no vault yet means a PIN is the only key there is', () => {
  assert.deepEqual(backupWriteMode(undefined), { kind: 'pin' });
  assert.deepEqual(backupWriteMode(''), { kind: 'pin' });
});

test('an old PIN-only vault stays on the PIN path', () => {
  const v1 = encryptJson({ nodes: [] }, account.accountId + '123456', account, undefined);

  assert.deepEqual(backupWriteMode(v1), { kind: 'pin' });
});

test('unreadable content is treated as a vault to protect, not as a blank slate', () => {
  // Guessing "no wraps" from a parse failure is how the wraps get overwritten. When it
  // cannot be read, the safe answer is the one that refuses to downgrade it.
  assert.deepEqual(backupWriteMode('{ not json'), { kind: 'wrapped' });
  assert.deepEqual(backupWriteMode('garbage'), { kind: 'wrapped' });
});

test('a PIN passphrase can NEVER open a v2 file — restore must go through the wraps', () => {
  // The reported failure: sign in to Google, enter the PIN, restore still dies. The
  // import decrypted every file with scrypt(accountId + PIN) — the v1 recipe. A vault
  // with a security key is v2: its payload is sealed with the master key, and the PIN
  // opens only the WRAP holding that key. Whatever PIN is typed, the v1 recipe fails.
  const master = newMasterKey();
  const wrap = wrapWithPin(master, account.accountId, '123456', 1);
  const file = encryptJsonWrapped({ nodes: [] }, master.toString('base64'), [wrap], account, undefined);

  // 3, not 2: a wrapped vault is written at v3 since the payload key moved to HKDF
  // and the MAC grew to cover the sealed blob. v2 files still READ — that is the
  // whole point of a lazy upgrade — which the v2-fixture tests below assert.
  assert.equal(readVaultVersion(file), CURRENT_WRAPPED_VERSION);
  assert.throws(() => decryptJson(file, account.accountId + '123456'));
  assert.deepEqual(decryptJsonWithMasterKey(file, master.toString('base64')), { nodes: [] });
});

test('a v1 file still opens with the PIN recipe', () => {
  const file = encryptJson({ nodes: [] }, account.accountId + '123456', account, undefined);

  assert.equal(readVaultVersion(file), 1);
  assert.deepEqual(decryptJson(file, account.accountId + '123456'), { nodes: [] });
});

test('a v3 file with a security-key slot routes through the slots — version numbers are not the rule', () => {
  // The live bug: restore checked `version === 2`, the format moved to 3
  // (VERSION_WRAPPED_FAST), and a vault with a registered YubiKey fell into the
  // "old PIN-only" branch — asking for a PIN that cannot open it. The rule is the
  // presence of a SECURITY-KEY slot, which is exactly what backupWriteMode answers.
  const master = newMasterKey();
  const wraps = [
    wrapWithPin(master, account.accountId, '123456', 1),
    wrapWithPrf(master, 'cred-1', newPrfSalt(), crypto.randomBytes(32), 'YubiKey', 1),
  ];
  const file = encryptJsonWrapped({ nodes: [] }, master.toString('base64'), wraps, account, undefined);

  assert.equal(readVaultVersion(file) >= 3, true, 'the current writer emits v3+');
  assert.deepEqual(backupWriteMode(file), { kind: 'wrapped' });
});

test('a v3 self-contained backup round-trips through its own backup PIN', () => {
  // The restore-path crypto for a PIN-only backup: seal with the backup PIN, then reopen
  // with it via the wrap. The guarantee is that a migrated backup is not locked out.
  const bundle = { nodes: [{ id: 'n', name: 'thing', type: 'entity' }], secret: 'x' };
  const backupPin = 'my-backup-pin';

  const written = wrapPinVault(bundle, account.accountId, backupPin, 1_700_000_000_000, account);
  assert.equal(readVaultVersion(written.content), CURRENT_WRAPPED_VERSION);

  const pinWrap = readVaultWraps(written.content).find((w) => (w as { kind?: string }).kind === 'pin');
  const master = unwrapWithPin(pinWrap as never, account.accountId, backupPin);
  assert.deepEqual(decryptJsonWithMasterKey(written.content, master), bundle);

  // A wrong backup PIN cannot open it.
  assert.throws(() => unwrapWithPin(pinWrap as never, account.accountId, 'wrong'), BackupError);
});
