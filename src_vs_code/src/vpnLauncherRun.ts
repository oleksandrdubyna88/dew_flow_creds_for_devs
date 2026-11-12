import * as vscode from 'vscode';
import { DiagnosticWriter } from './diagnosticWriter';
import { ensureFolderColor, noteColourFailure } from './folderColors';
import { StorageManager } from './storageManager';
import { TrustStore } from './commandTrust';
import { EntityMetadata } from './types';
import { materializedKeyPath, materializeVpnConfig } from './keyInstaller';
import { commandRefusal } from './commandLine';
import { LaunchPlan, SshLink, planLaunch, sshLinkOf, sshLinkRefusal } from './remoteLaunch';
import { SshRoad, runOverSsh } from './sshRoad';
import { executableLine } from './dependencyRun';
import { ChainEnd, DependencyRunRequest, dependencyRequest, runDependenciesFirst, withSshSteps } from './dependencyRunHost';
import { endedAfter, requestGone } from './requestLife';
import { ShellFamily, entryShell } from './hostShell';
import { shellContext } from './pinnedTerminal';
import { sendGuarded } from './terminalGuard';
import { EntryTerminalKey, entryTerminalKeyOf } from './terminalTitles';
import { confirmTrusted } from './trustPrompt';
import { clickedSecret } from './pinClick';
import { launcherConfigFileName, launcherStopNote, substituteConfig, usesConfig } from './vpnLauncher';

/**
 * A VPN started by the Terminal entry the person named as its launcher (issue #103) — the
 * `vscode` half; the pure half is `vpnLauncher.ts`.
 *
 * <p>The order is the one every other stored line follows, plus the chain: the launcher's OS is
 * checked before anyone is asked anything; its line is confirmed once per exact TEMPLATE, with `{name}` already filled (the
 * `{config}` path contains the process id and would re-prompt every session); the dependencies
 * the VPN and the launcher ask for run and are awaited; only then is the config written and the
 * launcher's line typed — into the launcher's own terminal, in its own OS's shell, and typed only when that
 * terminal's last command is known to have finished; otherwise the person is asked, and an agent's request is refused
 * (`terminalGuard.ts`).</p>
 *
 * <p><b>A linked launcher on the person's Start</b> (E2.S1 of `PLAN_terminal_command_over_ssh.md`): link, then prepare, then
 * trust on the trust line, then the chain, then the send, with the ONE OWNER of `sshRoad.ts` holding the session; a line
 * with `{config}` is refused before anything is prepared (the file is on this machine). An agent's start has no road and
 * keeps E1's refusal (E2-D2).</p>
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
  /** The broker's seam for a late click on a question of this start's own (E1.5): see `runVpn`. Absent for the person's own Start. */
  readonly lateAnswer?: (what: string) => void;
  /** The broker's seam that makes a standing question of this start's own hold the one dialog place until it settles (F1). Absent for the person's own Start. */
  readonly standingPrompt?: (prompt: PromiseLike<unknown>) => void;
  /** The person's road host, set by their Start only (E2.S1). Absent for an agent's `creds_vpn_up`, which keeps E1's refusal of a linked launcher (E2-D2). */
  readonly sshRoad?: SshRoad;
  /** The diagnostic log, for the one line a failed folder-colour write leaves (`noteColourFailure`). */
  readonly log: DiagnosticWriter;
}

/**
 * The dependency chain of `roots`, carrying the request this start serves. On the person's Start (`ctx.sshRoad` set) a step
 * linked to an SSH entry runs over it (E2.S3); an agent's start has no road and keeps E1's refusal (E2-D2).
 */
export function vpnDependencies(ctx: VpnRunContext, roots: readonly EntityMetadata[], exclude?: ReadonlySet<string>): DependencyRunRequest {
  const request = dependencyRequest(ctx.storage, ctx.accountId, roots, ctx.details.name, ctx.trust, exclude);
  const withRoad = ctx.sshRoad === undefined ? request : withSshSteps(request, ctx.sshRoad, ctx.accountId, ctx.storage);
  return { ...withRoad, startGate: ctx.startGate, lateAnswer: ctx.lateAnswer, standingPrompt: ctx.standingPrompt };
}

/** A linked launcher's line may not use `{config}`: the file is on this machine, the line runs on the SSH host (E2.S1). */
export function linkedConfigRefusal(name: string): string {
  return `The launcher "${name}" runs over SSH, and its line uses {config}, a file on this machine. Remove {config} from the line, or set "Runs over SSH" to "Do not use".`;
}

export async function runWithLauncher(ctx: VpnRunContext, launcher: EntityMetadata, action: 'start' | 'stop'): Promise<boolean> {
  if (action === 'stop') {
    void vscode.window.showInformationMessage(launcherStopNote(launcher.name));
    return false;
  }
  // The launcher's OWN folder gets its colour before every gate, so the rule "no await between `configFor` and the send" stands.
  await ensureFolderColor(ctx.storage, ctx.accountId, launcher.id).catch(noteColourFailure(ctx.log));
  const link = linkOf(ctx, launcher);
  return ctx.sshRoad === undefined || link.kind === 'none' ? runLocalLauncher(ctx, launcher) : runLinkedLauncher(ctx, ctx.sshRoad, launcher, link);
}

/** No road (an agent's start) is no link: it keeps E1's refusal on the local road (E2-D2). */
function linkOf(ctx: VpnRunContext, launcher: EntityMetadata): SshLink {
  return ctx.sshRoad === undefined ? { kind: 'none' } : sshLinkOf(launcher, (id) => ctx.storage.getNode(ctx.accountId, id));
}

/** A launcher with no link, or an agent's start: today's road, unchanged. */
async function runLocalLauncher(ctx: VpnRunContext, launcher: EntityMetadata): Promise<boolean> {
  const line = launcherLine(launcher, launcherRefusal);
  if (line === undefined || !(await confirmTrusted(ctx.trust, launcher.id, launcher.name, line))) {
    return false;
  }
  return dependenciesThenLaunch(ctx, launcher, line);
}

/**
 * A linked launcher (E2.S1): its plan, then the `{config}` refusal BEFORE `prepare` (so no PIN is asked and no config
 * file is written), then the road over SSH shared with the arrow (`runOverSsh`): prepare, the typed line's own refusal, the
 * trust question on the prepared snapshot's trust line, the chain, then the send into the launcher's own terminal. No
 * `afterTheChain`: that belongs to the agent's start, which has no road. The launcher's key is read after the chain.
 */
async function runLinkedLauncher(ctx: VpnRunContext, road: SshRoad, launcher: EntityMetadata, link: SshLink): Promise<boolean> {
  if (launcherLine(launcher, () => undefined) === undefined) {
    return false;
  }
  const plan = planLaunch(launcher, link, { stayOpen: true });
  const refusal = linkedRefusal(launcher, plan);
  if (refusal !== undefined) {
    return refuse(refusal);
  }
  return plan.kind === 'remote' ? runOverSsh(road, ctx.accountId, plan, () => launcherKey(ctx, launcher), (trustLine) => trustedAndChained(ctx, launcher, trustLine)) : false;
}

/** Why a linked launcher cannot start: the plan's own refusal (the link's, a Windows remote's, a line break's), or a `{config}` in its line. */
function linkedRefusal(launcher: EntityMetadata, plan: LaunchPlan): string | undefined {
  if (plan.kind === 'refused') {
    return plan.reason;
  }
  return plan.kind === 'remote' && usesConfig(plan.line) ? linkedConfigRefusal(launcher.name) : undefined;
}

/** Said, and nothing runs. */
function refuse(why: string): false {
  void vscode.window.showWarningMessage(why);
  return false;
}

/** The trust question on the trust line, then the dependencies the VPN and the launcher ask for. */
async function trustedAndChained(ctx: VpnRunContext, launcher: EntityMetadata, trustLine: string): Promise<boolean> {
  return (await confirmTrusted(ctx.trust, launcher.id, launcher.name, trustLine)) && (await runDependenciesFirst(vpnDependencies(ctx, [ctx.details, launcher], new Set([launcher.id])))).ready;
}

/**
 * The launcher's line — or `undefined`, having said why, when it cannot run here at all: no command, a refused `{name}`,
 * or the road's own refusal of the place (`placeRefusal`: this window's terminal for the local road; none for a linked
 * one, whose *Runs on* is the remote's system).
 */
function launcherLine(launcher: EntityMetadata, placeRefusal: (launcher: EntityMetadata) => string | undefined): string | undefined {
  const line = executableLine(launcher);
  const why = line === undefined ? `The launcher "${launcher.name}" has no command — edit it and fill one in.` : refusalOf(launcher, placeRefusal);
  if (why !== undefined) {
    void vscode.window.showWarningMessage(why);
    return undefined;
  }
  return line;
}

/** Its `{name}` first, then the place: neither gets as far as the trust modal. */
function refusalOf(launcher: EntityMetadata, placeRefusal: (launcher: EntityMetadata) => string | undefined): string | undefined {
  const reason = commandRefusal(launcher);
  return reason === undefined ? placeRefusal(launcher) : `The launcher "${launcher.name}" will not start: ${reason}`;
}

/** The local road's place: E1's refusal of a link (an agent's start has no road, E2-D2), then this window's terminal for the launcher's own OS. */
function launcherRefusal(launcher: EntityMetadata): string | undefined {
  return sshLinkRefusal(launcher) ?? refusedHere(launcher);
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

/** The LAUNCHER's own key, read from its own node: it may sit in another folder than the VPN, and its own arrow must find this terminal. */
function launcherKey(ctx: VpnRunContext, launcher: EntityMetadata): EntryTerminalKey {
  return entryTerminalKeyOf(ctx.storage, ctx.accountId, launcher.id, launcher.name);
}

async function launch(ctx: VpnRunContext, launcher: EntityMetadata, line: string): Promise<boolean> {
  const configPath = await configFor(ctx, line);
  if (configPath === undefined) {
    return false;
  }
  // `{config}` quoted for the shell that will READ the line (`readerFamily`) — quoting for another one would be #103
  // again. With a request behind the start, the guard refuses a busy terminal instead of asking, so no await stands
  // between `configFor`'s last read of the request and the send (E4.S3).
  const sent = await sendGuarded(launcherKey(ctx, launcher), { kind: 'entry', terminalOs: launcher.terminalOs }, (family) => withConfig(line, configPath, family), ctx.startGate);
  if (sent.kind === 'refused') {
    void vscode.window.showWarningMessage(sent.reason);
  }
  return sent.kind === 'typed';
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
