import { MemberListEntry, MemberSelf, PendingFolderRemoval, ProjectAssignment } from './orgMembersClient';
import { hasShape } from './shapeGuard';

/**
 * What the extension makes of the role-and-policy document — the decision layer between
 * `GET /api/org/me` and everything that shows or gates on it.
 *
 * <p>Pure, so every rule here is a unit test rather than a hopeful comment in a `vscode`-bound
 * file, exactly as `orgRecoveryAccess.ts` is. Nothing in this module ENFORCES anything: the
 * policy is what an honest client obeys, and the obeying — refusing an export, stripping a wrap —
 * lands in epic 2. What lives here is what the tree and the commands need to decide what to
 * show.</p>
 *
 * <p>Two rules worth carrying in the head:</p>
 * <ul>
 * <li><b>The client TRUSTS the server's `policy` and never re-derives it from the role.</b> The
 * server derives it; a second implementation of the same rule would drift the day either side
 * changed, and the two would disagree with nothing to say so. The role is for the UI alone — the
 * row's description, the page's first sentence.</li>
 * <li><b>The admin predicate is `role === 'admin' || isOfficer`, never the role alone.</b> The
 * server's `RequireAdmin` admits an officer unconditionally, and an officer cannot be given a
 * registry role (that is the server's 409), so gating on the role would show the CTO no
 * management actions while the server served every one of them.</li>
 * </ul>
 */

/** The server's policy document. `share` is `any` | `project` | `none`. */
export interface PolicyDoc {
  readonly export: boolean;
  readonly share: string;
  readonly moveOutOfProject: boolean;
}

/**
 * What a document with no usable policy amounts to. The one case where the client fills in, and
 * it fills in DOWN: guessing "everything" would hand a developer an export on a parse error.
 */
export const MOST_RESTRICTIVE_POLICY: PolicyDoc = { export: false, share: 'none', moveOutOfProject: false };

export function isPolicyDoc(value: unknown): value is PolicyDoc {
  return hasShape(value, { export: 'boolean', share: 'string', moveOutOfProject: 'boolean' });
}

/** The document's facts, plus when they were fetched. */
export interface CorpPolicyFacts {
  readonly corpMode: boolean;
  readonly role: string;
  readonly isOfficer: boolean;
  readonly active: boolean;
  readonly policy: unknown;
  readonly projects: readonly ProjectAssignment[];
  readonly pendingFolderRemovals: readonly PendingFolderRemoval[];
  readonly offlineLeaseHours: number;
  readonly fetchedAt: number;
}

/** What the tree, the commands and the page read. */
export interface CorpPolicyState {
  readonly corpMode: boolean;
  /** As the server said it — an unknown role from a newer server is shown, not renamed. */
  readonly role: string;
  readonly isOfficer: boolean;
  /** The predicate above, evaluated once so no caller re-spells it. */
  readonly isAdmin: boolean;
  readonly active: boolean;
  readonly policy: PolicyDoc;
  /**
   * Whether the policy above is the server's own answer or this build's fallback. A flag rather than
   * comparing the value to {@link MOST_RESTRICTIVE_POLICY} later: identity works today, and it is the
   * kind of subtlety that breaks the first time somebody copies the object — while the two states it
   * separates must never blur, because one is a decision a company made about a person and the other
   * is this build and this server disagreeing about a shape.
   */
  readonly policyFromServer: boolean;
  readonly projects: readonly ProjectAssignment[];
  /**
   * What the server is still waiting for this person's client to carry out — epic 3's folder
   * removals. Carried on the state rather than fetched again: it arrives in the same document the
   * policy does, and a second read would be a second answer to disagree with.
   */
  readonly pendingFolderRemovals: readonly PendingFolderRemoval[];
  /** Hours; `0` is strictly online. */
  readonly leaseHours: number;
  /** When the document was read — the offline lease's heartbeat (epic 2 reads it). */
  readonly fetchedAt: number;
}

/** The facts from the wire document, stamped with the time of the read. */
/**
 * The removals this build can act on.
 *
 * <p>Filtered rather than trusted whole, for the reason every guard here exists: an entry a newer
 * server invented, or one a foreign build wrote, would otherwise reach the reconcile as a project
 * id of the wrong type — and the reconcile derives a NODE ID from it and deletes what that names.
 * A row it cannot read is dropped, never guessed at.</p>
 */
function readableRemovals(rows: readonly PendingFolderRemoval[]): readonly PendingFolderRemoval[] {
  return rows.filter(
    (r) => typeof r?.projectId === 'string' && r.projectId.length > 0 && typeof r.deleteFolder === 'boolean',
  );
}

export function factsOf(me: MemberSelf, fetchedAt: number): CorpPolicyFacts {
  return {
    corpMode: me.corpMode,
    role: me.role,
    isOfficer: me.isOfficer,
    active: me.active,
    policy: me.policy,
    projects: me.projects,
    pendingFolderRemovals: readableRemovals(me.pendingFolderRemovals),
    offlineLeaseHours: me.offlineLeaseHours,
    fetchedAt,
  };
}

export function corpPolicy(facts: CorpPolicyFacts): CorpPolicyState {
  return {
    corpMode: facts.corpMode,
    role: facts.role,
    isOfficer: facts.isOfficer,
    isAdmin: isCorpAdmin(facts),
    active: facts.active,
    policy: isPolicyDoc(facts.policy) ? facts.policy : MOST_RESTRICTIVE_POLICY,
    policyFromServer: isPolicyDoc(facts.policy),
    projects: facts.projects,
    pendingFolderRemovals: facts.pendingFolderRemovals,
    // A negative or non-numeric lease is not a lease; strictly online is the restrictive reading.
    leaseHours: facts.offlineLeaseHours >= 0 ? facts.offlineLeaseHours : 0,
    fetchedAt: facts.fetchedAt,
  };
}

/**
 * Who gets the management actions. Absent means "no document yet", which resolves to no —
 * a command missing for a cycle is a smaller fault than one an ordinary member can see.
 */
export function isCorpAdmin(state: { readonly role: string; readonly isOfficer: boolean } | undefined): boolean {
  return state !== undefined && (state.role === 'admin' || state.isOfficer);
}

/**
 * The next cached answer after a fetch. A failed fetch (`undefined`) KEEPS the previous answer —
 * the org-escrow rule "not knowing changes nothing": an unreachable server for one cycle must not
 * demote an admin in the tree or hand a developer the member's view, and the heartbeat does not
 * advance, because a heartbeat written on a failure is a lie the lease would later believe.
 */
export function afterPolicyFetch(
  previous: CorpPolicyState | undefined,
  fetched: CorpPolicyFacts | undefined,
): CorpPolicyState | undefined {
  return fetched === undefined ? previous : corpPolicy(fetched);
}

/** Where the success time is kept, per account, in the style of `syncReminder.lastOk`. */
export function policyHeartbeatKey(accountId: string): string {
  return `orgPolicy.lastOk.${accountId}`;
}

/**
 * The word a row shows. An officer reads as `officer`, never as the registry's `member`: a list
 * that showed the CTO as a plain member would invite exactly the edit the server refuses.
 */
export function roleLabel(role: string, isOfficer: boolean): string {
  return isOfficer ? 'officer' : role;
}

/**
 * The role a Team row can honestly show.
 *
 * <p>An admin's window holds the roster, so every colleague has a word. A member's window does
 * not — `GET /api/org/members` is the admin's — so the only role it knows is its own, from
 * `/api/org/me`, and that goes on the "(you)" row alone. Inventing one for a colleague would be a
 * guess drawn as a fact. On a personal server nobody has a role to show.</p>
 */
export function teamRowRole(
  member: { readonly email: string; readonly isSelf: boolean },
  viewer: CorpPolicyState | undefined,
  roster: readonly MemberListEntry[] | undefined,
): string | undefined {
  return rosterRole(member.email, roster) ?? ownRole(member.isSelf, viewer);
}

/** The roster's word for this address, matched without regard to case or surrounding space. */
function rosterRole(email: string, roster: readonly MemberListEntry[] | undefined): string | undefined {
  const wanted = email.trim().toLowerCase();
  const listed = roster?.find((row) => row.email.trim().toLowerCase() === wanted);
  return listed === undefined ? undefined : roleLabel(listed.role, listed.isOfficer);
}

/** The viewer's own role — on their own row only, and only where roles exist at all. */
function ownRole(isSelf: boolean, viewer: CorpPolicyState | undefined): string | undefined {
  return isSelf && viewer?.corpMode === true ? roleLabel(viewer.role, viewer.isOfficer) : undefined;
}

/**
 * `microsoft` for an ordinary account; `microsoft · dev` when there is a role; and from epic 3
 * `microsoft · dev · Atlas, Borealis` when the viewer may see which projects they are on.
 *
 * <p><b>Three names, then a count.</b> A contractor on nine projects would push the email out of
 * the row otherwise, and the email is what the row is FOR.</p>
 *
 * <p><b>An id the project list cannot name is counted but not named.</b> The count must stay true:
 * nine projects with one unnamed reads as three names and `+6`, never `+5` — a row must not tell
 * somebody they are on fewer projects than they are. An unnamed id happens while a list is still
 * being read, and on a project archived out from under a cached answer.</p>
 *
 * <p>`undefined` projects means the server was not asked or did not say (an older server, a caller
 * claiming no contract); an empty list means it said 'none'. Neither draws anything: there is
 * nothing to name in either case.</p>
 */
export function teamMemberDescription(
  provider: string,
  role: string | undefined,
  projects: readonly string[] = [],
): string {
  return [provider, role, projectSummary(projects)].filter((part) => part !== undefined && part !== '').join(' · ');
}

/** The most names a row can carry before it stops being a row about a person. */
const MAX_NAMED_PROJECTS = 3;

/** The names, then what is left as a count — including the ids nothing could name. */
function projectSummary(projects: readonly string[]): string {
  const named = projects.filter((name) => name !== '');
  const shown = named.slice(0, MAX_NAMED_PROJECTS);
  const rest = projects.length - shown.length;
  if (shown.length === 0) {
    return rest === 0 ? '' : `${rest} projects`;
  }
  return rest === 0 ? shown.join(', ') : `${shown.join(', ')} +${rest}`;
}

/** The lease in words. `0` is the legal strictly-online, not a missing value. */
export function describeLease(hours: number): string {
  return hours === 0
    ? 'strictly online — no offline grace between two successful logins'
    : `${hours} hours offline before a corporate developer account locks`;
}
