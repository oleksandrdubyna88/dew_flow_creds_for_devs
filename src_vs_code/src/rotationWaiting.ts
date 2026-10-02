import * as vscode from 'vscode';
import { localWallTime } from './requestTime';
import { snapshotForRevision } from './revisionSnapshot';
import { resolveKind } from './entityKind';
import { AT_THE_DOOR, HeldConflict, Release, ReleasedSlot, WaitingValue, dropHeld, releaseHeld, waitingUnder } from './rotationQuarantine';
import type { RotationSlot } from './secretRotation';
import type { StorageManager } from './storageManager';
import type { EntityMetadata } from './types';

/**
 * What the person is told about a rotated value that waited beside its entry, in `vscode`'s words
 * (`todo/PLAN_rotation_quarantine.md` §4.6). The logic is `rotationQuarantine.ts`, which is pure of `vscode`;
 * this is its thin edge — the one place the wording lives, so every surface says the same thing.
 *
 * <p>The person-facing word is <i>waiting</i>, never "quarantine": `idQuarantine.ts` already means
 * something else here, and "waiting" is what the person can act on.</p>
 */

/** The value's name in a sentence. */
export function rotatedWhat(slot: RotationSlot): string {
  return slot === 'password' ? 'password' : 'connection string';
}

/**
 * The sentence a command appends when it released a waiting value itself — *Remove PIN Protection…*: `''`
 * when nothing was waiting, so a message that had nothing to add says nothing more.
 */
export function releasedSentence(release: Release): string {
  return release.released.map((slot) => ` The rotated ${rotatedWhat(slot.slot)} that was waiting is now stored in it.`).join('');
}

/**
 * The tree row's hint (§4.6): *rotated password waiting* in the description, and how to store it in the tooltip.
 * A database entry rotates its connection string; every other kind its password (`secretRotation.slotFor`).
 */
export function waitingHint(details: EntityMetadata | undefined, waiting: boolean): { readonly description: string; readonly tooltip: readonly string[] } {
  if (!waiting) {
    return { description: '', tooltip: [] };
  }
  const what = rotatedWhat(resolveKind(details) === 'db' ? 'dbConnection' : 'password');
  return {
    description: `rotated ${what} waiting`,
    tooltip: ['', `A rotated ${what} is waiting on this machine, outside the entry — open the entry and enter its PIN to store it.`],
  };
}

/**
 * What a permanent deletion would lose, for its confirmation (the owner's answer to the plan's open question 1):
 * `''` when nothing waits under the targets, else one sentence per value. A deletion that arrives by sync deletes
 * it silently, like every other value of the entry.
 */
export async function lostWithDeletion(storage: StorageManager, targets: readonly { readonly accountId: string; readonly id: string }[]): Promise<string> {
  const lost: WaitingValue[] = [];
  for (const target of targets) {
    lost.push(...(await waitingUnder(storage, target.accountId, [target.id]).catch(() => [])));
  }
  return lost.map((value) => ` "${value.entryName}" holds a rotated ${rotatedWhat(value.slot)} that was never stored; deleting it permanently loses the only copy.`).join('');
}

const STORE_ROTATED = 'Store the rotated one';
const KEEP_CURRENT = 'Keep the current one';
const DROP_IT = 'Drop It';

/**
 * After the door let the person in: say what went in, and ask about what could not. A conflict is a QUESTION,
 * asked before the door answers — Edit then opens over whichever value the person chose. Dismissed, the
 * value stays and the next door asks again.
 */
export async function settleRelease(storage: StorageManager, accountId: string, entityId: string, entryName: string, release: Release): Promise<Release> {
  sayReleased(entryName, release.released);
  const forced: ReleasedSlot[] = [];
  for (const conflict of release.conflicts) {
    forced.push(...(await askConflict(storage, { accountId, entityId, entryName }, conflict)));
  }
  // What the door released AND what the person released past a conflict — a click that read its value before
  // the door re-reads from this (`pinClick.clickOpener`; the final security review, fix 2).
  return { released: [...release.released, ...forced], conflicts: release.conflicts.filter((one) => !forced.some((done) => done.slot === one.slot)) };
}

/** The entry a conflict is about. */
interface Entry {
  readonly accountId: string;
  readonly entityId: string;
  readonly entryName: string;
}

function sayReleased(entryName: string, released: readonly ReleasedSlot[]): void {
  for (const slot of released) {
    void vscode.window.showInformationMessage(releasedMessage(entryName, slot));
  }
}

/** *The new password of "X" from 2026-10-01 09:30:00 (UTC+03:00) is now stored, sealed under its PIN.* */
export function releasedMessage(entryName: string, slot: ReleasedSlot): string {
  const how = slot.sealed ? ', sealed under its PIN' : '';
  return `The new ${rotatedWhat(slot.slot)} of "${entryName}" from ${localWallTime(new Date(slot.at))} is now stored${how}.`;
}

/** The person's answer to one conflict — and the slot it released, when it was *Store the rotated one*. */
async function askConflict(storage: StorageManager, entry: Entry, conflict: HeldConflict): Promise<readonly ReleasedSlot[]> {
  const answer = await vscode.window.showWarningMessage(conflictQuestion(entry.entryName, conflict), { modal: true }, STORE_ROTATED, KEEP_CURRENT);
  if (answer === STORE_ROTATED) {
    return storeRotatedAnyway(storage, entry, conflict.slot);
  }
  if (answer === KEEP_CURRENT) {
    await keepCurrent(storage, entry, conflict);
  }
  return [];
}

function conflictQuestion(entryName: string, conflict: HeldConflict): string {
  const what = rotatedWhat(conflict.slot);
  return (
    `A rotated ${what} of "${entryName}" from ${localWallTime(new Date(conflict.at))} is waiting, but the stored ${what} changed after it `
    + `(in another window or by a sync). Which one does the far side accept?`
  );
}

/**
 * *Store the rotated one*: the value it replaces is NOT in history — the rotation recorded the one before it —
 * so a snapshot goes in first, as Restore and Edit do; then the release, past its conflict check.
 */
async function storeRotatedAnyway(storage: StorageManager, entry: Entry, slot: RotationSlot): Promise<readonly ReleasedSlot[]> {
  const details = storage.getNode(entry.accountId, entry.entityId)?.details;
  if (details !== undefined) {
    await storage.recordRevision(entry.accountId, entry.entityId, await snapshotForRevision(storage, entry.accountId, { id: entry.entityId, name: entry.entryName, details }));
  }
  const release = await releaseHeld(storage, entry.accountId, entry.entityId, entry.entryName, AT_THE_DOOR, [slot]);
  sayReleased(entry.entryName, release.released);
  return release.released;
}

/** *Keep the current one*: the rotated value may be the only copy of what the far side accepts — confirmed first. */
async function keepCurrent(storage: StorageManager, entry: Entry, conflict: HeldConflict): Promise<void> {
  const what = rotatedWhat(conflict.slot);
  const confirmed = await vscode.window.showWarningMessage(
    `Drop the rotated ${what} of "${entry.entryName}" from ${localWallTime(new Date(conflict.at))}? `
      + `If the far side accepts it, this is its only copy, and "${entry.entryName}" keeps a ${what} that no longer works.`,
    { modal: true },
    DROP_IT,
  );
  if (confirmed === DROP_IT) {
    await dropHeld(storage, entry.accountId, entry.entityId, conflict.slot, conflict.at);
  }
}
