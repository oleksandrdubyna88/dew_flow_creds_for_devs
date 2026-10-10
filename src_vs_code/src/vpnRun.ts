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
import { liveDetails, runDependenciesFirst } from './dependencyRunHost';
import { quoteFor } from './hostShell';
import { VpnRunContext, runWithLauncher, vpnDependencies, writeVpnConfig } from './vpnLauncherRun';
import { requestGone } from './requestLife';
import type { VpnUseDeps } from './agentUseActions';
import { resolveVpnLauncher } from './vpnExec';
import { onPath } from './installFlow';
import { offerToInstall } from './toolEnsure';
import { EntityMetadata, VpnType } from './types';
import { saveTextAs } from './saveTextAs';
import { pinnedRefusal, sendPinned } from './pinnedTerminal';
import { clickedSecret, outsidePinNote } from './pinClick';

/**
 * The agent's VPN opener — `vpnAction`'s `open` — as a factory, so the one line that matters in it, handing
 * the request's gate to the start, is held by a test rather than only by `extension.ts` (E4.S3, checkpoint
 * round). The grant carries the account, so the tree element `runVpn` expects is rebuilt exactly: the same
 * function the human Start button calls, plus the request's start gate. `runVpn`'s own answer goes back, so a
 * refusal the person saw never reaches the agent as "opened".
 */
export function agentVpnOpener(storage: StorageManager, storageDir: string, vaultKeys: VaultKeys, trust: TrustStore): VpnUseDeps['open'] {
  return async (accountId, entityId, action, startGate) => {
    const node = storage.getNode(accountId, entityId);
    return node === undefined ? false : runVpn({ kind: 'node', accountId, node }, action, storage, storageDir, vaultKeys, trust, startGate);
  };
}

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
 *
 * <p><b>`startGate` is the agent request this start serves</b> (`PLAN_wsl_bridge_outlives_its_client.md`
 * §5.7, E4.S3), absent for the person's own Start and Stop. A start waits — the dependency chain, the
 * config read and its PIN, a launcher's trust modal, OpenVPN Connect's question, an install offer —
 * before it types anything; once the client that asked has gone, nothing more is written or typed for it,
 * and `false` is answered without a word to a person who did not ask. A line already typed is the
 * shell's, and a tunnel already up stays up: this gates the start, it does not take one back.</p>
 */
export async function runVpn(
  target: unknown,
  action: 'start' | 'stop',
  storage: StorageManager,
  storageDir: string,
  vaultKeys: VaultKeys,
  trust: TrustStore,
  startGate: AbortSignal | undefined,
): Promise<boolean> {
  vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
  const entry = vpnEntry(target);
  if (entry === undefined || requestGone(startGate)) {
    return false;
  }
  // Refused BEFORE the config is written: in a Remote-SSH window the terminal is another
  // computer's, and a tunnel there is not the one the person asked for.
  const refusal = pinnedRefusal();
  return refusal === undefined ? runVpnEntry({ ...entry, storage, storageDir, trust, startGate }, action) : refuse(refusal);
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
  // A launcher in the Trash counts as gone: its line is not run however trusted it once was.
  const launcher = liveDetails(ctx.storage, ctx.accountId, id);
  if (launcher === undefined) {
    void vscode.window.showWarningMessage(
      `The launcher of "${ctx.details.name}" no longer exists — using the built-in one. Edit the VPN to pick another.`,
    );
  }
  return launcher;
}

async function runBuiltIn(ctx: VpnRunContext, action: 'start' | 'stop'): Promise<boolean> {
  const type = startableType(ctx.details);
  if (type === undefined) {
    return refuse(notStartable(ctx.details));
  }
  // Before a start: the dependencies this VPN asks to run (an installer, in the owner's example) —
  // BEFORE the launcher is looked for, so an install that just ran is found. A stop runs none.
  if (action === 'start' && !(await runDependenciesFirst(vpnDependencies(ctx, [ctx.details])))) {
    return false;
  }
  return settle(ctx, await launchFor(ctx, type, action));
}

function startableType(details: EntityMetadata): VpnType | undefined {
  const type = details.vpnType;
  return type !== undefined && isVpnStartable(type) ? type : undefined;
}

function notStartable(details: EntityMetadata): string {
  return `"${details.name}" is a ${details.vpnType ?? 'VPN'} entry. The built-in launcher starts only WireGuard and OpenVPN — edit it and pick one of your Terminal entries under "Started by", or use Save Config and import it where your OS expects it.`;
}

/** What to run — or `settled` when a branch already answered (an install offer, OpenVPN Connect). */
type LaunchStep = VpnLaunch | { kind: 'settled'; started: boolean };

function settle(ctx: VpnRunContext, launch: LaunchStep): boolean {
  if (launch.kind === 'unsupported') {
    return refuse(launch.reason, 'info');
  }
  return launch.kind === 'run' ? sendToVpnTerminal(ctx, launch.command, launch.note) : launch.started;
}

async function launchFor(ctx: VpnRunContext, type: VpnType, action: 'start' | 'stop'): Promise<LaunchStep> {
  // Find the binary BEFORE composing a command around it. `openvpn.exe` is not on
  // PATH on a default install, and "OpenVPN on this machine" is often OpenVPN Connect —
  // a GUI that neither takes --config nor belongs on a command line.
  const launcher = resolveVpnLauncher(type, process.platform, process.env, onPath, fs.existsSync);
  if (launcher.kind !== 'cli') {
    return { kind: 'settled', started: await noCli(ctx, launcher, type, action) };
  }
  return action === 'start'
    ? startLine(ctx, type, launcher.exe)
    : vpnStopCommand(type, hostVpnPlatform(), vpnTunnelName(ctx.details.name), configPathOf(ctx, type));
}

/**
 * The built-in start's line, with its config written — LAST, once nothing can refuse the start any more.
 *
 * <p>The config is the secret itself, on disk outside the vault. Written before the launcher was known it
 * was left behind for a launcher that was missing, an import nobody accepted, or a request that had gone
 * (E4.S3, code round 1). Now only a line that will be sent writes it, and nothing awaits between the write
 * and the send. A Stop never rewrites it: asking for the vault on a Stop would mean a locked vault could
 * leave a tunnel up with no way to bring it down.</p>
 */
async function startLine(ctx: VpnRunContext, type: VpnType, exe: string): Promise<LaunchStep> {
  const launch = vpnStartCommand(type, hostVpnPlatform(), configPathOf(ctx, type), exe);
  return launch.kind !== 'run' || (await writeVpnConfig(ctx, vpnConfigFileName(type, ctx.details.name))) !== undefined ? launch : NOT_STARTED;
}

const NOT_STARTED: LaunchStep = { kind: 'settled', started: false };

/** Where the built-in launcher's config is written — and read by the tool. */
function configPathOf(ctx: VpnRunContext, type: VpnType): string {
  return materializedKeyPath(ctx.storageDir, vpnConfigFileName(type, ctx.details.name));
}

async function noCli(ctx: VpnRunContext, launcher: ReturnType<typeof resolveVpnLauncher>, type: VpnType, action: 'start' | 'stop'): Promise<boolean> {
  if (launcher.kind === 'openvpn-connect') {
    return openVpnConnect(ctx, launcher.exe, type, action);
  }
  // T20: an offer instead of a dead end — the modal names what is missing and, on Yes, opens
  // a terminal running the platform's install recipe (visible, so sudo can ask). An agent's request
  // travels with it, so a client gone while it is open gets no installer (E4.S3).
  await offerToInstall(type === 'wireguard' ? 'wg-quick' : 'openvpn', ctx.startGate);
  return false;
}

async function openVpnConnect(ctx: VpnRunContext, exe: string, type: VpnType, action: 'start' | 'stop'): Promise<boolean> {
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
  // The profile is written only once the import is accepted — and `writeVpnConfig` reads the request last.
  const configPath = open === 'Import profile' ? await writeVpnConfig(ctx, vpnConfigFileName(type, ctx.details.name)) : undefined;
  if (configPath === undefined) {
    return false;
  }
  // `&` is PowerShell's call operator — correct only because the terminal is pinned to it — and
  // both words are single-quoted, which PowerShell never expands (`$`, backtick).
  const line = `& ${quoteFor('powershell', exe)} ${quoteFor('powershell', `--import-profile=${configPath}`)}`;
  return sendToVpnTerminal(ctx, line, '');
}

function hostVpnPlatform(): VpnPlatform {
  return process.platform === 'win32' || process.platform === 'darwin' ? process.platform : 'linux';
}

/**
 * The one place the built-in launcher types a line — the tunnel's start or stop, OpenVPN Connect's import.
 * The request it serves is read here, immediately before the line is sent: every await of the start lies
 * behind this point, so a client gone during any of them gets nothing typed (E4.S3).
 */
function sendToVpnTerminal(ctx: VpnRunContext, line: string, note: string): boolean {
  if (requestGone(ctx.startGate)) {
    return false;
  }
  const sent = sendPinned(`CredsForDevs VPN: ${ctx.details.name}`, line);
  if (sent && note !== '') {
    void vscode.window.showInformationMessage(note);
  }
  return sent;
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
  const opened = await clickedSecret(storage, accountId, details, (s, a, e) => s.getVpnConfig(a, e), 'save its VPN configuration', undefined);
  if (opened.kind !== 'open') {
    return;
  }
  if (opened.value === undefined) {
    void vscode.window.showWarningMessage(
      `"${details.name}" has no stored VPN config — open Edit and upload the file first.`,
    );
    return;
  }
  await saveTextAs('Save VPN config', details.vpnConfigFileName ?? `${details.name}.ovpn`, opened.value, outsidePinNote(opened));
}
