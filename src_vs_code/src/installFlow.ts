/* eslint-disable complexity -- moved verbatim out of extension.ts (roadmap A1, 2026-08-28):
   the ceilings are a boundary for NEW code here; each function meets them when it is next touched for a reason of its own. */
import { InstallHost } from './binaryInstaller';
import { CredsProduct } from './credsInstall';
import { CredsRid } from './credsInstall';
import * as vscode from 'vscode';
import { performInstall } from './binaryInstaller';
import { CREDS_MCP } from './credsInstall';
import { offerMcpClientConfig } from './mcpInstallTarget';
import { describeError } from './describeError';
import { CredsAction } from './credsInstall';
import { removeInstall } from './binaryInstaller';
import { binaryPath } from './binaryInstaller';
import * as childProcess from 'node:child_process';
import { StoredAccount } from './types';
import { TransportFactory } from './transportFactory';
import { RemoteState } from './defaultFolders';
/**
 * Download it, then say what to do next.
 *
 * <p>The MCP server gets one more step than the CLI does: the block that points a client at it,
 * on the clipboard, with the file it belongs in named. It is offered rather than written —
 * that config belongs to another program, and a credential manager silently editing the file
 * that grants an agent access to itself is the wrong instinct in the wrong place.</p>
 */
export async function runInstall(
  host: InstallHost,
  product: CredsProduct,
  rid: CredsRid,
  version: string,
): Promise<void> {
  if (version === '') {
    return;
  }
  try {
    const target = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `Installing ${product.label} ${version}…` },
      () => performInstall(host, product, rid, version),
    );
    if (product !== CREDS_MCP) {
      await vscode.env.clipboard.writeText(target.fsPath);
      void vscode.window.showInformationMessage(`${product.label} ${version} installed at ${target.fsPath} — path copied.`);
      return;
    }
    await offerMcpClientConfig(target.fsPath);
  } catch (error) {
    void vscode.window.showErrorMessage(`Could not install ${product.label}: ${describeError(error)}`);
  }
}

/**
 * Do what was clicked.
 *
 * <p>Separate from the menu so the offering and the doing can be read one at a time; the choice
 * is matched by the string the person actually saw, which is what `choicesFor` produced.</p>
 */
export async function applyInstallChoice(
  host: InstallHost,
  product: CredsProduct,
  rid: CredsRid,
  action: CredsAction,
  picked: string,
): Promise<void> {
  if (picked.startsWith('Remove')) {
    await removeInstall(host, product, rid);
    void vscode.window.showInformationMessage(`${product.label} removed.`);
    return;
  }
  if (picked === 'Forget it') {
    await removeInstall(host, product, rid);
    return;
  }
  if (picked === 'Copy the path') {
    await copyInstalledPath(host, product, rid);
    return;
  }
  await runInstall(host, product, rid, versionOf(action));
}

export async function copyInstalledPath(
  host: InstallHost,
  product: CredsProduct,
  rid: CredsRid,
): Promise<void> {
  const path = binaryPath(host, product, rid).fsPath;
  await vscode.env.clipboard.writeText(path);
  void vscode.window.showInformationMessage(`${path} — copied.`);
}

/** Whether `name` resolves on PATH — `where` on Windows, `command -v` elsewhere. */
export function onPath(name: string): boolean {
  try {
    childProcess.execFileSync(
      process.platform === 'win32' ? 'where' : 'which',
      [name],
      { stdio: 'ignore', timeout: 3_000 },
    );
    return true;
  } catch {
    return false;
  }
}

/** The version a chosen action installs — the published one in every branch that offers one. */
export function versionOf(action: CredsAction): string {
  if (action.kind === 'update') {
    return action.to;
  }
  return action.kind === 'install' || action.kind === 'reinstall' || action.kind === 'installed'
    ? action.version
    : '';
}

/**
 * What is waiting for this account at its sync location, as far as we can tell.
 *
 * <p>Deliberately does NOT try to decrypt: a vault file that exists is proof the account
 * has a structure somewhere, and that is the whole question. Being unable to open it yet
 * is the normal state of a machine that has just signed in.</p>
 */
export async function probeRemote(
  account: StoredAccount,
  transports: TransportFactory,
): Promise<RemoteState> {
  const transport = transports.forAccount(account);
  if (transport === undefined) {
    return 'no-location';
  }
  try {
    return (await transport.readVault(account)) === undefined ? 'empty' : 'unknown';
  } catch {
    // Unreachable is not empty. Treating it as empty is exactly the mistake.
    return 'unknown';
  }
}
