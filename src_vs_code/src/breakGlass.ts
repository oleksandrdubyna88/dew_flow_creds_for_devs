import {
  RECOVERY_SESSION_INFO,
  SealedToPublicKey,
  generateOrgRecoveryKeypair,
  openWithPrivateKey,
  publicKeyForPrivate,
  sealToPublicKey,
} from './orgEscrowCrypto';
import { MAX_SHARES, ShamirShare, combineShares, verifyRecombined } from './shamir';
import { readBackupAccount } from './cryptoUtils';

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
  const opened = usableContributions(openContributions(contributions, sessionPrivateKey));
  try {
    return search(opened, threshold, totalShares, integrityTag);
  } finally {
    // The opened shares are the plaintext Shamir shares, and `threshold` of them ARE the
    // organisation's private key. They are decrypted copies this function made, so nothing
    // else can be responsible for them — and on the `noValidQuorum` path there is not even a
    // key handed back for a caller to take responsibility FOR.
    wipe(...opened.map((o) => o.share.bytes));
  }
}

function search(
  opened: readonly OpenedContribution[],
  threshold: number,
  totalShares: number,
  integrityTag: string,
): RecoveryOutcome {
  if (opened.length < threshold) {
    return { kind: 'tooFew', have: opened.length, need: threshold };
  }
  for (const subset of combinations(opened, threshold)) {
    const found = tryQuorum(subset, totalShares, threshold, integrityTag);
    if (found !== undefined) {
      return found;
    }
  }
  return { kind: 'noValidQuorum', opened: opened.length };
}

/**
 * One candidate subset: rebuild it, and answer only if it really is the organisation's key.
 *
 * <p>A subset that does not verify rebuilt SOMETHING — 32 bytes of a key that is not the right
 * one — and dropping that reference leaves it in the heap for a dump to find. It is zeroed here
 * rather than left to the collector.</p>
 */
function tryQuorum(
  subset: readonly OpenedContribution[],
  totalShares: number,
  threshold: number,
  integrityTag: string,
): RecoveryOutcome | undefined {
  const candidate = tryCombine(subset);
  if (candidate === undefined) {
    return undefined;
  }
  if (verifyRecombined(candidate, totalShares, threshold, integrityTag)) {
    return {
      kind: 'recovered',
      orgPrivateKey: candidate,
      contributors: subset.map((o) => o.officerEmail),
    };
  }
  candidate.fill(0);
  return undefined;
}

/**
 * Interpolation that answers `undefined` instead of throwing.
 *
 * <p>`combineShares` refuses a malformed set by throwing, which is right for a programming
 * error and wrong here: the set is chosen by a SERVER, and one bad combination must cost that
 * combination rather than the whole recovery.</p>
 */
function tryCombine(subset: readonly OpenedContribution[]): Buffer | undefined {
  try {
    return combineShares(subset.map((o) => o.share));
  } catch {
    return undefined;
  }
}

/**
 * The contributions worth searching: one per share index, each index inside the field.
 *
 * <p>Two things the relay controls and must not be able to weaponise. An index outside 1..255
 * makes interpolation throw — x=0 IS the secret — and two contributions at the same x are one
 * point counted twice, which throws as well. Filtering here rather than catching later also
 * bounds the search: without it a server can post as many well-formed contributions as it likes
 * and every extra one multiplies the number of subsets to try.</p>
 *
 * <p>The FIRST contribution at an index wins, so a genuine officer cannot be displaced by a
 * later duplicate — and the cap is the field's own size, since a share set can never contain
 * more than 255 distinct points.</p>
 */
function usableContributions(opened: readonly OpenedContribution[]): OpenedContribution[] {
  const byIndex = new Map<number, OpenedContribution>();
  for (const candidate of opened) {
    if (isUsableIndex(candidate.share.index) && !byIndex.has(candidate.share.index)) {
      byIndex.set(candidate.share.index, candidate);
    }
  }
  return [...byIndex.values()];
}

/** A share's x must be a whole number inside the field, and never 0 — 0 IS the secret. */
function isUsableIndex(index: number): boolean {
  return Number.isInteger(index) && index >= 1 && index <= MAX_SHARES;
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

/**
 * Whether the ciphertext a recovery was handed really belongs to the person it authorised.
 *
 * <p><b>Every vault on a server is sealed to the SAME organisation key</b>, so the reconstructed
 * key opens all of them. A quorum convened to recover one person is therefore, in cryptographic
 * terms, a quorum able to open anybody — and the only thing separating the two is this check.
 * Without it a server can answer a legitimate recovery of A with B's blob: the officers decrypt
 * B's secrets under an authorisation for A, the audit line names A, and the re-keyed result is
 * written back to A's path, so A is later handed a vault full of B's plaintext under a temporary
 * PIN. Neither half of that is something the server could do alone.</p>
 *
 * <p>The envelope's `account` header is plaintext precisely so a restore knows whose vault it is
 * holding before it opens anything, and it is bound by the v4 AAD and the envelope MAC — so
 * comparing against it is meaningful rather than merely hopeful. Anything unreadable is refused:
 * absence is not a reason to proceed on trust.</p>
 */
export function recoveredVaultIsTheTarget(vaultContent: string, targetEmail: string): boolean {
  const owner = safeAccount(vaultContent);
  if (owner === undefined) {
    return false;
  }
  return owner.email.trim().toLowerCase() === targetEmail.trim().toLowerCase();
}

function safeAccount(vaultContent: string): { email: string } | undefined {
  try {
    return readBackupAccount(vaultContent);
  } catch {
    return undefined;
  }
}

/**
 * Finish with a session's keypair.
 *
 * <p>Both halves, and it exists as a named operation rather than a `wipe` call at each site
 * because the sites are the problem: removing the session from its map is a dropped reference,
 * which the doc comment on `RecoverySessionKeys.privateKey` has always said is not enough.
 * Idempotent, so the `finally` that calls it may follow a path that already did.</p>
 */
export function endRecoverySession(keys: RecoverySessionKeys): void {
  wipe(keys.privateKey, keys.publicKey);
}

/** Overwrite recovered key material. A dropped reference is not a forgotten key. */
export function wipe(...buffers: (Buffer | undefined)[]): void {
  for (const buffer of buffers) {
    buffer?.fill(0);
  }
}
