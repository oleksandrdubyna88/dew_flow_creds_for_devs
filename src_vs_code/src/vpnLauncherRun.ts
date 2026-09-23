import * as vscode from 'vscode';
import { StorageManager } from './storageManager';
import { TrustStore } from './commandTrust';
import { EntityMetadata } from './types';
import { materializedKeyPath, materializeVpnConfig } from './keyInstaller';
import { executableLine } from './dependencyRun';
import { runDependenciesFirst } from './dependencyRunHost';
import { HostShell, osMismatch, shellFamily } from './hostShell';
import { entryTerminal } from './pinnedTerminal';
import { confirmTrusted } from './trustPrompt';
import { launcherConfigFileName, launcherStopNote, substituteConfig, usesConfig } from './vpnLauncher';

/**
 * A VPN started by the Terminal entry the person named as its launcher (issue #103) — the
 * `vscode` half; the pure half is `vpnLauncher.ts`.
 *
 * <p>The order is the one every other stored line follows, plus the chain: the launcher's OS is
 * checked before anyone is asked anything; its line is confirmed once per exact TEMPLATE (the
 * `{config}` path contains the process id and would re-prompt every session); the dependencies
 * the VPN and the launcher ask for run and are awaited; only then is the config written and the
 * launcher's line typed — into the launcher's own terminal, in its own OS's shell.</p>
 */

export interface VpnRunContext {
  readonly accountId: string;
  readonly details: EntityMetadata;
  readonly storage: StorageManager;
  readonly storageDir: string;
  readonly trust: TrustStore;
}

export async function runWithLauncher(ctx: VpnRunContext, launcher: EntityMetadata, action: 'start' | 'stop'): Promise<boolean> {
  if (action === 'stop') {
    void vscode.window.showInformationMessage(launcherStopNote(launcher.name));
    return false;
  }
  const line = launcherLine(launcher);
  if (line === undefined || !(await confirmTrusted(ctx.trust, launcher.id, launcher.name, line))) {
    return false;
  }
  return dependenciesThenLaunch(ctx, launcher, line);
}

/** The launcher's line — or `undefined`, having said why, when it cannot run here at all. */
function launcherLine(launcher: EntityMetadata): string | undefined {
  const line = executableLine(launcher);
  const why =
    line === undefined
      ? `The launcher "${launcher.name}" has no command — edit it and fill one in.`
      : osMismatch(launcher.name, launcher.terminalOs, process.platform);
  if (why !== undefined) {
    void vscode.window.showWarningMessage(why);
    return undefined;
  }
  return line;
}

async function dependenciesThenLaunch(ctx: VpnRunContext, launcher: EntityMetadata, line: string): Promise<boolean> {
  const ready = await runDependenciesFirst({
    // Both ask for themselves: the VPN's own dependencies when it ticked the box, and the
    // launcher's (the installer, in the owner's example) when IT did. The launcher is the main
    // action, so it is excluded from the chain even when the VPN also lists it as a dependency.
    roots: [ctx.details, launcher],
    nodeOf: (id) => ctx.storage.getNode(ctx.accountId, id)?.details,
    exclude: new Set([launcher.id]),
    ownerName: ctx.details.name,
    trust: ctx.trust,
  });
  return ready && launch(ctx, launcher, line);
}

async function launch(ctx: VpnRunContext, launcher: EntityMetadata, line: string): Promise<boolean> {
  // Written only when the line asks for it: a launcher that knows its own profile needs no file.
  const configPath = usesConfig(line) ? await writeVpnConfig(ctx, launcherConfigFileName(ctx.details)) : '';
  if (configPath === undefined) {
    return false;
  }
  const opened = entryTerminal(launcher.name, launcher.terminalOs);
  if (!opened.ok) {
    void vscode.window.showWarningMessage(opened.reason);
    return false;
  }
  opened.terminal.sendText(withConfig(line, configPath, opened.shell), true);
  return true;
}

/**
 * The line with `{config}` quoted for the shell that will READ it: the pinned one when the
 * launcher has an OS, the window's default profile when it has none — quoting for the wrong one
 * would be #103 again.
 */
function withConfig(line: string, configPath: string, pinned: HostShell | undefined): string {
  if (configPath === '') {
    return line;
  }
  return substituteConfig(line, configPath, pinned?.family ?? shellFamily(process.platform, vscode.env.shell));
}

/**
 * Write the stored config where a launcher can read it, and answer its path — or `undefined`,
 * having told the person, when there is no config to write. Shared with the built-in launcher.
 */
export async function writeVpnConfig(ctx: VpnRunContext, fileName: string): Promise<string | undefined> {
  const config = await ctx.storage.getVpnConfig(ctx.accountId, ctx.details.id);
  if (config === undefined || config.trim().length === 0) {
    void vscode.window.showWarningMessage(
      `"${ctx.details.name}" has no stored VPN config — open Edit and upload the file first.`,
    );
    return undefined;
  }
  materializeVpnConfig(ctx.storageDir, fileName, config);
  return materializedKeyPath(ctx.storageDir, fileName);
}
