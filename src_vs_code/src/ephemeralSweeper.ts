import * as vscode from 'vscode';
import { describeError } from './describeError';
import { LeaseMap, classifyLeases, leaseKey, prunedLeases } from './ephemeralLease';
import { burnsOnClose, expiredNodes, isExpired } from './entityExpiry';
import { StoredAccount, TreeNode } from './types';

/**
 * The clock behind short-lived entries: deletes what has run out, and renews the lease on
 * what a window is still holding open.
 *
 * <p>Two mechanisms, deliberately different. A `ttl` entry carries its own `expiresAt`,
 * written once when it is created and never touched again — so it syncs like any other field
 * and expires identically on every machine. An `onClose` entry carries no clock at all; its
 * life is a lease in machine-local `globalState` (see `ephemeralLease.ts`), because a renewed
 * timestamp ON the entity would republish it to the sync location every tick forever.</p>
 *
 * <p><b>Deleting is the whole point, and it goes through one door.</b> Everything here ends
 * at `deleteNodeRecursive`, which writes a causal tombstone and removes every SecretStorage
 * key including the revision history. A "burned" flag that left the node in place would leave
 * the old secret readable from history, present in the next backup, and — with no tombstone —
 * resurrected by the next machine to sync.</p>
 *
 * <p>A fault in the local metadata stops the sweep entirely. The same reasoning as
 * `SyncManager`'s fail-closed guard: when the node list cannot be trusted, "this entry has
 * expired" and "this entry is unreadable" are indistinguishable, and one of those two answers
 * deletes data.</p>
 */

/** Only what the sweep needs, so its test does not build a StorageManager. */
export interface SweepStorage {
  readonly metadataFault: string | undefined;
  getAccounts(): readonly StoredAccount[];
  getNodes(accountId: string): readonly TreeNode[];
  deleteNodeRecursive(accountId: string, id: string): Promise<string[]>;
}

/** How often the sweep wakes. Shorter than `LEASE_MS`, so a lease is renewed several times over. */
export const TICK_MS = 60_000;

const STATE_KEY = 'credSshManager.ephemeralLeases';

export interface SweepOutcome {
  /** Entity ids deleted because their own clock ran out. */
  readonly expired: readonly string[];
  /** Entity ids deleted because no window vouched for them any more. */
  readonly orphaned: readonly string[];
}

export class EphemeralSweeper implements vscode.Disposable {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;

  constructor(
    private readonly storage: SweepStorage,
    private readonly state: vscode.Memento,
    private readonly log: (message: string) => void = () => {},
    private readonly onChanged: () => void = () => {},
  ) {}

  /** Begin sweeping, starting with one pass now — a window opening is when orphans surface. */
  start(): void {
    if (this.timer !== undefined) {
      return;
    }
    this.timer = setInterval(() => void this.runOnce(), TICK_MS);
    void this.runOnce();
  }

  dispose(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /** One pass. Public so a command and the tests can drive it without waiting for a tick. */
  async runOnce(nowMs: number = Date.now()): Promise<SweepOutcome> {
    if (this.running || this.storage.metadataFault !== undefined) {
      return { expired: [], orphaned: [] };
    }
    this.running = true;
    try {
      return await this.sweep(nowMs);
    } finally {
      this.running = false;
    }
  }

  private async sweep(nowMs: number): Promise<SweepOutcome> {
    const expired: string[] = [];
    const orphaned: string[] = [];
    const liveKeys: string[] = [];
    const renewals: Record<string, number> = {};

    for (const account of this.storage.getAccounts()) {
      const plan = this.planFor(account.accountId, nowMs);
      liveKeys.push(...plan.liveKeys);
      Object.assign(renewals, plan.renewed);
      expired.push(...(await this.deleteAll(account.accountId, plan.expired, 'expired')));
      orphaned.push(...(await this.deleteAll(account.accountId, plan.orphaned, 'orphaned')));
    }

    await this.state.update(STATE_KEY, prunedLeases(renewals, liveKeys));
    if (expired.length + orphaned.length > 0) {
      this.onChanged();
    }
    return { expired, orphaned };
  }

  /** What this account's nodes say should happen, without touching anything yet. */
  private planFor(accountId: string, nowMs: number) {
    const nodes = this.storage.getNodes(accountId);
    const expired = expiredNodes(nodes, nowMs).map((n) => n.id);
    // A window-scoped entry that ALSO ran out of clock is already in `expired`; taking it
    // twice would be a second delete of an id that no longer exists.
    const windowScoped = nodes.filter(
      (n) => n.type === 'entity' && burnsOnClose(n) && !isExpired(n, nowMs),
    );
    const liveKeys = windowScoped.map((n) => leaseKey(accountId, n.id));
    const { renewed, lapsed } = classifyLeases(liveKeys, this.leases(), nowMs);
    const byKey = new Map(windowScoped.map((n) => [leaseKey(accountId, n.id), n.id]));
    return {
      expired,
      orphaned: lapsed.flatMap((key) => (byKey.has(key) ? [byKey.get(key) as string] : [])),
      renewed,
      liveKeys,
    };
  }

  private leases(): LeaseMap {
    const stored = this.state.get<LeaseMap>(STATE_KEY, {});
    return typeof stored === 'object' && stored !== null ? stored : {};
  }

  /** Delete each id, letting one failure be recorded and skipped rather than stopping the sweep. */
  private async deleteAll(
    accountId: string,
    ids: readonly string[],
    why: string,
  ): Promise<string[]> {
    const done: string[] = [];
    for (const id of ids) {
      try {
        await this.storage.deleteNodeRecursive(accountId, id);
        this.log(`Ephemeral entry ${id} deleted (${why}).`);
        done.push(id);
      } catch (error) {
        this.log(`Could not delete ephemeral entry ${id}: ${describeError(error)}`);
      }
    }
    return done;
  }
}
