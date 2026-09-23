import * as fs from 'node:fs';
import * as vscode from 'vscode';
import { StorageManager } from './storageManager';
import { VaultKeys } from './vaultKeys';
import { asElement } from './commandTargets';
import {
  VpnLaunch,
  VpnPlatform,
  isVpnStartable,
  vpnConfigFileName,
  vpnStartCommand,
  vpnStopCommand,
  vpnTunnelName,
} from './vpnCommand';
import { materializedKeyPath } from './keyInstaller';
import { TrustStore } from './commandTrust';
import { runDependenciesFirst } from './dependencyRunHost';
import { VpnRunContext, runWithLauncher, writeVpnConfig } from './vpnLauncherRun';
import { resolveVpnLauncher } from './vpnExec';
import { onPath } from './installFlow';
import { offerToInstall } from './toolEnsure';
import { EntityMetadata, VpnType } from './types';
import { saveTextAs } from './saveTextAs';
import { pinnedRefusal, pinnedTerminal } from './pinnedTerminal';

/**
 * Bring a VPN tunnel up or down.
 *
 * <p>The config is materialized into the extension's private storage under the file name
 * the tool expects, and the command is shown in a terminal so the elevation prompt — UAC
 * on Windows, sudo on POSIX — is the operating system's own. Nothing is elevated
 * silently, and the line that will run is on screen before it runs.</p>
 *
 * <p><b>The terminal's shell is pinned</b> to the one the line was composed for (issue #103):
 * the window's default profile can be WSL bash on a Windows machine, and `Start-Process` typed
 * into bash is `command not found`. See `pinnedTerminal.ts`.</p>
 *
 * <p><b>Returns whether anything was started.</b> The agent's `creds_vpn_up` reports this value;
 * it used to be told "opened" about a refusal the person saw as a warning.</p>
 */
export async function runVpn(
  target: unknown,
  action: 'start' | 'stop',
  storage: StorageManager,
  storageDir: string,
  vaultKeys: VaultKeys,
  trust: TrustStore,
): Promise<boolean> {
  vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
  const entry = vpnEntry(target);
  if (entry === undefined) {
    return false;
  }
  // Refused BEFORE the config is written: in a Remote-SSH window the terminal is another
  // computer's, and a tunnel there is not the one the person asked for.
  const refusal = pinnedRefusal();
  return refusal === undefined ? runVpnEntry({ ...entry, storage, storageDir, trust }, action) : refuse(refusal);
}

function vpnEntry(target: unknown): { accountId: string; details: EntityMetadata } | undefined {
  const element = asElement(target);
  if (element?.kind !== 'node') {
    return undefined;
  }
  const details = element.node.details;
  return details === undefined ? undefined : { accountId: element.accountId, details };
}

/** A launcher the person named wins over the built-in one; see `vpnLauncherRun.ts`. */
function runVpnEntry(ctx: VpnRunContext, action: 'start' | 'stop'): Promise<boolean> {
  const launcher = launcherOf(ctx);
  return launcher === undefined ? runBuiltIn(ctx, action) : runWithLauncher(ctx, launcher, action);
}

/**
 * The named launcher's record — or `undefined` for none, and for one that no longer exists, which
 * falls back to the built-in launcher with a warning (the `sshKeyEntityId` precedent).
 */
function launcherOf(ctx: VpnRunContext): EntityMetadata | undefined {
  const id = ctx.details.vpnLauncherEntityId ?? '';
  if (id === '') {
    return undefined;
  }
  const launcher = detailsOf(ctx, id);
  if (launcher === undefined) {
    void vscode.window.showWarningMessage(
      `The launcher of "${ctx.details.name}" no longer exists — using the built-in one. Edit the VPN to pick another.`,
    );
  }
  return launcher;
}

function detailsOf(ctx: VpnRunContext, id: string): EntityMetadata | undefined {
  return ctx.storage.getNode(ctx.accountId, id)?.details;
}

async function runBuiltIn(ctx: VpnRunContext, action: 'start' | 'stop'): Promise<boolean> {
  const type = startableType(ctx.details);
  if (type === undefined) {
    return refuse(notStartable(ctx.details));
  }
  // Stop does not need the config re-written; start does. Asking for the vault on a Stop
  // would mean a locked vault could leave a tunnel up with no way to bring it down.
  if (action === 'start' && !(await prepareStart(ctx, type))) {
    return false;
  }
  return settle(ctx.details.name, await launchFor(ctx, type, action));
}

/**
 * Before a built-in start: the dependencies this VPN asks to run (an installer, in the owner's
 * example) — BEFORE the launcher is looked for, so an install that just ran is found — then the
 * config written where the tool will read it.
 */
async function prepareStart(ctx: VpnRunContext, type: VpnType): Promise<boolean> {
  const ready = await runDependenciesFirst({
    roots: [ctx.details],
    nodeOf: (id) => ctx.storage.getNode(ctx.accountId, id)?.details,
    ownerName: ctx.details.name,
    trust: ctx.trust,
  });
  return ready && (await writeVpnConfig(ctx, vpnConfigFileName(type, ctx.details.name))) !== undefined;
}

function startableType(details: EntityMetadata): VpnType | undefined {
  const type = details.vpnType;
  return type !== undefined && isVpnStartable(type) ? type : undefined;
}

function notStartable(details: EntityMetadata): string {
  return `"${details.name}" is a ${details.vpnType ?? 'VPN'} entry. Only WireGuard and OpenVPN can be started from here — use Save Config and import it where your OS expects it.`;
}

/** What to run — or `settled` when a branch already answered (an install offer, OpenVPN Connect). */
type LaunchStep = VpnLaunch | { kind: 'settled'; started: boolean };

function settle(entryName: string, launch: LaunchStep): boolean {
  if (launch.kind === 'unsupported') {
    return refuse(launch.reason, 'info');
  }
  return launch.kind === 'run' ? sendToVpnTerminal(entryName, launch.command, launch.note) : launch.started;
}

async function launchFor(ctx: VpnRunContext, type: VpnType, action: 'start' | 'stop'): Promise<LaunchStep> {
  const configPath = materializedKeyPath(ctx.storageDir, vpnConfigFileName(type, ctx.details.name));
  // Find the binary BEFORE composing a command around it. `openvpn.exe` is not on
  // PATH on a default install, and "OpenVPN on this machine" is often OpenVPN Connect —
  // a GUI that neither takes --config nor belongs on a command line.
  const launcher = resolveVpnLauncher(type, process.platform, process.env, onPath, fs.existsSync);
  if (launcher.kind !== 'cli') {
    return { kind: 'settled', started: await noCli(launcher, type, ctx.details.name, configPath, action) };
  }
  return action === 'start'
    ? vpnStartCommand(type, hostVpnPlatform(), configPath, launcher.exe)
    : vpnStopCommand(type, hostVpnPlatform(), vpnTunnelName(ctx.details.name), configPath);
}

async function noCli(
  launcher: ReturnType<typeof resolveVpnLauncher>,
  type: VpnType,
  entryName: string,
  configPath: string,
  action: 'start' | 'stop',
): Promise<boolean> {
  if (launcher.kind === 'openvpn-connect') {
    return openVpnConnect(launcher.exe, entryName, configPath, action);
  }
  // T20: an offer instead of a dead end — the modal names what is missing and, on Yes, opens
  // a terminal running the platform's install recipe (visible, so sudo can ask).
  await offerToInstall(type === 'wireguard' ? 'wg-quick' : 'openvpn');
  return false;
}

async function openVpnConnect(exe: string, entryName: string, configPath: string, action: 'start' | 'stop'): Promise<boolean> {
  if (action === 'stop') {
    return refuse('This machine uses OpenVPN Connect — disconnect from its own window.', 'info');
  }
  // The GUI can IMPORT a profile; it cannot be driven like the CLI. Importing is the
  // honest half we can do — connecting stays in its window, where the tunnel may in
  // fact already be up.
  const open = await vscode.window.showInformationMessage(
    'This machine has OpenVPN Connect (the GUI), not the OpenVPN command line. Import this profile into it? If this VPN is already connected there, there is nothing to start.',
    'Import profile',
  );
  if (open !== 'Import profile') {
    return false;
  }
  // `&` is PowerShell's call operator — correct only because the terminal is pinned to it.
  return sendToVpnTerminal(entryName, `& "${exe}" --import-profile="${configPath}"`, '');
}

function hostVpnPlatform(): VpnPlatform {
  return process.platform === 'win32' || process.platform === 'darwin' ? process.platform : 'linux';
}

function sendToVpnTerminal(entryName: string, line: string, note: string): boolean {
  const opened = pinnedTerminal(`CredsForDevs VPN: ${entryName}`);
  if (!opened.ok) {
    return refuse(opened.reason);
  }
  opened.terminal.sendText(line, true);
  if (note !== '') {
    void vscode.window.showInformationMessage(note);
  }
  return true;
}

function refuse(message: string, level: 'warning' | 'info' = 'warning'): false {
  void (level === 'warning' ? vscode.window.showWarningMessage(message) : vscode.window.showInformationMessage(message));
  return false;
}

/** Save-As flow for a stored VPN config (context menu + viewer download). */
export async function saveVpnConfigToFile(
  accountId: string,
  details: EntityMetadata,
  storage: StorageManager,
): Promise<void> {
  const content = await storage.getVpnConfig(accountId, details.id);
  if (content === undefined) {
    void vscode.window.showWarningMessage(
      `"${details.name}" has no stored VPN config — open Edit and upload the file first.`,
    );
    return;
  }
  await saveTextAs('Save VPN config', details.vpnConfigFileName ?? `${details.name}.ovpn`, content);
}
