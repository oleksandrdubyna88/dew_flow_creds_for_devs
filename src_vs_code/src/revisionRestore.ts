import * as vscode from 'vscode';
import { asElement } from './commandTargets';
import { describeError } from './describeError';
import { nodeAt } from './entityViewerCommands';
import { applyEnvBindings } from './envApply';
import { envCollection, showEnvNotice } from './envCollectionRef';
import { lockedSlotCount } from './entityPin';
import { ProtectedMeanwhile } from './entryWriter';
import { corruptReason } from './pinGate';
import { firstPinFor } from './pinOnCreate';
import { entryPinGate } from './pinPrompt';
import { openKeptVersion } from './revisionDoor';
import { MAX_REVISIONS, Revision } from './revisionHistory';
import { RestoreUnder, damagedSlots, holdsValue, restoreVersion } from './restoreVersion';
import { Sealing, WritableSealing, WriterWords, sealingAtWrite } from './sealingAtWrite';
import type { StorageManager } from './storageManager';
import { EntityMetadata } from './types';

/**
 * *Restore This Version…* — a kept version brought back into the SAME entry (entry-PIN plan §5.7,
 * D11). The writes and their order are `restoreVersion.ts`; this is the command a person runs from a
 * history row: the door, the version opened, one modal that says what will happen, and one sentence
 * after.
 *
 * <p>Registered from `pinCommands.registerPinCommands`, so the ratcheted `extension.ts` does not grow.
 * Contributed on every `revision` row, hidden from the palette — it needs a row to act on.</p>
 */

/** What the command needs from the composition root. */
export interface RestoreDeps {
  readonly storage: StorageManager;
  readonly refresh: () => void;
}

/** A kept version the person asked to restore, resolved and opened — or `undefined`, having said why. */
interface Ready {
  readonly accountId: string;
  readonly live: { readonly id: string; readonly name: string; readonly parentId?: string | null; readonly details: EntityMetadata };
  readonly version: Revision;
  /** The live entry held a sealed value at the door. Its PIN is read after the confirmation, never here. */
  readonly locked: boolean;
  /** The live entry held anything at all — marked and holding nothing, it is protected while empty. */
  readonly held: boolean;
}

/** What Restore says when the protection changed while its confirmation was open (`sealingAtWrite.ts`). */
const RESTORE_WORDS: WriterWords = {
  waited: 'this confirmation',
  nothing: 'Nothing was restored.',
  again: 'Run Restore This Version… again.',
  purpose: 'restore it',
};

export async function restoreRevision(target: unknown, deps: RestoreDeps): Promise<void> {
  const ready = await readyToRestore(target, deps.storage);
  if (ready === undefined || !(await agreed(ready, deps.storage))) {
    return;
  }
  const sealing = await sealingAfterConfirmation(ready, deps.storage);
  if (sealing.kind !== 'stopped') {
    await restoreWith(ready, deps, underOf(sealing));
  }
}

/** The PIN for a sealed decision; the plain proof itself for a plain one — never dropped (the E2 security review, finding 2). */
function underOf(sealing: WritableSealing): RestoreUnder {
  return sealing.kind === 'sealed' ? sealing.pin : sealing;
}

/**
 * Rule R3 at write time: the PIN — and whether there is one at all — is read AFTER the confirmation.
 * It was taken before it, so an entry protected while the modal waited was restored in the clear, and
 * one unprotected meanwhile was sealed again without a decision.
 *
 * <p>Into an entry protected while EMPTY, a version that holds a value brings the entry its first
 * values: the person chooses the PIN they go under (`firstPinFor`), after the confirmation and before
 * the first write, and a decline restores nothing (review of 2026-09-30).</p>
 */
function sealingAfterConfirmation(ready: Ready, storage: StorageManager): Promise<Sealing> {
  const gate = entryPinGate(ready.accountId, ready.live.id, ready.live.name);
  const opened = { locked: ready.locked, marked: ready.live.details.pinProtected === true, held: ready.held };
  const first = { adds: holdsValue(ready.version), choose: () => firstPinFor(storage, ready.accountId, ready.live) };
  return sealingAtWrite(storage, gate, opened, RESTORE_WORDS, (reason) => void vscode.window.showWarningMessage(reason), first);
}

/**
 * The writes (`restoreVersion.ts`) — under the PIN, or through the plain writer with the plain proof the
 * decision made, never around it (the E2 security review, finding 2) — and the sentences after them.
 */
async function restoreWith(ready: Ready, deps: RestoreDeps, under: RestoreUnder): Promise<void> {
  const written = await restoreVersion(deps.storage, ready.accountId, ready.live.id, ready.version, under).catch((error: unknown) => {
    void vscode.window.showWarningMessage(stoppedMessage(ready, typeof under === 'string', error));
    return undefined;
  });
  deps.refresh();
  if (written !== undefined) {
    void vscode.window.showInformationMessage(restoredMessage(ready.version));
    // Step 8: the terminal variables the restored entry binds, through the notice every save shows.
    showEnvNotice(await applyEnvBindings(envCollection(), deps.storage, ready.accountId, written, ready.live.details.envBindings));
  }
}

/** Steps 1-2: the row resolved, the live entry's door, no damaged value to overwrite, the version opened. */
async function readyToRestore(target: unknown, storage: StorageManager): Promise<Ready | undefined> {
  const found = await restoreTarget(target, storage);
  if (found === undefined) {
    return undefined;
  }
  const opened = await openKeptVersion(storage, found.accountId, found.live.id, found.version, { door: 'restore this version', version: 'restore it' });
  return opened === undefined ? undefined : checked(storage, { ...found, version: opened });
}

/** Step 1: the row, resolved with `nodeAt` — and the live entry it belongs to, which must still exist. */
async function restoreTarget(target: unknown, storage: StorageManager): Promise<Ready | undefined> {
  const element = await nodeAt(asElement(target), storage);
  return element?.revision === undefined ? undefined : withLive(storage, element.accountId, element.node.id, element.revision);
}

function withLive(storage: StorageManager, accountId: string, id: string, version: Revision): Ready | undefined {
  const live = storage.getNode(accountId, id);
  return live?.details === undefined
    ? undefined
    : { accountId, live: { id, name: live.name, parentId: live.parentId, details: live.details }, version, locked: false, held: false };
}

/** After the door: refuse over a damaged value (R4); note whether the entry is protected — its PIN is fetched at the write. */
async function checked(storage: StorageManager, ready: Ready): Promise<Ready | undefined> {
  const damaged = await damagedSlots(storage, ready.accountId, ready.live.id);
  if (damaged.length > 0) {
    void vscode.window.showWarningMessage(
      `${corruptReason(ready.live.name, `${damaged.join(', ')} will not open.`)} Nothing was restored.`,
    );
    return undefined;
  }
  const count = await lockedSlotCount(storage, ready.accountId, ready.live.id);
  return { ...ready, locked: count.locked > 0, held: count.total > 0 };
}

/** Step 3: one modal that says what happens to today's state, and what drops out of history. */
async function agreed(ready: Ready, storage: StorageManager): Promise<boolean> {
  const kept = await storage.getHistory(ready.accountId, ready.live.id);
  const answer = await vscode.window.showWarningMessage(confirmation(ready.live.name, ready.version, kept), { modal: true }, 'Restore');
  return answer === 'Restore';
}

export function confirmation(name: string, version: Revision, kept: readonly Revision[]): string {
  const oldest = kept.length >= MAX_REVISIONS ? kept[kept.length - 1] : undefined;
  const drops = oldest === undefined ? '' : ` The oldest kept version (${when(oldest)}) drops out of history.`;
  return `Restore "${name}" to the version replaced at ${when(version)}? What it holds now becomes its newest previous version, so this can be undone the same way.${drops}`;
}

function when(revision: Revision): string {
  return new Date(revision.at).toLocaleString();
}

function restoredMessage(version: Revision): string {
  return `"${version.name}" is back to the version replaced at ${when(version)}. Its agent access and code-access key are today's, not that version's.`;
}

/**
 * Interrupted part-way. Every value was prepared — sealed, for a protected entry — before the first
 * write, so what is stored is a mixture of two whole states and never plaintext; running the command
 * again on the same version finishes it.
 */
function stoppedMessage(ready: Ready, sealedRoad: boolean, error: unknown): string {
  if (error instanceof ProtectedMeanwhile) {
    return `Restoring "${ready.live.name}" stopped before anything more was written: ${error.message}`;
  }
  const sealed = sealedRoad ? ' Nothing was stored in the clear.' : '';
  return `Restoring "${ready.live.name}" stopped part-way: ${describeError(error)}.${sealed} Run Restore This Version… on the same version again to finish it.`;
}
