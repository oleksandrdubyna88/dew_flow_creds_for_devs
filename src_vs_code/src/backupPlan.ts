import { isKeyWrap } from './keyWrap';
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
  /** A v2 vault is there: go through the vault key so its wraps survive. */
  | { kind: 'wrapped' }
  /** Nothing there, or an old PIN-only vault: a PIN is the only key that exists. */
  | { kind: 'pin' };

export function backupWriteMode(existingRaw: string | undefined): BackupWriteMode {
  if (existingRaw === undefined || existingRaw.trim().length === 0) {
    return { kind: 'pin' };
  }
  try {
    const wraps = readVaultWraps(existingRaw).filter(isKeyWrap);
    return wraps.length > 0 ? { kind: 'wrapped' } : { kind: 'pin' };
  } catch {
    // Unreadable is NOT the same as empty. Guessing "no wraps" from a parse failure is
    // precisely how they would get overwritten, so the unsafe answer is never the
    // default one.
    return { kind: 'wrapped' };
  }
}
