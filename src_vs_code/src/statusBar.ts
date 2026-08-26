import * as vscode from 'vscode';
import { statusCommand, statusText, statusTooltip } from './lockStatus';

/**
 * The lock/sync indicator the audit found missing.
 *
 * <p>Whether the vault is locked decides whether a background sync can run at all, and until
 * now the only way to know was to try something and read the popup. A status-bar item is where
 * a persistent yes/no belongs — always visible, costing no interaction.</p>
 *
 * <p>The wording lives in `lockStatus.ts`, which imports no `vscode` and therefore has tests.
 * What is left here is the part that genuinely needs the editor: the item itself.</p>
 */
export class LockStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;

  constructor() {
    // Right side, low priority: ambient state, not something competing with the language and
    // line-number items people actually look at.
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 40);
  }

  /**
   * Repaint. With no accounts the item hides itself rather than reporting the lock state of
   * nothing at all.
   */
  render(locked: boolean, accounts: number, syncing: boolean): void {
    if (accounts === 0) {
      this.item.hide();
      return;
    }
    this.item.text = statusText(locked, syncing);
    this.item.tooltip = statusTooltip(locked, syncing);
    this.item.command = statusCommand(locked);
    // Only the locked state earns a colour: it is the one where a timer has quietly stopped
    // syncing, and the one a person can act on.
    this.item.backgroundColor = locked
      ? new vscode.ThemeColor('statusBarItem.warningBackground')
      : undefined;
    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
  }
}
