import * as fs from 'node:fs';
import type { BridgeContext } from './bridgeContext';
import type { RunSite } from './bridgeConsentText';
import { AGENT_FORWARD_REFUSED, BRIDGE_USE_REFUSED, type BridgeWallSource, scopedRefSource } from './bridgeScope';
import { clampExecTimeout } from './brokerProtocol';
import { type ResolvedCommand, resolveCommand } from './commandLine';
import { type TrustStore, isCommandTrusted } from './commandTrust';
import { type HostShell, capturedRun, hostShell, osMismatch } from './hostShell';
import { type SecretSource, maskEntriesFor } from './maskEntries';
import { loginShellCommand, refusalSaid, sshLinkOf } from './remoteLaunch';
import { BRIDGE_NOT_SERVED } from './bridgeAllowList';
import { type RefPlan, buildCommandLineWithRefs, planRefs, referenceTextsOf, rewriteScriptRefs } from './runPlan';
import { type BridgedRunSite, decideRunSite } from './runSite';
import { resolveScriptEnv } from './scriptRender';
import { scriptRunPlan } from './scriptRun';
import { type RefSource, resolveSecretRefs } from './secretRef';
import type { MaskEntry } from './secretMasker';
import { validateRemoteCommand } from './sshExecCommand';
import { runBounded } from './sshExecRunner';
import { resolveJumpHops } from './sshOptions';
import { failed, maskedWith, runScriptFile, untrusted } from './storedRun';
import type { EntityMetadata } from './types';
import { type OverSsh, type UseActionContext, type UseActionResult, launchGuards } from './useActions';

/**
 * A stored command or script an agent runs through a Remote Bridge (parent plan §4.6; change 11.1, the 72-hour slice, S4).
 *
 * <p>Where it runs is `decideRunSite`'s, read from the live entry before the dialog (`bridgedValidation`, `bridgedSiteOf`) and again at the run,
 * which refuses when the entry would now run somewhere the dialog did not say. Two roads:</p>
 * <ul>
 *   <li><b>The server</b>: over the bridge's OWN SSH entry, through E1's contained `ssh` (`overSsh`: the per-call file, the client check, no agent
 *       forwarding). A command line goes as the remote login shell's one command; a script's body goes on standard input into a private file in
 *       `~/.creds-for-devs/run`, which its interpreter runs with input from `/dev/null`, and which is removed when it ends. No value of the vault goes
 *       there: a line with a `creds://` reference or a script with a variable never takes this road.</li>
 *   <li><b>This computer</b>: every `creds://` reference resolved through the bridge's scope (`scopedRefSource`), its value in the child's
 *       environment only (the line reads it by name, as the person's Run with Secrets does), and masked out of the output with the script's own
 *       variable values.</li>
 * </ul>
 */

/** Whether the entry is a stored script or a Terminal entry's command: the action knows which it serves. */
export type StoredShape = 'script' | 'command';

export interface BridgedRunDeps {
  readonly storage: SecretSource;
  readonly storageDir: string;
  readonly signal: AbortSignal;
  acquireExecSlot(): (() => void) | undefined;
  note(message: string): void;
  readonly trustStore: TrustStore;
  /** E1's contained `ssh` (`execOverSsh`). Absent (a test world of another road): a run on the server is refused. */
  readonly overSsh?: OverSsh;
  /** The reader of `creds://` references and the bridge's wall. Absent: a run on this computer is refused (the wiring always gives it). */
  readonly bridgeRefs?: { readonly refSource: RefSource; readonly wall: BridgeWallSource };
  /** This computer's platform and shell, given by a test that runs the Windows row on another system. Absent: this process's own. */
  readonly laptop?: { readonly platform: NodeJS.Platform; readonly shell: HostShell };
  readonly onPath?: (exe: string) => boolean;
}

/** Said when the entry would now run somewhere the dialog did not say (its "Runs on" or its references changed while it was open). */
export function SITE_CHANGED(entityName: string): string {
  return `"${entityName}" changed while the question was open, so it would now run somewhere the question did not say. Nothing ran. Ask again.`;
}

/** The longest script body that is sent to the server, in bytes. */
export const MAX_SERVER_SCRIPT_BYTES = 256 * 1024;

// ---- the decision, before the dialog and at the run ---------------------------------------------------------------------------------

/** The texts a reference is searched in: a command's parts after `{name}` was filled (else as stored), or the script body and every variable. */
function searchedTexts(entity: EntityMetadata, shape: StoredShape): string[] {
  if (shape === 'script') {
    return referenceTextsOf({ ...entity, isScript: true });
  }
  const resolved = resolveCommand(entity);
  return resolved.kind === 'ready' ? [resolved.parts.command, ...resolved.parts.args.map((arg) => arg.value)] : referenceTextsOf({ ...entity, isScript: false });
}

/** A script whose enabled named variables would be put in the child's environment. */
function injectsVariables(entity: EntityMetadata, shape: StoredShape): boolean {
  return shape === 'script' && Object.keys(resolveScriptEnv(scriptOf(entity), entity.scriptVars, languageOf(entity)).env).length > 0;
}

/** §4.6's answer for this live entry. */
export function runSiteOf(entity: EntityMetadata, entityName: string, shape: StoredShape): BridgedRunSite {
  const hasReferences = planRefs(searchedTexts(entity, shape)).refs.length > 0;
  return decideRunSite({ entityName, terminalOs: entity.terminalOs, hasReferences, injectsVariables: injectsVariables(entity, shape) });
}

/** `validate` on a bridge: a refused row is said before any dialog; a missing entry is the run's own `not_found`. */
export function bridgedValidation(entity: EntityMetadata | undefined, entityName: string, shape: StoredShape): { ok: true } | { ok: false; code: 'denied'; message: string } {
  const site = entity === undefined ? undefined : runSiteOf(entity, entityName, shape);
  return site?.kind === 'refused' ? { ok: false, code: 'denied', message: site.message } : { ok: true };
}

/** The site the dialog says: the server or this computer; nothing for a refused row (it never reaches a dialog). */
export function bridgedSiteOf(entity: EntityMetadata | undefined, entityName: string, shape: StoredShape): RunSite | undefined {
  const site = entity === undefined ? undefined : runSiteOf(entity, entityName, shape);
  return site === undefined || site.kind === 'refused' ? undefined : site.kind;
}

/**
 * The run on a bridge: an entry with an SSH link refused first (its line runs over ANOTHER connection from this computer, and a script that a sync
 * linked keeps the shared refusal; the callers' gate refused it already, this holds whoever calls), the decision again, the dialog's site
 * compared, then the road.
 */
export async function runBridged(deps: BridgedRunDeps, ctx: UseActionContext, bridge: BridgeContext, entity: EntityMetadata, shape: StoredShape): Promise<UseActionResult> {
  const site = siteAtRun(entity, ctx, shape);
  if ('status' in site) {
    return site;
  }
  return site.kind === 'server' ? onServer(deps, ctx, bridge, entity, shape) : onLaptop(deps, ctx, bridge, entity, shape);
}

/** Where the run goes now, or why it goes nowhere: a link, §4.6's refusal, or a site other than the one the dialog said. */
function siteAtRun(entity: EntityMetadata, ctx: UseActionContext, shape: StoredShape): { kind: 'server' | 'laptop' } | UseActionResult {
  if (sshLinkOf(entity, () => undefined).kind !== 'none') {
    return failed('not_supported', BRIDGE_NOT_SERVED);
  }
  const site = runSiteOf(entity, ctx.entityName, shape);
  if (site.kind === 'refused') {
    return failed(site.code, site.message);
  }
  return ctx.site === site.kind ? site : failed('denied', SITE_CHANGED(ctx.entityName));
}

// ---- the server ----------------------------------------------------------------------------------------------------------------------

/** What goes to the server: the one remote command, and a script's body on its input. */
interface ServerJob {
  readonly remoteCommand: string;
  readonly stdin?: string;
}

const isResult = (value: ServerJob | UseActionResult): value is UseActionResult => 'status' in value;

/** A command that will not run as stored: `{name}` refused, or nothing to run. */
function notReady(entity: EntityMetadata, entityName: string, resolved: Exclude<ResolvedCommand, { kind: 'ready' }>): UseActionResult {
  return resolved.kind === 'refused' ? failed('not_supported', refusalSaid(entity, resolved.reason)) : failed('no_credential', `"${entityName}" has no command.`);
}

/** The remote command, held to `ssh:exec`'s own limits (length, no NUL). */
function remoteJob(entityName: string, remoteCommand: string, stdin?: string): ServerJob | UseActionResult {
  const checked = validateRemoteCommand(remoteCommand);
  return checked.ok ? { remoteCommand, stdin } : failed('not_supported', `"${entityName}" cannot be run on the server: its ${checked.message}.`);
}

/** A Terminal entry's line, as the remote login shell's one command (the linked run's own form, `loginShellCommand`). */
function serverCommandJob(deps: BridgedRunDeps, ctx: UseActionContext, entity: EntityMetadata): ServerJob | UseActionResult {
  const resolved = resolveCommand(entity);
  if (resolved.kind !== 'ready') {
    return notReady(entity, ctx.entityName, resolved);
  }
  return isCommandTrusted(deps.trustStore, ctx.entityId, resolved.line) ? remoteJob(ctx.entityName, loginShellCommand(resolved.line)) : untrusted(ctx.entityName, 'the line');
}

/**
 * The remote side of a script run. Every word is this file's own (no text of the entry or the agent): a private folder, a fresh directory in it
 * named by `mktemp`, the body read from standard input into one file there, the interpreter run on that file with `/dev/null` as ITS input (a
 * script that reads standard input cannot eat its own body), and the directory removed on every way out. A directory a killed run left is swept
 * after twelve hours. The exit status is the interpreter's.
 */
export function serverScriptCommand(interpreter: string, extension: string): string {
  return [
    'umask 077',
    'd="$HOME/.creds-for-devs/run"',
    'mkdir -p "$d" && chmod 700 "$d" || exit 70',
    "find \"$d\" -mindepth 1 -maxdepth 1 -name 'r.*' -mmin +720 -exec rm -rf {} + 2>/dev/null",
    't=$(mktemp -d "$d/r.XXXXXXXX") || exit 70',
    "trap 'rm -rf \"$t\"' EXIT",
    "trap 'exit 129' HUP",
    "trap 'exit 130' INT",
    "trap 'exit 143' TERM",
    `cat > "$t/s${extension}" || exit 70`,
    `${interpreter} "$t/s${extension}" < /dev/null`,
  ].join('; ');
}

/** The interpreter on the Ubuntu server: the laptop's table read for Linux, `python3` for Python (Ubuntu has no `python`). */
function serverInterpreter(language: string): { words: string; extension: string } | { refused: string } {
  const plan = scriptRunPlan(language, 'linux');
  if (plan.kind === 'unsupported') {
    return { refused: plan.reason };
  }
  return { words: [plan.command === 'python' ? 'python3' : plan.command, ...plan.args].join(' '), extension: plan.extension };
}

/** The stored body, ending in a line break (an interpreter reading a last line with none is not every interpreter's promise). */
function scriptBodyOf(entity: EntityMetadata): string {
  const body = scriptOf(entity);
  return body.endsWith('\n') ? body : `${body}\n`;
}

const scriptOf = (entity: EntityMetadata): string => entity.script ?? '';

const languageOf = (entity: EntityMetadata): string => entity.scriptLanguage ?? 'other';

/** A stored script: trusted as saved, an interpreter the server has, a body within the bound; the body goes on standard input. */
function serverScriptJob(deps: BridgedRunDeps, ctx: UseActionContext, entity: EntityMetadata): ServerJob | UseActionResult {
  if (!isCommandTrusted(deps.trustStore, ctx.entityId, scriptOf(entity))) {
    return untrusted(ctx.entityName, 'what it does');
  }
  const interpreter = serverInterpreter(languageOf(entity));
  return 'refused' in interpreter ? failed('not_supported', interpreter.refused) : boundedScriptJob(ctx.entityName, interpreter, scriptBodyOf(entity));
}

function boundedScriptJob(entityName: string, interpreter: { words: string; extension: string }, body: string): ServerJob | UseActionResult {
  return Buffer.byteLength(body) > MAX_SERVER_SCRIPT_BYTES
    ? failed('not_supported', `"${entityName}" is longer than ${MAX_SERVER_SCRIPT_BYTES / 1024} KiB, so it is not sent to the server.`)
    : remoteJob(entityName, loginShellCommand(serverScriptCommand(interpreter.words, interpreter.extension)), body);
}

/** The bridge's own SSH entry, read only when this window has E1's SSH road. */
function serverDetails(deps: BridgedRunDeps, bridge: BridgeContext): EntityMetadata | undefined {
  return deps.overSsh === undefined ? undefined : deps.storage.getNode(bridge.accountId, bridge.serverEntityId)?.details;
}

/** The bridge's own SSH entry, as a connection may use it now, or the refusal; the real reason goes to the journal. */
function serverEntry(deps: BridgedRunDeps, ctx: UseActionContext, bridge: BridgeContext): EntityMetadata | UseActionResult {
  const server = serverDetails(deps, bridge);
  if (server === undefined) {
    deps.note(`creds_run — "${ctx.entityName}": the Remote Bridge's own SSH entry is not in the vault any more, or this window has no SSH road`);
    return failed('denied', BRIDGE_USE_REFUSED(ctx.entityName));
  }
  return server.agentForward === true ? failed('denied', AGENT_FORWARD_REFUSED(bridge.serverName)) : server;
}

const isEntry = (value: EntityMetadata | UseActionResult): value is EntityMetadata => !('status' in value && 'body' in value);

async function onServer(deps: BridgedRunDeps, ctx: UseActionContext, bridge: BridgeContext, entity: EntityMetadata, shape: StoredShape): Promise<UseActionResult> {
  const job = shape === 'script' ? serverScriptJob(deps, ctx, entity) : serverCommandJob(deps, ctx, entity);
  if (isResult(job)) {
    return job;
  }
  const server = serverEntry(deps, ctx, bridge);
  return isEntry(server) ? overBridgeEntry(deps, ctx, bridge, server, job) : server;
}

/** The run over the bridge's own entry, in its account, with the exec slot held; its values masked out of the answer. */
async function overBridgeEntry(deps: BridgedRunDeps, ctx: UseActionContext, bridge: BridgeContext, server: EntityMetadata, job: ServerJob): Promise<UseActionResult> {
  const masks = await maskEntriesFor(deps.storage, bridge.accountId, bridge.serverEntityId);
  const release = deps.acquireExecSlot();
  if (release === undefined) {
    return failed('too_many_requests', 'Too many commands are already running.');
  }
  try {
    const jump = (): ReturnType<typeof resolveJumpHops> => resolveJumpHops(server, (id) => deps.storage.getNode(bridge.accountId, id)?.details);
    const call = { ssh: server, jump, remoteCommand: job.remoteCommand, stdin: job.stdin, timeoutMs: clampExecTimeout(undefined), ownAgentOnly: true, noTty: true };
    return maskedWith(await (deps.overSsh as OverSsh)({ ...ctx, accountId: bridge.accountId }, call), masks); // `serverEntry` refused a window with none
  } finally {
    release();
  }
}

// ---- this computer -------------------------------------------------------------------------------------------------------------------

/** Every reference of `plan` read through the bridge's scope: the child's environment and the values to mask, or the refusal. */
async function resolvedRefs(deps: BridgedRunDeps, ctx: UseActionContext, bridge: BridgeContext, plan: RefPlan): Promise<{ env: Record<string, string>; masks: MaskEntry[] } | UseActionResult> {
  if (deps.bridgeRefs === undefined) {
    deps.note(`creds_run — "${ctx.entityName}": this window has no reference reader for a Remote Bridge`);
    return failed('denied', BRIDGE_USE_REFUSED(ctx.entityName));
  }
  const resolution = await resolveSecretRefs(plan.refs, scopedRefSource(bridge, deps.bridgeRefs.wall, deps.bridgeRefs.refSource));
  if (!resolution.ok) {
    deps.note(`creds_run — "${ctx.entityName}": ${resolution.error}`);
    return failed('no_credential', BRIDGE_USE_REFUSED(ctx.entityName));
  }
  const env = Object.fromEntries(plan.refs.map((ref) => [plan.names[ref], resolution.values[ref]]));
  return { env, masks: plan.refs.map((ref) => ({ value: resolution.values[ref], label: plan.names[ref] })) };
}

const isRefused = (value: object): value is UseActionResult => 'status' in value && 'body' in value;

/** This computer's platform and the shell a pinned line runs in: PowerShell 7 when this Windows has it, as the person's Run does. */
function laptopOf(deps: BridgedRunDeps): { platform: NodeJS.Platform; shell: HostShell } {
  return deps.laptop ?? { platform: process.platform, shell: hostShell(process.platform, fs.existsSync, process.platform === 'win32' && deps.onPath?.('pwsh.exe') === true) };
}

async function onLaptop(deps: BridgedRunDeps, ctx: UseActionContext, bridge: BridgeContext, entity: EntityMetadata, shape: StoredShape): Promise<UseActionResult> {
  const laptop = laptopOf(deps);
  const mismatch = osMismatch(ctx.entityName, entity.terminalOs, laptop.platform);
  if (mismatch !== undefined) {
    return failed('not_supported', mismatch);
  }
  const release = deps.acquireExecSlot();
  if (release === undefined) {
    return failed('too_many_requests', 'Too many commands are already running.');
  }
  try {
    return await (shape === 'script' ? laptopScript(deps, ctx, bridge, entity, laptop.platform) : laptopCommand(deps, ctx, bridge, entity, laptop));
  } finally {
    release();
  }
}

/** A Terminal entry's line on this computer: each reference read by name from the child's environment, in the shell the line is pinned to. */
async function laptopCommand(deps: BridgedRunDeps, ctx: UseActionContext, bridge: BridgeContext, entity: EntityMetadata, laptop: { platform: NodeJS.Platform; shell: HostShell }): Promise<UseActionResult> {
  const resolved = resolveCommand(entity);
  if (resolved.kind !== 'ready') {
    return notReady(entity, ctx.entityName, resolved);
  }
  if (!isCommandTrusted(deps.trustStore, ctx.entityId, resolved.line)) {
    return untrusted(ctx.entityName, 'the line');
  }
  const plan = planRefs([resolved.parts.command, ...resolved.parts.args.map((arg) => arg.value)]);
  const refs = await resolvedRefs(deps, ctx, bridge, plan);
  return isRefused(refs) ? refs : spawnLine(deps, ctx, entity, buildCommandLineWithRefs(resolved.parts, plan, laptop.platform, laptop.shell.shellPath), laptop.shell, refs);
}

async function spawnLine(deps: BridgedRunDeps, ctx: UseActionContext, entity: EntityMetadata, line: string, shell: HostShell, refs: { env: Record<string, string>; masks: MaskEntry[] }): Promise<UseActionResult> {
  const run = capturedRun(entity.terminalOs, line, shell);
  const outcome = await runBounded(run.program, run.args, run.shell, { env: { ...process.env, ...refs.env }, timeoutMs: clampExecTimeout(undefined), ...launchGuards(deps.signal, ctx) });
  return maskedWith({ status: 200, body: outcome }, refs.masks);
}

/** A stored script on this computer: its variables and its references in the child's environment, the file holding names only. */
async function laptopScript(deps: BridgedRunDeps, ctx: UseActionContext, bridge: BridgeContext, entity: EntityMetadata, platform: NodeJS.Platform): Promise<UseActionResult> {
  const plan = scriptRunPlan(languageOf(entity), platform);
  if (plan.kind === 'unsupported') {
    return failed('not_supported', plan.reason);
  }
  return isCommandTrusted(deps.trustStore, ctx.entityId, scriptOf(entity)) ? laptopScriptWithRefs(deps, ctx, bridge, entity, plan) : untrusted(ctx.entityName, 'what it does');
}

const variableValues = (entity: EntityMetadata): string[] => (entity.scriptVars ?? []).map((row) => row.value);

async function laptopScriptWithRefs(
  deps: BridgedRunDeps,
  ctx: UseActionContext,
  bridge: BridgeContext,
  entity: EntityMetadata,
  plan: Extract<ReturnType<typeof scriptRunPlan>, { kind: 'run' }>,
): Promise<UseActionResult> {
  const language = languageOf(entity);
  const own = resolveScriptEnv(scriptOf(entity), entity.scriptVars, language);
  const refPlan = planRefs([own.body, ...variableValues(entity)]);
  const refs = await resolvedRefs(deps, ctx, bridge, refPlan);
  if (isRefused(refs)) {
    return refs;
  }
  const masks = [...refs.masks, ...Object.entries(own.env).map(([label, value]) => ({ value, label }))];
  const ran = await runScriptFile(deps, ctx, plan, rewriteScriptRefs(own.body, refPlan, language), { ...process.env, ...own.env, ...refs.env });
  return maskedWith(ran, masks);
}
