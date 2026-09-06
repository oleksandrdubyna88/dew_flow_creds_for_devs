import { CorpApiClient } from './corpApiClient';
import { describeError } from './describeError';
import { DEFAULT_REQUEST_TIMEOUT_MS } from './serverTransport';
import { hasShape } from './shapeGuard';
import { StoredAccount } from './types';

/**
 * `GET /api/org/login-key` — the server's half of a developer's vault key.
 *
 * <p>Its own client rather than a method on `OrgMembersClient`, because the four answers below are
 * not "a document or an error": each one is a different instruction to the caller, and flattening
 * them into a thrown sentence is what would make a blocked account look like a network problem.</p>
 */

/** The key and its public name, as the server sends them. */
interface LoginKeyDocument {
  readonly loginKey: string;
  readonly fingerprint: string;
}

function isLoginKeyDocument(value: unknown): value is LoginKeyDocument {
  return hasShape(value, { loginKey: 'string', fingerprint: 'string' });
}

/**
 * What asking for the login key produced.
 *
 * <ul>
 *   <li><b>issued</b> — the key, and the fingerprint that names it.</li>
 *   <li><b>none</b> — this server has no key for this account: a member, or a developer whose
 *       server does not run the feature. Not an error, and not a reason to change any wrap.</li>
 *   <li><b>blocked</b> — the account is deactivated. The caller must purge what it holds and lock;
 *       this is the moment the whole epic exists for.</li>
 *   <li><b>unavailable</b> — the server could not be reached or could not answer. Nothing is known,
 *       so nothing changes: the client keeps whatever it already had.</li>
 * </ul>
 */
export type LoginKeyOutcome =
  | { kind: 'issued'; key: Buffer; fingerprint: string }
  | { kind: 'none' }
  | { kind: 'blocked' }
  | { kind: 'unavailable'; why: string };

/** The header the server sets when a 403 is about the CALLER's own account being deactivated. */
const REASON_HEADER = 'X-Creds-Reason';
const ACCOUNT_DEACTIVATED = 'account-deactivated';

/**
 * A 403 that is about the CALLER's own account, told apart from every other 403 by the header the
 * server sets for exactly this — never by matching English, and never confused with a domain
 * refusal, which would lock somebody out of their vault over a misconfigured gateway.
 */
function deactivated(response: Response): boolean {
  return response.status === 403 && response.headers.get(REASON_HEADER) === ACCOUNT_DEACTIVATED;
}

export class OrgLoginKeyClient {
  private readonly api: CorpApiClient;

  constructor(
    readonly location: string,
    tokenFor: (account: StoredAccount) => Promise<string | undefined>,
    timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
  ) {
    this.api = new CorpApiClient(location, tokenFor, timeoutMs);
  }

  /**
   * Ask for this account's login key.
   *
   * <p><b>Never throws for an answer the server actually gave.</b> Every status this route can
   * produce is one of the four outcomes, because the caller's decision differs for each: a 404 says
   * leave the wraps alone, a 403 with the reason header says purge and lock, a 503 says try later,
   * and only a shape this build cannot read is a real surprise — and even that is `unavailable`,
   * since a client that cannot understand today's answer must not act as if the answer were "no
   * key" and strip a binding.</p>
   */
  async fetchLoginKey(account: StoredAccount): Promise<LoginKeyOutcome> {
    try {
      return await this.ask(account);
    } catch (error) {
      return { kind: 'unavailable', why: describeError(error) };
    }
  }

  private async ask(account: StoredAccount): Promise<LoginKeyOutcome> {
    const response = await this.api.request(account, '/api/org/login-key');
    if (response.status === 404) {
      return { kind: 'none' };
    }
    if (deactivated(response)) {
      return { kind: 'blocked' };
    }
    if (!response.ok) {
      return { kind: 'unavailable', why: await this.api.refusal(response) };
    }
    return this.readKey(response);
  }

  private async readKey(response: Response): Promise<LoginKeyOutcome> {
    const parsed: unknown = await response.json().catch(() => undefined);
    if (!isLoginKeyDocument(parsed)) {
      return { kind: 'unavailable', why: 'The server answered a login key in a shape this build cannot read.' };
    }
    const key = Buffer.from(parsed.loginKey, 'base64');
    if (key.length !== LOGIN_KEY_BYTES) {
      // A key of the wrong length would seal wraps nobody can reproduce. The server refuses to serve
      // one; this is the same refusal on the other side of the wire, because "both ends check" is
      // what keeps a future format change from being discovered by a stranded vault.
      return { kind: 'unavailable', why: 'The server answered a login key of the wrong size.' };
    }
    return { kind: 'issued', key, fingerprint: parsed.fingerprint };
  }
}

/** 32 bytes, the size the server mints and the size AES-256 wants. */
export const LOGIN_KEY_BYTES = 32;
