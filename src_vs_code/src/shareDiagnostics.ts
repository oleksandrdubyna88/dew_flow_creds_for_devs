import { BackupError } from './cryptoUtils';
import { describeError } from './describeError';
import { DiagnosticWriter } from './diagnosticWriter';
import { FingerprintableBlob, blobFingerprint } from './keyFingerprint';
import { shareAadText, shareFormOf } from './shareFormat';
import { describeTransitSecret, logSafe } from './transitSecretReport';
import { OwnedShare } from './types';

/**
 * The lines a share or an export leaves in `CredsForDevs: Show Diagnostics`, and how two people
 * read them together.
 *
 * <h3>How to use these lines</h3>
 * <p>A share that will not open produces one line on each machine: `share SENT` on the sender's and
 * `share ACCEPT FAILED` on the recipient's. Find the pair by `blob=` — it is computed from the
 * sealed bytes themselves, so it is the same on both ends and it survives the server minting its
 * own id for the item. Then read three fields, in this order:</p>
 *
 * <ol>
 *   <li><b>`blob=` differs.</b> The bytes that arrived are not the bytes that were sent. Nothing
 *   about the PIN is in question; the transport is.</li>
 *   <li><b>`blob=` matches, `key=` differs.</b> The two ends derived different keys, so either the
 *   secret or the address it is combined with differs. `pin len=…` says which: a different length
 *   or a named substitution is the secret; identical shapes with different keys point at
 *   `keyId=`, which the two lines can be compared on directly.</li>
 *   <li><b>`blob=` and `key=` both match.</b> The secret and the address are right and the label
 *   bound into the ciphertext is not — compare `aad=`.</li>
 * </ol>
 *
 * <p>That ordering is the point of having three values rather than one. A single "wrong PIN"
 * sentence collapses all three causes onto the one the reader can do least about.</p>
 *
 * <h3>Why this is a module and not a template string at each call site</h3>
 * <p>Every field here is either a fingerprint (`keyFingerprint.ts`), a shape (
 * `transitSecretReport.ts`) or a caller-supplied string passed through `logSafe`. Keeping the
 * assembly in one `vscode`-free place is what lets a test assert the whole promise — that the line
 * says what the header claims and that no secret is in it — instead of four call sites asserting
 * it separately and one of them drifting.</p>
 */

/** What one end of one share knows about it. Identical fields on both machines, by construction. */
export interface ShareDiagnostic {
  /** The address the key was built from — the roster's spelling on one end, the account's on the other. */
  readonly keyId: string;
  /** The entity's name, on BOTH lines, so a reader pairing them does not have to work from `blob=` alone. */
  readonly entityName: string;
  /**
   * The transit secret's SHAPE, already reduced by `describeTransitSecret`.
   *
   * <p>A shape and not the value, and reduced at the CAPTURE site rather than here: a review round
   * pointed out that a model carrying a plaintext secret across module boundaries is one that a
   * later change can serialise, cache or post to a worker without anybody noticing what it holds.
   * The reduction is irreversible, so this type cannot carry a secret even by accident.</p>
   */
  readonly pinShape: string;
  /** From `sealBlob`/`openBlob`'s report. Empty when nothing reported one. */
  readonly keyFingerprint: string;
  readonly blob: FingerprintableBlob;
  readonly form: string;
  readonly format?: number;
  /** The canonical AAD bytes as text, or empty when this form binds nothing. */
  readonly aad: string;
}

export interface AcceptFailure {
  readonly fromEmail: string;
  /** The local account the share was being accepted INTO. */
  readonly intoEmail: string;
  readonly serverStamped: boolean;
  readonly reason: string;
  readonly diagnostic: ShareDiagnostic;
}

/** An export file or an external import: one secret, no address, no bound label. */
export interface FileSecret {
  readonly file: string;
  /** The password's shape, reduced at the capture site — see `ShareDiagnostic.pinShape`. */
  readonly secretShape: string;
  readonly keyFingerprint: string;
  /** Absent when the file could not be parsed far enough to have one. */
  readonly blob?: FingerprintableBlob;
  readonly reason?: string;
}

const SEPARATOR = ' · ';

function keyField(fingerprint: string): string {
  return `key=${fingerprint === '' ? 'unavailable' : fingerprint}`;
}

function blobField(blob: FingerprintableBlob | undefined): string {
  return `blob=${blob === undefined ? 'unavailable' : blobFingerprint(blob)}`;
}

function shareFields(diagnostic: ShareDiagnostic): string[] {
  return [
    `entity=${logSafe(diagnostic.entityName)}`,
    `keyId=${logSafe(diagnostic.keyId)}`,
    `form=${logSafe(diagnostic.form)}`,
    `format=${diagnostic.format ?? 'none'}`,
    blobField(diagnostic.blob),
    keyField(diagnostic.keyFingerprint),
    `aad=${diagnostic.aad === '' ? 'none' : logSafe(diagnostic.aad)}`,
    `pin ${diagnostic.pinShape}`,
  ];
}

/**
 * The sender's half of the pair.
 *
 * <p>Written on SUCCESS, which is the only time it can be written: the sender never learns that the
 * far end could not open it. A diagnostic that only exists once somebody complains is one that is
 * never there when they do.</p>
 */
export function shareSentLine(toEmail: string, diagnostic: ShareDiagnostic): string {
  return ['share SENT', `to=${logSafe(toEmail)}`, ...shareFields(diagnostic)].join(SEPARATOR);
}

/** The recipient's half. */
export function shareAcceptFailedLine(failure: AcceptFailure): string {
  return [
    'share ACCEPT FAILED',
    `from=${logSafe(failure.fromEmail)}`,
    `into=${logSafe(failure.intoEmail)}`,
    `serverStamped=${failure.serverStamped}`,
    ...shareFields(failure.diagnostic),
    `reason=${logSafe(failure.reason)}`,
  ].join(SEPARATOR);
}

/**
 * The two file lines.
 *
 * <p>`aad=none` is stated rather than omitted. An external export binds no label at all
 * (`encryptJson` seals with no associated data), so a reader following the three-step order in the
 * header would otherwise reach step 3 and start comparing a field that does not exist. Saying it
 * out loud ends the search at step 2, where it belongs on this path.</p>
 */
export function externalExportLine(file: FileSecret): string {
  return [
    'export WRITTEN',
    `file=${logSafe(file.file)}`,
    blobField(file.blob),
    keyField(file.keyFingerprint),
    'aad=none',
    `password ${file.secretShape}`,
  ].join(SEPARATOR);
}

export function externalImportFailedLine(file: FileSecret): string {
  return [
    'external import FAILED',
    `file=${logSafe(file.file)}`,
    blobField(file.blob),
    keyField(file.keyFingerprint),
    'aad=none',
    `password ${file.secretShape}`,
    `reason=${logSafe(file.reason ?? 'unknown')}`,
  ].join(SEPARATOR);
}

/** The `source` column these lines are filed under, so one grep finds the whole conversation. */
const SHARE_SOURCE = 'share';
const FILE_SOURCE = 'export';

/**
 * The four writers.
 *
 * <p>Here rather than at the call sites because `shareInbox.ts` is 30 lines under the file-size
 * ceiling and because a line that is assembled in one place and written in four is a line that
 * comes to be written four different ways. The sink is {@link DiagnosticWriter}, so this module
 * still imports no `vscode` and the whole conversation is testable with an array.</p>
 *
 * <p>A SENT line is `info` and a FAILURE is `warn`: the default level shows both, and the
 * distinction is what lets somebody reading a busy channel find the failure first.</p>
 */
export function noteShareSent(
  log: DiagnosticWriter,
  toEmail: string,
  sent: readonly ShareDiagnostic[],
): void {
  for (const diagnostic of sent) {
    log.info(SHARE_SOURCE, shareSentLine(toEmail, diagnostic));
  }
}

export function noteAcceptFailed(log: DiagnosticWriter, failure: AcceptFailure): void {
  log.warn(SHARE_SOURCE, shareAcceptFailedLine(failure));
}

export function noteExportWritten(log: DiagnosticWriter, file: FileSecret): void {
  log.info(FILE_SOURCE, externalExportLine(file));
}

export function noteImportFailed(log: DiagnosticWriter, file: FileSecret): void {
  log.warn(FILE_SOURCE, externalImportFailedLine(file));
}

/**
 * The recipient's half, built from the item as it actually sits in the inbox.
 *
 * <p>Every field is read off the ITEM — the form, the format, the bound label — for the same reason
 * `sealWithDiagnostic` reads them back off the item it just sealed: the two lines must be produced
 * by the same rules the cryptography uses, or a difference between them says something about the
 * reporting rather than about the share.</p>
 */
export function acceptFailureOf(
  owned: OwnedShare,
  intoEmail: string,
  attempt: ShareAttempt,
  serverStamped: boolean,
): AcceptFailure {
  return {
    fromEmail: owned.item.fromEmail,
    intoEmail,
    serverStamped,
    reason: reasonOf(attempt.reason),
    diagnostic: {
      keyId: owned.shareKeyId,
      entityName: owned.item.entityName,
      // Reduced HERE, so the raw secret is an argument that dies with this call rather than a
      // field on a value the caller keeps.
      pinShape: describeTransitSecret(attempt.secret),
      keyFingerprint: attempt.fingerprint,
      blob: owned.item,
      form: shareFormOf(owned.item),
      format: owned.item.format,
      aad: shareAadText(owned.item),
    },
  };
}

/** One attempt to open one share: what was tried, the key it derived, and why it did not work. */
export interface ShareAttempt {
  readonly fingerprint: string;
  readonly reason: unknown;
  /**
   * The transit secret THIS attempt used.
   *
   * <p>Per attempt rather than per round, because a round-robin accept tries several PINs and the
   * one that matters for an item is the last one tried against IT. Carrying a single "the PIN" for
   * a whole batch is how a review round found the first version attributing one sender's PIN shape
   * to another sender's share.</p>
   */
  readonly secret: string;
}

/**
 * What to call the failure.
 *
 * <p>A `BackupError`'s KIND rather than its message: the kinds are a closed set the code branches
 * on (`wrong-password`, `corrupted`, `unsupported-version`, `server-key-required`), so they group
 * and grep, and they do not move when a sentence is reworded. Anything else is described as it is.</p>
 */
function reasonOf(reason: unknown): string {
  if (reason === undefined) {
    return 'unknown';
  }
  return reason instanceof BackupError ? reason.kind : describeError(reason);
}

/**
 * One line per share that was TRIED and never opened.
 *
 * <p>An item with no recorded attempt is skipped, and that is the whole correctness of the batch
 * path: a round-robin accept leaves items unopened at the end of every round, and the first version
 * of this reported each of them immediately — so a share sealed under a second sender's PIN got a
 * permanent "ACCEPT FAILED" line, carrying the FIRST sender's PIN shape and key fingerprint,
 * moments before it opened correctly. Three reviewers found it independently. Nothing is written
 * until the conversation is over, and nothing at all is written for a person who pressed Escape
 * before typing anything.</p>
 */
export function noteAcceptFailures(
  log: DiagnosticWriter,
  shares: readonly OwnedShare[],
  attempts: ReadonlyMap<string, ShareAttempt>,
  context: (share: OwnedShare) => { intoEmail: string; serverStamped: boolean },
): void {
  for (const share of shares) {
    const attempt = attempts.get(share.item.id);
    if (attempt !== undefined) {
      const { intoEmail, serverStamped } = context(share);
      noteAcceptFailed(log, acceptFailureOf(share, intoEmail, attempt, serverStamped));
    }
  }
}

/**
 * The sealed bytes inside an export file, when the file has any — from the text, or from an
 * envelope somebody has already parsed.
 *
 * <p>Best effort by design: it is called from a failure handler, and the file that reached the
 * handler may be truncated, re-encoded or not an export at all. Nothing here may throw — a
 * diagnostic that cannot be taken is reported as `blob=unavailable`, which is itself a fact worth
 * having, because a file with no readable envelope did not merely fail to decrypt.</p>
 */
export function sealedBlobOf(
  source: string | Record<string, unknown> | undefined,
): FingerprintableBlob | undefined {
  if (source === undefined) {
    return undefined;
  }
  return typeof source === 'string' ? blobFromText(source) : blobFromEnvelope(source);
}

/** For a caller that has only the file. Best effort — a truncated file simply has no blob. */
function blobFromText(text: string): FingerprintableBlob | undefined {
  try {
    return blobFromEnvelope(JSON.parse(text) as Record<string, unknown>);
  } catch {
    return undefined;
  }
}

/**
 * For a caller that has ALREADY parsed it — which the import path has.
 *
 * <p>An export can be several megabytes, and parsing it a second time inside a failure handler is a
 * synchronous freeze on the extension host at exactly the moment the person is waiting for an error
 * message. Raised by a review round.</p>
 */
function blobFromEnvelope(parsed: Record<string, unknown>): FingerprintableBlob | undefined {
  const fields = ['salt', 'iv', 'tag', 'data'] as const;
  return fields.every((field) => typeof parsed[field] === 'string')
    ? { salt: String(parsed.salt), iv: String(parsed.iv), tag: String(parsed.tag), data: String(parsed.data) }
    : undefined;
}
