import { StoredAccount } from './types';

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
  /**
   * The registry says `dev` (epic 1). Enrolled, and the account a later version will hold to the
   * policy — the bans themselves land in epic 2; this value exists so their menu can be gated.
   */
  | 'dev'
  /** The registry says `admin` (epic 1). Enrolled, and may manage the roster. */
  | 'admin'
  /** This account is named on the roster. Everything applies — an officer is always an admin. */
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
 * The recovery answer folded together with the registry role from `GET /api/org/me`.
 *
 * <p>Two fetches, one row value. The officer stays highest — an officer is always an admin, and
 * the registry cannot say anything about them (the server refuses to give an officer a role), so
 * there is no combined state to invent. `none` stays `none` whatever the role: corp mode off
 * means the row must read exactly as it did before corporate recovery existed, because every
 * other menu entry on it is contributed against that string. An unknown role from a newer
 * server is an ordinary enrolled account — a role this build cannot name is not one it can
 * hand management actions to.</p>
 */
export function orgAccessWithRole(access: OrgRecoveryAccess, role: string | undefined): OrgRecoveryAccess {
  if (access !== 'enrolled') {
    return access;
  }
  switch (role) {
    case 'admin':
      return 'admin';
    case 'dev':
      return 'dev';
    default:
      return 'enrolled';
  }
}

/**
 * The tree row's `contextValue`, which is what a menu `when` clause matches.
 *
 * <p>Prefixed rather than separate words so one clause can cover every corporate state:
 * `viewItem =~ /^account-corp/` catches the disclosure page and the policy page for everybody
 * enrolled, while `viewItem == account-corpOfficer` catches the four actions for the roster
 * alone, and `account-corpAdmin` / `account-corpDev` are there for the epics that gate on them.</p>
 */
export function accountContextValue(access: OrgRecoveryAccess): string {
  return CONTEXT_VALUES[access];
}

const CONTEXT_VALUES: Readonly<Record<OrgRecoveryAccess, string>> = {
  officer: 'account-corpOfficer',
  admin: 'account-corpAdmin',
  dev: 'account-corpDev',
  enrolled: 'account-corp',
  // The value every account had before corporate recovery existed. Keeping it byte-identical
  // matters: every other menu entry on an account row is contributed against it.
  none: 'account',
};

/** Just enough of the recovery client to read a config — so this module still imports no transport. */
export interface OrgRecoveryConfigReader {
  readConfig: (account: StoredAccount) => Promise<{ enabled: boolean; officerEmails: readonly string[] }>;
}

/**
 * Read what this account may see of corporate recovery, and record it where the tree reads it.
 *
 * <p>Here rather than in `extension.ts` for the split `orgPolicyRefresh` documents: the `vscode`
 * layer holds the wiring, and the decision — including what an unreachable server means — lives
 * beside the function that makes it. <b>Any failure is `none`</b>, and deliberately: a server that
 * cannot be asked has not granted anybody anything, and drawing five corporate commands on the
 * strength of a timeout offers actions whose only possible outcome is a refusal.</p>
 */
export async function readOrgAccessInto(
  into: Map<string, OrgRecoveryAccess>,
  client: OrgRecoveryConfigReader | undefined,
  account: StoredAccount,
): Promise<void> {
  if (client === undefined) {
    into.set(account.accountId, 'none');
    return;
  }
  try {
    const config = await client.readConfig(account);
    into.set(
      account.accountId,
      orgRecoveryAccess({
        onServer: true,
        enabled: config.enabled,
        officerEmails: config.officerEmails,
        accountEmail: account.email,
      }),
    );
  } catch {
    into.set(account.accountId, 'none');
  }
}
