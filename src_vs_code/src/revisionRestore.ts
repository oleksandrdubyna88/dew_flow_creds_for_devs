import * as vscode from 'vscode';
import { asElement } from './commandTargets';
import { describeError } from './describeError';
import { nodeAt } from './entityViewerCommands';
import { applyEnvBindings } from './envApply';
import { envCollection, showEnvNotice } from './envCollectionRef';
import { firstLockedStored } from './pinAdmission';
import { corruptReason } from './pinGate';
import { grantedPin } from './pinSession';
import { openKeptVersion } from './revisionDoor';
import { MAX_REVISIONS, Revision } from './revisionHistory';
import { damagedSlots, restoreVersion } from './restoreVersion';
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
  readonly live: { readonly id: string; readonly name: string; readonly details: EntityMetadata };
  readonly version: Revision;
  /** The entry's PIN when it is protected — every restored value is sealed under it. */
  readonly pin: string | undefined;
}

export async function restoreRevision(target: unknown, deps: RestoreDeps): Promise<void> {
  const ready = await readyToRestore(target, deps.storage);
  if (ready === undefined || !(await agreed(ready, deps.storage))) {
    return;
  }
  const written = await restoreVersion(deps.storage, ready.accountId, ready.live.id, ready.version, ready.pin).catch((error: unknown) => {
    void vscode.window.showWarningMessage(stoppedMessage(ready, error));
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
  return live?.details === undefined ? undefined : { accountId, live: { id, name: live.name, details: live.details }, version, pin: undefined };
}

/** After the door: refuse over a damaged value (R4); take the PIN the door left for a protected entry. */
async function checked(storage: StorageManager, ready: Ready): Promise<Ready | undefined> {
  const damaged = await damagedSlots(storage, ready.accountId, ready.live.id);
  if (damaged.length > 0) {
    void vscode.window.showWarningMessage(
      `${corruptReason(ready.live.name, `${damaged.join(', ')} will not open.`)} Nothing was restored.`,
    );
    return undefined;
  }
  const locked = (await firstLockedStored(storage, ready.accountId, ready.live.id)) !== undefined;
  return { ...ready, pin: locked ? grantedPin(ready.accountId, ready.live.id) : undefined };
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
function stoppedMessage(ready: Ready, error: unknown): string {
  const sealed = ready.pin === undefined ? '' : ' Nothing was stored in the clear.';
  return `Restoring "${ready.live.name}" stopped part-way: ${describeError(error)}.${sealed} Run Restore This Version… on the same version again to finish it.`;
}
