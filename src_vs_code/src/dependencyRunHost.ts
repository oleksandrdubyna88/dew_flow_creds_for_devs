import * as vscode from 'vscode';
import { TrustStore, isCommandTrusted, trustCommand } from './commandTrust';
import { RunStep, StepVerdict, describeRunPlan, planDependencyRun, stepVerdict } from './dependencyRun';
import { ShellContext, entryShell } from './hostShell';
import { pinnedShell, pinnedTerminal, shellContext } from './pinnedTerminal';
import { EntityMetadata, TreeNode } from './types';
import { isInTrash } from './trash';

/**
 * Running an entry's executable dependencies before it is used (issue #103) — the `vscode` half.
 * WHAT runs, in which order, and what each outcome means is `dependencyRun.ts`; this file opens one
 * terminal, types each step, and WAITS for it through shell integration (VS Code 1.93+).
 *
 * <p>Never a silent guess about a step's outcome: when the shell reports no integration, or a step
 * ends with no exit code or a non-zero one, the person is asked — in a notification, not a modal,
 * because the step may be sitting at a sudo prompt or a UAC dialog they need to answer first.
 * Dismissing the question stops the chain; it never continues on its own.</p>
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
  readonly trust: TrustStore;
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
 */
export async function runDependenciesFirst(request: DependencyRunRequest): Promise<boolean> {
  const ctx = shellContext();
  const plan = planDependencyRun(request.roots, request.nodeOf, (name, os) => refusalIn(ctx, name, os), request.exclude);
  if (!plan.ok) {
    return refuse(plan.reason);
  }
  const pinned = chainIsPinned(ctx, plan.steps);
  return (await approve(request, plan.steps, plan.missing, pinned)) && runSteps(request.ownerName, plan.steps, pinned);
}

function refusalIn(ctx: ShellContext, name: string, terminalOs: string | undefined): string | undefined {
  const choice = entryShell(name, terminalOs, ctx);
  return choice.kind === 'refused' ? choice.reason : undefined;
}

/**
 * One terminal for the whole chain: the default profile when every step would have run there on
 * its own (no OS recorded, or a default shell of the right system), the native shell otherwise —
 * and the modal then names that shell, so a step written for the default profile is not typed
 * into PowerShell without the person being told.
 */
function chainIsPinned(ctx: ShellContext, steps: readonly RunStep[]): boolean {
  return steps.some((step) => entryShell(step.name, step.terminalOs, ctx).kind === 'pinned');
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
    describeRunPlan(request.ownerName, steps, missing, chainShellName(pinned)),
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

async function trustAll(trust: TrustStore, steps: readonly RunStep[]): Promise<true> {
  for (const step of steps) {
    await trustCommand(trust, step.id, step.line);
  }
  return true;
}

async function runSteps(ownerName: string, steps: readonly RunStep[], pinned: boolean): Promise<boolean> {
  if (steps.length === 0) {
    return true;
  }
  const opened = chainTerminal(`CredsForDevs: before ${ownerName}`, pinned);
  if (!opened.ok) {
    return refuse(opened.reason);
  }
  const integration = await shellIntegrationOf(opened.terminal);
  return integration === 'closed'
    ? refuse(`The ${opened.shellName} terminal closed before it was ready, so nothing ran. That shell may not be reachable from this window.`)
    : runAll(opened.terminal, integration, steps);
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
async function runAll(terminal: vscode.Terminal, integration: Integration, steps: readonly RunStep[]): Promise<boolean> {
  for (const step of steps) {
    if (!(await runStep(terminal, integration, step))) {
      return false;
    }
  }
  return true;
}

/**
 * One step. A terminal the person closed while a Continue question sat open is checked for FIRST:
 * typing into a disposed terminal throws, and an execution on one never ends.
 */
async function runStep(terminal: vscode.Terminal, integration: Integration, step: RunStep): Promise<boolean> {
  if (terminal.exitStatus !== undefined) {
    return refuse(`The terminal was closed before "${step.name}" could run — nothing after it ran.`);
  }
  if (integration === 'absent') {
    terminal.sendText(step.line, true);
    return askToContinue(`CredsForDevs cannot tell when "${step.name}" finishes in this terminal (it reports no shell integration). Continue once it has finished successfully.`);
  }
  return settle(stepVerdict(step.name, await executed(terminal, integration, step.line)));
}

function settle(verdict: StepVerdict): boolean | Promise<boolean> {
  if (verdict.kind === 'next') {
    return true;
  }
  return verdict.kind === 'ask' ? askToContinue(verdict.question) : refuse(verdict.reason);
}

/**
 * Run one line and resolve with its exit code — `undefined` when unknown, `'closed'` if the terminal
 * went. Both listeners are attached BEFORE the command is sent, so neither event can be missed; the
 * execution is compared by identity, so an event from an earlier execution is ignored.
 */
function executed(
  terminal: vscode.Terminal,
  integration: vscode.TerminalShellIntegration,
  line: string,
): Promise<number | undefined | 'closed'> {
  return new Promise((resolve) => {
    let execution: vscode.TerminalShellExecution | undefined;
    const finish = (value: number | undefined | 'closed'): void => {
      ended.dispose();
      closed.dispose();
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
    execution = integration.executeCommand(line);
  });
}

/** A notification, not a modal: the step may be waiting at a prompt the person has to answer. */
async function askToContinue(question: string): Promise<boolean> {
  const choice = await vscode.window.showInformationMessage(question, 'Continue', 'Stop');
  return choice === 'Continue';
}

function refuse(message: string): false {
  void vscode.window.showWarningMessage(message);
  return false;
}
