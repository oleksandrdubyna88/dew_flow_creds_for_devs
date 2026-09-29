import type { Revision, RevisionSecrets } from './revisionHistory';
import type { SecretMapKey } from './secretMaps';
import type { StorageManager } from './storageManager';
import type { ProfileSnapshot } from './syncMerge';
import { sealedIn } from './syncPinRule';
import type { TreeNode } from './types';
import { VersionVector, concurrent, emptyVector } from './versionVector';

/**
 * The LOSING side of a sync conflict about protection is kept — never dropped in silence (entry-PIN
 * plan §5.9, owner decision 6).
 *
 * <p>`syncPinRule` decides which machine's protection decision wins a concurrent disagreement. The
 * other machine's values are then replaced by `applySnapshot`, and until 1.12 that replacement was
 * the whole story: whatever this machine had typed was gone, with nothing said. Now each such entry
 * is found here, its local state is recorded as this machine's NEWEST kept version BEFORE the merge
 * is applied, and the person is told once (`syncProtectionNotice.ts`).</p>
 *
 * <p>The recorded copy is this machine's own live value of a moment earlier, so nothing new is
 * exposed; and it is never openable without the PIN: the revision viewer asks the live entry's PIN
 * for every version of a protected entry, and the notice schedules the door's background seal of the
 * history (plan gate, finding 0).</p>
 *
 * <p>Pure of `vscode`; the storage arrives as an argument.</p>
 */

/** One entry whose local values lost to the other machine's protection decision. */
export interface ProtectionConflict {
  readonly id: string;
  /** The name it has after the merge — what the person will see in the tree. */
  readonly name: string;
  /** The winning decision: protected now (a Protect won), or not (a Remove PIN won). */
  readonly protectedNow: boolean;
}

/**
 * Every id the two sides edited CONCURRENTLY whose sealed state the merge changed on this machine.
 *
 * <p>Concurrent, and nothing else: a remote decision that DOMINATES this machine's node was made
 * after seeing it (a Protect synced in the ordinary way), and there is no lost edit to keep. Needs
 * the remote side as well as the merged one — deviation from the plan's `(local, merged)`: the
 * merged node carries the merged vector when the rule overrode the clock, and from that alone a
 * decision made in ignorance cannot be told from one made with knowledge.</p>
 */
export function protectionConflicts(local: ProfileSnapshot, remote: ProfileSnapshot, merged: ProfileSnapshot): ProtectionConflict[] {
  const localById = byId(local.nodes);
  const remoteById = byId(remote.nodes);
  return merged.nodes
    .filter((node) => raced(localById.get(node.id), remoteById.get(node.id)) && sealedIn(local, node.id) !== sealedIn(merged, node.id))
    .map((node) => ({ id: node.id, name: node.name, protectedNow: sealedIn(merged, node.id) }));
}

function byId(nodes: readonly TreeNode[]): Map<string, TreeNode> {
  return new Map(nodes.map((node) => [node.id, node]));
}

/** Both sides hold the node and neither saw the other's edit. */
function raced(a: TreeNode | undefined, b: TreeNode | undefined): boolean {
  return a !== undefined && b !== undefined && concurrent(vectorOf(a), vectorOf(b));
}

function vectorOf(node: TreeNode): VersionVector {
  return node.v ?? emptyVector();
}

/**
 * Where a snapshot keeps each value a revision records. A `Record` over the revision's own fields, so
 * a field added to `RevisionSecrets` without a line here does not compile.
 */
const SNAPSHOT_MAP: Readonly<Record<keyof RevisionSecrets, SecretMapKey>> = {
  password: 'passwords',
  privateKey: 'privateKeys',
  vpnConfig: 'vpnConfigs',
  dbConnection: 'dbConnections',
  notes: 'notes',
  totp: 'totps',
  config: 'configs',
  fields: 'fields',
  payment: 'payments',
  second: 'seconds',
};

/** One entry's state in a snapshot, as a revision replaced `at` — or nothing for a node that is not an entry. */
export function revisionFromSnapshot(snapshot: ProfileSnapshot, id: string, at: number): Revision | undefined {
  const node = snapshot.nodes.find((one) => one.id === id);
  if (node?.details === undefined) {
    return undefined;
  }
  const maps = snapshot as unknown as Partial<Record<SecretMapKey, Record<string, string>>>;
  const secrets = Object.fromEntries(
    Object.entries(SNAPSHOT_MAP).flatMap(([field, key]) => {
      const value = maps[key]?.[id];
      return value === undefined ? [] : [[field, value]];
    }),
  ) as RevisionSecrets;
  return { at, name: node.name, details: node.details, secrets };
}

/**
 * Record each loser's LOCAL state as its newest kept version — to be called BEFORE `applySnapshot`,
 * which is what replaces it. Answers the conflicts, for the notice.
 */
export async function keepProtectionLosers(
  storage: Pick<StorageManager, 'recordRevision'>,
  accountId: string,
  local: ProfileSnapshot,
  remote: ProfileSnapshot,
  merged: ProfileSnapshot,
  now: number = Date.now(),
): Promise<ProtectionConflict[]> {
  const conflicts = protectionConflicts(local, remote, merged);
  for (const conflict of conflicts) {
    const revision = revisionFromSnapshot(local, conflict.id, now);
    if (revision !== undefined) {
      await storage.recordRevision(accountId, conflict.id, revision);
    }
  }
  return conflicts;
}

/** The plan's sentence for each direction — said once, when the merge that decided it is applied. */
export function conflictNotice(conflict: ProtectionConflict): string {
  return conflict.protectedNow
    ? `"${conflict.name}" is protected with its own PIN again: another machine changed it under that PIN while this one held it `
        + 'unprotected. What this machine had is now its newest previous version — open it with the PIN to compare, or '
        + 'Restore This Version….'
    : `"${conflict.name}" is no longer protected with its own PIN: another machine removed the PIN while this one changed it `
        + 'under that PIN. What this machine had is now its newest previous version, still sealed under that PIN — open it with '
        + 'the PIN to compare, or Restore This Version….';
}
