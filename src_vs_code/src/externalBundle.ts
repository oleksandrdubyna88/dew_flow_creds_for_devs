import { TreeNode, isTreeNode } from './types';

/**
 * Handing entities to someone OUTSIDE the organisation — a self-contained file.
 *
 * <p>Sealed with a password (the same scrypt + AES-256-GCM envelope the vault uses,
 * passphrase = the password alone), or — by explicit choice — plain JSON with nothing
 * protecting it. The import side gives every node a NEW id: the sender's ids belong to
 * the sender's tree, and colliding with the recipient's own nodes would corrupt the
 * next sync merge.</p>
 */

export interface ExternalSecrets {
  password?: string;
  privateKey?: string;
  vpnConfig?: string;
  dbConnection?: string;
  notes?: string;
  attachment?: string;
  image?: string;
}

export interface ExternalBundle {
  format: 'creds-for-devs-external';
  version: 1;
  nodes: TreeNode[];
  /** node id -> its secrets. Self-contained: nothing references the sender's machine. */
  secrets: Record<string, ExternalSecrets>;
}

export function buildExternalBundle(
  nodes: readonly TreeNode[],
  secrets: Record<string, ExternalSecrets>,
): ExternalBundle {
  return { format: 'creds-for-devs-external', version: 1, nodes: [...nodes], secrets };
}

// eslint-disable-next-line complexity
export function isExternalBundle(value: unknown): value is ExternalBundle {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    v.format === 'creds-for-devs-external' &&
    v.version === 1 &&
    Array.isArray(v.nodes) &&
    v.nodes.every(isTreeNode) &&
    typeof v.secrets === 'object' &&
    v.secrets !== null
  );
}

/**
 * New ids for everything, structure preserved, secrets re-keyed to the new node ids.
 * Roots land under `destinationParentId` (null = the account root).
 */
export function remapExternalIds(
  bundle: ExternalBundle,
  newId: () => string,
  destinationParentId: string | null,
): ExternalBundle {
  const mapping = new Map<string, string>();
  for (const node of bundle.nodes) {
    mapping.set(node.id, newId());
  }
  const nodes = bundle.nodes.map((node) => {
    const id = mapping.get(node.id) as string;
    const parentId =
      node.parentId != null && mapping.has(node.parentId)
        ? (mapping.get(node.parentId) as string)
        : destinationParentId;
    return {
      ...node,
      id,
      parentId,
      details: node.details !== undefined ? { ...node.details, id } : undefined,
    };
  });
  const secrets: Record<string, ExternalSecrets> = {};
  for (const [oldId, s] of Object.entries(bundle.secrets)) {
    const id = mapping.get(oldId);
    if (id !== undefined) {
      secrets[id] = s;
    }
  }
  return { format: 'creds-for-devs-external', version: 1, nodes, secrets };
}
