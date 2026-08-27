import * as crypto from 'node:crypto';

/**
 * Sealing a secret to a public key nobody currently holds the other half of — the primitive
 * the corporate escrow wrap is built from (see `todo/PLAN_org_recovery.md`).
 *
 * <p>Everything else in this extension is symmetric: the vault's master key is wrapped under
 * factors its owner can present. Escrow cannot be, because the whole point is that a vault
 * enrols itself while the recovery key exists only as Shamir shares in other people's vaults.
 * So: X25519 + HKDF + AES-256-GCM, an ephemeral keypair per seal, and the org's private half
 * needed only at the moment of a break-glass.</p>
 *
 * <p><b>Raw keys, and why the obvious route does not work.</b> `node:crypto` speaks
 * `KeyObject`, and the escrow needs 32 plain bytes — a public key small enough to publish and
 * a private key with no structure around it, because a private key with structure cannot be
 * split into Shamir shares. Measured before this module was written: the JWK route exports
 * both halves correctly, but IMPORTING a private JWK is refused (`Invalid JWK OKP key`)
 * unless the public member is supplied alongside it, which the holder of a bare share does
 * not have. The DER route has no such asymmetry — an X25519 SPKI/PKCS8 is a fixed prefix
 * followed by the 32 bytes, verified constant across 50 generated keypairs — so both
 * directions go through DER and the JWK route is not used at all.</p>
 */

/** `SEQUENCE { SEQUENCE { OID 1.3.101.110 }, BIT STRING }` — everything before the 32 bytes. */
const SPKI_PREFIX = Buffer.from('302a300506032b656e032100', 'hex');
/** `SEQUENCE { 0, SEQUENCE { OID 1.3.101.110 }, OCTET STRING { OCTET STRING } }`. */
const PKCS8_PREFIX = Buffer.from('302e020100300506032b656e04220420', 'hex');
const RAW_KEY_BYTES = 32;

/**
 * HKDF `info` strings. One per context and never shared: the same ECIES serves the escrow
 * wrap and the resealing of a share to a live recovery session, and a key derived for one
 * must be useless in the other.
 */
export const ESCROW_WRAP_INFO = 'creds-for-devs/org-escrow-wrap';
export const RECOVERY_SESSION_INFO = 'creds-for-devs/recovery-session';

export interface OrgKeypair {
  /** Raw 32 bytes, published to every client. */
  publicKey: Buffer;
  /** Raw 32 bytes — split into Shamir shares and then destroyed. */
  privateKey: Buffer;
}

export interface SealedToPublicKey {
  /** The per-seal ephemeral public key, base64. Never reused. */
  ephemeralPublicKey: string;
  salt: string;
  iv: string;
  tag: string;
  data: string;
}

function rawPublic(key: crypto.KeyObject): Buffer {
  const der = key.export({ type: 'spki', format: 'der' });
  return Buffer.from(der.subarray(der.length - RAW_KEY_BYTES));
}

function rawPrivate(key: crypto.KeyObject): Buffer {
  const der = key.export({ type: 'pkcs8', format: 'der' });
  return Buffer.from(der.subarray(der.length - RAW_KEY_BYTES));
}

function checkedRaw(raw: Buffer, what: string): Buffer {
  if (raw.length !== RAW_KEY_BYTES) {
    throw new Error(`${what} must be exactly ${RAW_KEY_BYTES} bytes, not ${raw.length}.`);
  }
  return raw;
}

function publicFromRaw(raw: Buffer): crypto.KeyObject {
  return crypto.createPublicKey({
    key: Buffer.concat([SPKI_PREFIX, checkedRaw(raw, 'An X25519 public key')]),
    format: 'der',
    type: 'spki',
  });
}

function privateFromRaw(raw: Buffer): crypto.KeyObject {
  return crypto.createPrivateKey({
    key: Buffer.concat([PKCS8_PREFIX, checkedRaw(raw, 'An X25519 private key')]),
    format: 'der',
    type: 'pkcs8',
  });
}

export function generateOrgRecoveryKeypair(): OrgKeypair {
  const pair = crypto.generateKeyPairSync('x25519');
  return { publicKey: rawPublic(pair.publicKey), privateKey: rawPrivate(pair.privateKey) };
}

/** The public half a private key belongs to — how a share holder proves a key is the org's. */
export function publicKeyForPrivate(privateRaw: Buffer): Buffer {
  return rawPublic(crypto.createPublicKey(privateFromRaw(privateRaw)));
}

function derive(shared: Buffer, salt: Buffer, info: string): Buffer {
  return Buffer.from(crypto.hkdfSync('sha256', shared, salt, Buffer.from(info), 32));
}

/**
 * Seal `payload` so that only the holder of `orgPublicRaw`'s private half can open it.
 *
 * <p>A fresh ephemeral keypair every time — reusing one across two seals would make the two
 * shared secrets identical, and with them the derived keys.</p>
 */
export function sealToPublicKey(
  payload: Buffer,
  orgPublicRaw: Buffer,
  info: string,
): SealedToPublicKey {
  const ephemeral = crypto.generateKeyPairSync('x25519');
  const shared = crypto.diffieHellman({
    privateKey: ephemeral.privateKey,
    publicKey: publicFromRaw(orgPublicRaw),
  });
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', derive(shared, salt, info), iv);
  const data = Buffer.concat([cipher.update(payload), cipher.final()]);
  return {
    ephemeralPublicKey: rawPublic(ephemeral.publicKey).toString('base64'),
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  };
}

/** Open what {@link sealToPublicKey} produced. Throws on a wrong key or a tampered blob. */
export function openWithPrivateKey(
  sealed: SealedToPublicKey,
  orgPrivateRaw: Buffer,
  info: string,
): Buffer {
  const shared = crypto.diffieHellman({
    privateKey: privateFromRaw(orgPrivateRaw),
    publicKey: publicFromRaw(Buffer.from(sealed.ephemeralPublicKey, 'base64')),
  });
  const key = derive(shared, Buffer.from(sealed.salt, 'base64'), info);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(sealed.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(sealed.data, 'base64')),
    decipher.final(),
  ]);
}

// eslint-disable-next-line complexity
export function isSealedToPublicKey(value: unknown): value is SealedToPublicKey {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    typeof v.ephemeralPublicKey === 'string' &&
    typeof v.salt === 'string' &&
    typeof v.iv === 'string' &&
    typeof v.tag === 'string' &&
    typeof v.data === 'string'
  );
}
