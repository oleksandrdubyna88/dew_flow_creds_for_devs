import { PinStore } from './senderPinning';

/**
 * Trust-on-first-use for the organisation's recovery key, and for who holds its shares.
 *
 * <p>The same problem `senderPinning` solves, one level up. A server publishes "this is the
 * org recovery public key and these three people can use it"; nothing in that answer proves
 * it. Sealing a vault's master key to a public key the server chose would let whoever
 * controls the server recover every vault on it — the one thing this product's central claim
 * forbids. So the answer is pinned on first contact and every later one is compared.</p>
 *
 * <p><b>Two fingerprints, not one, because they mean different things.</b> The KEY changing is
 * a new ceremony (or a swap); the ROSTER changing is the operator editing who may recover.
 * Either needs a person to look, and telling somebody "the recovery key changed" when what
 * actually happened is "your CTO left and was replaced" sends them looking in the wrong place.</p>
 *
 * <p>Pure: the store is passed in, so the verdicts are unit tests.</p>
 */

const KEY = 'credSshManager.pinnedOrgRecovery';

function pinKeyFor(accountId: string): string {
  return `${KEY}.${accountId}`;
}

export interface OrgRecoveryFacts {
  /** The server names a roster at all. */
  enabled: boolean;
  /** The ceremony has run and a key is published. */
  setupComplete: boolean;
  orgPublicKeyFingerprint: string;
  rosterFingerprint: string;
  /** Which server said so — a different one is a different trust decision. */
  location: string;
}

export type OrgRecoveryVerdict =
  /** No roster here. Nothing to pin, nothing to enrol into. */
  | 'off'
  /** A roster, but no key yet: the officers have not finished the ceremony. */
  | 'notReady'
  /** Usable, and nothing was pinned before. Nobody has checked these people are those people. */
  | 'firstContact'
  /** Exactly what was pinned. */
  | 'verified'
  /** The recovery KEY differs from the pinned one — a new ceremony, or a swap. */
  | 'keyChanged'
  /** Same key, different officers — the operator edited who may recover. */
  | 'rosterChanged';

export function pinnedOrgRecovery(
  store: PinStore,
  accountId: string,
): Record<string, string> | undefined {
  return store.get(pinKeyFor(accountId));
}

export function pinOrgRecovery(
  store: PinStore,
  accountId: string,
  facts: OrgRecoveryFacts,
): Thenable<void> {
  return store.update(pinKeyFor(accountId), {
    location: facts.location,
    keyFingerprint: facts.orgPublicKeyFingerprint,
    rosterFingerprint: facts.rosterFingerprint,
  });
}

/** Forget the pin — for an account that moved to a different server. */
export function forgetOrgRecovery(store: PinStore, accountId: string): Thenable<void> {
  return store.update(pinKeyFor(accountId), {});
}

// eslint-disable-next-line complexity
export function judgeOrgRecovery(
  store: PinStore,
  accountId: string,
  facts: OrgRecoveryFacts,
): OrgRecoveryVerdict {
  if (!facts.enabled) {
    return 'off';
  }
  if (!facts.setupComplete || facts.orgPublicKeyFingerprint.length === 0) {
    return 'notReady';
  }
  const pinned = pinnedOrgRecovery(store, accountId);
  // A pin from a DIFFERENT server says nothing about this one — an account that moved is
  // meeting this roster for the first time, not meeting a changed version of another.
  if (pinned === undefined || pinned.location !== facts.location) {
    return 'firstContact';
  }
  if (pinned.keyFingerprint !== facts.orgPublicKeyFingerprint) {
    return 'keyChanged';
  }
  return pinned.rosterFingerprint === facts.rosterFingerprint ? 'verified' : 'rosterChanged';
}

/**
 * Whether this verdict must stop a client from sealing its master key to the published key.
 *
 * <p>`firstContact` does NOT block: refusing there would mean corporate recovery could never
 * start. What it must do is be SHOWN — the fingerprint exists to be read aloud once — which is
 * the caller's job, and `orgRecoveryNotice` gives it the words.</p>
 */
export function verdictBlocksEnrolment(verdict: OrgRecoveryVerdict): boolean {
  return verdict === 'keyChanged' || verdict === 'rosterChanged';
}

/**
 * What to tell the person, in the words this situation actually deserves.
 *
 * <p>Empty for the two states with nothing to say. The wording matters more here than in most
 * places: this is the only moment somebody learns that colleagues can open their vault.</p>
 */
export function orgRecoveryNotice(
  verdict: OrgRecoveryVerdict,
  facts: OrgRecoveryFacts,
): string {
  const officers = `${facts.rosterFingerprint.slice(0, 8)}…`;
  switch (verdict) {
    case 'firstContact':
      return (
        `${facts.location} has corporate recovery switched on. From the next sync, this vault's ` +
        'key is also sealed so that a quorum of the named officers can open it without you. ' +
        `Check the recovery key fingerprint with one of them before trusting it: ${facts.orgPublicKeyFingerprint}`
      );
    case 'keyChanged':
      return (
        'The corporate recovery KEY on this server is not the one this machine pinned. That is a ' +
        'new ceremony if your officers just ran one — and somebody substituting a key they hold ' +
        `if they did not. Nothing new will be sealed to it until you confirm. New fingerprint: ${facts.orgPublicKeyFingerprint}`
      );
    case 'rosterChanged':
      return (
        'The recovery key is unchanged, but WHO can use it is not: this server now names a ' +
        `different set of officers (roster ${officers}). Confirm the new list with someone before ` +
        'this vault seals anything else to them.'
      );
    default:
      return '';
  }
}
