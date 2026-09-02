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
 * <h3>The compensation obeys Rule A too — which is the whole subtlety</h3>
 *
 * <p>A first version deleted the secrets and rethrew. The review found the case that makes that
 * WORSE than not compensating at all: `writeNode` can fail <i>after</i> the node is persisted (an
 * error raised while flushing, a rejection from a memento that has already taken the value). Delete
 * the secrets then, and the result is a live node claiming a record that is not there — the one torn
 * state the invariant forbids, and the one that SYNCS.</p>
 *
 * <p>So undoing is a REMOVAL, and a removal writes the referrer first: `undoNode`, then
 * `undoSecrets`. And if `undoNode` fails, the secrets are <b>left alone</b> — an orphan is the
 * tolerated state, a node pointing at nothing is not. Refusing to tidy is the correct answer when
 * the thing that would make tidying safe could not be done.</p>
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
 * <p><b>The caller supplies both undos</b>, which is the point: it knows exactly which secrets it
 * wrote, and undoing precisely those is safe where deleting everything the id owns would not be. This
 * is for CREATES — on an update, "delete what this entity owns" would delete the values being
 * replaced, and `undoNode` would delete an entry that existed before the save.</p>
 *
 * <p>Free of `vscode` (repository rule 3), and free of `StorageManager` too — it takes callbacks, so
 * it needed no new method on a class whose file is at its size-ratchet baseline.</p>
 */
export interface EntityCreate {
  /** The additions: every secret this new entity is to hold. */
  writeSecrets: () => Promise<void>;
  /** The node that will reference them. */
  writeNode: () => Promise<void>;
  /** Make the node not exist. Must be a no-op when it never did — the failure may predate it. */
  undoNode: () => Promise<void>;
  /** Delete exactly the secrets `writeSecrets` writes. Runs only once the node is proven gone. */
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

/** Referrer first, referent second — and nothing at all if the referrer will not go. */
async function compensate(create: EntityCreate): Promise<void> {
  try {
    await create.undoNode();
  } catch {
    return; // The node may still be there; leaving its secrets reachable is the safer half.
  }
  try {
    await create.undoSecrets();
  } catch {
    // An orphan is the one torn state the invariant permits, and `orphanSweep.ts` explains why.
  }
}
