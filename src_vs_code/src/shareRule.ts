import { CorpPolicyState } from './corpPolicy';

/**
 * What the client knows about one prospective share.
 *
 * <p>Every field is something the window already holds — the policy document it fetches each cycle,
 * the tree it draws, the roster the picker is built from. Nothing here is fetched for this decision,
 * which is what keeps the check synchronous and the picker instant.</p>
 *
 * @property policy this account's corporate policy; `undefined` means no corporate document has ever
 *   been seen for it — a personal account, or one whose server has never been reached. It is NOT
 *   "the fetch failed": a corporate account whose document could not be read keeps its previous
 *   state, or is given the most restrictive one (`afterPolicyFetch`).
 * @property entityProjectId the project folder the entity sits under, when it sits under one.
 * @property recipientProjectIds the recipient's projects, from the widened team row — `undefined`
 *   when the row does not carry them (an older server, or a client that claimed no contract).
 */
export interface ClientShareFacts {
  readonly policy?: CorpPolicyState;
  readonly entityProjectId?: string;
  readonly recipientProjectIds?: readonly string[];
}

/**
 * The refusal to show, or empty when this share may be offered and attempted.
 *
 * <p><b>This is not a boundary.</b> The server's `ShareRule` is, and it decides again on every
 * request. This exists so a developer is not offered a recipient the server will refuse, and so a
 * share that cannot succeed fails before a PIN is typed rather than after — the difference between
 * a sentence that says what to do and a refusal that arrives as a failed delivery.</p>
 *
 * <p><b>It refuses only on facts it positively holds.</b> An absent recipient project list is not a
 * refusal: hiding a colleague who is in fact a valid recipient is a worse failure than showing one
 * the server will then refuse with its own sentence. The one thing the client can know for certain
 * is where the entity sits in its own tree, and that is the check with teeth.</p>
 *
 * <p><b>It does not check whether the project is archived.</b> The client cannot know: the policy
 * document carries the person's ASSIGNMENTS, with no lifecycle on them, and knowing more would mean
 * a second fetch on the share path. A closed engagement is refused by the server, which is the half
 * that has the fact.</p>
 */
export function refuseShare(facts: ClientShareFacts): string {
  if (!fenced(facts.policy)) {
    return '';
  }
  return outsideAProject(facts) || recipientOffTheProject(facts);
}

/**
 * Whether this account's role is fenced at all.
 *
 * <p>Read from the policy document rather than from a second reading of the role, for the reason
 * `PolicyDto` records: a stored copy of a rule is a second source of truth. A member, an admin and
 * an officer share as they always did — the epic's decision 9 — so only a developer reaches the
 * checks below.</p>
 */
function fenced(policy?: CorpPolicyState): boolean {
  return policy !== undefined && policy.corpMode && policy.role === 'dev';
}

/** A developer may share only what is inside a project folder. */
function outsideAProject(facts: ClientShareFacts): string {
  return blank(facts.entityProjectId)
    ? 'Your role on this server allows sharing only from inside a project folder. Move the entry into '
      + 'one, or ask an administrator to put you on the project it belongs to.'
    : '';
}

/**
 * The recipient has to be on the same project — when the client can see that they are not.
 *
 * <p>Silent when the row carries no project list at all: that is an older server or a client that
 * claimed no contract, and refusing on an absence would block a share the server would accept.</p>
 */
function recipientOffTheProject(facts: ClientShareFacts): string {
  const theirs = facts.recipientProjectIds;
  if (theirs === undefined || theirs.includes(facts.entityProjectId ?? '')) {
    return '';
  }
  return 'That colleague is not on this project, so the server would refuse the share. An '
    + 'administrator can add them to it.';
}

function blank(value?: string): boolean {
  return value === undefined || value.trim().length === 0;
}
