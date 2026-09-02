import { entitySecretKeys } from './secretKeys';

/**
 * Secrets left in the OS keychain by a deletion that did not finish — found, and deleted.
 *
 * <p>The write-order invariant (see `storageManager.ts`) permits exactly ONE torn state: bytes in the
 * keychain that no node references. That is the safe side of every ordering decision, because an
 * orphan is invisible and harmless where the alternative — a node claiming a record that is not
 * there — is visible, broken, and it SYNCS. The plan called such an orphan "cleaned by a startup
 * sweep"; no sweep existed, and this is it.</p>
 *
 * <h3>Why it is driven by tombstones and not by listing the keychain</h3>
 *
 * <p>Because the keychain cannot be listed. `vscode.SecretStorage` is `get`/`store`/`delete` on a
 * KNOWN key, and every secret read in this codebase is driven by walking the LIVE node list — so once
 * a node is gone, its id is derivable from nothing and there is no candidate key to sweep. The code
 * review proposed budgeting a durable key index for this. The index already exists under another
 * name: deletion records a TOMBSTONE per removed id, kept for the cross-machine merge. Those ids are
 * exactly the ones whose secrets should no longer exist.</p>
 *
 * <p>Which is why the ordering change in `deleteNodeRecursive` matters: the tombstone is written
 * BEFORE the node is removed, so no interruption can produce an orphan that nothing names.</p>
 *
 * <h3>The honest limit</h3>
 *
 * <p>A tombstone pruned by the horizon before any sweep ran leaves an orphan that is never collected.
 * That is a keychain slot holding ciphertext no read path reaches — invisible and harmless, which is
 * precisely the state the invariant permits. It is the tolerated case, not a leak, and it is written
 * down rather than left for somebody to rediscover as a bug.</p>
 *
 * <p>Free of `vscode` (repository rule 3): the decision is pure, and the caller supplies the delete.</p>
 */

/**
 * Which recorded deletions still have secrets to clean up.
 *
 * <p>An id that is BOTH tombstoned and live is never swept — a re-created id wins over its own
 * tombstone. That is not a nicety: with the tombstone written first, an interrupted deletion leaves
 * exactly that pair, and sweeping it would delete the secrets of a live entry.</p>
 */
export function orphanCandidates(
  tombstonedIds: readonly string[],
  liveIds: readonly string[],
): readonly string[] {
  const live = new Set(liveIds);
  return tombstonedIds.filter((id) => !live.has(id));
}

/** Just the keychain verbs, so a test needs no vault and this module needs no `vscode`. */
export interface SecretSweepStore {
  get(key: string): Thenable<string | undefined>;
  delete(key: string): Thenable<void>;
}

export interface OrphanSweepResult {
  /** How many keys were actually holding something and were deleted. */
  readonly deleted: number;
  /** How many recorded deletions were checked. */
  readonly checked: number;
}

/**
 * Delete every keychain key belonging to a recorded deletion whose node is gone.
 *
 * <p>Reads before deleting, so the count reported is what was really there rather than the number of
 * keys tried — a sweep that says it deleted forty secrets when thirty-nine slots were already empty
 * would make every log line about it useless.</p>
 */
export async function sweepOrphanSecrets(
  store: SecretSweepStore,
  accountId: string,
  tombstonedIds: readonly string[],
  liveIds: readonly string[],
): Promise<OrphanSweepResult> {
  const candidates = orphanCandidates(tombstonedIds, liveIds);
  let deleted = 0;
  for (const entityId of candidates) {
    for (const key of entitySecretKeys(accountId, entityId)) {
      if ((await store.get(key)) !== undefined) {
        await store.delete(key);
        deleted++;
      }
    }
  }
  return { deleted, checked: candidates.length };
}
