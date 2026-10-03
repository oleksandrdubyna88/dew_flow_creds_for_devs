import * as vscode from 'vscode';
import { StorageManager } from './storageManager';
import { TreeNode } from './types';
import { isProtected, protectEntity, siblingsOpened } from './entityPin';
import { protectHistory } from './historyPin';
import { protectionDecision } from './syncPinRule';
import { pinValidator } from './pinInput';
import { newPin, refusedWhileCooling } from './pinPrompt';
import { grantPin } from './pinSession';
import { entriesUnder } from './pinFolderPlan';
import type { FolderQuestion } from './arrivalPin';

/**
 * A new entry created inside a folder whose entries are protected.
 *
 * <p>The owner's requirement, in their words: <i>"при создании новой в такой папке — пин
 * обязательное поле"</i>. So the PIN is asked BEFORE the form opens, not after the entry is saved.
 * Asked after, a dismissed box would leave an unprotected entry sitting in a folder whose whole
 * point is that nothing in it is — which is the thing the requirement exists to prevent, and no
 * amount of nagging afterwards fixes it. Asked first, dismissing simply means no entry is
 * created.</p>
 *
 * <p><b>What makes a folder "protected" is DERIVED, not a flag.</b> A folder is protected when at
 * least one entry inside it is — which is exactly the question that matters and cannot drift out of
 * step with the entries the way a stored flag can. It is also self-repairing: unprotect the last
 * entry and the folder stops asking, which is what somebody who just did that means.</p>
 *
 * <p><b>The one case derivation cannot answer</b> is a folder somebody ran the command on while it
 * was EMPTY: no sibling to derive from, so the first entry created there would not be asked. That is
 * what `TreeNode.folderAsksForPin` is for, and the wording is the whole point — it is a PREFERENCE
 * ("entries created here are asked"), never a claim that the folder is protected. A preference
 * cannot drift out of step with the values because it never described them.</p>
 */

/** How the PIN was settled for a new entry, or that it was not. */
export type CreatePin =
  | { readonly kind: 'none' }
  | { readonly kind: 'pin'; readonly pin: string }
  // `typed`: a PIN WAS typed and then not taken — on Add the count it opened was declined, on an agent's
  // create it opened none of the folder's protected entries. Add treats it as any other cancel; an
  // agent's create asks again (`pinForAgentEntry`).
  | { readonly kind: 'cancelled'; readonly typed?: true };

/** A PIN question that was answered: no PIN, or the folder's — what a new entry's writer is made from (`sealingForNew`). */
export type SettledPin = Exclude<CreatePin, { readonly kind: 'cancelled' }>;

/**
 * How a PIN for a new entry is asked.
 *
 * <p>`token`, when given, is handed to every box raised, so a caller with a deadline can close them.
 * `confirm` — true unless said otherwise — asks the person to AGREE to the count a typed PIN opens, in a
 * modal. An agent's create says `false` (D-B, and the code review of 2026-09-30): VS Code cannot close a
 * modal from code, so one raised inside a step with a deadline stays on screen after the step has
 * answered the agent, and its answer is ignored. Without it the count is said in a message that asks
 * nothing, a PIN that opens at least one protected entry is taken, and one that opens none is a miss.</p>
 */
export interface PinAsk {
  readonly token?: vscode.CancellationToken;
  readonly confirm?: boolean;
}

/** How many PINs an agent's create asks for before it gives up (agent-create plan, D-B). */
export const AGENT_PIN_TRIES = 3;

/**
 * The PIN for an entry an AGENT is creating in this folder — asked after the person allowed the
 * creation, by the road Add asks it (`pinForNewEntry`) but with no modal on it (`PinAsk.confirm`), and
 * asked again while a typed PIN opens none of the folder's protected entries, up to `AGENT_PIN_TRIES`.
 * A dismissed box ends it at once: the person chose. The caller bounds the whole wait by its consent
 * step's timeout, and `token` — cancelled when that runs out — closes whichever box is still open then.
 */
export async function pinForAgentEntry(
  storage: StorageManager,
  accountId: string,
  parentId: string | null,
  triesLeft: number = AGENT_PIN_TRIES,
  token?: vscode.CancellationToken,
): Promise<CreatePin> {
  const settled = await pinForNewEntry(storage, accountId, parentId, { token, confirm: false });
  return triesLeft > 1 && typedButDeclined(settled) ? pinForAgentEntry(storage, accountId, parentId, triesLeft - 1, token) : settled;
}

export function typedButDeclined(settled: CreatePin): boolean {
  return settled.kind === 'cancelled' && settled.typed === true;
}

/**
 * Whether a new entry here would be asked for a PIN — the question `pinForNewEntry` answers first,
 * asked on its own so a caller with a deadline can tell "nothing to ask" from "asked, and waiting".
 */
export async function asksForPinOnCreate(storage: StorageManager, accountId: string, parentId: string | null): Promise<boolean> {
  return (await protectedSiblings(storage, accountId, parentId)).length > 0 || folderPrefersPin(storage, accountId, parentId);
}

/**
 * Ask for the PIN a new entry in this folder must have, if this folder has any protected entries.
 *
 * <p>The typed value is CHECKED against those entries and the count is said, because a folder may
 * legitimately hold entries under two PINs and "it opened at least one" is not something a person
 * can act on. `ask` says whether the count is agreed to or only said, and carries the caller's token.</p>
 */
export function pinForNewEntry(
  storage: StorageManager,
  accountId: string,
  parentId: string | null,
  ask: PinAsk = {},
): Promise<CreatePin> {
  // No sibling to check against, but the folder may still have been told to ask — the empty-folder
  // case. There the PIN is typed TWICE, which is the only check available and the same one every
  // other new PIN in this product gets.
  const alone = (): Promise<CreatePin> => (folderPrefersPin(storage, accountId, parentId) ? firstPinHere(ask.token) : Promise.resolve(NONE));
  return pinCheckedAgainstFolder(storage, accountId, parentId, NEW_ENTRY, alone, ask);
}

const NONE: CreatePin = { kind: 'none' };
const NEW_ENTRY = 'The new entry';

/**
 * The question Add asks, as the port an arrival's decision takes (`arrivalPin.FolderQuestion`): bound
 * here, where `vscode` is, so `arrivalPin.ts` stays free of it (the plan round's finding 5).
 */
export function folderQuestion(storage: StorageManager): FolderQuestion {
  return {
    ask: (accountId, folderId) => pinForNewEntry(storage, accountId, folderId),
    prefers: (accountId, folderId) => folderPrefersPin(storage, accountId, folderId),
  };
}

/**
 * The PIN an entry with nothing sealed yet goes under, in a folder that may hold protected entries:
 * typed once and CHECKED against them when there are any — the count said and agreed to — or `alone()`
 * when there are none. `entry` is how the agreement names the entry being sealed.
 *
 * <p>One road for the two entries that have no PIN of their own to check a typed one against: a new
 * entry created here, and an entry protected while it was EMPTY receiving its first value
 * (`firstPinFor`).</p>
 */
async function pinCheckedAgainstFolder(
  storage: StorageManager,
  accountId: string,
  parentId: string | null,
  entry: string,
  alone: () => Promise<CreatePin>,
  ask: PinAsk = {},
): Promise<CreatePin> {
  const siblings = await protectedSiblings(storage, accountId, parentId);
  if (siblings.length === 0) {
    return alone();
  }
  return refusedWhileCooling(accountId, siblings) ? { kind: 'cancelled' } : askAndCheck(siblings, storage, accountId, entry, ask);
}

/**
 * The FIRST PIN of an entry protected while it held nothing (review of 2026-09-30): *Protect with a
 * PIN…* on an empty entry has nothing to seal and writes the mark alone, so the PIN typed there is
 * stored nowhere and nothing can check it. When a value is first saved into the entry, the person
 * chooses the PIN it is sealed under — checked against the protected entries of its folder when it
 * has any, typed twice when it has none — and the PIN is granted to this window like any PIN that
 * opened the entry. `undefined` is a decline, a mismatch, or a sibling check not agreed to.
 */
export async function firstPinFor(
  storage: StorageManager,
  accountId: string,
  entry: { readonly id: string; readonly name: string; readonly parentId?: string | null },
): Promise<string | undefined> {
  const settled = await pinCheckedAgainstFolder(storage, accountId, entry.parentId ?? null, `"${entry.name}"`, () => typedTwice(entry.name));
  if (settled.kind !== 'pin') {
    return undefined;
  }
  grantPin(accountId, entry.id, settled.pin);
  return settled.pin;
}

async function typedTwice(name: string): Promise<CreatePin> {
  const typed = await newPin(name, 'entry', FIRST_VALUE);
  return typed === undefined ? { kind: 'cancelled' } : { kind: 'pin', pin: typed };
}

/**
 * Does this folder, or any folder above it, carry the preference? Exported for an arrival
 * (`arrivalPin.ts`): a share or an import that CREATES folders lands in folders that are empty, where
 * only the preference can ask (`PLAN_pin_folder_asks_on_accept_and_import.md` §3.1, §9.1).
 */
export function folderPrefersPin(storage: StorageManager, accountId: string, parentId: string | null): boolean {
  // By ID, one ancestor at a time. Building a Map of every node in the account to walk a handful of
  // them made an Add cost O(everything stored) — and `getNode` is already indexed. (A reviewer's
  // finding, three times over.)
  //
  // The walk ends at the ROOT or at a folder it has already seen — never at a fixed depth. A cap
  // was the first shape of this, and a reviewer found its false negative: nothing limits how deep a
  // drag may nest a folder, so a chain longer than the cap would stop one folder short of the one
  // carrying the preference, and the entry would be created with no PIN and no question asked —
  // silently, which is the part that matters. The `Set` gives what the cap was actually for, a
  // parent chain that LOOPS, without inventing a depth nobody can justify.
  const seen = new Set<string>();
  let current = folderAt(parentId, storage, accountId);
  while (current !== undefined && !seen.has(current.id)) {
    if (current.folderAsksForPin === true) {
      return true;
    }
    seen.add(current.id);
    current = above(current, storage, accountId);
  }
  return false;
}

/** Where the walk starts: the parent folder, or nothing at the root. */
function folderAt(
  parentId: string | null,
  storage: StorageManager,
  accountId: string,
): TreeNode | undefined {
  return parentId === null ? undefined : storage.getNode(accountId, parentId);
}

/** The folder above this one, or nothing — at the root, and when sync left a chain pointing nowhere. */
function above(node: TreeNode, storage: StorageManager, accountId: string): TreeNode | undefined {
  return node.parentId === null || node.parentId === undefined
    ? undefined
    : storage.getNode(accountId, node.parentId);
}

/** The first PIN in a folder that asks: typed twice, because there is nothing here to check it against. */
async function firstPinHere(token?: vscode.CancellationToken): Promise<CreatePin> {
  const typed = await newPin('this entry', 'entry', FIRST_HERE, token);
  return typed === undefined ? { kind: 'cancelled' } : { kind: 'pin', pin: typed };
}

async function askAndCheck(
  siblings: readonly TreeNode[],
  storage: StorageManager,
  accountId: string,
  entry: string,
  ask: PinAsk,
): Promise<CreatePin> {
  const typed = await vscode.window.showInputBox({
    title: 'This folder’s entries are protected',
    prompt: PROMPT,
    password: true,
    ignoreFocusOut: true,
    // The entry scope (issue #55): this PIN is checked against SIBLINGS, never against the vault's floor.
    validateInput: pinValidator('entering', 'entry'),
  }, ask.token);
  if (typed === undefined || typed.length === 0) {
    return { kind: 'cancelled' };
  }
  const opened = await siblingsOpened(storage, accountId, siblings.map((node) => node.id), typed);
  return (await countTaken(opened, siblings.length, entry, ask)) ? { kind: 'pin', pin: typed } : { kind: 'cancelled', typed: true };
}

/** Whether the count a typed PIN opens is taken: agreed to in a modal (Add), or only said (`PinAsk.confirm`). */
function countTaken(opened: number, of: number, entry: string, ask: PinAsk): Promise<boolean> {
  return ask.confirm === false ? Promise.resolve(saidCount(opened, of)) : agreedCount(opened, of, entry);
}

/**
 * The protected entries under this folder, at any depth — read from the VALUES, not the mirror.
 *
 * <p>`pinProtected` is the synchronous mirror the agent surfaces need, and it fails closed for them:
 * a mark missing after a crash leaves an entry listed where its values still refuse. Here the same
 * staleness fails the other way — a folder whose mark was lost would stop asking, and the next entry
 * created in it would be stored in the clear inside a folder whose whole point is that nothing is.
 * This runs once, when a person clicks Add, so it can afford the real answer.</p>
 */
async function protectedSiblings(
  storage: StorageManager,
  accountId: string,
  parentId: string | null,
): Promise<readonly TreeNode[]> {
  if (parentId === null) {
    return [];
  }
  const found: TreeNode[] = [];
  for (const node of entriesUnder(storage.getNodes(accountId), parentId)) {
    if (await isProtected(storage, accountId, node.id)) {
      found.push(node);
    }
  }
  return found;
}

/** How many of them it opens — said, then agreed to in a modal, before an entry is created under it (Add). */
async function agreedCount(opened: number, of: number, entry: string): Promise<boolean> {
  const answer = await vscode.window.showWarningMessage(
    opened === 0
      ? `${OPENS_NONE(of)} ${entry} will be the first under it, and the folder will hold entries under two different PINs.`
      : OPENS(opened, of),
    { modal: true },
    'Use this PIN',
  );
  return answer === 'Use this PIN';
}

/**
 * How many of them it opens — said in a message that asks nothing, and never awaited: a non-modal
 * message resolves only when it is closed. A PIN that opens at least one is taken; one that opens none
 * is a miss, which the agent's create asks again (`PinAsk.confirm`).
 */
function saidCount(opened: number, of: number): boolean {
  if (opened === 0) {
    void vscode.window.showWarningMessage(`${OPENS_NONE(of)} Type the PIN they use.`);
    return false;
  }
  void vscode.window.showInformationMessage(`${OPENS(opened, of)} The new entry will be sealed under it.`);
  return true;
}

const OPENS = (opened: number, of: number): string => `This PIN opens ${opened} of the ${of} protected entries in this folder.`;
const OPENS_NONE = (of: number): string => `This PIN opens none of the ${of} protected entries in this folder.`;

/**
 * Wrap the entry that was just created, and mark it — the same order the commands use.
 *
 * <p>A NEW entry's additions go through `entryWriter.writerFor` with `sealingAtWrite.sealingForNew(settled)`
 * — the plain writer when the folder asked for no PIN, the sealing writer over `NOTHING_OPENED` when it
 * did — so every value is sealed in memory BEFORE `runCreate` writes anything (rule R3) and the keychain
 * never sees a value of such an entry in the clear, not even between its first write and the mark. One
 * road for both creates, the person's Add and the agent's: Add wrote through the storage and sealed
 * afterwards with this function, "because it wraps what is THERE", until a process killed between the two
 * was found to leave the values plain under a node that claimed nothing (`PLAN_typed_stored_secrets.md`
 * §2.7, fixed 2026-10-01; it was `writerForNewEntry` here until T4). This still runs after either: with
 * nothing left plain it is the idempotent sweep, the history and the mark.</p>
 */
export async function applyCreatePin(
  settled: CreatePin,
  storage: StorageManager,
  accountId: string,
  entityId: string,
): Promise<void> {
  if (settled.kind !== 'pin') {
    return;
  }
  const node = storage.getNode(accountId, entityId);
  if (node === undefined) {
    return;
  }
  await protectEntity(storage, accountId, entityId, settled.pin);
  // A new entry keeps no versions yet, so today this seals nothing; it runs anyway, so creating with
  // a PIN and Protect take the same road and cannot come to disagree about the history.
  await protectHistory(storage, accountId, entityId, settled.pin);
  // The mark last, for the reason `pinCommands` gives: a mark written first and then interrupted
  // would hide the entry from every agent surface while its values were still readable.
  // And it is a protection decision like Protect's — the mark and `pinEpoch` + 1 in one write (§5.9).
  await storage.updateNodeFields(accountId, node.id, protectionDecision(true));
}

const PROMPT =
  'Entries in this folder are protected with a PIN, so this one will be too. Type the PIN the others '
  + 'use — it is stored nowhere, so it has to be typed, and it will be checked against them before '
  + 'anything is written.';

const FIRST_VALUE =
  'This entry was protected with a PIN while it held nothing, so nothing has checked that PIN yet — the '
  + 'value you are saving is the first it will seal. Type the PIN it goes under: it is stored nowhere, so it '
  + 'is typed twice.';

const FIRST_HERE =
  'This folder asks for a PIN on every entry created in it, and nothing here is protected yet — so '
  + 'this one is the first, and its PIN is yours to choose. It is stored nowhere, so type it twice.';
