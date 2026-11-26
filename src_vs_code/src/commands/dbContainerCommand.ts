import * as path from 'node:path';
import * as vscode from 'vscode';
import { SQLCMD_CONTAINERFILE, buildArgv } from '../containerDb';
import type { ContainerDeps } from '../containerDbQuery';
import { runBounded } from '../sshExecRunner';

/**
 * *Prepare Database Container* (change 11.1, the 72-hour slice, S3): builds, once, the image a bridged database query's client runs in on
 * Windows, from the recipe shipped with the extension (`containers/db-sqlcmd.Containerfile`), with the laptop's container tool. The image is
 * named after the recipe's bytes, so an updated extension with a changed recipe asks for a new build and never runs the old image under the
 * new name. Building needs the network (Ubuntu's and Microsoft's package repositories); a query never does it by itself.
 */
export function registerDbContainerCommand(
  register: (command: string, handler: () => unknown) => void,
  container: ContainerDeps | undefined,
  extensionPath: string,
  log: (message: string) => void,
): void {
  register('credSshManager.prepareDbContainer', async () => {
    if (container === undefined) {
      void vscode.window.showInformationMessage('Only Windows needs the database container: on this system a bridged query uses the database client installed here.');
      return;
    }
    const runtime = container.runtime;
    if (runtime === undefined) {
      void vscode.window.showWarningMessage('The database container needs wslc (Windows Subsystem for Linux with containers). Install or update WSL, then run this command again.');
      return;
    }
    const recipe = path.join(extensionPath, 'containers', SQLCMD_CONTAINERFILE);
    const outcome = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Building the database container (sqlcmd)… this takes a few minutes the first time' },
      () => runBounded(runtime.tool, buildArgv(runtime, recipe), false, { env: process.env, cwd: path.dirname(recipe), timeoutMs: 20 * 60_000 }),
    );
    log(`database container build ${runtime.image}: exit ${String(outcome.exitCode)}\n${outcome.stderr.slice(-2000)}`);
    if (outcome.exitCode === 0) {
      void vscode.window.showInformationMessage(`The database container is ready (${runtime.image}). A database query through a Remote Bridge now runs its client there.`);
    } else {
      void vscode.window.showErrorMessage(`The database container could not be built (exit ${String(outcome.exitCode)}). The output is in the CredsForDevs log.`);
    }
  });
}
