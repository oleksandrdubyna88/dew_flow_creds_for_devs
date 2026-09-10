import { BackupError } from './backupError';

/**
 * The scrypt cost a sealed blob may name — and the reason it is an allow-list rather than a hint.
 *
 * <p>Every blob records the parameters it was made with (`kdfN`/`kdfR`/`kdfP`), so raising the cost
 * never orphans an older file. Read without a bound, those same three fields are an instruction from
 * whoever can WRITE the file: `maxmem` caps the memory term `128·N·r`, and nothing caps `p`, which
 * multiplies time at constant memory. Measured while writing `kdfParams.test.ts`: `kdfP: 128` on an
 * otherwise ordinary blob held a thread for <b>40 seconds</b> before answering "wrong password", and
 * the PIN wrap of a synced vault is opened by BACKGROUND sync with a stored PIN — so a write-capable
 * attacker at a shared sync location needed nobody to click anything (audit 2026-09-09, finding #6).
 * The envelope MAC does cover all three fields, but verifying it needs the master key the derivation
 * produces, so it can never be the first gate. This is.</p>
 *
 * <p>Out of `cryptoUtils.ts` because that file sits at its 800-line ceiling, and because this is a
 * closed question with its own tests: which costs exist, and what to do about one that does not.</p>
 */

export interface ScryptParams {
  N: number;
  r: number;
  p: number;
}

// New blobs record the params they used so the cost can be raised without breaking old data: a blob
// WITHOUT those fields predates the change and is read at the original N=2^15; new blobs are written
// at the OWASP-leaning N=2^17 and carry their params for the future.
const LEGACY_SCRYPT_N = 1 << 15;
const DEFAULT_SCRYPT_N = 1 << 17;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

/** maxmem must cover 128*N*r bytes (~128 MiB at N=2^17) plus headroom. */
export const SCRYPT_MAXMEM = 300 * 1024 * 1024;

export const LEGACY_PARAMS: ScryptParams = { N: LEGACY_SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P };
export const DEFAULT_PARAMS: ScryptParams = { N: DEFAULT_SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P };

/**
 * The parameter sets this build has ever WRITTEN — and therefore the only ones it derives with.
 *
 * <p>An allow-list of whole tuples, not a ceiling: a ceiling on `p` of 16 would still let a writer
 * make every reader sixteen times slower than the owner chose.</p>
 *
 * <p><b>Raising the cost is a format event.</b> The new tuple joins this list in the release that
 * starts writing it — <i>and</i> the envelope version is bumped with it, so an older build refuses
 * the file as NEWER through `SUPPORTED_VERSIONS` (which every envelope path reaches before this one)
 * rather than as corrupt. Adding a tuple without that bump is the one way to make a legitimate newer
 * file read as damaged on an older machine.</p>
 *
 * <p>Exported so nothing keeps a second copy: `kdfParams.test.ts` iterates it, so a future tuple is
 * covered by the acceptance tests the day it is added rather than the day somebody widens them.</p>
 */
export const ACCEPTED_SCRYPT: readonly ScryptParams[] = [LEGACY_PARAMS, DEFAULT_PARAMS];

/** Just the fields this decision reads — `unknown`, because on disk that is what they are. */
interface RecordedCost {
  kdfN?: unknown;
  kdfR?: unknown;
  kdfP?: unknown;
}

/**
 * What a refused tuple says, naming the values it refused.
 *
 * <p>Naming them separates "written by a newer build" from "somebody edited this file" for whoever
 * reads the message. Nothing here is secret: the three numbers are plaintext in every envelope.</p>
 */
function refusal(cost: RecordedCost): string {
  return (
    `Encrypted data names KDF parameters this build does not accept ` +
    `(N=${String(cost.kdfN)}, r=${String(cost.kdfR)}, p=${String(cost.kdfP)}) — ` +
    `if it was written by a newer CredsForDevs, update this one.`
  );
}

/**
 * The parameters a blob may be derived with, decided BEFORE any derivation.
 *
 * <p>All three fields absent is the one shape that means legacy: blobs written before the parameters
 * were recorded. `withKdf` has always written all three, so a PARTIAL set is a hand-edited one and is
 * refused. Otherwise the tuple must equal one of {@link ACCEPTED_SCRYPT}.</p>
 *
 * <p>The three values are read into locals and type-checked FIRST, so `null` (which JSON has and
 * TypeScript's `?` does not), a string, a getter on an untrusted object and an absent field all take
 * one path instead of relying on what `===` happens to do with each. `Number.isInteger` is belt to
 * that braces — `===` against an integer can only match an integer — but it states the intent where
 * a reader looks for it.</p>
 */
export function checkedParams(cost: RecordedCost): ScryptParams {
  const recorded = [cost.kdfN, cost.kdfR, cost.kdfP];
  if (recorded.every((v) => v === undefined)) {
    return LEGACY_PARAMS;
  }
  const accepted = recorded.every(isCount) ? matching(recorded as number[]) : undefined;
  if (accepted === undefined) {
    throw new BackupError('corrupted', refusal(cost));
  }
  return accepted;
}

/** A whole number, and nothing that merely looks like one — `null`, `"8"`, `NaN`, `0.5` are not. */
function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function matching([N, r, p]: number[]): ScryptParams | undefined {
  return ACCEPTED_SCRYPT.find((tuple) => tuple.N === N && tuple.r === r && tuple.p === p);
}
