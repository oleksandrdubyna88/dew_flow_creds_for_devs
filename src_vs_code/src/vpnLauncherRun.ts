import * as vscode from 'vscode';
import { StorageManager } from './storageManager';
import { TrustStore } from './commandTrust';
import { EntityMetadata } from './types';
import { materializedKeyPath, materializeVpnConfig } from './keyInstaller';
import { executableLine } from './dependencyRun';
import { ChainEnd, DependencyRunRequest, dependencyRequest, runDependenciesFirst } from './dependencyRunHost';
import { endedAfter, requestGone } from './requestLife';
import { ShellFamily, entryShell } from './hostShell';
import { entryTerminal, shellContext } from './pinnedTerminal';
import { confirmTrusted } from './trustPrompt';
import { clickedSecret } from './pinClick';
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
  /**
   * The agent request this start serves, when an agent asked (`PLAN_wsl_bridge_outlives_its_client.md`
   * §5.7, E4.S3) — the shape of SSH's `ConnectOptions.startGate`. Fired means its client has gone: no
   * config is written and no line is typed for it. Read after every await on the start's path and
   * immediately before each effect. Absent for the person's own Start and Stop.
   */
  readonly startGate?: AbortSignal;
}

/** The dependency chain of `roots`, carrying the request this start serves. */
export function vpnDependencies(ctx: VpnRunContext, roots: readonly EntityMetadata[], exclude?: ReadonlySet<string>): DependencyRunRequest {
  return { ...dependencyRequest(ctx.storage, ctx.accountId, roots, ctx.details.name, ctx.trust, exclude), startGate: ctx.startGate };
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
  const why = line === undefined ? `The launcher "${launcher.name}" has no command — edit it and fill one in.` : refusedHere(launcher);
  if (why !== undefined) {
    void vscode.window.showWarningMessage(why);
    return undefined;
  }
  return line;
}

/** The launcher's OS against THIS window's terminal — the rule every Terminal entry follows. */
function refusedHere(launcher: EntityMetadata): string | undefined {
  const choice = entryShell(launcher.name, launcher.terminalOs, shellContext());
  return choice.kind === 'refused' ? choice.reason : undefined;
}

async function dependenciesThenLaunch(ctx: VpnRunContext, launcher: EntityMetadata, line: string): Promise<boolean> {
  // Both ask for themselves: the VPN's own dependencies when it ticked the box, and the launcher's
  // (the installer, in the owner's example) when IT did. The launcher is the main action, so it is
  // excluded from the chain even when the VPN also lists it as a dependency.
  const chain = await runDependenciesFirst(vpnDependencies(ctx, [ctx.details, launcher], new Set([launcher.id])));
  return chain.ready ? afterTheChain(ctx, chain, await launch(ctx, launcher, line)) : false;
}

/**
 * What a start answers once its chain has run: `started` as it is — unless nothing started, the chain had
 * typed a step, and the request has gone since. Then the request's end is thrown naming the step: the
 * later gates (the config read and its PIN, the launcher's line) answer `false` for a gone request, and a
 * `false` could only be journalled as "not launched", true of the VPN and false of the step the shell
 * already ran (E4.S4, code round 1). A live request's refusal stays `false`; the person's own click has
 * no gate and never throws.
 */
export function afterTheChain(ctx: VpnRunContext, chain: ChainEnd, started: boolean): boolean {
  if (started || !chain.typed || !requestGone(ctx.startGate)) {
    return started;
  }
  throw endedAfter('a dependency step had been typed');
}

async function launch(ctx: VpnRunContext, launcher: EntityMetadata, line: string): Promise<boolean> {
  const configPath = await configFor(ctx, line);
  if (configPath === undefined) {
    return false;
  }
  const opened = entryTerminal(launcher.name, launcher.terminalOs);
  if (!opened.ok) {
    void vscode.window.showWarningMessage(opened.reason);
    return false;
  }
  // `{config}` quoted for the shell that will READ the line (`readerFamily`) — quoting for another
  // one would be #103 again.
  opened.terminal.sendText(withConfig(line, configPath, opened.family), true);
  return true;
}

/**
 * The `{config}` path for `line` — `''` when the line needs no file, `undefined` when nothing may be
 * typed: no config to write, or the request gone. Read last, after the only await before the line, so it is
 * the check immediately before the launcher's line is sent (E4.S3).
 */
async function configFor(ctx: VpnRunContext, line: string): Promise<string | undefined> {
  // Written only when the line asks for it: a launcher that knows its own profile needs no file.
  const configPath = usesConfig(line) ? await writeVpnConfig(ctx, launcherConfigFileName(ctx.details)) : '';
  return requestGone(ctx.startGate) ? undefined : configPath;
}

function withConfig(line: string, configPath: string, family: ShellFamily): string {
  return configPath === '' ? line : substituteConfig(line, configPath, family);
}

/**
 * Write the stored config where a launcher can read it, and answer its path — or `undefined`,
 * having told the person, when there is no config to write. Shared with the built-in launcher.
 */
export async function writeVpnConfig(ctx: VpnRunContext, fileName: string): Promise<string | undefined> {
  const config = await storedConfig(ctx);
  if (config === undefined) {
    return undefined;
  }
  materializeVpnConfig(ctx.storageDir, fileName, config);
  return materializedKeyPath(ctx.storageDir, fileName);
}

/**
 * The stored config, opened — or `undefined` when there is none to write, having said so, and when the
 * request this start serves has gone (E4.S3): read before the entry's door, so a gone request is not
 * asked for a PIN, and again after it, because the door can wait on the PIN box — and the file this
 * feeds is the secret itself, outside the vault.
 */
async function storedConfig(ctx: VpnRunContext): Promise<string | undefined> {
  if (requestGone(ctx.startGate)) {
    return undefined;
  }
  // Opened for the click (entry-PIN plan, D6): the tunnel reads the file this writes, so an envelope
  // here was a config the VPN client could not parse. A temporary file, so no outside-the-PIN note.
  const opened = await clickedSecret(ctx.storage, ctx.accountId, ctx.details, (s, a, e) => s.getVpnConfig(a, e), 'start the VPN', undefined);
  if (opened.kind !== 'open' || requestGone(ctx.startGate)) {
    return undefined;
  }
  return usableConfig(ctx.details.name, opened.value);
}

function usableConfig(entryName: string, config: string | undefined): string | undefined {
  if (config === undefined || config.trim().length === 0) {
    void vscode.window.showWarningMessage(`"${entryName}" has no stored VPN config — open Edit and upload the file first.`);
    return undefined;
  }
  return config;
}
