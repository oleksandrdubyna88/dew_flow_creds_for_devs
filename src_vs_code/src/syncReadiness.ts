/**
 * Whether an account is actually able to sync, and — when it is not — the one sentence
 * that says what is missing.
 *
 * <p>Two surfaces need exactly this answer and must never disagree: the colour of the
 * account's icon, and the report shown when Sync is pressed. So it is computed once,
 * here, free of `vscode`.</p>
 *
 * <p>The setup is <b>per account</b>, not per location. The Sync PIN is stored under
 * `credSshManager.syncPin.&lt;accountId&gt;` and the security-key wraps live inside that
 * account's own vault envelope — so two accounts pointing at the same folder still have
 * two vaults and two separate ways in. Sharing a location shares nothing else.</p>
 */

export type SyncState =
  /** Everything needed is present; background sync can run unattended. */
  | 'ready'
  /** A way in exists but needs a person — a security key with no stored PIN. */
  | 'needsPerson'
  /** Something is missing; sync cannot happen at all. */
  | 'notConfigured'
  /** Locked deliberately. Not a setup problem, and must not read as one. */
  | 'locked';

export interface SyncFacts {
  /** A sync location (folder or server URL) is configured for this account. */
  hasLocation: boolean;
  /** A Sync PIN is stored on this machine — what lets sync run without asking. */
  hasStoredPin: boolean;
  /** At least one security key is registered on this account's vault. */
  hasSecurityKey: boolean;
  /** The vaults are locked right now. */
  isLocked: boolean;
}

export interface SyncReadiness {
  state: SyncState;
  /** Whether the account's icon should read as "good to go". */
  ready: boolean;
  /** One sentence: what is missing, or what state it is in. */
  reason: string;
  /** The command to run to fix it, when there is one. */
  fixCommand?: string;
  fixLabel?: string;
}

// eslint-disable-next-line complexity
export function syncReadiness(facts: SyncFacts): SyncReadiness {
  // Order matters. A locked vault is a DELIBERATE state, so it is reported before any
  // "you are missing something" verdict — telling somebody to set a PIN they already set,
  // because they just pressed Lock, is how a status line loses its credibility.
  if (facts.isLocked) {
    return {
      state: 'locked',
      ready: false,
      reason: 'Locked. Sync is paused until you unlock.',
      fixCommand: 'credSshManager.unlockWithSecurityKey',
      fixLabel: 'Unlock',
    };
  }

  if (!facts.hasLocation) {
    return {
      state: 'notConfigured',
      ready: false,
      reason: 'No sync location — nothing to sync with yet.',
      fixCommand: 'credSshManager.setAccountNasPath',
      fixLabel: 'Set Sync Location…',
    };
  }

  if (facts.hasStoredPin) {
    return { state: 'ready', ready: true, reason: 'Ready to sync.' };
  }

  if (facts.hasSecurityKey) {
    // Honest rather than flattering: a security key cannot be touched by a timer, so
    // background sync will keep stopping to ask. That is a different situation from
    // "ready", and calling both green would make the colour meaningless.
    return {
      state: 'needsPerson',
      ready: false,
      reason: 'A security key is registered, but no Sync PIN — background sync will ask for a touch each time.',
      fixCommand: 'credSshManager.setSyncPin',
      fixLabel: 'Set Sync PIN',
    };
  }

  return {
    state: 'notConfigured',
    ready: false,
    reason: 'No Sync PIN and no security key — the vault cannot be opened for sync.',
    fixCommand: 'credSshManager.setSyncPin',
    fixLabel: 'Set Sync PIN',
  };
}
