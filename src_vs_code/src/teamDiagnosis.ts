/**
 * Why the team came back empty — because "empty" and "refused" look identical
 * and only one of them is somebody's fault.
 *
 * <p>The symptom this exists for, seen in the field: developers signed in, set
 * the server URL, pressed Sync, saw no error, and never appeared in each other's
 * Team. The server had been answering 401 the whole time. `listTeam` did
 * `continue` on a non-OK response and returned `[]`, and an empty list from a
 * refusal is indistinguishable from an empty list because nobody has synced yet.
 * A silent failure is worse than a loud one precisely because it looks like a
 * working system with nothing in it.</p>
 *
 * <p>Pure, so the wording — which is the entire deliverable here — is a test.</p>
 */

export interface TeamFailure {
  /** HTTP status the server answered with, or undefined if it never answered. */
  status?: number;
  /** Whether `credSshManager.microsoftApiScope` is configured. */
  hasApiScope: boolean;
  provider: string;
}

/**
 * The sentence a person can act on.
 *
 * <p>401 with Microsoft and no configured API scope is not a guess — it is the
 * one failure this product reliably produces on its own: without the scope the
 * extension asks for `user.read`, which mints a <b>Graph</b> token, and Microsoft
 * deliberately makes those unverifiable by third parties. No server can ever
 * accept one. So that case gets named exactly, and everything else gets an honest
 * "here is the status, here is where to look".</p>
 */
export function diagnoseTeamFailure(failure: TeamFailure): string {
  if (failure.status === undefined) {
    return 'The vault server did not answer. Check the URL in Set Sync Location… and that the server is reachable from this machine.';
  }
  if (failure.status === 401 || failure.status === 403) {
    if (failure.provider === 'microsoft' && !failure.hasApiScope) {
      return (
        `The vault server refused this sign-in (${failure.status}). ` +
        'Microsoft sign-in needs `credSshManager.microsoftApiScope` set to your ' +
        'Entra app registration’s API scope — something like ' +
        '`api://<client-id>/vault.access`. Without it the extension asks for a Graph ' +
        'token, which Microsoft makes impossible for any server to validate, so the ' +
        'server can only refuse it. Ask whoever runs the server for the value; it is ' +
        'the same one as MS_AUDIENCES there.'
      );
    }
    return (
      `The vault server refused this sign-in (${failure.status}). ` +
      'Either the token is for a different audience than the server accepts, or your ' +
      'email domain is not in its allowed list. Ask whoever runs the server.'
    );
  }
  if (failure.status === 429) {
    return 'The vault server is rate-limiting this client (429). Wait a moment and sync again.';
  }
  return `The vault server answered ${failure.status} when asked who is on the team. Nothing is wrong with your vault; the team list is simply unavailable.`;
}

/**
 * Whether a failure is worth interrupting somebody over.
 *
 * <p>A refusal is: it will never fix itself and the person cannot see it any
 * other way. A 429 or an unreachable server is not — those are transient, and a
 * modal for every hiccup is how people learn to dismiss modals.</p>
 */
export function teamFailureIsActionable(failure: TeamFailure): boolean {
  return failure.status === 401 || failure.status === 403;
}
