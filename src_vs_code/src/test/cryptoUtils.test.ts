import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BackupError,
  decryptJson,
  encryptJson,
  readBackupAccount,
} from '../cryptoUtils';
import { StoredAccount } from '../types';

const payload = {
  nodes: [{ id: 'a', name: 'Server A', type: 'entity' }],
  passwords: { a: 'p@ss w0rd — юникод ✓' },
};

const account: StoredAccount = {
  accountId: 'acc-123',
  email: 'user1@outlook.com',
  provider: 'microsoft',
};

test('round-trips a JSON payload with the right passphrase', () => {
  const file = encryptJson(payload, 'master-secret');
  assert.deepEqual(decryptJson(file, 'master-secret'), payload);
});

test('embeds and reads back plaintext account metadata', () => {
  const file = encryptJson(payload, account.accountId + '1234', account);
  assert.deepEqual(readBackupAccount(file), account);
  // Profile-bound key: accountId + PIN decrypts, PIN alone does not.
  assert.deepEqual(decryptJson(file, account.accountId + '1234'), payload);
  assert.throws(() => decryptJson(file, '1234'));
});

test('readBackupAccount returns undefined for account-less backups', () => {
  assert.equal(readBackupAccount(encryptJson(payload, 'x')), undefined);
});

test('produces a fresh salt and IV on every export', () => {
  const a = JSON.parse(encryptJson(payload, 'x')) as Record<string, string>;
  const b = JSON.parse(encryptJson(payload, 'x')) as Record<string, string>;
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.data, b.data);
});

test('rejects a wrong passphrase as wrong-password', () => {
  const file = encryptJson(payload, 'correct');
  assert.throws(
    () => decryptJson(file, 'incorrect'),
    (e: unknown) => e instanceof BackupError && e.kind === 'wrong-password',
  );
});

test('rejects tampered ciphertext as wrong-password (GCM auth)', () => {
  const envelope = JSON.parse(encryptJson(payload, 'pw')) as Record<string, string>;
  const bytes = Buffer.from(envelope.data, 'base64');
  bytes[0] = bytes[0] ^ 0xff;
  const tampered = JSON.stringify({ ...envelope, data: bytes.toString('base64') });
  assert.throws(
    () => decryptJson(tampered, 'pw'),
    (e: unknown) => e instanceof BackupError && e.kind === 'wrong-password',
  );
});

test('rejects a malformed (wrong-length) auth tag as corrupted, not a raw error', () => {
  const envelope = JSON.parse(encryptJson(payload, 'pw')) as Record<string, string>;
  const truncated = JSON.stringify({
    ...envelope,
    tag: Buffer.from('short').toString('base64'),
  });
  assert.throws(
    () => decryptJson(truncated, 'pw'),
    (e: unknown) => e instanceof BackupError && e.kind === 'corrupted',
  );
});

test('rejects non-JSON files as corrupted', () => {
  assert.throws(
    () => decryptJson('definitely not json', 'pw'),
    (e: unknown) => e instanceof BackupError && e.kind === 'corrupted',
  );
});

test('rejects a foreign JSON file as corrupted', () => {
  assert.throws(
    () => decryptJson(JSON.stringify({ hello: 'world' }), 'pw'),
    (e: unknown) => e instanceof BackupError && e.kind === 'corrupted',
  );
});

test('rejects an envelope with a missing field as corrupted', () => {
  const envelope = JSON.parse(encryptJson(payload, 'pw')) as Record<string, string>;
  delete (envelope as Record<string, unknown>).tag;
  assert.throws(
    () => decryptJson(JSON.stringify(envelope), 'pw'),
    (e: unknown) => e instanceof BackupError && e.kind === 'corrupted',
  );
});

test('rejects malformed account metadata as corrupted', () => {
  const envelope = JSON.parse(encryptJson(payload, 'pw')) as Record<string, unknown>;
  envelope.account = { accountId: 42 };
  assert.throws(
    () => readBackupAccount(JSON.stringify(envelope)),
    (e: unknown) => e instanceof BackupError && e.kind === 'corrupted',
  );
});

test('rejects an unsupported version explicitly', () => {
  const envelope = JSON.parse(encryptJson(payload, 'pw')) as Record<string, unknown>;
  envelope.version = 99;
  assert.throws(
    () => decryptJson(JSON.stringify(envelope), 'pw'),
    (e: unknown) => e instanceof BackupError && e.kind === 'unsupported-version',
  );
});
