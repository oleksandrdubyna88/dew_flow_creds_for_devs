import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';
import {
  BackupError,
  decryptJson,
  decryptJsonWithMasterKey,
  encryptJson,
  encryptJsonWrapped,
  openBlob,
  readBackupAccount,
  sealBlob,
  verifyEnvelopeMac,
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

/**
 * The master key is carried as a zeroizable Buffer rather than an immutable
 * string — but WHICH bytes is the whole question, and getting it wrong is
 * silent: every existing vault simply stops opening.
 *
 * What the string path actually feeds scrypt is the UTF-8 of the base64 TEXT
 * (44 bytes of ASCII), not the 32 raw key bytes. So the compatible Buffer is
 * `Buffer.from(text, 'utf8')`. `Buffer.from(text, 'base64')` looks more
 * correct, decodes to the real key, and derives a DIFFERENT AES key — which is
 * exactly the mistake this test exists to catch.
 */
test('a vault sealed with the base64 STRING opens with its UTF-8 bytes, and not with the decoded key', () => {
  const master = randomBytes(32).toString('base64');
  const sealed = sealBlob({ secret: 'the vault' }, master);

  assert.deepEqual(openBlob(sealed, Buffer.from(master, 'utf8')), { secret: 'the vault' });
  assert.throws(
    () => openBlob(sealed, Buffer.from(master, 'base64')),
    /wrong master PIN|Decryption failed/,
    'decoding the base64 changes the KDF input and would strand every existing vault',
  );
});

test('the two Buffer encodings are not interchangeable — 44 bytes of text, not 32 of key', () => {
  const master = randomBytes(32).toString('base64');

  assert.equal(Buffer.from(master, 'utf8').length, 44);
  assert.equal(Buffer.from(master, 'base64').length, 32);
});

/**
 * The cache now holds the master key as a RAW Buffer so it can be wiped on lock.
 * Every vault already on a colleague's machine was written while it was a base64
 * string, so the two forms have to be interchangeable in both directions — this is
 * the test that says an upgrade does not strand anyone.
 */
test('a vault written with the raw-Buffer key opens with the legacy base64 string, and the reverse', () => {
  const master = randomBytes(32);
  const b64 = master.toString('base64');
  const payload = { entities: ['prod-db'], secret: 'hunter2' };

  const writtenWithBuffer = encryptJsonWrapped(payload, master, []);
  const writtenWithString = encryptJsonWrapped(payload, b64, []);

  assert.deepEqual(decryptJsonWithMasterKey(writtenWithBuffer, b64), payload);
  assert.deepEqual(decryptJsonWithMasterKey(writtenWithString, master), payload);
});

test('the envelope MAC verifies across both key forms — HKDF sees the same raw bytes', () => {
  // The MAC derives from the RAW key while the payload KDF sees the base64 text;
  // two different byte sequences from one key, which is why the conversion is
  // named in cryptoUtils rather than inlined at call sites.
  const master = randomBytes(32);
  const content = encryptJsonWrapped({ a: 1 }, master, []);

  assert.equal(verifyEnvelopeMac(content, master), 'ok');
  assert.equal(verifyEnvelopeMac(content, master.toString('base64')), 'ok');
});
