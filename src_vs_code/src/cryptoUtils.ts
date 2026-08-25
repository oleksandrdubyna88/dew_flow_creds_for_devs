import * as crypto from 'node:crypto';
import { StoredAccount, isStoredAccount } from './types';

/**
 * AES-256-GCM on top of a scrypt-derived key. Pure Node.js `crypto`.
 *
 * Two layers:
 *  - {@link sealBlob} / {@link openBlob}: one encrypted JSON blob
 *    (salt/iv/tag/data, all base64) — used by the vault payload AND by
 *    individual share items.
 *  - {@link encryptJson} / {@link decryptJson}: the vault file envelope —
 *    plaintext format/version/kdf/account (+ optional plaintext `shares`
 *    array of individually-encrypted share items) around one sealed blob.
 *
 * `account` and `shares` are intentionally unencrypted: restore needs the
 * account BEFORE decryption, and shares are addressed to the file's owner
 * but encrypted with a different (per-share) passphrase.
 */

const FORMAT = 'cred-ssh-manager-backup';
/** v1: payload sealed directly with scrypt(accountId+PIN).
 *  v2: payload sealed with a random master key, which is itself wrapped
 *      once per unlock method (PIN, each security key) — see keyWrap.ts. */
const VERSION_PIN_ONLY = 1;
const VERSION_WRAPPED = 2;
/**
 * v3: the payload key comes from HKDF instead of scrypt, and the MAC covers the
 * sealed blob as well as the header.
 *
 * <p>Both changes answer the same objection to v2. scrypt is deliberately slow
 * because it guards a PIN a human chose; running it over a 256-bit master key buys
 * nothing and cost a measured 240 ms of frozen extension host per payload read or
 * write — on every sync cycle. `keyWrap.ts` already made this argument for the
 * WebAuthn secret and used HKDF; the payload path simply never followed it.</p>
 *
 * <p>And the v2 MAC signed `{format, version, account, wraps}` — everything except
 * the secrets. Someone with write access to a shared folder could splice an older
 * legitimate blob back in, leave the header alone, and the check still reported
 * 'ok' while the vault silently reverted.</p>
 *
 * <p>Read support for v2 is permanent; v3 is written from the next full write on,
 * so nobody has to migrate anything by hand.</p>
 */
const VERSION_WRAPPED_FAST = 3;
const SUPPORTED_VERSIONS = [VERSION_PIN_ONLY, VERSION_WRAPPED, VERSION_WRAPPED_FAST];
const KEY_LENGTH = 32; // AES-256
const SALT_LENGTH = 16;
const IV_LENGTH = 12; // recommended for GCM
const TAG_LENGTH = 16;

// scrypt cost. New blobs record the params they used (kdfN/kdfR/kdfP) so the
// cost can be raised without breaking old data: a blob WITHOUT those fields
// predates the change and is read at the original N=2^15; new blobs are
// written at the OWASP-leaning N=2^17 and carry their params for the future.
const LEGACY_SCRYPT_N = 1 << 15;
const DEFAULT_SCRYPT_N = 1 << 17;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
// maxmem must cover 128*N*r bytes (~128 MiB at N=2^17) plus headroom.
const SCRYPT_MAXMEM = 300 * 1024 * 1024;

interface ScryptParams {
  N: number;
  r: number;
  p: number;
}

export type BackupErrorKind = 'corrupted' | 'wrong-password' | 'unsupported-version';

/** Typed failure so callers can show a precise, human message. */
export class BackupError extends Error {
  readonly kind: BackupErrorKind;

  constructor(kind: BackupErrorKind, message: string) {
    super(message);
    this.name = 'BackupError';
    this.kind = kind;
  }
}

/** One encrypted JSON value: scrypt(passphrase, salt) + AES-256-GCM. */
export interface SealedBlob {
  salt: string;
  iv: string;
  tag: string;
  data: string;
  /** scrypt cost used for THIS blob; absent = legacy N=2^15. */
  kdfN?: number;
  kdfR?: number;
  kdfP?: number;
}

interface BackupEnvelope extends SealedBlob {
  format: string;
  version: number;
  kdf: string;
  account?: StoredAccount;
  shares?: unknown[];
  /** v2 only: the master-key wraps (plaintext envelope metadata). */
  wraps?: unknown[];
}

/**
 * A passphrase, as either the string a human typed or the bytes of one.
 *
 * <p><b>Which bytes is load-bearing.</b> Passing a string here feeds scrypt its
 * UTF-8 — so for a master key carried as base64 TEXT, the compatible Buffer is
 * `Buffer.from(text, 'utf8')` (44 bytes of ASCII), NOT `Buffer.from(text,
 * 'base64')` (the 32 raw key bytes). The second looks more correct and derives a
 * different AES key, which strands every vault ever written. `cryptoUtils.test.ts`
 * asserts both directions.</p>
 */
export type Passphrase = string | Buffer;

function deriveKey(passphrase: Passphrase, salt: Buffer, params: ScryptParams): Buffer {
  return crypto.scryptSync(passphrase, salt, KEY_LENGTH, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: SCRYPT_MAXMEM,
  });
}

/**
 * The same derivation, off the extension-host thread.
 *
 * <p>`scryptSync` at N=2^17 holds the event loop for about a second on this hardware — no
 * typing, no IntelliSense, no other extension's callbacks — each time a vault is unlocked or
 * a PIN wrap is written. Node's async `scrypt` runs on the libuv pool and yields the same
 * bytes, so the unlock and PIN-set paths take this one and the format never notices.</p>
 */
function deriveKeyAsync(passphrase: Passphrase, salt: Buffer, params: ScryptParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      passphrase,
      salt,
      KEY_LENGTH,
      { N: params.N, r: params.r, p: params.p, maxmem: SCRYPT_MAXMEM },
      (error, key) => (error !== null ? reject(error) : resolve(key)),
    );
  });
}

/** The scrypt params a blob was sealed with (legacy defaults when absent). */
function paramsOf(blob: SealedBlob): ScryptParams {
  return {
    N: typeof blob.kdfN === 'number' ? blob.kdfN : LEGACY_SCRYPT_N,
    r: typeof blob.kdfR === 'number' ? blob.kdfR : SCRYPT_R,
    p: typeof blob.kdfP === 'number' ? blob.kdfP : SCRYPT_P,
  };
}

/**
 * A master key as the two things it has to be, so no caller has to remember which.
 *
 * <p>A `string` is the legacy carrier: the key's base64 TEXT. A `Buffer` is the
 * key itself, 32 raw bytes — which is what `masterKey` should mean to anyone
 * reading it, and why the cache holds that form.</p>
 *
 * <p>`masterKeyScryptInput` exists because scrypt has always been fed the UTF-8 of
 * the base64 text, never the raw key. Feeding it the raw key derives a different
 * AES key and strands every vault ever written; the conversion is therefore not a
 * detail to inline at a call site.</p>
 */
function masterKeyScryptInput(master: Passphrase): Passphrase {
  return typeof master === 'string' ? master : Buffer.from(master.toString('base64'), 'utf8');
}

/** The raw 32 bytes — what HKDF and the wrap layer want. */
function masterKeyRaw(master: Passphrase): Buffer {
  return typeof master === 'string' ? Buffer.from(master, 'base64') : master;
}

/** The AES-GCM half, given a key somebody else derived. */
function sealWithKey(payload: unknown, key: Buffer, salt: Buffer): SealedBlob {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  key.fill(0);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  plaintext.fill(0);
  return {
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: ciphertext.toString('base64'),
  };
}

/** The matching half. Throws the same BackupErrors `openBlob` does. */
function openWithKey(blob: SealedBlob, key: Buffer): unknown {
  const iv = Buffer.from(blob.iv, 'base64');
  const tag = Buffer.from(blob.tag, 'base64');
  const data = Buffer.from(blob.data, 'base64');
  let plaintext: Buffer;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    key.fill(0);
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
  } catch {
    key.fill(0);
    throw new BackupError(
      'wrong-password',
      'Decryption failed: wrong master PIN/password or the data was modified.',
    );
  }
  try {
    return JSON.parse(plaintext.toString('utf8'));
  } catch {
    throw new BackupError('corrupted', 'Decrypted payload is not valid JSON.');
  } finally {
    plaintext.fill(0);
  }
}

/**
 * The payload key for a v3 vault: HKDF over the RAW master key.
 *
 * <p>Not scrypt, because the input is already 32 random bytes — the same reasoning
 * `prfWrappingKey` in keyWrap.ts spells out for the WebAuthn secret. Measured on
 * the same machine: 240 ms against 0.18 ms.</p>
 */
function payloadKey(master: Passphrase, salt: Buffer): Buffer {
  return Buffer.from(
    crypto.hkdfSync('sha256', masterKeyRaw(master), salt, PAYLOAD_INFO, KEY_LENGTH),
  );
}

const PAYLOAD_INFO = Buffer.from('cred-ssh-manager/vault-payload');

const DEFAULT_PARAMS: ScryptParams = { N: DEFAULT_SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P };

/** A sealed blob that records the KDF cost it was made with, so a later raise never orphans it. */
function withKdf(blob: SealedBlob, params: ScryptParams): SealedBlob {
  return { ...blob, kdfN: params.N, kdfR: params.r, kdfP: params.p };
}

export function sealBlob(payload: unknown, passphrase: Passphrase): SealedBlob {
  const salt = crypto.randomBytes(SALT_LENGTH);
  return withKdf(sealWithKey(payload, deriveKey(passphrase, salt, DEFAULT_PARAMS), salt), DEFAULT_PARAMS);
}

/**
 * `sealBlob` with the KDF off the extension-host thread. Byte-for-byte the same format:
 * `openBlob` and `openBlobAsync` each read what either one wrote.
 */
export async function sealBlobAsync(payload: unknown, passphrase: Passphrase): Promise<SealedBlob> {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = await deriveKeyAsync(passphrase, salt, DEFAULT_PARAMS);
  return withKdf(sealWithKey(payload, key, salt), DEFAULT_PARAMS);
}

/** The shape checks both open paths share. Throws 'corrupted' on a malformed piece; returns the salt. */
// eslint-disable-next-line complexity
function checkedSalt(blob: SealedBlob): Buffer {
  for (const field of ['salt', 'iv', 'tag', 'data'] as const) {
    if (typeof blob[field] !== 'string' || blob[field].length === 0) {
      throw new BackupError('corrupted', `Encrypted data is missing the "${field}" field.`);
    }
  }
  const salt = Buffer.from(blob.salt, 'base64');
  const iv = Buffer.from(blob.iv, 'base64');
  const tag = Buffer.from(blob.tag, 'base64');
  if (salt.length !== SALT_LENGTH || iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) {
    throw new BackupError('corrupted', 'Encrypted data has a malformed salt, IV, or auth tag.');
  }
  return salt;
}

/**
 * Decrypt a sealed blob. Throws {@link BackupError}: 'wrong-password' when
 * GCM authentication fails, 'corrupted' for malformed pieces.
 */
export function openBlob(blob: SealedBlob, passphrase: Passphrase): unknown {
  const salt = checkedSalt(blob);
  return openWithKey(blob, deriveKey(passphrase, salt, paramsOf(blob)));
}

/**
 * `openBlob` with the KDF off the extension-host thread — the unlock path uses this, so
 * typing a PIN no longer freezes the editor for the length of one scrypt.
 */
export async function openBlobAsync(blob: SealedBlob, passphrase: Passphrase): Promise<unknown> {
  const salt = checkedSalt(blob);
  return openWithKey(blob, await deriveKeyAsync(passphrase, salt, paramsOf(blob)));
}

/**
 * Encrypt a vault payload into the .enc file content. `account` and
 * `shares` (individually-encrypted items addressed to this file's owner)
 * stay plaintext in the envelope.
 */
export function encryptJson(
  payload: unknown,
  passphrase: string,
  account?: StoredAccount,
  shares?: unknown[],
): string {
  const blob = sealBlob(payload, passphrase);
  const envelope: BackupEnvelope = {
    format: FORMAT,
    version: VERSION_PIN_ONLY,
    kdf: 'scrypt',
    ...(account !== undefined ? { account } : {}),
    ...(shares !== undefined && shares.length > 0 ? { shares } : {}),
    ...blob,
  };
  return JSON.stringify(envelope, null, 2);
}

/**
 * v2 vault: the payload is sealed with `masterKeyBase64`, and `wraps` hold
 * that master key encrypted once per unlock method. Adding or removing a
 * security key only rewrites `wraps` — never the payload.
 */
export function encryptJsonWrapped(
  payload: unknown,
  masterKeyBase64: Passphrase,
  wraps: readonly unknown[],
  account?: StoredAccount,
  shares?: unknown[],
): string {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const blob = sealWithKey(payload, payloadKey(masterKeyBase64, salt), salt);
  const envelope: BackupEnvelope & { mac?: string } = {
    format: FORMAT,
    version: VERSION_WRAPPED_FAST,
    kdf: 'hkdf',
    ...(account !== undefined ? { account } : {}),
    ...(shares !== undefined && shares.length > 0 ? { shares } : {}),
    wraps: [...wraps],
    ...blob,
  };
  envelope.mac = computeEnvelopeMac(envelope as unknown as Record<string, unknown>, masterKeyBase64);
  return JSON.stringify(envelope, null, 2);
}

/** Envelope format version (1 = PIN-only, 2 = wrapped master key). */
export function readVaultVersion(fileContent: string): number {
  return parseEnvelope(fileContent).version;
}

/** The plaintext wraps of a v2 vault (empty for v1). */
export function readVaultWraps(fileContent: string): unknown[] {
  const wraps = parseEnvelope(fileContent).wraps;
  return Array.isArray(wraps) ? wraps : [];
}

/** Rewrite ONLY the wraps of a v2 vault, carrying everything else verbatim. */
export function envelopeWithWraps(fileContent: string, wraps: readonly unknown[]): string {
  const env = JSON.parse(fileContent) as Record<string, unknown>;
  if (typeof env?.format !== 'string') {
    throw new BackupError('corrupted', 'Not a vault file.');
  }
  return JSON.stringify({ ...env, wraps: [...wraps] }, null, 2);
}

/** Decrypt a v2 payload once the master key has been unwrapped. */
export function decryptJsonWithMasterKey(fileContent: string, masterKeyBase64: Passphrase): unknown {
  const env = parseEnvelope(fileContent);
  // The envelope says how its payload key was made. Flipping that field derives a
  // different key and breaks the GCM tag, so it needs no separate protection — the
  // same self-authenticating property the scrypt parameters already rely on.
  return env.kdf === 'hkdf'
    ? openWithKey(env, payloadKey(masterKeyBase64, Buffer.from(env.salt, 'base64')))
    : openBlob(env, masterKeyScryptInput(masterKeyBase64));
}

// ---- envelope MAC ----------------------------------------------------------
// The AES-GCM tag authenticates only the sealed payload. The envelope's
// PLAINTEXT metadata (`account`, `wraps`) is not — so on a shared-folder
// transport a write-capable attacker could forge the owner account or delete
// unlock wraps to lock the owner out. A MAC keyed by HKDF(master key) over
// that metadata lets the OWNER detect such tampering on their own file.
// `shares` are deliberately excluded: other users legitimately append them.

/**
 * The MAC key is HKDF over the RAW master key, so unlike `deriveKey` this one has
 * to decode rather than take the text's bytes — the two uses genuinely want
 * different byte sequences from the same key, which is why the conversion lives
 * here and is spelled out rather than assumed.
 */
function envelopeMacKey(masterKeyBase64: Passphrase): Buffer {
  return Buffer.from(
    crypto.hkdfSync(
      'sha256',
      masterKeyRaw(masterKeyBase64),
      Buffer.alloc(0),
      Buffer.from('cred-ssh-manager/envelope-mac'),
      32,
    ),
  );
}

/** Stable serialization of the MAC-protected metadata fields. */
// eslint-disable-next-line complexity
function macCanonical(env: Record<string, unknown>): string {
  return JSON.stringify({
    format: env.format ?? null,
    version: env.version ?? null,
    account: env.account ?? null,
    wraps: env.wraps ?? null,
  });
}

/**
 * What a v3 MAC signs: the header AND the sealed blob.
 *
 * <p>v2 signed the header alone, which let anyone with write access to a shared
 * folder splice an older legitimate blob back in — same `account`, same `wraps`,
 * same `mac`, older secrets — and the check still said 'ok'.</p>
 *
 * <p>Each field is length-prefixed rather than concatenated, because plain
 * concatenation collides: `salt="AB", iv="C"` and `salt="A", iv="BC"` would hash
 * identically and the boundary between two fields would stop meaning anything.</p>
 */
/**
 * Bytes that cannot be re-cut: every field length-prefixed before its content.
 *
 * <p>Plain concatenation collides — `salt="AB", iv="C"` hashes identically to
 * `salt="A", iv="BC"`, so the boundary between two fields stops meaning anything
 * and an attacker can move value from one into the next. Shared with the share
 * transcript in `shareSignature.ts`, because a signature over an ambiguous
 * encoding has the same defect a MAC does.</p>
 */
// eslint-disable-next-line complexity
export function canonicalBytes(values: readonly unknown[]): Buffer {
  const chunks: Buffer[] = [];
  for (const value of values) {
    const bytes = Buffer.from(
      value === undefined || value === null
        ? ''
        : typeof value === 'string'
          ? value
          : JSON.stringify(value),
      'utf8',
    );
    const length = Buffer.alloc(4);
    length.writeUInt32BE(bytes.length);
    chunks.push(length, bytes);
  }
  return Buffer.concat(chunks);
}

function macMaterialV3(env: Record<string, unknown>): Buffer {
  return canonicalBytes(
    (['format', 'version', 'account', 'wraps', 'kdf', 'salt', 'iv', 'tag', 'data', 'kdfN', 'kdfR', 'kdfP'] as const)
      .map((field) => env[field]),
  );
}

function computeEnvelopeMac(env: Record<string, unknown>, masterKeyBase64: Passphrase): string {
  // v2 files keep verifying exactly as they were signed; only v3 covers the blob.
  const material =
    typeof env.version === 'number' && env.version >= VERSION_WRAPPED_FAST
      ? macMaterialV3(env)
      : Buffer.from(macCanonical(env), 'utf8');
  return crypto
    .createHmac('sha256', envelopeMacKey(masterKeyBase64))
    .update(material)
    .digest('base64');
}

export type EnvelopeMacStatus = 'ok' | 'missing' | 'bad';

/** Verify the envelope MAC with the (already unwrapped) master key. */
// eslint-disable-next-line complexity
export function verifyEnvelopeMac(
  fileContent: string,
  masterKeyBase64: Passphrase,
): EnvelopeMacStatus {
  let env: Record<string, unknown>;
  try {
    env = JSON.parse(fileContent) as Record<string, unknown>;
  } catch {
    return 'bad';
  }
  const mac = env.mac;
  if (typeof mac !== 'string') {
    return 'missing'; // legacy/unsigned envelope
  }
  const expected = computeEnvelopeMac(env, masterKeyBase64);
  const a = Buffer.from(mac, 'base64');
  const b = Buffer.from(expected, 'base64');
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? 'ok' : 'bad';
}

/**
 * Whether a MAC status must STOP a sync cycle (fail closed).
 *
 * <p>Only `bad` does — a signature that is present but does not match means the signed
 * envelope (account, unlock wraps, or the sealed blob itself) was altered at the shared
 * location. Proceeding would decrypt, merge and re-sign it, writing a fresh valid MAC that
 * heals the tamper into a legitimate-looking file; refusing leaves the evidence and hands
 * the decision to a person. `missing` is a legacy/unsigned envelope, not tampering, and
 * `ok` is the normal case — both proceed.</p>
 */
export function macStatusBlocksSync(status: EnvelopeMacStatus): boolean {
  return status === 'bad';
}

/**
 * Rewrite a v2 envelope's `wraps` and (re)sign the metadata MAC with the
 * master key. Replaces the older unsigned wrap-rewrite for v2 vaults.
 */
export function resignEnvelopeWraps(
  fileContent: string,
  wraps: readonly unknown[],
  masterKeyBase64: Passphrase,
): string {
  const env = JSON.parse(fileContent) as Record<string, unknown>;
  if (typeof env?.format !== 'string') {
    throw new BackupError('corrupted', 'Not a vault file.');
  }
  env.wraps = [...wraps];
  env.mac = computeEnvelopeMac(env, masterKeyBase64);
  return JSON.stringify(env, null, 2);
}

// eslint-disable-next-line complexity
function parseEnvelope(fileContent: string): BackupEnvelope {
  let raw: unknown;
  try {
    raw = JSON.parse(fileContent);
  } catch {
    throw new BackupError('corrupted', 'The file is not a valid backup (not JSON).');
  }
  if (typeof raw !== 'object' || raw === null) {
    throw new BackupError('corrupted', 'The file is not a valid backup.');
  }
  const v = raw as Record<string, unknown>;
  if (v.format !== FORMAT) {
    throw new BackupError('corrupted', 'The file is not a CredsForDevs backup.');
  }
  if (typeof v.version !== 'number' || !SUPPORTED_VERSIONS.includes(v.version)) {
    throw new BackupError(
      'unsupported-version',
      `Unsupported backup version: ${String(v.version)}.`,
    );
  }
  // 'hkdf' is the v3 payload derivation; 'scrypt' every version before it.
  if (v.kdf !== 'scrypt' && v.kdf !== 'hkdf') {
    throw new BackupError('corrupted', `Unsupported key derivation: ${String(v.kdf)}.`);
  }
  if (v.account !== undefined && !isStoredAccount(v.account)) {
    throw new BackupError('corrupted', 'Backup file has malformed account metadata.');
  }
  for (const field of ['salt', 'iv', 'tag', 'data'] as const) {
    if (typeof v[field] !== 'string' || (v[field] as string).length === 0) {
      throw new BackupError('corrupted', `Backup file is missing the "${field}" field.`);
    }
  }
  return v as unknown as BackupEnvelope;
}

/**
 * Read the plaintext account metadata of a backup without decrypting it.
 * Returns undefined for account-less (legacy) backups.
 */
export function readBackupAccount(fileContent: string): StoredAccount | undefined {
  return parseEnvelope(fileContent).account;
}

/** Read the plaintext shares array (unvalidated) without decrypting. */
export function readBackupShares(fileContent: string): unknown[] {
  const shares = parseEnvelope(fileContent).shares;
  return Array.isArray(shares) ? shares : [];
}

/** Decrypt an .enc vault file produced by {@link encryptJson}. */
export function decryptJson(fileContent: string, passphrase: string): unknown {
  const envelope = parseEnvelope(fileContent);
  return openBlob(envelope, passphrase);
}

/** {@link decryptJson} with scrypt off the extension-host thread — the legacy-v1 unlock path. */
export function decryptJsonAsync(fileContent: string, passphrase: string): Promise<unknown> {
  const envelope = parseEnvelope(fileContent);
  return openBlobAsync(envelope, passphrase);
}

/**
 * The WebAuthn user handle for an account — stable, so registering the same account
 * twice REPLACES its credential on the key instead of claiming another slot.
 *
 * <p>A discoverable ("resident") credential is keyed by (RP ID, user.id). The RP ID is
 * fixed here, so user.id carries the whole identity — and it was 16 random bytes made
 * fresh at every registration. Each attempt therefore filed a new credential rather than
 * overwriting its own. A YubiKey 5 holds roughly 25 of them and cannot be told to drop
 * one from here, so a handful of retries is a measurable part of the key spent, and a
 * full authenticator refuses `create()` outright — which is what "it keeps asking"
 * looked like.</p>
 *
 * <p>Derived from the email rather than the local account id so that the SAME account
 * registered from a second machine also replaces, instead of leaving a credential behind
 * that nothing will ever delete. Hashed because the readable name is already on the key
 * as `user.name`; the identifier does not need to be reversible as well.</p>
 */
export function webauthnUserHandle(email: string): Buffer {
  return crypto.createHash('sha256').update('creds-for-devs/user:' + email.trim().toLowerCase()).digest();
}
