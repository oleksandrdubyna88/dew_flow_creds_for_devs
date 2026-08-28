import * as vscode from 'vscode';
import { RestoreTarget, restoreEntries } from './restoreCommand';
import { TreeNode } from './types';

/** The command from the tree: restore, then say where each thing went. */
export async function runRestoreFromTrash(
  targets: readonly RestoreTarget[],
  storage: { restoreFromTrash(accountId: string, id: string): Promise<TreeNode | null | undefined> },
  announce: (accountId: string, id: string) => Promise<void>,
): Promise<void> {
  const said = await restoreEntries({ restore: (a, id) => storage.restoreFromTrash(a, id), announce }, targets);
  if (said !== '') {
    void vscode.window.showInformationMessage(said);
  }
}
