import { CorpPolicyState } from './corpPolicy';

/**
 * The offline lease: how long an honest client keeps working for a corporate account without
 * hearing from its server, and what a client does when it stops being entitled to.
 *
 * <p>Pure — no `vscode`, no clock of its own — so every row of the truth table below is a test.</p>
 */

/**
 * How stale a **strictly online** client may be.
 *
 * <p>`offlineLeaseHours: 0` cannot honestly mean "expired one millisecond after the fetch": the
 * readiness loop refreshes on a cadence, and a predicate that expired between two refreshes would
 * lock somebody out while they were online and the client was working perfectly. The implementable
 * reading — the one the plan round demanded — is "expired once the last successful read is older
 * than a refresh, with slack". Five minutes is that slack; it is also the horizon the login key is
 * revalidated on, deliberately, so the two do not disagree about what recent means.</p>
 */
export const STRICT_ONLINE_GRACE_MS = 5 * 60 * 1000;

/** What a window knows about an account's standing, from this session and from the last one. */
export interface LeaseFacts {
  /** The policy document this window holds, or nothing when it has not read one this session. */
  readonly state?: CorpPolicyState;
  /**
   * The persisted time of the last SUCCESSFUL policy read, from `globalState`.
   *
   * <p>It is the evidence that this account is corporate at all. Without it, "no document" means a
   * personal account or a fresh install — nothing to expire. With it, "no document" means a
   * corporate account whose document this window could not read, which is the case that must fail
   * CLOSED: otherwise clearing a cache would be enough to escape the lease.</p>
   */
  readonly lastHeartbeat?: number;
}

/** Why an account is not usable right now, or empty when it is. */
export type LockedReason = '' | 'deactivated' | 'leaseExpired';

/** The window a lease allows, in milliseconds. `0` hours is strictly online, not "instantly stale". */
export function leaseWindowMs(leaseHours: number): number {
  return leaseHours > 0 ? leaseHours * 60 * 60 * 1000 : STRICT_ONLINE_GRACE_MS;
}

/**
 * Whether this account's knowledge of its server has gone stale enough to stop trusting.
 *
 * <p>Four rows. A personal account never expires — a corporate rule must not reach an account that
 * is not subject to one. A corporate account expires when its last successful read is older than
 * its lease. A window with no document but a persisted heartbeat is a corporate account whose
 * document it could not read: it expires on the strictest window, because the alternative is that
 * deleting a cache buys unlimited offline use. A window with no document and no heartbeat has never
 * spoken to a corporate server and has nothing to be stale about.</p>
 */
export function leaseExpired(facts: LeaseFacts, now: number): boolean {
  const state = facts.state;
  if (state === undefined) {
    return facts.lastHeartbeat !== undefined && now - facts.lastHeartbeat > STRICT_ONLINE_GRACE_MS;
  }
  if (!state.corpMode) {
    return false;
  }
  return now - state.fetchedAt > leaseWindowMs(state.leaseHours);
}

/**
 * Why this account is locked, in one word a caller can turn into a sentence.
 *
 * <p>Deactivation outranks the lease: somebody an administrator has blocked is not "offline too
 * long", and telling them to reconnect would send them to fix the wrong thing.</p>
 */
export function lockedReason(facts: LeaseFacts, now: number): LockedReason {
  if (deactivated(facts.state)) {
    return 'deactivated';
  }
  return leaseExpired(facts, now) ? 'leaseExpired' : '';
}

/** An administrator has blocked this account, as the last document this window read says. */
function deactivated(state: CorpPolicyState | undefined): boolean {
  if (state === undefined || !state.corpMode) {
    return false;
  }
  return !state.active;
}

/**
 * The sentence a person sees, naming what to DO — the finding that a locked client with no way
 * forward is a person stuck, not a person secured.
 */
export function describeLocked(reason: LockedReason, email: string): string {
  if (reason === 'deactivated') {
    return `${email} has been deactivated by an administrator, so this vault cannot be opened here. `
      + 'Ask an administrator to re-activate the account.';
  }
  if (reason === 'leaseExpired') {
    return `${email} has not reached its organisation server recently enough to keep working offline. `
      + 'Run "CredsForDevs: Sync Now" while connected; nothing has been deleted, and one successful '
      + 'sync restores everything.';
  }
  return '';
}
