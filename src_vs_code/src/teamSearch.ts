import { CorpPolicyState, teamRowRole } from './corpPolicy';
import { matchesTerms } from './treeSearch';
import { MemberListEntry, ProjectRow } from './orgMembersClient';
import { TeamMember } from './types';

/**
 * What the tree's filter looks in when it is filtering Team rows.
 *
 * <p>The filter used to match a colleague's EMAIL and nothing else, while the row beside it showed
 * the provider, the role and up to three project names. So typing `atlas` — a project name visible
 * on screen — matched nobody, and typing `dev` matched only people whose address happened to
 * contain it. A filter that cannot find what the row is showing teaches people the filter is
 * broken.</p>
 *
 * <p><b>What it searches is what the row's DATA says about a colleague</b>, not what the row had
 * room to render: a person on nine projects renders three names and a count, and all nine are
 * searchable. The truncation is a rendering limit, not a boundary — the server already decided what
 * this viewer may know about that colleague, and for a developer it narrows the list to the
 * projects they share. Searching hidden text would be wrong only if the text were hidden ON
 * PURPOSE, and here it is hidden for space.</p>
 *
 * <p>Pure and `vscode`-free, so the rule is a unit test.</p>
 */

export interface TeamHaystackFacts {
  readonly email: string;
  /** The sign-in provider the row shows beside the address. */
  readonly provider?: string;
  /** The role the row renders — absent when this viewer is not told one. */
  readonly role?: string;
  /** The project NAMES the row resolved; an id it could not name contributes nothing. */
  readonly projectNames?: readonly (string | undefined)[];
}

/**
 * One lowercased string to look in, fields separated by a space.
 *
 * <p>Separated rather than concatenated: `alice@corp.comadmin` would match a term that spans two
 * fields and belongs to neither. Absent and empty fields are dropped rather than joined as blanks,
 * so a colleague with no role and no projects yields exactly their address.</p>
 */
export function teamMemberHaystack(facts: TeamHaystackFacts): string {
  return [facts.email, facts.provider, facts.role, ...(facts.projectNames ?? [])]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .join(' ')
    .toLowerCase();
}

/**
 * The same string, assembled from what a Team ROW is built from — so the filter and the row read
 * the same two maps and cannot disagree about who a colleague is.
 *
 * <p>Here rather than in `treeDataProvider.ts` for the reason `teamItems.ts` exists: that file sits
 * at the 800-line ceiling, and a function that decides text and touches no `vscode` belongs on this
 * side of the line, where it is a unit test.</p>
 */
export function teamRowHaystack(input: {
  readonly member: TeamMember;
  readonly viewer: CorpPolicyState | undefined;
  readonly roster: readonly MemberListEntry[] | undefined;
  /** Project id to name, built ONCE per filter — see `matchingTeamMembers`. */
  readonly byId: ReadonlyMap<string, string>;
}): string {
  const { byId } = input;
  return teamMemberHaystack({
    email: input.member.account.email,
    provider: input.member.account.provider,
    role: teamRowRole(
      { email: input.member.account.email, isSelf: input.member.isSelf },
      input.viewer,
      input.roster,
    ),
    projectNames: (input.member.projectIds ?? []).map((id) => byId.get(id)),
  });
}

/**
 * The colleagues a filter leaves standing.
 *
 * <p>The whole step, not only the haystack, because `treeDataProvider.ts` sits at its 800-line
 * ceiling and this decides text and touches no `vscode` — the same reason `teamItems.ts` holds the
 * rows themselves. An empty filter keeps everybody, which is what `matchesTerms` already says.</p>
 */
export function matchingTeamMembers(
  members: readonly TeamMember[],
  terms: readonly string[],
  context: {
    readonly viewer: CorpPolicyState | undefined;
    readonly roster: readonly MemberListEntry[] | undefined;
    readonly projects: readonly ProjectRow[] | undefined;
  },
): readonly TeamMember[] {
  // The id-to-name map is built ONCE for the whole filter, not once per colleague: this runs on
  // every keystroke, and a domain of 500 people against 200 projects would otherwise be 100,000
  // map insertions per character, on the thread that draws the tree.
  const byId = new Map((context.projects ?? []).map((project) => [project.id, project.name]));
  return members.filter((member) => matchesTerms(
    teamRowHaystack({ member, viewer: context.viewer, roster: context.roster, byId }),
    terms,
  ));
}
