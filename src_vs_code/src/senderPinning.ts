import { ShareTranscript, keyFingerprint, verifyShare } from './shareSignature';

/**
 * Trust-on-first-use for a share's sender, and what to conclude on every later one.
 *
 * <p>A signature proves "signed by the holder of key K"; tying K to a person is
 * the other half, and on a folder the attacker can also write, publishing keys
 * there solves nothing on its own. So a peer's key is <b>pinned on first
 * contact</b> and every later share must match it. That is strong against
 * somebody who arrives afterwards and weak against somebody already in place —
 * which is exactly what the fingerprint comparison is for, and why it is part of
 * the feature rather than a nicety.</p>
 *
 * <p>Pure: the store is passed in, so the verdicts are unit tests.</p>
 */

export interface PinStore {
  get(key: string): Record<string, string> | undefined;
  update(key: string, value: Record<string, string>): Thenable<void>;
}

const KEY = 'credSshManager.pinnedSenderKeys';

function pinKeyFor(accountId: string): string {
  return `${KEY}.${accountId}`;
}

export function pinnedKey(store: PinStore, accountId: string, email: string): string | undefined {
  return (store.get(pinKeyFor(accountId)) ?? {})[email.toLowerCase()];
}

export function pinSenderKey(
  store: PinStore,
  accountId: string,
  email: string,
  publicKey: string,
): Thenable<void> {
  const pins = { ...(store.get(pinKeyFor(accountId)) ?? {}) };
  pins[email.toLowerCase()] = publicKey;
  return store.update(pinKeyFor(accountId), pins);
}

/**
 * What a recipient can conclude about one share.
 *
 * <ul>
 *   <li><b>verified</b> — signed by the key already pinned for this sender.</li>
 *   <li><b>firstContact</b> — signature is good, but nothing was pinned yet.
 *       Nobody has checked that the key belongs to the person; this is where the
 *       fingerprint gets compared, not where trust is announced.</li>
 *   <li><b>mismatch</b> — a different key than the pinned one. Possible key
 *       rotation, possible impersonation; the interface must not guess which.</li>
 *   <li><b>downgraded</b> — the sender has signed before and this one is not
 *       signed at all. Strictly worse than never having signed, because it is the
 *       shape of somebody stripping the signature.</li>
 *   <li><b>unsigned</b> — no signature and none ever seen. Legacy, or a peer on
 *       an older build: shown lower-trust, never dropped.</li>
 *   <li><b>badSignature</b> — a signature that does not verify at all.</li>
 * </ul>
 */
export type SenderVerdict =
  | 'verified'
  | 'firstContact'
  | 'mismatch'
  | 'downgraded'
  | 'unsigned'
  | 'badSignature';

export interface SignedShare {
  transcript: ShareTranscript;
  /** Absent on a legacy share, which is a verdict rather than an error. */
  signature?: string;
}

// eslint-disable-next-line complexity
export function judgeSender(
  store: PinStore,
  accountId: string,
  share: SignedShare,
): SenderVerdict {
  const pinned = pinnedKey(store, accountId, share.transcript.fromEmail);

  if (share.signature === undefined || share.signature.length === 0) {
    // The case the plan did not name: a sender who has signed before and now
    // does not. Treating that as ordinary "unsigned" would let an attacker strip
    // the signature and land back in the lower-trust path they were meant to have
    // been lifted out of.
    return pinned === undefined ? 'unsigned' : 'downgraded';
  }

  const claimed = share.transcript.senderPublicKey;
  if (!verifyShare(claimed, share.transcript, share.signature)) {
    return 'badSignature';
  }
  if (pinned === undefined) {
    return 'firstContact';
  }
  return pinned === claimed ? 'verified' : 'mismatch';
}

/** Whether a verdict should stop an import outright rather than merely colour it. */
export function verdictBlocksAccept(verdict: SenderVerdict): boolean {
  return verdict === 'badSignature' || verdict === 'mismatch' || verdict === 'downgraded';
}

/**
 * What a blocking verdict SAYS to the person about to accept a share.
 *
 * <p>Out of `shareInbox.senderCheck`, where it was a fifteen-line ternary chain inside a `vscode`
 * method: the wording of a verdict is a property of the verdict, it is pure, and here it is
 * testable. Nothing about the sentences changed in the move.</p>
 *
 * <p>`pinned` is the key already trusted for this address, absent when there is none; `incoming` is
 * the key this share arrived with, empty when it arrived unsigned — which is itself one of the
 * verdicts.</p>
 */
export function senderVerdictDetail(
  verdict: SenderVerdict,
  fromEmail: string,
  pinned: string | undefined,
  incoming: string,
): string {
  if (verdict === 'mismatch') {
    return `This is signed by a DIFFERENT key than the one pinned for ${fromEmail}.

Pinned:  ${pinned === undefined ? '—' : keyFingerprint(pinned)}
This one: ${keyFingerprint(incoming)}

Either they rotated their key, or somebody else is using their name. Compare the fingerprint with them directly before trusting it.`;
  }
  if (verdict === 'downgraded') {
    return `${fromEmail} has signed shares before, and this one is not signed at all. That is what stripping a signature looks like.`;
  }
  return 'The signature on this share does not verify.';
}
