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

  /** Mint a fresh pending grant and return it (its `secret` is the key). */
  mint(accountId: string, entityId: string, entityName: string, kind: string): Grant {
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
