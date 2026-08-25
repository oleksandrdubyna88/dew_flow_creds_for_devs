import * as crypto from 'node:crypto';

/**
 * Sealing the local metadata cache — the node tree in `globalState`.
 *
 * <p><b>Why.</b> `SecretStorage` is the OS keychain; `globalState` is a plain SQLite file in
 * the VS Code profile. Every secret value already lives in the first. But the tree — hosts,
 * users, ports, every CLI argument and its note, the NAMES of bound environment variables —
 * lived in the second, in the clear. That is not a password leak; it is a topology map, and
 * anyone who can read the profile folder (a stolen unencrypted disk, a backup of `%APPDATA%`,
 * a process running as the same user that never bothers with the keychain) gets it for free.
 * 1Password encrypts its whole local cache for this reason. Now so does this extension.</p>
 *
 * <p><b>The key</b> is a random 32-byte <i>device key</i>, generated once and kept in
 * `SecretStorage` — never derived from the vault PIN, never synced. That is a deliberate
 * choice against the "empty tree until you unlock" model: the tree stays visible while the OS
 * session is unlocked, which is the same guarantee every other secret here already relies on,
 * and the failure mode is bounded — a lost keychain loses only a cache that the next sync
 * rebuilds from the encrypted remote.</p>
 *
 * <p><b>AAD.</b> The storage key name (`credSshManager.nodes.{accountId}`) is bound as
 * additional authenticated data, so a sealed blob copied from one account's slot into another's
 * fails to open instead of quietly presenting the wrong vault's tree. This is the construction
 * the audit asked for on the vault envelope; it costs nothing to start with here.</p>
 *
 * <p>Pure and `vscode`-free. AES-256-GCM, 12-byte IV, 16-byte tag; a version field so the next
 * format can be told from this one.</p>
 */

export const METADATA_KEY_BYTES = 32;

export interface SealedMetadata {
  readonly v: 1;
  readonly iv: string;
  readonly tag: string;
  readonly data: string;
}

export class MetadataError extends Error {
  constructor(
    readonly kind: 'wrong-key' | 'corrupted',
    message: string,
  ) {
    super(message);
  }
}

export function newMetadataKey(): Buffer {
  return crypto.randomBytes(METADATA_KEY_BYTES);
}

export function isSealedMetadata(value: unknown): value is SealedMetadata {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return v.v === 1 && typeof v.iv === 'string' && typeof v.tag === 'string' && typeof v.data === 'string';
}

/** Seal any JSON value under the device key, bound to `aad` (the slot it will be stored in). */
export function sealMetadata(value: unknown, key: Buffer, aad: string): SealedMetadata {
  if (key.length !== METADATA_KEY_BYTES) {
    throw new MetadataError('corrupted', 'The metadata key has the wrong length.');
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const data = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  plaintext.fill(0);
  return {
    v: 1,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  };
}

/**
 * Open a sealed value. `wrong-key` covers a changed key AND a blob moved to another slot —
 * GCM cannot tell them apart, and neither may be read.
 */
export function openMetadata(sealed: SealedMetadata, key: Buffer, aad: string): unknown {
  const iv = Buffer.from(sealed.iv, 'base64');
  const tag = Buffer.from(sealed.tag, 'base64');
  const data = Buffer.from(sealed.data, 'base64');
  if (key.length !== METADATA_KEY_BYTES || iv.length !== 12 || tag.length !== 16) {
    throw new MetadataError('corrupted', 'Sealed metadata has malformed parameters.');
  }
  let plaintext: Buffer;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
  } catch {
    throw new MetadataError(
      'wrong-key',
      'Sealed metadata does not open with this device key (a different key, or a blob moved between slots).',
    );
  }
  try {
    return JSON.parse(plaintext.toString('utf8'));
  } catch {
    throw new MetadataError('corrupted', 'Sealed metadata is not valid JSON.');
  } finally {
    plaintext.fill(0);
  }
}
