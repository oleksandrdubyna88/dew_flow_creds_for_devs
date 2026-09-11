import { burnIfSpent } from './brokerResponse';

/**
 * One call at a time for an entry that may only be used once — and the second one refused.
 *
 * <p>`burnIfSpent` runs AFTER the answer is on the wire, deliberately: a storage failure while
 * burning must not cost an agent a result it already earned. The consequence is that two concurrent
 * calls on a `oneUse` entry both ran before either burned — and the MCP door mints a grant per
 * call, so two different tokens reach the same entry (audit 2026-09-09, finding #3). "Until an
 * agent uses it once" is an option in the entry form; it is a promise the interface makes.</p>
 *
 * <p>Only one-use entries queue. Two parallel queries against an ordinary `prod-db` keep running in
 * parallel: serialising everything would trade a real capability for a guarantee only one kind of
 * entry needs.</p>
 */

export interface LaneOutcome<T> {
  /** What the work answered, when it ran. */
  readonly value?: T;
  /** The entry was already spent by the call ahead in this lane, so nothing ran. */
  readonly spent: boolean;
}

export class OneUseLane {
  /**
   * The tail of each entity's queue, and the entities already spent this window.
   *
   * <p>Both are pruned: the queue entry when its last promise settles, so the map never outgrows
   * the set of IN-FLIGHT entries; the spent set never, because it is the memory that refuses a
   * second call, and it lives exactly as long as the window a grant can live in.</p>
   */
  private readonly tails = new Map<string, Promise<unknown>>();

  private readonly spent = new Set<string>();

  /**
   * Run `work` with nothing else running for this entity — or refuse, if it is already spent.
   *
   * <p><b>The refusal happens before `work`.</b> The first design let the second call through and
   * relied on the action's own "no longer exists" lookup, which the review gate pointed out is
   * still an invocation: a handler that does anything before that lookup would do it twice.</p>
   *
   * <p>The chain advances on failure as well as success — `.then(next, next)` rather than
   * `.then(next)`. A rejection propagating down the queue would fail every call behind it with
   * somebody else's error, which the gate also caught.</p>
   */
  async run<T>(entityId: string, work: () => Promise<T>): Promise<LaneOutcome<T>> {
    const ours = (this.tails.get(entityId) ?? Promise.resolve()).then(
      () => this.afterTheQueue(entityId, work),
      () => this.afterTheQueue(entityId, work),
    );
    this.tails.set(entityId, ours);
    try {
      return await ours;
    } finally {
      // Only if nobody queued behind us: whoever did owns the tail now.
      if (this.tails.get(entityId) === ours) {
        this.tails.delete(entityId);
      }
    }
  }

  private async afterTheQueue<T>(entityId: string, work: () => Promise<T>): Promise<LaneOutcome<T>> {
    if (this.spent.has(entityId)) {
      return { spent: true };
    }
    return { value: await work(), spent: false };
  }

  /** Said by the caller once the entry is gone, so the next call in the lane refuses. */
  markSpent(entityId: string): void {
    this.spent.add(entityId);
  }
}

/**
 * Burn a spent one-use entry, and remember that it is spent.
 *
 * <p>The burn stays best-effort and stays AFTER the answer — a storage failure must not cost an
 * agent a result it already earned. But the lane is marked either way: the entry was USED, and a
 * second call in this window must not use it again even if storage would not let the file go.</p>
 */
export async function burnAndMark(
  lane: OneUseLane,
  burnAfterUse: ((accountId: string, entityId: string) => Promise<boolean>) | undefined,
  isOneUse: ((accountId: string, entityId: string) => boolean) | undefined,
  grant: { accountId: string; entityId: string; entityName: string },
  status: number,
  note: (message: string) => void,
): Promise<void> {
  await burnIfSpent(burnAfterUse, grant, status, note);
  if (status === 200 && isOneUse?.(grant.accountId, grant.entityId) === true) {
    lane.markSpent(grant.entityId);
  }
}
