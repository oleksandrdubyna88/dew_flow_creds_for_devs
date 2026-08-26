import * as vscode from 'vscode';
import { TreeElement, TreeNode } from './types';
import { depColorThemeId } from './depColors';
import { DependencyIndex, dependentFoldersOf } from './depGraph';
import { folderIcon } from './treeIcons';

/**
 * The three rows of the "Depended on by" sub-tree.
 *
 * <p>Here rather than in `treeDataProvider.ts` for the reason that file's whole shape now
 * answers to: it enforces an 800-line ceiling, and adding this sub-tree took it to 840. The
 * split is not arbitrary — these functions take data and return a `vscode.TreeItem`, they read
 * nothing off the provider, and the shadow ENTITY row deliberately stayed behind, because it
 * must be built by the same method as the real one.</p>
 */

/**
 * The sub-tree's root row, under the entity that is depended on.
 *
 * <p>Its icon is `references`, not `history`, and that is the point: this twisty and the
 * history twisty sit side by side under the same entity and must not be mistaken for each
 * other. It is tinted in the relationship's own colour, so the row leading to the dependents
 * says which colour they are wearing.</p>
 */
export function dependentsItem(
  accountId: string,
  node: TreeNode,
  index: DependencyIndex,
  // Passed in rather than decided here: whether a row is open is the expansion memory's answer,
  // and this module has no business holding one.
  state: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Collapsed,
): vscode.TreeItem {
  const item = new vscode.TreeItem('Depended on by', state);
  item.id = `dependents:${accountId}:${node.id}`;
  item.contextValue = 'dependents';
  item.iconPath = new vscode.ThemeIcon('references', tintOf(index, node.id));
  item.description = String(index.dependentsOf(node.id).length);
  return item;
}

function tintOf(index: DependencyIndex, entityId: string): vscode.ThemeColor | undefined {
  const key = index.colorOf(entityId);
  return key === undefined ? undefined : new vscode.ThemeColor(depColorThemeId(key));
}

/**
 * One folder inside the sub-tree.
 *
 * <p>Its `contextValue` is what the "go to the original folder" button is bound to — and the
 * account-root group deliberately does NOT carry it, because there is no folder to go to. The
 * icon stays the generic one rather than the real folder's type icon, so a grouping never reads
 * as the folder itself.</p>
 */
export function dependentsFolderItem(
  element: Extract<TreeElement, { kind: 'dependentsFolder' }>,
  state: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Collapsed,
): vscode.TreeItem {
  const item = new vscode.TreeItem(element.name, state);
  item.id = `depfolder:${element.accountId}:${element.targetId}:${element.folderId ?? 'root'}`;
  item.contextValue = element.folderId === null ? 'dependentsRoot' : 'dependentsFolder';
  item.iconPath = folderIcon(undefined);
  item.description = String(element.entities.length);
  return item;
}

/** The folder rows under one target — each carrying the entities it will show, already chosen. */
export function dependentGroups(
  nodes: readonly TreeNode[],
  index: DependencyIndex,
  accountId: string,
  targetId: string,
): TreeElement[] {
  return dependentFoldersOf(nodes, index, targetId).map((group) => ({
    kind: 'dependentsFolder' as const,
    accountId,
    targetId,
    folderId: group.folderId,
    name: group.name,
    entities: group.entities,
  }));
}
