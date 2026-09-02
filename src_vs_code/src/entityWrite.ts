/**
 * Creating an entity: its secrets, then its node — and if anything throws, both go back, in the
 * order the invariant demands of a removal.
 *
 * <p>Rule A says a create writes the secret first, so the only torn state a crash can leave is a
 * secret nothing points at. `orphanSweep.ts` collects those from the tombstones a DELETION recorded —
 * but a create has no tombstone, so its id is in neither the tree nor any record, and that orphan is
 * uncollectable. The review escalated it from a tidiness point to a security one, and the framing is
 * fair: a create that keeps failing keeps leaving keychain slots nobody can reach or account for.</p>
 *
 * <h3>It compensates ONE case, and the review is why</h3>
 *
 * <p>The first version deleted the secrets and rethrew. The second added a node retraction in front
 * of that, because `writeNode` can fail <i>after</i> the node is persisted — an error raised while
 * flushing, a rejection from a memento that has already taken the value — and deleting the secrets
 * then leaves a live node claiming a record that is not there.</p>
 *
 * <p>The third round is what settled it, because the two review providers demanded <b>opposite</b>
 * things about that retraction. One: a tombstone built from the node's own vector may not dominate a
 * concurrent remote edit, so the remote live node syncs back over deleted secrets. The other: a
 * tombstone that DOES dominate will clobber a peer where the entity legitimately exists. Both are
 * right, and together they say there is no local answer — a machine cannot decide, from its own
 * failure, what other machines are entitled to keep.</p>
 *
 * <p>So the compensation covers only the case it can settle alone: <b>the node never landed</b>.
 * Nothing could have published it, so its secrets are unreachable by construction and deleting them
 * is unambiguous. When the node DID land, this leaves both halves alone: the entry is live and holds
 * its values — a consistent entry, arrived at by a failing path — and the caller still hears the
 * error. An entry that exists when the person was told it did not is a surprise; deleting a
 * credential from under a node that other machines can see is data loss.</p>
 *
 * <h3>What this deliberately does not cover</h3>
 *
 * <p>Every failure this process can OBSERVE. NOT a process KILL between the writes, and nothing here
 * pretends to. Covering that needs a durable record written before the first secret. Two candidates
 * were considered and both rejected for stated reasons:</p>
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
 * <p><b>The caller supplies the undo</b>, which is the point: it knows exactly which secrets it
 * wrote, and undoing precisely those is safe where deleting everything the id owns would not be. This
 * is for CREATES — on an update, "delete what this entity owns" would delete the values being
 * replaced, and `nodeLanded` would answer true for an entry that existed before the save.</p>
 *
 * <p>Free of `vscode` (repository rule 3), and free of `StorageManager` too — it takes callbacks, so
 * it needed no new method on a class whose file is at its size-ratchet baseline.</p>
 */
export interface EntityCreate {
  /** The additions: every secret this new entity is to hold. */
  writeSecrets: () => Promise<void>;
  /** The node that will reference them. */
  writeNode: () => Promise<void>;
  /** Is the node in the tree NOW? The single question that decides whether anything is undone. */
  nodeLanded: () => boolean;
  /** Delete exactly the secrets `writeSecrets` writes. Runs only when the node did NOT land. */
  undoSecrets: () => Promise<void>;
}

export async function createEntityWithSecrets(create: EntityCreate): Promise<void> {
  try {
    await create.writeSecrets();
    await create.writeNode();
  } catch (error) {
    await compensate(create);
    // The caller hears the ORIGINAL error, because that is the one describing what went wrong. A
    // failure to tidy up must not mask the failure that made tidying necessary.
    throw error;
  }
}

/** Undo only what is unambiguously undoable: the case where the node never reached the tree. */
async function compensate(create: EntityCreate): Promise<void> {
  if (create.nodeLanded()) {
    return;
  }
  try {
    await create.undoSecrets();
  } catch {
    // An orphan is the one torn state the invariant permits, and `orphanSweep.ts` explains why.
  }
}
