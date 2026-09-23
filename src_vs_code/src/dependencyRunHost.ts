import * as vscode from 'vscode';
import { TrustStore, isCommandTrusted, trustCommand } from './commandTrust';
import { RunStep, describeRunPlan, planDependencyRun } from './dependencyRun';
import { pinnedTerminal } from './pinnedTerminal';
import { EntityMetadata } from './types';

/**
 * Running an entry's executable dependencies before it is used (issue #103) — the `vscode` half.
 * WHAT runs and in which order is `dependencyRun.ts`; this file opens one terminal, runs each step,
 * and WAITS for it through shell integration (VS Code 1.93+), stopping at the first failure.
 *
 * <p>Never a silent guess about a step's outcome: when the shell reports no integration, or a step
 * ends without an exit code, the person is asked — in a notification, not a modal, because the step
 * may be sitting at a sudo prompt or a UAC dialog they need to answer first.</p>
 */

/** How long a fresh terminal gets to report shell integration. Bounds ACTIVATION only, never a step. */
export const ACTIVATION_BUDGET_MS = 10_000;

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

/**
 * Run what `request` asks for; `true` means the caller may go on to its own action.
 *
 * <p>`true` immediately when nothing is to be run — which is every entry that did not tick the
 * box, so a caller can call this unconditionally.</p>
 */
export async function runDependenciesFirst(request: DependencyRunRequest): Promise<boolean> {
  const plan = planDependencyRun(request.roots, request.nodeOf, process.platform, request.exclude);
  if (!plan.ok) {
    return refuse(plan.reason);
  }
  return (await approve(request, plan.steps, plan.missing)) && runSteps(request.ownerName, plan.steps);
}

/**
 * One modal for the whole chain, before the first step: every line in order, every missing
 * dependency named. Asked when any line is not yet trusted or anything is missing; a chain the
 * person has already read and run passes straight through, as a single trusted line always has.
 */
async function approve(request: DependencyRunRequest, steps: readonly RunStep[], missing: readonly string[]): Promise<boolean> {
  const untrusted = steps.filter((step) => !isCommandTrusted(request.trust, step.id, step.line));
  if (untrusted.length + missing.length === 0) {
    return true;
  }
  const button = missing.length > 0 ? 'Run the rest' : 'Run';
  const choice = await vscode.window.showWarningMessage(
    describeRunPlan(request.ownerName, steps, missing),
    { modal: true },
    button,
  );
  return choice === button && trustAll(request.trust, untrusted);
}

async function trustAll(trust: TrustStore, steps: readonly RunStep[]): Promise<true> {
  for (const step of steps) {
    await trustCommand(trust, step.id, step.line);
  }
  return true;
}

async function runSteps(ownerName: string, steps: readonly RunStep[]): Promise<boolean> {
  if (steps.length === 0) {
    return true;
  }
  const opened = pinnedTerminal(`CredsForDevs: before ${ownerName}`, { fresh: true });
  if (!opened.ok) {
    return refuse(opened.reason);
  }
  const integration = await shellIntegrationOf(opened.terminal);
  return integration === 'closed'
    ? refuse(`The ${opened.shell.shellPath} terminal closed before it was ready, so nothing ran. That shell may not be reachable from this window.`)
    : runAll(opened.terminal, integration, steps);
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

type Integration = vscode.TerminalShellIntegration | 'absent' | 'closed';

/** The terminal's shell integration once it activates — or why it never will. */
function shellIntegrationOf(terminal: vscode.Terminal): Promise<Integration> {
  if (terminal.shellIntegration !== undefined) {
    return Promise.resolve(terminal.shellIntegration);
  }
  return new Promise((resolve) => {
    const finish = (value: Integration): void => {
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

async function runStep(terminal: vscode.Terminal, integration: Integration, step: RunStep): Promise<boolean> {
  if (integration === 'absent' || integration === 'closed') {
    terminal.sendText(step.line, true);
    return askToContinue(`CredsForDevs cannot tell when "${step.name}" finishes in this terminal (it reports no shell integration). Continue once it has finished successfully.`);
  }
  const exitCode = await executed(terminal, integration, step.line);
  return judge(step, exitCode);
}

/** Run one line and resolve with its exit code — `undefined` when unknown, `'closed'` if the terminal went. */
function executed(
  terminal: vscode.Terminal,
  integration: vscode.TerminalShellIntegration,
  line: string,
): Promise<number | undefined | 'closed'> {
  const execution = integration.executeCommand(line);
  return new Promise((resolve) => {
    const finish = (value: number | undefined | 'closed'): void => {
      ended.dispose();
      closed.dispose();
      resolve(value);
    };
    const ended = vscode.window.onDidEndTerminalShellExecution((e) => {
      if (e.execution === execution) {
        finish(e.exitCode);
      }
    });
    const closed = vscode.window.onDidCloseTerminal((t) => {
      if (t === terminal) {
        finish('closed');
      }
    });
  });
}

function judge(step: RunStep, exitCode: number | undefined | 'closed'): Promise<boolean> | boolean {
  if (exitCode === 0) {
    return true;
  }
  if (exitCode === undefined) {
    return askToContinue(`"${step.name}" finished, but its shell did not report an exit code. Continue if it succeeded.`);
  }
  return refuse(
    exitCode === 'closed'
      ? `The terminal was closed while "${step.name}" was running — nothing after it ran.`
      : `"${step.name}" failed (exit code ${exitCode}) — nothing after it ran.`,
  );
}

/** A notification, not a modal: the step may be waiting at a prompt the person has to answer. */
async function askToContinue(question: string): Promise<boolean> {
  const choice = await vscode.window.showInformationMessage(question, 'Continue', 'Cancel');
  return choice === 'Continue';
}

function refuse(message: string): false {
  void vscode.window.showWarningMessage(message);
  return false;
}
