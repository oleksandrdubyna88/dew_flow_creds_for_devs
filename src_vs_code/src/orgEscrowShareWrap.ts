import {
  KeyWrap,
  isKeyWrap,
  unwrapWithPinAsync,
  unwrapWithPrf,
  wrapWithPinAsync,
  wrapWithPrf,
} from './keyWrap';
import { ShamirShare } from './shamir';

/**
 * One officer's Shamir share of the organisation's recovery key, sealed under that officer's
 * own factors and stored in their own vault.
 *
 * <p>It lives in the officer's vault envelope rather than in a store of its own so it reaches
 * every machine they use through the sync that already exists — an officer accepts once and is
 * ready to contribute from anywhere. Inventing a second sync story for exactly one field would
 * have been the alternative.</p>
 *
 * <p><b>The sealing reuses the vault's own wrap primitives</b>, and the reason is arithmetic
 * rather than convenience: a Shamir share of a 32-byte secret is itself 32 bytes, which is
 * exactly what `wrapWithPin` and `wrapWithPrf` seal. Having one implementation of "seal 32
 * bytes under a PIN or a security key" is worth more than a pair of names that read perfectly
 * in both places — the names say `master key` because that was the first caller, and a second
 * copy would be the thing that drifts.</p>
 *
 * <p>Pure — no `vscode`, no I/O.</p>
 */

export interface EscrowShareWrap {
  /** The ceremony this share belongs to. A share from an older one opens nothing current. */
  setupId: string;
  /** The share's x coordinate — recombination needs it, and it is not secret. */
  shareIndex: number;
  threshold: number;
  totalShares: number;
  /** Proves a recombination produced the real key. See `shamir.verifyRecombined`. */
  integrityTag: string;
  /** Which generation of the org key this share reconstructs. */
  orgPublicKeyFingerprint: string;
  createdAt: number;
  /** The share bytes, sealed under this officer's PIN or security key. */
  sealed: KeyWrap;
}

/** Everything about a share except the bytes — copied from the invite, none of it secret. */
export interface EscrowShareMeta {
  setupId: string;
  shareIndex: number;
  threshold: number;
  totalShares: number;
  integrityTag: string;
  orgPublicKeyFingerprint: string;
}

function assemble(meta: EscrowShareMeta, sealed: KeyWrap, createdAt: number): EscrowShareWrap {
  return { ...meta, createdAt, sealed };
}

/** Seal a share under the officer's vault PIN. */
export async function sealShareWithPin(
  share: Buffer,
  meta: EscrowShareMeta,
  accountId: string,
  pin: string,
  createdAt: number,
): Promise<EscrowShareWrap> {
  return assemble(meta, await wrapWithPinAsync(share, accountId, pin, createdAt), createdAt);
}

/**
 * Seal a share under one of the officer's security keys.
 *
 * <p>`prfSalt` must be minted fresh for this purpose rather than reusing the vault-unlock salt:
 * the same key deriving the same secret for two different jobs means compromising one reveals
 * the other, and here the two jobs are "open my vault" and "help open everybody's".</p>
 */
export function sealShareWithPrf(
  share: Buffer,
  meta: EscrowShareMeta,
  credentialId: string,
  prfSalt: string,
  prfSecret: Buffer,
  label: string | undefined,
  createdAt: number,
): EscrowShareWrap {
  return assemble(
    meta,
    wrapWithPrf(share, credentialId, prfSalt, prfSecret, label, createdAt),
    createdAt,
  );
}

function shareFrom(wrap: EscrowShareWrap, bytes: Buffer): ShamirShare {
  return { index: wrap.shareIndex, bytes };
}

export async function openShareWithPin(
  wrap: EscrowShareWrap,
  accountId: string,
  pin: string,
): Promise<ShamirShare> {
  return shareFrom(wrap, await unwrapWithPinAsync(wrap.sealed, accountId, pin));
}

export function openShareWithPrf(wrap: EscrowShareWrap, prfSecret: Buffer): ShamirShare {
  return shareFrom(wrap, unwrapWithPrf(wrap.sealed, prfSecret));
}

// eslint-disable-next-line complexity
export function isEscrowShareWrap(value: unknown): value is EscrowShareWrap {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    typeof v.setupId === 'string' &&
    typeof v.shareIndex === 'number' &&
    typeof v.threshold === 'number' &&
    typeof v.totalShares === 'number' &&
    typeof v.integrityTag === 'string' &&
    typeof v.orgPublicKeyFingerprint === 'string' &&
    typeof v.createdAt === 'number' &&
    isKeyWrap(v.sealed)
  );
}

/**
 * Whether this stored share is still worth anything: it must belong to the ceremony whose key
 * the server currently publishes.
 *
 * <p>A share from a superseded ceremony reconstructs a key nothing is sealed to any more. Kept
 * on disk it is only a way to waste a quorum's time, so the officer is told to re-accept.</p>
 */
export function shareMatchesCurrentKey(
  wrap: EscrowShareWrap,
  orgPublicKeyFingerprint: string,
): boolean {
  return wrap.orgPublicKeyFingerprint === orgPublicKeyFingerprint;
}
