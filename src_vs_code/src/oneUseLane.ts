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

/**
 * The queue an entry joins: its ACCOUNT and its id, never the id alone.
 *
 * <p>Storage addresses an entry by both, so two accounts may hold entries with the same id — and a
 * lane keyed by the bare id would mark one account's entry spent and refuse the other's. A
 * reviewer's, and it costs a string concatenation.</p>
 */
export function laneKeyFor(accountId: string, entityId: string): string {
  return `${accountId}/${entityId}`;
}

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
   * How many spent entries stay on record.
   *
   * <p>The set must outlive the entries themselves — it IS the memory that refuses a second call —
   * so it cannot be pruned when an entry goes. It can be bounded, which is the house rule that
   * everything which grows has an owner (see `MAX_DENIED_TOMBSTONES` next door). Far more than any
   * window's one-use entries; past it the oldest marker falls out and a second call on that entry
   * meets the action's own "no longer exists" instead, which is where it landed before this lane
   * existed.</p>
   */
  private static readonly MAX_SPENT = 512;

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

  /**
   * Whether this window has already spent that entry.
   *
   * <p>Asked BEFORE the one-use question rather than after, and that order is load-bearing. The
   * one-use question is answered from storage, and a burned entry is not in storage — so once the
   * first call has finished, the second call's entry no longer looks one-use, it skips the queue
   * entirely, and it runs. The lane is the authority on what this window has spent; storage is
   * the authority on what the entry IS, and those stop agreeing the moment it burns.</p>
   */
  isSpent(key: string): boolean {
    return this.spent.has(key);
  }

  /** Said by the caller once the entry is gone, so the next call in the lane refuses. */
  markSpent(key: string): void {
    this.spent.add(key);
    // Set iteration is insertion-ordered, so this drops the oldest marker first.
    for (const oldest of this.spent) {
      if (this.spent.size <= OneUseLane.MAX_SPENT) {
        break;
      }
      this.spent.delete(oldest);
    }
  }
}

/**
 * Burn a spent one-use entry, and remember that it is spent.
 *
 * <p>The burn stays best-effort and stays AFTER the answer — a storage failure must not cost an
 * agent a result it already earned. But the lane is marked either way: the entry was USED, and a
 * second call in this window must not use it again even if storage would not let the file go.</p>
 *
 * <p><b>The question is asked BEFORE the burn, and that ordering is the whole correctness of this
 * function.</b> `isOneUse` reads the node out of storage and the burn DELETES that node, so asking
 * afterwards always answers "not one-use" and the lane was never marked — in production only, since
 * a stub that answers from a boolean rather than from storage cannot show it. Found by the review
 * gate; the harness now answers the way `oneUseIn(storage)` does.</p>
 */
export async function burnAndMark(
  lane: OneUseLane,
  burnAfterUse: ((accountId: string, entityId: string) => Promise<boolean>) | undefined,
  isOneUse: ((accountId: string, entityId: string) => boolean) | undefined,
  grant: { accountId: string; entityId: string; entityName: string },
  status: number,
  note: (message: string) => void,
): Promise<void> {
  const wasOneUse = isOneUse?.(grant.accountId, grant.entityId) === true;
  await burnIfSpent(burnAfterUse, grant, status, note);
  if (status === 200 && wasOneUse) {
    lane.markSpent(laneKeyFor(grant.accountId, grant.entityId));
  }
}
