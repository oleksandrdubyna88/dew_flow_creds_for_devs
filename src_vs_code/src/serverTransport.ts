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
import { VaultTransport } from './vaultTransport';

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
   * The version of each account's vault as this client last saw it, so a write can
   * say "only if nobody else changed it since". Kept per transport instance, which
   * TransportFactory caches per location — so a sync cycle that reads and then writes
   * uses the version from its own read.
   *
   * Absent means "we have not read this account's vault yet", and the write then
   * carries no precondition: an unconditional write is what every client did before
   * the server understood them, and it stays correct.
   */
  private readonly versions = new Map<string, string>();

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
      this.versions.delete(account.accountId); // nothing stored yet
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
    const response = await this.request(account, '/api/vault', {
      method: 'PUT',
      rawBody: content,
      headers: known === undefined ? undefined : { 'If-Match': known },
    });

    if (response.status === 412) {
      // Somebody else — another machine of yours — wrote between our read and this
      // write. Forget the version we were holding so the next attempt re-reads and
      // merges; keeping it would make every retry fail the same way.
      this.versions.delete(account.accountId);
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

  /** Adopt the version the server reports, so a second write needs no extra read. */
  private rememberVersion(account: StoredAccount, response: Response): void {
    const etag = response.headers.get('ETag');
    if (etag !== null && etag.length > 0) {
      this.versions.set(account.accountId, etag);
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

  async removeShare(actingAs: StoredAccount, share: OwnedShare): Promise<void> {
    await this.request(actingAs, `/api/shares/${encodeURIComponent(share.item.id)}`, {
      method: 'DELETE',
    });
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

  async deleteVault(account: StoredAccount): Promise<void> {
    this.versions.delete(account.accountId);
    const response = await this.request(account, '/api/vault', { method: 'DELETE' });
    if (!response.ok && response.status !== 404) {
      throw new Error(`Remote vault delete failed: HTTP ${response.status}.`);
    }
  }
}
