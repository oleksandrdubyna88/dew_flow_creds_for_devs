/**
 * "This vault has not synced for N days" — the when, kept pure.
 *
 * <p>A nag with a timing bug is worse than no nag: too often and it teaches people to
 * dismiss it, too rare and it fails its one job — telling you that the off-machine copy
 * of your credentials has quietly stopped moving (a lock left on, a PIN cleared, a NAS
 * that unmounted, a server that stopped answering).</p>
 */

export const STALE_AFTER_MS = 3 * 24 * 60 * 60 * 1000;
export const REMIND_EVERY_MS = 4 * 60 * 60 * 1000;

export interface SyncReminderFacts {
  /** Last SUCCESSFUL sync of this account, epoch ms. Absent = never synced here. */
  lastSyncMs?: number;
  /** When this machine first saw the account — the anchor when it never synced. */
  firstSeenMs?: number;
  /** When the reminder was last shown, epoch ms. */
  lastRemindedMs?: number;
  nowMs: number;
}

export interface SyncReminderVerdict {
  due: boolean;
  /** Whole days since the anchor — for the message. */
  staleDays?: number;
}

// eslint-disable-next-line complexity
export function syncReminderDue(facts: SyncReminderFacts): SyncReminderVerdict {
  // A fresh sync ends the conversation whatever the repeat gate says — checked FIRST,
  // so the gate cannot outlive the thing it nags about.
  const anchor = facts.lastSyncMs ?? facts.firstSeenMs;
  if (anchor === undefined) {
    return { due: false };
  }
  const silentFor = facts.nowMs - anchor;
  if (silentFor < STALE_AFTER_MS) {
    // Also covers a clock that moved backwards: negative silence is not staleness.
    return { due: false };
  }
  if (facts.lastRemindedMs !== undefined && facts.nowMs - facts.lastRemindedMs < REMIND_EVERY_MS) {
    return { due: false };
  }
  return { due: true, staleDays: Math.floor(silentFor / (24 * 60 * 60 * 1000)) };
}
