/** The prefix of the per-account node list key — shared so the resume can recognise one. */
export const NODES_KEY_PREFIX = 'credSshManager.nodes.';

/**
 * Account data whose account is no longer listed: what a killed window left behind.
 *
 * <p>Removing an account has to delete a profile, a node tree, a tombstone list, a horizon and one
 * keychain key per secret per entity. It cannot be atomic, so the question is only which torn state
 * a kill leaves — and this is the one place where the answer is not the entity-level Rule A, because
 * the whole ACCOUNT is going.</p>
 *
 * <p>The review found the previous answer wrong: it wrote tombstones first, then wiped the tree.
 * Killed in between, that leaves ids that are both tombstoned and live, which `orphanCandidates`
 * deliberately refuses to sweep (for an entity that state means a deletion merely unfinished). So
 * nothing ever finished it: the entries stayed visible here, their tombstones synced a deletion to
 * every other machine, and their secrets were never collected. Both providers raised it
 * independently, on my own fix.</p>
 *
 * <p><b>The order that needs no new durable record.</b> Take the account out of the accounts list
 * FIRST. It is then invisible to the UI and — the part that makes this safe — to the sync cycle,
 * which iterates `getAccounts()`; nothing can publish anything about it. Its node list key is still
 * in `globalState`, and that key NAMES every id whose secrets are still to be deleted. So the
 * durable record Rule B asks for is the tree itself, which is exactly the thing that used to be
 * destroyed first.</p>
 *
 * <p>Then: delete the secrets (ids read from the still-present tree), then drop the tree, the
 * tombstones and the horizon. A kill at any point leaves an unlisted account whose remaining data is
 * fully named by its own node list — and `Memento.keys()` finds it without a marker of any kind,
 * including data left by a version of this extension that crashed before this function existed.</p>
 */
export function orphanedAccountIds(
  storedKeys: readonly string[],
  listedAccountIds: readonly string[],
): readonly string[] {
  const listed = new Set(listedAccountIds);
  return storedKeys
    .filter((key) => key.startsWith(NODES_KEY_PREFIX))
    .map((key) => key.slice(NODES_KEY_PREFIX.length))
    .filter((accountId) => accountId.length > 0 && !listed.has(accountId));
}
