/**
 * Version vectors (a.k.a. vector clocks) for causal conflict resolution.
 *
 * Each client installation has a persistent `deviceId` and a monotonic `seq`.
 * Every write to an entity bumps this device's component to a new seq, so an
 * entity's vector `v` records "the latest seq I have from each device that
 * ever touched it". Comparing vectors tells us causality — which version
 * happened-after which — independently of wall-clock time.
 *
 * A per-profile **horizon** (element-wise max of every vector ever seen)
 * lets tombstones be hard-deleted after a TTL without risking resurrection:
 * a restored old backup carries vectors the horizon already covers, so it is
 * recognised as a superseded phantom even though its tombstone is long gone.
 *
 * Pure module — no `vscode`, fully unit-testable.
 */

export type VersionVector = Record<string, number>;

/** A soft delete: when it happened + the causal vector at deletion. */
export interface Tombstone {
  deletedAt: number;
  v: VersionVector;
}

export function emptyVector(): VersionVector {
  return {};
}

export function isEmptyVector(v: VersionVector): boolean {
  return Object.keys(v).length === 0;
}

/** Element-wise maximum of two vectors. */
export function mergeVectors(a: VersionVector, b: VersionVector): VersionVector {
  const out: VersionVector = { ...a };
  for (const [d, n] of Object.entries(b)) {
    out[d] = Math.max(out[d] ?? 0, n);
  }
  return out;
}

/** True when `a` knows everything `b` knows (a[d] >= b[d] for every d in b). */
export function covers(a: VersionVector, b: VersionVector): boolean {
  for (const [d, n] of Object.entries(b)) {
    if ((a[d] ?? 0) < n) {
      return false;
    }
  }
  return true;
}

/** True when `a` is strictly causally ahead of `b`. */
export function dominates(a: VersionVector, b: VersionVector): boolean {
  return covers(a, b) && !covers(b, a);
}

/** True when neither vector dominates — a genuine concurrent edit. */
export function concurrent(a: VersionVector, b: VersionVector): boolean {
  return !covers(a, b) && !covers(b, a);
}

/** Bump one device's component to `seq` (a new local write). */
export function bumpVector(v: VersionVector, deviceId: string, seq: number): VersionVector {
  return { ...v, [deviceId]: seq };
}

/**
 * The "last writer" of a vector: the device with the highest seq, ties broken
 * by the lexicographically-largest deviceId. Used as the final deterministic
 * tiebreak for truly concurrent edits.
 */
// eslint-disable-next-line complexity
export function lastWriter(v: VersionVector): string {
  let best = '';
  let bestSeq = -1;
  for (const [d, n] of Object.entries(v)) {
    if (n > bestSeq || (n === bestSeq && d > best)) {
      best = d;
      bestSeq = n;
    }
  }
  return best;
}

/** Normalize a legacy tombstone (a bare `deletedAt` number) to the object form. */
export function normalizeTombstone(value: Tombstone | number): Tombstone {
  return typeof value === 'number' ? { deletedAt: value, v: {} } : value;
}
