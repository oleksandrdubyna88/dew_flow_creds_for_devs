import { sealValue } from './entityPin';
import { keepingMark } from './exportScope';
import { firstLockedStored } from './pinAdmission';
import { admitEntry } from './pinPrompt';
import { grantedPin } from './pinSession';
import { snapshotForRevision } from './revisionSnapshot';
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
 * <p>Its own module because `shareInbox.ts` sits at the 800-line ceiling: the inbox keeps its call
 * site, this keeps the rule.</p>
 */

/** The setters an accepted share writes through — the storage itself, or a writer that seals first. */
export type ShareWriter = Pick<
  StorageManager,
  | 'setPassword'
  | 'setPrivateKey'
  | 'setVpnConfig'
  | 'setDbConnection'
  | 'setNotes'
  | 'setTotp'
  | 'setConfigBody'
  | 'setFieldsRaw'
  | 'setPaymentRaw'
>;

/** What *Update it* writes: the node, and the writer its values go through. */
export interface InPlaceUpdate {
  readonly node: TreeNode;
  readonly store: ShareWriter;
}

/**
 * Update `previousId` in place: through the door when it is protected, then the revision of what it
 * was, then the node rebuilt with the recipient's marks. `undefined` — the person declined the PIN,
 * or it was wrong (said by the door) — updates nothing, and the share stays in the inbox.
 */
export async function updateInPlace(
  storage: StorageManager,
  accountId: string,
  previousId: string,
  payload: SharePayload,
  parentId: string | null,
): Promise<InPlaceUpdate | undefined> {
  const existing = storage.getNode(accountId, previousId);
  const current = existing ?? payload.node;
  const store = await writerFor(storage, accountId, previousId, current.name);
  if (store === undefined) {
    return undefined;
  }
  // Keep its place in the tree and its own id; record what it was first.
  const was = { id: previousId, name: current.name, details: current.details ?? payload.node.details! };
  await storage.recordRevision(accountId, previousId, await snapshotForRevision(storage, accountId, was));
  return { node: rebuilt(payload, existing, previousId, parentId), store };
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

/**
 * The storage itself for an entry that holds no sealed value; for a protected one, the door — and a
 * writer that seals under the PIN the door took. `undefined` when the door stopped it.
 */
async function writerFor(storage: StorageManager, accountId: string, entityId: string, name: string): Promise<ShareWriter | undefined> {
  if ((await firstLockedStored(storage, accountId, entityId)) === undefined) {
    return storage;
  }
  const admitted = await admitEntry(storage, accountId, entityId, name, 'update it');
  const pin = admitted === undefined ? undefined : grantedPin(accountId, entityId);
  return pin === undefined ? undefined : sealingWriter(storage, accountId, pin);
}

/**
 * Every value sealed in memory, then written (R3). `setPassword('')` still means keep; an absent
 * value is handed through as the delete it always was.
 */
export function sealingWriter(storage: StorageManager, accountId: string, pin: string): ShareWriter {
  const seal = (value: string): Promise<string> => sealValue(value, accountId, pin);
  const maybe = async (value: string | undefined): Promise<string | undefined> => (value === undefined ? undefined : seal(value));
  return {
    setPassword: async (a, e, v) => storage.setPassword(a, e, v === undefined || v.length === 0 ? v : await seal(v)),
    setPrivateKey: async (a, e, v) => storage.setPrivateKey(a, e, await seal(v)),
    setVpnConfig: async (a, e, v) => storage.setVpnConfig(a, e, await seal(v)),
    setDbConnection: async (a, e, v) => storage.setDbConnection(a, e, await seal(v)),
    setTotp: async (a, e, v) => storage.setTotp(a, e, await seal(v)),
    setNotes: async (a, e, v) => storage.setNotes(a, e, await maybe(v)),
    setConfigBody: async (a, e, v) => storage.setConfigBody(a, e, await maybe(v)),
    setFieldsRaw: async (a, e, v) => storage.setFieldsRaw(a, e, await maybe(v)),
    setPaymentRaw: async (a, e, v) => storage.setPaymentRaw(a, e, await maybe(v)),
  };
}
