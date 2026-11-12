import * as vscode from 'vscode';
import { asElement } from '../commandTargets';
import { isCommandTrusted } from '../commandTrust';
import { dependencyRequest, liveDetails, runDependenciesFirst, trustAll, withSshSteps } from '../dependencyRunHost';
import { describeError } from '../describeError';
import { ensureFolderColor, noteColourFailure } from '../folderColors';
import {
  CHANGED_ROW,
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
  refusedRowReason,
  reportNotice,
  settleRow,
  sshStopped,
} from '../folderRun';
import { entryOpenRefusal, liveTerminalsOfEntry } from '../pinnedTerminal';
import type { RemotePlan } from '../remoteLaunch';
import { OwnedSessions, linkedNow, ownedSessions, recheckedLine } from '../sshRoad';
import type { ReadySsh } from '../sshSession';
import { NewTerminalSend, typeIntoNew } from '../terminalGuard';
import { EntryTerminalKey, entryTerminalKey, entryTerminalKeyOf } from '../terminalTitles';
import type { TreeNode } from '../types';
import type { RunCommandsHost } from './runCommands';

/**
 * `credSshManager.runFolder`: the `vscode` half of the folder run (parent `PLAN_terminal_folder_run.md` §3); every decision
 * and every sentence is `folderRun.ts`.
 *
 * <p>Closing is authorised per terminal OBJECT, in a snapshot taken when the modal is built, and never by name afterwards.
 * From the last preparation (`prepareLinked`) to the last send nothing is awaited, so the one re-check is as fresh as one per
 * line, and nothing reads the terminal list after a `dispose` (a disposed terminal may still be listed).</p>
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
 *
 * <p><b>Linked rows (E2.S2).</b> A row that runs over SSH is shown in the modal by its trust line. After the modal, the
 * trust and the chain, each linked row is prepared in ROW ORDER (`prepareLinked`), one after another, before the
 * synchronous send; the SSH entry is read again then, and a row whose trust line, rebuilt from its prepared snapshot,
 * differs from the one the modal showed is not typed (`recheckedLine`). A row's link is read again from the Terminal entry
 * as storage holds it NOW (`liveDetails`, then `linkedNow`), the way the chain reads it: a row removed or trashed during the
 * wait is not typed. A `stopped` row (the person cancelled a question) stops the WHOLE run: nothing is typed, linked or not.
 * The run OWNS the sessions it prepared (`ownedSessions`, made before the first `prepare` and cleaned in the run's
 * `finally`, also when a later `prepare` throws): a row handed to its terminal leaves the list, and that terminal's close
 * cleans it.</p>
 */

interface Folder {
  readonly accountId: string;
  readonly id: string;
  readonly name: string;
  /** The node as `folderAt` re-read it: the parent of every row. */
  readonly node: TreeNode;
}

/** A linked row after preparation: ready to type (its typed line from the prepared snapshot), or why it is not typed. */
type LinkedState = { readonly kind: 'ready'; readonly ready: ReadySsh; readonly typed: string } | { readonly kind: 'failed'; readonly reason: string };

/**
 * What the run prepared: each linked row's state by row id, and the one owner of the sessions (`sshRoad.ts`). Made before
 * the first `prepare`, so a throw in a later one still finds the earlier sessions there (lead amendment A4).
 */
interface Prepared {
  readonly rows: Map<string, LinkedState>;
  readonly sessions: OwnedSessions;
  stopped: boolean;
}

/** The terminals the modal listed, by row id: what `Close Open Terminals and Run` authorises, and nothing else. */
type Authorised = ReadonlyMap<string, readonly vscode.Terminal[]>;

function keyOf(folder: Folder, name: string): EntryTerminalKey {
  return entryTerminalKey(name, folder.node);
}

function factsOf(host: RunCommandsHost, folder: Folder): FolderFacts {
  return {
    shellRefusal: entryOpenRefusal,
    isOpen: (name) => liveTerminalsOfEntry(keyOf(folder, name)).length > 0,
    lookup: (id) => host.storage.getNode(folder.accountId, id),
  };
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
  const plan = planFolderRun(host.storage.getChildren(folder.accountId, folder.id), factsOf(host, folder));
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
  const request = withSshSteps(dependencyRequest(host.storage, folder.accountId, lines.map((row) => row.details), folder.name, trust, plan.directIds), host.sshRoad, folder.accountId, host.storage);
  const chain = await runDependenciesFirst({ ...request, ownerIsFolder: true });
  if (chain.ready) {
    await prepareAndType(host, folder, plan, chosen);
  } else {
    warned(chainStopped(folder.name));
  }
}

/** The run's one owner of the prepared sessions: prepare inside the `try`, type, and clean whatever was not handed over. */
async function prepareAndType(host: RunCommandsHost, folder: Folder, plan: FolderPlan, chosen: Chosen): Promise<void> {
  await colourRows(host, folder, linesToType(plan, chosen.closing));
  const keyOfRow: KeyOfRow = (row) => entryTerminalKeyOf(host.storage, folder.accountId, row.id, row.name);
  const prepared: Prepared = { rows: new Map(), sessions: ownedSessions(), stopped: false };
  try {
    await prepareLinked(host, folder, linesToType(plan, chosen.closing), prepared);
    if (prepared.stopped) {
      warned(sshStopped(folder.name));
      return;
    }
    say(reportNotice(folder.name, typeAll(plan, chosen, keyOfRow, prepared)));
  } finally {
    prepared.sessions.cleanAll();
    prepared.rows.clear();
  }
}

/**
 * The folder gets its colour before the first preparation, once per row to type and in row order (the first call writes, the
 * others only read; a row moved meanwhile colours the folder its terminal opens in). It awaits nothing after the last
 * preparation. A failed write never stops the run. `keyOf` is not re-read: it only FINDS terminals by title, which a
 * colour does not change, and the keys that CREATE terminals come from `keyOfRow`, read fresh after this.
 */
async function colourRows(host: RunCommandsHost, folder: Folder, rows: readonly LineRow[]): Promise<void> {
  for (const row of rows) {
    await ensureFolderColor(host.storage, folder.accountId, row.id).catch(noteColourFailure(host.log));
  }
}

/**
 * Every linked row of `rows`, IN ROW ORDER, one after another (each awaits the person's PIN or host-key question): its link
 * is read again, then the session prepared. A `stopped` answer ends the loop and the run: no further `prepare`.
 */
async function prepareLinked(host: RunCommandsHost, folder: Folder, rows: readonly LineRow[], prepared: Prepared): Promise<void> {
  for (const row of rows) {
    if (row.remote === undefined) {
      continue;
    }
    const state = await prepareRow(host, folder, row, row.remote, prepared);
    if (state === 'stopped') {
      prepared.stopped = true;
      return;
    }
    prepared.rows.set(row.id, state);
  }
}

/** What a linked row is when it was never prepared: never typed (fail closed). */
const NOT_PREPARED: LinkedState = { kind: 'failed', reason: CHANGED_ROW };

function failedState(reason: string): LinkedState {
  return { kind: 'failed', reason };
}

async function prepareRow(host: RunCommandsHost, folder: Folder, row: LineRow, remote: RemotePlan, prepared: Prepared): Promise<LinkedState | 'stopped'> {
  const link = linkedNow(liveDetails(host.storage, folder.accountId, row.id), (id) => host.storage.getNode(folder.accountId, id), CHANGED_ROW);
  if (typeof link === 'string') {
    return failedState(link);
  }
  const answer = await host.sshRoad.prepare(folder.accountId, link.ssh);
  switch (answer.kind) {
    case 'stopped':
      return 'stopped';
    case 'refused':
      return failedState(refusedRowReason(link.sshName));
    default:
      prepared.sessions.own(answer);
      return checkedRow(row, remote, answer);
  }
}

/** The trust line the modal showed must be the one the prepared snapshot gives; then the typed line. Either refusal cleans now (the run's `finally` cleans again, harmlessly). */
function checkedRow(row: LineRow, remote: RemotePlan, ready: ReadySsh): LinkedState {
  const checked = recheckedLine(remote, ready, row.line, CHANGED_ROW);
  if (checked.kind === 'typed') {
    return { kind: 'ready', ready, typed: checked.line };
  }
  ready.cleanup();
  return failedState(checked.reason);
}

/** The re-check over every row first, then the closes and the sends: synchronous from here to the last send. */
function typeAll(plan: FolderPlan, chosen: Chosen, keyOfRow: KeyOfRow, prepared: Prepared): readonly FolderOutcome[] {
  if (prepared.stopped) {
    return [];
  }
  const settled = plan.rows.map((row) => settleRow(row, chosen.closing, (r) => appeared(r, chosen, keyOfRow)));
  return settled.map((step) => (step.kind === 'type' ? typeStep(step.row, authorisedFor(step.row, chosen), keyOfRow, prepared) : step));
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

/** A local row types its own line; a linked row types the line prepared for it, or is the failure its preparation said. */
function typeStep(row: LineRow, toClose: readonly vscode.Terminal[], keyOfRow: KeyOfRow, prepared: Prepared): FolderOutcome {
  return row.remote === undefined ? typeLocal(row, toClose, keyOfRow) : typeLinkedRow(row, toClose, keyOfRow, prepared);
}

function typeLocal(row: LineRow, toClose: readonly vscode.Terminal[], keyOfRow: KeyOfRow): FolderOutcome {
  return typeLine(row, toClose, () => typeIntoNew(keyOfRow(row), { kind: 'entry', terminalOs: row.details.terminalOs }, () => row.line));
}

function typeLinkedRow(row: LineRow, toClose: readonly vscode.Terminal[], keyOfRow: KeyOfRow, prepared: Prepared): FolderOutcome {
  const state = prepared.rows.get(row.id) ?? NOT_PREPARED;
  return state.kind === 'ready' ? typeLine(row, toClose, () => typeLinked(keyOfRow(row), state, prepared)) : failed(row, state.reason);
}

/** A new terminal with the session's own environment (a password's, D10); the session leaves the run's list and goes to that terminal. */
function typeLinked(key: EntryTerminalKey, state: Extract<LinkedState, { kind: 'ready' }>, prepared: Prepared): NewTerminalSend {
  const sent = typeIntoNew(key, { kind: 'ssh', env: state.ready.env }, () => state.typed);
  if (sent.kind === 'typed') {
    prepared.sessions.handOver(state.ready, sent.terminal, sent.earlierEnded);
  }
  return sent;
}

/** Close what was authorised for this row, by object; then a NEW terminal, never found. A failure is this row's alone. No rollback. */
function typeLine(row: LineRow, toClose: readonly vscode.Terminal[], send: () => NewTerminalSend): FolderOutcome {
  const live = toClose.filter((terminal) => terminal.exitStatus === undefined);
  try {
    live.forEach((terminal) => terminal.dispose());
    const sent = send();
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
