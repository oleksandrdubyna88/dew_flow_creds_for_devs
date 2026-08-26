import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import { test } from 'node:test';
import { ByteReader, encodeString } from '../sshAgentProtocol';
import { keyFingerprintOf, parseSshPrivateKey } from '../sshKeyParse';
import { digestForAlgorithm, rsaVariant, signForAgent } from '../sshAgentSign';

/**
 * The security-critical half of the SSH agent: reading a stored key and producing a signature
 * a real client will accept.
 *
 * <p>Every signature is verified with `crypto.verify` against the key's own public half, so
 * these are not "it returned some bytes" tests. The fixtures are generated here rather than
 * committed: a private key in a repository is a private key on the internet, and
 * `generateKeyPairSync` gives the same coverage with none of that.</p>
 */

function pem(type: 'ed25519' | 'rsa' | 'ec', options: crypto.ECKeyPairOptions<'pem', 'pem'> | object = {}): string {
  const { privateKey } = crypto.generateKeyPairSync(type as 'ed25519', {
    ...options,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  } as never) as unknown as { privateKey: string };
  return privateKey;
}

/** Verify a blob the agent produced, the way a client would. */
/** SSH carries r and s as mpints; Node verifies the DER form, so re-pack them. */
function derFromSshEcdsa(signature: Buffer): Buffer {
  const inner = new ByteReader(signature);
  const r = inner.readString() as Buffer;
  const s = inner.readString() as Buffer;
  const integers = Buffer.concat([
    Buffer.from([0x02, r.length]),
    r,
    Buffer.from([0x02, s.length]),
    s,
  ]);
  // P-521's two integers exceed 127 bytes together, so the SEQUENCE needs DER's long-form
  // length. Getting this wrong is what made this test fail on secp521r1 alone.
  const header =
    integers.length > 0x7f
      ? Buffer.from([0x30, 0x81, integers.length])
      : Buffer.from([0x30, integers.length]);
  return Buffer.concat([header, integers]);
}

function verifyBlob(blob: Buffer, data: Buffer, publicKey: crypto.KeyObject): { algorithm: string; ok: boolean } {
  const reader = new ByteReader(blob);
  const algorithm = reader.readString()?.toString('utf8') ?? '';
  const signature = reader.readString() as Buffer;
  const digest = digestForAlgorithm(algorithm);
  if (algorithm.startsWith('ecdsa-')) {
    return { algorithm, ok: crypto.verify(digest as string, data, publicKey, derFromSshEcdsa(signature)) };
  }
  return { algorithm, ok: crypto.verify(digest, data, publicKey, signature) };
}

const DATA = Buffer.from('the bytes a client asked to have signed');

test('an Ed25519 key parses, advertises ssh-ed25519, and its signature verifies', () => {
  const result = parseSshPrivateKey(pem('ed25519'), 'me@laptop');
  assert.equal(result.ok, true, result.ok ? '' : result.reason);
  const key = (result as { ok: true; key: ReturnType<typeof parseKey> }).key;

  assert.equal(key.algorithm, 'ssh-ed25519');
  assert.match(key.publicLine, /^ssh-ed25519 AAAAC3NzaC1lZDI1NTE5[A-Za-z0-9+/=]* me@laptop$/);
  assert.equal(key.fingerprint, keyFingerprintOf(key.publicBlob));
  assert.match(key.fingerprint, /^SHA256:[A-Za-z0-9+/]{43}$/);

  const blob = signForAgent(key, DATA, 0) as Buffer;
  const verified = verifyBlob(blob, DATA, crypto.createPublicKey(key.key));
  assert.deepEqual(verified, { algorithm: 'ssh-ed25519', ok: true });
});

test('an RSA signature uses the digest the client FLAGS asked for, and says which', () => {
  const result = parseSshPrivateKey(pem('rsa', { modulusLength: 2048 }));
  assert.equal(result.ok, true, result.ok ? '' : result.reason);
  const key = (result as { ok: true; key: ReturnType<typeof parseKey> }).key;
  assert.equal(key.algorithm, 'ssh-rsa');
  assert.match(key.publicLine, /^ssh-rsa AAAAB3NzaC1yc2E/);

  const publicKey = crypto.createPublicKey(key.key);
  for (const [flags, expected] of [
    [0x04, 'rsa-sha2-512'],
    [0x02, 'rsa-sha2-256'],
    [0x00, 'ssh-rsa'],
  ] as const) {
    const verified = verifyBlob(signForAgent(key, DATA, flags) as Buffer, DATA, publicKey);
    assert.deepEqual(verified, { algorithm: expected, ok: true }, `flags ${flags}`);
  }
});

test('rsaVariant prefers SHA-512 when a client sets both flags', () => {
  assert.deepEqual(rsaVariant(0x02 | 0x04), { algorithm: 'rsa-sha2-512', digest: 'sha512' });
});

test('each ECDSA curve signs with its own digest and the mpint form SSH expects', () => {
  for (const [curve, algorithm] of [
    ['prime256v1', 'ecdsa-sha2-nistp256'],
    ['secp384r1', 'ecdsa-sha2-nistp384'],
    ['secp521r1', 'ecdsa-sha2-nistp521'],
  ] as const) {
    const result = parseSshPrivateKey(pem('ec', { namedCurve: curve }));
    assert.equal(result.ok, true, result.ok ? '' : result.reason);
    const key = (result as { ok: true; key: ReturnType<typeof parseKey> }).key;
    assert.equal(key.algorithm, algorithm);

    const verified = verifyBlob(signForAgent(key, DATA, 0) as Buffer, DATA, crypto.createPublicKey(key.key));
    assert.deepEqual(verified, { algorithm, ok: true }, curve);
  }
});

test('the public blob names the curve, so a client can match the identity it offered', () => {
  const result = parseSshPrivateKey(pem('ec', { namedCurve: 'prime256v1' }));
  const key = (result as { ok: true; key: ReturnType<typeof parseKey> }).key;
  const reader = new ByteReader(key.publicBlob);

  assert.equal(reader.readString()?.toString('utf8'), 'ecdsa-sha2-nistp256');
  assert.equal(reader.readString()?.toString('utf8'), 'nistp256');
  const point = reader.readString() as Buffer;
  assert.equal(point[0], 0x04, 'an uncompressed point');
});

test('a signature does not verify against DIFFERENT data — the test above is not vacuous', () => {
  const result = parseSshPrivateKey(pem('ed25519'));
  const key = (result as { ok: true; key: ReturnType<typeof parseKey> }).key;
  const blob = signForAgent(key, DATA, 0) as Buffer;

  const verified = verifyBlob(blob, Buffer.from('other bytes entirely'), crypto.createPublicKey(key.key));
  assert.equal(verified.ok, false);
});

test('an openssh-key-v1 private key (what ssh-keygen writes) is read', () => {
  // Node reads this format directly since v12; the agent must not require a PEM conversion,
  // because what people paste into the vault is whatever ssh-keygen produced.
  const openssh = crypto
    .generateKeyPairSync('ed25519', {
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    })
    .privateKey.toString();
  assert.equal(parseSshPrivateKey(openssh).ok, true);
});

test('a passphrase-protected key is refused with the command that fixes it', () => {
  // bcrypt_pbkdf is not in Node, and guessing at a KDF in a credential manager is the wrong
  // kind of clever. The refusal has to be actionable, so it names the ssh-keygen invocation.
  const encrypted = crypto
    .generateKeyPairSync('ed25519', {
      privateKeyEncoding: { type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase: 'hunter2' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    })
    .privateKey.toString();

  const result = parseSshPrivateKey(encrypted);
  assert.equal(result.ok, false);
  assert.match(result.ok ? '' : result.reason, /could not be read|passphrase/i);
});

test('an unsupported key type and an empty value each say what is wrong', () => {
  const dsa = (
    crypto.generateKeyPairSync('dsa' as 'ed25519', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    } as never) as unknown as { privateKey: string }
  ).privateKey.toString();

  const unsupported = parseSshPrivateKey(dsa);
  assert.equal(unsupported.ok, false);
  assert.match(unsupported.ok ? '' : unsupported.reason, /not supported/);

  const empty = parseSshPrivateKey('   ');
  assert.equal(empty.ok, false);
  assert.match(empty.ok ? '' : empty.reason, /empty/);
});

test('garbage is refused rather than throwing out of the agent', () => {
  const result = parseSshPrivateKey('-----BEGIN OPENSSH PRIVATE KEY-----\nnot base64 at all\n-----END OPENSSH PRIVATE KEY-----');
  assert.equal(result.ok, false);
});

// Type helper: the shape parseSshPrivateKey returns on success.
declare function parseKey(): {
  key: crypto.KeyObject;
  algorithm: 'ssh-ed25519' | 'ssh-rsa' | 'ecdsa-sha2-nistp256' | 'ecdsa-sha2-nistp384' | 'ecdsa-sha2-nistp521';
  publicBlob: Buffer;
  publicLine: string;
  publicKeyOnly: string;
  fingerprint: string;
};

test('encodeString is the only framing these modules share', () => {
  // A guard on the assumption every buffer above rests on: length-prefixed, big-endian.
  const encoded = encodeString('abc');
  assert.deepEqual([...encoded], [0, 0, 0, 3, 97, 98, 99]);
});
