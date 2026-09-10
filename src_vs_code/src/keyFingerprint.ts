import * as crypto from 'node:crypto';

/**
 * Two short, non-secret identifiers that let two machines compare a failed decryption without
 * either of them saying anything they must not.
 *
 * <p>When a share or an exported file will not open, exactly three things can be wrong, and until
 * now none of them could be told apart from the outside: the transit secret differs, the key id it
 * is combined with differs, or the sealed bytes are not the ones that were sent. These two values
 * settle it in one comparison each.</p>
 *
 * <h3>{@link derivedKeyFingerprint} — of the DERIVED KEY, never of the secret</h3>
 * <p>A truncated hash of the PIN would be an offline guessing oracle. `pinPolicy.ts` spells out
 * why that matters here: the attacker already holds the ciphertext and guesses unthrottled, and the
 * only thing standing in the way is the ~100 ms scrypt each guess costs. A SHA-256 over the PIN
 * would let them test a candidate in a microsecond instead, which is the whole defence removed in
 * exchange for a diagnostic.</p>
 *
 * <p>Fingerprinting the key that scrypt already produced costs an attacker exactly what they were
 * already paying — to test a candidate against this value they must still run the KDF — so it adds
 * no attack surface at all. And 32 bits of a 256-bit key is not a key.</p>
 *
 * <h3>{@link blobFingerprint} — the same bytes on both ends, or they are not the same bytes</h3>
 * <p>Computed over the sealed material itself, so the sender and the recipient of one share (or the
 * writer and the reader of one export file) can confirm they are talking about the same thing. It
 * does two jobs: it PAIRS the two machines' log lines, which nothing else in a share can do once
 * the server has minted its own id; and it separates "the secret was wrong" from "the bytes changed
 * on the way", which otherwise produce the same sentence and the same wrong conclusion.</p>
 */

/** What a caller gets told about the key a seal or an open just derived. */
export type KeyReport = (fingerprint: string) => void;

/** The sealed material a fingerprint is taken over, structurally — no import, so no cycle. */
export interface FingerprintableBlob {
  readonly salt: string;
  readonly iv: string;
  readonly tag: string;
  readonly data: string;
}

const KEY_CONTEXT = 'creds-for-devs/derived-key-fingerprint';
const BLOB_CONTEXT = 'creds-for-devs/sealed-blob-fingerprint';
const HEX_CHARACTERS = 8;

function shortHash(context: string, material: Buffer): string {
  return crypto
    .createHash('sha256')
    .update(context)
    .update(material)
    .digest('hex')
    .slice(0, HEX_CHARACTERS);
}

/** Eight hex characters naming the key `scrypt` produced. See the header for why this is safe. */
export function derivedKeyFingerprint(key: Buffer): string {
  return shortHash(KEY_CONTEXT, key);
}

/**
 * Eight hex characters naming the sealed bytes.
 *
 * <p>Over the ciphertext, the tag, the IV and the salt — everything a transport could damage — and
 * over nothing the sender chose, so the value is the same on both ends whenever the bytes are.</p>
 */
export function blobFingerprint(blob: FingerprintableBlob): string {
  return shortHash(BLOB_CONTEXT, Buffer.from([blob.salt, blob.iv, blob.tag, blob.data].join('|'), 'utf8'));
}

/**
 * Tell a caller about a key, and never let that telling change what happens next.
 *
 * <p>The report is raised from inside the seal and open paths, on the way to a result the caller is
 * waiting for — including, on the open path, on the way to a throw the caller is meant to see. A
 * reporter that raised would replace a precise "wrong PIN" with whatever it threw, which is the
 * diagnostics-took-the-product-down failure `diagnosticLog.ts` is built to exclude. So it cannot.</p>
 */
export function reportKey(report: KeyReport | undefined, key: Buffer): void {
  try {
    report?.(derivedKeyFingerprint(key));
  } catch {
    // A diagnostic that fails is a diagnostic that did not happen, and nothing more than that.
  }
}
