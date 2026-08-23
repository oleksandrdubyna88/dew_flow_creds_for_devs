import { OwnedShare, ShareItem, StoredAccount, TeamMember, isShareItem } from './types';
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

export class ServerTransport implements VaultTransport {
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
  ) {}

  private url(path: string): string {
    return `${this.location.replace(/\/+$/, '')}${path}`;
  }

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
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    if (init.rawBody !== undefined) {
      headers.set('Content-Type', 'application/octet-stream');
    } else if (init.body !== undefined) {
      headers.set('Content-Type', 'application/json');
    }
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
        `Vault server unreachable (${this.location}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (response.status === 401) {
      throw new Error(
        `Vault server rejected the ${account.provider} token for ${account.email} (401). Sign in again.`,
      );
    }
    if (response.status === 403) {
      throw new Error(
        `Vault server refused ${account.email} (403) — outside the allowed domain, or not permitted.`,
      );
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

  async listTeam(ownAccounts: readonly StoredAccount[]): Promise<TeamMember[]> {
    // Any of my accounts pointing here can enumerate the team.
    const mine = ownAccounts.filter((a) => a.email.length > 0);
    for (const account of mine) {
      try {
        const response = await this.request(account, '/api/team');
        if (!response.ok) {
          continue;
        }
        const payload: unknown = await response.json();
        if (!Array.isArray(payload)) {
          continue;
        }
        const ownEmails = new Set(ownAccounts.map((a) => a.email.toLowerCase()));
        return payload
          .map((entry) =>
            typeof entry === 'object' && entry !== null
              ? String((entry as Record<string, unknown>).email ?? '')
              : '',
          )
          .filter((email) => email.includes('@'))
          .map((email) => ({
            account: {
              accountId: email.toLowerCase(),
              email,
              provider: account.provider,
            },
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
        }),
      });
      if (!response.ok) {
        throw new Error(
          `Sharing "${item.entityName}" with ${recipient.account.email} failed: HTTP ${response.status}.`,
        );
      }
    }
  }

  async removeShare(actingAs: StoredAccount, share: OwnedShare): Promise<void> {
    await this.request(actingAs, `/api/shares/${encodeURIComponent(share.item.id)}`, {
      method: 'DELETE',
    });
  }

  async deleteVault(account: StoredAccount): Promise<void> {
    this.versions.delete(account.accountId);
    const response = await this.request(account, '/api/vault', { method: 'DELETE' });
    if (!response.ok && response.status !== 404) {
      throw new Error(`Remote vault delete failed: HTTP ${response.status}.`);
    }
  }
}
