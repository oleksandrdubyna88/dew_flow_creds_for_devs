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
import { EntryTerminalKey, entryTerminalKey, entryTerminalKeyOf } from '../terminalTitles';
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
 * <p>A row's key is read at two points, and nothing in between is a key (`PLAN_terminal_titles_folder.md` §Design, the timing
 * contract). BEFORE the modal, synchronously from `folderAt` to the snapshot: the classification and the modal's snapshot use
 * `keyOf(folder, row.name)` over the folder node `folderAt` re-read; nothing is awaited since, and every row is a DIRECT child
 * of that node, so it is every row's parent. AFTER the last await, in the synchronous step that types: the re-check
 * (`appeared`) and the creation use `entryTerminalKeyOf(storage, account, row.id, row.name)`, the arrow's own function, so a
 * folder renamed, an entry moved or a node removed during the wait is keyed as storage holds it then. The captured node is
 * NEVER read after the wait. What the person approved stays by object: the snapshot's terminals, closed under `Close Open
 * Terminals and Run` only. Under `Run` the snapshot is read, never acted on: a terminal it listed that is still live counts
 * as `appeared` (its row is left alone, not "closed meanwhile"), whatever title it carries now.</p>
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
    await runChosen(host, folder, plan, { snapshot, closing: choice === CLOSE_AND_RUN });
  }
}

/** Every live terminal of each open row's name, any shell. */
function openTerminals(plan: FolderPlan, folder: Folder): Authorised {
  return new Map(lineRows(plan).filter((row) => row.kind === 'open').map((row) => [row.id, liveTerminalsOfEntry(keyOf(folder, row.name))]));
}

/** What the modal listed, and whether the button chosen authorises closing it: the snapshot is read under both, acted on under one. */
interface Chosen {
  readonly snapshot: Authorised;
  readonly closing: boolean;
}

/** A row's key as storage holds it NOW: read only after the last await. */
type KeyOfRow = (row: LineRow) => EntryTerminalKey;

async function runChosen(host: RunCommandsHost, folder: Folder, plan: FolderPlan, chosen: Chosen): Promise<void> {
  const trust = host.context.globalState;
  const { closing } = chosen;
  const lines = linesToType(plan, closing);
  await trustAll(trust, lines);
  const request = dependencyRequest(host.storage, folder.accountId, lines.map((row) => row.details), folder.name, trust, plan.directIds);
  const chain = await runDependenciesFirst({ ...request, ownerIsFolder: true });
  if (chain.ready) {
    const keyOfRow: KeyOfRow = (row) => entryTerminalKeyOf(host.storage, folder.accountId, row.id, row.name);
    say(reportNotice(folder.name, typeAll(plan, chosen, keyOfRow)));
  } else {
    warned(chainStopped(folder.name));
  }
}

/** The re-check over every row first, then the closes and the sends: synchronous from here to the last send. */
function typeAll(plan: FolderPlan, chosen: Chosen, keyOfRow: KeyOfRow): readonly FolderOutcome[] {
  const settled = plan.rows.map((row) => settleRow(row, chosen.closing, (r) => appeared(r, chosen, keyOfRow)));
  return settled.map((step) => (step.kind === 'type' ? typeLine(step.row, authorisedFor(step.row, chosen), keyOfRow) : step));
}

/** What the person authorised closing for this row: the snapshot's terminals under the closing button, nothing under `Run`. */
function authorisedFor(row: LineRow, chosen: Chosen): readonly vscode.Terminal[] {
  return chosen.closing ? (chosen.snapshot.get(row.id) ?? []) : [];
}

const stillLive = (terminals: readonly vscode.Terminal[]): boolean => terminals.some((terminal) => terminal.exitStatus === undefined);

/**
 * A live terminal of the row's CURRENT key that the person did not authorise closing, or (under `Run` only) a terminal the
 * modal listed for the row that is still live, whatever title it carries now: it is open, so the row is left alone.
 */
function appeared(row: LineRow, chosen: Chosen, keyOfRow: KeyOfRow): boolean {
  const listed = chosen.snapshot.get(row.id) ?? [];
  const unlisted = liveTerminalsOfEntry(keyOfRow(row)).some((terminal) => !listed.includes(terminal));
  return unlisted || (!chosen.closing && stillLive(listed));
}

/** Close what was authorised for this row, by object; then a NEW terminal, never found. A failure is this row's alone. No rollback. */
function typeLine(row: LineRow, toClose: readonly vscode.Terminal[], keyOfRow: KeyOfRow): FolderOutcome {
  const live = toClose.filter((terminal) => terminal.exitStatus === undefined);
  try {
    live.forEach((terminal) => terminal.dispose());
    const sent = typeIntoNew(keyOfRow(row), { kind: 'entry', terminalOs: row.details.terminalOs }, () => row.line);
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
