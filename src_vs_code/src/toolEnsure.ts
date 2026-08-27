import * as fs from 'node:fs';
import * as vscode from 'vscode';
import { installRecipe } from './toolCheck';

/**
 * The `vscode` half of the missing-tool story (tails T20): the modal and the terminal.
 *
 * <p>Called by a launch site that has just discovered its binary absent. Says WHAT is missing,
 * offers to install it, and on Yes opens a terminal running the recipe — visibly, so sudo can
 * ask its question and the person can watch what is being done to their machine. Never runs a
 * package manager silently: an install is exactly the kind of action that must happen where
 * eyes are.</p>
 */
export async function offerToInstall(tool: string): Promise<void> {
  const recipe = installRecipe(tool, process.platform, fs.existsSync('/usr/bin/apt'));
  if (recipe === undefined) {
    void vscode.window.showErrorMessage(`"${tool}" is not installed on this machine.`);
    return;
  }
  const note = recipe.note === '' ? '' : ` ${recipe.note}`;
  const choice = await vscode.window.showWarningMessage(
    `${recipe.display} is not installed. Install it?${note}`,
    { modal: true },
    'Install',
  );
  if (choice !== 'Install') {
    return;
  }
  const terminal = vscode.window.createTerminal({ name: `Install ${tool}` });
  terminal.show();
  terminal.sendText(recipe.command, true);
}
