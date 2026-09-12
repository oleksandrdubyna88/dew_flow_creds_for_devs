import { CorpPolicyFacts, CorpPolicyState, afterPolicyFetch, factsOf } from './corpPolicy';
import { ReleaseMemo } from './githubReleases';
import { BackupStatus } from './orgBackupClient';
import { MemberListEntry, OrgMembersClient, ProjectRow } from './orgMembersClient';
import { MetricsProbe, ServerRead } from './orgRecoveryClient';
import { StoredAccount } from './types';

/** As much of the recovery client as the Server section's refresh needs. */
export interface MetricsReader {
  probeMetrics(account: StoredAccount): Promise<MetricsProbe>;
}

/**
 * What the tree's Server section adds to this loop: a reader, two caches, and the release memo.
 *
 * <p>It rides the readiness cycle rather than owning a timer, for the reason `backupWatch.ts`
 * argues for its own half: the cycle runs on activation, after every unlock and lock, and after the
 * commands that call it — it is not periodic, so the cost is bounded by what a person does.</p>
 *
 * <p>Optional on the host, so every test of the policy loop that predates the section still builds
 * one with four maps and nothing else.</p>
 */
export interface ServerSectionHost {
  /** The metrics reader for this account's server — nothing for a folder or a git remote. */
  readonly readerFor: (account: StoredAccount) => MetricsReader | undefined;
  readonly metrics: Map<string, ServerRead>;
  /** Filled by the backup watch, dropped here — one section, one lifetime for its answers. */
  readonly backup: Map<string, BackupStatus>;
  /** ONE remembered answer for the window, not one per account: the repository is the same. */
  release: ReleaseMemo | undefined;
  /** The published-release check, as an argument so a test drives it without a network. */
  readonly published: (memo: ReleaseMemo | undefined, now: number) => Promise<ReleaseMemo>;
}

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
   * The projects this account's server knows, by account — what turns an id on somebody's
   * record into a name a person recognises. Beside the roster because it has the same life: one
   * corporate answer per account, dropped together when the account is repointed.
   */
  readonly orgProjects: Map<string, readonly ProjectRow[]>;
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
  /** The tree's Server section, when the caller has one. Absent = nothing to refresh. */
  readonly server?: ServerSectionHost;
  readonly now: () => number;
}

/**
 * The Server section's state, as the tree provider holds it.
 *
 * <p>One object rather than three fields on the provider, because all three have exactly one
 * lifetime and are handed to this refresh together — and because `treeDataProvider.ts` sits at its
 * 800-line ceiling, where three documented caches do not fit.</p>
 *
 * <p>The two callbacks are filled by the `vscode` wiring. Until they are, the section simply never
 * refreshes, which is what a test that builds a bare provider wants.</p>
 */
export class ServerSection implements ServerSectionHost {
  readonly metrics = new Map<string, ServerRead>();

  readonly backup = new Map<string, BackupStatus>();

  release: ReleaseMemo | undefined;

  readerFor: (account: StoredAccount) => MetricsReader | undefined = () => undefined;

  published: (memo: ReleaseMemo | undefined, now: number) => Promise<ReleaseMemo> =
    (memo) => Promise.resolve(memo ?? { version: '', at: 0 });
}

/**
 * What a refresh managed. It never throws, so a caller that needs to know — the role command, which
 * has just written and wants the tree to agree — cannot learn it from an exception.
 */
export interface RefreshOutcome {
  readonly policyRead: boolean;
  readonly rosterRead: boolean;
  /** Whether the project list was read this time. A failure keeps the last one — see below. */
  readonly projectsRead: boolean;
}

/**
 * Assemble the host from the pieces the `vscode` layer holds.
 *
 * <p>Typed structurally rather than against the tree provider and the extension context, so this
 * module still imports no `vscode` — and so `extension.ts` spells the wiring once instead of
 * carrying a literal that grows a field per epic.</p>
 */
export function policyHost(
  caches: Pick<OrgPolicyHost, 'orgPolicy' | 'orgRoster' | 'orgProjects' | 'orgPolicyServer'>
    & { readonly server?: ServerSectionHost },
  clientFor: (account: StoredAccount) => OrgMembersClient | undefined,
  heartbeat: (accountId: string, at: number) => PromiseLike<void>,
  now: () => number = Date.now,
  afterRead?: (account: StoredAccount, state: CorpPolicyState) => PromiseLike<unknown>,
): OrgPolicyHost {
  return {
    clientFor,
    orgPolicy: caches.orgPolicy,
    orgRoster: caches.orgRoster,
    orgProjects: caches.orgProjects,
    orgPolicyServer: caches.orgPolicyServer,
    server: caches.server,
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
    host.orgProjects.delete(id);
    host.orgPolicyServer.delete(id);
    return { policyRead: false, rosterRead: false, projectsRead: false };
  }
  // An account repointed at another corporate server keeps its id, so the id alone would let the
  // previous server's role survive a failed first read against the new one — and the tree would
  // offer management actions there on an authority nobody granted. The location is part of what a
  // cached answer IS, so a change to it drops the answer before anything is asked.
  forgetAnswersFromAnotherServer(host, id, client.location);
  const fetched = await readFacts(client, account, host.now).catch(() => undefined);
  const next = afterPolicyFetch(host.orgPolicy.get(id), fetched);
  if (next === undefined || fetched === undefined) {
    return { policyRead: false, rosterRead: false, projectsRead: false }; // could not ask: everything stays as it was
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
  await refreshServerMetrics(host, account, next.isAdmin);
  const projectsRead = await refreshProjects(host, client, account);
  return { policyRead: true, rosterRead, projectsRead };
}

/**
 * What the tree's Server section draws, refreshed on the same cycle.
 *
 * <p><b>Administrators only</b>, exactly as the roster above and the backup watch are: `/api/metrics`
 * is `RequireAdminAsync`, so a developer's poll would be refused every cycle and the only thing that
 * refusal could do is put a warning row in front of somebody who cannot act on it. A developer's
 * window therefore makes no outbound metrics request at all.</p>
 *
 * <p><b>A demotion takes the cached facts with the section.</b> Both entries go, because a version
 * and a backup state drawn from a server this window may no longer read are stale facts rendered as
 * current ones — the same reading `refreshRoster` makes about colleagues' roles.</p>
 *
 * <p>It never throws: a throw here would break the repaint that draws every other row.</p>
 */
export async function refreshServerMetrics(
  host: OrgPolicyHost,
  account: StoredAccount,
  isAdmin: boolean,
): Promise<boolean> {
  const server = host.server;
  if (server === undefined) {
    return false;
  }
  const reader = isAdmin ? server.readerFor(account) : undefined;
  if (reader === undefined) {
    server.metrics.delete(account.accountId);
    server.backup.delete(account.accountId);
    return false;
  }
  const probe = await reader.probeMetrics(account).catch(unreachable);
  const at = host.now();
  server.metrics.set(account.accountId, nextRead(server.metrics.get(account.accountId), probe, at));
  // One memo for the window: the repository is the same for everybody, and the check is TTL'd.
  server.release = await server.published(server.release, at).catch(() => server.release);
  return true;
}

/** Offline, a refused proxy, a timeout — all of them are a server this section could not read. */
function unreachable(): MetricsProbe {
  return { failure: 'unreachable' };
}

/**
 * A failure KEEPS the last document and records itself; a success replaces both.
 *
 * <p>This is the whole reason the cache holds an envelope: the version and the footprint must stay
 * readable while the scope row says the answer is old, and a row that succeeded once must not look
 * healthy for ever after the next refusal.</p>
 */
function nextRead(previous: ServerRead | undefined, probe: MetricsProbe, at: number): ServerRead {
  return 'metrics' in probe
    ? { value: probe.metrics, at }
    : { value: previous?.value, failure: probe.failure, at };
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
  host.orgProjects.delete(id);
  // The Server section's answers are about the server, so they are the LEAST survivable of all:
  // a version and a backup state from the deployment this account has left would be drawn as this
  // one's, and nothing on the row would say otherwise.
  host.server?.metrics.delete(id);
  host.server?.backup.delete(id);
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

/**
 * The projects this account's server knows, for naming the ids on people's records.
 *
 * <p><b>A read that fails keeps the last list</b>, exactly as the policy document does one function
 * above, and never throws into the readiness loop: a row that suddenly stopped naming the projects
 * it named a minute ago would be a worse answer than a slightly old one, and the names are a
 * label — nothing decides on them. Every caller may ask: a developer is answered with their own
 * projects, which is what their rows need.</p>
 */
async function refreshProjects(
  host: OrgPolicyHost,
  client: OrgMembersClient,
  account: StoredAccount,
): Promise<boolean> {
  const rows = await client.listProjects(account).catch(() => undefined);
  if (rows === undefined) {
    return false;
  }
  host.orgProjects.set(account.accountId, rows);
  return true;
}
