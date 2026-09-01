import type { TreeNode } from './types';
import { isTreeNode } from './types';

/** The decrypted payload of a per-profile .enc backup file. */
export interface BackupBundle {
  nodes: TreeNode[];
  /** entityId -> password. Only entities that had a stored password appear. */
  passwords: Record<string, string>;
  /** entityId -> private key content. Absent in pre-0.5 backups. */
  privateKeys?: Record<string, string>;
  /** entityId -> VPN config file content. Absent in pre-0.8 backups. */
  vpnConfigs?: Record<string, string>;
  /** entityId -> DB connection string. Absent in pre-0.9 backups. */
  dbConnections?: Record<string, string>;
  /** entityId -> attachment content, base64. Absent in older backups. */
  attachments?: Record<string, string>;
  /** entityId -> image content, base64. Absent in older backups. */
  images?: Record<string, string>;
  /** entityId -> notes. Moved out of plaintext metadata in 0.20. */
  notes?: Record<string, string>;
  /** entityId -> canonical `otpauth://` URI. Absent in pre-0.57 backups. */
  totps?: Record<string, string>;
  /** entityId -> a credential's login/URL as JSON. A secret, like `notes`. Absent before 0.82. */
  fields?: Record<string, string>;
  /** entityId -> config file contents. A secret, like `notes`. Absent before the `config` kind. */
  configs?: Record<string, string>;
  /**
   * entityId -> a payment instrument's fields as JSON. A secret, like `notes`. Absent before the
   * `payment` kind.
   *
   * <p><b>This CARRIES the CVV and the PIN, deliberately.</b> A backup is your own encrypted vault,
   * and scrubbing them here would mean losing them at restore — a card that comes back without half
   * its fields. The direction that strips them is a SHARE, where the value leaves your vault and
   * lives on in somebody else's; see `paymentRedaction.ts`. The asymmetry is a decision, recorded so
   * it does not later read as an oversight.</p>
   */
  payments?: Record<string, string>;
  /**
   * nodeId -> tombstone. Since 0.22 an object `{ deletedAt, v }`; pre-0.22
   * backups carry a bare ms-epoch number, normalized in on read.
   */
  tombstones?: Record<string, { deletedAt: number; v: Record<string, number> } | number>;
  /** Per-profile version-vector horizon (max seq per device). Since 0.22. */
  horizon?: Record<string, number>;
  /** When this bundle was written (ms epoch). Since 0.6. */
  exportedAt?: number;
}

/**
 * The guard for the shape above, beside the shape it guards.
 *
 * <p>Moved out of `types.ts` while S1.3 was adding the `payments` map, and the move is the point
 * rather than a tidy-up: that file was at exactly 800 of 800 lines, the plan said in writing that the
 * next story touching it needed an EXTRACTION rather than another trimmed comment, and I trimmed two
 * comments instead. The code review quoted my own plan back at me, which is the most deserved finding
 * of the feature so far.</p>
 *
 * <p>Here rather than anywhere else because a guard belongs with its type: every clause below names a
 * field of `BackupBundle` declared directly above, so the two can no longer be edited in different
 * files. `isTreeNode` and `isEntityMetadata` still come from `types.ts`, and that import is safe in
 * one direction only — `types.ts` imports `BackupBundle` as a TYPE, which leaves no runtime cycle.</p>
 *
 * <p>The list is still NOT exhaustive: `notes`, `configs` and `fields` have no clause and are
 * admitted unvalidated. Pre-existing, recorded here rather than quietly widened, because fixing it
 * means deciding what a malformed one should do to a whole restore.</p>
 */
// eslint-disable-next-line complexity, max-lines-per-function
export function isBackupBundle(value: unknown): value is BackupBundle {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.nodes) || !v.nodes.every(isTreeNode)) {
    return false;
  }
  const allStrings = (record: unknown): boolean =>
    typeof record === 'object' &&
    record !== null &&
    Object.values(record as Record<string, unknown>).every((p) => typeof p === 'string');
  if (!allStrings(v.passwords)) {
    return false;
  }
  if (v.privateKeys !== undefined && !allStrings(v.privateKeys)) {
    return false;
  }
  if (v.vpnConfigs !== undefined && !allStrings(v.vpnConfigs)) {
    return false;
  }
  if (v.dbConnections !== undefined && !allStrings(v.dbConnections)) {
    return false;
  }
  if (v.attachments !== undefined && !allStrings(v.attachments)) {
    return false;
  }
  if (v.images !== undefined && !allStrings(v.images)) {
    return false;
  }
  if (v.totps !== undefined && !allStrings(v.totps)) {
    return false;
  }
  // NOT exhaustive: `notes`, `configs` and `fields` have no clause and are admitted unvalidated.
  if (v.payments !== undefined && !allStrings(v.payments)) { return false; }
  if (v.exportedAt !== undefined && typeof v.exportedAt !== 'number') {
    return false;
  }
  if (v.tombstones !== undefined) {
    if (typeof v.tombstones !== 'object' || v.tombstones === null) {
      return false;
    }
    // Each tombstone is a legacy ms-epoch number OR an object { deletedAt, v }.
    const okTomb = Object.values(v.tombstones as Record<string, unknown>).every(
      (t) =>
        typeof t === 'number' ||
        (typeof t === 'object' && t !== null && typeof (t as { deletedAt?: unknown }).deletedAt === 'number'),
    );
    if (!okTomb) {
      return false;
    }
  }
  if (v.horizon !== undefined) {
    if (typeof v.horizon !== 'object' || v.horizon === null) {
      return false;
    }
    if (!Object.values(v.horizon as Record<string, unknown>).every((n) => typeof n === 'number')) {
      return false;
    }
  }
  return true;
}
