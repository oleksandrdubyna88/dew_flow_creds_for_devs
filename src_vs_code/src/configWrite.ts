import * as path from 'node:path';
import * as vscode from 'vscode';
import { ignoredArgv, trackedArgv, writeVerdict } from './configFile';

/**
 * The flow that puts a config on disk: ask where, ask git, ask the person, write, lock.
 *
 * <p>Thin on purpose. Every decision it makes — the file name, what git's two answers mean, the
 * words of the refusal — lives in `configFile.ts`, which imports no `vscode` and is therefore a
 * unit test. What is left here is the dialog and the bytes, and there is nothing in either worth
 * asserting that a test could reach.</p>
 */

/** Runs git and answers with its exit code. Injected, like the sync transport's runner. */
export type GitProbe = (args: readonly string[], cwd: string) => Promise<number | null>;

export interface ConfigWriteRequest {
  readonly suggestedName: string;
  readonly body: string;
  readonly git: GitProbe;
  /** Applied to the written file — this is a secret on disk, and the product already locks those. */
  readonly lock: (filePath: string) => void;
}

export async function writeConfigFile(request: ConfigWriteRequest): Promise<void> {
  const target = await askWhere(request.suggestedName);
  if (target === undefined) {
    return;
  }
  if (!(await allowed(target, request.git))) {
    return;
  }
  await vscode.workspace.fs.writeFile(target, Buffer.from(request.body, 'utf8'));
  // The same hardening a materialised SSH key gets, and for the same reason: what was just
  // written is the plaintext the vault exists to keep off disk, now deliberately on it.
  request.lock(target.fsPath);
  void vscode.window.showInformationMessage(
    `Wrote ${path.basename(target.fsPath)}. It holds real secrets now — keep it out of the repository.`,
  );
}

/** Defaulted into the open workspace, because that is where the file is nearly always wanted. */
function askWhere(suggestedName: string): Thenable<vscode.Uri | undefined> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  return vscode.window.showSaveDialog({
    defaultUri: folder === undefined ? undefined : vscode.Uri.joinPath(folder.uri, suggestedName),
    saveLabel: 'Write config file',
  });
}

/**
 * What git says about the chosen path, and what the person says about that.
 *
 * <p>Both probes run in the target's own directory rather than in the workspace root: somebody
 * may well be writing into a sibling repository, and asking the wrong repository is worse than
 * not asking — it answers "not tracked" about a file that is.</p>
 */
async function allowed(target: vscode.Uri, git: GitProbe): Promise<boolean> {
  const dir = path.dirname(target.fsPath);
  const name = path.basename(target.fsPath);
  const verdict = writeVerdict(
    name,
    (await git(trackedArgv(name), dir)) === 0,
    (await git(ignoredArgv(name), dir)) === 0,
  );
  if (verdict.kind === 'refuse') {
    void vscode.window.showErrorMessage(verdict.message);
    return false;
  }
  return verdict.kind === 'ok' || (await confirmed(verdict.message));
}

/** Modal, because it is the last thing standing between a secret and somebody's next commit. */
async function confirmed(message: string): Promise<boolean> {
  const answer = await vscode.window.showWarningMessage(message, { modal: true }, 'Write it');
  return answer === 'Write it';
}
