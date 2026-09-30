import type { Revision, RevisionSecrets } from './revisionHistory';
import type { SecretMapKey } from './secretMaps';
import type { StorageManager } from './storageManager';
import type { ProfileSnapshot } from './syncMerge';
import { isLockedSecret } from './secretEnvelope';
import { SEALABLE_MAPS, SecretSide, sealedIn } from './syncPinRule';
import type { TreeNode } from './types';
import { VersionVector, concurrent, emptyVector } from './versionVector';

/**
 * The LOSING side of a sync conflict about protection is kept — never dropped in silence (entry-PIN
 * plan §5.9, owner decision 6).
 *
 * <p>`syncPinRule` decides which machine's protection decision wins a concurrent disagreement. The
 * other machine's values are then replaced by `applySnapshot`, and until 1.12 that replacement was
 * the whole story: whatever this machine had typed was gone, with nothing said. The same was true of
 * two machines that both edited the entry UNDER its PIN — the sealed state never changes, and one
 * side's sealed values still go. Now each such entry is found here, its local state is recorded as this machine's NEWEST kept version BEFORE the merge
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
  /**
   * What won: a Protect (sealed now, this machine held it plain), a Remove PIN (plain now, this machine held
   * it sealed), or the other machine's own sealed edit (sealed on both, and this machine's sealed values lost).
   */
  readonly won: ConflictWinner;
}

export type ConflictWinner = 'protect' | 'unprotect' | 'other-sealed-edit';

/**
 * Every id the two sides edited CONCURRENTLY where the merge discards this machine's protected values:
 * the sealed state changed (a Protect or a Remove PIN from the other machine won), or this machine held
 * sealed values the merged entry no longer has (both edited under a PIN, and the other side's node won).
 *
 * <p>Concurrent, and nothing else: a remote decision that DOMINATES this machine's node was made
 * after seeing it (a Protect synced in the ordinary way), and there is no lost edit to keep. Needs
 * the remote side as well as the merged one — deviation from the plan's `(local, merged)`: the
 * merged node carries the merged vector when the rule overrode the clock, and from that alone a
 * decision made in ignorance cannot be told from one made with knowledge.</p>
 *
 * <p>The second case is owner decision 6 taken at its word — "a sync conflict's losing protected edit is
 * kept". Until the review of 2026-09-30 only a CHANGE of sealed state was recorded, so two ordinary
 * concurrent edits under a PIN lost one side with no kept version and nothing said.</p>
 */
export function protectionConflicts(local: ProfileSnapshot, remote: ProfileSnapshot, merged: ProfileSnapshot): ProtectionConflict[] {
  const localById = byId(local.nodes);
  const remoteById = byId(remote.nodes);
  return merged.nodes.flatMap((node) => {
    const won = raced(localById.get(node.id), remoteById.get(node.id)) ? winnerOver(local, merged, node.id) : undefined;
    return won === undefined ? [] : [{ id: node.id, name: node.name, won }];
  });
}

/** What the merge did to this machine's protected values for one raced id — `undefined` when it kept them. */
function winnerOver(local: ProfileSnapshot, merged: ProfileSnapshot, id: string): ConflictWinner | undefined {
  const [before, after] = [sealedIn(local, id), sealedIn(merged, id)];
  if (before !== after) {
    return after ? 'protect' : 'unprotect';
  }
  return lostSealedValue(local, merged, id) ? 'other-sealed-edit' : undefined;
}

/** Whether this machine held a sealed value for `id` that the merged snapshot does not carry. */
function lostSealedValue(local: ProfileSnapshot, merged: ProfileSnapshot, id: string): boolean {
  return SEALABLE_MAPS.some((key) => {
    const held = valueIn(local, key, id);
    return isLockedSecret(held) && valueIn(merged, key, id) !== held;
  });
}

function valueIn(snapshot: ProfileSnapshot, key: SecretMapKey, id: string): string | undefined {
  return maps(snapshot)[key]?.[id];
}

function maps(snapshot: ProfileSnapshot): SecretSide {
  return snapshot as unknown as SecretSide;
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
  const side = maps(snapshot);
  const secrets = Object.fromEntries(
    Object.entries(SNAPSHOT_MAP).flatMap(([field, key]) => {
      const value = side[key]?.[id];
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

/** The plan's sentence for each outcome — said once, when the merge that decided it is applied. */
export function conflictNotice(conflict: ProtectionConflict): string {
  return NOTICES[conflict.won](`"${conflict.name}"`);
}

const NOTICES: Readonly<Record<ConflictWinner, (name: string) => string>> = {
  protect: (name) =>
    `${name} is protected with its own PIN again: another machine changed it under that PIN while this one held it `
    + 'unprotected. What this machine had is now its newest previous version — open it with the PIN to compare, or '
    + 'Restore This Version….',
  unprotect: (name) =>
    `${name} is no longer protected with its own PIN: another machine removed the PIN while this one changed it `
    + 'under that PIN. What this machine had is now its newest previous version, still sealed under that PIN — open it with '
    + 'the PIN to compare, or Restore This Version….',
  'other-sealed-edit': (name) =>
    `${name} was changed under its PIN on another machine while this one changed it too, and the other machine’s version `
    + 'was kept. What this machine had is now its newest previous version, still sealed under the PIN it was saved with — '
    + 'open it with that PIN to compare, or Restore This Version….',
};
