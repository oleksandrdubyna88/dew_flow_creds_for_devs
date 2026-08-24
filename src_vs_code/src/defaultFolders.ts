import { EntityKind, FolderType, TreeNode } from './types';

/**
 * Default folder set created for a brand-NEW, empty account so a first-time
 * user starts with a sensible, typed structure. This is a one-time convenience:
 * it never runs for an account that already has any data or that was seeded
 * before (so renaming or deleting the defaults is respected — they don't come
 * back). Kept free of `vscode` imports so the logic is unit-testable.
 */

export interface DefaultFolderSpec {
  readonly name: string;
  readonly folderType: FolderType;
}

/** Index is the display order (folders sort by `sortOrder` ascending). */
export const DEFAULT_FOLDERS: readonly DefaultFolderSpec[] = [
  { name: 'db', folderType: 'db' },
  { name: 'vpn', folderType: 'vpn' },
  { name: 'ssh keys', folderType: 'sshkey' },
  { name: 'ssh connections', folderType: 'ssh' },
  { name: 'passwords', folderType: 'credential' },
  { name: 'terminal', folderType: 'terminal' },
];

/**
 * Build the seed folder nodes as root-level, ordered folders. `updatedAt` and
 * the version vector are stamped by the storage layer on insert, so they are
 * intentionally omitted here.
 */
export function buildDefaultFolders(newId: () => string): TreeNode[] {
  return DEFAULT_FOLDERS.map((spec, index) => ({
    id: newId(),
    name: spec.name,
    type: 'folder' as const,
    parentId: null,
    folderType: spec.folderType,
    sortOrder: index,
  }));
}

/**
 * Decide whether to seed the defaults: only into a still-empty account that
 * was never seeded before. Any existing node (including a renamed default)
 * means the user already has structure — leave it untouched.
 */
export function shouldSeedDefaults(nodeCount: number, alreadySeeded: boolean): boolean {
  return nodeCount === 0 && !alreadySeeded;
}

/**
 * The type a child inherits from the folder it is created in, or `undefined` when the
 * parent dictates nothing and the question is a real one.
 *
 * <p>One rule for both kinds of child. An entity in a typed folder already had its type
 * fixed here; a SUBFOLDER did not, and was asked — which offers an answer that cannot be
 * right, because an `ssh` folder inside `passwords` is a folder whose contents its own
 * parent refuses.</p>
 */
export function inheritedFolderType(parentType: FolderType | undefined): EntityKind | undefined {
  return parentType !== undefined && parentType !== 'any' ? parentType : undefined;
}
