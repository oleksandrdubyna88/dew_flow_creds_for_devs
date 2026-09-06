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
  /**
   * Persist the time of a successful read. Epic 2 reads it back as the offline lease's
   * heartbeat, which is why it lives outside the process and is written only on success.
   */
  heartbeat: (accountId: string, at: number) => PromiseLike<void>;
  readonly now: () => number;
}

export async function refreshOrgPolicy(host: OrgPolicyHost, account: StoredAccount): Promise<void> {
  const id = account.accountId;
  const client = host.clientFor(account);
  if (client === undefined) {
    // No server, no policy — and a policy kept from a location the account has left would be
    // a stale fact drawn as a current one.
    host.orgPolicy.delete(id);
    host.orgRoster.delete(id);
    return;
  }
  const fetched = await readFacts(client, account, host.now).catch(() => undefined);
  const next = afterPolicyFetch(host.orgPolicy.get(id), fetched);
  if (next === undefined || fetched === undefined) {
    return; // could not ask: everything stays exactly as it was
  }
  host.orgPolicy.set(id, next);
  await Promise.resolve(host.heartbeat(id, next.fetchedAt)).then(undefined, () => undefined);
  await refreshRoster(host, client, account, next.isAdmin);
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
): Promise<void> {
  if (!isAdmin) {
    host.orgRoster.delete(account.accountId);
    return;
  }
  const rows = await client.listMembers(account).catch(() => undefined);
  if (rows !== undefined) {
    host.orgRoster.set(account.accountId, rows);
  }
}
