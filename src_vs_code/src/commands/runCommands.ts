import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { RefSource, resolveSecretRefs } from '../secretRef';
import { StorageManager } from '../storageManager';
import { VaultKeys } from '../vaultKeys';
import { nodeAt } from '../entityViewerCommands';
import { asElement } from '../commandTargets';
import { buildCommandLine } from '../commandLine';
import { ScriptRunPlan, scriptRunPlan } from '../scriptRun';
import { detectSecretPrints, resolveScriptEnv } from '../scriptRender';
import { lockToOwner, materializedKeyPath, safeFileComponent } from '../materializedKeys';
import { RefPlan, buildCommandLineWithRefs, planRefs, refField, rewriteScriptRefs } from '../runPlan';
import { runInMaskedTerminal } from '../maskedTerminal';
import { maskingBanner } from '../extension';
import { entryTerminal, pinnedShell, pinnedTerminal, shellContext } from '../pinnedTerminal';
import { confirmTrusted } from '../trustPrompt';
import { dependencyRequest, runDependenciesFirst } from '../dependencyRunHost';
import { EntityMetadata } from '../types';
import { entryShell, hasOs, osMismatch, quoteFor } from '../hostShell';

export interface RunCommandsHost {
  readonly context: vscode.ExtensionContext;
  readonly refSource: RefSource;
  readonly register: (command: string, handler: (...args: unknown[]) => unknown) => void;
  readonly storage: StorageManager;
  readonly storageDir: string;
  readonly vaultKeys: VaultKeys;
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
  host.register('credSshManager.runCommand', (target) => runCommand(host, target));
  host.register('credSshManager.runScript', (target) => runScript(host, target));
  host.register('credSshManager.runWithSecrets', (target) => runWithSecrets(host, target));
}

interface Entry {
  readonly accountId: string;
  readonly id: string;
  readonly name: string;
  readonly details: EntityMetadata;
}

async function entryAt(host: RunCommandsHost, target: unknown): Promise<Entry | undefined> {
  host.vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
  const element = await nodeAt(asElement(target), host.storage);
  if (element?.kind !== 'node' || element.node.details === undefined) {
    return undefined;
  }
  return { accountId: element.accountId, id: element.node.id, name: element.node.name, details: element.node.details };
}

/** The stored command's line — disabled arguments left out. */
function commandLineOf(details: EntityMetadata): string {
  return buildCommandLine(details.command ?? '', details.commandArgs);
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
    runDependenciesFirst(dependencyRequest(host.storage, entry.accountId, [entry.details], entry.name, trust))
  );
}

/** Why this window's terminal may not run the entry's own line — `entryShell`'s refusal, if any. */
function windowRefusal(entry: Entry): string | undefined {
  const choice = entryShell(entry.name, entry.details.terminalOs, shellContext());
  return choice.kind === 'refused' ? choice.reason : undefined;
}

// ---------- Run in Terminal ----------

async function runCommand(host: RunCommandsHost, target: unknown): Promise<void> {
  const entry = await entryAt(host, target);
  if (entry === undefined) {
    return;
  }
  const line = commandLineOf(entry.details);
  if (line.length === 0) {
    warn(`"${entry.name}" has no command yet — edit it and fill in the command.`);
    return;
  }
  if (await passGates(host, entry, line, windowRefusal(entry))) {
    typeIntoEntryTerminal(entry, line);
  }
}

/**
 * A dedicated terminal per entry, reused — `entryTerminal` decides whose shell (issue #103). The
 * line runs with Enter: the operator asked for the button to do the whole job, and `Copy Command`
 * remains for the times you want to edit before running.
 */
function typeIntoEntryTerminal(entry: Entry, line: string): void {
  const opened = entryTerminal(entry.name, entry.details.terminalOs);
  if (opened.ok) {
    opened.terminal.sendText(line, true);
  } else {
    warn(opened.reason);
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
    runDependenciesFirst(dependencyRequest(host.storage, entry.accountId, [entry.details], entry.name, trust))
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
  const opened = pinnedTerminal(`CredsForDevs: ${ready.entry.name}`, { env: resolved.env, fresh: true });
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
 */
async function runWithSecrets(host: RunCommandsHost, target: unknown): Promise<void> {
  const job = await secretsJobAt(host, target);
  if (job === undefined || !(await passGates(host, job.entry, job.body, osMismatch(job.entry.name, job.entry.details.terminalOs, process.platform)))) {
    return;
  }
  const refs = await resolvedRefs(host, job);
  if (refs !== undefined) {
    runMasked(host, job, refs);
  }
}

interface SecretsJob {
  readonly entry: Entry;
  /** The exact text the trust record covers — the script body, or the command line. */
  readonly body: string;
  /** Present for a script; its interpreter, file extension and language. */
  readonly script?: { plan: Extract<ScriptRunPlan, { kind: 'run' }>; language: string };
  /** The shell that reads the line — and that the reference rewrite spells its reads for. */
  readonly shell: string | undefined;
}

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
  const body = commandLineOf(entry.details);
  if (body.trim().length === 0) {
    return void warn(`"${entry.name}" has nothing to run yet — open Edit and fill in the command.`);
  }
  return { entry, body, shell: hasOs(entry.details.terminalOs) ? pinnedShell().shellPath : vscode.env.shell };
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
  if (plan.refs.length === 0) {
    return void warn(
      `"${job.entry.name}" holds no creds:// reference. Write one as a value — creds://<account email>/<entity>/<field> — then run this again. Nothing was run.`,
    );
  }
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
  return job.script === undefined ? commandTexts(d) : [scriptEnv.body, ...(d.scriptVars ?? []).map((v) => v.value)];
}

function commandTexts(d: EntityMetadata): string[] {
  return [d.command ?? '', ...(d.commandArgs ?? []).map((a) => a.value)];
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

function runMasked(host: RunCommandsHost, job: SecretsJob, refs: ResolvedRefs): void {
  const described = refs.plan.refs
    .map((ref) => `${refs.plan.names[ref]} = ${refField(ref) ?? 'value'} of ${ref.replace(/^creds:\/\//, '')}`)
    .join('; ');
  runInMaskedTerminal({
    name: `CredsForDevs run: ${job.entry.name}`,
    commandLine: maskedCommandLine(host, job, refs),
    env: refs.env,
    secrets: refs.secrets,
    // The same shell the rewrite spelled its variable reads for.
    shell: job.shell,
    banner: `${described}\r\n${maskingBanner(refs.secrets)}`,
  });
}

function maskedCommandLine(host: RunCommandsHost, job: SecretsJob, refs: ResolvedRefs): string {
  const d = job.entry.details;
  if (job.script === undefined) {
    return buildCommandLineWithRefs(d.command ?? '', d.commandArgs, refs.plan, process.platform, job.shell);
  }
  const body = rewriteScriptRefs(refs.scriptBody, refs.plan, job.script.language);
  const scriptPath = writeScriptFile(host.storageDir, `run-${d.id}${job.script.plan.extension}`, body);
  return [job.script.plan.command, ...job.script.plan.args, quoteFor(pinnedShell().family, scriptPath)].join(' ');
}
