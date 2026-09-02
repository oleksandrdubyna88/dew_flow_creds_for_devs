import { describeError } from './describeError';

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
 * <h3>"Landed" is a READ, and it fails closed</h3>
 *
 * <p>`nodeLanded` is `!storage.provenAbsent(...)` — a look at the tree, never an inference from the
 * error. The distinction the review asked for is between a missing row and a tree that cannot be read
 * at all: `openNodesSlot` answers `[]` and records a `metadataFault` when the sealed cache will not
 * open (a device key reset, a corrupted cache, `init()` not run), and every node then reads as missing.
 * Harmless for rendering — the tree repopulates from the next sync — and catastrophic here, because
 * the compensation would conclude nothing landed and delete the secrets of entities that all exist.
 * So absence must be PROVEN, and a fault proves nothing.</p>
 *
 * <p>That the read is of the local tree is also what makes the whole thing safe: sync publishes from
 * that same tree (`getSnapshot` → `exportBundle` → `getNodes`), so a node absent from it was never
 * published, whatever the failed write reported.</p>
 *
 * <p>And "unknown" is not "absent". Failing closed alone would leave the aborted create's secrets in
 * the keychain with nothing naming them — the review's point, and it is right: an orphan nobody can
 * collect is the class this whole story exists to shrink. So an unreadable tree DEFERS instead: the id
 * goes into the same local `pendingCleanup` record the removals use, and the sweep collects it once
 * the tree can say it is really gone.</p>
 *
 * <p>So the compensation deletes only in the case it can settle alone: <b>the node never landed</b>.
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
  /** Is the node in the tree NOW — or can the tree not say? The question that decides everything. */
  presence: () => 'present' | 'absent' | 'unknown';
  /** Delete exactly the secrets `writeSecrets` writes. Runs only on a PROVEN absence. */
  undoSecrets: () => Promise<void>;
  /** Hand this id to the sweep, for when the tree cannot say yet. */
  deferCleanup: () => Promise<void>;
}

/**
 * A create that FAILED but left the entry behind — thrown so the person is not told a flat untruth.
 *
 * <p>Both providers raised the same consequence of leaving a landed entry alone: the person is shown
 * "creating failed", retries the same form, and gets a duplicate — or cannot tell which of the two is
 * the real one. Leaving the entry is still right (the alternative is deleting a credential from under
 * a node other machines can see), so what has to change is what the person is TOLD.</p>
 *
 * <p>An idempotency key was considered and is the wrong size for this: the entry is in the tree in
 * front of them, and a sentence naming it is worth more than a retry protocol.</p>
 */
export class EntryLandedError extends Error {
  constructor(override readonly cause: unknown) {
    super(
      `The entry was created, but the rest of the save did not finish: ${describeError(cause)}. `
        + 'It is in your tree — check it before creating another.',
    );
    this.name = 'EntryLandedError';
  }
}

export async function createEntityWithSecrets(create: EntityCreate): Promise<void> {
  try {
    await create.writeSecrets();
    await create.writeNode();
  } catch (error) {
    const where = create.presence();
    if (where === 'present') {
      // Nothing is undone — and the caller is told the entry EXISTS, wrapped around the original
      // error rather than instead of it, so the log still says what actually went wrong.
      throw new EntryLandedError(error);
    }
    await tidy(where === 'absent' ? create.undoSecrets : create.deferCleanup);
    // The ORIGINAL error, because that is the one describing what went wrong. A failure to tidy up
    // must not mask the failure that made tidying necessary.
    throw error;
  }
}

/** Best-effort by construction: a failure to tidy must not replace the failure being tidied. */
async function tidy(step: () => Promise<void>): Promise<void> {
  try {
    await step();
  } catch {
    // An orphan is the one torn state the invariant permits, and `orphanSweep.ts` explains why.
  }
}
