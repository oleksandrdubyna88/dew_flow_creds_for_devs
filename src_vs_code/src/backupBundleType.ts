import type { TreeNode } from './types';

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
