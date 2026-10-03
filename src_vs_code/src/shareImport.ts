import * as vscode from 'vscode';
import { StorageManager } from './storageManager';
import type { ShareInboxDeps } from './shareInbox';
import { recordOrigin, resolveOrigin } from './shareOrigin';
import { updateInPlace } from './shareUpdateSeal';
import { EntryWriter, writerForNew } from './entryWriter';
import { redactArrivedPayment } from './paymentRedaction';
import { OwnedShare, SharePayload, TreeNode, withOwnId } from './types';

/**
 * Landing an opened share in the recipient's tree — the receiving half of `ShareInbox`, after the
 * sender check, the transit PIN and the open.
 *
 * <p>Moved out of `shareInbox.ts` verbatim (`PLAN_pin_folder_asks_on_accept_and_import.md`, B1): that
 * file sat at 798 of eslint's 800 lines, and both the folder-PIN question on accept and the sibling
 * plan's sending half needed room in it. The inbox keeps the conversation; this module keeps the write.</p>
 */

/** Where the (their address, their id) -> our id map lives in the memento. */
const ORIGINS_KEY = 'credSshManager.shareOrigins';

/**
 * What became of one share: it `landed` in the tree, or it was `left` in *Shared with me* — a dismissed
 * *Update it / Keep both*, a declined PIN. A left share is still pending, and the accept paths say so
 * rather than *Accepted* (B2: a dismissed update used to return normally, and was announced and counted
 * as accepted while it sat in the inbox).
 */
export type ShareLanding = 'landed' | 'left';

/** Import an opened payload into the recipient's tree. */
// Moved as written (A1, then B1 of the PIN-folder plan); the pre-existing complexity is marked, not hidden.
// eslint-disable-next-line complexity, max-lines-per-function
export async function landShare(deps: ShareInboxDeps, share: OwnedShare, payload: SharePayload): Promise<ShareLanding> {
  // Recreate (or reuse by name) the sender's folder chain, if any.
  let parentId: string | null = null;
  for (const seg of payload.folderPath ?? []) {
    const existing: TreeNode | undefined = deps.storage
      .getChildren(share.accountId, parentId)
      .find((n) => n.type === 'folder' && n.name === seg.name);
    if (existing !== undefined) {
      parentId = existing.id;
    } else {
      const folderId = StorageManager.newId();
      await deps.storage.addNode(share.accountId, {
        id: folderId,
        name: seg.name,
        type: 'folder',
        parentId,
        folderType: seg.folderType,
      });
      parentId = folderId;
    }
  }
  // Is this an update of something the SAME sender sent before? The map is ours,
  // keyed by (their address, their id) — a sender can never address an entry they
  // never sent, which is what the fresh-id rule was protecting.
  const origins = deps.state.get<Record<string, string>>(ORIGINS_KEY, {});
  const previousId = resolveOrigin(
    origins,
    share.item.fromEmail,
    payload.node.id,
    (id) => deps.storage.getNode(share.accountId, id) !== undefined,
  );

  let node: TreeNode;
  /** Deferred so every ADDITION lands first — Rule A; see `applyFormSecrets.ts`. */
  let writeNode: () => Promise<void>;
  /** A NEW id's writer asks no folder PIN (§2.7 of the typed-secrets plan); an update's comes from its own decision. */
  let store: EntryWriter;
  if (previousId !== undefined) {
    const existing = deps.storage.getNode(share.accountId, previousId);
    const choice = await vscode.window.showWarningMessage(
      `"${existing?.name}" already came from ${share.item.fromEmail}. Update it in place, or keep both?`,
      { modal: true },
      'Update it',
      'Keep both',
    );
    // In place: the revision first, the recipient's marks kept (#122) — and a PROTECTED entry through
    // its door, its values sealed before they are written (entry-PIN plan, D9; `shareUpdateSeal.ts`).
    const update = choice === 'Update it' ? await updateInPlace(deps.storage, share.accountId, previousId, payload, parentId) : undefined;
    if (choice === undefined || (choice === 'Update it' && update === undefined)) {
      // Dismissed on purpose — or the entry's PIN declined: the human wants to look before deciding.
      // The share must survive that — consuming it here would destroy the only copy of the decision.
      void vscode.window.showInformationMessage(
        'Left in "Shared with me" — accept it again when you have decided.',
      );
      return 'left';
    }
    if (update !== undefined) {
      ({ node, store } = update);
      writeNode = () => deps.storage.updateNode(share.accountId, node);
    } else {
      node = withOwnId({ ...payload.node, id: StorageManager.newId(), parentId, children: undefined });
      store = writerForNew(deps.storage, share.accountId, node.id);
      writeNode = () => deps.storage.addNode(share.accountId, node);
    }
  } else {
    // A fresh local id: a peer must never address (and thus silently overwrite) an entity that
    // already exists in our vault. Through `withOwnId`, like both branches above: the new id has
    // to reach the record INSIDE the node too, or nothing can read what this import writes.
    node = withOwnId({ ...payload.node, id: StorageManager.newId(), parentId, children: undefined });
    store = writerForNew(deps.storage, share.accountId, node.id);
    writeNode = () => deps.storage.addNode(share.accountId, node);
  }
  const { password, privateKey, vpnConfig, dbConnection } = payload.secrets;
  /** A payment record arrived that this build cannot read — decides whether the share is kept. */
  let unreadablePayment = false;
  // Rule A: every ADDITION before the node write. I had this path writing the node first and
  // justified it by the id being fresh — both reviewers blocked that independently, and they were
  // right: a fresh id stops an OVERWRITE, and does nothing about a node that syncs while claiming
  // secrets nobody wrote. `setPassword(undefined)` is a removal, so it waits until after.
  if (password !== undefined) {
    await store.setPassword(share.accountId, node.id, password);
  }
  if (privateKey !== undefined) {
    await store.setPrivateKey(share.accountId, node.id, privateKey);
  }
  if (vpnConfig !== undefined) {
    await store.setVpnConfig(share.accountId, node.id, vpnConfig);
  }
  if (dbConnection !== undefined) {
    await store.setDbConnection(share.accountId, node.id, dbConnection);
  }
  if (payload.secrets.notes !== undefined) {
    await store.setNotes(share.accountId, node.id, payload.secrets.notes);
  }
  if (payload.secrets.totp !== undefined) {
    await store.setTotp(share.accountId, node.id, payload.secrets.totp);
  }
  if (payload.secrets.config !== undefined) {
    await store.setConfigBody(share.accountId, node.id, payload.secrets.config);
  }
  if (payload.secrets.fields !== undefined) {
    await store.setFieldsRaw(share.accountId, node.id, payload.secrets.fields);
  }
  if (payload.secrets.payment !== undefined) {
    // Redacted AGAIN on arrival, through the same function the sender used. This is a trust
    // boundary: everything here was written by somebody else's process, so "a share cannot carry a
    // CVV" has to be true of what ARRIVES and not merely of what we send. One function called at
    // both ends is one opinion applied twice, not two opinions — the shape this repository already
    // uses for sender identity, which is stamped from a verified token and never accepted from the
    // body. Accepted from the S1.3 code review, which overturned the opposite decision.
    const arrived = redactArrivedPayment(payload.secrets.payment);
    await store.setPaymentRaw(share.accountId, node.id, arrived.raw);
    unreadablePayment = arrived.unreadable;
  }
  // THE NODE, after every addition and before the one removal. A crash anywhere above leaves
  // secrets nothing points at — the tolerated torn state — rather than an entry that syncs while
  // claiming values nobody wrote.
  await writeNode();
  await deps.state.update(
    ORIGINS_KEY,
    recordOrigin(origins, share.item.fromEmail, payload.node.id, node.id),
  );
  // The one REMOVAL on this path: an update whose payload carries no password clears the one the
  // entry had, and by here the node no longer claims it.
  //
  // `deletePassword`, not `setPassword(undefined)` — which KEEPS. The comment above was written as
  // if it deleted, and for as long as that was wrong this branch did nothing at all: a sender who
  // removed a password and re-shared as an update left the old credential on the recipient's
  // machine indefinitely. Found by an audit of the write paths; the asymmetry is documented in
  // `storageManager.setPassword` and asserted in `writeOrderPaths.test.ts`.
  if (password === undefined) {
    await deps.storage.deletePassword(share.accountId, node.id);
  }
  if (unreadablePayment) {
    // Reported, never silent. Both reviewers rejected the silent drop independently and were right
    // about the half I had wrong: keeping the ENTRY is justified, being quiet about a dropped card
    // is not. Somebody told the entry arrived would act on it believing it complete, with no way to
    // know a re-send is worth asking for.
    //
    // And the QUEUED COPY IS KEPT, which the first version of this got wrong: it advised checking
    // for an update while `removeOwnShare` had already discarded the only copy, so there was
    // nothing left to accept again after updating. Advice the code makes impossible is worse than
    // no advice. The share stays pending, so accepting it on a newer build is a real option.
    void vscode.window.showWarningMessage(
      `"${node.name}" arrived, but its payment details are in a format this version cannot read, so they were not saved. The rest of the entry is here, and the share is KEPT — check for an update and accept it again.`,
    );
  } else {
    // 'accepted': the recipient took the secret. The other outcome is in shareCommands' decline.
    await deps.sharing.removeOwnShare(share, 'accepted');
  }
  deps.onArrived?.(share.accountId, node.id);
  return 'landed';
}
