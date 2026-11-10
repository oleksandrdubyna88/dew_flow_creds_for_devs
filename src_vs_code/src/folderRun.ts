import { NodeLookup, RemotePlan, planLaunch, shownTrustLine, sshLinkOf } from './remoteLaunch';
import { READ_EACH_LINE } from './dependencyRun';
import { isInTrash } from './trash';
import { escapeControl } from './transitSecretReport';
import { EntityMetadata, TreeNode } from './types';
import { USES_CONFIG, usesConfig } from './vpnLauncher';

/**
 * Running a terminal folder's direct entries: the pure half (parent `PLAN_terminal_folder_run.md` §3). WHAT runs, why a
 * row does not, what the modal says and what the report says are here; `commands/folderRunCommand.ts` opens the terminals.
 *
 * <p>A row's `line` is resolved once, here, and it is the string that is trusted and typed. What is SHOWN of a name, a line
 * or a folder is `escapeControl` of it (`shown`): a vault that sync and Accept Share fill can hold a newline in a name, and
 * one click in the modal vouches for up to {@link MAX_FOLDER_LINES} lines, so a name must not be able to draw a row of its
 * own. Values are immutable.</p>
 */

/** A name, a line or a reason as the person sees it: control characters become visible escapes. Never what is typed. */
const shown = escapeControl;

/** The modal must show every line, and from memory a native dialog does not scroll (the parent's hand check 8). */
export const MAX_FOLDER_LINES = 32;

/** The longest question the folder run asks: chosen, not measured, for the same reason as {@link MAX_FOLDER_LINES}. */
export const MAX_QUESTION_CHARACTERS = 4000;

export const RUN = 'Run';
export const CLOSE_AND_RUN = 'Close Open Terminals and Run';

const NOT_TERMINAL = 'not a Terminal entry';
const NO_COMMAND = 'no command';
const CONTROL_NAME = 'its name holds a control character: rename it to run it here';
const SHARED_NAME = 'another direct entry has the same name, and they would share one terminal';
const CLOSED_MEANWHILE = 'its terminal closed while the question was open, and Run approved no line for it';

/** A row that has a line: `run` found no live terminal of its name, `open` found at least one. */
export interface LineRow {
  readonly kind: 'run' | 'open';
  readonly id: string;
  readonly name: string;
  readonly line: string;
  readonly details: EntityMetadata;
  /**
   * Set for a row that runs over SSH (E2.S2). Then `line` is the SHOWN trust line (what the modal shows and `trustAll`
   * records, the key the arrow uses too), and `remote.line` is the person's own line.
   */
  readonly remote?: RemotePlan;
}

export interface NotRunRow {
  readonly kind: 'notRun';
  readonly id: string;
  readonly name: string;
  readonly reason: string;
}

export type FolderRow = LineRow | NotRunRow;

export interface FolderPlan {
  /** One row per direct entry, in display order. */
  readonly rows: readonly FolderRow[];
  /** The direct subfolders' names, in display order. */
  readonly subfolders: readonly string[];
  /** Every direct entry's id: the chain's `exclude`. */
  readonly directIds: ReadonlySet<string>;
}

/** What the plan asks of the window. */
export interface FolderFacts {
  /** Why this entry's terminal cannot be opened in this window (its OS, or a pinned shell), or `undefined`. */
  readonly shellRefusal: (name: string, terminalOs: string | undefined) => string | undefined;
  /** Whether a live terminal of the entry's name exists, in any shell. */
  readonly isOpen: (name: string) => boolean;
  /** The vault as the folder's plan reads it, for each row's link and its shown trust line. */
  readonly lookup: NodeLookup;
}

type Candidate = Omit<LineRow, 'kind'> & { readonly kind: 'candidate' };

/** The rows of `children` (`storage.getChildren`, display order). First match wins, in the parent's order of reasons. */
export function planFolderRun(children: readonly TreeNode[], facts: FolderFacts): FolderPlan {
  const entries = children.filter((child) => child.type !== 'folder');
  const judged = entries.map((node) => judge(node, facts));
  const shared = sharedNames(judged);
  return {
    rows: judged.map((row) => finalRow(row, shared, facts)),
    subfolders: children.filter((child) => child.type === 'folder').map((child) => child.name),
    directIds: new Set(entries.map((child) => child.id)),
  };
}

function judge(node: TreeNode, facts: FolderFacts): NotRunRow | Candidate {
  const details = node.details;
  return details?.isTerminal === true ? judgeTerminal(node.id, details, facts) : notRun(node.id, rowName(node), NOT_TERMINAL);
}

function rowName(node: TreeNode): string {
  return node.details?.name ?? node.name;
}

function judgeTerminal(id: string, details: EntityMetadata, facts: FolderFacts): NotRunRow | Candidate {
  const verdict = lineOrReason(details, facts);
  if ('reason' in verdict) {
    return notRun(id, details.name, verdict.reason);
  }
  return { kind: 'candidate', id, name: details.name, line: verdict.line, details, ...(verdict.remote === undefined ? {} : { remote: verdict.remote }) };
}

function notRun(id: string, name: string, reason: string): NotRunRow {
  return { kind: 'notRun', id, name, reason };
}

/** A row's verdict: its line (and, for a linked row, its plan), or why it does not run. */
type Verdict = { line: string; remote?: RemotePlan } | { reason: string };

/** `planLaunch` is the ONE road from an entry and its link to a line (E2.S2): no resolving of the command here. */
function lineOrReason(details: EntityMetadata, facts: FolderFacts): Verdict {
  const plan = planLaunch(details, sshLinkOf(details, facts.lookup), { stayOpen: true });
  switch (plan.kind) {
    case 'empty':
      return { reason: NO_COMMAND };
    case 'refused':
      return { reason: plan.reason };
    case 'local':
      return judgedLine(details, plan.line, facts);
    default:
      return linkedLine(details, plan, facts);
  }
}

function judgedLine(details: EntityMetadata, line: string, facts: FolderFacts): Verdict {
  const reason = lineRefusal(details.name, line) ?? facts.shellRefusal(details.name, details.terminalOs);
  return reason === undefined ? { line } : { reason };
}

/**
 * A linked row (E2.S2, lead amendment A3). Which local checks apply to it, and why:
 *
 * | Check | Linked row | Why |
 * |---|---|---|
 * | the `{name}` rule (`planLaunch`, from `resolveCommand`) | applies | it is about the entry's name, not the shell |
 * | a line break or NUL in the line (`planLaunch` P6) | applies | one remote command cannot carry it |
 * | a control character in the entry's name (`lineRefusal`) | applies | the open test is not trusted for such a name |
 * | `{config}` (`lineRefusal`) | applies | the config is a file on THIS machine |
 * | `facts.shellRefusal`, the local OS and shell (D14) | does NOT apply | *Runs on* names the remote; the local shell is SSH Connect's |
 *
 * The line SHOWN, trusted and approved is the trust line (`shownTrustLine`, from the vault as the plan reads it); the
 * person's own line stays in `remote.line`. A jump chain that cannot be resolved refuses the row.
 */
function linkedLine(details: EntityMetadata, plan: RemotePlan, facts: FolderFacts): Verdict {
  const reason = lineRefusal(details.name, plan.line);
  if (reason !== undefined) {
    return { reason };
  }
  const shownLine = shownTrustLine(plan, facts.lookup);
  return shownLine.kind === 'shown' ? { line: shownLine.line, remote: plan } : { reason: shownLine.reason };
}

/**
 * A control character in a name: VS Code draws a terminal's title without `\n`, `\r` and `\t` (its label computer, read in 1.93.0),
 * and whether `Terminal.name` keeps any of them through a reload is not measured, so the open test is not trusted for such a name.
 */
function lineRefusal(name: string, line: string): string | undefined {
  if (shown(name) !== name) {
    return CONTROL_NAME;
  }
  return usesConfig(line) ? USES_CONFIG : undefined;
}

/** Names two rows that passed every other test hold: only those would share a terminal. */
function sharedNames(judged: readonly (NotRunRow | Candidate)[]): ReadonlySet<string> {
  const names = judged.filter((row) => row.kind === 'candidate').map((row) => row.name);
  return new Set(names.filter((name, i) => names.indexOf(name) !== i));
}

function finalRow(row: NotRunRow | Candidate, shared: ReadonlySet<string>, facts: FolderFacts): FolderRow {
  if (row.kind === 'notRun') {
    return row;
  }
  if (shared.has(row.name)) {
    return notRun(row.id, row.name, SHARED_NAME);
  }
  return { ...row, kind: facts.isOpen(row.name) ? 'open' : 'run' };
}

/** The rows that have a line, in display order. */
export function lineRows(plan: FolderPlan): readonly LineRow[] {
  return plan.rows.filter((row): row is LineRow => row.kind !== 'notRun');
}

/** The rows a choice types: `Run` the `run` rows, `Close Open Terminals and Run` the `open` ones too. */
export function linesToType(plan: FolderPlan, closing: boolean): readonly LineRow[] {
  return lineRows(plan).filter((row) => closing || row.kind === 'run');
}

/** A sentence for the person, and whether it is a warning. */
export interface FolderNotice {
  readonly text: string;
  readonly warning: boolean;
}

/** What stops the run before the modal: an empty folder, nothing with a line, or a question too long to show. `undefined` means ask. */
export function beforeAsking(folderName: string, plan: FolderPlan, isNew: (row: LineRow) => boolean): FolderNotice | undefined {
  if (lineRows(plan).length === 0) {
    return nothingToType(folderName, plan);
  }
  const refusal = capRefusal(folderName, plan) ?? sizeRefusal(folderName, plan, isNew);
  return refusal === undefined ? undefined : { text: refusal, warning: true };
}

function nothingToType(folderName: string, plan: FolderPlan): FolderNotice {
  return plan.rows.length === 0 ? { text: emptyFolderNote(folderName), warning: false } : reportNotice(folderName, notRunRows(plan));
}

/** Refused when more than `MAX_FOLDER_LINES` rows have a line: the closing button can type every one, and the modal shows every one. */
function capRefusal(folderName: string, plan: FolderPlan): string | undefined {
  const count = lineRows(plan).length;
  return count > MAX_FOLDER_LINES
    ? `"${shown(folderName)}" has ${count} entries that could run, and a folder run takes at most ${MAX_FOLDER_LINES}, because its question has to show every line. Nothing was typed. Move some into a subfolder: a subfolder is not run.`
    : undefined;
}

/** Refused when the question, as it would be shown, is over `MAX_QUESTION_CHARACTERS`: an escape counts as what it shows. */
function sizeRefusal(folderName: string, plan: FolderPlan, isNew: (row: LineRow) => boolean): string | undefined {
  const count = folderQuestion(folderName, plan, isNew).length;
  return count > MAX_QUESTION_CHARACTERS
    ? `The question for "${shown(folderName)}" would run to ${count} characters, and a folder run shows at most ${MAX_QUESTION_CHARACTERS}, because the question has to show every line. Nothing was typed. Shorten a line, or move some entries into a subfolder: a subfolder is not run.`
    : undefined;
}

/** `Run` when a line has no terminal open, the closing button when any has; with only open rows, the closing button alone. */
export function folderButtons(plan: FolderPlan): readonly string[] {
  const rows = lineRows(plan);
  return [...(rows.some((r) => r.kind === 'run') ? [RUN] : []), ...(rows.some((r) => r.kind === 'open') ? [CLOSE_AND_RUN] : [])];
}

const NOT_AWAITED =
  'The lines do not wait for each other, and a sibling named under Depends on is not awaited. Any other dependency an entry asks to run first runs before any line, each waited for.';

const CLOSING =
  'Close Open Terminals and Run closes every terminal open under these names, once the dependencies are ready, and types their lines too. Closing ends whatever runs there; a tmux client only detaches, and its session goes on. A terminal of one of these names opened after this question appeared stays open, and its line is not typed.';

/** The modal: every line in full and in order, every row that will not run, and what each button does. */
export function folderQuestion(folderName: string, plan: FolderPlan, isNew: (row: LineRow) => boolean): string {
  const rows = lineRows(plan);
  const run = rows.filter((row) => row.kind === 'run');
  const open = rows.filter((row) => row.kind === 'open');
  return [
    `Run the entries of "${shown(folderName)}"?`,
    lineSection('Typed, each into a new terminal:', run, isNew),
    lineSection('Terminal already open:', open, isNew),
    notRunSection(plan),
    subfolderSentence(plan.subfolders),
    NOT_AWAITED,
    closingParagraph(run, open),
    rows.some(isNew) ? '(new) marks a line that has not been run on this machine.' : '',
    READ_EACH_LINE,
  ]
    .filter((section) => section.length > 0)
    .join('\n\n');
}

function lineSection(title: string, rows: readonly LineRow[], isNew: (row: LineRow) => boolean): string {
  const lines = rows.map((row, i) => `${i + 1}. ${isNew(row) ? '(new) ' : ''}${shown(row.name)}: ${shown(row.line)}`);
  return rows.length === 0 ? '' : [title, ...lines].join('\n');
}

function notRunRows(plan: FolderPlan): readonly NotRunRow[] {
  return plan.rows.filter((row): row is NotRunRow => row.kind === 'notRun');
}

function notRunSection(plan: FolderPlan): string {
  const groups = reasonGroups(notRunRows(plan));
  return groups.length === 0 ? '' : ['Not run:', ...groups].join('\n');
}

function subfolderSentence(names: readonly string[]): string {
  if (names.length === 0) {
    return '';
  }
  return names.length === 1 ? `1 subfolder is not run: ${shown(names[0])}.` : `${names.length} subfolders are not run: ${names.map(shown).join(', ')}.`;
}

function closingParagraph(run: readonly LineRow[], open: readonly LineRow[]): string {
  if (open.length === 0) {
    return '';
  }
  return run.length === 0 ? CLOSING : `Run leaves the open terminals alone. ${CLOSING}`;
}

/** `a, b — reason` per distinct reason, first seen first. A reason's own closing full stop is left to the sentence around it. */
function reasonGroups(rows: readonly { name: string; reason: string }[]): readonly string[] {
  const reasons = [...new Set(rows.map((row) => row.reason))];
  return reasons.map((reason) => `${rows.filter((row) => row.reason === reason).map((row) => shown(row.name)).join(', ')} — ${shown(reason.replace(/\.$/u, ''))}`);
}

export type FolderOutcome =
  | { readonly kind: 'typed'; readonly name: string }
  | { readonly kind: 'open'; readonly name: string }
  | { readonly kind: 'notRun'; readonly name: string; readonly reason: string } // the plan said so
  | { readonly kind: 'failed'; readonly name: string; readonly reason: string }; // opening or typing failed

/** What the re-check makes of a row: its outcome, or the line still to type. */
export type SettledRow = FolderOutcome | { readonly kind: 'type'; readonly row: LineRow };

/**
 * The re-check, after the last await. `appeared` says that a live terminal of the row's name exists that the person did not
 * authorise closing (under `Run`, any live terminal): that row is left alone, whichever button was pressed. An `open` row with
 * none under `Run` has lost its terminal while the modal sat: it is not run, and it is not "already open".
 */
export function settleRow(row: FolderRow, closing: boolean, appeared: (row: LineRow) => boolean): SettledRow {
  if (row.kind === 'notRun') {
    return row;
  }
  return appeared(row) ? { kind: 'open', name: row.name } : settleFree(row, closing);
}

function settleFree(row: LineRow, closing: boolean): SettledRow {
  return row.kind === 'open' && !closing ? notRun(row.id, row.name, CLOSED_MEANWHILE) : { kind: 'type', row };
}

/**
 * Why a row's line was not typed, after `closed` of its terminals were closed for it: the person must be told what is gone, or a
 * tmux client that detached for nothing looks like one that was never touched.
 */
export function failedAfterClosing(reason: string, closed: number): string {
  if (closed === 0) {
    return reason;
  }
  return `${closed === 1 ? 'its terminal was' : `its ${closed} terminals were`} closed, and its line was not typed: ${reason}`;
}

/**
 * `Typed 3 of 5 in "claude sessions". Not run: e — reason. Left alone, terminal already open: d. Typed: a, b, c.` What must not be
 * lost comes first, since a notification is cut at about 1,000 characters. "Typed", never "started": exits are not observed.
 */
export function folderReport(folderName: string, outcomes: readonly FolderOutcome[]): string {
  const typed = namesOf(outcomes, 'typed');
  const left = namesOf(outcomes, 'open');
  const notRunGroups = reasonGroups(outcomes.filter(hasReason));
  return [
    `Typed ${typed.length} of ${outcomes.length} in "${shown(folderName)}".`,
    notRunGroups.length > 0 ? `Not run: ${notRunGroups.join('; ')}.` : '',
    left.length > 0 ? `Left alone, terminal already open: ${left.join(', ')}.` : '',
    typed.length > 0 ? `Typed: ${typed.join(', ')}.` : '',
  ]
    .filter((clause) => clause.length > 0)
    .join(' ');
}

function namesOf(outcomes: readonly FolderOutcome[], kind: 'typed' | 'open'): readonly string[] {
  return outcomes.filter((outcome) => outcome.kind === kind).map((outcome) => shown(outcome.name));
}

function hasReason(outcome: FolderOutcome): outcome is Extract<FolderOutcome, { reason: string }> {
  return outcome.kind === 'notRun' || outcome.kind === 'failed';
}

/** The report, as a warning when nothing was typed or a line failed; otherwise information, the not-run rows having been in the modal. */
export function reportNotice(folderName: string, outcomes: readonly FolderOutcome[]): FolderNotice {
  return { text: folderReport(folderName, outcomes), warning: reportIsWarning(outcomes) };
}

function reportIsWarning(outcomes: readonly FolderOutcome[]): boolean {
  return !outcomes.some((outcome) => outcome.kind === 'typed') || outcomes.some((outcome) => outcome.kind === 'failed');
}

export type FolderTarget = { readonly ok: true; readonly node: TreeNode } | { readonly ok: false; readonly reason: string };

export const NO_FOLDER_TARGET = 'Run All in Folder needs a folder. Use the green arrow on a Terminal folder in the tree.';

/** Whether the re-read `node` may be run: a folder, of type terminal, not in the Trash. F2 and the palette reach a handler with no menu. */
export function folderTarget(node: TreeNode | undefined, byId: (id: string) => TreeNode | undefined): FolderTarget {
  if (node === undefined) {
    return { ok: false, reason: 'That folder no longer exists, so nothing was run.' };
  }
  const reason = refusalOf(node, byId);
  return reason === undefined ? { ok: true, node } : { ok: false, reason };
}

function refusalOf(node: TreeNode, byId: (id: string) => TreeNode | undefined): string | undefined {
  if (node.type !== 'folder') {
    return `"${shown(node.name)}" is not a folder, so Run All in Folder has nothing to run.`;
  }
  if (node.folderType !== 'terminal') {
    return `"${shown(node.name)}" is not a Terminal folder, so Run All in Folder does not run it.`;
  }
  return isInTrash(node, byId) ? `"${shown(node.name)}" is in the Trash, so nothing in it runs. Restore it first.` : undefined;
}

function emptyFolderNote(folderName: string): string {
  return `"${shown(folderName)}" has no entries of its own to run. A folder run covers only its direct entries, and subfolders are not run.`;
}

export function alreadyRunning(folderName: string): string {
  return `A run of "${shown(folderName)}" is already waiting for you or for its dependencies, so this click did nothing.`;
}

/** A linked row the run cannot open from this window: the SSH entry refused (not stopped by the person). */
export function refusedRowReason(sshName: string): string {
  return `its SSH connection "${sshName}" cannot be opened from this window: run it with its own arrow to see why`;
}

/** A linked row whose trust line, rebuilt from the prepared snapshot, is not the one the modal showed. */
export const CHANGED_ROW = 'its SSH connection changed while the dialog was open — run the folder again';

/** An SSH connection could not be prepared (a question was cancelled, or SSH Connect said why): the WHOLE run stops. */
export function sshStopped(folderName: string): string {
  return `Nothing was typed in "${shown(folderName)}" and no entry's terminal was closed: an SSH connection could not be prepared (a question was cancelled, or SSH Connect said why).`;
}

export function chainStopped(folderName: string): string {
  return `Nothing was typed in "${shown(folderName)}" and no entry's terminal was closed: the dependencies did not finish.`;
}
