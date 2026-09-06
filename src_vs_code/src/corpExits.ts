import { CorpPolicyState } from './corpPolicy';

/**
 * The three exits a developer may not use — export, back up to disk, clone into another account —
 * decided in ONE place so three handlers cannot drift into three different answers.
 *
 * <p>All three are the same permission on the server: `PolicyDoc.export`, which
 * `orgMemberPolicyPanel.ts` already shows the person in exactly those words. They are separate
 * commands with separate call sites, which is precisely how a rule ends up applied at two of the
 * three places that need it.</p>
 *
 * <p><b>Honest-client, and the Boundaries table says so.</b> Somebody who runs their own build or
 * reads their own keychain is outside this, and no client code changes that. What this provides is
 * that the product does not hand a person a button that breaks their company's policy, and that
 * pressing one anyway is refused with a reason rather than silently working.</p>
 *
 * <p>Pure, `vscode`-free.</p>
 */

/** Which exit is being attempted — only for the wording; the permission is one. */
export type Exit = 'export' | 'backup' | 'clone';

const WHAT: Record<Exit, string> = {
  export: 'Exporting',
  backup: 'Backing this account up to disk',
  clone: 'Cloning into another account',
};

/**
 * The refusal for this exit, or empty when it is allowed.
 *
 * <p><b>No policy document means allowed</b>, and that is not a hole: a window with no document is
 * a personal account or one whose server has never been reached, and personal accounts are not
 * subject to corporate rules — the epic's decision, and the reason `corpMode` exists. A CORPORATE
 * account whose document could not be read is a different case and is already handled upstream:
 * `afterPolicyFetch` substitutes {@link MOST_RESTRICTIVE_POLICY}, whose `export` is `false`, so it
 * arrives here as a refusal rather than as an absence.</p>
 */
export function refuseExit(state: CorpPolicyState | undefined, exit: Exit): string {
  if (state === undefined || !state.corpMode || state.policy.export) {
    return '';
  }
  return `${WHAT[exit]} is not allowed for your role on this server (${state.role}). `
    + 'A colleague who may export can do it, or an administrator can change your role.';
}

/**
 * <b>There is no clone gate, deliberately.</b> The permission covers "clone into ANOTHER account",
 * and this product has no such operation: `credSshManager.cloneNode` copies within one account, and
 * the drag-and-drop handler moves within `payload.accountId`. A `refuseClone` was written here and
 * the code round pointed out it had no caller — a function that claims to enforce a rule and never
 * runs is worse than none, because the next reader believes the rule is covered. When epic 3 adds a
 * cross-account move, the gate belongs at that call site, and `refuseExit(state, 'clone')` is
 * already the sentence for it.
 */
