import { LoginKeyOutcome, OrgLoginKeyClient } from './orgLoginKeyClient';
import { StoredAccount } from './types';

/**
 * The login key this window holds, per account, for as long as the person is entitled to it.
 *
 * <p><b>Memory only, deliberately.</b> S is the factor that makes a copied vault file useless
 * without a live login; writing it to disk beside the vault would hand back what it takes away. It
 * is fetched once per window per account and dropped the moment the server says the account is
 * deactivated — which is the whole mechanism of blocking a developer, since there is no rotation and
 * nothing to revoke.</p>
 *
 * <p><b>A blocked answer does more than drop the key.</b> An unlocked session already holds the
 * master key in memory: forgetting S alone would leave the person able to read, export and use
 * everything until they closed the window. `onBlocked` is how this module tells the key cache to
 * evict and lock — the reviewers' finding, and the reason this class exists rather than a Map.</p>
 *
 * <p>No `vscode`, so what it does is a unit test.</p>
 */

export interface HeldLoginKey {
  readonly key: Buffer;
  readonly fingerprint: string;
}

/**
 * How long a held key is trusted before the server is asked again.
 *
 * <p>The number that decides how long a deactivated developer keeps working in a window they had
 * already opened. Without a bound like this the answer is "until they close it": the key is cached,
 * every later call is served from memory, and the blocked answer that evicts and locks is never
 * fetched at all. Five minutes is short enough that an administrator blocking somebody sees it take
 * effect while they are still watching, and long enough that an ordinary sync cycle — which runs far
 * more often than that — does not turn into one request per write.</p>
 *
 * <p>Story 4's offline lease is the same question over a longer horizon and for the whole account;
 * this is the horizon for the KEY, and the two are deliberately independent.</p>
 */
export const LOGIN_KEY_REVALIDATE_MS = 5 * 60 * 1000;

/**
 * A caller's own copy of the key.
 *
 * <p>{@link LoginKeySession.forget} zeroes what it holds — which is the point, since a key that is
 * merely dropped stays in memory until a collection nobody controls. But a caller that had already
 * been handed that same `Buffer` would then be sealing a wrap under `HKDF(base ‖ 0^32)`: a vault
 * written under a key of zeroes, which nothing can ever open again. Handing out copies costs 32 bytes
 * and removes the possibility.</p>
 */
function copyOf(held: HeldLoginKey): HeldLoginKey {
  return { key: Buffer.from(held.key), fingerprint: held.fingerprint };
}

export class LoginKeySession {
  private readonly held = new Map<string, { key: HeldLoginKey; at: number }>();

  constructor(
    private readonly clientFor: (account: StoredAccount) => OrgLoginKeyClient | undefined,
    /** Evict this account's cached master key and lock it — a blocked person keeps nothing open. */
    private readonly onBlocked: (account: StoredAccount) => void,
    private readonly log?: (message: string) => void,
    private readonly now: () => number = Date.now,
    private readonly revalidateAfterMs: number = LOGIN_KEY_REVALIDATE_MS,
  ) {}

  /** What this window already holds, without asking anybody and without judging its age. */
  current(accountId: string): HeldLoginKey | undefined {
    const held = this.held.get(accountId)?.key;
    return held === undefined ? undefined : copyOf(held);
  }

  /**
   * The key for this account, fetched if it is not already held.
   *
   * <p>Never throws and never prompts: it can be called from a background sync cycle, and the only
   * honest answer when the server cannot be reached is "nothing changed".</p>
   */
  async resolve(account: StoredAccount): Promise<HeldLoginKey | undefined> {
    const entry = this.held.get(account.accountId);
    const stale = entry === undefined ? undefined : copyOf(entry.key);
    if (this.stillFresh(entry)) {
      return stale;
    }
    const client = this.clientFor(account);
    if (client === undefined) {
      return stale;
    }
    return this.take(account, await client.fetchLoginKey(account), stale);
  }

  /** A key young enough to be trusted without asking again. Nothing held is never fresh. */
  private stillFresh(entry: { at: number } | undefined): boolean {
    return entry !== undefined && this.now() - entry.at < this.revalidateAfterMs;
  }

  /** Drop what is held for one account — on sign-out, or when the vault it belongs to is deleted. */
  forget(accountId: string): void {
    this.held.get(accountId)?.key.key.fill(0);
    this.held.delete(accountId);
  }

  private take(
    account: StoredAccount,
    outcome: LoginKeyOutcome,
    stale: HeldLoginKey | undefined,
  ): HeldLoginKey | undefined {
    if (outcome.kind === 'issued') {
      const held = { key: outcome.key, fingerprint: outcome.fingerprint };
      this.held.set(account.accountId, { key: held, at: this.now() });
      return copyOf(held);
    }
    if (outcome.kind === 'blocked') {
      this.blocked(account);
      return undefined;
    }
    // 'unavailable' keeps what we had: a server that could not answer has told us nothing, and
    // dropping the key over one flaky request would lock somebody out of their own vault on a train.
    // 'none' is an answer — this server has no key for this account — but it is not a reason to throw
    // away one it issued earlier, because only 'blocked' means they may no longer have it.
    return stale;
  }

  /** The moment the epic exists for. Nothing this window holds for them survives it. */
  private blocked(account: StoredAccount): void {
    this.log?.(`${account.email} is deactivated on this server`);
    this.forget(account.accountId);
    this.onBlocked(account);
  }
}
