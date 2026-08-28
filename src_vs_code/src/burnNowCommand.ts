import * as vscode from 'vscode';
import { burnNow } from './burnNow';
import { TreeElement } from './types';

/** What the command needs from storage: the one delete path. */
export interface BurnStorage {
  deleteNodeRecursive(accountId: string, id: string): Promise<string[]>;
}

/** *Burn Now…* from the tree: the modal, the burn, the repaint, the sentence. */
export async function runBurnNow(element: TreeElement | undefined, storage: BurnStorage, mutated: () => void): Promise<void> {
  if (element?.kind !== 'node') {
    return;
  }
  const outcome = await burnNow(
    {
      confirm: async (text, button) => (await vscode.window.showWarningMessage(text, { modal: true }, button)) === button,
      burn: (accountId, id) => storage.deleteNodeRecursive(accountId, id),
    },
    element.accountId,
    element.node,
  );
  if (outcome === 'burned') {
    mutated();
    void vscode.window.showInformationMessage(`Burned "${element.node.name}" — the secret, its history and every synced copy.`);
  }
}
