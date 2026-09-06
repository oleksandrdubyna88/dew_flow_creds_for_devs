import { CLIENT_CONTRACT_VERSION, CONTRACT_HEADER, UPGRADE_REQUIRED, tooOldMessage } from './contractVersion';
import { describeError } from './describeError';
import { DEFAULT_REQUEST_TIMEOUT_MS } from './serverTransport';
import { StoredAccount } from './types';

/**
 * The request plumbing every corporate client shares: the URL, the bearer and contract headers,
 * the timeout, and the one sentence an unreachable server produces.
 *
 * <p>Extracted from `orgRecoveryClient.ts` in epic 1 (the members registry) because the
 * corporate control plane adds a client per epic — members here, blocking in epic 2, the backup
 * in epic 5 — and by the second of them there would have been two copies of this block, drifting
 * by the third. The reuse-first rule's answer is to pull the common half out BEFORE the second
 * copy exists. The recovery client is its first caller and behaves exactly as it did; its own
 * suite is the characterization test for the move.</p>
 *
 * <p>Deliberately not `ServerTransport`: that class implements `VaultTransport`, which a folder
 * and a git remote implement too, and a corporate surface is a server-only concept those two
 * cannot mean.</p>
 *
 * <p>Pure and `vscode`-free, so what it sends is a unit test.</p>
 */
export class CorpApiClient {
  constructor(
    readonly location: string,
    private readonly tokenFor: (account: StoredAccount) => Promise<string | undefined>,
    private readonly timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
  ) {}

  url(path: string): string {
    return `${this.location.replace(/\/+$/, '')}${path}`;
  }

  /**
   * Who we are, what we speak, and what we are sending. The contract header is how a corporate
   * server refuses a client too old to read its policy — without it the floor cannot be applied,
   * and an old client would be served a document it will ignore.
   */
  static headersFor(init: RequestInit, token: string): Headers {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    headers.set(CONTRACT_HEADER, String(CLIENT_CONTRACT_VERSION));
    if (init.body !== undefined) {
      headers.set('Content-Type', 'application/json');
    }
    return headers;
  }

  async request(account: StoredAccount, path: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.tokenFor(account);
    if (token === undefined) {
      throw new Error(`No usable token for ${account.email} — sign in again.`);
    }
    const headers = CorpApiClient.headersFor(init, token);
    try {
      return await fetch(this.url(path), {
        ...init,
        headers,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new Error(`Vault server unreachable (${this.location}): ${describeError(error)}`);
    }
  }

  /**
   * The sentence a refusal on the `/api/org/*` surface carries.
   *
   * <p>That surface promises a JSON `{error}` on every refusal because an admin UI has to show
   * WHY — a bare `409` cannot tell an admin that the person they tried to demote is a recovery
   * officer. A `426` is the shared too-old sentence, quoting the server, so a person meets one
   * message however they hit the contract floor. Anything else falls back to the status, so no
   * refusal is ever silent.</p>
   *
   * <p>Not used by the recovery client: its endpoints answer plain text, and it reads them as it
   * always has.</p>
   */
  async refusal(response: Response): Promise<string> {
    const text = await response.text().catch(() => '');
    const said = errorSentence(text) ?? text.trim();
    if (response.status === UPGRADE_REQUIRED) {
      return tooOldMessage(this.location, said);
    }
    return said.length > 0 ? said : `HTTP ${response.status}`;
  }
}

/** The `error` of a JSON `{error}` body, or nothing when the body is not that. */
function errorSentence(text: string): string | undefined {
  try {
    const parsed = JSON.parse(text) as { error?: unknown } | null;
    return typeof parsed?.error === 'string' ? parsed.error : undefined;
  } catch {
    return undefined;
  }
}
