import * as vscode from 'vscode';
import { asElement } from '../commandTargets';
import { isCommandTrusted } from '../commandTrust';
import { dependencyRequest, runDependenciesFirst, trustAll } from '../dependencyRunHost';
import { describeError } from '../describeError';
import {
  CLOSE_AND_RUN,
  FolderFacts,
  FolderNotice,
  FolderOutcome,
  FolderPlan,
  LineRow,
  NO_FOLDER_TARGET,
  alreadyRunning,
  beforeAsking,
  chainStopped,
  failedAfterClosing,
  folderButtons,
  folderQuestion,
  folderTarget,
  lineRows,
  linesToType,
  planFolderRun,
  reportNotice,
  settleRow,
} from '../folderRun';
import { entryOpenRefusal, liveTerminalsOfEntry } from '../pinnedTerminal';
import { typeIntoNew } from '../terminalGuard';
import { EntryTerminalKey, entryTerminalKey } from '../terminalTitles';
import type { TreeNode } from '../types';
import type { RunCommandsHost } from './runCommands';

/**
 * `credSshManager.runFolder`: the `vscode` half of the folder run (parent `PLAN_terminal_folder_run.md` §3); every decision
 * and every sentence is `folderRun.ts`.
 *
 * <p>Closing is authorised per terminal OBJECT, in a snapshot taken when the modal is built, and never by name afterwards.
 * From the chain's end to the last send nothing is awaited, so the one re-check is as fresh as one per line, and nothing
 * reads the terminal list after a `dispose` (a disposed terminal may still be listed).</p>
 *
 * <p>Every title of a row is `keyOf(folder, row.name)`: the folder node re-read in `folderAt`, one key for the classification,
 * the modal's snapshot, the re-check and the creation. Every row is a DIRECT child of the folder, so the folder is its parent.</p>
 */

interface Folder {
  readonly accountId: string;
  readonly id: string;
  readonly name: string;
  /** The node as `folderAt` re-read it: the parent of every row. */
  readonly node: TreeNode;
}

/** The terminals the modal listed, by row id: what `Close Open Terminals and Run` authorises, and nothing else. */
type Authorised = ReadonlyMap<string, readonly vscode.Terminal[]>;

const NOTHING_AUTHORISED: Authorised = new Map();

function keyOf(folder: Folder, name: string): EntryTerminalKey {
  return entryTerminalKey(name, folder.node);
}

function factsOf(folder: Folder): FolderFacts {
  return { shellRefusal: entryOpenRefusal, isOpen: (name) => liveTerminalsOfEntry(keyOf(folder, name)).length > 0 };
}

/** Folders with a run pending, in a modal or a chain, as the guard's `asking`. Each key leaves in a `finally`, so it cannot grow. */
const inFlight = new Set<string>();

export function registerFolderRun(host: RunCommandsHost): void {
  host.register('credSshManager.runFolder', (target) => runFolder(host, target));
}

async function runFolder(host: RunCommandsHost, target: unknown): Promise<void> {
  host.vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
  const folder = folderAt(host, target);
  if (folder !== undefined) {
    await oneAtATime(folder, () => planAndAsk(host, folder));
  }
}

/** The target re-read from storage: what a menu handed over may be old, and a palette call hands over nothing. */
function folderAt(host: RunCommandsHost, target: unknown): Folder | undefined {
  const element = asElement(target);
  if (element?.kind !== 'node') {
    return warned(NO_FOLDER_TARGET);
  }
  const byId = (id: string) => host.storage.getNode(element.accountId, id);
  const found = folderTarget(byId(element.node.id), byId);
  return found.ok ? { accountId: element.accountId, id: found.node.id, name: found.node.name, node: found.node } : warned(found.reason);
}

function warned(message: string): undefined {
  void vscode.window.showWarningMessage(message);
  return undefined;
}

async function oneAtATime(folder: Folder, run: () => Promise<void>): Promise<void> {
  const key = JSON.stringify([folder.accountId, folder.id]);
  if (inFlight.has(key)) {
    void vscode.window.showInformationMessage(alreadyRunning(folder.name));
    return;
  }
  inFlight.add(key);
  try {
    await run();
  } finally {
    inFlight.delete(key);
  }
}

async function planAndAsk(host: RunCommandsHost, folder: Folder): Promise<void> {
  const plan = planFolderRun(host.storage.getChildren(folder.accountId, folder.id), factsOf(folder));
  const isNew = (row: LineRow): boolean => !isCommandTrusted(host.context.globalState, row.id, row.line);
  const stop = beforeAsking(folder.name, plan, isNew);
  if (stop === undefined) {
    await ask(host, folder, plan, isNew);
  } else {
    say(stop);
  }
}

/** The modal, ALWAYS (decision C). The snapshot is read in the same tick as its text. */
async function ask(host: RunCommandsHost, folder: Folder, plan: FolderPlan, isNew: (row: LineRow) => boolean): Promise<void> {
  const snapshot = openTerminals(plan, folder);
  const choice = await vscode.window.showWarningMessage(
    folderQuestion(folder.name, plan, isNew),
    { modal: true },
    ...folderButtons(plan),
  );
  if (choice !== undefined) {
    await runChosen(host, folder, plan, choice === CLOSE_AND_RUN ? snapshot : undefined);
  }
}

/** Every live terminal of each open row's name, any shell. */
function openTerminals(plan: FolderPlan, folder: Folder): Authorised {
  return new Map(lineRows(plan).filter((row) => row.kind === 'open').map((row) => [row.id, liveTerminalsOfEntry(keyOf(folder, row.name))]));
}

/** `authorised` is present only for the closing button. */
async function runChosen(host: RunCommandsHost, folder: Folder, plan: FolderPlan, authorised: Authorised | undefined): Promise<void> {
  const trust = host.context.globalState;
  const closing = authorised !== undefined;
  const lines = linesToType(plan, closing);
  await trustAll(trust, lines);
  const request = dependencyRequest(host.storage, folder.accountId, lines.map((row) => row.details), folder.name, trust, plan.directIds);
  const chain = await runDependenciesFirst({ ...request, ownerIsFolder: true });
  if (chain.ready) {
    say(reportNotice(folder.name, typeAll(plan, closing, authorised ?? NOTHING_AUTHORISED, folder)));
  } else {
    warned(chainStopped(folder.name));
  }
}

/** The re-check over every row first, then the closes and the sends: synchronous from here to the last send. */
function typeAll(plan: FolderPlan, closing: boolean, authorised: Authorised, folder: Folder): readonly FolderOutcome[] {
  const settled = plan.rows.map((row) => settleRow(row, closing, (r) => appeared(r, authorised, folder)));
  return settled.map((step) => (step.kind === 'type' ? typeLine(step.row, authorised.get(step.row.id) ?? [], folder) : step));
}

/** A live terminal of the row's name that the person did not authorise closing. */
function appeared(row: LineRow, authorised: Authorised, folder: Folder): boolean {
  const known = authorised.get(row.id) ?? [];
  return liveTerminalsOfEntry(keyOf(folder, row.name)).some((terminal) => !known.includes(terminal));
}

/** Close what was authorised for this row, by object; then a NEW terminal, never found. A failure is this row's alone. No rollback. */
function typeLine(row: LineRow, toClose: readonly vscode.Terminal[], folder: Folder): FolderOutcome {
  const live = toClose.filter((terminal) => terminal.exitStatus === undefined);
  try {
    live.forEach((terminal) => terminal.dispose());
    const sent = typeIntoNew(keyOf(folder, row.name), row.details.terminalOs, () => row.line);
    return sent.kind === 'typed' ? { kind: 'typed', name: row.name } : failed(row, failedAfterClosing(sent.reason, live.length));
  } catch (error) {
    return failed(row, failedAfterClosing(describeError(error), live.length));
  }
}

function failed(row: LineRow, reason: string): FolderOutcome {
  return { kind: 'failed', name: row.name, reason };
}

function say(notice: FolderNotice): void {
  void (notice.warning ? vscode.window.showWarningMessage(notice.text) : vscode.window.showInformationMessage(notice.text));
}
