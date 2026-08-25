/**
 * When a sync cycle may skip the merge altogether (audit 2026-08-25, C4).
 *
 * <p>The expensive part of a cycle was never the merge or its fingerprints — it was building
 * the LOCAL snapshot to merge: seven keychain reads per entity, so a thousand-entry vault made
 * 7,000 cross-process calls every five minutes to find out that nothing had changed. A cycle
 * that ends with nothing applied and nothing written has proved local, remote and merged
 * identical; the mark left behind names the two inputs it saw — the storage's change token
 * and the hash of the remote bytes. The next cycle skips the snapshot and the merge exactly
 * when both are still what the mark says. Either one moving — a local edit, a foreign write,
 * a keychain change event, a different file at the sync location — misses, and the cycle runs
 * in full.</p>
 *
 * <p>Pure and free of `vscode`, so the decision is a unit test rather than a hope.</p>
 */

/** What the last cycle left behind for one account when it ended converged. */
export interface ConvergedMark {
  /** `StorageManager.changeToken` as read at the START of that cycle, before the snapshot. */
  readonly token: string;
  /** SHA-256 of the remote envelope's exact bytes as that cycle saw them. */
  readonly rawHash: string;
}

/**
 * Whether nothing has moved on either side since the mark was taken.
 *
 * <p>A missing remote (`rawHash === undefined`) is never idle: it means the first write to a
 * location has yet to happen, and the cycle must run to make it.</p>
 */
export function isIdleCycle(
  mark: ConvergedMark | undefined,
  token: string,
  rawHash: string | undefined,
): boolean {
  return (
    mark !== undefined && rawHash !== undefined && mark.token === token && mark.rawHash === rawHash
  );
}

/**
 * The mark a finished cycle leaves for the next one — or nothing, when it applied or wrote
 * anything, because then the inputs it saw are no longer the state that exists.
 */
export function markAfterCycle(
  applied: boolean,
  wrote: boolean,
  token: string,
  rawHash: string | undefined,
): ConvergedMark | undefined {
  if (applied || wrote || rawHash === undefined) {
    return undefined;
  }
  return { token, rawHash };
}
