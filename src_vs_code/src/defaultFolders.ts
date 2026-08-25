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
export function buildDefaultFolders(newId: () => string, parentId: string | null = null): TreeNode[] {
  return DEFAULT_FOLDERS.map((spec, index) => ({
    id: newId(),
    name: spec.name,
    type: 'folder' as const,
    parentId,
    folderType: spec.folderType,
    sortOrder: index,
  }));
}

/**
 * Decide whether to seed the defaults: only into a still-empty account that
 * was never seeded before. Any existing node (including a renamed default)
 * means the user already has structure — leave it untouched.
 */
/**
 * What we know about the account's remote vault at the moment of deciding.
 *
 * <p>`unknown` is the case that matters and the one that was missing: a pull that could
 * not read the vault — no sync PIN on this machine yet, a locked vault, an unreachable
 * folder. It looks exactly like "brand new" from the local tree, and it is not.</p>
 */
export type RemoteState =
  /** No sync location configured — there is nothing to wait for. */
  | 'no-location'
  /** Read successfully, and it holds nothing. */
  | 'empty'
  /** Not read. May hold this account's entire structure. */
  | 'unknown';

/**
 * Whether to create the default folder set.
 *
 * <p>The third argument exists because of a real duplication. Sign-in pulls the remote
 * vault first, quietly, and swallows failures — which on a fresh machine is the NORMAL
 * outcome, since the sync PIN is not stored yet. The local tree was then empty, the
 * defaults were created, and the next successful sync pulled the account's actual
 * folders. Their ids differ from the freshly minted ones, so the merge kept both sets:
 * two `db`, two `vpn`, two of everything.</p>
 *
 * <p>Seeding therefore needs POSITIVE evidence that there is nothing to inherit. Absence
 * of evidence is not it.</p>
 */
export function shouldSeedDefaults(
  nodeCount: number,
  alreadySeeded: boolean,
  remote: RemoteState,
): boolean {
  return nodeCount === 0 && !alreadySeeded && remote !== 'unknown';
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
  // `project` dictates nothing: it is a folder-only type, and forcing its entities to
  // kind "project" would invent an entity kind that does not exist.
  return parentType !== undefined && parentType !== 'any' && parentType !== 'project'
    ? parentType
    : undefined;
}
