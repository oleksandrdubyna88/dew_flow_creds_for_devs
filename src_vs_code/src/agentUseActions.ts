import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  EXPORT_REFUSED,
  EnvExportResponseBody,
  ErrorCode,
  ExecResponseBody,
  clampExecTimeout,
  errorBody,
  statusForErrorCode,
} from './brokerProtocol';
import { CallTarget, OverSsh, UseAction, UseActionContext, UseActionResult, UsedEntry, launchGuards } from './useActions';
import type { BridgeContext } from './bridgeContext';
import { BRIDGE_NOT_SERVED } from './bridgeAllowList';
import { UsableFound, accountOnly, agentMayView, findUsableEntry, hiddenFromAgents } from './mcpEntries';
import { agentRefusal } from './agentNaming';
import { describeSshTarget } from './sshCommand';
import { JumpChain, resolveJumpChain } from './sshOptions';
import { EnvApplyResult } from './envApplyNotice';
import { StorageManager } from './storageManager';
import { EntityMetadata, TreeNode } from './types';
import { runBounded } from './sshExecRunner';
import { notStarted } from './requestLife';
import { resolveScriptEnv } from './scriptRender';
import { scriptRunPlan } from './scriptRun';
import { LaunchPlan, SshLink, planLaunch, refusalSaid, sshLinkOf, trustLineFor } from './remoteLaunch';
import { capturedRun, hostShell, osMismatch, windowKind } from './hostShell';
import { isCommandTrusted } from './commandTrust';
import { lockToOwner, materializedKeyPath } from './materializedKeys';
import { bridgedSshEnv } from './bridgedSshEnv';
import { buildDbQueryLaunch, isSafePostgresUri, refuseQuery, resolveDbCli } from './dbCliLauncher';
import { fieldReadingOf } from './secretOpener';
import { automaticOpenerFor } from './automaticRead';

/**
 * The broker's non-SSH capabilities: a stored script, a stored terminal command, and a
 * bare credential.
 *
 * <p>Shaped exactly like `sshUseActions.ts` — validate, summarize, re-read the live
 * entity, act, clean up in `finally` — because a second shape would be a second set of
 * mistakes. What differs per kind is only where the secret goes, and each kind reuses the
 * closest channel that already exists rather than inventing one.</p>
 *
 * <p>Two of the three ignore the request body entirely. That is the load-bearing safety
 * property here and not an oversight: what runs is exactly what a human saved, so no
 * agent-supplied text ever reaches an interpreter or a shell.</p>
 */

/** The one storage read an action needs to find the entity its grant names. */
export type EntitySource = Pick<StorageManager, 'getNode'>;

/**
 * What the VPN action reads — the entity, and the window's own Start/Stop — and nothing else, so a test
 * hands it exactly that rather than a cast (E4.S3, code round 1).
 */
export interface VpnUseDeps {
  readonly storage: EntitySource;
  open(accountId: string, entityId: string, action: 'start' | 'stop', startGate: AbortSignal, lateAnswer?: (what: string) => void, standingPrompt?: (prompt: PromiseLike<unknown>) => void): Promise<boolean>;
}

export interface AgentUseDeps {
  storage: StorageManager;
  storageDir: string;
  /** Aborted on dispose, so nothing spawned here outlives the window. */
  signal: AbortSignal;
  /** Guard against a runaway agent loop; returns a release function. */
  acquireExecSlot(): (() => void) | undefined;
  note(message: string): void;
  /** This machine's record of which exact bodies a person has vouched for. */
  trustStore: {
    get(key: string): string[] | undefined;
    update(key: string, value: string[]): Thenable<void>;
  };
  /**
   * Writes an entity's bound secrets into the terminal environment; answers what was written and
   * what the policy withheld. Only the NAMES written cross the broker today — `EnvExportResponseBody`
   * is a contract the CLI and the MCP read, and widening it is not part of #48.
   */
  applyEnv(details: EntityMetadata, accountId: string): Promise<EnvApplyResult>;
  /**
   * The agent's socket when one is running (the wiring spreads `sshDeps`, which carries it). Optional: a test world leaves it out, and the
   * run of a linked entry then reads "this agent does not forward" (E3.S2 §6).
   */
  agentSocket?: () => string | undefined;
}

function fail(code: ErrorCode, message: string): UseActionResult {
  return { status: statusForErrorCode(code), body: errorBody(code, message) };
}

/** The live entity behind a grant, re-read on every call — never a snapshot. */
function entityFor(deps: { storage: EntitySource }, ctx: CallTarget): EntityMetadata | undefined {
  return deps.storage.getNode(ctx.accountId, ctx.entityId)?.details;
}

function execOutcome(result: UseActionResult): string {
  const body = result.body as ExecResponseBody;
  return body.timedOut === true ? 'timed out' : `exit ${body.exitCode ?? 'killed'}`;
}

/*
 * Masking the output an agent reads is NOT done here.
 *
 * <p>An earlier version of this file masked `stdout`/`stderr` inside `scriptRunAction`. That
 * covered one action; `credsAgentServer.respond` now masks every response on its way out, which
 * covers `ssh:exec`, `db:query`, `script:run` and anything added later without an action having
 * to remember. One choke point, and no second masker to disagree with it.</p>
 */

/**
 * The message a not-yet-vouched-for body gets.
 *
 * <p>The broker's own consent is per GRANT: once a person clicks Allow, every later call
 * on that token runs silently — including one whose stored content was edited, or
 * replaced by a sync, after the click. The content fingerprint is what notices that, so
 * the agent path checks it too rather than trusting a grant to cover a body it never
 * showed anyone.</p>
 */
function untrusted(entityName: string, what: string): UseActionResult {
  return fail(
    'no_credential',
    `"${entityName}" has not been run on this machine yet. Run it once from the tree so a person sees ${what}, then retry.`,
  );
}

/**
 * Run a stored SCRIPT.
 *
 * <p>Variables travel in the child's environment, so the file written to disk holds names
 * rather than values (see `resolveScriptEnv`), and it is deleted in `finally`.</p>
 */
// eslint-disable-next-line max-lines-per-function
export function scriptRunAction(deps: AgentUseDeps): UseAction {
  return {
    kind: 'script',
    action: 'run',
    mutatesSecrets: false,
    verb: 'run the stored script of',
    describeOutcome: execOutcome,
    validate: () => ({ ok: true }),
    summarize: () => 'the stored script, exactly as saved',
    // eslint-disable-next-line complexity
    async run(ctx): Promise<UseActionResult> {
      const entity = entityFor(deps, ctx);
      if (entity === undefined) {
        return fail('not_found', `"${ctx.entityName}" no longer exists in the vault.`);
      }
      if (entity.script === undefined || entity.script.trim().length === 0) {
        return fail('no_credential', `"${ctx.entityName}" has no script body.`);
      }
      if (!isCommandTrusted(deps.trustStore, ctx.entityId, entity.script)) {
        return untrusted(ctx.entityName, 'what it does');
      }
      const language = entity.scriptLanguage ?? 'other';
      const plan = scriptRunPlan(language, process.platform);
      if (plan.kind === 'unsupported') {
        return fail('not_supported', plan.reason);
      }
      const release = deps.acquireExecSlot();
      if (release === undefined) {
        return fail('too_many_requests', 'Too many commands are already running.');
      }
      const resolved = resolveScriptEnv(entity.script, entity.scriptVars, language);
      const scriptPath = materializedKeyPath(
        deps.storageDir,
        `agent-script-${ctx.entityId}${plan.extension}`,
      );
      try {
        fs.mkdirSync(path.dirname(scriptPath), { recursive: true, mode: 0o700 });
        const body = resolved.body.endsWith('\n') ? resolved.body : `${resolved.body}\n`;
        fs.writeFileSync(scriptPath, body, { mode: 0o700 });
        lockToOwner(scriptPath);
        const outcome = await runBounded(plan.command, [...plan.args, scriptPath], false, {
          env: { ...process.env, ...resolved.env },
          timeoutMs: clampExecTimeout(undefined),
          ...launchGuards(deps.signal, ctx),
        });
        return { status: 200, body: outcome };
      } finally {
        try {
          fs.rmSync(scriptPath, { force: true });
        } catch {
          // already gone — nothing to do
        }
        release();
      }
    },
  };
}

// ---- the agent's run of a stored TERMINAL command (E3.S2) ---------------------------------------------------------------------------
//
// An entry with no SSH link runs HERE (`runHere`, the local shell). An entry linked to an SSH entry runs there (`runThere`, over `execOverSsh`),
// and only when THE GATE lets it through: the SSH entry must itself be usable by agents (`findUsableEntry`, in the Terminal entry's own
// account). Everything below is the decision of `research/PLAN_terminal_command_over_ssh_E3_S2_security.md`; each function is named there.

/** Said whenever the gate refuses, for every reason: it names the Terminal entry only — the SSH entry is not the agent's to read (spec §4). */
export function linkedRunRefused(name: string): string {
  return `"${name}" is set to run over an SSH connection that is not open to agents, so nothing ran. A person can run "${name}" from the CredsForDevs tree to see why, and can open that SSH connection to agents in its Agent access section.`;
}

/** Said when a switch, a link or a target changed between the question and the run (spec §2.4). */
export function changedWhileAsking(name: string): string {
  return `"${name}" or its SSH connection changed while the question was open, so nothing ran. Ask again: the next question shows the new target.`;
}

/**
 * The journal's line for a gate refusal: the real reason, which the agent is not told (spec §4). The ending says what the agent WAS told: on a bridge
 * it read the bridge's own sentence, and the spec's literal ending (that the SSH connection is not open to it) would be false there.
 */
export function journalLine(name: string, why: string, bridged = false): string {
  const told = bridged ? `the agent was told: ${BRIDGE_NOT_SERVED}` : 'the agent was told only that the SSH connection is not open to it';
  return `creds_run — "${name}": ${why} (${told})`;
}

const LOCAL_SUMMARY = 'the stored command, as its Run button would type it';

type LinkedLink = Extract<SshLink, { kind: 'linked' }>;

/** What the gate answers: no link (run here), a link the agent may use (run there), or a refusal (`why` is for the journal, `message` for the agent). */
export type LinkedCall =
  | { kind: 'local' }
  | { kind: 'linked'; link: LinkedLink; found: UsableFound }
  | { kind: 'refused'; code: ErrorCode; message: string; why: string };

const LOCAL: LinkedCall = { kind: 'local' };

function refusedCall(code: ErrorCode, message: string, why: string): LinkedCall {
  return { kind: 'refused', code, message, why };
}

/** The journal reason (never the agent's message), from the SSH entry's NODE: the lookup answers `undefined` for a missing node and for one the agent may not view. */
function whyUnusable(node: TreeNode | undefined): string {
  if (node === undefined) {
    return 'the SSH entry is not in this account';
  }
  return hiddenFromAgents(node) ? 'the SSH entry is hidden from agents (PIN)' : `the SSH entry's "Usable by agents" switch is off`;
}

/** Step 5: the SSH entry's own `Usable by agents` switch, looked up in the Terminal entry's account only (`accountOnly`); a refusal reads the node once more there, for the journal. */
function usableGate(deps: AgentUseDeps, target: CallTarget, link: LinkedLink): LinkedCall {
  const found = findUsableEntry(accountOnly(deps.storage, target.accountId), link.ssh.id, 'exec');
  if (found?.kind === 'usable') {
    return { kind: 'linked', link, found };
  }
  return refusedCall('denied', linkedRunRefused(target.entityName), whyUnusable(deps.storage.getNode(target.accountId, link.ssh.id)));
}

/** Step 4: the link, through `sshLinkOf` (the one reader), with a lookup bound to the Terminal entry's account. */
function linkGate(deps: AgentUseDeps, target: CallTarget, entity: EntityMetadata): LinkedCall {
  const link = sshLinkOf(entity, (id) => deps.storage.getNode(target.accountId, id));
  if (link.kind === 'refused') {
    return refusedCall('denied', linkedRunRefused(target.entityName), link.reason);
  }
  return link.kind === 'none' ? LOCAL : usableGate(deps, target, link);
}

/**
 * THE GATE: may THIS agent run the Terminal entry's line over its SSH entry (spec §2.1). The one place that decides it; `validate`,
 * `summarize`, `run` and `forwardsAgentNow` all ask it first, so nothing that reads the link's target, the SSH entry or `planLaunch` runs
 * before it has answered. Reads no secret and writes nothing; the journal note is its caller's.
 *
 * <p>Until it answers `linked`, an agent reads exactly one of: `not_found` (the Terminal entry is gone, `run`'s own), the bridge's refusal (on a
 * bridge, for every linked entry alike, before the link is resolved) or the one sentence.</p>
 */
export function linkedCall(deps: AgentUseDeps, target: CallTarget, bridge: BridgeContext | undefined): LinkedCall {
  const entity = entityFor(deps, target);
  if (entity === undefined || sshLinkOf(entity, () => undefined).kind === 'none') {
    return LOCAL;
  }
  if (bridge !== undefined) {
    return refusedCall('not_supported', BRIDGE_NOT_SERVED, 'a Remote Bridge does not serve run');
  }
  return linkGate(deps, target, entity);
}

/** The trust line the run would be vouched on, or nothing when the run will refuse before the trust question (the plan, or the chain). */
function trustLineOf(deps: AgentUseDeps, accountId: string, entity: EntityMetadata, link: LinkedLink): string | undefined {
  const plan = planLaunch(entity, link, { stayOpen: false });
  if (plan.kind !== 'remote') {
    return undefined;
  }
  const chain = resolveJumpChain(plan.ssh, (id) => deps.storage.getNode(accountId, id)?.details);
  return chain.ok ? trustLineFor(plan.ssh, chain.value, plan.line) : undefined;
}

/**
 * What the consent dialog says (spec §5): today's words for an entry with no link; for a linked one the SSH entry, its target and the trust line
 * the person approved from the tree. The summary never holds a key path, a known_hosts path or an environment value: none is in the trust line.
 */
export function linkedSummary(deps: AgentUseDeps, call: LinkedCall, entity: EntityMetadata, accountId: string): string {
  if (call.kind !== 'linked') {
    return LOCAL_SUMMARY;
  }
  const head = `the stored command, on the SSH connection "${call.link.sshName}" (${describeSshTarget(call.link.ssh)})`;
  const line = trustLineOf(deps, accountId, entity, call.link);
  return line === undefined ? head : `${head}, as: ${line}`;
}

function summaryFor(deps: AgentUseDeps, target: CallTarget): string {
  const entity = entityFor(deps, target);
  return entity === undefined ? LOCAL_SUMMARY : linkedSummary(deps, linkedCall(deps, target, undefined), entity, target.accountId);
}

/**
 * Whether a prompt can follow the Allow: the signing prompt of `ssh -A`, when the SSH entry forwards the agent and the extension's agent is up.
 * Asks the GATE first (spec §6, G22): the door reads this flag BEFORE `validate`, so a flag read from the link alone would tell an agent whether
 * a closed or PIN-hidden SSH entry forwards the agent. It writes no note.
 */
export function forwardsAgentNow(deps: AgentUseDeps, target: CallTarget): boolean {
  const call = linkedCall(deps, target, undefined);
  return call.kind === 'linked' && call.link.ssh.agentForward === true && deps.agentSocket?.() !== undefined;
}

/** `validate`: the gate, before any dialog (spec §2.2). The refusal and its note are written here, once. */
function validateTarget(deps: AgentUseDeps, target: CallTarget): ReturnType<UseAction['validate']> {
  const gate = linkedCall(deps, target, undefined);
  if (gate.kind !== 'refused') {
    return { ok: true };
  }
  deps.note(journalLine(target.entityName, gate.why));
  return { ok: false, code: gate.code, message: gate.message };
}

/**
 * The entry this call ALSO uses, for the broker (`UseAction.uses`, spec §2.5): the SSH entry, and only when the gate answers `linked`. Asks the gate first and
 * writes no note, so before the gate passes it tells the broker, and through it nobody, anything about the SSH entry. Called in the step of `summarize`.
 */
function usedEntryOf(deps: AgentUseDeps, target: CallTarget): UsedEntry | undefined {
  const gate = linkedCall(deps, target, undefined);
  return gate.kind === 'linked' ? { accountId: target.accountId, entityId: gate.link.ssh.id, entityName: gate.link.sshName } : undefined;
}

/** A LINKED run needs BOTH what the person was shown and the entry the broker holds: an absent summary or an absent `ctx.uses` is not equal, so it refuses (spec §2.3 step 3, A4). */
function linkedChanged(deps: AgentUseDeps, ctx: UseActionContext, gate: Extract<LinkedCall, { kind: 'linked' }>, entity: EntityMetadata): boolean {
  return ctx.summary !== linkedSummary(deps, gate, entity, ctx.accountId) || ctx.uses?.entityId !== gate.link.ssh.id;
}

/** A LOCAL run uses no second entry: a `ctx.uses` means the broker holds the turn of an SSH entry this run does not use any more, and refuses. An absent summary is not compared (the trust check of `runHere` holds the line). */
function localChanged(ctx: UseActionContext): boolean {
  return (ctx.summary !== undefined && ctx.summary !== LOCAL_SUMMARY) || ctx.uses !== undefined;
}

/** Whether what the person was shown, or the entry the broker holds, differs from what would run now (spec §2.3 step 3, in two parts). */
function changedSince(deps: AgentUseDeps, ctx: UseActionContext, gate: LinkedCall, entity: EntityMetadata): boolean {
  return gate.kind === 'linked' ? linkedChanged(deps, ctx, gate, entity) : localChanged(ctx);
}

/** The refusals before anything runs: the gate's own (journalled with the real reason), then the compare. */
function gateRefusal(deps: AgentUseDeps, ctx: UseActionContext, gate: LinkedCall, entity: EntityMetadata): UseActionResult | undefined {
  if (gate.kind === 'refused') {
    deps.note(journalLine(ctx.entityName, gate.why, ctx.bridge !== undefined));
    return fail(gate.code, gate.message);
  }
  return changedSince(deps, ctx, gate, entity) ? fail('denied', changedWhileAsking(ctx.entityName)) : undefined;
}

/** A plan that is not the one the road wants: its own refusal (it names the Terminal entry only), or today's "no command". */
function unrunnable(entity: EntityMetadata, ctx: UseActionContext, plan: LaunchPlan): UseActionResult {
  return plan.kind === 'refused' ? fail('not_supported', refusalSaid(entity, plan.reason)) : fail('no_credential', `"${ctx.entityName}" has no command.`);
}

/** Issue #103: refused here exactly as on the human path; and a changed or new line is untrusted until a person has run it. */
function localRefusal(deps: AgentUseDeps, ctx: UseActionContext, entity: EntityMetadata, line: string): UseActionResult | undefined {
  const mismatch = osMismatch(ctx.entityName, entity.terminalOs, process.platform);
  if (mismatch !== undefined) {
    return fail('not_supported', mismatch);
  }
  return isCommandTrusted(deps.trustStore, ctx.entityId, line) ? undefined : untrusted(ctx.entityName, 'the line');
}

function pwshAvailable(deps: { onPath?: (exe: string) => boolean }): boolean {
  return process.platform === 'win32' && deps.onPath?.('pwsh.exe') === true;
}

async function spawnLocal(deps: AgentUseDeps & { onPath?: (exe: string) => boolean }, ctx: UseActionContext, entity: EntityMetadata, line: string): Promise<UseActionResult> {
  const release = deps.acquireExecSlot();
  if (release === undefined) {
    return fail('too_many_requests', 'Too many commands are already running.');
  }
  try {
    // The same native shell the human path pins — pwsh 7 when this Windows has it.
    const hasPwsh = pwshAvailable(deps);
    const run = capturedRun(entity.terminalOs, line, hostShell(process.platform, fs.existsSync, hasPwsh));
    const outcome = await runBounded(run.program, run.args, run.shell, {
      env: process.env,
      timeoutMs: clampExecTimeout(undefined),
      ...launchGuards(deps.signal, ctx),
    });
    return { status: 200, body: outcome };
  } finally {
    release();
  }
}

/** An entry with no link: the LOCAL road, unchanged — the one place a Terminal entry's line reaches a local shell of the agent's (`capturedRun`). */
async function runHere(deps: AgentUseDeps & { onPath?: (exe: string) => boolean }, ctx: UseActionContext, entity: EntityMetadata): Promise<UseActionResult> {
  const plan = planLaunch(entity, { kind: 'none' }, { stayOpen: false });
  if (plan.kind !== 'local') {
    return unrunnable(entity, ctx, plan);
  }
  const refused = localRefusal(deps, ctx, entity, plan.line);
  return refused ?? spawnLocal(deps, ctx, entity, plan.line);
}

/**
 * The chain's refusal as the agent reads it (rule B): its sentence, unless it names a hop that the agent may not view; then the fixed one, with the
 * relation in the journal. The message is chosen first, then the line is written, then the answer is built.
 */
function chainRefusal(deps: AgentUseDeps, ctx: UseActionContext, chain: Extract<JumpChain, { ok: false }>): UseActionResult {
  const said = agentRefusal({ message: chain.reason, second: chain.second }, ctx.entityName, (id) => agentMayView(deps.storage, ctx.accountId, id));
  if (said.note !== undefined) {
    deps.note(said.note);
  }
  return fail('no_credential', said.message);
}

/** After the plan: the jump chain resolves (`ssh:exec`'s words), and the TRUST LINE — not the local line — has been vouched for on this machine. */
function remoteRefusal(deps: AgentUseDeps, ctx: UseActionContext, plan: Extract<LaunchPlan, { kind: 'remote' }>, chain: JumpChain): UseActionResult | undefined {
  if (!chain.ok) {
    return chainRefusal(deps, ctx, chain);
  }
  return isCommandTrusted(deps.trustStore, ctx.entityId, trustLineFor(plan.ssh, chain.value, plan.line)) ? undefined : untrusted(ctx.entityName, 'the line');
}

async function overSshWithSlot(deps: AgentUseDeps & { overSsh: OverSsh }, ctx: UseActionContext, plan: Extract<LaunchPlan, { kind: 'remote' }>, chain: JumpChain): Promise<UseActionResult> {
  const release = deps.acquireExecSlot();
  if (release === undefined) {
    return fail('too_many_requests', 'Too many commands are already running.');
  }
  try {
    return await deps.overSsh(ctx, { ssh: plan.ssh, jump: () => chain, remoteCommand: plan.remoteCommand, timeoutMs: clampExecTimeout(undefined), ownAgentOnly: true, noTty: true });
  } finally {
    release();
  }
}

/**
 * A linked entry whose SSH entry the gate let through: the BARE line, as ONE remote command, through `execOverSsh` (credential, jump and pin as the
 * agent's `ssh:exec` has them). `plan.ssh` is the object the gate's `link` carried — one snapshot, no second `sshLinkOf`.
 */
async function runThere(deps: AgentUseDeps & { overSsh: OverSsh }, ctx: UseActionContext, entity: EntityMetadata, link: LinkedLink): Promise<UseActionResult> {
  const plan = planLaunch(entity, link, { stayOpen: false });
  if (plan.kind !== 'remote') {
    return unrunnable(entity, ctx, plan);
  }
  const chain = resolveJumpChain(plan.ssh, (id) => deps.storage.getNode(ctx.accountId, id)?.details);
  const refused = remoteRefusal(deps, ctx, plan, chain);
  return refused ?? overSshWithSlot(deps, ctx, plan, chain);
}

async function runEntity(deps: AgentUseDeps & { onPath?: (exe: string) => boolean; overSsh: OverSsh }, ctx: UseActionContext, entity: EntityMetadata): Promise<UseActionResult> {
  const gate = linkedCall(deps, ctx, ctx.bridge);
  const refused = gateRefusal(deps, ctx, gate, entity);
  if (refused !== undefined) {
    return refused;
  }
  return gate.kind === 'linked' ? runThere(deps, ctx, entity, gate.link) : runHere(deps, ctx, entity);
}

/**
 * Run a stored TERMINAL command.
 *
 * <p>This is the one caller that spawns through a shell, and it is safe for a specific
 * reason rather than by luck: the stored line is human-authored shell syntax — pipes,
 * chained commands — with `{name}` filled from an allow-listed name by `resolveCommand`, and is
 * byte-for-byte what the human Run button hands to a shell. Nothing the agent sends contributes to it.</p>
 *
 * <p>A Terminal entry linked to an SSH entry runs on that host instead, and only when the SSH entry is itself open to
 * this agent (the gate, `linkedCall`): see the block above and the E3.S2 security spec. A linked entry never reaches the
 * local shell.</p>
 *
 * <p>A linked run is an agent's USE of the SSH entry: `uses` names it to the broker, which takes its one-use turn, releases a waiting
 * rotated value of it before the mask table is read, and burns it after a 200, as for `creds_exec` on it. The run then needs the entry the broker
 * holds (`ctx.uses`) as well as the summary the dialog showed (spec §2.5, §2.3 step 3).</p>
 */
export function terminalRunAction(deps: AgentUseDeps & { onPath?: (exe: string) => boolean; overSsh: OverSsh }): UseAction {
  return {
    kind: 'terminal',
    action: 'run',
    mutatesSecrets: false,
    // The signing prompt of a forwarded agent arrives through the socket: only a linked entry whose SSH entry is usable, forwards and has the agent up.
    asksAfterConsent: (target) => forwardsAgentNow(deps, target),
    verb: 'run the stored command of',
    describeOutcome: execOutcome,
    validate: (_body, target) => validateTarget(deps, target),
    summarize: (_body, target) => summaryFor(deps, target),
    uses: (target) => usedEntryOf(deps, target),
    async run(ctx): Promise<UseActionResult> {
      const entity = entityFor(deps, ctx);
      return entity === undefined ? fail('not_found', `"${ctx.entityName}" no longer exists in the vault.`) : runEntity(deps, ctx, entity);
    },
  };
}

/**
 * Export a bare CREDENTIAL into this window's terminal environment.
 *
 * <p>A credential has no host and no process of its own, so there is nothing to run it
 * against. The one way to make it usable without handing it over is the env-binding
 * mechanism the human UI already has; the response carries the variable NAMES.</p>
 *
 * <p>Honest limitation, and it is in the consent text rather than only here: this reaches
 * integrated terminals opened afterwards in THIS window. An agent whose shell lives
 * outside VS Code gets nothing from it.</p>
 *
 * <p>Refused in `validate` — before the consent modal — in a window whose terminals run on another
 * computer (Remote-SSH, a container): there the value would land on that computer. `denied`, with the
 * stable `EXPORT_REFUSED` sentence. Not `not_supported`: that is a 404, which the CLI reads as "this
 * window does not have the entry" and walks on from, and as exit 93 for an entry that exists.</p>
 */
export function credentialExportEnvAction(deps: AgentUseDeps & { remoteName: string | undefined }): UseAction {
  return {
    kind: 'credential',
    action: 'exportEnv',
    mutatesSecrets: false,
    verb: 'export the stored secret of',
    describeOutcome(result) {
      const body = result.body as EnvExportResponseBody;
      return `${body.written.length} variable(s)`;
    },
    validate: () => (windowKind(deps.remoteName) === 'other' ? { ok: false, code: 'denied', message: EXPORT_REFUSED } : { ok: true }),
    summarize: () =>
      'into integrated terminals opened after this, in this VS Code window only — a shell outside VS Code is unaffected',
    async run(ctx): Promise<UseActionResult> {
      const entity = entityFor(deps, ctx);
      if (entity === undefined) {
        return fail('not_found', `"${ctx.entityName}" no longer exists in the vault.`);
      }
      if (Object.keys(entity.envBindings ?? {}).length === 0) {
        return fail(
          'no_credential',
          `"${ctx.entityName}" exports no environment variable. Open Edit and switch one on first.`,
        );
      }
      const { written } = await deps.applyEnv(entity, ctx.accountId);
      const body: EnvExportResponseBody = { written: [...written] };
      return { status: 200, body };
    },
  };
}

/**
 * Query a DATABASE.
 *
 * <p>The one non-SSH kind where the agent's own text reaches a process — so it reaches it
 * as a single argv element to a CLI, never through a shell, and the password rides an
 * environment variable that tool's own documentation names. `mongodb` is refused: see
 * `buildDbQueryLaunch` for why a JavaScript shell cannot be handed an agent's query and a
 * password at the same time.</p>
 */
// eslint-disable-next-line max-lines-per-function
export function dbQueryAction(
  deps: AgentUseDeps & { onPath: (exe: string) => boolean },
): UseAction {
  return {
    kind: 'db',
    action: 'query',
    mutatesSecrets: false,
    verb: 'run a query against',
    describeOutcome: execOutcome,
    validate(body) {
      const query = (body as { query?: unknown }).query;
      if (typeof query !== 'string' || query.trim().length === 0) {
        return { ok: false, message: 'A non-empty "query" string is required.' };
      }
      if (query.length > 8000) {
        return { ok: false, message: 'That query is too long (8000 characters maximum).' };
      }
      return { ok: true };
    },
    summarize(body) {
      return String((body as { query?: unknown }).query ?? '');
    },
    // eslint-disable-next-line complexity, max-lines-per-function
    async run(ctx, body): Promise<UseActionResult> {
      const entity = entityFor(deps, ctx);
      if (entity === undefined) {
        return fail('not_found', `"${ctx.entityName}" no longer exists in the vault.`);
      }
      const dbType = entity.dbType;
      if (dbType === undefined) {
        return fail('no_credential', `"${ctx.entityName}" has no database type set.`);
      }
      // Rule R2 of the entry-PIN plan: nothing automatic gets a sealed value, and the refusal is
      // SAID. Wrap first, mark second — an agent reaches this entry only while its mark is lost — and a
      // damaged wrap as damaged (`automaticOpenerFor`, typed-secrets plan T3: until then its text was
      // handed to the client as the connection string), and a rotated value waiting beside an unprotected entry first.
      const stored = fieldReadingOf(await automaticOpenerFor(deps.storage, ctx.accountId)(entity, await deps.storage.getDbConnection(ctx.accountId, ctx.entityId), 'dbConnection'));
      if (stored.kind !== 'value') {
        return fail('no_credential', stored.kind === 'withheld' ? stored.reason : `"${ctx.entityName}" has no stored connection string.`);
      }
      const connection = stored.value;
      if (dbType === 'postgres' && !isSafePostgresUri(connection)) {
        return fail(
          'not_supported',
          `"${ctx.entityName}" has a stored connection string that is not a plain ` +
            'postgres:// URL. The broker refuses it rather than hand psql a value that ' +
            'could carry command-line options. Fix the entry to a ' +
            'postgresql://user:pass@host:port/db URL, or query it yourself.',
        );
      }
      const query = String((body as { query: string }).query);
      // Client meta-commands (`\!`, `system`, `:!!`) are a shell escape, and that shell
      // inherits the password. Said back to the agent as the reason, so it learns the rule
      // instead of retrying variants.
      const refusal = refuseQuery(dbType, query);
      if (refusal !== undefined) {
        return fail('not_supported', refusal);
      }
      const launch = buildDbQueryLaunch(dbType, connection, query, { bridged: ctx.bridge !== undefined });
      if (launch === undefined) {
        return fail(
          'not_supported',
          `A ${dbType} connection cannot be queried through the broker. Its shell would be able to read the password back out of the environment it is given, which is exactly what this path exists to prevent.`,
        );
      }
      if (resolveDbCli(dbType, deps.onPath) === undefined) {
        return fail(
          'tool_missing',
          `"${launch.exe}" is not on this machine's PATH — install the ${dbType} client, or query it yourself.`,
        );
      }
      const release = deps.acquireExecSlot();
      if (release === undefined) {
        return fail('too_many_requests', 'Too many commands are already running.');
      }
      try {
        const outcome = await runBounded(launch.exe, launch.args, false, {
          // A bridged client gets the allow-list of `ssh` and its own password variable, and nothing else of the extension host's environment (§4.9 row 5, §4.11).
          env: ctx.bridge === undefined ? { ...process.env, ...launch.env } : bridgedSshEnv(process.env, process.platform, launch.env),
          timeoutMs: clampExecTimeout(undefined),
          ...launchGuards(deps.signal, ctx),
        });
        return { status: 200, body: outcome };
      } finally {
        release();
      }
    },
  };
}

/**
 * Bring a VPN tunnel up or down.
 *
 * <p>Not an exec action, deliberately. Both tools create a network interface and need
 * root or Administrator; a captured background child cannot answer the UAC dialog or the
 * sudo prompt that requires, and faking that would mean a privileged helper service.
 * So this opens the same terminal the human Start button opens — the elevation prompt
 * stays theirs to answer — and the agent learns only that it was opened.</p>
 *
 * <p><b>The request travels with the start</b> (`PLAN_wsl_bridge_outlives_its_client.md` §5.7, E4.S3):
 * `open` is handed the request's signal as its start gate, and the start waits — on the dependency chain,
 * the config read, a launcher's trust modal — before it types anything. A client that leaves in there gets
 * nothing started, and a start that did not happen for a gone request is that request's abandonment.</p>
 */
export function vpnAction(deps: VpnUseDeps, action: 'up' | 'down'): UseAction {
  const doneVerb = action === 'up' ? 'started' : 'stopped';
  return {
    kind: 'vpn',
    action,
    mutatesSecrets: false,
    asksAfterConsent: true, // `up`: the launcher's trust modal, a PIN, an install offer, OpenVPN Connect's question; `down`: the install offer when no client is on the PATH
    verb: action === 'up' ? 'start the VPN tunnel of' : 'stop the VPN tunnel of',
    describeOutcome(result) {
      return (result.body as { opened?: boolean }).opened === true ? 'opened' : 'refused';
    },
    validate: () => ({ ok: true }),
    summarize: () =>
      'a terminal opens and the operating system asks for administrator rights — a human answers that prompt',
    async run(ctx): Promise<UseActionResult> {
      const entity = entityFor(deps, ctx);
      if (entity === undefined) {
        return fail('not_found', `"${ctx.entityName}" no longer exists in the vault.`);
      }
      const opened = await deps.open(ctx.accountId, ctx.entityId, action === 'up' ? 'start' : 'stop', ctx.signal, ctx.lateAnswer, ctx.standingPrompt);
      return vpnOutcome(opened, ctx, doneVerb);
    },
  };
}

/**
 * What a VPN start answers. Nothing started for a request whose client has gone is THROWN, not answered:
 * the broker journals it as that request's `ABANDONED` and writes to no socket — the exit `runBounded`
 * gives a refused launch. A start whose line was typed before the client left answers as it always did.
 */
function vpnOutcome(opened: boolean, ctx: UseActionContext, doneVerb: string): UseActionResult {
  if (!opened && ctx.signal.aborted) {
    throw notStarted();
  }
  return opened
    ? { status: 200, body: { opened: true } }
    : fail('no_credential', `"${ctx.entityName}" could not be ${doneVerb} — see the notification.`);
}
