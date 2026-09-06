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

export class LoginKeySession {
  private readonly held = new Map<string, HeldLoginKey>();

  constructor(
    private readonly clientFor: (account: StoredAccount) => OrgLoginKeyClient | undefined,
    /** Evict this account's cached master key and lock it — a blocked person keeps nothing open. */
    private readonly onBlocked: (account: StoredAccount) => void,
    private readonly log?: (message: string) => void,
  ) {}

  /** What this window already holds, without asking anybody. */
  current(accountId: string): HeldLoginKey | undefined {
    return this.held.get(accountId);
  }

  /**
   * The key for this account, fetched if it is not already held.
   *
   * <p>Never throws and never prompts: it can be called from a background sync cycle, and the only
   * honest answer when the server cannot be reached is "nothing changed".</p>
   */
  async resolve(account: StoredAccount): Promise<HeldLoginKey | undefined> {
    const already = this.held.get(account.accountId);
    if (already !== undefined) {
      return already;
    }
    const client = this.clientFor(account);
    if (client === undefined) {
      return undefined;
    }
    return this.take(account, await client.fetchLoginKey(account));
  }

  /** Drop what is held for one account — on sign-out, or when the vault it belongs to is deleted. */
  forget(accountId: string): void {
    const key = this.held.get(accountId);
    key?.key.fill(0);
    this.held.delete(accountId);
  }

  private take(account: StoredAccount, outcome: LoginKeyOutcome): HeldLoginKey | undefined {
    if (outcome.kind === 'issued') {
      const held = { key: outcome.key, fingerprint: outcome.fingerprint };
      this.held.set(account.accountId, held);
      return held;
    }
    if (outcome.kind === 'blocked') {
      this.blocked(account);
    }
    // 'none' and 'unavailable' both mean: change nothing, keep nothing new. A member has no key,
    // and a server that could not answer has told us nothing about whether one exists.
    return undefined;
  }

  /** The moment the epic exists for. Nothing this window holds for them survives it. */
  private blocked(account: StoredAccount): void {
    this.log?.(`${account.email} is deactivated on this server`);
    this.forget(account.accountId);
    this.onBlocked(account);
  }
}
