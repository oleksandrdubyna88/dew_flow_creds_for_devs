import * as vscode from 'vscode';
import { burnNow } from './burnNow';
import { lostWithDeletion } from './rotationWaiting';
import type { StorageManager } from './storageManager';
import { TreeElement } from './types';

/** *Burn Now…* from the tree: the modal (naming a rotated value waiting beside the entry), the burn, the repaint, the sentence. */
export async function runBurnNow(element: TreeElement | undefined, storage: StorageManager, mutated: () => void): Promise<void> {
  if (element?.kind !== 'node') {
    return;
  }
  const outcome = await burnNow(
    {
      confirm: async (text, button) => (await vscode.window.showWarningMessage(text, { modal: true }, button)) === button,
      burn: (accountId, id) => storage.deleteNodeRecursive(accountId, id),
      lost: (accountId, id) => lostWithDeletion(storage, [{ accountId, id }]),
    },
    element.accountId,
    element.node,
  );
  if (outcome === 'burned') {
    mutated();
    void vscode.window.showInformationMessage(`Burned "${element.node.name}" — the secret, its history and every synced copy.`);
  }
}
