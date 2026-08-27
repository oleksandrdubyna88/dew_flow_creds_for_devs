import {
  RECOVERY_SESSION_INFO,
  SealedToPublicKey,
  generateOrgRecoveryKeypair,
  openWithPrivateKey,
  publicKeyForPrivate,
  sealToPublicKey,
} from './orgEscrowCrypto';
import { ShamirShare, combineShares, verifyRecombined } from './shamir';

/**
 * The arithmetic of a break-glass recovery, with no server and no `vscode` in sight.
 *
 * <p>Everything here happens on one officer's machine: minting the session keypair, opening
 * the contributions the others resealed to it, and deciding whether what came back really is
 * the organisation's key. That last question is the whole feature — the server counts
 * contributions but cannot check a single one, so if this module gets it wrong nothing else
 * will catch it.</p>
 */

export interface RecoverySessionKeys {
  /** Published in the session so officers can reseal to it. */
  publicKey: Buffer;
  /** Never leaves this process. Zeroed when the recovery ends. */
  privateKey: Buffer;
}

export function newSessionKeys(): RecoverySessionKeys {
  const pair = generateOrgRecoveryKeypair();
  return { publicKey: pair.publicKey, privateKey: pair.privateKey };
}

/** Seal one officer's share to the session — the contributing side. */
export function sealShareToSession(
  share: ShamirShare,
  sessionPublicKey: Buffer,
): SealedToPublicKey & { shareIndex: number } {
  return {
    shareIndex: share.index,
    ...sealToPublicKey(share.bytes, sessionPublicKey, RECOVERY_SESSION_INFO),
  };
}

export interface Contribution {
  officerEmail: string;
  shareIndex: number;
  sealed: SealedToPublicKey;
}

export type RecoveryOutcome =
  | { kind: 'recovered'; orgPrivateKey: Buffer; contributors: string[] }
  /** Enough blobs arrived, none of the combinations rebuilds the published key. */
  | { kind: 'noValidQuorum'; opened: number }
  /** Fewer contributions than the threshold — nothing to try yet. */
  | { kind: 'tooFew'; have: number; need: number };

/**
 * Open every contribution this session collected, and find a subset that really rebuilds the
 * organisation's key.
 *
 * <p><b>Why subsets and not "take the first `threshold` of them".</b> Interpolation over a
 * wrong subset does not fail — it returns a well-formed key that is simply not the right one.
 * One officer contributing a share from a superseded ceremony, or a blob a compromised server
 * substituted, would produce exactly that, and the failure would surface later as "the escrow
 * wrap will not open", pointing at the wrong thing. So each candidate subset is checked against
 * the integrity tag, and the first that verifies is the answer.</p>
 *
 * <p>A contribution that will not even decrypt is dropped rather than fatal: one officer
 * resealing to the wrong session must not stop the others from finishing.</p>
 */
export function recoverOrgKey(
  contributions: readonly Contribution[],
  sessionPrivateKey: Buffer,
  threshold: number,
  totalShares: number,
  integrityTag: string,
): RecoveryOutcome {
  const opened = openContributions(contributions, sessionPrivateKey);
  if (opened.length < threshold) {
    return { kind: 'tooFew', have: opened.length, need: threshold };
  }
  for (const subset of combinations(opened, threshold)) {
    const candidate = combineShares(subset.map((o) => o.share));
    if (verifyRecombined(candidate, totalShares, threshold, integrityTag)) {
      return {
        kind: 'recovered',
        orgPrivateKey: candidate,
        contributors: subset.map((o) => o.officerEmail),
      };
    }
  }
  return { kind: 'noValidQuorum', opened: opened.length };
}

interface OpenedContribution {
  officerEmail: string;
  share: ShamirShare;
}

function openContributions(
  contributions: readonly Contribution[],
  sessionPrivateKey: Buffer,
): OpenedContribution[] {
  const opened: OpenedContribution[] = [];
  for (const contribution of contributions) {
    const share = tryOpen(contribution, sessionPrivateKey);
    if (share !== undefined) {
      opened.push({ officerEmail: contribution.officerEmail, share });
    }
  }
  return opened;
}

function tryOpen(contribution: Contribution, sessionPrivateKey: Buffer): ShamirShare | undefined {
  try {
    const bytes = openWithPrivateKey(contribution.sealed, sessionPrivateKey, RECOVERY_SESSION_INFO);
    return { index: contribution.shareIndex, bytes };
  } catch {
    return undefined;
  }
}

/** Every `size`-element subset, smallest indices first — deterministic, so a retry behaves. */
function combinations<T>(items: readonly T[], size: number): T[][] {
  if (size === 0) {
    return [[]];
  }
  if (items.length < size) {
    return [];
  }
  const [head, ...rest] = items;
  return [
    ...combinations(rest, size - 1).map((tail) => [head, ...tail]),
    ...combinations(rest, size),
  ];
}

/**
 * Confirm a recovered key is the one the server publishes, before it is used to open anything.
 *
 * <p>The integrity tag already proves the shares agree with each other. This proves they agree
 * with the vault that is about to be opened — the case they do not is a share set from a
 * ceremony that has since been superseded, which would otherwise fail one step later with a
 * message about a wrap rather than about the shares.</p>
 */
export function keyMatchesPublished(orgPrivateKey: Buffer, publishedPublicKey: Buffer): boolean {
  return publicKeyForPrivate(orgPrivateKey).equals(publishedPublicKey);
}

/** Overwrite recovered key material. A dropped reference is not a forgotten key. */
export function wipe(...buffers: (Buffer | undefined)[]): void {
  for (const buffer of buffers) {
    buffer?.fill(0);
  }
}
