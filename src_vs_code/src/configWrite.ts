import * as path from 'node:path';
import * as vscode from 'vscode';
import { configFileNameFor, ignoredArgv, trackedArgv, writeVerdict } from './configFile';
import { lockToOwner } from './materializedKeys';
import { clickedSecret, outsidePinNote } from './pinClick';
import { runBounded } from './sshExecRunner';
import type { StorageManager } from './storageManager';
import { EntityMetadata } from './types';

/**
 * The flow that puts a config on disk: ask where, ask git, ask the person, write, lock.
 *
 * <p>Thin on purpose. Every decision it makes — the file name, what git's two answers mean, the
 * words of the refusal — lives in `configFile.ts`, which imports no `vscode` and is therefore a
 * unit test. What is left here is the dialog and the bytes — and, since the entry-PIN plan, the
 * one line that matters most about the bytes: they are the OPENED body (`writeStoredConfig`,
 * asserted in `pinClickPaths.test.ts`).</p>
 */

/** Runs git and answers with its exit code. Injected, like the sync transport's runner. */
export type GitProbe = (args: readonly string[], cwd: string) => Promise<number | null>;

export interface ConfigWriteRequest {
  readonly suggestedName: string;
  readonly body: string;
  readonly git: GitProbe;
  /** Applied to the written file — this is a secret on disk, and the product already locks those. */
  readonly lock: (filePath: string) => void;
  /** What the confirmation adds — for a protected entry, that the file is outside the PIN. */
  readonly note?: string;
}

/** git, bounded — the probe *Write config file* has always used. */
const boundedGit: GitProbe = (args, cwd) =>
  runBounded('git', [...args], false, { cwd, env: process.env, timeoutMs: 10_000 }).then((outcome) => outcome.exitCode);

/**
 * *Write config file*: the entry's stored body, OPENED for the click (entry-PIN plan, D6), to a file
 * the person picks. Until 1.12 a protected config was written out as its envelope — a file the
 * application could not read, and a click that looked as if it had worked. Moved here from the
 * command registration, so the tree-mutation module keeps a one-line call site.
 */
export async function writeStoredConfig(
  storage: StorageManager,
  accountId: string,
  details: EntityMetadata,
  git: GitProbe = boundedGit,
): Promise<void> {
  const opened = await openedBody(storage, accountId, details);
  if (opened === undefined) {
    return;
  }
  await writeConfigFile({
    suggestedName: configFileNameFor(details.configFileName, details.configFormat ?? 'json', details.name),
    body: opened.body,
    git,
    lock: lockToOwner,
    note: opened.note,
  });
}

/** The body and its note — or nothing, when the door stopped it or there is nothing to write (said). */
async function openedBody(storage: StorageManager, accountId: string, details: EntityMetadata): Promise<{ body: string; note: string } | undefined> {
  const opened = await clickedSecret(storage, accountId, details, (s, a, e) => s.getConfigBody(a, e), 'write its config file', undefined);
  if (opened.kind !== 'open') {
    return undefined;
  }
  if (opened.value === undefined || opened.value.length === 0) {
    void vscode.window.showWarningMessage(`"${details.name}" has nothing in it yet.`);
    return undefined;
  }
  return { body: opened.value, note: outsidePinNote(opened) };
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
    `Wrote ${path.basename(target.fsPath)}. It holds real secrets now — keep it out of the repository.${request.note ?? ''}`,
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
