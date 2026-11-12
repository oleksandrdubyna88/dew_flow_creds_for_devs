import { DepColorKey, isDepColorKey } from './depColors';
import { pickDepColor } from './depGraph';
import { isTrashFolder } from './trash';
import { TreeNode } from './types';

/**
 * The colour a FOLDER wears, and the pure policy that hands one to a new folder.
 *
 * <p>Folders count among folders only. An entity's `details.depColor` is another meaning of the
 * same palette (a tint on a dependency, picked by `pickDepColor` over its own usage) and is never
 * read here, so a vault full of tinted dependencies does not move which colour the next folder
 * gets. No `vscode` import: the choice is unit-tested, and the write is `ensureFolderColor`'s.</p>
 */

/** What a coloured folder stores: nothing for a non-folder or the trash, which are never coloured. */
function storedFolderColor(node: TreeNode | undefined): string | undefined {
  return node?.type === 'folder' && !isTrashFolder(node) ? node.folderColor : undefined;
}

/**
 * The palette key this folder wears, or `undefined` when it wears none that this build knows.
 *
 * <p>Takes `undefined` so a caller holding "the folder, if any" passes it as it is. A
 * `folderColor` that is not a key of this build's palette (a newer build's key, a hand-edited
 * file) counts as no colour rather than painting a theme id nobody contributed — which would not
 * be an error, only an uncoloured terminal.</p>
 */
export function folderColorKeyOf(node: TreeNode | undefined): DepColorKey | undefined {
  const stored = storedFolderColor(node);
  return isDepColorKey(stored) ? stored : undefined;
}

/** How many folders wear each key. A key no folder wears is not in the map. */
export function folderColorUsage(nodes: readonly TreeNode[]): Map<DepColorKey, number> {
  const usage = new Map<DepColorKey, number>();
  for (const node of nodes) {
    const key = folderColorKeyOf(node);
    if (key !== undefined) {
      usage.set(key, (usage.get(key) ?? 0) + 1);
    }
  }
  return usage;
}

/** The key a new folder gets: the first one no folder wears, then the least worn, in palette order. */
export function pickFolderColor(nodes: readonly TreeNode[]): DepColorKey {
  return pickDepColor(folderColorUsage(nodes));
}
