/**
 * Which window-scoped entries are still under a live window's care.
 *
 * <p><b>Why a lease and not a close event.</b> "Until this window closes" cannot be an event
 * handler: a window that crashes, is killed, or loses power never runs its handler, and the
 * entry it promised to destroy then lives forever holding a working secret — the failure
 * lands in the one direction the feature exists to prevent. An event would also need to know
 * WHICH window owns an entry, and no window identity exists in this extension; inventing one
 * would put a machine-local concept into a record that syncs.</p>
 *
 * <p>So an open window renews a lease instead, and anything whose lease has lapsed is swept.
 * Crash-safety is then structural rather than best-effort: nobody has to run any code for the
 * entry to die. The honest description of what this delivers is "shortly after VS Code
 * closes", bounded by {@link LEASE_MS} plus the time until the next window opens — and since
 * every window on the machine renews, the last one to close is the one that matters.</p>
 *
 * <p><b>Why the lease is local and never rides on the entity.</b> Every write to a node goes
 * through `StorageManager.stampVector`, which bumps its causal version — so renewing a lease
 * stored in `EntityMetadata` would republish that entity to the sync location once a minute,
 * forever, for as long as a window is open. The lease therefore lives in `globalState`, which
 * is machine-local and shared between the windows of one machine: exactly the scope the
 * feature means, and one write per tick regardless of how many ephemeral entries exist.</p>
 *
 * <p>Pure, in the shape of `entityExpiry.ts` — this answers WHICH keys have lapsed, and the
 * sweeper that owns the clock does the deleting.</p>
 */

/** Entity key -> the moment a window last vouched for it. */
export type LeaseMap = Readonly<Record<string, number>>;

/**
 * How long an entry outlives the last window that renewed it.
 *
 * <p>Longer than the sweep interval by enough that a busy or suspended machine cannot lapse a
 * lease it meant to renew — a laptop that sleeps for thirty seconds must not destroy the
 * entry the person is about to come back to.</p>
 */
export const LEASE_MS = 5 * 60_000;

/** Two profiles can hold the same entity id; a lease that ignored that would cross them. */
export function leaseKey(accountId: string, entityId: string): string {
  return `${accountId}:${entityId}`;
}

function isLive(at: number | undefined, nowMs: number): boolean {
  return typeof at === 'number' && nowMs - at < LEASE_MS;
}

/**
 * What to do with each window-scoped entry this tick.
 *
 * <p>An entry with no lease at all is ADOPTED rather than deleted, and that is the case worth
 * naming: it is what a freshly created entry looks like for the moment before its first
 * renewal, and it is also what an entry SYNCED from another machine looks like forever. A
 * sweep that deleted the unleased would destroy a colleague's — or your other laptop's —
 * live entry the instant it arrived here. Adoption means such an entry lives until THIS
 * machine's last window closes, which is the only promise this machine can keep about it.</p>
 */
export function classifyLeases(
  keys: readonly string[],
  map: LeaseMap,
  nowMs: number,
): { readonly renewed: LeaseMap; readonly lapsed: readonly string[] } {
  const renewed: Record<string, number> = {};
  const lapsed: string[] = [];
  for (const key of keys) {
    const seen = Object.prototype.hasOwnProperty.call(map, key);
    if (seen && !isLive(map[key], nowMs)) {
      lapsed.push(key);
    } else {
      renewed[key] = nowMs; // fresh, or never seen here before and therefore adopted
    }
  }
  return { renewed, lapsed };
}

/**
 * The stored map reduced to the entries that still name something.
 *
 * <p>Without this the map is append-only: every ephemeral entry ever created leaves a key
 * behind, in a `globalState` value that is read and rewritten every tick for the life of the
 * window. The keys are also entity ids, so a map that never forgets is a lengthening record
 * of what used to exist.</p>
 */
export function prunedLeases(map: LeaseMap, liveKeys: readonly string[]): LeaseMap {
  const live = new Set(liveKeys);
  return Object.fromEntries(Object.entries(map).filter(([key]) => live.has(key)));
}
