import * as crypto from 'node:crypto';
import { BackupError, SealedBlob, openBlob, sealBlob } from './cryptoUtils';

/**
 * Multi-unlock key wrapping.
 *
 * A v2 vault payload is encrypted with a random 32-byte **master key**, and
 * that master key is stored several times over — once per unlock method:
 *
 *   - `pin`      : AES-256-GCM(masterKey) under scrypt(accountId + PIN)
 *   - `webauthn` : AES-256-GCM(masterKey) under HKDF(PRF secret of one
 *                  security key) — one wrap per registered YubiKey
 *
 * Any single wrap yields the master key, so several YubiKeys and the PIN all
 * open the same vault, and adding/removing a key never re-encrypts the data.
 * All of this is pure — no `vscode`, no I/O — so it is unit-testable.
 */

export const MASTER_KEY_BYTES = 32;

export type KeyWrapKind = 'pin' | 'webauthn';

export interface KeyWrap extends SealedBlob {
  kind: KeyWrapKind;
  /** Stable id: 'pin' for the PIN wrap, the credential id for a key. */
  id: string;
  /** Human label shown in the UI (e.g. "YubiKey 5C — work"). */
  label?: string;
  /** WebAuthn only: the PRF input this credential was wrapped with. */
  prfSalt?: string;
  createdAt: number;
}

export function isKeyWrap(value: unknown): value is KeyWrap {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    (v.kind === 'pin' || v.kind === 'webauthn') &&
    typeof v.id === 'string' &&
    typeof v.salt === 'string' &&
    typeof v.iv === 'string' &&
    typeof v.tag === 'string' &&
    typeof v.data === 'string' &&
    (v.label === undefined || typeof v.label === 'string') &&
    (v.prfSalt === undefined || typeof v.prfSalt === 'string') &&
    (v.createdAt === undefined || typeof v.createdAt === 'number')
  );
}

export function newMasterKey(): Buffer {
  return crypto.randomBytes(MASTER_KEY_BYTES);
}

/** Fresh random PRF input for a newly registered security key. */
export function newPrfSalt(): string {
  return crypto.randomBytes(32).toString('base64');
}

/**
 * Derive the wrapping key from a high-entropy PRF secret. HKDF (not scrypt)
 * because the input is already 32 random bytes from the security key.
 */
function prfWrappingKey(prfSecret: Buffer, salt: Buffer): Buffer {
  return Buffer.from(
    crypto.hkdfSync('sha256', prfSecret, salt, Buffer.from('cred-ssh-manager/webauthn'), 32),
  );
}

/** Wrap the master key under a PIN (scrypt via the shared sealed-blob layer). */
export function wrapWithPin(
  masterKey: Buffer,
  accountId: string,
  pin: string,
  createdAt: number,
): KeyWrap {
  return {
    kind: 'pin',
    id: 'pin',
    createdAt,
    ...sealBlob(masterKey.toString('base64'), accountId + pin),
  };
}

/** Wrap the master key under one security key's PRF secret. */
export function wrapWithPrf(
  masterKey: Buffer,
  credentialId: string,
  prfSalt: string,
  prfSecret: Buffer,
  label: string | undefined,
  createdAt: number,
): KeyWrap {
  const salt = crypto.randomBytes(16);
  const key = prfWrappingKey(prfSecret, salt);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(masterKey), cipher.final()]);
  return {
    kind: 'webauthn',
    id: credentialId,
    label,
    prfSalt,
    createdAt,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  };
}

/** Recover the master key from a PIN wrap. Throws BackupError on a bad PIN. */
export function unwrapWithPin(wrap: KeyWrap, accountId: string, pin: string): Buffer {
  const payload = openBlob(wrap, accountId + pin);
  if (typeof payload !== 'string') {
    throw new BackupError('corrupted', 'PIN wrap does not hold a master key.');
  }
  const key = Buffer.from(payload, 'base64');
  if (key.length !== MASTER_KEY_BYTES) {
    throw new BackupError('corrupted', 'PIN wrap holds a malformed master key.');
  }
  return key;
}

/** Recover the master key from a security-key wrap. */
export function unwrapWithPrf(wrap: KeyWrap, prfSecret: Buffer): Buffer {
  const salt = Buffer.from(wrap.salt, 'base64');
  const iv = Buffer.from(wrap.iv, 'base64');
  const tag = Buffer.from(wrap.tag, 'base64');
  const data = Buffer.from(wrap.data, 'base64');
  if (salt.length !== 16 || iv.length !== 12 || tag.length !== 16) {
    throw new BackupError('corrupted', 'Security-key wrap has malformed parameters.');
  }
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', prfWrappingKey(prfSecret, salt), iv);
    decipher.setAuthTag(tag);
    const key = Buffer.concat([decipher.update(data), decipher.final()]);
    if (key.length !== MASTER_KEY_BYTES) {
      throw new BackupError('corrupted', 'Security-key wrap holds a malformed master key.');
    }
    return key;
  } catch (error) {
    if (error instanceof BackupError) {
      throw error;
    }
    throw new BackupError(
      'wrong-password',
      'This security key does not open the vault (wrong key, or the wrap was replaced).',
    );
  }
}

/** Replace/add a wrap by id, keeping the rest untouched. */
export function upsertWrap(wraps: readonly KeyWrap[], wrap: KeyWrap): KeyWrap[] {
  const others = wraps.filter((w) => !(w.kind === wrap.kind && w.id === wrap.id));
  return [...others, wrap];
}

export function removeWrap(wraps: readonly KeyWrap[], kind: KeyWrapKind, id: string): KeyWrap[] {
  return wraps.filter((w) => !(w.kind === kind && w.id === id));
}

/** The security keys registered for a vault, in registration order. */
export function webauthnWraps(wraps: readonly KeyWrap[]): KeyWrap[] {
  return wraps.filter((w) => w.kind === 'webauthn').sort((a, b) => a.createdAt - b.createdAt);
}
