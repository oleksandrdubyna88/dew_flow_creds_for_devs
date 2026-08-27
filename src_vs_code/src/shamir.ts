import * as crypto from 'node:crypto';

/**
 * Shamir's Secret Sharing over GF(2^8) — split a secret into N shares of which any M
 * reconstruct it, and fewer than M reveal nothing at all.
 *
 * <p>Hand-written because this extension has **zero runtime dependencies** and a library
 * would be the first. That is a real cost, so what is here is the textbook construction and
 * nothing clever: a random polynomial per byte position whose constant term is the secret
 * byte, evaluated at x = 1..N, recombined by Lagrange interpolation at x = 0. The field is
 * the AES field (reducing polynomial `0x11b`), which is the one every other implementation
 * of this uses.</p>
 *
 * <p><b>Classic Shamir is not authenticated</b>, and that is the trap this module closes
 * rather than inherits: interpolation over a wrong or tampered subset does not fail — it
 * returns a different 32-byte value, perfectly well-formed, indistinguishable from the real
 * secret until something downstream refuses it with an unrelated-looking error. So a share
 * set is minted with an {@link mintShareSet} integrity tag derived from the secret, and
 * {@link verifyRecombined} is what tells "these shares are the right ones" from "this vault
 * is damaged".</p>
 *
 * <p>Pure — no `vscode`, no I/O — so every property below is a unit test.</p>
 */

/** GF(2^8) with the AES reducing polynomial. */
const REDUCE = 0x1b;
export const MAX_SHARES = 255;

export interface ShamirShare {
  /** The x coordinate this share was evaluated at: 1..255. Never 0 — that IS the secret. */
  index: number;
  bytes: Buffer;
}

export interface ShareSet {
  shares: ShamirShare[];
  threshold: number;
  /** Proof that a recombination produced the ORIGINAL secret. See {@link verifyRecombined}. */
  integrityTag: string;
}

/**
 * Multiply in GF(2^8), branchlessly.
 *
 * <p>No log/antilog tables, deliberately: a table lookup indexed by secret-derived data is
 * the shape cache-timing attacks read, and the loop below is both simple enough to check by
 * eye and free of data-dependent branches. It is called a few thousand times per split, so
 * the table's speed advantage buys nothing anybody can perceive.</p>
 */
function gfMul(a: number, b: number): number {
  let result = 0;
  let x = a & 0xff;
  let y = b & 0xff;
  for (let i = 0; i < 8; i++) {
    result ^= -(y & 1) & x;
    const overflow = -((x >> 7) & 1);
    x = ((x << 1) ^ (REDUCE & overflow)) & 0xff;
    y >>= 1;
  }
  return result & 0xff;
}

/** The multiplicative inverse, as a^254 — every non-zero element satisfies a^255 = 1. */
function gfInv(a: number): number {
  let result = 1;
  let power = a & 0xff;
  let exponent = 254;
  while (exponent > 0) {
    if ((exponent & 1) === 1) {
      result = gfMul(result, power);
    }
    power = gfMul(power, power);
    exponent >>= 1;
  }
  return result;
}

/** Horner's rule: coeffs[0] is the constant term, which is the secret byte. */
function evalPoly(coeffs: readonly number[], x: number): number {
  let acc = 0;
  for (let i = coeffs.length - 1; i >= 0; i--) {
    acc = gfMul(acc, x) ^ coeffs[i];
  }
  return acc;
}

/** The Lagrange coefficient for share `i`, evaluated at x = 0. Subtraction in GF(2^8) is XOR. */
function lagrangeBasis(indices: readonly number[], i: number): number {
  let acc = 1;
  for (let j = 0; j < indices.length; j++) {
    if (j !== i) {
      acc = gfMul(acc, gfMul(indices[j], gfInv(indices[j] ^ indices[i])));
    }
  }
  return acc;
}

// eslint-disable-next-line complexity
function checkSplitArgs(secret: Buffer, total: number, threshold: number): void {
  if (secret.length === 0) {
    throw new Error('Nothing to split: the secret is empty.');
  }
  if (!Number.isInteger(total) || total < 2 || total > MAX_SHARES) {
    throw new Error(`A share count must be a whole number from 2 to ${MAX_SHARES}, not ${total}.`);
  }
  if (!Number.isInteger(threshold) || threshold < 2 || threshold > total) {
    throw new Error(`A threshold must be a whole number from 2 to ${total}, not ${threshold}.`);
  }
}

/**
 * Split `secret` into `total` shares, any `threshold` of which reconstruct it.
 *
 * <p>A threshold of 1 is refused rather than supported: it would hand every holder the whole
 * secret and call it a share, which is the opposite of what a caller reaching for this wants.</p>
 */
export function splitSecret(secret: Buffer, total: number, threshold: number): ShamirShare[] {
  checkSplitArgs(secret, total, threshold);
  const shares: ShamirShare[] = [];
  for (let i = 1; i <= total; i++) {
    shares.push({ index: i, bytes: Buffer.alloc(secret.length) });
  }
  for (let pos = 0; pos < secret.length; pos++) {
    // A fresh polynomial per byte position, with the secret byte as its constant term.
    const coeffs = [secret[pos], ...crypto.randomBytes(threshold - 1)];
    for (const share of shares) {
      share.bytes[pos] = evalPoly(coeffs, share.index);
    }
  }
  return shares;
}

// eslint-disable-next-line complexity
function checkCombineArgs(shares: readonly ShamirShare[]): void {
  if (shares.length < 2) {
    throw new Error('Reconstructing needs at least two shares.');
  }
  const length = shares[0].bytes.length;
  if (shares.some((s) => s.bytes.length !== length)) {
    throw new Error('These shares are not from one split: their lengths differ.');
  }
  if (shares.some((s) => !Number.isInteger(s.index) || s.index < 1 || s.index > MAX_SHARES)) {
    throw new Error('A share index must be a whole number from 1 to 255.');
  }
  if (new Set(shares.map((s) => s.index)).size !== shares.length) {
    // Two shares at the same x are one share counted twice — and the interpolation below
    // would divide by zero and return silent nonsense rather than refusing.
    throw new Error('The same share was supplied twice.');
  }
}

/**
 * Reconstruct from any set of shares.
 *
 * <p>This does NOT know the threshold and cannot check it: too few shares produce a wrong
 * answer, not an error, which is the property {@link verifyRecombined} exists for.</p>
 */
export function combineShares(shares: readonly ShamirShare[]): Buffer {
  checkCombineArgs(shares);
  const indices = shares.map((s) => s.index);
  const basis = indices.map((_, i) => lagrangeBasis(indices, i));
  const out = Buffer.alloc(shares[0].bytes.length);
  for (let pos = 0; pos < out.length; pos++) {
    let acc = 0;
    for (let i = 0; i < shares.length; i++) {
      acc ^= gfMul(shares[i].bytes[pos], basis[i]);
    }
    out[pos] = acc;
  }
  return out;
}

const INTEGRITY_INFO = Buffer.from('creds-for-devs/org-recovery-integrity');

/**
 * A tag proving a recombination produced the ORIGINAL secret.
 *
 * <p>Publishable beside the shares: it is an HMAC under a key derived from the secret by
 * HKDF, so holding it without `threshold` shares reveals nothing — and holding the shares
 * makes it checkable. It binds the split's shape too, so a set silently re-minted at a
 * different threshold does not verify against the old tag.</p>
 */
function integrityTag(secret: Buffer, total: number, threshold: number): string {
  const key = Buffer.from(crypto.hkdfSync('sha256', secret, Buffer.alloc(0), INTEGRITY_INFO, 32));
  return crypto.createHmac('sha256', key).update(`${total}:${threshold}`).digest('base64');
}

/** Split, and publish the tag that makes a later recombination checkable. */
export function mintShareSet(secret: Buffer, total: number, threshold: number): ShareSet {
  checkSplitArgs(secret, total, threshold);
  return {
    shares: splitSecret(secret, total, threshold),
    threshold,
    integrityTag: integrityTag(secret, total, threshold),
  };
}

/**
 * Whether `candidate` really is the secret this set was minted from.
 *
 * <p>The one gate that separates "the officers supplied the right shares" from "somebody
 * supplied a share that was not theirs" — because interpolation itself cannot tell.</p>
 */
export function verifyRecombined(
  candidate: Buffer,
  total: number,
  threshold: number,
  expectedTag: string,
): boolean {
  const actual = Buffer.from(integrityTag(candidate, total, threshold), 'base64');
  const expected = Buffer.from(expectedTag, 'base64');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
