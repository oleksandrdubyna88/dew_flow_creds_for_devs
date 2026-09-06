import { CorpPolicyFacts, CorpPolicyState, afterPolicyFetch, factsOf } from './corpPolicy';
import { MemberListEntry, OrgMembersClient } from './orgMembersClient';
import { StoredAccount } from './types';

/**
 * The per-account refresh that fills the tree's `orgPolicy` and `orgRoster` caches — the
 * `vscode`-free half of what `extension.ts` runs in its readiness loop, beside `refreshOrgAccess`.
 *
 * <p>Out of `extension.ts` so its guarantees are tests: it never throws (a throw would break the
 * repaint that draws every other row), a failure keeps the previous answer, and only a success
 * advances the heartbeat. The `vscode` layer supplies the pieces it cannot know — the client
 * factory, the caches, and where the heartbeat is persisted.</p>
 */
export interface OrgPolicyHost {
  /** The members client for this account's server, or nothing for a folder or a git remote. */
  readonly clientFor: (account: StoredAccount) => OrgMembersClient | undefined;
  readonly orgPolicy: Map<string, CorpPolicyState>;
  readonly orgRoster: Map<string, readonly MemberListEntry[]>;
  /** Which server each cached answer came from, so a repointed account cannot keep the old one. */
  readonly orgPolicyServer: Map<string, string>;
  /**
   * Persist the time of a successful read. Epic 2 reads it back as the offline lease's
   * heartbeat, which is why it lives outside the process and is written only on success.
   */
  heartbeat: (accountId: string, at: number) => PromiseLike<void>;
  /**
   * What else a SUCCESSFUL read should set in motion — epic 3's project folders.
   *
   * <p>Here rather than at the caller's loop for the rule it enforces: a failed fetch keeps the
   * previous answer, and reading its absence as "you are on nothing" would unlock every project
   * folder on the machine. Hanging the work off the one place that knows a read succeeded makes
   * that structural instead of a condition somebody must remember to write.</p>
   */
  readonly afterRead?: (account: StoredAccount, state: CorpPolicyState) => PromiseLike<unknown>;
  readonly now: () => number;
}

/**
 * What a refresh managed. It never throws, so a caller that needs to know — the role command, which
 * has just written and wants the tree to agree — cannot learn it from an exception.
 */
export interface RefreshOutcome {
  readonly policyRead: boolean;
  readonly rosterRead: boolean;
}

/**
 * Assemble the host from the pieces the `vscode` layer holds.
 *
 * <p>Typed structurally rather than against the tree provider and the extension context, so this
 * module still imports no `vscode` — and so `extension.ts` spells the wiring once instead of
 * carrying a literal that grows a field per epic.</p>
 */
export function policyHost(
  caches: Pick<OrgPolicyHost, 'orgPolicy' | 'orgRoster' | 'orgPolicyServer'>,
  clientFor: (account: StoredAccount) => OrgMembersClient | undefined,
  heartbeat: (accountId: string, at: number) => PromiseLike<void>,
  now: () => number = Date.now,
  afterRead?: (account: StoredAccount, state: CorpPolicyState) => PromiseLike<unknown>,
): OrgPolicyHost {
  return {
    clientFor,
    orgPolicy: caches.orgPolicy,
    orgRoster: caches.orgRoster,
    orgPolicyServer: caches.orgPolicyServer,
    heartbeat,
    afterRead,
    now,
  };
}

export async function refreshOrgPolicy(host: OrgPolicyHost, account: StoredAccount): Promise<RefreshOutcome> {
  const id = account.accountId;
  const client = host.clientFor(account);
  if (client === undefined) {
    // No server, no policy — and a policy kept from a location the account has left would be
    // a stale fact drawn as a current one.
    host.orgPolicy.delete(id);
    host.orgRoster.delete(id);
    host.orgPolicyServer.delete(id);
    return { policyRead: false, rosterRead: false };
  }
  // An account repointed at another corporate server keeps its id, so the id alone would let the
  // previous server's role survive a failed first read against the new one — and the tree would
  // offer management actions there on an authority nobody granted. The location is part of what a
  // cached answer IS, so a change to it drops the answer before anything is asked.
  forgetAnswersFromAnotherServer(host, id, client.location);
  const fetched = await readFacts(client, account, host.now).catch(() => undefined);
  const next = afterPolicyFetch(host.orgPolicy.get(id), fetched);
  if (next === undefined || fetched === undefined) {
    return { policyRead: false, rosterRead: false }; // could not ask: everything stays as it was
  }
  host.orgPolicy.set(id, next);
  // Wrapped rather than awaited bare: `heartbeat` is somebody else's callback, and one that throws
  // SYNCHRONOUSLY would escape this function and take the readiness loop down with it — the one
  // thing this module promises not to do.
  await Promise.resolve()
    .then(() => host.heartbeat(id, next.fetchedAt))
    .then(undefined, () => undefined);
  // Wrapped for the reason the heartbeat above is: somebody else's callback, and one that threw
  // would take the readiness loop down with it — the one thing this module promises not to do.
  await Promise.resolve()
    .then(() => host.afterRead?.(account, next))
    .then(undefined, () => undefined);
  const rosterRead = await refreshRoster(host, client, account, next.isAdmin);
  return { policyRead: true, rosterRead };
}

/**
 * An account repointed at another corporate server keeps its id, so the id alone would let the
 * previous server's role survive a failed first read against the new one — and the tree would offer
 * management actions there on an authority nobody granted. The location is part of what a cached
 * answer IS, so a change to it drops the answer before anything is asked.
 */
function forgetAnswersFromAnotherServer(host: OrgPolicyHost, id: string, location: string): void {
  if (host.orgPolicyServer.get(id) === location) {
    return;
  }
  host.orgPolicy.delete(id);
  host.orgRoster.delete(id);
  host.orgPolicyServer.set(id, location);
}

function readFacts(client: OrgMembersClient, account: StoredAccount, now: () => number): Promise<CorpPolicyFacts> {
  return client.readMe(account).then((me) => factsOf(me, now()));
}

/**
 * The roster is the admin's alone: a member asking would be refused every cycle, and the only
 * thing that refusal could do is put a red message in front of an ordinary user. A roster that
 * cannot be read keeps the previous one; a viewer who stopped being an admin loses it, because
 * colleagues' roles drawn from a list this window may no longer read are stale facts.
 */
async function refreshRoster(
  host: OrgPolicyHost,
  client: OrgMembersClient,
  account: StoredAccount,
  isAdmin: boolean,
): Promise<boolean> {
  if (!isAdmin) {
    host.orgRoster.delete(account.accountId);
    return false;
  }
  const rows = await client.listMembers(account).catch(() => undefined);
  if (rows === undefined) {
    return false;
  }
  host.orgRoster.set(account.accountId, rows);
  return true;
}
