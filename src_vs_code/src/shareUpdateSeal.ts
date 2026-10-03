import { NOTHING_OPENED } from './editPrefill';
import { EntryWriter, writerFor } from './entryWriter';
import { keepingMark } from './exportScope';
import { firstPinFor } from './pinOnCreate';
import { admitEntry } from './pinPrompt';
import { grantedPin } from './pinSession';
import { snapshotForRevision } from './revisionSnapshot';
import { sealedRevision } from './historyPin';
import type { Revision } from './revisionHistory';
import { UpdateDoors, sealingForUpdate } from './sealingAtWrite';
import type { StorageManager } from './storageManager';
import { SharePayload, TreeNode, withOwnId } from './types';

/**
 * A share's *Update it* into an entry that already exists here — and may be protected with its own
 * PIN (entry-PIN plan, D9, rule R3).
 *
 * <p>The update rebuilt the node from the sender's payload, which never carries the recipient's own
 * marks, and wrote the arriving values raw. For an entry the recipient had protected that meant the
 * mark went (the row lost <i>Remove PIN Protection…</i>, agents saw the entry again) and the new
 * values sat in the keychain in the clear. So a protected entry is updated through its DOOR — the
 * person is asked its PIN once, with the purpose "update it" — and every arriving value is sealed
 * under that PIN IN MEMORY before its setter runs (`shareRecipientPin.ts` set the precedent;
 * `entityPin.sealValue` is the one sealing rule). The recipient's marks travel through
 * `exportScope.keepingMark`, one helper for all of them.</p>
 *
 * <p>An entry protected while EMPTY — *Protect with a PIN…* on an entry that holds nothing writes the
 * mark alone — has no sealed slot for the door to open, and until 2026-10-01 the writer asked only the
 * slots: it handed back the storage, and the arriving values landed in the clear under the mark
 * (`PLAN_typed_stored_secrets.md` §2.7). Now the mark is asked too, and such an entry takes the
 * first-PIN road Edit and Restore take (`pinOnCreate.firstPinFor`) before anything is written.</p>
 *
 * <p><b>The decision is a `Sealing`, and the writer comes from it</b> (the typed-secrets plan's T4): the
 * rule above is `sealingAtWrite.sealingForUpdate`, this module hands it the two doors, and the values go
 * through `entryWriter.writerFor` in every case — the storage itself is never handed out as the writer.
 * A `plain` decision is re-checked by that writer under the cross-window lease at its first write, so an
 * entry protected by another window between the decision and the write stores nothing in the clear.</p>
 *
 * <p>Its own module because `shareInbox.ts` sits at the 800-line ceiling: the inbox keeps its call
 * site, this keeps the rule.</p>
 */

/** What *Update it* writes: the node, and the writer its values go through. */
export interface InPlaceUpdate {
  readonly node: TreeNode;
  readonly store: EntryWriter;
}

/**
 * Update `previousId` in place: through the door when it is protected, then the revision of what it
 * was, then the node rebuilt with the recipient's marks. `undefined` — the person declined the PIN,
 * or it was wrong (said by the door) — updates nothing, and the share stays in the inbox.
 *
 * <p>`historyPin`, when given, is the PIN the update makes the entry protected under (its new folder's —
 * `shareImport`): the revision of what it was is sealed under it in memory before it is written.</p>
 */
export async function updateInPlace(
  storage: StorageManager,
  accountId: string,
  previousId: string,
  payload: SharePayload,
  parentId: string | null,
  historyPin?: string,
): Promise<InPlaceUpdate | undefined> {
  const existing = storage.getNode(accountId, previousId);
  const current = existing ?? payload.node;
  const entry = updatedEntry(previousId, current.name, existing, parentId);
  const sealing = await sealingForUpdate(storage, accountId, previousId, carriesSecret(payload), updateDoors(storage, accountId, entry, 'update it'));
  if (sealing.kind === 'stopped') {
    return undefined;
  }
  // Keep its place in the tree and its own id; record what it was first.
  const was = { id: previousId, name: current.name, details: current.details ?? payload.node.details! };
  await storage.recordRevision(accountId, previousId, await keptVersion(storage, accountId, was, historyPin));
  return { node: rebuilt(payload, existing, previousId, parentId), store: writerFor(storage, accountId, previousId, sealing, NOTHING_OPENED) };
}

/** What it was, as a revision — sealed under `historyPin` in memory first when the update protects the entry. */
async function keptVersion(
  storage: StorageManager, accountId: string, was: { id: string; name: string; details: NonNullable<TreeNode['details']> }, historyPin: string | undefined,
): Promise<Revision> {
  const revision = await snapshotForRevision(storage, accountId, was);
  return historyPin === undefined ? revision : sealedRevision(revision, accountId, historyPin);
}

/**
 * The node from the payload, in the recipient's place, with the recipient's marks (#122, D9) — and
 * the recipient's `pinEpoch`, the count of THEIR protection decisions (§5.9). It lives on the node,
 * not in `details`, so `keepingMark` cannot carry it; the payload never carries one either
 * (`sharePayloadBuild` strips the sender's), so it comes from `existing`, beside `createdAt`.
 */
function rebuilt(payload: SharePayload, existing: TreeNode | undefined, previousId: string, parentId: string | null): TreeNode {
  return withOwnId({
    ...payload.node,
    details: keepingMark(payload.node.details, existing),
    id: previousId,
    ...recipientsOwn(existing, parentId),
    children: undefined,
  });
}

/** What the recipient's node keeps whatever the payload says: its place, its age, its decisions. */
function recipientsOwn(existing: TreeNode | undefined, parentId: string | null): Pick<TreeNode, 'parentId' | 'createdAt' | 'pinEpoch'> {
  return existing === undefined
    ? { parentId, createdAt: undefined, pinEpoch: undefined }
    : { parentId: existing.parentId ?? parentId, createdAt: existing.createdAt, pinEpoch: existing.pinEpoch };
}

/** The entry an update writes into, as the recipient's tree has it. */
export interface UpdatedEntry {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null | undefined;
}

/**
 * The entry as THIS machine knows it — its local id, name and folder — read once and handed down, so
 * the first-PIN box checks against the folder it actually sits in rather than a second lookup of it
 * (the 2026-10-01 code round).
 */
function updatedEntry(id: string, name: string, existing: TreeNode | undefined, parentId: string | null): UpdatedEntry {
  return { id, name, parentId: existing?.parentId ?? parentId };
}

/**
 * The two doors `sealingForUpdate` may need: the live door — `admitEntry` with `purpose` ("update it"
 * for a share, "store the new value" for a rotation the person takes over), and the PIN it granted — and
 * the entry's FIRST PIN, chosen the way Edit's first save and Restore ask it (`pinOnCreate.firstPinFor`:
 * typed twice, or checked against the protected entries of its folder, and granted to this window).
 * Each answers `undefined` for a stop, said by the door or a decline.
 */
export function updateDoors(storage: StorageManager, accountId: string, entry: UpdatedEntry, purpose: string): UpdateDoors {
  return {
    door: async () => ((await admitEntry(storage, accountId, entry.id, entry.name, purpose)) === undefined ? undefined : grantedPin(accountId, entry.id)),
    firstPin: () => firstPinFor(storage, accountId, entry),
  };
}

/**
 * Whether the payload stores a value in a slot the entry PIN covers — `FirstSeal.adds`, asked of a share:
 * an update that carries no secret needs no PIN, as a save that stores nothing asks nothing.
 * `setPassword('')` still means keep, so an empty string is no value here either.
 */
function carriesSecret(payload: SharePayload): boolean {
  return Object.values(payload.secrets).some((value) => typeof value === 'string' && value.length > 0);
}
