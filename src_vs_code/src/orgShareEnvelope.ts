import { SealedBlob, openBlob, sealBlob } from './cryptoUtils';

/**
 * What travels inside a setup invite: one officer's Shamir share, sealed under a one-time PIN.
 *
 * <p>The same construction an ordinary share uses — `scrypt(recipientEmail + PIN)` — and for
 * the same reason: there is no key exchange between two people who have not shared anything
 * yet, so the PIN is told out of band and the server relays a blob it cannot open. Reusing
 * `sealBlob` rather than a second recipe keeps one KDF cost, one parameter record, and one
 * place to raise them.</p>
 *
 * <p>Pure — no `vscode`, no I/O.</p>
 */

export interface SharePayload {
  /** The share's x coordinate. */
  shareIndex: number;
  /** The share bytes, base64. */
  share: string;
  threshold: number;
  totalShares: number;
  /** Lets the holder later prove a recombination rebuilt the real key. */
  integrityTag: string;
}

export function sealSharePayload(
  payload: SharePayload,
  recipientEmail: string,
  pin: string,
): SealedBlob {
  return sealBlob(payload, recipientEmail.trim().toLowerCase() + pin);
}

// eslint-disable-next-line complexity
function isSharePayload(value: unknown): value is SharePayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    typeof v.shareIndex === 'number' &&
    typeof v.share === 'string' &&
    typeof v.threshold === 'number' &&
    typeof v.totalShares === 'number' &&
    typeof v.integrityTag === 'string'
  );
}

/**
 * Open one with the PIN. `undefined` means "that PIN does not open this" — a wrong PIN and a
 * payload from a build that shaped it differently are both something the caller must say
 * plainly rather than throw an exception the user cannot act on.
 */
export function openSharePayload(
  blob: SealedBlob,
  recipientEmail: string,
  pin: string,
): SharePayload | undefined {
  try {
    const opened = openBlob(blob, recipientEmail.trim().toLowerCase() + pin);
    return isSharePayload(opened) ? opened : undefined;
  } catch {
    return undefined;
  }
}
