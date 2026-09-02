/**
 * Work this machine started and must finish — durable, LOCAL, and deliberately never synced.
 *
 * <p>Two operations remove things in a sequence a crash can interrupt: removing an account, and
 * applying a bundle that drops entities (a restore, or a sync apply). Both need Rule B — a durable
 * record naming what is about to become unreachable — and for both, the first answer tried was a
 * <b>tombstone</b>. Two review rounds killed that answer twice, for the same reason each time:</p>
 *
 * <ul>
 *   <li>Account removal wrote tombstones first, and a crash then left ids both tombstoned and live —
 *       a state the sweep deliberately refuses, so nothing ever finished the removal while the
 *       tombstones synced a deletion to every other machine.</li>
 *   <li>The restore path wrote them with an EMPTY version vector to keep them weak, and the review
 *       pointed out the obvious consequence: a live node on another machine then WINS the merge and
 *       syncs back, over secrets this machine has already deleted. A weak record is not a safe one.</li>
 * </ul>
 *
 * <p>The mistake both times was reaching for a record that <b>syncs</b>. What these operations need is
 * a note to THIS machine about work in flight — nobody else's business, and actively harmful as a
 * published fact. So: one key, never in a bundle, never in a snapshot, cleared when the work lands.</p>
 *
 * <p>It is also what makes the resume unambiguous, which two reviewers asked for independently: the
 * previous version inferred pending removals by comparing stored keys against the account list, and
 * an inference cannot tell an interrupted removal from an account being created, an id being reused,
 * or a key left by some other lifecycle. An explicit intent cannot be misread.</p>
 */
export interface PendingCleanup {
  /** Accounts whose removal has begun: unlisted, but their tree and secrets may still be stored. */
  readonly accounts: readonly string[];
  /** Per account, entity ids whose secrets are to be deleted once they leave the tree. */
  readonly secrets: Readonly<Record<string, readonly string[]>>;
}

export const EMPTY_PENDING: PendingCleanup = { accounts: [], secrets: {} };

/** Anything at all off the memento, read as the record — a corrupt value means "nothing pending". */
export function parsePendingCleanup(raw: unknown): PendingCleanup {
  if (raw === null || typeof raw !== 'object') {
    return EMPTY_PENDING;
  }
  const value = raw as { accounts?: unknown; secrets?: unknown };
  return { accounts: stringList(value.accounts), secrets: idsByAccount(value.secrets) };
}

function stringList(raw: unknown): readonly string[] {
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
}

function idsByAccount(raw: unknown): Readonly<Record<string, readonly string[]>> {
  if (raw === null || typeof raw !== 'object') {
    return {};
  }
  return Object.fromEntries(Object.entries(raw as object).map(([key, value]) => [key, stringList(value)]));
}

/** The record with this account marked as being removed. */
export function markAccountRemoving(pending: PendingCleanup, accountId: string): PendingCleanup {
  return { ...pending, accounts: [...new Set([...pending.accounts, accountId])] };
}

/** The record with this account's removal finished. */
export function clearAccountRemoving(pending: PendingCleanup, accountId: string): PendingCleanup {
  return { ...pending, accounts: pending.accounts.filter((id) => id !== accountId) };
}

/** The record with these entity ids marked for secret deletion under this account. */
export function markSecretsPending(
  pending: PendingCleanup,
  accountId: string,
  entityIds: readonly string[],
): PendingCleanup {
  if (entityIds.length === 0) {
    return pending;
  }
  const existing = pending.secrets[accountId] ?? [];
  return { ...pending, secrets: { ...pending.secrets, [accountId]: [...new Set([...existing, ...entityIds])] } };
}

/** The record with this account's pending secret deletions finished. */
export function clearSecretsPending(pending: PendingCleanup, accountId: string): PendingCleanup {
  const { [accountId]: _done, ...rest } = pending.secrets;
  return { ...pending, secrets: rest };
}

/** True when there is nothing left to finish — so the key is dropped rather than left as `{}`. */
export function isEmptyPending(pending: PendingCleanup): boolean {
  return pending.accounts.length === 0 && Object.keys(pending.secrets).length === 0;
}

/** The narrow port the sequencing needs — no `vscode`, no `StorageManager`, no memento. */
export interface CleanupPort {
  read(): PendingCleanup;
  write(next: PendingCleanup): Promise<void>;
  /** Delete the account's tree, tombstones, horizon and every secret its entities own. */
  wipeAccount(accountId: string): Promise<void>;
  /** Is this account listed again? A removal unlists FIRST, so a listed id is not a pending one. */
  isListed(accountId: string): boolean;
  /** Ids currently in this account's tree — an id still there is NOT one whose secrets may go. */
  liveIds(accountId: string): readonly string[];
  /**
   * Delete this entity's secrets, re-checking `liveIds` before EVERY key.
   *
   * <p>The re-check belongs inside because deleting one entity is a dozen awaited keychain calls, and
   * a sync apply landing in one of them can bring the entity back — `importBundle` writes the secrets
   * before the node, so the values would be written and then deleted underneath it. Checking once, at
   * the top, guards the first key and nothing after it.</p>
   *
   * <p>The honest residual, since a lock is not available here: an apply that writes a secret for this
   * id while the node is still absent can still have that one key deleted. The window is one keychain
   * call wide, and what survives it is an entity whose node arrives claiming a value it lost — which
   * the next apply rewrites, because a bundle carries the whole record.</p>
   */
  forgetSecrets(accountId: string, entityId: string): Promise<void>;
}

/**
 * Do the removal with its intent recorded first, so an interruption is finishable.
 *
 * <p>Unlisting is the caller's, because only it knows how an account is listed; the marker around it
 * is here, because getting that pairing right is the whole point of the record.</p>
 */
export async function removeWithIntent(
  port: CleanupPort,
  accountId: string,
  unlist: () => Promise<void>,
): Promise<void> {
  await port.write(markAccountRemoving(port.read(), accountId));
  await unlist();
  await port.wipeAccount(accountId);
  await port.write(clearAccountRemoving(port.read(), accountId));
}

/**
 * Finish everything a killed window left in flight. Returns the accounts it finished, for the log.
 *
 * <p>Idempotent: it re-derives its work from the record and from what is actually stored, so running
 * it twice is running it once.</p>
 */
export async function resumePending(port: CleanupPort): Promise<readonly string[]> {
  const pending = port.read();
  // An account LISTED again is not swept here — `finishBeforeReuse` has already dealt with it at the
  // moment it was re-added, which is the only point where the two facts (a pending removal, and a
  // person who wants this account back) are both known. Skipping it here without that would leave a
  // half-wiped tree live, which is the state the review caught this guard creating.
  const removing: string[] = [];
  for (const accountId of pending.accounts) {
    // Re-read per account, not once: `finishBeforeReuse` can list an account between two wipes, and a
    // wipe is a long run of awaited deletes. A listing decided before the previous await is a listing
    // that may no longer hold.
    if (!port.isListed(accountId)) {
      removing.push(accountId);
      await port.wipeAccount(accountId);
    }
  }
  for (const [accountId, ids] of Object.entries(pending.secrets)) {
    await finishSecretDeletes(port, accountId, ids);
  }
  await port.write(EMPTY_PENDING);
  return removing;
}

/**
 * Secrets a bundle apply was about to delete — but ONLY for ids that really did leave the tree.
 *
 * <p>Interrupted BEFORE the tree was replaced, those entities are still live and still hold their
 * values; deleting them then would be exactly the data loss the invariant exists to prevent.</p>
 */
async function finishSecretDeletes(port: CleanupPort, accountId: string, ids: readonly string[]): Promise<void> {
  for (const id of ids) {
    // Re-read per id rather than once: there is an await between every delete, and a sync apply can
    // land in it. A liveness answer from before the previous await is an answer about a tree that may
    // no longer be the tree. Raised by the review, and it costs a cached array read.
    if (!port.liveIds(accountId).includes(id)) {
      await port.forgetSecrets(accountId, id);
    }
  }
}

/**
 * An account is being ADDED whose removal was interrupted: finish the removal first.
 *
 * <p>The half-wiped tree of an account somebody asked to delete is not data to keep — some of its
 * entities are gone, some of their secrets are gone, and nothing says which. The person has just
 * asked for this account back, and what they should get is a clean profile that can pull its vault,
 * not the wreckage of the deletion they ordered.</p>
 *
 * <p>This is also what keeps the marker from ever outliving the re-add. Without it the choice is
 * between two bad outcomes the review named on the same round: wipe on the next window open, and lose
 * everything the re-added account has since pulled; or skip forever, and leave the wreckage live.</p>
 */
export async function finishBeforeReuse(port: CleanupPort, accountId: string): Promise<boolean> {
  const pending = port.read();
  if (!pending.accounts.includes(accountId)) {
    return false;
  }
  await port.wipeAccount(accountId);
  await port.write(clearAccountRemoving(pending, accountId));
  return true;
}
