import { parentFolderOf } from './moveGate';
import { escapeControl } from './transitSecretReport';
import { TreeNode } from './types';

/**
 * Every title of a terminal this extension opens is built here, and only here (no `vscode` import: a test loads it
 * as it is). A terminal's title is both its creation name and the key it is found by, matched exactly, so the find
 * and the create must build the same title from the same key.
 */

/** What names an entry's terminal: the entry's `details.name` and the name of the tree folder that holds it. */
export interface EntryTerminalKey {
  readonly entryName: string;
  /** The direct parent folder's name as stored; `undefined` at the root and for a dangling parent. */
  readonly folderName: string | undefined;
}

/** The shape of storage this module reads: what `parentFolderOf` takes (one node by id). */
export type NodeSource = Parameters<typeof parentFolderOf>[0];

/** The ONE constructor: the entry's `details.name` and its direct parent folder node (`undefined` at the root). */
export function entryTerminalKey(entryName: string, folder: TreeNode | undefined): EntryTerminalKey {
  return { entryName, folderName: folder?.name };
}

/**
 * The key of the entry as storage holds it NOW. It takes an id, never a tree element: an element is drawn before a
 * later move and keeps the old `parentId`. An entry that storage no longer has gives no folder.
 */
export function entryTerminalKeyOf(
  source: NodeSource,
  accountId: string,
  entryId: string,
  entryName: string,
): EntryTerminalKey {
  const node = source.getNode(accountId, entryId);
  return entryTerminalKey(entryName, node === undefined ? undefined : parentFolderOf(source, accountId, node));
}

/**
 * `Creds: <folder> / <entry>`, or `Creds: <entry>` with no folder. The folder name goes through `escapeControl`, so a
 * tab or a newline in it never reaches a title; the entry half is written as it is.
 */
export function entryTerminalTitle(key: EntryTerminalKey): string {
  return key.folderName === undefined
    ? `Creds: ${key.entryName}`
    : `Creds: ${escapeControl(key.folderName)} / ${key.entryName}`;
}

/** The terminal that runs an entry's dependencies before the owner's line. */
export function chainTerminalTitle(ownerName: string): string {
  return `Creds: before ${ownerName}`;
}

/** The terminal of a masked run. */
export function maskedRunTitle(name: string): string {
  return `Creds run: ${name}`;
}

/** The terminal of the built-in VPN. */
export function vpnTerminalTitle(name: string): string {
  return `Creds VPN: ${name}`;
}
