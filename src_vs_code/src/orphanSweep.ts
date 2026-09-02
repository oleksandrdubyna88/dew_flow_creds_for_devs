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
 * <h3>The two classes of orphan this cannot collect</h3>
 *
 * <p>Both are tolerated rather than hidden, and both are the price of Rule A rather than oversights.
 * An uncollected orphan is a keychain slot holding ciphertext no read path reaches — invisible and
 * harmless, which is precisely the state the invariant permits. What it is NOT is a leak.</p>
 *
 * <ol>
 *   <li><b>A tombstone pruned by the horizon</b> before any sweep ran. The id is then named nowhere.</li>
 *   <li><b>An addition interrupted before its node was ever written</b> — raised by the review, and
 *       the sharper of the two. Rule A writes the secret first, so a crash in that window leaves a
 *       secret whose id is in neither the live tree nor any tombstone, because the id was minted in
 *       memory and never persisted anywhere.</li>
 * </ol>
 *
 * <p><b>Why the second is not fixed.</b> Collecting it needs a durable record written BEFORE the
 * secret — a pending-write index — which makes an entry THREE writes to three stores instead of two,
 * each pair with its own torn states, and the index itself then needs a rule for what to do with a
 * stale entry it cannot distinguish from a live one. That is more failure surface bought to collect
 * bytes that are already unreachable. The trade is recorded so the next reader can disagree with the
 * reasoning rather than assume nobody thought about it.</p>
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

/** Just the tombstone verbs, so this needs no `StorageManager` and no `vscode`. */
export interface TombstoneStore {
  getTombstones(accountId: string): Record<string, { deletedAt: number; v: Record<string, number> }>;
  setTombstones(accountId: string, tombstones: Record<string, { deletedAt: number; v: Record<string, number> }>): Promise<void>;
}

/**
 * An id that exists again is not deleted, so its tombstone goes.
 *
 * <p>Defence in depth rather than a fix: `orphanCandidates` already refuses an id that is both
 * tombstoned and live, because that pair is exactly what an interrupted deletion leaves. Raised by
 * the review anyway, and worth taking — it removes a whole class of reasoning ("what if the live
 * check is stale?") instead of answering it, and it stops the tombstone list growing a permanent
 * entry for every id that ever came back.</p>
 *
 * <p>Here rather than on `StorageManager` because that file is at its size-ratchet baseline and this
 * is tombstone-and-sweep logic, which is what this module is.</p>
 */
export async function forgetTombstone(store: TombstoneStore, accountId: string, entityId: string): Promise<void> {
  const tombstones = store.getTombstones(accountId);
  if (tombstones[entityId] === undefined) {
    return;
  }
  const { [entityId]: _revived, ...rest } = tombstones;
  await store.setTombstones(accountId, rest);
}
