import * as fs from 'node:fs';
import * as vscode from 'vscode';
import { InstallRecipe, installRecipe } from './toolCheck';
import { onPath } from './installFlow';
import { pinnedRefusal, sendPinned } from './pinnedTerminal';
import { requestGone } from './requestLife';

/**
 * The `vscode` half of the missing-tool story (tails T20): the modal and the terminal.
 *
 * <p>Called by a launch site that has just discovered its binary absent. Says WHAT is missing,
 * offers to install it, and on Yes opens a terminal running the recipe — visibly, so sudo can
 * ask its question and the person can watch what is being done to their machine. Never runs a
 * package manager silently: an install is exactly the kind of action that must happen where
 * eyes are.</p>
 */
export async function offerToInstall(tool: string, startGate?: AbortSignal): Promise<void> {
  const recipe = offerable(tool, startGate);
  // The request is read again AFTER the modal: a client that left while it was open gets no installer
  // when the person later clicks Install (`PLAN_wsl_bridge_outlives_its_client.md` §5.7, E4.S3).
  if (recipe !== undefined && (await confirmInstall(recipe)) && !requestGone(startGate)) {
    // The recipe is composed for THIS platform (winget, apt, brew), so it runs in this platform's
    // shell — never typed into a default profile that may be WSL bash (issue #103).
    sendPinned(`Install ${tool}`, recipe.command);
  }
}

/**
 * The recipe to offer — or `undefined`, having said why when there is a person to tell: an agent's
 * request that has already gone is not asked anything at all (`startGate`, absent for a person's click).
 */
function offerable(tool: string, startGate: AbortSignal | undefined): InstallRecipe | undefined {
  if (requestGone(startGate)) {
    return undefined;
  }
  // Asked BEFORE the offer: accepting an install this window then cannot run is a question with
  // no answer (another computer's window — see `pinnedShellRefusal`).
  const refusal = pinnedRefusal();
  if (refusal !== undefined) {
    void vscode.window.showWarningMessage(`"${tool}" is not installed on this machine. ${refusal}`);
    return undefined;
  }
  const recipe = recipeHere(tool);
  if (recipe === undefined) {
    void vscode.window.showErrorMessage(`"${tool}" is not installed on this machine.`);
  }
  return recipe;
}

function recipeHere(tool: string): InstallRecipe | undefined {
  const hasBrew = process.platform === 'darwin' && onPath('brew');
  return installRecipe(tool, process.platform, fs.existsSync('/usr/bin/apt'), hasBrew);
}

async function confirmInstall(recipe: InstallRecipe): Promise<boolean> {
  const note = recipe.note === '' ? '' : ` ${recipe.note}`;
  const choice = await vscode.window.showWarningMessage(
    `${recipe.display} is not installed. Install it?${note}`,
    { modal: true },
    'Install',
  );
  return choice === 'Install';
}
