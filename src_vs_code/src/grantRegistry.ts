import { describeSecret, newSecret } from './grantToken';

/**
 * The grants a window has minted, keyed by their secret. In memory only: the
 * registry dies with the window, which is the whole revocation story.
 *
 * A grant carries only what identifies the entity it points at
 * (`accountId` + `entityId` + a cached label) — never the entity itself and
 * never the secret material. Every use re-resolves the live entity, so an
 * entity deleted or a password removed after minting is a clean per-call
 * error, not a stale snapshot.
 *
 * Pure and `vscode`-free: the consent decision is made by the broker (it owns
 * the modal) and recorded here through `allow`/`deny`; the state machine
 * itself is a plain unit test.
 */

export type GrantStatus = 'pending' | 'allowed' | 'denied';

export interface Grant {
  readonly secret: string;
  readonly accountId: string;
  readonly entityId: string;
  readonly entityName: string;
  readonly kind: string;
  readonly status: GrantStatus;
  /** When it was minted (ms epoch). */
  readonly mintedAt: number;
  /** The last call that used it — minting counts as the first (ms epoch). */
  readonly lastUsedAt: number;
  /** Calls that reached an action through this grant. */
  readonly uses: number;
}

/**
 * How long a token stays good without being used, and how many calls it buys. Zero means
 * "no limit" for either — the window closing is then the only expiry.
 *
 * <p>Both exist because "as long as the window stays open" was the whole lifetime, and a
 * token pasted into an agent transcript that survives for days buys correspondingly
 * long-lived, unattended access. An idle window is the natural fit: a token an agent is
 * actively using stays live, one it forgot about goes dead on its own.</p>
 */
export interface GrantLimits {
  readonly idleMs: number;
  readonly maxUses: number;
}

export const NO_LIMITS: GrantLimits = { idleMs: 0, maxUses: 0 };

export type GrantExpiry = 'idle' | 'uses';

export type GrantLookup =
  | { kind: 'live'; grant: Grant }
  | { kind: 'expired'; reason: GrantExpiry }
  | { kind: 'unknown' };

/** Why a grant would be refused now — or `undefined` while it is still good. */
export function grantExpiry(grant: Grant, now: number, limits: GrantLimits): GrantExpiry | undefined {
  if (limits.maxUses > 0 && grant.uses >= limits.maxUses) {
    return 'uses';
  }
  if (limits.idleMs > 0 && now - grant.lastUsedAt > limits.idleMs) {
    return 'idle';
  }
  return undefined;
}

export class GrantRegistry {
  private readonly grants = new Map<string, Grant>();

  /**
   * A ceiling so a long-lived window that shares credential after credential cannot grow
   * this map without bound. Far above any real session's share count, so in practice only
   * the denied-grant sweep below ever fires; the cap is the backstop.
   */
  private static readonly MAX_GRANTS = 256;

  /** Mint a fresh pending grant and return it (its `secret` is the key). */
  mint(
    accountId: string,
    entityId: string,
    entityName: string,
    kind: string,
    now: number = Date.now(),
  ): Grant {
    this.prune();
    const grant: Grant = {
      secret: newSecret(),
      accountId,
      entityId,
      entityName,
      kind,
      status: 'pending',
      mintedAt: now,
      lastUsedAt: now,
      uses: 0,
    };
    this.grants.set(grant.secret, grant);
    return grant;
  }

  /** The stored grant, expiry not applied. The broker's request path uses `lookup`. */
  get(secret: string): Grant | undefined {
    return this.grants.get(secret);
  }

  /**
   * The grant behind a token as the request path needs it: live, expired (and why), or
   * unknown. An expired grant is deleted on the way out — it can never come back, and a
   * second call must read as unknown rather than expired-again.
   */
  lookup(secret: string, now: number = Date.now(), limits: GrantLimits = NO_LIMITS): GrantLookup {
    const grant = this.grants.get(secret);
    if (grant === undefined) {
      return { kind: 'unknown' };
    }
    const reason = grantExpiry(grant, now, limits);
    if (reason !== undefined) {
      this.grants.delete(secret);
      return { kind: 'expired', reason };
    }
    return { kind: 'live', grant };
  }

  /** Record one use: bumps the count and resets the idle clock. No-op for an unknown secret. */
  touch(secret: string, now: number = Date.now()): Grant | undefined {
    const current = this.grants.get(secret);
    if (current === undefined) {
      return undefined;
    }
    const next: Grant = { ...current, lastUsedAt: now, uses: current.uses + 1 };
    this.grants.set(secret, next);
    return next;
  }

  /**
   * Record the human's approval. Terminal — a later timeout can never demote
   * an allowed grant. No-op if the secret is unknown or already settled.
   */
  allow(secret: string): Grant | undefined {
    return this.settle(secret, 'allowed');
  }

  /** Record the human's refusal. Terminal for this token's life. */
  deny(secret: string): Grant | undefined {
    return this.settle(secret, 'denied');
  }

  /**
   * Reclaim dead grants before minting another.
   *
   * <p>A <b>denied</b> grant is terminal — it exists only to refuse, and an unknown token is
   * refused just the same, so deleting it changes nothing observable. An <b>allowed</b> grant
   * is a live capability the person deliberately handed an agent, so the cap reclaims the
   * oldest NON-allowed grant first (see oldestEvictable) and only drops an allowed one if the
   * whole map is allowed grants — the bounded last resort.</p>
   */
  private prune(): void {
    for (const [secret, grant] of this.grants) {
      if (grant.status === 'denied') {
        this.grants.delete(secret);
      }
    }
    while (this.grants.size >= GrantRegistry.MAX_GRANTS) {
      const victim = this.oldestEvictable();
      if (victim === undefined) {
        break;
      }
      this.grants.delete(victim);
    }
  }

  /**
   * The grant the cap should reclaim next: the oldest NON-allowed (a pending grant awaiting
   * or abandoned by consent), and only when every grant is allowed does it fall back to the
   * oldest allowed one. An allowed grant is a live capability; preferring pending victims
   * keeps the cap from silently revoking a token an agent is still using.
   */
  private oldestEvictable(): string | undefined {
    let oldestAllowed: string | undefined;
    for (const [secret, grant] of this.grants) {
      if (grant.status !== 'allowed') {
        return secret;
      }
      oldestAllowed ??= secret;
    }
    return oldestAllowed;
  }

  /** Only a pending grant settles; a settled one is never revisited. */
  private settle(secret: string, status: GrantStatus): Grant | undefined {
    const current = this.grants.get(secret);
    if (current === undefined || current.status !== 'pending') {
      return current;
    }
    const next: Grant = { ...current, status };
    this.grants.set(secret, next);
    return next;
  }

  /** Log-safe identifier for a grant's secret. */
  static describe(grant: Grant): string {
    return describeSecret(grant.secret);
  }
}
