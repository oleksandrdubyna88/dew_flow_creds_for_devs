/* eslint-disable complexity, max-lines-per-function -- moved verbatim out of extension.ts (roadmap A1, 2026-08-28):
   the ceilings are a boundary for NEW code here; each function meets them when it is next touched for a reason of its own. */
import { StorageManager } from './storageManager';
import { VaultKeys } from './vaultKeys';
import { asElement } from './commandTargets';
import { isVpnStartable } from './vpnCommand';
import * as vscode from 'vscode';
import { vpnTunnelName } from './vpnCommand';
import { vpnConfigFileName } from './vpnCommand';
import { materializedKeyPath } from './keyInstaller';
import { materializeVpnConfig } from './keyInstaller';
import { resolveVpnLauncher } from './vpnExec';
import { onPath } from './installFlow';
import * as fs from 'node:fs';
import { offerToInstall } from './toolEnsure';
import { vpnStartCommand } from './vpnCommand';
import { VpnPlatform } from './vpnCommand';
import { vpnStopCommand } from './vpnCommand';
import { EntityMetadata } from './types';
import { saveTextAs } from './saveTextAs';
/**
 * Bring a VPN tunnel up or down.
 *
 * <p>The config is materialized into the extension's private storage under the file name
 * the tool expects, and the command is shown in a terminal so the elevation prompt — UAC
 * on Windows, sudo on POSIX — is the operating system's own. Nothing is elevated
 * silently, and the line that will run is on screen before it runs.</p>
 */
export async function runVpn(
  target: unknown,
  action: 'start' | 'stop',
  storage: StorageManager,
  storageDir: string,
  vaultKeys: VaultKeys,
): Promise<void> {
  vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
  const element = asElement(target);
  if (element?.kind !== 'node' || !element.node.details) {
    return;
  }
  const details = element.node.details;
  const type = details.vpnType;
  if (!isVpnStartable(type) || type === undefined) {
    void vscode.window.showWarningMessage(
      `"${details.name}" is a ${details.vpnType ?? 'VPN'} entry. Only WireGuard and OpenVPN can be started from here — use Save Config and import it where your OS expects it.`,
    );
    return;
  }

  const platform = process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux';
  const tunnel = vpnTunnelName(details.name);
  const fileName = vpnConfigFileName(type, details.name);
  const configPath = materializedKeyPath(storageDir, fileName);

  // Stop does not need the config re-written; start does. Asking for the vault on a Stop
  // would mean a locked vault could leave a tunnel up with no way to bring it down.
  if (action === 'start') {
    const config = await storage.getVpnConfig(element.accountId, details.id);
    if (config === undefined || config.trim().length === 0) {
      void vscode.window.showWarningMessage(
        `"${details.name}" has no stored VPN config — open Edit and upload the file first.`,
      );
      return;
    }
    materializeVpnConfig(storageDir, fileName, config);
  }

  // Find the binary BEFORE composing a command around it. `openvpn.exe` is not on
  // PATH on a default install, and "OpenVPN on this machine" is often OpenVPN Connect —
  // a GUI that neither takes --config nor belongs on a command line.
  const launcher = resolveVpnLauncher(type, process.platform, process.env, onPath, fs.existsSync);
  if (launcher.kind === 'missing') {
    // T20: an offer instead of a dead end — the modal names what is missing and, on Yes, opens
    // a terminal running the platform's install recipe (visible, so sudo can ask).
    await offerToInstall(type === 'wireguard' ? 'wg-quick' : 'openvpn');
    return;
  }
  if (launcher.kind === 'openvpn-connect') {
    if (action === 'stop') {
      void vscode.window.showInformationMessage(
        'This machine uses OpenVPN Connect — disconnect from its own window.',
      );
      return;
    }
    // The GUI can IMPORT a profile; it cannot be driven like the CLI. Importing is the
    // honest half we can do — connecting stays in its window, where the tunnel may in
    // fact already be up.
    const open = await vscode.window.showInformationMessage(
      'This machine has OpenVPN Connect (the GUI), not the OpenVPN command line. Import this profile into it? If this VPN is already connected there, there is nothing to start.',
      'Import profile',
    );
    if (open === 'Import profile') {
      const terminal = vpnTerminal(details.name);
      terminal.sendText(`& "${launcher.exe}" --import-profile="${configPath}"`, true);
    }
    return;
  }

  const launch =
    action === 'start'
      ? vpnStartCommand(type, platform as VpnPlatform, configPath, launcher.exe)
      : vpnStopCommand(type, platform as VpnPlatform, tunnel, configPath);

  if (launch.kind === 'unsupported') {
    void vscode.window.showInformationMessage(launch.reason);
    return;
  }

  const terminal = vpnTerminal(details.name);
  terminal.sendText(launch.command, true);
  void vscode.window.showInformationMessage(launch.note);
}

export function vpnTerminal(entryName: string): vscode.Terminal {
  const name = `CredsForDevs VPN: ${entryName}`;
  const existing = vscode.window.terminals.find((t) => t.name === name);
  const terminal = existing ?? vscode.window.createTerminal({ name });
  terminal.show();
  return terminal;
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
