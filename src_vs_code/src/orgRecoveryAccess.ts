/**
 * What one account may see of corporate recovery, as a value the tree row carries.
 *
 * <p>The five corporate commands were contributed against `viewItem == account`, which is every
 * account on every transport — so a vault syncing to a folder, or to a server whose operator
 * never configured a roster, showed five menu entries whose only possible outcome was a refusal.
 * Worse, an ordinary employee saw *Accept Recovery Share…*, *Contribute to a Recovery…* and
 * *Finish a Recovery…*, which are not theirs to run and never will be.</p>
 *
 * <p>Decided here rather than in the tree so the rule is a unit test, and answered per ACCOUNT
 * rather than by a global `setContext`: one person may hold an account on a corporate server and
 * another on a plain folder, and a global flag would light both rows or neither.</p>
 */

export type OrgRecoveryAccess =
  /** No server, or a server with no roster. The commands do not exist for this account. */
  | 'none'
  /** A roster is configured. The disclosure page applies; the actions do not. */
  | 'enrolled'
  /** This account is named on the roster. Everything applies. */
  | 'officer';

export interface OrgRecoveryAccessFacts {
  /** This account syncs to a vault server — a folder or a git remote relays nothing. */
  onServer: boolean;
  /** The operator configured a roster. */
  enabled: boolean;
  officerEmails: readonly string[];
  accountEmail: string;
}

/**
 * <p><b>`enabled` is the gate, not `setupComplete`.</b> Between the operator naming officers and
 * the officers finishing the ceremony there is a window in which the actions are exactly what is
 * needed — accepting a share is how that window closes. Gating on a finished setup would hide
 * the commands that finish it.</p>
 */
export function orgRecoveryAccess(facts: OrgRecoveryAccessFacts): OrgRecoveryAccess {
  if (!facts.onServer || !facts.enabled) {
    return 'none';
  }
  const email = facts.accountEmail.trim().toLowerCase();
  return facts.officerEmails.some((o) => o.trim().toLowerCase() === email) ? 'officer' : 'enrolled';
}

/**
 * The tree row's `contextValue`, which is what a menu `when` clause matches.
 *
 * <p>Prefixed rather than separate words so one clause can cover both corporate states:
 * `viewItem =~ /^account-corp/` catches the page for everybody enrolled, while
 * `viewItem == account-corpOfficer` catches the four actions for the roster alone.</p>
 */
export function accountContextValue(access: OrgRecoveryAccess): string {
  switch (access) {
    case 'officer':
      return 'account-corpOfficer';
    case 'enrolled':
      return 'account-corp';
    default:
      // The value every account had before corporate recovery existed. Keeping it byte-identical
      // matters: every other menu entry on an account row is contributed against it.
      return 'account';
  }
}
