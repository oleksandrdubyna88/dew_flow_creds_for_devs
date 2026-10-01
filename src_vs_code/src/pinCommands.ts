import * as vscode from 'vscode';
import { StorageManager } from './storageManager';
import { TreeNode } from './types';
import { entryPinGate, newPin, refusedWhileCooling } from './pinPrompt';
import { forgetPin } from './pinSession';
import { DamagedSlots, UnprotectResult, isProtected, lockedSlotCount, opensEverySealed, protectEntity, siblingsOpened, unprotectEntity } from './entityPin';
import { lockedHistoryValues, protectHistory } from './historyPin';
import { pinValidator } from './pinInput';
import { describeError } from './describeError';
import { asElement } from './commandTargets';
import { FolderPinPlan, RacedEntry, folderPinPlan, protectionSummary, runReport, siblingReport } from './pinFolderPlan';
import { restoreRevision } from './revisionRestore';
import { protectionDecision } from './syncPinRule';
import { UNATTENDED, releaseHeld } from './rotationQuarantine';
import { releasedSentence } from './rotationWaiting';

/**
 * Putting a PIN on an entry or a folder, and taking it off — the commands a person runs.
 *
 * <p>A command rather than a checkbox in the form, and deliberately. Setting a PIN is not a field:
 * it needs the value typed (twice, or checked against a sibling), it re-writes every secret the
 * entry holds, and it can take a second per slot. A checkbox that quietly did all that on Save
 * would be a control whose cost and consequences are invisible at the moment it is clicked. The
 * form STATES what the entry is; this changes it.</p>
 *
 * <p>The same command serves a folder, because the owner's model makes a folder run a loop over
 * exactly this: <i>"галочка на папке папку не шифрует, она просто сетает всем сущностям внутри
 * рекурсивно пин и шифрует"</i>.</p>
 */

/**
 * The three commands, wired.
 *
 * <p>Beside the commands rather than in `activate()`, the shape `registerRunCommands` already
 * has: a composition root that spells out every handler is a file nobody can find anything in, and
 * this one is at a size ratchet that only lets it shrink.</p>
 */
export function registerPinCommands(deps: {
  readonly register: (command: string, handler: (...args: unknown[]) => unknown) => void;
  readonly storage: StorageManager;
  readonly refresh: () => void;
}): void {
  const onNode =
    (run: (node: TreeNode, d: PinCommandDeps) => Promise<void>) =>
    (target: unknown): Promise<void> => {
      const element = asElement(target);
      return element?.kind === 'node'
        ? run(element.node, { storage: deps.storage, accountId: element.accountId, refresh: deps.refresh })
        : Promise.resolve();
    };
  deps.register('credSshManager.protectEntry', onNode(protectEntry));
  deps.register('credSshManager.unprotectEntry', onNode(unprotectEntry));
  deps.register('credSshManager.protectFolder', onNode(protectFolder));
  deps.register('credSshManager.stopAskingForPin', onNode(stopAskingForPin));
  // A history row, not a node: Restore brings a kept version back through the entry's own door (D11).
  deps.register('credSshManager.restoreRevision', (target) => restoreRevision(target, deps));
}

export interface PinCommandDeps {
  readonly storage: StorageManager;
  readonly accountId: string;
  /** Redraw the tree — the badge and the agent filter both read the mark this writes. */
  readonly refresh: () => void;
}

/** Wrap one entry's secrets under a PIN the person types twice. */
export async function protectEntry(node: TreeNode, deps: PinCommandDeps): Promise<void> {
  const details = node.details;
  if (details === undefined || (await offeredRemoval(node, deps))) {
    return;
  }
  const pin = await newPin(details.name, 'entry');
  if (pin === undefined) {
    return;
  }
  await runProtect([node], pin, deps);
}

const REMOVE = 'Remove PIN Protection…';
const PROTECT_AGAIN = 'Protect with a PIN…';

/**
 * An entry that already holds a PIN — live, or only in its kept versions — is offered *Remove PIN
 * Protection…* instead of a dead end (D15). The row offers Protect whenever the MARK is off, and the
 * mark can be lost while the values stay locked (an Edit before 1.12, a sync); the answer used to be
 * "already has its own PIN" and nothing to press. `true` means this command is done: the person
 * removed the protection, or dismissed the question. Only *Protect with a PIN…* goes on to protect.
 */
async function offeredRemoval(node: TreeNode, deps: PinCommandDeps): Promise<boolean> {
  const offer = await removalOffer(node, deps);
  if (offer === undefined) {
    return false;
  }
  const answer = await vscode.window.showWarningMessage(offer.message, { modal: true }, ...offer.buttons);
  if (answer === REMOVE) {
    await unprotectEntry(node, deps);
  }
  return answer !== PROTECT_AGAIN;
}

async function removalOffer(node: TreeNode, deps: PinCommandDeps): Promise<{ message: string; buttons: string[] } | undefined> {
  const live = await lockedSlotCount(deps.storage, deps.accountId, node.id);
  if (live.locked > 0) {
    return { message: alreadyProtected(node.name, live), buttons: [REMOVE] };
  }
  // Unprotected on another machine and synced here, while this machine's history stayed sealed
  // (plan gate, finding 3): protecting again is a real choice, so it is offered beside the removal.
  const kept = lockedHistoryValues(await deps.storage.getHistory(deps.accountId, node.id));
  return kept === 0 ? undefined : { message: keptStillSealed(node.name, kept), buttons: [REMOVE, PROTECT_AGAIN] };
}

function alreadyProtected(name: string, count: { readonly locked: number; readonly total: number }): string {
  return `"${name}" already has its own PIN (${count.locked} of ${count.total} values are locked). To set a different one, remove the protection first.`;
}

function keptStillSealed(name: string, kept: number): string {
  return (
    `"${name}" is not protected, but ${valueCount(kept)} in its kept versions on this machine ${isAre(kept)} still sealed under the PIN it used `
    + `to have. ${REMOVE} opens them with that PIN; ${PROTECT_AGAIN} protects the entry again.`
  );
}

/** "1 value" / "3 values" — the count a sentence about kept values starts with. */
function valueCount(count: number): string {
  return count === 1 ? '1 value' : `${count} values`;
}

function isAre(count: number): string {
  return count === 1 ? 'is' : 'are';
}

/** Take the PIN off one entry, given it — while ANY of its values, live or kept, is sealed (§5.7). */
export async function unprotectEntry(node: TreeNode, deps: PinCommandDeps): Promise<void> {
  if (node.details === undefined || !(await anythingSealed(node, deps))) {
    await nothingSealed(node, deps);
    return;
  }
  const gate = entryPinGate(deps.accountId, node.id, node.name);
  const pin = await gate.ask('Enter this entry’s PIN to remove its protection.', node.name);
  await removeIfTyped(node, pin, deps);
}

/**
 * Nothing is sealed — which is "not protected", UNLESS the entry was protected while it held nothing.
 *
 * <p>Review of 2026-09-30: such an entry keeps its mark (the door no longer mistakes it for the 0.99.0
 * false mark), so this command is the one way to take that protection off — and answering "is not
 * protected with a PIN" there left an entry claiming a protection nobody could remove. There is nothing
 * to unseal, so there is nothing to check a PIN against: the mark comes off, as one more protection
 * decision, and the sentence says why no PIN was asked. A mark over values in the CLEAR is the legacy
 * false mark, which the door clears; this keeps its old answer rather than deciding it a second way.</p>
 */
async function nothingSealed(node: TreeNode, deps: PinCommandDeps): Promise<void> {
  if (node.details?.pinProtected !== true || (await lockedSlotCount(deps.storage, deps.accountId, node.id)).total > 0) {
    void vscode.window.showInformationMessage(`"${node.name}" is not protected with a PIN.`);
    return;
  }
  await markProtection(node, false, deps);
  forgetPin(deps.accountId, node.id);
  const waiting = await releaseWaiting(node, deps);
  deps.refresh();
  void vscode.window.showInformationMessage(
    `"${node.name}" is no longer protected with its own PIN. It held nothing sealed, so no PIN was needed.${waiting}`,
  );
}

/**
 * A rotated value that waited beside the entry for its PIN goes in now, PLAIN (rotation-quarantine plan §4.5):
 * the person decided the entry's values are plain, and the held value has exactly a plain slot's protection
 * already — kept held, the entry would stay on a dead password with no PIN left to trigger anything. The
 * unattended proof, after the mark is off: a slot still sealed (a damaged value kept) stops it.
 */
async function releaseWaiting(node: TreeNode, deps: PinCommandDeps): Promise<string> {
  return releasedSentence(await releaseHeld(deps.storage, deps.accountId, node.id, node.name, UNATTENDED));
}

/** A live slot is locked, or a kept version on this machine is — either is something to remove. */
async function anythingSealed(node: TreeNode, deps: PinCommandDeps): Promise<boolean> {
  return (
    (await isProtected(deps.storage, deps.accountId, node.id))
    || lockedHistoryValues(await deps.storage.getHistory(deps.accountId, node.id)) > 0
  );
}

function removeIfTyped(node: TreeNode, pin: string | undefined, deps: PinCommandDeps): Promise<void> {
  return pin === undefined || pin.length === 0 ? Promise.resolve() : removeOne(node, pin, deps);
}

/**
 * The run, the mark, the grant — in that order, and the mark only after the values it describes.
 * `keepDamaged` is the person's answer to the damaged-value question below.
 */
async function removeOne(node: TreeNode, pin: string, deps: PinCommandDeps, keepDamaged = false): Promise<void> {
  const result = await removal(node, pin, deps, keepDamaged);
  if (result === undefined) {
    return;
  }
  await markProtection(node, false, deps);
  forgetPin(deps.accountId, node.id);
  const waiting = await releaseWaiting(node, deps);
  deps.refresh();
  void vscode.window.showInformationMessage(`${removedMessage(node.name, result)}${waiting}`);
}

/** The unwrap, or `undefined` having said why — a damaged value is a QUESTION, not a wrong PIN. */
async function removal(node: TreeNode, pin: string, deps: PinCommandDeps, keepDamaged: boolean): Promise<UnprotectResult | undefined> {
  try {
    return await unprotectEntity(deps.storage, deps.accountId, node.id, pin, { keepDamaged });
  } catch (error) {
    await refused(node, pin, deps, error);
    return undefined;
  }
}

const KEEP_DAMAGED = 'Remove the PIN from the rest';

/**
 * D14: before 1.12 a damaged slot was skipped and the mark cleared, so an entry with an unreadable
 * value stopped claiming a PIN without anybody deciding that. Now nothing is written until the person
 * has read what it means and chosen to go ahead without that value.
 */
async function refused(node: TreeNode, pin: string, deps: PinCommandDeps, error: unknown): Promise<void> {
  if (!(error instanceof DamagedSlots)) {
    void vscode.window.showWarningMessage(`That PIN does not open "${node.name}". ${describeError(error)}`);
    return;
  }
  const answer = await vscode.window.showWarningMessage(damagedQuestion(node.name, error.labels), { modal: true }, KEEP_DAMAGED);
  if (answer === KEEP_DAMAGED) {
    await removeOne(node, pin, deps, true);
  }
}

function damagedQuestion(name: string, labels: readonly string[]): string {
  return (
    `"${name}" holds a damaged protected value (${labels.join(', ')}). Removing the PIN cannot open it: it would stay `
    + 'unreadable while the entry stops claiming a PIN.'
  );
}

/** What was done — and what was NOT: a damaged value left as it was, kept values under another PIN. */
function removedMessage(name: string, result: UnprotectResult): string {
  const damaged = result.damaged.length === 0 ? '' : ` Its ${result.damaged.join(', ')} could not be opened and was left exactly as it was.`;
  const foreign = result.foreignKept === 0 ? '' : keptForeignNote(result.foreignKept);
  return `"${name}" is no longer protected with its own PIN.${damaged}${foreign}`;
}

function keptForeignNote(count: number): string {
  const stay = count === 1 ? 'stays' : 'stay';
  return ` ${valueCount(count)} in its kept versions ${isAre(count)} sealed under a different PIN and ${stay} sealed.`;
}

/**
 * Wrap every unprotected entry inside a folder, under one PIN.
 *
 * <p>The entries already protected are NAMED BEFORE the run, not reported after it *(a reviewer's
 * finding, and the one that would have cost somebody real access)*. Somebody running this with a
 * new PIN expects the folder to be uniformly theirs afterwards; it will not be, and if they do not
 * know the other PIN they have just locked themselves out while believing the opposite.</p>
 */
export async function protectFolder(folder: TreeNode, deps: PinCommandDeps): Promise<void> {
  const plan = await folderPinPlan(deps.storage, deps.accountId, folder.id);
  if (plan.toProtect.length === 0) {
    // An EMPTY folder — or one where everything is already done — is the case the derived signal
    // cannot answer: there is no sibling to derive from, so without a mark the next entry created
    // here would not be asked. The mark says only that, and the message says what it did.
    await setAsksForPin(folder, true, deps);
    // Or the row keeps its old context value and *Stop Asking for a PIN Here* is not offered until
    // some unrelated refresh happens — a menu that lags the state it describes.
    deps.refresh();
    void vscode.window.showInformationMessage(
      `${protectionSummary(folder.name, plan)} Entries created here will be asked for a PIN.`,
    );
    return;
  }
  if (!(await agreedToRun(folder.name, plan))) {
    return;
  }
  const pin = await folderPin(folder.name, plan, deps);
  if (pin === undefined) {
    return;
  }
  await afterRun(folder, await runProtect(plan.toProtect, pin, deps), deps);
}

/**
 * The preference, recorded only by a run that actually protected something.
 *
 * <p>AFTER the run, because a preference written before the work would outlive a run that never
 * finished. And only when the count is above zero, because `runProtect` keeps each failure rather
 * than throwing — the rest of the folder deserves a try — so a run where EVERY entry failed used to
 * reach this line and set the mark anyway, leaving the next entry created there asked for a PIN in
 * a folder where nothing is protected. (A reviewer's finding.)</p>
 *
 * <p>An empty folder never arrives here: it is the deliberate exception above, and the only case
 * where the preference is the sole record that can exist.</p>
 */
async function afterRun(folder: TreeNode, protectedCount: number, deps: PinCommandDeps): Promise<void> {
  if (protectedCount > 0) {
    await setAsksForPin(folder, true, deps);
  }
  deps.refresh();
}

/**
 * Stop asking for a PIN on entries created in this folder.
 *
 * <p>The counterpart a reviewer was right to insist on: a preference with no way off is a trap, and
 * this one can be set by a single click on a folder somebody opened by accident. It changes NOTHING
 * about the entries — those keep their own PINs, and removing one is still a per-entry act.</p>
 */
export async function stopAskingForPin(folder: TreeNode, deps: PinCommandDeps): Promise<void> {
  if (folder.folderAsksForPin !== true) {
    void vscode.window.showInformationMessage(`"${folder.name}" does not ask for a PIN on new entries.`);
    return;
  }
  await setAsksForPin(folder, false, deps);
  deps.refresh();
  void vscode.window.showInformationMessage(
    `"${folder.name}" will not ask for a PIN on new entries. The entries already protected keep their own.`,
  );
}

/** The preference, on the node — a folder has no metadata record to carry it. */
async function setAsksForPin(folder: TreeNode, on: boolean, deps: PinCommandDeps): Promise<void> {
  if ((folder.folderAsksForPin === true) === on) {
    return;
  }
  await deps.storage.updateNodeFields(deps.accountId, folder.id, { folderAsksForPin: on ? true : undefined });
}

/** The confirmation, which says what will be SKIPPED before it says what will be done. */
async function agreedToRun(folderName: string, plan: FolderPinPlan): Promise<boolean> {
  if (plan.alreadyProtected.length === 0) {
    return true;
  }
  const answer = await vscode.window.showWarningMessage(
    siblingReport(folderName, plan),
    { modal: true },
    'Protect the rest',
  );
  return answer === 'Protect the rest';
}

/**
 * The PIN for a folder run: typed once and CHECKED against a sibling, or typed twice when there is
 * no sibling to check against.
 *
 * <p>What it is never is fetched. There is no stored folder PIN — that is the whole feature — so
 * "use the folder's PIN" can only mean "the PIN another entry here already uses", and the only
 * honest way to know whether the typed value is that one is to try it. The COUNT is then shown,
 * because a folder may legitimately hold entries under two PINs and "it opened at least one" is not
 * something a person can act on. *(Four reviewers, one finding.)*</p>
 */
async function folderPin(
  folderName: string,
  plan: FolderPinPlan,
  deps: PinCommandDeps,
): Promise<string | undefined> {
  if (plan.alreadyProtected.length === 0) {
    return newPin(folderName, 'entry');
  }
  if (refusedWhileCooling(deps.accountId, plan.alreadyProtected)) {
    return undefined;
  }
  const typed = await vscode.window.showInputBox({
    title: `PIN for the entries in "${folderName}"`,
    prompt: PIN_FOR_FOLDER,
    password: true,
    ignoreFocusOut: true,
    // The entry scope (issue #55): this PIN is checked against SIBLINGS, never against the vault's floor.
    validateInput: pinValidator('entering', 'entry'),
  });
  return checkedPin(typed, plan, deps);
}

/** Dismissed or empty: no PIN. Otherwise tried on the siblings, and the count agreed to. */
async function checkedPin(
  typed: string | undefined,
  plan: FolderPinPlan,
  deps: PinCommandDeps,
): Promise<string | undefined> {
  if (typed === undefined || typed.length === 0) {
    return undefined;
  }
  return (await confirmedAgainstSiblings(typed, plan, deps)) ? typed : undefined;
}

/** How many of the protected siblings this PIN actually opens — said, not assumed. */
async function confirmedAgainstSiblings(
  typed: string,
  plan: FolderPinPlan,
  deps: PinCommandDeps,
): Promise<boolean> {
  const opened = await siblingsOpened(deps.storage, deps.accountId, plan.alreadyProtected.map((node) => node.id), typed);
  const answer = await vscode.window.showWarningMessage(
    opened === 0
      ? `This PIN opens none of the ${plan.alreadyProtected.length} protected entries here. The `
        + `${plan.toProtect.length} you are protecting now will be the first under it, and this folder `
        + 'will hold entries under two different PINs.'
      : `This PIN opens ${opened} of the ${plan.alreadyProtected.length} protected entries in this folder.`,
    { modal: true },
    'Use this PIN',
  );
  return answer === 'Use this PIN';
}

/**
 * The loop, and the mark. One entry or a folder full of them takes the same road.
 *
 * <p>Two things a reviewer was right about. The progress says <b>how far</b>, not only which entry —
 * a wrap costs about a second per slot, so a folder of fifty is minutes during which a name alone
 * cannot tell "working" from "stuck". And a failure on one entry no longer aborts the run with
 * nothing said: the rest are attempted, and the report names what could not be done. Re-running is
 * the repair, because `protectEntity` skips what is already locked.</p>
 */
async function runProtect(nodes: readonly TreeNode[], pin: string, deps: PinCommandDeps): Promise<number> {
  const done: string[] = [];
  const failed: string[] = [];
  const raced: RacedEntry[] = [];
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Protecting with a PIN…' },
    async (progress) => {
      for (const [index, node] of nodes.entries()) {
        const where = `${index + 1} of ${nodes.length} — ${node.name}`;
        await protectOne(node, pin, deps, { done, failed, raced, report: (what) => progress.report({ message: `${where}${what}` }) });
      }
    },
  );
  deps.refresh();
  void vscode.window.showInformationMessage(runReport(done, failed, raced));
  return done.length;
}

/** Where one entry's run reports to: what was done, what failed, what another window protected first, and the progress line. */
interface ProtectRun {
  readonly done: string[];
  readonly failed: string[];
  readonly raced: RacedEntry[];
  /** Appends to the progress line — `''` for the live values, `' (kept versions)'` for the history. */
  readonly report: (what: string) => void;
}

/**
 * One entry, with its failure kept rather than thrown — the rest of the folder still deserves a try.
 *
 * <p>The live values, then the entry's KEPT versions (D10: before 1.12 the history stayed plaintext
 * and opened with no PIN), then the mark — last, as `markProtection` says. The history is only this
 * machine's; every other machine seals its own at the first door there (`historyHeal.ts`).</p>
 *
 * <p><b>Every sealed value must open with THIS run's PIN before anything else is written</b> (review
 * of 2026-09-30). Protect checks for an existing PIN before its two boxes, and another window can
 * protect the same entry under a different PIN while they are open; `protectEntity` then leaves those
 * values as they are, and the run used to seal the history under the new PIN, write the mark, count a
 * second protection decision and report the entry protected with a PIN that opens none of it. Now such
 * an entry is reported as raced — no history sealed, no mark, no epoch — through `opensEverySealed`,
 * which tries the PIN silently: a miss is not a wrong guess.</p>
 */
async function protectOne(node: TreeNode, pin: string, deps: PinCommandDeps, run: ProtectRun): Promise<void> {
  try {
    run.report('');
    const sealed = await protectEntity(deps.storage, deps.accountId, node.id, pin);
    if (!(await opensEverySealed(deps.storage, deps.accountId, node.id, pin))) {
      run.raced.push({ name: node.name, sealedHere: sealed.changed });
      return;
    }
    run.report(' (kept versions)');
    await protectHistory(deps.storage, deps.accountId, node.id, pin);
    await markProtection(node, true, deps);
    run.done.push(node.name);
  } catch {
    // The reason is not shown per entry: a folder of fifty would produce fifty modals. What the
    // person needs is WHICH entries, and that a re-run finishes them.
    run.failed.push(node.name);
  }
}

/**
 * The mark on the node, written AFTER the values it describes.
 *
 * <p>Order matters for the same reason it does inside `protectEntity`: there is no transaction, so
 * something has to be last. A mark written first and then interrupted would hide an entry from
 * every agent surface while its values were still readable — a promise the storage was not keeping.
 * Written last, an interruption leaves the entry visible with values that refuse, which is true.</p>
 */
async function markProtection(node: TreeNode, on: boolean, deps: PinCommandDeps): Promise<void> {
  if (node.details === undefined) {
    return;
  }
  // The mark and one more protection DECISION, in one node write (§5.9, R6): the sync merge settles a
  // concurrent disagreement by the later decision, so the count must never move apart from the mark.
  await deps.storage.updateNodeFields(deps.accountId, node.id, protectionDecision(on));
}

const PIN_FOR_FOLDER =
  'The PIN another entry in this folder already uses. It is stored nowhere, so it has to be typed — '
  + 'and it will be checked against the entries that are already protected before anything is written.';
