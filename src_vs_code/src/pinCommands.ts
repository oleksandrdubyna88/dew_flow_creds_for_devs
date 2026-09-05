import * as vscode from 'vscode';
import { StorageManager } from './storageManager';
import { TreeNode } from './types';
import { entryPinGate } from './pinPrompt';
import { forgetPin } from './pinSession';
import { isProtected, pinOpens, protectEntity, unprotectEntity } from './entityPin';
import { pinValidator } from './pinInput';
import { describeError } from './describeError';
import { asElement } from './commandTargets';
import { FolderPinPlan, folderPinPlan, protectionSummary, runReport, siblingReport } from './pinFolderPlan';

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
  if (details === undefined || (await isProtected(deps.storage, deps.accountId, node.id))) {
    void vscode.window.showInformationMessage(ALREADY_PROTECTED);
    return;
  }
  const pin = await newPin(details.name);
  if (pin === undefined) {
    return;
  }
  await runProtect([node], pin, deps);
}

/** Take the PIN off one entry, given it. */
export async function unprotectEntry(node: TreeNode, deps: PinCommandDeps): Promise<void> {
  if (node.details === undefined || !(await isProtected(deps.storage, deps.accountId, node.id))) {
    void vscode.window.showInformationMessage(`"${node.name}" is not protected with a PIN.`);
    return;
  }
  const gate = entryPinGate(deps.accountId, node.id, node.name);
  const pin = await gate.ask('Enter this entry’s PIN to remove its protection.', node.name);
  await removeIfTyped(node, pin, deps);
}

function removeIfTyped(node: TreeNode, pin: string | undefined, deps: PinCommandDeps): Promise<void> {
  return pin === undefined || pin.length === 0 ? Promise.resolve() : removeOne(node, pin, deps);
}

async function removeOne(node: TreeNode, pin: string, deps: PinCommandDeps): Promise<void> {
  try {
    await unprotectEntity(deps.storage, deps.accountId, node.id, pin);
  } catch (error) {
    void vscode.window.showWarningMessage(`That PIN does not open "${node.name}". ${describeError(error)}`);
    return;
  }
  await markProtection(node, false, deps);
  forgetPin(deps.accountId, node.id);
  deps.refresh();
  void vscode.window.showInformationMessage(`"${node.name}" is no longer protected with its own PIN.`);
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
    void vscode.window.showInformationMessage(protectionSummary(folder.name, plan));
    return;
  }
  if (!(await agreedToRun(folder.name, plan))) {
    return;
  }
  const pin = await folderPin(folder.name, plan, deps);
  if (pin === undefined) {
    return;
  }
  await runProtect(plan.toProtect, pin, deps);
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
    return newPin(folderName);
  }
  const typed = await vscode.window.showInputBox({
    title: `PIN for the entries in "${folderName}"`,
    prompt: PIN_FOR_FOLDER,
    password: true,
    ignoreFocusOut: true,
    validateInput: pinValidator('entering'),
  });
  return typed === undefined || typed.length === 0 ? undefined : checkedPin(typed, plan, deps);
}

async function checkedPin(
  typed: string,
  plan: FolderPinPlan,
  deps: PinCommandDeps,
): Promise<string | undefined> {
  return (await confirmedAgainstSiblings(typed, plan, deps)) ? typed : undefined;
}

/** How many of the protected siblings this PIN actually opens — said, not assumed. */
async function confirmedAgainstSiblings(
  typed: string,
  plan: FolderPinPlan,
  deps: PinCommandDeps,
): Promise<boolean> {
  let opened = 0;
  for (const node of plan.alreadyProtected) {
    opened += (await pinOpens(deps.storage, deps.accountId, node.id, typed)) ? 1 : 0;
  }
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

/** A NEW pin: typed twice, because there is nothing here to check it against. */
async function newPin(subject: string): Promise<string | undefined> {
  const first = await vscode.window.showInputBox({
    title: `A PIN for "${subject}"`,
    prompt: NEW_PIN,
    password: true,
    ignoreFocusOut: true,
    validateInput: pinValidator('choosing'),
  });
  if (first === undefined || first.length === 0) {
    return undefined;
  }
  const again = await vscode.window.showInputBox({
    title: `A PIN for "${subject}"`,
    prompt: 'Type it once more. There is no way to recover it.',
    password: true,
    ignoreFocusOut: true,
    validateInput: (value) => (value === first ? undefined : 'The two do not match.'),
  });
  return again === first ? first : undefined;
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
async function runProtect(nodes: readonly TreeNode[], pin: string, deps: PinCommandDeps): Promise<void> {
  const done: string[] = [];
  const failed: string[] = [];
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Protecting with a PIN…' },
    async (progress) => {
      for (const [index, node] of nodes.entries()) {
        progress.report({ message: `${index + 1} of ${nodes.length} — ${node.name}` });
        await protectOne(node, pin, deps, done, failed);
      }
    },
  );
  deps.refresh();
  void vscode.window.showInformationMessage(runReport(done, failed));
}

/** One entry, with its failure kept rather than thrown — the rest of the folder still deserves a try. */
async function protectOne(
  node: TreeNode,
  pin: string,
  deps: PinCommandDeps,
  done: string[],
  failed: string[],
): Promise<void> {
  try {
    await protectEntity(deps.storage, deps.accountId, node.id, pin);
    await markProtection(node, true, deps);
    done.push(node.name);
  } catch {
    // The reason is not shown per entry: a folder of fifty would produce fifty modals. What the
    // person needs is WHICH entries, and that a re-run finishes them.
    failed.push(node.name);
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
  const details = node.details;
  if (details === undefined) {
    return;
  }
  await deps.storage.updateNode(deps.accountId, {
    ...node,
    details: { ...details, pinProtected: on ? true : undefined },
  });
}

const ALREADY_PROTECTED =
  'That entry already has its own PIN. Remove the protection first if you want to set a different one.';

const NEW_PIN =
  'This PIN wraps every secret this entry holds. It is stored NOWHERE — not here, not in a backup, '
  + 'not in the sync — so a forgotten PIN means the values are gone. The vault recovery code opens '
  + 'the VAULT; it does not open an entry.';

const PIN_FOR_FOLDER =
  'The PIN another entry in this folder already uses. It is stored nowhere, so it has to be typed — '
  + 'and it will be checked against the entries that are already protected before anything is written.';
