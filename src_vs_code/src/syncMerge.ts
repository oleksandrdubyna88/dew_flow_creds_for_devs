import { TreeNode } from './types';
import {
  Tombstone,
  VersionVector,
  concurrent,
  covers,
  dominates,
  emptyVector,
  isEmptyVector,
  lastWriter,
  mergeVectors,
  normalizeTombstone,
} from './versionVector';

/**
 * Pure two-way merge of one profile's state between this machine and the
 * remote copy (NAS file or vault server). Conflict resolution is CAUSAL,
 * via per-entity version vectors (`node.v`) plus a per-profile `horizon`:
 *
 *  - node vs node: the vector that DOMINATES wins; truly concurrent edits
 *    fall back to the higher `updatedAt`, then the lexicographically-greater
 *    last-writer deviceId — deterministic and order-independent.
 *  - node vs tombstone (same id): whichever vector dominates decides
 *    alive/deleted; concurrent delete-vs-edit falls back to timestamp, and a
 *    tie is resolved as deleted (deletion wins).
 *  - **rollback/phantom rejection**: a node present on only one side whose
 *    vector is already covered by the OTHER side's horizon has been seen and
 *    superseded there (typically deleted then GC'd) — it is rejected, so a
 *    restored >90-day-old backup cannot resurrect a deleted entry.
 *  - tombstones are hard-deleted after the TTL; the horizon (never pruned)
 *    preserves the causal knowledge that keeps phantoms out afterwards.
 *  - legacy entries (empty vector) keep the old updatedAt/tombstone-time
 *    behaviour, so pre-vector vaults merge unchanged and migrate on write.
 *  - secrets follow the surviving side; orphaned children re-parent to root.
 *
 * Kept free of `vscode` imports so it is unit-testable under node:test.
 */

export interface ProfileSnapshot {
  nodes: TreeNode[];
  passwords: Record<string, string>;
  privateKeys: Record<string, string>;
  vpnConfigs: Record<string, string>;
  dbConnections: Record<string, string>;
  notes: Record<string, string>;
  attachments: Record<string, string>;
  images: Record<string, string>;
  /** entityId -> canonical `otpauth://` URI. */
  totps: Record<string, string>;
  /** entityId -> config file contents. A secret, merged exactly like the notes. */
  configs: Record<string, string>;
  /** id -> soft-delete record (object form; legacy number is normalized in). */
  tombstones: Record<string, Tombstone | number>;
  /** Element-wise max of every vector ever observed for this profile. */
  horizon: VersionVector;
}

export interface MergeResult {
  merged: ProfileSnapshot;
  localChanged: boolean;
  remoteChanged: boolean;
}

const TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export function emptySnapshot(): ProfileSnapshot {
  return {
    nodes: [],
    passwords: {},
    privateKeys: {},
    vpnConfigs: {},
    dbConnections: {},
    notes: {},
    attachments: {},
    images: {},
    totps: {},
    configs: {},
    tombstones: {},
    horizon: {},
  };
}

function vectorOf(node: TreeNode | undefined): VersionVector {
  return node?.v ?? emptyVector();
}

function nodeTime(node: TreeNode | undefined): number {
  return node?.updatedAt ?? 0;
}

/** Pick the causally-later of two present nodes for the same id. */
// eslint-disable-next-line complexity
function pickNode(a: TreeNode, b: TreeNode): TreeNode {
  const va = vectorOf(a);
  const vb = vectorOf(b);
  if (dominates(va, vb)) {
    return a;
  }
  if (dominates(vb, va)) {
    return b;
  }
  // Concurrent (or both legacy/empty): newest wall-clock, then last-writer id.
  if (nodeTime(a) !== nodeTime(b)) {
    return nodeTime(a) > nodeTime(b) ? a : b;
  }
  return lastWriter(va) >= lastWriter(vb) ? a : b;
}

function normalizeTombstones(
  raw: Record<string, Tombstone | number>,
): Record<string, Tombstone> {
  const out: Record<string, Tombstone> = {};
  for (const [id, value] of Object.entries(raw)) {
    out[id] = normalizeTombstone(value);
  }
  return out;
}

/** Canonical JSON for change detection (order-insensitive). */
function fingerprint(snapshot: ProfileSnapshot): string {
  const sortRecord = (r: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(r).sort(([a], [b]) => a.localeCompare(b)));
  return JSON.stringify({
    nodes: [...snapshot.nodes]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((n) => ({ ...n, children: undefined })),
    passwords: sortRecord(snapshot.passwords),
    privateKeys: sortRecord(snapshot.privateKeys),
    vpnConfigs: sortRecord(snapshot.vpnConfigs),
    dbConnections: sortRecord(snapshot.dbConnections),
    notes: sortRecord(snapshot.notes),
    attachments: sortRecord(snapshot.attachments),
    images: sortRecord(snapshot.images),
    totps: sortRecord(snapshot.totps ?? {}),
    configs: sortRecord(snapshot.configs ?? {}),
    tombstones: sortRecord(
      Object.fromEntries(
        Object.entries(normalizeTombstones(snapshot.tombstones)).map(([id, t]) => [
          id,
          `${t.deletedAt}|${JSON.stringify(sortRecord(t.v))}`,
        ]),
      ),
    ),
    horizon: sortRecord(snapshot.horizon),
  });
}

// eslint-disable-next-line complexity, max-lines-per-function
export function mergeProfiles(
  local: ProfileSnapshot,
  remote: ProfileSnapshot,
  now: number,
): MergeResult {
  const localById = new Map(local.nodes.map((n) => [n.id, n]));
  const remoteById = new Map(remote.nodes.map((n) => [n.id, n]));
  const localTombs = normalizeTombstones(local.tombstones);
  const remoteTombs = normalizeTombstones(remote.tombstones);
  const localHorizon = local.horizon ?? {};
  const remoteHorizon = remote.horizon ?? {};

  // Merged tombstones: latest deletedAt, union of the deletion vectors.
  const tombstones: Record<string, Tombstone> = {};
  for (const id of new Set([...Object.keys(localTombs), ...Object.keys(remoteTombs)])) {
    const a = localTombs[id];
    const b = remoteTombs[id];
    if (a !== undefined && b !== undefined) {
      tombstones[id] = {
        deletedAt: Math.max(a.deletedAt, b.deletedAt),
        v: mergeVectors(a.v, b.v),
      };
    } else {
      tombstones[id] = (a ?? b) as Tombstone;
    }
  }

  const passwords: Record<string, string> = {};
  const privateKeys: Record<string, string> = {};
  const vpnConfigs: Record<string, string> = {};
  const dbConnections: Record<string, string> = {};
  const notes: Record<string, string> = {};
  const attachments: Record<string, string> = {};
  const images: Record<string, string> = {};
  const totps: Record<string, string> = {};
  const configs: Record<string, string> = {};
  const nodes: TreeNode[] = [];
  const allIds = new Set([...localById.keys(), ...remoteById.keys()]);

  for (const id of allIds) {
    const localNode = localById.get(id);
    const remoteNode = remoteById.get(id);

    // Reject a one-sided node the OTHER side has already causally surpassed
    // (deleted + GC'd) — the rollback/phantom guard.
    if (localNode !== undefined && remoteNode === undefined) {
      const lv = vectorOf(localNode);
      if (!isEmptyVector(lv) && remoteTombs[id] === undefined && covers(remoteHorizon, lv)) {
        continue;
      }
    }
    if (remoteNode !== undefined && localNode === undefined) {
      const rv = vectorOf(remoteNode);
      if (!isEmptyVector(rv) && localTombs[id] === undefined && covers(localHorizon, rv)) {
        continue;
      }
    }

    const winner =
      localNode !== undefined && remoteNode !== undefined
        ? pickNode(localNode, remoteNode)
        : (localNode ?? remoteNode);
    if (winner === undefined) {
      continue;
    }
    const winnerVec = vectorOf(winner);

    const tomb = tombstones[id];
    if (tomb !== undefined && isDeleted(tomb, winner, winnerVec)) {
      continue; // deletion wins
    }
    if (tomb !== undefined) {
      delete tombstones[id]; // a newer edit resurrected it
    }

    nodes.push({ ...winner, children: undefined });

    const localWins = winner === localNode;
    const primary = localWins ? local : remote;
    const fallback = localWins ? remote : local;
    copySecret(passwords, id, primary.passwords, fallback.passwords);
    copySecret(privateKeys, id, primary.privateKeys, fallback.privateKeys);
    copySecret(vpnConfigs, id, primary.vpnConfigs, fallback.vpnConfigs);
    copySecret(dbConnections, id, primary.dbConnections, fallback.dbConnections);
    copySecret(notes, id, primary.notes, fallback.notes);
    copySecret(attachments, id, primary.attachments, fallback.attachments);
    copySecret(images, id, primary.images, fallback.images);
    // `?? {}`: a snapshot decoded from a pre-0.57 vault has no totps record at all.
    copySecret(totps, id, primary.totps ?? {}, fallback.totps ?? {});
    // `?? {}` for the same reason the line above needs one: a snapshot decoded from a vault
    // written before the `config` kind carries no configs record at all.
    copySecret(configs, id, primary.configs ?? {}, fallback.configs ?? {});
  }

  // Re-parent children whose parent did not survive the merge.
  const survivingIds = new Set(nodes.map((n) => n.id));
  const reparented = nodes.map((n) =>
    n.parentId != null && !survivingIds.has(n.parentId) ? { ...n, parentId: null } : n,
  );

  // Horizon = everything either side already knew, plus every vector present
  // now. Never pruned — this is what keeps phantoms out after tombstone GC.
  let horizon = mergeVectors(localHorizon, remoteHorizon);
  for (const n of reparented) {
    horizon = mergeVectors(horizon, vectorOf(n));
  }
  for (const t of Object.values(tombstones)) {
    horizon = mergeVectors(horizon, t.v);
  }

  // Hard-delete tombstones past the TTL; the horizon still remembers them.
  for (const [id, t] of Object.entries(tombstones)) {
    if (now - t.deletedAt > TOMBSTONE_TTL_MS) {
      delete tombstones[id];
    }
  }

  const merged: ProfileSnapshot = {
    nodes: reparented,
    passwords,
    privateKeys,
    vpnConfigs,
    dbConnections,
    notes,
    attachments,
    images,
    totps,
    configs,
    tombstones,
    horizon,
  };
  // Three canonical serializations, not four: the merged side is printed once and compared to
  // both. (An idle cycle never reaches this line at all — see `syncIdle.ts`.)
  const mergedPrint = fingerprint(merged);
  return {
    merged,
    localChanged: mergedPrint !== fingerprint(local),
    remoteChanged: mergedPrint !== fingerprint(remote),
  };
}

/** Whether a tombstone beats the surviving node candidate. */
// eslint-disable-next-line complexity
function isDeleted(tomb: Tombstone, winner: TreeNode, winnerVec: VersionVector): boolean {
  if (isEmptyVector(tomb.v) || isEmptyVector(winnerVec)) {
    // Legacy path: compare by time (deletion wins ties).
    return tomb.deletedAt >= nodeTime(winner);
  }
  if (dominates(winnerVec, tomb.v)) {
    return false; // edited after the delete
  }
  if (dominates(tomb.v, winnerVec)) {
    return true; // deleted after this edit
  }
  // Concurrent delete vs edit: later timestamp wins; tie → deleted.
  return concurrent(winnerVec, tomb.v) ? tomb.deletedAt >= nodeTime(winner) : true;
}

function copySecret(
  out: Record<string, string>,
  id: string,
  primary: Record<string, string>,
  fallback: Record<string, string>,
): void {
  const value = primary[id] ?? fallback[id];
  if (value !== undefined) {
    out[id] = value;
  }
}
