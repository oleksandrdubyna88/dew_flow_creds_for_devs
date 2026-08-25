import { isKeyWrap, webauthnWraps } from './keyWrap';
import { readVaultWraps } from './cryptoUtils';

/**
 * How a vault file may be written.
 *
 * <p>This exists because "Backup to NAS" wrote the PIN-only v1 envelope over the SAME
 * file the sync transport uses — `planBackupFileNames` is shared by both. A vault with a
 * security key registered therefore came back as one without: the wraps were not
 * migrated, they were overwritten. Nothing failed and nothing warned; the key simply
 * stopped opening the vault.</p>
 *
 * <p>So the decision is not "which encryption is convenient here" but "what is already
 * in that file", and it is made in one place with tests rather than inline at the write.</p>
 */

export type BackupWriteMode =
  /** A security key opens this backup: go through the vault key so its wraps survive, and
   *  because that master IS the sync vault's master (safe to share the per-account cache). */
  | { kind: 'wrapped' }
  /** Nothing there, an old PIN-only v1 vault, or a v3 backup with only a pin-wrap: opened by
   *  its own standalone backup PIN, never through the vault-key cache (which would collide). */
  | { kind: 'pin' };

export function backupWriteMode(existingRaw: string | undefined): BackupWriteMode {
  if (existingRaw === undefined || existingRaw.trim().length === 0) {
    return { kind: 'pin' };
  }
  try {
    const wraps = readVaultWraps(existingRaw).filter(isKeyWrap);
    // Keyed off a SECURITY-KEY wrap, not "any wrap": a pin-wrap alone is a self-contained
    // backup opened by its standalone PIN. Routing a pin-only file through `vaultKeys.unlock`
    // would cache its freshly-generated master under the account id and shadow the sync
    // vault's master. A webauthn wrap only ever appears on a vault-keyed backup, whose
    // master is the sync master — so sharing the cache there is correct.
    return webauthnWraps(wraps).length > 0 ? { kind: 'wrapped' } : { kind: 'pin' };
  } catch {
    // Unreadable is NOT the same as empty. Guessing "no wraps" from a parse failure is
    // precisely how they would get overwritten, so the unsafe answer is never the
    // default one.
    return { kind: 'wrapped' };
  }
}
