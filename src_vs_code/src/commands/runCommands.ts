import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { RefSource, resolveSecretRefs } from '../secretRef';
import { StorageManager } from '../storageManager';
import { VaultKeys } from '../vaultKeys';
import { nodeAt } from '../entityViewerCommands';
import { asElement } from '../commandTargets';
import { CommandParts, ResolvedCommand, resolveCommand } from '../commandLine';
import { ScriptRunPlan, scriptRunPlan } from '../scriptRun';
import { detectSecretPrints, resolveScriptEnv } from '../scriptRender';
import { lockToOwner, materializedKeyPath, safeFileComponent } from '../materializedKeys';
import { RefPlan, buildCommandLineWithRefs, planRefs, refField, rewriteScriptRefs } from '../runPlan';
import { runInMaskedTerminal } from '../maskedTerminal';
import { maskingBanner } from '../extension';
import { pinnedShell, pinnedTerminal, shellContext } from '../pinnedTerminal';
import { sendGuarded } from '../terminalGuard';
import { EntryTerminalKey, entryTerminalKeyOf, entryTerminalTitle, maskedRunTitle } from '../terminalTitles';
import { registerFolderRun } from './folderRunCommand';
import { trackTerminalActivity } from '../terminalActivityTracker';
import { confirmTrusted } from '../trustPrompt';
import { DependencyRunRequest, dependencyRequest, runDependenciesFirst, withSshSteps } from '../dependencyRunHost';
import { EntityMetadata } from '../types';
import { entryShell, hasOs, osMismatch, quoteFor, windowKind } from '../hostShell';
import { RemotePlan, SecretsLaunch, SshLink, maskedOverSshBanner, planLaunch, secretsLaunch, secretsLocalOnly, secretsRemoteLine, secretsStdin, sshLinkOf, sshLinkRefusal, trustLineFor } from '../remoteLaunch';
import { OwnedSessions, SpawnLaunch, SshRoad, ownedSessions, runOverSsh } from '../sshRoad';
import type { ReadySsh } from '../sshSession';

export interface RunCommandsHost {
  readonly context: vscode.ExtensionContext;
  readonly refSource: RefSource;
  readonly register: (command: string, handler: (...args: unknown[]) => unknown) => void;
  readonly storage: StorageManager;
  readonly storageDir: string;
  readonly vaultKeys: VaultKeys;
  /**
   * The person's road host (E2.S1 of `PLAN_terminal_command_over_ssh.md`): how a linked entry's SSH session is prepared and
   * refused. Only the person's roads hold it; the agent's calls keep E1's refusal (E2-D2).
   */
  readonly sshRoad: SshRoad;
}

/**
 * Running what an entry stores: its command, its script, or either with `creds://` references
 * resolved into the child's environment.
 *
 * <p>Each handler is a short sequence of named steps since issue #103, when they were touched
 * to add the entry's OS, the dependency chain and the pinned shell — the three used to be one
 * closure each, over the size limits and carrying their own copies of the trust modal.</p>
 */
export function registerRunCommands(host: RunCommandsHost): void {
  host.context.subscriptions.push(trackTerminalActivity());
  host.register('credSshManager.runCommand', (target) => runCommand(host, target));
  host.register('credSshManager.runScript', (target) => runScript(host, target));
  host.register('credSshManager.runWithSecrets', (target) => runWithSecrets(host, target));
  registerFolderRun(host);
}

interface Entry {
  readonly accountId: string;
  readonly id: string;
  readonly name: string;
  readonly details: EntityMetadata;
  /** The entry's terminal key, read from storage as it is NOW (the element's `parentId` may be old). */
  readonly key: EntryTerminalKey;
}

async function entryAt(host: RunCommandsHost, target: unknown): Promise<Entry | undefined> {
  host.vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
  const element = await nodeAt(asElement(target), host.storage);
  if (element?.kind !== 'node' || element.node.details === undefined) {
    return undefined;
  }
  const { accountId, node } = element;
  const key = entryTerminalKeyOf(host.storage, accountId, node.id, element.node.details.name);
  return { accountId, id: node.id, name: node.name, details: element.node.details, key };
}

function scriptOf(details: EntityMetadata): string {
  return details.script ?? '';
}

function languageOf(details: EntityMetadata): string {
  return details.scriptLanguage ?? 'other';
}

function warn(message: string): false {
  void vscode.window.showWarningMessage(message);
  return false;
}

/** Said, and nothing runs: the road's own words for no command, or the name's refusal. */
function sayNotReady(entry: Entry, resolved: Exclude<ResolvedCommand, { kind: 'ready' }>, whenEmpty: string): undefined {
  warn(resolved.kind === 'refused' ? `"${entry.name}" will not run: ${resolved.reason}` : whenEmpty);
  return undefined;
}

/**
 * What every run passes before anything is typed, in this order: the entry's OS against this
 * window (refused BEFORE the person is asked to trust a line that then could not run), the
 * content-trust modal once per exact body — sync and Accept Share made "you wrote this yourself"
 * untrue — and the dependencies the entry asks to run first (issue #103), each awaited.
 */
async function passGates(host: RunCommandsHost, entry: Entry, body: string, refusal: string | undefined): Promise<boolean> {
  if (refusal !== undefined) {
    return warn(refusal);
  }
  const trust = host.context.globalState;
  return (
    (await confirmTrusted(trust, entry.id, entry.name, body)) &&
    (await runDependenciesFirst(chainRequest(host, entry))).ready
  );
}

/** The entry's dependency chain, with the person's SSH road: a step linked to an SSH entry runs over it (E2.S3). */
function chainRequest(host: RunCommandsHost, entry: Entry): DependencyRunRequest {
  return withSshSteps(dependencyRequest(host.storage, entry.accountId, [entry.details], entry.name, host.context.globalState), host.sshRoad, entry.accountId, host.storage);
}

/** Why this window's terminal may not run the entry's own line — `entryShell`'s refusal, if any. */
function windowRefusal(entry: Entry): string | undefined {
  const choice = entryShell(entry.name, entry.details.terminalOs, shellContext());
  return choice.kind === 'refused' ? choice.reason : undefined;
}

// ---------- Run in Terminal ----------

async function runCommand(host: RunCommandsHost, target: unknown): Promise<void> {
  const entry = await entryAt(host, target);
  if (entry !== undefined) {
    await runEntryLine(host, entry);
  }
}

/**
 * The order of the arrow (E2.S1): the line (no command and the `{name}` refusal in today's words, for a linked entry
 * too), then the SSH link, then the local road or the linked one.
 */
async function runEntryLine(host: RunCommandsHost, entry: Entry): Promise<void> {
  const line = arrowLine(entry);
  if (line === undefined) {
    return;
  }
  const link = sshLinkOf(entry.details, (id) => host.storage.getNode(entry.accountId, id));
  await (link.kind === 'none' ? runLocalLine(host, entry, line) : runLinkedEntry(host, entry, link));
}

/** An entry with no link: today's road, unchanged — this window's terminal for its own *Runs on*. */
async function runLocalLine(host: RunCommandsHost, entry: Entry, line: string): Promise<void> {
  if (await passGates(host, entry, line, windowRefusal(entry))) {
    await typeIntoEntryTerminal(entry, line);
  }
}

/**
 * A linked entry: the plan first — its refusal (the link's, a Windows remote's, a line break's) is said before anyone is asked. No `windowRefusal`: *Runs on* is the remote's system (D14).
 * Then the road over SSH (`runOverSsh`, shared with the VPN launcher): prepare, the typed line's own refusal, the trust question on the prepared snapshot's trust line and the
 * dependencies, then the send into the entry's terminal.
 */
async function runLinkedEntry(host: RunCommandsHost, entry: Entry, link: SshLink): Promise<void> {
  const plan = planLaunch(entry.details, link, { stayOpen: true });
  if (plan.kind === 'refused') {
    warn(plan.reason);
  } else if (plan.kind === 'remote') {
    await runOverSsh(host.sshRoad, entry.accountId, plan, () => entry.key, (trustLine) => passGates(host, entry, trustLine, undefined));
  }
}

/** The entry's resolved line, or `undefined` having said why, before anyone is asked anything. */
function arrowLine(entry: Entry): string | undefined {
  const resolved = resolveCommand(entry.details);
  return resolved.kind === 'ready' ? resolved.line : sayNotReady(entry, resolved, `"${entry.name}" has no command yet — edit it and fill in the command.`);
}

/**
 * A dedicated terminal per entry, reused only when its last command is known to have finished — otherwise the person
 * is shown the terminal and asked (`terminalGuard.ts`; parent decision B). The line runs with Enter: the operator asked
 * for the button to do the whole job, and `Copy Command` remains for the times you want to edit before running. The title is
 * `entryTerminalTitle(key)`: the folder and `details.name`, as the folder run's and the launcher's are, so a share that split
 * the names cannot part their terminals.
 */
async function typeIntoEntryTerminal(entry: Entry, line: string): Promise<void> {
  const sent = await sendGuarded(entry.key, { kind: 'entry', terminalOs: entry.details.terminalOs }, () => line);
  if (sent.kind === 'refused') {
    warn(sent.reason);
  }
}

// ---------- Run Script ----------

interface ReadyScript {
  readonly entry: Entry;
  readonly script: string;
  readonly language: string;
  readonly plan: Extract<ScriptRunPlan, { kind: 'run' }>;
}

async function runScript(host: RunCommandsHost, target: unknown): Promise<void> {
  const ready = await readyScriptAt(host, target);
  if (ready === undefined || !(await passScriptGates(host, ready))) {
    return;
  }
  launchScript(host, ready);
}

async function readyScriptAt(host: RunCommandsHost, target: unknown): Promise<ReadyScript | undefined> {
  const entry = await entryAt(host, target);
  return entry === undefined ? undefined : readyScript(entry);
}

function readyScript(entry: Entry): ReadyScript | undefined {
  const script = scriptOf(entry.details);
  if (script.trim().length === 0) {
    return void warn('This script is empty — open Edit and write it first.');
  }
  const language = languageOf(entry.details);
  const plan = scriptRunPlan(language, process.platform);
  if (plan.kind === 'unsupported') {
    void vscode.window.showInformationMessage(plan.reason);
    return undefined;
  }
  return { entry, script, language, plan };
}

/**
 * The gates in their old order — the body trusted, then the one warning only a script has, then the
 * dependencies (issue #103).
 */
async function passScriptGates(host: RunCommandsHost, ready: ReadyScript): Promise<boolean> {
  const trust = host.context.globalState;
  const { entry, script } = ready;
  return (
    (await confirmTrusted(trust, entry.id, entry.name, script)) &&
    (await printsConfirmed(host, ready)) &&
    (await runDependenciesFirst(chainRequest(host, entry))).ready
  );
}

/**
 * Values live in the environment now, but the script is the user's own code and can print them
 * itself. Notice, say so once per exact body, never block.
 */
async function printsConfirmed(host: RunCommandsHost, ready: ReadyScript): Promise<boolean> {
  const { entry, script, language } = ready;
  const printed = detectSecretPrints(script, Object.keys(resolveScriptEnv(script, entry.details.scriptVars, language).env), language);
  return (
    printed.length === 0 ||
    confirmTrusted(
      host.context.globalState,
      `scriptPrint:${entry.id}`,
      entry.name,
      script,
      `This script prints ${printed.map((n) => '${' + n + '}').join(', ')} — the value will be visible in the terminal and its history. Run anyway?`,
    )
  );
}

/**
 * The values go into the terminal's ENVIRONMENT; the file gets a body that reads them by name. A
 * FRESH terminal every run: VS Code sets a terminal's environment only at creation, so a reused one
 * would run with the PREVIOUS entry's values. The interpreter line is composed for THIS platform,
 * so it runs in this platform's shell, the path quoted for it — a Windows path typed into a
 * WSL-bash default profile is the #103 defect in another costume.
 */
function launchScript(host: RunCommandsHost, ready: ReadyScript): void {
  const resolved = resolveScriptEnv(ready.script, ready.entry.details.scriptVars, ready.language);
  const opened = pinnedTerminal(entryTerminalTitle(ready.entry.key), { env: resolved.env, fresh: true });
  if (!opened.ok) {
    warn(opened.reason);
    return;
  }
  // The id is vault data — import and restore write an envelope's ids verbatim — so it is
  // sanitised before it becomes a path. See `safeFileComponent`.
  const scriptPath = writeScriptFile(host.storageDir, `script-${safeFileComponent(ready.entry.details.id)}${ready.plan.extension}`, resolved.body);
  opened.terminal.sendText([ready.plan.command, ...ready.plan.args, quoteFor(opened.shell.family, scriptPath)].join(' '), true);
}

/** A script body to a private file (0700, owner-only ACL), ending in a newline — its path. */
function writeScriptFile(storageDir: string, fileName: string, body: string): string {
  const scriptPath = materializedKeyPath(storageDir, fileName);
  fs.mkdirSync(path.dirname(scriptPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(scriptPath, body.endsWith('\n') ? body : `${body}\n`, { mode: 0o700 });
  lockToOwner(scriptPath);
  return scriptPath;
}

// ---------- Run with Secrets ----------

/**
 * Run a stored command or script with `creds://` references resolved into the CHILD's
 * environment, and every resolved value masked in what the child prints.
 *
 * <p>The broker's `env` verb writes values into this window's terminal environment, where any
 * later shell can read them back with `printenv`. This is the stronger shape: the value exists in
 * one child process, for one run, and never reaches the screen. The child is spawned by the
 * extension host itself (`maskedTerminal.ts`), so its shell is THIS machine's: the native one for
 * a script and for an entry with an OS (issue #103), `vscode.env.shell` for an entry without one,
 * as before.</p>
 *
 * <p><b>A linked command runs over SSH</b> (E3.S1 of `PLAN_terminal_command_over_ssh.md`). The order is: the link and the plan, the
 * checks that read nothing (a local window, a reference to resolve), prepare, the trust question on the trust line, the dependencies,
 * the values, the spawn. The child is `ssh` by argv with no shell; the values go to its STDIN as `export` lines for the remote login
 * shell, which is then closed; the output is masked; a banner says the run is not interactive and carries the launch's own warning.
 * One owner holds the prepared session until the masked run exists, and that run's end cleans it. A script never reads a link: a
 * script that a sync linked keeps the shared refusal.</p>
 */
async function runWithSecrets(host: RunCommandsHost, target: unknown): Promise<void> {
  const job = await secretsJobAt(host, target);
  if (job === undefined) {
    return;
  }
  const link = secretsLinkOf(host, job);
  await (link.kind === 'none' ? runSecretsHere(host, job) : runSecretsOverSsh(host, job, link));
}

/** A script never reads a link (the form keeps the field on Terminal entries): it goes to the local road, whose refusal still says no to a synced link. */
function secretsLinkOf(host: RunCommandsHost, job: SecretsJob): SshLink {
  return job.script === undefined ? sshLinkOf(job.entry.details, (id) => host.storage.getNode(job.entry.accountId, id)) : { kind: 'none' };
}

/** The local road, unchanged: the gates with `secretsRefusal`, the references, the child through its shell. */
async function runSecretsHere(host: RunCommandsHost, job: SecretsJob): Promise<void> {
  if (!(await passGates(host, job.entry, job.body, secretsRefusal(job.entry)))) {
    return;
  }
  const refs = await resolvedRefs(host, job);
  if (refs !== undefined) {
    runMasked(host, job, refs);
  }
}

/**
 * The script path and the local road: the SSH link first (a script that a sync linked; a linked COMMAND goes over SSH and never
 * reaches this), then this machine's OS: neither gets as far as the trust modal or a secret read.
 */
function secretsRefusal(entry: Entry): string | undefined {
  return sshLinkRefusal(entry.details) ?? osMismatch(entry.name, entry.details.terminalOs, process.platform);
}

interface SecretsJobBase {
  readonly entry: Entry;
  /** The exact text the trust record covers — the script body, or the resolved command line. */
  readonly body: string;
  /** The shell that reads the line — and that the reference rewrite spells its reads for. */
  readonly shell: string | undefined;
}

/** A script (its interpreter, file extension and language), or a command (its parts with `{name}` filled in). */
type SecretsJob =
  | (SecretsJobBase & { readonly script: { plan: Extract<ScriptRunPlan, { kind: 'run' }>; language: string }; readonly parts?: undefined })
  | (SecretsJobBase & { readonly script?: undefined; readonly parts: CommandParts });

async function secretsJobAt(host: RunCommandsHost, target: unknown): Promise<SecretsJob | undefined> {
  const entry = await entryAt(host, target);
  if (entry === undefined) {
    return undefined;
  }
  return entry.details.isScript === true ? scriptJob(entry) : commandJob(entry);
}

function scriptJob(entry: Entry): SecretsJob | undefined {
  const body = scriptOf(entry.details);
  const language = languageOf(entry.details);
  const plan = scriptRunPlan(language, process.platform);
  if (body.trim().length === 0) {
    return void warn(`"${entry.name}" has nothing to run yet — open Edit and fill in the script.`);
  }
  if (plan.kind === 'unsupported') {
    return void vscode.window.showInformationMessage(plan.reason);
  }
  return { entry, body, script: { plan, language }, shell: pinnedShell().shellPath };
}

function commandJob(entry: Entry): SecretsJob | undefined {
  const resolved = resolveCommand(entry.details);
  if (resolved.kind !== 'ready') {
    return sayNotReady(entry, resolved, `"${entry.name}" has nothing to run yet — open Edit and fill in the command.`);
  }
  return { entry, body: resolved.line, parts: resolved.parts, shell: hasOs(entry.details.terminalOs) ? pinnedShell().shellPath : vscode.env.shell };
}

interface ResolvedRefs {
  readonly plan: RefPlan;
  readonly env: Record<string, string>;
  readonly secrets: { value: string; label: string }[];
  readonly scriptBody: string;
}

/** Every reference resolved, and the environment and mask list built — or `undefined`, having said why. */
async function resolvedRefs(host: RunCommandsHost, job: SecretsJob): Promise<ResolvedRefs | undefined> {
  const scriptEnv = scriptEnvOf(job);
  const plan = planRefs(searchedTexts(job, scriptEnv));
  return plan.refs.length === 0 ? void warn(NO_REFERENCE(job.entry.name)) : resolvedValues(host, plan, scriptEnv);
}

/** What a run with no reference says, before anything is prepared or asked (said by both roads). */
export function NO_REFERENCE(name: string): string {
  return `"${name}" holds no creds:// reference. Write one as a value — creds://<account email>/<entity>/<field> — then run this again. Nothing was run.`;
}

/** Every reference read from the vault, or `undefined` having said why. */
async function resolvedValues(host: RunCommandsHost, plan: RefPlan, scriptEnv: ScriptEnv): Promise<ResolvedRefs | undefined> {
  const resolution = await resolveSecretRefs(plan.refs, host.refSource);
  return resolution.ok ? withValues(plan, resolution.values, scriptEnv) : void vscode.window.showErrorMessage(`Nothing was run: ${resolution.error}`);
}

/** A script's own variables travel the way they always have; a command has none (empty, never absent). */
function scriptEnvOf(job: SecretsJob): ScriptEnv {
  const d = job.entry.details;
  return job.script === undefined ? { env: {}, body: '' } : resolveScriptEnv(scriptOf(d), d.scriptVars, job.script.language);
}

/** Where references may be written: the body and every variable, or the command and every argument. */
function searchedTexts(job: SecretsJob, scriptEnv: ScriptEnv): string[] {
  const d = job.entry.details;
  return job.script === undefined ? commandTexts(job.parts) : [scriptEnv.body, ...(d.scriptVars ?? []).map((v) => v.value)];
}

/** The parts after `{name}`, so `creds://me/{name}/password` is a reference; disabled rows are scanned, as stored. */
function commandTexts(parts: CommandParts): string[] {
  return [parts.command, ...parts.args.map((a) => a.value)];
}

type ScriptEnv = { env: Record<string, string>; body: string };

/**
 * The child's environment and the mask list. Script variable VALUES are masked too: a body may
 * print those as readily as a reference, and each carries the NAME it is read by, so the
 * placeholder says which secret stood there.
 */
function withValues(plan: RefPlan, values: Readonly<Record<string, string>>, scriptEnv: ScriptEnv): ResolvedRefs {
  const env: Record<string, string> = { ...scriptEnv.env };
  for (const ref of plan.refs) {
    env[plan.names[ref]] = values[ref];
  }
  const secrets = [
    ...plan.refs.map((ref) => ({ value: values[ref], label: plan.names[ref] })),
    ...Object.entries(scriptEnv.env).map(([label, value]) => ({ value, label })),
  ];
  return { plan, env, secrets, scriptBody: scriptEnv.body };
}

/** The banner's first line: which variable stands for which reference. */
function describedRefs(plan: RefPlan): string {
  return plan.refs.map((ref) => `${plan.names[ref]} = ${refField(ref) ?? 'value'} of ${ref.replace(/^creds:\/\//, '')}`).join('; ');
}

function runMasked(host: RunCommandsHost, job: SecretsJob, refs: ResolvedRefs): void {
  const described = describedRefs(refs.plan);
  runInMaskedTerminal({
    name: maskedRunTitle(job.entry.name),
    commandLine: maskedCommandLine(host, job, refs),
    env: refs.env,
    secrets: refs.secrets,
    // The same shell the rewrite spelled its variable reads for.
    shell: job.shell,
    banner: `${described}\r\n${maskingBanner(refs.secrets)}`,
  });
}

function maskedCommandLine(host: RunCommandsHost, job: SecretsJob, refs: ResolvedRefs): string {
  if (job.script === undefined) {
    return buildCommandLineWithRefs(job.parts, refs.plan, process.platform, job.shell);
  }
  const d = job.entry.details;
  const body = rewriteScriptRefs(refs.scriptBody, refs.plan, job.script.language);
  const scriptPath = writeScriptFile(host.storageDir, `run-${d.id}${job.script.plan.extension}`, body);
  return [job.script.plan.command, ...job.script.plan.args, quoteFor(pinnedShell().family, scriptPath)].join(' ');
}

// ---------- Run with Secrets over SSH (E3.S1) ----------

/** What the steps of the road share: the host, the job, the plan (the trust line's line), the references planned from it, and the prepared session. */
interface SecretsOverSsh {
  readonly host: RunCommandsHost;
  readonly job: SecretsJob;
  readonly plan: RemotePlan;
  readonly refs: RefPlan;
  readonly ready: ReadySsh;
}

/** The ssh argv and the spawn's program, folder and environment: both are answered before anyone is asked. */
interface SshLaunches {
  readonly launch: Extract<SecretsLaunch, { kind: 'spawn' }>;
  readonly spawn: Extract<SpawnLaunch, { kind: 'spawn' }>;
}

/**
 * A linked command's road, up to the owner: a local window only, the plan's own refusals (the link's, a Windows remote's, a line
 * break's), and a reference to resolve — all said BEFORE prepare, so nobody is asked a PIN or a host-key question for a run that
 * cannot happen (E3-D3, E3-D6). The references come from the line that RUNS (`plan.line`, E3-D2), never from a disabled row.
 */
async function runSecretsOverSsh(host: RunCommandsHost, job: SecretsJob, link: SshLink): Promise<void> {
  const plan = secretsPlan(job, link);
  if (plan === undefined) {
    return;
  }
  const refs = planRefs([plan.line]);
  if (refs.refs.length === 0) {
    warn(NO_REFERENCE(job.entry.name));
    return;
  }
  await spawnOverSsh(host, job, plan, refs);
}

/** The window and the plan: the remote plan, or `undefined` having said why. */
function secretsPlan(job: SecretsJob, link: SshLink): RemotePlan | undefined {
  if (windowKind(vscode.env.remoteName) !== 'local') {
    warn(secretsLocalOnly(job.entry.name));
    return undefined;
  }
  const plan = planLaunch(job.entry.details, link, { stayOpen: false });
  if (plan.kind === 'refused') {
    warn(plan.reason);
  }
  return plan.kind === 'remote' ? plan : undefined;
}

/**
 * The ONE OWNER of the prepared session: it prepares for a SPAWN (E3-D4), `own`s the session, and cleans every session still on its
 * list in the `finally`. The hand-over to the masked run is inside this block (`maskedOverSsh`), so a throw from it or from the
 * terminal's creation leaves the session here, to be cleaned once.
 */
async function spawnOverSsh(host: RunCommandsHost, job: SecretsJob, plan: RemotePlan, refs: RefPlan): Promise<void> {
  const sessions = ownedSessions();
  try {
    const prepared = await host.sshRoad.prepare(job.entry.accountId, plan.ssh, 'spawn');
    if (prepared.kind === 'refused') {
      await host.sshRoad.sayRefused(prepared, plan.ssh);
    }
    if (prepared.kind !== 'ready') {
      return;
    }
    sessions.own(prepared);
    await trustedThenSpawned({ host, job, plan, refs, ready: prepared }, sessions);
  } finally {
    sessions.cleanAll();
  }
}

/**
 * From a prepared session to the masked run: the argv and the spawn (pure, before anyone is asked), the trust question on the
 * TRUST LINE of the snapshot and the dependencies, the values, and the hand-over. No child exists and no byte is written before
 * the trust is given. From `prepare` on, the run reads the prepared snapshot only (`ready`): never storage, never `plan.ssh`.
 */
async function trustedThenSpawned(run: SecretsOverSsh, sessions: OwnedSessions): Promise<void> {
  const launches = launchesOf(run);
  if (launches === undefined || !(await trustedOnItsLine(run))) {
    return;
  }
  const resolved = await resolvedValues(run.host, run.refs, { env: {}, body: '' });
  if (resolved !== undefined) {
    maskedOverSsh(sessions, run, launches, resolved);
  }
}

/** `secretsLaunch` and `spawnLaunch`, or `undefined` having said why: nothing is read and nobody is asked yet. A warning of the launch is the banner's. */
function launchesOf(run: SecretsOverSsh): SshLaunches | undefined {
  const launch = secretsLaunch(run.plan, run.ready);
  if (launch.kind === 'refused') {
    return void warn(launch.reason);
  }
  const spawn = run.host.sshRoad.spawnLaunch(run.ready.snapshot, run.ready.env);
  return spawn.kind === 'refused' ? void warn(spawn.reason) : { launch, spawn };
}

/** The trust modal on the prepared snapshot's trust line (it names the host the values will reach), then the dependencies. */
function trustedOnItsLine(run: SecretsOverSsh): Promise<boolean> {
  return passGates(run.host, run.job.entry, trustLineFor(run.ready.entity, run.ready.jump, run.plan.line), undefined);
}

/**
 * The ONLY place that hands a session to the masked run and makes it: one synchronous call, with no `await` and no `catch` of its own.
 * The session stays on the owner's list until the run exists, and the run's end (`ended`) is the list's own once-only end.
 */
function maskedOverSsh(sessions: OwnedSessions, run: SecretsOverSsh, launches: SshLaunches, resolved: ResolvedRefs): void {
  sessions.handOverToRun(run.ready, (ended) => {
    runInMaskedTerminal({
      name: maskedRunTitle(run.job.entry.name),
      argv: [launches.spawn.program, ...launches.launch.argv],
      cwd: launches.spawn.cwd,
      env: launches.spawn.env,
      stdinText: secretsStdin(resolved.env, secretsRemoteLine(run.plan, run.refs)),
      secrets: resolved.secrets,
      banner: maskedOverSshBanner(describedRefs(resolved.plan), launches.spawn.warning, launches.launch.target, resolved.secrets),
      onEnded: ended,
    });
  });
}
