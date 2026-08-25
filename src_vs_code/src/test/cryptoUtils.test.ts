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
  macStatusBlocksSync,
  webauthnUserHandle,
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

/**
 * v3 moved the payload key to HKDF and grew the MAC to cover the sealed blob.
 * Both changes are only safe if a v2 file written by a colleague's older build
 * still opens, so that guarantee is asserted against a hand-built v2 envelope
 * rather than assumed.
 */
function v2Envelope(payload: unknown, masterB64: string, wraps: unknown[]): string {
  const blob = sealBlob(payload, masterB64); // v2 keyed the payload with scrypt
  return JSON.stringify({
    format: 'cred-ssh-manager-backup',
    version: 2,
    kdf: 'scrypt',
    wraps,
    ...blob,
  });
}

test('a v2 vault written by an older build still opens, and a new write upgrades it to v3', () => {
  const master = randomBytes(32);
  const b64 = master.toString('base64');
  const payload = { secret: 'from the old build' };

  const old = v2Envelope(payload, b64, []);
  assert.equal(JSON.parse(old).version, 2);
  assert.deepEqual(decryptJsonWithMasterKey(old, master), payload, 'v2 must keep reading forever');

  const rewritten = encryptJsonWrapped(payload, master, []);
  assert.equal(JSON.parse(rewritten).version, 3);
  assert.equal(JSON.parse(rewritten).kdf, 'hkdf');
  assert.deepEqual(decryptJsonWithMasterKey(rewritten, master), payload);
});

test('splicing an older sealed blob into a v3 envelope is caught — the rollback v2 could not see', () => {
  // The attack: write access to the shared folder, no key needed. Take an earlier
  // legitimate blob for this same vault and put it back, leaving account/wraps/mac
  // untouched. Under v2 the MAC signed only the header, so it still said 'ok' and
  // the owner's secrets silently reverted.
  const master = randomBytes(32);
  const now = encryptJsonWrapped({ password: 'rotated-today' }, master, []);
  const earlier = encryptJsonWrapped({ password: 'the-old-one' }, master, []);

  const spliced = JSON.parse(now);
  const stale = JSON.parse(earlier);
  for (const field of ['salt', 'iv', 'tag', 'data']) {
    spliced[field] = stale[field];
  }

  assert.equal(verifyEnvelopeMac(now, master), 'ok', 'the untouched file verifies');
  assert.equal(
    verifyEnvelopeMac(JSON.stringify(spliced), master),
    'bad',
    'a swapped payload must not pass the MAC',
  );
});

test('the v3 MAC length-prefixes its fields, so a boundary cannot be shifted', () => {
  // Plain concatenation would hash salt="AB",iv="C" the same as salt="A",iv="BC".
  const master = randomBytes(32);
  const content = encryptJsonWrapped({ a: 1 }, master, []);
  const env = JSON.parse(content);

  const shifted = { ...env, salt: env.salt + env.iv.slice(0, 1), iv: env.iv.slice(1) };

  assert.equal(verifyEnvelopeMac(JSON.stringify(shifted), master), 'bad');
});

test('a bad MAC blocks the sync cycle, but ok and legacy-missing proceed', () => {
  // Fail closed on tamper only: a mismatched signature stops the cycle so it is not
  // decrypted, merged and re-signed into a fresh valid file. A missing MAC is a legacy
  // unsigned envelope, not tampering, and must keep syncing.
  assert.equal(macStatusBlocksSync('bad'), true);
  assert.equal(macStatusBlocksSync('ok'), false);
  assert.equal(macStatusBlocksSync('missing'), false);
});

test('webauthnUserHandle is stable per email, case- and space-insensitive, and unique', () => {
  // Registering the same account twice must REPLACE its resident credential, not claim a
  // second slot — which only works if the user handle is identical for the same email.
  const a = webauthnUserHandle('Bob@X.com');
  const b = webauthnUserHandle('  bob@x.com  ');
  assert.equal(a.length, 32);
  assert.deepEqual(a, b, 'same email (any case/whitespace) yields the same handle');
  assert.notDeepEqual(a, webauthnUserHandle('alice@x.com'), 'different emails differ');
});
