import * as vscode from 'vscode';
import { TrustStore, isCommandTrusted, trustCommand } from './commandTrust';
import { RunPlan, RunStep, StepVerdict, changedStepRefusal, describeRunPlan, passwordStepRefusal, planDependencyRun, stepVerdict } from './dependencyRun';
import { ShellContext, entryShell } from './hostShell';
import { composedShellPath, pinnedShell, pinnedTerminal, shellContext, sshReaderShell } from './pinnedTerminal';
import { NodeLookup, RemotePlan, SshLink, TypedLine, shownTrustLine, sshLinkOf, trustLineFor, typedLine } from './remoteLaunch';
import type { SshRoad } from './sshRoad';
import type { ReadySsh } from './sshSession';
import { EntityMetadata, TreeNode } from './types';
import { isInTrash } from './trash';
import { endedAfter, requestGone, untilGone } from './requestLife';
import { chainTerminalTitle } from './terminalTitles';

/**
 * Running an entry's executable dependencies before it is used (issue #103) — the `vscode` half.
 * WHAT runs, in which order, and what each outcome means is `dependencyRun.ts`; this file opens one
 * terminal, types each step, and WAITS for it through shell integration (VS Code 1.93+).
 *
 * <p>Never a silent guess about a step's outcome: when the shell reports no integration, or a step
 * ends with no exit code or a non-zero one, the person is asked — in a notification, not a modal,
 * because the step may be sitting at a sudo prompt or a UAC dialog they need to answer first.
 * Dismissing the question stops the chain; it never continues on its own.</p>
 *
 * <p>The notification is the person's own Start. On an AGENT's call (`startGate` set) the question is a modal raced against the request's life, and so
 * is a running step (D14, E1.5): the call ends when its client leaves; a standing question keeps the one dialog place until it is settled (`standingPrompt`),
 * a running step with no question up does not; a click that lands later is journalled through `lateAnswer` and does nothing.</p>
 */

/** How long a fresh terminal gets to report shell integration. Bounds ACTIVATION only, never a step. */
const ACTIVATION_BUDGET_MS = 10_000;

export interface DependencyRunRequest {
  /** Whose dependencies — the entry being used, plus a VPN's launcher when it has one. */
  readonly roots: readonly EntityMetadata[];
  readonly nodeOf: (id: string) => EntityMetadata | undefined;
  /** Entries that run anyway as the main action (the launcher), so never twice. */
  readonly exclude?: ReadonlySet<string>;
  /** The entry being used — named in the pre-run modal and the terminal title. */
  readonly ownerName: string;
  /** The owner is a folder (the folder run): it has no Depends on, so a missing row is cleared in the entry that lists it. */
  readonly ownerIsFolder?: boolean;
  readonly trust: TrustStore;
  /**
   * The agent request this chain runs for, when an agent asked (a VPN start — E4.S3). Fired means its
   * client has gone: nothing more runs. Read before the approval modal, after it, and before each step,
   * so a person answering a modal nobody waits for any more starts nothing. Absent for the person's own
   * click. A step already typed is the shell's, and is not taken back.
   */
  readonly startGate?: AbortSignal;
  /** The broker's seam for a late click on the *Continue* question of an agent call that had ended (E1.5): journals it and decides nothing. */
  readonly lateAnswer?: (what: string) => void;
  /** The broker's seam that makes a standing *Continue* question hold the one dialog place until it settles (F1). */
  readonly standingPrompt?: (prompt: PromiseLike<unknown>) => void;
  /**
   * The person's SSH road, for a step linked to an SSH entry (E2.S3). Only the person's roads set it (E2-D2); absent, a
   * linked step refuses the whole chain with E1's sentence (an agent's start).
   */
  readonly ssh?: { readonly road: SshRoad; readonly accountId: string; readonly lookup: NodeLookup };
}

/** What the chain's questions need of the request: its life, and the broker's two seams for a question that outlives it. */
type QuestionRequest = Pick<DependencyRunRequest, 'startGate' | 'lateAnswer' | 'standingPrompt'>;

/** A running chain: its questions' seams, and each linked step's own session, cleaned when THAT step ends (E2.S3). */
interface RunContext extends QuestionRequest {
  readonly sessions: ReadonlyMap<string, ReadySsh>;
}

/** What a storage lookup must answer for a chain — `getNode` of this account. */
export interface NodeSource {
  getNode(accountId: string, id: string): TreeNode | undefined;
}

/**
 * The request every caller builds, built once. An entry in the Trash is as good as deleted: it is
 * reported missing rather than run, however trusted its line once was.
 */
export function dependencyRequest(
  source: NodeSource,
  accountId: string,
  roots: readonly EntityMetadata[],
  ownerName: string,
  trust: TrustStore,
  exclude?: ReadonlySet<string>,
): DependencyRunRequest {
  return { roots, nodeOf: (id) => liveDetails(source, accountId, id), exclude, ownerName, trust };
}

/** `request` with the person's SSH road: a step linked to an SSH entry runs over it (E2.S3). */
export function withSshSteps(request: DependencyRunRequest, road: SshRoad, accountId: string, source: NodeSource): DependencyRunRequest {
  return { ...request, ssh: { road, accountId, lookup: (id) => source.getNode(accountId, id) } };
}

/** An entry's record — `undefined` when it is gone OR in the Trash: neither may run anything. */
export function liveDetails(source: NodeSource, accountId: string, id: string): EntityMetadata | undefined {
  const node = source.getNode(accountId, id);
  return node === undefined || isInTrash(node, (other) => source.getNode(accountId, other)) ? undefined : node.details;
}

/**
 * Run what `request` asks for; `true` means the caller may go on to its own action.
 *
 * <p>`true` immediately when nothing is to be run — which is every entry that did not tick the
 * box, so a caller can call this unconditionally.</p>
 *
 * <p>An agent's request found gone BEFORE any step was typed answers `ready: false`, quietly. Found gone AFTER
 * a step was handed to the shell, the chain THROWS the request's end naming that step
 * (`requestLife.endedAfter`), so the request's journal says what the shell already has — a plain refusal
 * could only be read as "nothing was launched", true of the VPN and false of the step (E4.S4). A chain that
 * ran to the end says `typed` for the same reason: the caller's own later gates carry it. The person's own
 * chain has no request behind it and never throws.</p>
 */
export async function runDependenciesFirst(request: DependencyRunRequest): Promise<ChainEnd> {
  if (requestGone(request.startGate)) {
    return NOTHING_RAN;
  }
  const ctx = shellContext();
  const plan = shownPlan(request, ctx);
  return plan.ok ? approveAndRun(request, plan.steps, plan.missing, chainIsPinned(ctx, plan.steps)) : refused(plan.reason);
}

/** The chain's plan with each linked step shown by its trust line: what the modal says and the approval is keyed on. */
function shownPlan(request: DependencyRunRequest, ctx: ShellContext): RunPlan {
  const lookup = request.ssh?.lookup;
  const plan = planDependencyRun(request.roots, request.nodeOf, (name, os) => refusalIn(ctx, name, os), request.exclude, lookup);
  if (!plan.ok) {
    return plan;
  }
  const shown = shownSteps(plan.steps, lookup);
  return shown.ok ? { ok: true, steps: shown.steps, missing: plan.missing } : shown;
}

/**
 * The steps as the modal shows them (E2.A A2): a linked step's `line` is its trust line from storage's read of the SSH
 * entry and its jump chain (`shownTrustLine`), with NO preparation — no PIN, no host-key question, no key file before the
 * person has agreed. The plan's `remote.line` stays the person's own line.
 */
function shownSteps(steps: readonly RunStep[], lookup: NodeLookup | undefined): { ok: true; steps: RunStep[] } | { ok: false; reason: string } {
  const shown: RunStep[] = [];
  for (const step of steps) {
    const line = shownLine(step, lookup);
    if (line.kind === 'refused') {
      return { ok: false, reason: line.reason };
    }
    shown.push({ ...step, line: line.line });
  }
  return { ok: true, steps: shown };
}

function shownLine(step: RunStep, lookup: NodeLookup | undefined): { kind: 'shown'; line: string } | { kind: 'refused'; reason: string } {
  if (step.remote === undefined) {
    return { kind: 'shown', line: step.line };
  }
  return lookup === undefined ? { kind: 'refused', reason: changedStepRefusal(step.name) } : shownTrustLine(step.remote, lookup);
}

/**
 * How a chain ended. `ready` — every step ran well, or there was nothing to run: the caller may go on to its
 * own action. `typed` — at least one step was handed to the shell, ready or not: it is the shell's and is not
 * taken back, so a request found gone LATER, after a ready chain, is journalled with it rather than as "not
 * launched" (E4.S4, code round 1).
 */
export interface ChainEnd {
  readonly ready: boolean;
  readonly typed: boolean;
}

/** No chain ran — a stop, or an entry with nothing to run first. */
export const NO_CHAIN: ChainEnd = { ready: true, typed: false };

const NOTHING_RAN: ChainEnd = { ready: false, typed: false };

/** The modal, then — if the request it serves is still there — the preparation of the linked steps and the steps. */
async function approveAndRun(request: DependencyRunRequest, steps: readonly RunStep[], missing: readonly string[], pinned: boolean): Promise<ChainEnd> {
  const approved = await approve(request, steps, missing, pinned);
  return approved && !requestGone(request.startGate) ? prepareAndRun(request, steps, pinned) : NOTHING_RAN;
}

/** What the chain prepared: every session it OWNS (`all`, made before the first `prepare`), and each step's own (`byStep`). */
interface Sessions {
  readonly all: ReadySsh[];
  readonly byStep: Map<string, ReadySsh>;
}

/** A step ready to run: `line` is what the person approved, `typed` what the shell is handed (the same text for a local step). */
interface ChainStep extends RunStep {
  readonly typed: string;
}

/**
 * The chain's ONE OWNER of the prepared sessions (E2.A A4). The list exists before the first `prepare` and the `finally`
 * cleans all of it — a throw in a later preparation, a refused step, a closed terminal, a stop, a thrown request end. Each
 * step's own session is also cleaned when THAT step ends (`runAll`); `cleanup()` is idempotent.
 */
async function prepareAndRun(request: DependencyRunRequest, steps: readonly RunStep[], pinned: boolean): Promise<ChainEnd> {
  const sessions: Sessions = { all: [], byStep: new Map() };
  try {
    const ready = await prepareSteps(request, steps, sessions);
    return ready === undefined || requestGone(request.startGate) ? NOTHING_RAN : await runSteps(request, ready, pinned, sessions);
  } finally {
    sessions.all.forEach((session) => session.cleanup());
  }
}

/**
 * Every linked step prepared IN STEP ORDER, one after another (each may ask the person's PIN or host key), before any step
 * runs. `undefined`: the chain stops, nothing runs, and what was said was said (a stop is quiet).
 */
async function prepareSteps(request: DependencyRunRequest, steps: readonly RunStep[], sessions: Sessions): Promise<ChainStep[] | undefined> {
  const ready: ChainStep[] = [];
  for (const step of steps) {
    const next = step.remote === undefined ? { ...step, typed: step.line } : await prepareStep(request, step, step.remote, sessions);
    if (next === undefined) {
      return undefined;
    }
    ready.push(next);
  }
  return ready;
}

/** The person's SSH road, as the request carries it. */
type SshSteps = NonNullable<DependencyRunRequest['ssh']>;

type LinkedNow = Extract<SshLink, { kind: 'linked' }>;

/**
 * One linked step: its link is read again NOW (the SSH entry may have changed while the modal was open), then the session
 * is prepared. `stopped` is quiet; `refused` shows SSH Connect's remedy with no retry. A prepared session joins the owner's
 * list at once, so a refusal below finds it there.
 */
async function prepareStep(request: DependencyRunRequest, step: RunStep, remote: RemotePlan, sessions: Sessions): Promise<ChainStep | undefined> {
  const found = linkNow(request, step);
  if (typeof found === 'string') {
    refuse(found);
    return undefined;
  }
  return prepareOver(found.ssh, found.link, step, remote, sessions);
}

/** A step that is gone, or no longer linked: its link reads as nothing, which is "changed". */
const NO_LINK_NOW: SshLink = { kind: 'none' };

/** The step's link now with the road to prepare it over, or the sentence why it cannot be used. */
function linkNow(request: DependencyRunRequest, step: RunStep): { ssh: SshSteps; link: LinkedNow } | string {
  const { ssh } = request;
  if (ssh === undefined) {
    return changedStepRefusal(step.name);
  }
  const node = request.nodeOf(step.id);
  const link = node === undefined ? NO_LINK_NOW : sshLinkOf(node, ssh.lookup);
  return link.kind === 'linked' ? { ssh, link } : unusableLink(link, step);
}

function unusableLink(link: SshLink, step: RunStep): string {
  return link.kind === 'refused' ? link.reason : changedStepRefusal(step.name);
}

async function prepareOver(ssh: SshSteps, link: LinkedNow, step: RunStep, remote: RemotePlan, sessions: Sessions): Promise<ChainStep | undefined> {
  const answer = await ssh.road.prepare(ssh.accountId, link.ssh);
  if (answer.kind === 'refused') {
    await ssh.road.sayRefused(answer, link.ssh);
  }
  if (answer.kind !== 'ready') {
    return undefined;
  }
  sessions.all.push(answer);
  return checkedStep(step, remote, answer, sessions);
}

/** The step the prepared snapshot allows to run, or `undefined` having said why. Its session is registered only when the step may run. */
function checkedStep(step: RunStep, remote: RemotePlan, ready: ReadySsh, sessions: Sessions): ChainStep | undefined {
  const typed = checkedLine(step, remote, ready);
  if (typed.kind === 'refused') {
    refuse(typed.reason);
    return undefined;
  }
  sessions.byStep.set(step.id, ready);
  return { ...step, typed: typed.line };
}

/**
 * The prepared snapshot against what the dialog showed: its trust line, rebuilt, must be the shown one (else "changed while
 * the dialog was open"); a password session is refused (one terminal, one environment); then the typed line, which can
 * refuse too (PowerShell 5.1).
 */
function checkedLine(step: RunStep, remote: RemotePlan, ready: ReadySsh): TypedLine {
  if (trustLineFor(ready.entity, ready.jump, remote.line) !== step.line) {
    return { kind: 'refused', reason: changedStepRefusal(step.name) };
  }
  if (ready.env !== undefined) {
    return { kind: 'refused', reason: passwordStepRefusal(step.name, remote.sshName) };
  }
  return typedLine(remote, ready, sshReaderShell());
}

function refusalIn(ctx: ShellContext, name: string, terminalOs: string | undefined): string | undefined {
  const choice = entryShell(name, terminalOs, ctx);
  return choice.kind === 'refused' ? choice.reason : undefined;
}

/**
 * One terminal for the whole chain: the default profile when every step would have run there on
 * its own (no OS recorded, or a default shell of the right system), the native shell otherwise —
 * and the modal then names that shell, so a step written for the default profile is not typed
 * into PowerShell without the person being told. A linked step is composed for the local shell, so in a local window it
 * pins the chain (E2.S3).
 */
function chainIsPinned(ctx: ShellContext, steps: readonly RunStep[]): boolean {
  return steps.some((step) => (step.remote === undefined ? entryShell(step.name, step.terminalOs, ctx).kind === 'pinned' : composedShellPath() !== undefined));
}

/**
 * One modal for the whole chain, before the first step: every line in order, the shell, every
 * missing dependency. Asked when any line is not yet trusted or anything is missing; a chain the
 * person has already read and run passes straight through, as a single trusted line always has.
 * Nothing to run means nothing to ask — a missing dependency matters only to a chain that runs.
 */
async function approve(request: DependencyRunRequest, steps: readonly RunStep[], missing: readonly string[], pinned: boolean): Promise<boolean> {
  const untrusted = steps.filter((step) => !isCommandTrusted(request.trust, step.id, step.line));
  if (!needsApproval(steps, untrusted, missing)) {
    return true;
  }
  const button = missing.length > 0 ? 'Run the rest' : 'Run';
  const choice = await vscode.window.showWarningMessage(
    describeRunPlan(request.ownerName, steps, missing, chainShellName(pinned), request.ownerIsFolder),
    { modal: true },
    button,
  );
  return choice === button && trustAll(request.trust, untrusted);
}

function needsApproval(steps: readonly RunStep[], untrusted: readonly RunStep[], missing: readonly string[]): boolean {
  return steps.length > 0 && untrusted.length + missing.length > 0;
}

function chainShellName(pinned: boolean): string {
  return pinned ? pinnedShell().shellPath : 'your default terminal';
}

/** One at a time: `trustCommand` reads, then writes the whole list, so a parallel loop would lose writes. */
export async function trustAll(trust: TrustStore, steps: readonly { readonly id: string; readonly line: string }[]): Promise<true> {
  for (const step of steps) {
    await trustCommand(trust, step.id, step.line);
  }
  return true;
}

async function runSteps(request: DependencyRunRequest, steps: readonly ChainStep[], pinned: boolean, sessions: Sessions): Promise<ChainEnd> {
  if (steps.length === 0) {
    return NO_CHAIN;
  }
  const opened = chainTerminal(chainTerminalTitle(request.ownerName), pinned);
  if (!opened.ok) {
    return refused(opened.reason);
  }
  const integration = await shellIntegrationOf(opened.terminal);
  return integration === 'closed'
    ? refused(`The ${opened.shellName} terminal closed before it was ready, so nothing ran. That shell may not be reachable from this window.`)
    : runAll(opened.terminal, integration, steps, { ...request, sessions: sessions.byStep });
}

/** Said, and nothing ran. */
function refused(message: string): ChainEnd {
  refuse(message);
  return NOTHING_RAN;
}

type ChainTerminal = { ok: true; terminal: vscode.Terminal; shellName: string } | { ok: false; reason: string };

/** A FRESH terminal per run: an earlier chain's output must not be read as this one's. */
function chainTerminal(name: string, pinned: boolean): ChainTerminal {
  if (pinned) {
    const opened = pinnedTerminal(name, { fresh: true });
    return opened.ok ? { ok: true, terminal: opened.terminal, shellName: opened.shell.shellPath } : opened;
  }
  vscode.window.terminals.filter((t) => t.name === name && t.exitStatus === undefined).forEach((t) => t.dispose());
  const terminal = vscode.window.createTerminal({ name });
  terminal.show();
  return { ok: true, terminal, shellName: 'default' };
}

type Integration = vscode.TerminalShellIntegration | 'absent';

/** The terminal's shell integration once it activates — `'absent'` past the budget, `'closed'` if it died first. */
function shellIntegrationOf(terminal: vscode.Terminal): Promise<Integration | 'closed'> {
  if (terminal.shellIntegration !== undefined) {
    return Promise.resolve(terminal.shellIntegration);
  }
  return new Promise((resolve) => {
    const finish = (value: Integration | 'closed'): void => {
      clearTimeout(timer);
      activated.dispose();
      closed.dispose();
      resolve(value);
    };
    const timer = setTimeout(() => finish('absent'), ACTIVATION_BUDGET_MS);
    const activated = vscode.window.onDidChangeTerminalShellIntegration((e) => {
      if (e.terminal === terminal) {
        finish(e.shellIntegration);
      }
    });
    const closed = vscode.window.onDidCloseTerminal((t) => {
      if (t === terminal) {
        finish('closed');
      }
    });
  });
}

/** Each step in order; the first that does not end well stops the rest. */
async function runAll(terminal: vscode.Terminal, integration: Integration, steps: readonly ChainStep[], request: RunContext): Promise<ChainEnd> {
  const { startGate } = request;
  let typed = false;
  for (const step of steps) {
    const end = await runStep(terminal, integration, step, request);
    endSession(request, step);
    typed = typed || end.typed;
    if (!end.next) {
      return stopped(typed, startGate);
    }
    // The step is the shell's now. A client gone while it ran — or while its Continue question sat open, which
    // is an await the step's own check sits before — is told so, not "not launched".
    typedAndStillWanted(startGate);
  }
  return { ready: true, typed };
}

/** The step is over (its exit, the Continue answer, a close): its key and pin go now. `cleanup()` is idempotent. */
function endSession(request: RunContext, step: ChainStep): void {
  request.sessions.get(step.id)?.cleanup();
}

/**
 * A chain that stopped — a refused step, a *Stop* on its question, a closed terminal. After a typed step, a
 * client gone since is told so here too: a *Stop* clicked on a question the client left open answers
 * `next: false` without passing the post-step check, and a plain refusal would read as "not launched"
 * (code round 2). A live request's stop stays a plain refusal.
 */
function stopped(typed: boolean, startGate: AbortSignal | undefined): ChainEnd {
  if (typed) {
    typedAndStillWanted(startGate);
  }
  return { ready: false, typed };
}

/** One step's end: whether the chain goes on, and whether the step was handed to the shell at all. */
interface StepEnd {
  readonly next: boolean;
  readonly typed: boolean;
}

/**
 * After a step has been handed to the shell: a client gone since ends the chain by THROWING the request's
 * end, naming the step (E4.S4). Answering `false` here would let the journal claim nothing was launched.
 * The person's own chain has no gate and never throws.
 */
function typedAndStillWanted(startGate: AbortSignal | undefined): void {
  if (requestGone(startGate)) {
    throw endedAfter('a dependency step had been typed');
  }
}

/**
 * One step. A terminal the person closed while a Continue question sat open is checked for FIRST:
 * typing into a disposed terminal throws, and an execution on one never ends. Then the request the
 * chain serves: a client gone during the step before — or while its Continue question sat open — gets
 * no further step, quietly (E4.S3).
 */
async function runStep(terminal: vscode.Terminal, integration: Integration, step: ChainStep, request: QuestionRequest): Promise<StepEnd> {
  if (requestGone(request.startGate)) {
    return { next: false, typed: false };
  }
  if (terminal.exitStatus !== undefined) {
    return { next: refuse(`The terminal was closed before "${step.name}" could run — nothing after it ran.`), typed: false };
  }
  if (integration === 'absent') {
    terminal.sendText(step.typed, true);
    return { next: await askToContinue(`CredsForDevs cannot tell when "${step.name}" finishes in this terminal (it reports no shell integration). Continue once it has finished successfully.`, request), typed: true };
  }
  return ran(terminal, integration, step, request);
}

/**
 * The step with shell integration. `'untyped'` (the gate had fired before the line was handed to the shell) is the same end as `runStep`'s own check:
 * nothing was typed, so the journal never claims a step. `'gone'` (it fired while the step ran) reads as no exit code, and `settle` then ends the call.
 */
async function ran(terminal: vscode.Terminal, integration: vscode.TerminalShellIntegration, step: ChainStep, request: QuestionRequest): Promise<StepEnd> {
  const end = await executed(terminal, integration, step.typed, request.startGate);
  if (end === 'untyped') {
    return { next: false, typed: false };
  }
  return { next: await settle(stepVerdict(step.name, end === 'gone' ? undefined : end), request), typed: true };
}

/**
 * What a finished step means for the chain. The request is read FIRST: a client gone while the step ran
 * is not followed by a question — a person asked to continue a chain nobody waits for any more is asked
 * for nothing (E4.S3, checkpoint round). A step already run is the shell's, and the request's end says so
 * (E4.S4).
 */
function settle(verdict: StepVerdict, request: QuestionRequest): boolean | Promise<boolean> {
  typedAndStillWanted(request.startGate);
  if (verdict.kind === 'next') {
    return true;
  }
  return verdict.kind === 'ask' ? askToContinue(verdict.question, request) : refuse(verdict.reason);
}

/**
 * Run one line and resolve with its exit code — `undefined` when unknown, `'closed'` if the terminal went, `'gone'` if the request ended while it ran, `'untyped'` if it had ended before the line was typed. All
 * listeners are attached BEFORE the command is sent, so no event can be missed; the execution is compared by identity, so an earlier one's is ignored.
 * The gate is a THIRD way to finish and `finish` disposes everything: an abandoned run leaves no listener on a terminal that stays open, and a stale
 * execution that ends later reaches no question and no next step.
 */
function executed(
  terminal: vscode.Terminal,
  integration: vscode.TerminalShellIntegration,
  line: string,
  startGate: AbortSignal | undefined,
): Promise<number | undefined | 'closed' | 'gone' | 'untyped'> {
  return new Promise((resolve) => {
    let execution: vscode.TerminalShellExecution | undefined;
    const gone = (): void => finish('gone');
    const finish = (value: number | undefined | 'closed' | 'gone' | 'untyped'): void => {
      ended.dispose();
      closed.dispose();
      startGate?.removeEventListener('abort', gone);
      resolve(value);
    };
    const ended = vscode.window.onDidEndTerminalShellExecution((e) => {
      if (execution !== undefined && e.execution === execution) {
        finish(e.exitCode);
      }
    });
    const closed = vscode.window.onDidCloseTerminal((t) => {
      if (t === terminal) {
        finish('closed');
      }
    });
    // The gate is read BEFORE the line is typed: a request that has gone gets nothing typed, and the answer says so.
    if (requestGone(startGate)) {
      finish('untyped');
      return;
    }
    startGate?.addEventListener('abort', gone, { once: true });
    execution = integration.executeCommand(line);
  });
}

/** The *Continue* question: a notification on the person's own Start (the step may wait at a prompt), a modal raced against the request on an agent call. */
async function askToContinue(question: string, request: QuestionRequest): Promise<boolean> {
  const { startGate, lateAnswer, standingPrompt } = request;
  const asked = vscode.window.showInformationMessage(question, { modal: startGate !== undefined }, 'Continue', 'Stop');
  standingPrompt?.(asked);
  const choice = await untilGone(asked, startGate, (late) => (late === undefined ? undefined : lateAnswer?.(late)));
  return choice === 'Continue';
}

function refuse(message: string): false {
  void vscode.window.showWarningMessage(message);
  return false;
}
