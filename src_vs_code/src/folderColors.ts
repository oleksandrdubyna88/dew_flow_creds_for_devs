import { DepColorKey, isDepColorKey } from './depColors';
import { pickDepColor } from './depGraph';
import { describeError } from './describeError';
import { DiagnosticWriter } from './diagnosticWriter';
import { parentFolderOf } from './moveGate';
import { isInTrash, isTrashFolder } from './trash';
import { TreeNode } from './types';

/**
 * The colour a FOLDER wears, and the pure policy that hands one to a new folder.
 *
 * <p>Folders count among folders only. An entity's `details.depColor` is another meaning of the
 * same palette (a tint on a dependency, picked by `pickDepColor` over its own usage) and is never
 * read here, so a vault full of tinted dependencies does not move which colour the next folder
 * gets. No `vscode` import: the choice is unit-tested, and the write is `ensureFolderColor`'s.</p>
 */

/** What a coloured folder stores: nothing for a non-folder or the trash, which are never painted or counted. */
function storedFolderColor(node: TreeNode | undefined): string | undefined {
  return node?.type === 'folder' && !isTrashFolder(node) ? node.folderColor : undefined;
}

/**
 * The palette key this folder wears, or `undefined` when it wears none that this build knows.
 *
 * <p>Takes `undefined` so a caller holding "the folder, if any" passes it as it is. A
 * `folderColor` that is not a key of this build's palette (a newer build's key, a hand-edited
 * file) is checked here, once, for three reasons: the row stays on its default colour, the key does
 * not count in the tally (`folderColorUsage`), and `depColorThemeId` takes a `DepColorKey`, so an
 * unchecked string could not be turned into a theme id at all.</p>
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

/** The storage the allocator uses: three methods and nothing else. `StorageManager` satisfies it as it is. */
export interface FolderColorStorage {
  getNode(accountId: string, id: string): TreeNode | undefined;
  getNodes(accountId: string): readonly TreeNode[];
  updateNodeFields(accountId: string, id: string, patch: (node: TreeNode) => Partial<TreeNode>): Promise<void>;
}

/** Does this folder need a colour: a folder, holding no string at all (a key this build does not know included), outside the trash at any depth. */
function needsColour(storage: FolderColorStorage, accountId: string, folder: TreeNode): boolean {
  return (
    folder.type === 'folder'
    && typeof folder.folderColor !== 'string'
    && !isInTrash(folder, (id) => storage.getNode(accountId, id))
  );
}

/** The folder directly holding this entry; nothing for a missing entry, the root or a dangling parent. */
function folderOfEntry(storage: FolderColorStorage, accountId: string, entryId: string): TreeNode | undefined {
  const entry = storage.getNode(accountId, entryId);
  return entry === undefined ? undefined : parentFolderOf(storage, accountId, entry);
}

/**
 * Gives the folder that directly holds this entry its colour, once, and says which colour it wears.
 *
 * <p>Resolves with the key the folder wears after the call: the one written, the one found, or `undefined`
 * (no folder to colour, a trashed folder, or a stored value this build does not know, which stays
 * byte-identical). Rejects with `updateNodeFields`'s own error and catches nothing. Keeps nothing between
 * calls, starts no timer, and reads and writes `accountId` only.</p>
 *
 * <p><b>One critical section.</b> The check outside the lease skips the write for a folder that already
 * holds a string, because every `updateNodeFields` stamps the version vector. The fresh read, the tally, the
 * choice and the write are ONE `updateNodeFields` call with a FUNCTION patch, which `StorageManager` runs in
 * its write queue and under the cross-window lease (`windowLock.ts`, an atomic `mkdir`). The tally is taken
 * INSIDE the patch, never before the call: two calls started together would otherwise count the same usage
 * and give two folders one colour. Inside it the folder is checked again, so a colour saved meanwhile wins.</p>
 *
 * <p><b>Residuals, accepted by the plan.</b> (P1) The lease serializes the windows; it does not make a
 * window's `globalState` copy fresh. A window that takes the lease before another's write has arrived by
 * broadcast tallies an old list, so two folders can wear one colour (E2's folder form will let a person change it),
 * and that stale copy can drop the other window's write, as it can for every leased write. A dropped colour is picked
 * again at the folder's next terminal, possibly as a different key, while terminals already open keep the old one.
 * (P2) A call that loses a race, in two windows or in one when two calls for one uncoloured folder start together, changes no
 * field but stamps the folder once: three memento writes and one sync upload. (P3) The first open from an
 * uncoloured folder waits for the lease with no bound and no timer here: a dead holder is broken after 15 s,
 * a live one is waited for.</p>
 */
export async function ensureFolderColor(
  storage: FolderColorStorage,
  accountId: string,
  entryId: string,
): Promise<DepColorKey | undefined> {
  const folder = folderOfEntry(storage, accountId, entryId);
  if (folder === undefined) {
    return undefined;
  }
  if (!needsColour(storage, accountId, folder)) {
    return folderColorKeyOf(folder);
  }
  let written: DepColorKey | undefined;
  await storage.updateNodeFields(accountId, folder.id, (now) => {
    if (!needsColour(storage, accountId, now)) {
      return {};
    }
    written = pickFolderColor(storage.getNodes(accountId));
    return { folderColor: written };
  });
  return written ?? folderColorKeyOf(storage.getNode(accountId, folder.id));
}

/**
 * What every caller of `ensureFolderColor` does with a rejection: it never stops the terminal, and it is never
 * silent. The colour is cosmetic (the terminal opens without it and the next open tries again, because no string
 * was stored), so there is no toast; the one line goes to the extension's diagnostic log, which is what a bug report
 * carries. The message is `describeError`'s and names no folder and no entry. Without a log (a caller no window
 * wired one into) it is dropped. Used as `ensureFolderColor(…).catch(noteColourFailure(log))`.
 */
export function noteColourFailure(log: DiagnosticWriter | undefined): (error: unknown) => undefined {
  return (error) => {
    log?.warn('folderColors', `a folder's colour could not be saved; its terminal opens without it: ${describeError(error)}`);
    return undefined;
  };
}
