import assert from 'node:assert/strict';
import { test } from 'node:test';
import { backupWriteMode } from '../backupPlan';
import {
  decryptJson,
  decryptJsonWithMasterKey,
  encryptJson,
  encryptJsonWrapped,
  readVaultWraps,
  readVaultVersion,
} from '../cryptoUtils';
import { newMasterKey, wrapWithPin } from '../keyWrap';

const account = { accountId: 'a1', email: 'me@x.dev', provider: 'microsoft' as const };

function wrappedVault(): string {
  const master = newMasterKey();
  const wrap = wrapWithPin(master, account.accountId, '123456', 1_700_000_000_000);
  return encryptJsonWrapped({ nodes: [] }, master.toString('base64'), [wrap], account, undefined);
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

test('an existing wrapped vault must be written through the vault key', () => {
  assert.deepEqual(backupWriteMode(wrappedVault()), { kind: 'wrapped' });
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

  assert.equal(readVaultVersion(file), 2);
  assert.throws(() => decryptJson(file, account.accountId + '123456'));
  assert.deepEqual(decryptJsonWithMasterKey(file, master.toString('base64')), { nodes: [] });
});

test('a v1 file still opens with the PIN recipe', () => {
  const file = encryptJson({ nodes: [] }, account.accountId + '123456', account, undefined);

  assert.equal(readVaultVersion(file), 1);
  assert.deepEqual(decryptJson(file, account.accountId + '123456'), { nodes: [] });
});
