/**
 * The typed failure every crypto path here reports, and the five things it can mean.
 *
 * <p>Its own module so that code below `cryptoUtils` in the import order can throw it — `scryptParams`
 * is the first — without either file importing the other. `cryptoUtils` re-exports both names, so
 * every existing importer keeps working and there is still one definition.</p>
 *
 * <p>`server-key-required` is the corporate one, and it exists so that a missing or changed server
 * login key can never reach a person as `wrong-password`. Both would otherwise be one AES-GCM tag
 * failure, and being told your own PIN is wrong when the truth is that the server has not been
 * reached is how somebody types it twenty times.</p>
 *
 * <p>`tampered` is the newest, and it exists for the same reason: an envelope whose integrity
 * signature is missing where its version requires one, or does not match, was ALTERED — by somebody
 * with write access to wherever it is stored. Reported as `corrupted` a person restores a backup;
 * reported as `wrong-password` they retype a PIN that was right all along. Neither is the action the
 * situation calls for.</p>
 */
export type BackupErrorKind =
  | 'corrupted'
  | 'wrong-password'
  | 'unsupported-version'
  | 'server-key-required'
  | 'tampered';

/** What a person is told when an envelope's own signature says it was altered. */
export const TAMPERED_MESSAGE =
  "This vault file's integrity signature is missing or does not match — it was altered outside " +
  'CredsForDevs. Nothing on this machine was changed; check who can write to the sync location.';

/** Typed failure so callers can show a precise, human message. */
export class BackupError extends Error {
  readonly kind: BackupErrorKind;

  constructor(kind: BackupErrorKind, message: string) {
    super(message);
    this.name = 'BackupError';
    this.kind = kind;
  }
}
