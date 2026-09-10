/**
 * The typed failure every crypto path here reports, and the four things it can mean.
 *
 * <p>Its own module so that code below `cryptoUtils` in the import order can throw it — `scryptParams`
 * is the first — without either file importing the other. `cryptoUtils` re-exports both names, so
 * every existing importer keeps working and there is still one definition.</p>
 *
 * <p>`server-key-required` is the corporate one, and it exists so that a missing or changed server
 * login key can never reach a person as `wrong-password`. Both would otherwise be one AES-GCM tag
 * failure, and being told your own PIN is wrong when the truth is that the server has not been
 * reached is how somebody types it twenty times.</p>
 */
export type BackupErrorKind =
  | 'corrupted'
  | 'wrong-password'
  | 'unsupported-version'
  | 'server-key-required';

/** Typed failure so callers can show a precise, human message. */
export class BackupError extends Error {
  readonly kind: BackupErrorKind;

  constructor(kind: BackupErrorKind, message: string) {
    super(message);
    this.name = 'BackupError';
    this.kind = kind;
  }
}
