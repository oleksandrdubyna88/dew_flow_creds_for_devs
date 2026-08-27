import { KeyWrap, newMasterKey, recoveryWrap, wrapWithPinAsync } from './keyWrap';
import { encryptJsonWrapped } from './cryptoUtils';
import { StoredAccount } from './types';

/**
 * Rotating a vault's master key: a fresh random master, the payload re-encrypted under it,
 * and a new set of wraps — the one operation that actually REVOKES an opener.
 *
 * <p>Everything else in `securityKeyOps` merely edits the `wraps[]` array around a master
 * that stays the same, which is why removing one of several security keys leaves that key
 * opening every copy already on disk. Only a rotation ends that, and it lived inlined and
 * duplicated in two branches — the v1 upgrade and the last-key removal — that had drifted
 * apart in what they carried over. This is that half, extracted, with both callers repointed.</p>
 *
 * <p><b>The PIN is the anchor and cannot be optional.</b> A rotation must produce a vault its
 * owner can still open, and the PIN is the only factor available without a physical gesture:
 * re-wrapping under a security key needs that key touched, which the caller may not be able to
 * ask for, and re-wrapping under a recovery code needs the code itself — which is stored
 * nowhere by design. `extraWraps` is how a caller that DOES hold another factor adds it.</p>
 */

export interface RekeyArgs {
  /** The decrypted vault, already proven readable — never rotate onto an unverified payload. */
  payload: unknown;
  account: StoredAccount;
  /** The PIN the new master is anchored under. */
  pin: string;
  now: number;
  /** Plaintext shares riding the envelope on the folder transport; undefined on the server. */
  pendingShares: unknown[] | undefined;
  /**
   * The wraps the vault had BEFORE. Not used to build the new envelope — it is what lets the
   * rotation report which openers it could not carry across.
   */
  previousWraps: readonly KeyWrap[];
  /** Extra openers for the FRESH master, from a caller that can prove them right now. */
  extraWraps?: (masterKey: Buffer, now: number) => KeyWrap[];
}

export interface RekeyResult {
  content: string;
  /** The fresh master — cache it, or the next unlock pays for a wrap it could have skipped. */
  masterKey: Buffer;
  wraps: KeyWrap[];
  /**
   * The vault had a printed recovery code and this rotation could not carry it over.
   *
   * <p>Not a failure and not avoidable: re-wrapping the new master under that code would
   * need the code, which exists only on the paper in somebody's drawer. What IS avoidable
   * is the silence — the caller has to say the printed page is now worthless and offer a
   * fresh one, or the owner keeps a dead code believing it works, which is worse than
   * having none at all.</p>
   */
  recoveryCodeRetired: boolean;
}

export async function rekeyUnderPin(args: RekeyArgs): Promise<RekeyResult> {
  const masterKey = newMasterKey();
  const wraps = [
    await wrapWithPinAsync(masterKey, args.account.accountId, args.pin, args.now),
    ...(args.extraWraps?.(masterKey, args.now) ?? []),
  ];
  return {
    content: encryptJsonWrapped(
      args.payload,
      masterKey.toString('base64'),
      wraps,
      args.account,
      args.pendingShares,
    ),
    masterKey,
    wraps,
    recoveryCodeRetired: recoveryWrap(args.previousWraps) !== undefined,
  };
}
