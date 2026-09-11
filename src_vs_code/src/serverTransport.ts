import {
  CLIENT_CONTRACT_VERSION,
  CONTRACT_HEADER,
  SHARE_FORMAT_CONTRACT,
  UPGRADE_REQUIRED,
  serverAheadMessage,
  serverContractFrom,
  serverIsAhead,
  tooOldMessage,
} from './contractVersion';
import { describeError } from './describeError';
import {
  OwnedShare,
  SentShare,
  ShareItem,
  StoredAccount,
  TeamMember,
  isSentShare,
  isShareItem,
} from './types';
import { ShareOutcome, VaultTransport } from './vaultTransport';

/**
 * Talks to the Cred Vault Server (see `cred-vault-server/`): an
 * authenticated, zero-knowledge blob store. Every request carries the
 * account's own OAuth token, and the server derives the caller's identity
 * from it — so a client can only read its own vault and inbox.
 *
 * Shares are bound to the recipient's EMAIL here (the server exposes emails,
 * not provider account ids).
 */
/**
 * How long any single call to the vault server may take before we give up.
 *
 * `fetch` has no timeout of its own: a server that accepts the connection and then
 * stops answering leaves the promise pending forever, and because auto-sync awaits
 * it under a "one cycle at a time" guard, one wedged request stops the extension
 * syncing for the rest of the window's life with nothing on screen to say so.
 * Generous enough for an 8 MiB vault over a slow VPN, finite in every case.
 */
export const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

/**
 * The headers every request carries: who we are, what we speak, and what we are sending.
 *
 * <p>The contract version costs one header and buys the ability to be TOLD we are too old,
 * rather than misreading a response one day and calling it a sync failure. See
 * `contractVersion.ts` for why it exists before anything is broken.</p>
 */
function requestHeaders(init: RequestInit & { rawBody?: string }, token: string): Headers {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  headers.set(CONTRACT_HEADER, String(CLIENT_CONTRACT_VERSION));
  if (init.rawBody !== undefined) {
    headers.set('Content-Type', 'application/octet-stream');
  } else if (init.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  return headers;
}

/** How much of a refusal body is worth quoting — a proxy can answer a page of HTML. */
const REFUSAL_QUOTE_LIMIT = 300;

/**
 * What a refused request should say to the person who made it.
 *
 * <p>The server's own sentence when it sent one, and the bare status when it did not. A corporate
 * server refuses a share for reasons the sender can act on — the recipient's account was
 * deactivated, or their record cannot be read right now — and `HTTP 403` alone throws away the
 * only part that tells them what to do next. Truncated, because the answer may come from a proxy
 * rather than from us.</p>
 */
async function refusalDetail(response: Response): Promise<string> {
  const body = (await response.text().catch(() => '')).trim().slice(0, REFUSAL_QUOTE_LIMIT);
  return body.length > 0 ? `${body} (HTTP ${response.status})` : `HTTP ${response.status}.`;
}

/** The header a corporate server sets when the CALLER's own account is the reason for a 403. */
const REASON_HEADER = 'X-Creds-Reason';

/** Its one value today: an administrator set this account to inactive. */
const ACCOUNT_DEACTIVATED = 'account-deactivated';

/**
 * What a 403 means, in the sender's own words rather than ours.
 *
 * <p>Three different refusals arrive with this status and they need three different sentences. The
 * header marks the one that is about the CALLER — an administrator deactivated their account — and it
 * is a header precisely so a client need not match English. Otherwise the server's body carries the
 * reason, and it may be about somebody ELSE: a share addressed to a colleague who was blocked is
 * refused with a sentence about the recipient, so the message must not name the caller as the refused
 * party. Only when there is no header and no body do we fall back to the old guess, which was being
 * printed for every one of these cases before — telling a sender their domain was wrong when the truth
 * was that their colleague had been deactivated.</p>
 */
async function refusedMessage(account: StoredAccount, location: string, response: Response): Promise<string> {
  if (response.headers.get(REASON_HEADER) === ACCOUNT_DEACTIVATED) {
    return `${account.email} has been deactivated by an administrator on ${location} (403). Ask an administrator to re-activate the account.`;
  }
  const said = (await response.text().catch(() => '')).trim().slice(0, REFUSAL_QUOTE_LIMIT);
  return said.length > 0
    ? `Vault server refused the request (403): ${said}`
    : `Vault server refused ${account.email} (403) — outside the allowed domain, or not permitted.`;
}

/**
 * The server had no vault for this account when we last looked.
 *
 * <p>A precondition, not an absence of one: `If-None-Match: *` asks the server to accept the
 * write only if it is still the FIRST. The state the audit found missing — see `versions`.</p>
 */
const ABSENT = Symbol('the server had no vault when we last looked');

/**
 * The server refused this client's last write, so nothing may be written until it reads again.
 *
 * <p>Distinct from knowing nothing, and that distinction is the whole point: "nothing known"
 * writes unconditionally, which after a 412 is precisely the overwrite that was just refused.</p>
 */
const MUST_REREAD = Symbol('the last write was refused; re-read before writing again');

type KnownVersion = string | typeof ABSENT | typeof MUST_REREAD;

/** What the write may honestly claim, given what this client last learned. */
function preconditionFor(known: KnownVersion | undefined): Record<string, string> | undefined {
  if (known === undefined || known === MUST_REREAD) {
    return undefined;
  }
  return known === ABSENT ? { 'If-None-Match': '*' } : { 'If-Match': known };
}

export class ServerTransport implements VaultTransport {
  /**
   * The status behind the last empty team, if any.
   *
   * <p>A refusal and "nobody has synced yet" both produce an empty list, and only
   * one of them is somebody's fault. Developers spent a day on that ambiguity:
   * signed in, URL set, Sync pressed, no error, never appeared in each other's
   * team — the server had been answering 401 throughout.</p>
   */
  lastTeamStatus: number | undefined;

  readonly kind = 'server' as const;
  readonly embedsShares = false;

  /**
   * What this client last learned about each account's vault on the server, so a write can
   * state it. Kept per transport instance, which TransportFactory caches per location — so a
   * sync cycle that reads and then writes uses what its own read found.
   *
   * <p>Four states, and three of them are a precondition:</p>
   * <ul>
   *   <li>a <b>version string</b> — we read a vault; write it only if it is still that one;</li>
   *   <li><b>{@link ABSENT}</b> — we read and there was NO vault; write it only if that is still
   *     true. This is the state the audit found missing: an absent vault used to be indistinguishable
   *     from "we never looked", so the write that CREATES a vault — the one a new account makes —
   *     went out with no precondition at all, and two of one person's machines signing in the same
   *     afternoon both created one, the second silently replacing the first;</li>
   *   <li><b>{@link MUST_REREAD}</b> — the server refused our last write. Forgetting the version
   *     is not enough, because "nothing known" means "write unconditionally": a retry that skipped
   *     the re-read would overwrite exactly the work the refusal protected;</li>
   *   <li><b>absent from the map</b> — we have never read this account's vault. The write then
   *     carries no precondition, which is what every client did before the server understood them,
   *     and it stays correct.</li>
   * </ul>
   */
  private readonly versions = new Map<string, KnownVersion>();

  constructor(
    readonly location: string,
    /** Resolves the bearer token for one of MY accounts. */
    private readonly tokenFor: (account: StoredAccount) => Promise<string | undefined>,
    private readonly timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
    /** Told once, if this extension turns out to be behind the server it is talking to. */
    private readonly warn: (message: string) => void = () => undefined,
  ) {}

  /** The contract version the server last reported, or 0 if it has never said. */
  serverContract = 0;

  /**
   * Whether this server carries a share's `format` field through.
   *
   * <p>Read before sealing, never after: a bound share whose `format` the server drops is
   * unopenable, so a sender that cannot confirm the field survives must seal unbound instead.
   * A server that has never answered yet reads as 0 and therefore as "old", which is the safe
   * direction — the fallback still works, the optimistic guess would not.</p>
   */
  get carriesShareFormat(): boolean {
    return this.serverContract >= SHARE_FORMAT_CONTRACT;
  }

  private warnedAboutVersion = false;

  /**
   * Read the server's version off any response, and say something the FIRST time it is ahead.
   *
   * <p>Once, not per request: a sync cycle makes several calls, and a notice that appears four
   * times per minute is one people turn off — which is how a warning becomes worse than none.</p>
   */
  /**
   * Read the version off the response, and refuse to go further if the server refused us.
   *
   * <p>Its own method so the request handler stays inside the size the linter enforces — but
   * also because "what the version handshake does" is a separate thing to read from "how a
   * request is made".</p>
   */
  private async checkContract(response: Response): Promise<void> {
    this.noteServerContract(response);
    if (response.status === UPGRADE_REQUIRED) {
      throw new Error(tooOldMessage(this.location, await response.text().catch(() => '')));
    }
  }

  private noteServerContract(response: Response): void {
    this.serverContract = serverContractFrom(response.headers.get(CONTRACT_HEADER));
    if (serverIsAhead(this.serverContract) && !this.warnedAboutVersion) {
      this.warnedAboutVersion = true;
      this.warn(serverAheadMessage(this.location, this.serverContract));
    }
  }

  private url(path: string): string {
    return `${this.location.replace(/\/+$/, '')}${path}`;
  }

  // eslint-disable-next-line complexity
  private async request(
    account: StoredAccount,
    path: string,
    init: RequestInit & { rawBody?: string } = {},
  ): Promise<Response> {
    const token = await this.tokenFor(account);
    if (token === undefined) {
      throw new Error(
        `No usable ${account.provider} token for ${account.email} — sign in again to sync with ${this.location}.`,
      );
    }
    const headers = requestHeaders(init, token);
    let response: Response;
    try {
      response = await fetch(this.url(path), {
        ...init,
        headers,
        body: init.rawBody ?? init.body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      // A timeout and a refused connection are different operational problems and
      // want different answers from the reader, so they get different sentences.
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new Error(
          `Vault server did not answer within ${Math.round(this.timeoutMs / 1000)}s (${this.location}). ` +
            'It may be starting, overloaded, or behind a proxy that is not forwarding.',
        );
      }
      throw new Error(
        `Vault server unreachable (${this.location}): ${describeError(error)}`,
      );
    }
    await this.checkContract(response);
    if (response.status === 401) {
      throw new Error(
        `Vault server rejected the ${account.provider} token for ${account.email} (401). Sign in again.`,
      );
    }
    if (response.status === 403) {
      throw new Error(await refusedMessage(account, this.location, response));
    }
    return response;
  }

  async readVault(account: StoredAccount): Promise<string | undefined> {
    const response = await this.request(account, '/api/vault');
    if (response.status === 404) {
      // Not "we know nothing" — we know there is nothing, which is a precondition of its own.
      this.versions.set(account.accountId, ABSENT);
      return undefined;
    }
    if (!response.ok) {
      throw new Error(`Vault download failed: HTTP ${response.status}.`);
    }
    this.rememberVersion(account, response);
    return response.text();
  }

  async writeVault(account: StoredAccount, content: string): Promise<void> {
    const known = this.versions.get(account.accountId);
    if (known === MUST_REREAD) {
      // Refused here rather than on the wire: after a 412 there is no precondition this client
      // can honestly state — the vault exists, and its version is one we have never seen.
      throw new Error(
        `The vault at ${this.location} changed under this client and has not been re-read since. `
          + 'Re-read it before writing; nothing was sent.',
      );
    }
    const response = await this.request(account, '/api/vault', {
      method: 'PUT',
      rawBody: content,
      headers: preconditionFor(known),
    });

    if (response.status === 412) {
      // Somebody else — another machine of yours — wrote between our read and this write.
      // Remember that a re-read is owed: dropping the version alone would leave the next
      // attempt unconditional, which is the overwrite this refusal just prevented.
      this.versions.set(account.accountId, MUST_REREAD);
      throw new Error(
        `The vault changed on the server while this sync was running (${this.location}). ` +
          'Re-reading and merging on the next cycle; nothing was overwritten.',
      );
    }
    if (!response.ok) {
      throw new Error(`Vault upload failed: HTTP ${response.status}.`);
    }
    this.rememberVersion(account, response);
  }

  /**
   * Adopt the version the server reports, so a second write needs no extra read.
   *
   * <p>A response with no ETag FORGETS whatever we held — an older server, or a proxy that
   * strips the header. Keeping the previous version would refuse every later write, and keeping
   * an earlier {@link ABSENT} would refuse them for the opposite reason.</p>
   */
  private rememberVersion(account: StoredAccount, response: Response): void {
    const etag = response.headers.get('ETag');
    if (etag !== null && etag.length > 0) {
      this.versions.set(account.accountId, etag);
    } else {
      this.versions.delete(account.accountId);
    }
  }

  // eslint-disable-next-line complexity
  async listTeam(ownAccounts: readonly StoredAccount[]): Promise<TeamMember[]> {
    // Any of my accounts pointing here can enumerate the team.
    const mine = ownAccounts.filter((a) => a.email.length > 0);
    // Why it failed, kept so an empty team can say which kind of empty it is.
    this.lastTeamStatus = undefined;
    for (const account of mine) {
      try {
        const response = await this.request(account, '/api/team');
        if (!response.ok) {
          this.lastTeamStatus = response.status;
          continue;
        }
        const payload: unknown = await response.json();
        if (!Array.isArray(payload)) {
          continue;
        }
        this.lastTeamStatus = undefined; // somebody answered; nothing to report
        const ownEmails = new Set(ownAccounts.map((a) => a.email.toLowerCase()));
        return payload
          .map((entry) => (typeof entry === 'object' && entry !== null ? (entry as Record<string, unknown>) : {}))
          .filter((row) => String(row.email ?? '').includes('@'))
          .map((row) => ({
            email: String(row.email),
            // Contract 3 and later; a row from an older server carries none, and `undefined` there
            // means "not told" rather than "on no project" — see `TeamMember.projectIds`.
            projectIds: Array.isArray(row.projectIds)
              ? row.projectIds.filter((id): id is string => typeof id === 'string')
              : undefined,
          }))
          .map(({ email, projectIds }) => ({
            account: {
              accountId: email.toLowerCase(),
              email,
              provider: account.provider,
            },
            projectIds,
            location: this.location,
            // Server shares are bound to the recipient's email.
            shareKeyId: email.toLowerCase(),
            isSelf: ownEmails.has(email.toLowerCase()),
          }));
      } catch {
        // try the next account that maps here
      }
    }
    return [];
  }

  async listShares(account: StoredAccount): Promise<OwnedShare[]> {
    const response = await this.request(account, '/api/shares');
    if (!response.ok) {
      return [];
    }
    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) {
      return [];
    }
    return payload.filter(isShareItem).map((item) => ({
      accountId: account.accountId,
      shareKeyId: account.email.toLowerCase(),
      item,
    }));
  }

  async appendShares(
    actingAs: StoredAccount,
    recipient: TeamMember,
    items: ShareItem[],
  ): Promise<void> {
    // The sender's own token authorizes the POST; the server stamps `from`.
    for (const item of items) {
      const response = await this.request(actingAs, '/api/shares', {
        method: 'POST',
        body: JSON.stringify({
          toEmail: recipient.account.email,
          entityName: item.entityName,
          entityKind: item.entityKind,
          salt: item.salt,
          iv: item.iv,
          tag: item.tag,
          data: item.data,
          kdfN: item.kdfN,
          kdfR: item.kdfR,
          kdfP: item.kdfP,
          // Without this the recipient cannot know which fields the AAD covered, and every
          // bound share posted here between 0.82.1 and 0.87 arrived unopenable. A server
          // below `SHARE_FORMAT_CONTRACT` ignores it — which is why the sender only seals
          // a bound form when `carriesShareFormat` says the field will survive.
          format: item.format,
          // Epic 3: the server's share rule decides on it, epic 4 logs it, and format 4 binds it.
          // Absent on every share that did not come out of a project folder.
          projectId: item.projectId,
        }),
      });
      if (!response.ok) {
        throw new Error(
          `Sharing "${item.entityName}" with ${recipient.account.email} failed: ${await refusalDetail(response)}`,
        );
      }
    }
  }

  /**
   * <p>The outcome rides in the query string, which is the route the server shipped:
   * `DELETE /api/shares/{id}?outcome=accepted`. When there is none the parameter is OMITTED
   * entirely rather than sent empty — `?outcome=` and `?outcome=undefined` are both filters the
   * server would read as a word it does not know, and the second is a bug that looks like a
   * server fault.</p>
   */
  async removeShare(actingAs: StoredAccount, share: OwnedShare, outcome?: ShareOutcome): Promise<void> {
    const said = outcome === undefined ? '' : `?outcome=${encodeURIComponent(outcome)}`;
    const response = await this.request(actingAs, `/api/shares/${encodeURIComponent(share.item.id)}${said}`, {
      method: 'DELETE',
    });
    // The ANSWER decides, which it did not until now: a 500 was discarded, so an accept imported the
    // secret, dropped the row from the tree and left the share in the inbox with no share.accepted
    // recorded — the one failure the outcome exists to prevent. A 404 is the exception, exactly as
    // `deleteVault` treats it one method below: the share is already gone, which is the end state
    // this call wanted, and two windows racing one inbox is an ordinary Tuesday.
    if (!response.ok && response.status !== 404) {
      throw new Error(`Removing the share failed: HTTP ${response.status}.`);
    }
  }

  /**
   * What this account has sent and nobody has dealt with yet.
   *
   * <p>Server transport only, and that is not an omission: a folder or a git remote has no
   * notion of a pending delivery — a share written there IS delivered the moment it syncs, so
   * there is nothing in flight to take back.</p>
   */
  async listSent(account: StoredAccount): Promise<SentShare[]> {
    const response = await this.request(account, '/api/shares/sent');
    if (response.status === 404) {
      // A server older than this route, not an empty outbox — and the difference matters: an
      // empty list would be read as "nothing of mine is pending", which is the opposite of
      // true when the reason you looked was to take something back.
      throw new Error(
        `The vault server at ${this.location} is older than this feature — it cannot take a share `
          + 'back yet. Update the server, then try again.',
      );
    }
    if (!response.ok) {
      return [];
    }
    const payload: unknown = await response.json();
    return Array.isArray(payload) ? payload.filter(isSentShare) : [];
  }

  /**
   * Take back something still pending. Returns what actually happened.
   *
   * <p>"Already taken" is reported rather than swallowed: the whole point of asking was to stop
   * a secret reaching someone, and being told it worked when it did not is worse than being told
   * nothing. A 409 means it is beyond recall and the sender should rotate instead.</p>
   */
  async withdrawSent(
    account: StoredAccount,
    id: string,
  ): Promise<'withdrawn' | 'alreadyTaken' | 'notFound'> {
    const response = await this.request(account, `/api/shares/sent/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (response.status === 409) {
      return 'alreadyTaken';
    }
    return response.ok ? 'withdrawn' : 'notFound';
  }

  /**
   * After a DELETE that succeeded — or found nothing to delete — the vault is gone, so the next
   * write is a create and can say so, instead of being the unconditional write finding #5 is about.
   */
  private noteVaultIsGone(account: StoredAccount, response: Response): void {
    if (response.ok || response.status === 404) {
      this.versions.set(account.accountId, ABSENT);
    }
  }

  async deleteVault(account: StoredAccount): Promise<void> {
    this.versions.delete(account.accountId);
    const response = await this.request(account, '/api/vault', { method: 'DELETE' });
    this.noteVaultIsGone(account, response);
    if (!response.ok && response.status !== 404) {
      // The server's own sentence, not just the number. A 503 here means the vault file was locked
      // and NOTHING was removed — including the login key, which is the whole point of the refusal
      // (a vault that outlives its key is a vault nobody can open). "HTTP 503" alone sends a person
      // looking for a bug; the sentence tells them to try again.
      throw new Error(`Remote vault delete failed: ${await refusalDetail(response)}`);
    }
  }
}
