/**
 * How a WRAPPED vault opens — the decision, extracted.
 *
 * <p>This cascade lived inline in `vaultKeys` and broke three times: Lock that a silent
 * stored-PIN reopen undid, one PRF salt sent for every credential, and routing by a
 * version number that moved. It also never asked the one question worth asking: when a
 * human is about to be interrupted anyway and the vault has BOTH a key slot and a PIN
 * slot, the interruption may as well be "which one?".</p>
 */

export interface UnlockFacts {
  /** The caller can prompt. Background sync cannot. */
  interactive: boolean;
  /** The vault is LOCKED: stored secrets are refused, opening must cost a gesture. */
  needsGesture: boolean;
  /** A Sync PIN is stored on this machine (and usable — the caller checks lock first). */
  hasStoredPin: boolean;
  hasPinWrap: boolean;
  hasKeyWrap: boolean;
}

export type UnlockPlan =
  /** Open with the stored PIN, silently — the unattended path, unchanged. */
  | { kind: 'silentPin' }
  /** Both ways in, and a person is present: ask which. */
  | { kind: 'choose' }
  /** Only the security key can open this. */
  | { kind: 'key' }
  /** Only a typed PIN can open this. */
  | { kind: 'promptPin' }
  /** No path for this caller. Background with nothing stored, or no wraps at all. */
  | { kind: 'refuse' };

// eslint-disable-next-line complexity
export function unlockPlan(facts: UnlockFacts): UnlockPlan {
  if (facts.hasStoredPin && facts.hasPinWrap && !facts.needsGesture) {
    return { kind: 'silentPin' };
  }
  if (!facts.interactive) {
    return { kind: 'refuse' };
  }
  if (facts.hasKeyWrap && facts.hasPinWrap) {
    return { kind: 'choose' };
  }
  if (facts.hasKeyWrap) {
    return { kind: 'key' };
  }
  if (facts.hasPinWrap) {
    return { kind: 'promptPin' };
  }
  return { kind: 'refuse' };
}
