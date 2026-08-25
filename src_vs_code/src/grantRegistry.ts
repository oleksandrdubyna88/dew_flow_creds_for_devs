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
  mint(accountId: string, entityId: string, entityName: string, kind: string): Grant {
    this.prune();
    const grant: Grant = {
      secret: newSecret(),
      accountId,
      entityId,
      entityName,
      kind,
      status: 'pending',
    };
    this.grants.set(grant.secret, grant);
    return grant;
  }

  get(secret: string): Grant | undefined {
    return this.grants.get(secret);
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
   * is a live capability the person deliberately handed an agent and is never dropped by the
   * sweep. Only if a window somehow crosses the cap without a single denial does the last
   * resort fire: drop the oldest, insertion order, to keep the map bounded.</p>
   */
  private prune(): void {
    for (const [secret, grant] of this.grants) {
      if (grant.status === 'denied') {
        this.grants.delete(secret);
      }
    }
    while (this.grants.size >= GrantRegistry.MAX_GRANTS) {
      const oldest = this.grants.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.grants.delete(oldest);
    }
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
