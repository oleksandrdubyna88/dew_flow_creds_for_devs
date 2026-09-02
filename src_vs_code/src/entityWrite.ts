/**
 * Creating an entity: its secrets, then its node — and if anything throws, the secrets go back.
 *
 * <p>Rule A says a create writes the secret first, so the only torn state a crash can leave is a
 * secret nothing points at. `orphanSweep.ts` collects those from the tombstones a DELETION recorded —
 * but a create has no tombstone, so its id is in neither the tree nor any record, and that orphan is
 * uncollectable. The review escalated it from a tidiness point to a security one, and the framing is
 * fair: a create that keeps failing keeps leaving keychain slots nobody can reach or account for.</p>
 *
 * <h3>What this does, and what it deliberately does not</h3>
 *
 * <p>It compensates. Every failure this process can OBSERVE — a keychain refusal, a rejected node
 * write, a validation throw — deletes what it wrote before rethrowing, so the id leaves nothing
 * behind. That covers the failures that actually happen.</p>
 *
 * <p>It does NOT cover a process KILL between the writes, and nothing here pretends to. Covering that
 * needs a durable record written before the first secret. Two candidates were considered and both
 * rejected for stated reasons:</p>
 *
 * <ul>
 *   <li><b>Reusing the tombstone list</b> — appealing, because the sweep already reads it and
 *       `addNode` already forgets a revived id. Rejected because tombstones SYNC: a cycle running in
 *       that window would publish a deletion for an id that never existed, and if the create then
 *       succeeded, another machine could apply that tombstone to a live entry. Trading an unreachable
 *       orphan for cross-machine data loss is the wrong direction.</li>
 *   <li><b>A machine-local pending-id list</b> — no sync risk, but it needs a rule for telling a
 *       genuinely abandoned id from one whose create is in flight, which means timestamps and an
 *       expiry window: a second consistency problem to keep honest.</li>
 * </ul>
 *
 * <p>So the residual is a create interrupted by a process kill, between the first secret write and the
 * node write. Narrow, tolerated, and written down here rather than left to be rediscovered.</p>
 *
 * <p><b>The caller supplies the undo</b>, which is the point: it knows exactly which secrets it wrote,
 * and undoing precisely those is safe where deleting everything the id owns would not be. This is for
 * CREATES — on an update, "delete what this entity owns" would delete the values being replaced.</p>
 *
 * <p>Free of `vscode` (repository rule 3), and free of `StorageManager` too — it takes callbacks, so
 * it needed no new method on a class whose file is at its size-ratchet baseline.</p>
 */
export async function createEntityWithSecrets(
  writeSecrets: () => Promise<void>,
  writeNode: () => Promise<void>,
  undoSecrets: () => Promise<void>,
): Promise<void> {
  try {
    await writeSecrets();
    await writeNode();
  } catch (error) {
    // Best-effort by construction: if the undo fails too, the caller hears the ORIGINAL error,
    // because that is the one describing what went wrong. A failure to tidy up must not mask the
    // failure that made tidying necessary.
    try {
      await undoSecrets();
    } catch {
      // Deliberately swallowed — see above.
    }
    throw error;
  }
}
