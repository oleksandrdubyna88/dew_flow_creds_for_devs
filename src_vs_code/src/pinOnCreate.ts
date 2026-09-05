import * as vscode from 'vscode';
import { StorageManager } from './storageManager';
import { TreeNode } from './types';
import { isProtected, pinOpens, protectEntity } from './entityPin';
import { pinValidator } from './pinInput';
import { entriesUnder } from './pinFolderPlan';

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
 * <p>The one case a stored flag would cover and this does not: a folder somebody ran the command on
 * while it was EMPTY. Nothing was protected, so nothing marks it, and the first entry created there
 * is not asked. Recorded as a deviation in the plan rather than papered over — the alternative is a
 * flag that says "protected" about a folder where nothing is.</p>
 */

/** How the PIN was settled for a new entry, or that it was not. */
export type CreatePin =
  | { readonly kind: 'none' }
  | { readonly kind: 'pin'; readonly pin: string }
  | { readonly kind: 'cancelled' };

/**
 * Ask for the PIN a new entry in this folder must have, if this folder has any protected entries.
 *
 * <p>The typed value is CHECKED against those entries and the count is said, because a folder may
 * legitimately hold entries under two PINs and "it opened at least one" is not something a person
 * can act on.</p>
 */
export async function pinForNewEntry(
  storage: StorageManager,
  accountId: string,
  parentId: string | null,
): Promise<CreatePin> {
  const siblings = await protectedSiblings(storage, accountId, parentId);
  return siblings.length === 0 ? { kind: 'none' } : askAndCheck(siblings, storage, accountId);
}

async function askAndCheck(
  siblings: readonly TreeNode[],
  storage: StorageManager,
  accountId: string,
): Promise<CreatePin> {
  const typed = await vscode.window.showInputBox({
    title: 'This folder’s entries are protected',
    prompt: PROMPT,
    password: true,
    ignoreFocusOut: true,
    validateInput: pinValidator('entering'),
  });
  if (typed === undefined || typed.length === 0) {
    return { kind: 'cancelled' };
  }
  return (await agreed(typed, siblings, storage, accountId)) ? { kind: 'pin', pin: typed } : { kind: 'cancelled' };
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

/** How many of them it opens — said, then agreed to, before an entry is created under it. */
async function agreed(
  typed: string,
  siblings: readonly TreeNode[],
  storage: StorageManager,
  accountId: string,
): Promise<boolean> {
  let opened = 0;
  for (const node of siblings) {
    opened += (await pinOpens(storage, accountId, node.id, typed)) ? 1 : 0;
  }
  const answer = await vscode.window.showWarningMessage(
    opened === 0
      ? `This PIN opens none of the ${siblings.length} protected entries in this folder. The new entry `
        + 'will be the first under it, and the folder will hold entries under two different PINs.'
      : `This PIN opens ${opened} of the ${siblings.length} protected entries in this folder.`,
    { modal: true },
    'Use this PIN',
  );
  return answer === 'Use this PIN';
}

/** Wrap the entry that was just created, and mark it — the same order the commands use. */
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
  // The mark last, for the reason `pinCommands` gives: a mark written first and then interrupted
  // would hide the entry from every agent surface while its values were still readable.
  await storage.updateNode(accountId, {
    ...node,
    details: { ...node.details, pinProtected: true },
  } as TreeNode);
}

const PROMPT =
  'Entries in this folder are protected with a PIN, so this one will be too. Type the PIN the others '
  + 'use — it is stored nowhere, so it has to be typed, and it will be checked against them before '
  + 'anything is written.';
