import * as vscode from 'vscode';
import { StorageManager } from './storageManager';
import type { ShareInboxDeps } from './shareInbox';
import { recordOrigin, resolveOrigin } from './shareOrigin';
import { updateInPlace } from './shareUpdateSeal';
import { EntryWriter, writerForNew } from './entryWriter';
import { redactArrivedPayment } from './paymentRedaction';
import { declinedMessage, forThisRecipient } from './shareRecipientPin';
import { describeError } from './describeError';
import { ArrivalPins, Landing, declinedLanding, landingOf } from './arrivalPin';
import { CreatePin, applyCreatePin } from './pinOnCreate';
import { OwnedShare, SharePayload, TreeNode, withOwnId } from './types';

/**
 * Landing an opened share in the recipient's tree — the receiving half of `ShareInbox`, after the
 * sender check, the transit PIN and the open.
 *
 * <p>Moved out of `shareInbox.ts` verbatim (`PLAN_pin_folder_asks_on_accept_and_import.md`, B1): that
 * file sat at 798 of eslint's 800 lines, and both the folder-PIN question on accept and the sibling
 * plan's sending half needed room in it. The inbox keeps the conversation; this module keeps the write.</p>
 *
 * <p><b>A folder that asks for a PIN asks it here too</b> (B3). A folder share lands where its chain
 * names — reusing a folder of the same name — and when that folder's entries are protected, the share
 * is asked the question Add asks there (`arrivalPin.ts`), BEFORE anything is written: the values go
 * through the sealing writer under the folder's PIN (rule R3, never in the clear, not even for a moment),
 * the node follows, and `applyCreatePin` writes the mark and the first `pinEpoch` last — the road Add and
 * an agent's create take. Declined, nothing is written: no value, no node, no folder of the chain. One
 * share carries ONE chain, so it is one landing and one decision — written whole or not at all.</p>
 *
 * <p><b>The sender's protection and the folder's ask are ONE question</b> (B5). A share its sender had
 * protected carries `pinAskOnImport`, and the recipient is offered a PIN of their own for it
 * (`shareRecipientPin.ts`). Into a folder that asks, the folder's PIN already seals it — so that own-PIN box
 * is asked only where the folder settled no PIN, and the instruction is otherwise spent on the node. Asked
 * both, the entry ended up sealed under a PIN none of the folder's protected entries use, with nobody told.
 * A share that is an update candidate asks its own PIN only after *Update it* — never for a share the
 * person then dismisses.</p>
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

/** One arrival, decided and not yet written: the node, the writer its values go through, the PIN to mark. */
interface Arrival {
  /** The payload as it ARRIVES — the recipient's own wrap applied, or the spent instruction. */
  readonly payload: SharePayload;
  readonly node: TreeNode;
  readonly store: EntryWriter;
  /** Deferred so every ADDITION lands first — Rule A; see `applyFormSecrets.ts`. */
  readonly writeNode: () => Promise<void>;
  readonly settled: CreatePin;
}

const NO_PIN: CreatePin = { kind: 'none' };

/** Land an opened payload in the recipient's tree — or leave it in the inbox, said why. */
export async function landShare(deps: ShareInboxDeps, share: OwnedShare, payload: SharePayload, pins: ArrivalPins): Promise<ShareLanding> {
  // Where the sender's folder chain lands — read, nothing written yet.
  const landing = landingOf(deps.storage, share.accountId, null, payload.folderPath ?? []);
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
  const arrival = previousId === undefined
    ? await newArrival(deps, share, payload, landing, pins)
    : await originArrival(deps, share, payload, landing, pins, previousId);
  if (arrival === undefined) {
    return 'left';
  }
  const unreadablePayment = await writeArrival(deps, share, arrival);
  await deps.state.update(ORIGINS_KEY, recordOrigin(origins, share.item.fromEmail, payload.node.id, arrival.node.id));
  await settleShare(deps, share, arrival.payload, arrival.node, unreadablePayment);
  return 'landed';
}

/**
 * A share the same sender sent before: *Update it* in place, *Keep both* as a new entry, or dismissed.
 *
 * <p>In place: the revision first, the recipient's marks kept (#122) — and a PROTECTED entry through its
 * door, its values sealed before they are written (entry-PIN plan, D9; `shareUpdateSeal.ts`). An update
 * writes an EXISTING id, so no folder PIN is asked for it (`sealingForUpdate` owns that).</p>
 */
async function originArrival(
  deps: ShareInboxDeps, share: OwnedShare, payload: SharePayload, landing: Landing, pins: ArrivalPins, previousId: string,
): Promise<Arrival | undefined> {
  const choice = await updateOrKeep(deps.storage, share, previousId);
  if (choice === 'Keep both') {
    return newArrival(deps, share, payload, landing, pins);
  }
  const update = choice === 'Update it' ? await updatedInPlace(deps, share, payload, landing, pins, previousId) : DISMISSED;
  if (update === DISMISSED) {
    // Dismissed on purpose — or the entry's PIN declined: the human wants to look before deciding.
    // The share must survive that — consuming it here would destroy the only copy of the decision.
    void vscode.window.showInformationMessage('Left in "Shared with me" — accept it again when you have decided.');
    return undefined;
  }
  return update;
}

const DISMISSED = 'dismissed';

/**
 * *Update it*: the recipient's own PIN first when the sender had the entry protected — after the question,
 * not before it — then the update through the entry's door. `undefined` when the own PIN was declined (said
 * by `sealedForRecipient`), `dismissed` when the entry's door was.
 */
async function updatedInPlace(
  deps: ShareInboxDeps, share: OwnedShare, payload: SharePayload, landing: Landing, pins: ArrivalPins, previousId: string,
): Promise<Arrival | undefined | typeof DISMISSED> {
  const arriving = await sealedForRecipient(share, payload);
  if (arriving === undefined) {
    return undefined;
  }
  const update = await updateInPlace(deps.storage, share.accountId, previousId, arriving, await writeChain(deps.storage, landing, pins));
  return update === undefined
    ? DISMISSED
    : { payload: arriving, node: update.node, store: update.store, writeNode: () => deps.storage.updateNode(share.accountId, update.node), settled: NO_PIN };
}

/** The question a share from the same sender asks first — in a modal, which a dismissal answers `undefined`. */
function updateOrKeep(storage: StorageManager, share: OwnedShare, previousId: string): Thenable<string | undefined> {
  const existing = storage.getNode(share.accountId, previousId);
  return vscode.window.showWarningMessage(
    `"${existing?.name}" already came from ${share.item.fromEmail}. Update it in place, or keep both?`,
    { modal: true },
    'Update it',
    'Keep both',
  );
}

/**
 * A NEW local id — no origin, or *Keep both* — landing where the chain says, after the folder's question.
 *
 * <p>A fresh local id: a peer must never address (and thus silently overwrite) an entity that already
 * exists in our vault. Through `withOwnId`: the new id has to reach the record INSIDE the node too, or
 * nothing can read what this import writes.</p>
 */
async function newArrival(
  deps: ShareInboxDeps, share: OwnedShare, payload: SharePayload, landing: Landing, pins: ArrivalPins,
): Promise<Arrival | undefined> {
  const settled = await pins.settledFor(landing);
  if (settled.kind === 'cancelled') {
    void vscode.window.showInformationMessage(`Left in "Shared with me" — ${declinedLanding(folderName(deps.storage, landing))}.`);
    return undefined;
  }
  // The folder's PIN answers the sender's instruction; only a folder that asks nothing leaves it to the recipient's own.
  const arriving = settled.kind === 'pin' ? spentInstruction(payload) : await sealedForRecipient(share, payload);
  if (arriving === undefined) {
    return undefined;
  }
  const parentId = await writeChain(deps.storage, landing, pins);
  const node = withOwnId({ ...arriving.node, id: StorageManager.newId(), parentId, children: undefined });
  return {
    payload: arriving,
    node,
    store: writerForNew(deps.storage, share.accountId, node.id, settled),
    writeNode: () => deps.storage.addNode(share.accountId, node),
    settled,
  };
}

/**
 * The payload with `pinAskOnImport` SPENT, as `wrappedPayload` spends it: the folder's PIN has acted on the
 * instruction, and the mark `applyCreatePin` writes is what the entry carries from here.
 */
function spentInstruction(payload: SharePayload): SharePayload {
  const details = payload.node.details;
  return details?.pinAskOnImport === true ? { ...payload, node: { ...payload.node, details: { ...details, pinAskOnImport: undefined } } } : payload;
}

/**
 * The payload as it should ARRIVE in a folder that asks nothing — or nothing, with the person already told why.
 *
 * <p>The sender had this protected, so the recipient is offered one of their own — BEFORE the import, and
 * the values are wrapped in memory rather than written and wrapped afterwards (three reviewers: written
 * first, a crash between the two steps leaves an unprotected copy on disk). Its own step because there are
 * TWO ways to get nothing and they are different facts. A decline is a decision, and the message says how
 * to change it. A wrap that FAILED is a machine problem, and its reason has to reach the person. Either way
 * nothing is written: the wrap builds a payload or rejects, and the payload is what the landing takes.</p>
 */
async function sealedForRecipient(share: OwnedShare, payload: SharePayload): Promise<SharePayload | undefined> {
  try {
    const arriving = await forThisRecipient(payload, share.accountId, share.item.fromEmail);
    if (arriving !== undefined) {
      return arriving;
    }
    void vscode.window.showInformationMessage(declinedMessage(share.item.entityName));
  } catch (error) {
    void vscode.window.showErrorMessage(
      `"${share.item.entityName}" was NOT imported — protecting it with your PIN failed: ${describeError(error)}`,
    );
  }
  return undefined;
}

/** The name of the folder a landing is asked in — what a declined landing names. */
function folderName(storage: StorageManager, landing: Landing): string {
  return landing.existing === null ? '' : (storage.getNode(landing.accountId, landing.existing)?.name ?? '');
}

/**
 * The folders the landing creates below the deepest one that exists — written only once its decision is
 * taken, so a declined arrival leaves no folder shell. Answers the folder the entry goes into. The folders
 * are recorded with the memo, so a later share of the same command landing inside them is not asked again.
 */
async function writeChain(storage: StorageManager, landing: Landing, pins: ArrivalPins): Promise<string | null> {
  let parentId = landing.existing;
  const made: string[] = [];
  for (const seg of landing.creates) {
    const folderId = StorageManager.newId();
    await storage.addNode(landing.accountId, { id: folderId, name: seg.name, type: 'folder', parentId, folderType: seg.folderType });
    made.push(folderId);
    parentId = folderId;
  }
  pins.created(landing, made);
  return parentId;
}

/**
 * The values, the node, and the mark — in that order.
 *
 * <p>Rule A: every ADDITION before the node write. I had this path writing the node first and justified it
 * by the id being fresh — both reviewers blocked that independently, and they were right: a fresh id stops an
 * OVERWRITE, and does nothing about a node that syncs while claiming secrets nobody wrote.
 * `setPassword(undefined)` is a removal, so it waits until after. THE NODE, after every addition and before
 * the one removal: a crash anywhere above leaves secrets nothing points at — the tolerated torn state —
 * rather than an entry that syncs while claiming values nobody wrote. The mark after the node, last, as Add
 * writes it (`applyCreatePin`: the idempotent sweep, the history, the mark and the first `pinEpoch`).
 * Answers whether a payment record arrived that this build cannot read — which decides whether the share is kept.</p>
 */
async function writeArrival(deps: ShareInboxDeps, share: OwnedShare, arrival: Arrival): Promise<boolean> {
  const unreadablePayment = await writeSecrets(arrival.store, share.accountId, arrival.node.id, arrival.payload.secrets);
  await arrival.writeNode();
  await applyCreatePin(arrival.settled, deps.storage, share.accountId, arrival.node.id);
  return unreadablePayment;
}

/** Every arriving value but the payment record, in the order they were always written. */
async function writeSecrets(store: EntryWriter, accountId: string, id: string, secrets: SharePayload['secrets']): Promise<boolean> {
  const writes: ReadonlyArray<readonly [string | undefined, (value: string) => Promise<void>]> = [
    [secrets.password, (v) => store.setPassword(accountId, id, v)],
    [secrets.privateKey, (v) => store.setPrivateKey(accountId, id, v)],
    [secrets.vpnConfig, (v) => store.setVpnConfig(accountId, id, v)],
    [secrets.dbConnection, (v) => store.setDbConnection(accountId, id, v)],
    [secrets.notes, (v) => store.setNotes(accountId, id, v)],
    [secrets.totp, (v) => store.setTotp(accountId, id, v)],
    [secrets.config, (v) => store.setConfigBody(accountId, id, v)],
    [secrets.fields, (v) => store.setFieldsRaw(accountId, id, v)],
  ];
  for (const [value, write] of writes) {
    if (value !== undefined) {
      await write(value);
    }
  }
  return writePayment(store, accountId, id, secrets.payment);
}

/**
 * The payment record, redacted AGAIN on arrival, through the same function the sender used. This is a trust
 * boundary: everything here was written by somebody else's process, so "a share cannot carry a CVV" has to be
 * true of what ARRIVES and not merely of what we send. One function called at both ends is one opinion
 * applied twice, not two opinions — the shape this repository already uses for sender identity, which is
 * stamped from a verified token and never accepted from the body. Accepted from the S1.3 code review, which
 * overturned the opposite decision. Answers whether the record arrived in a format this build cannot read.
 */
async function writePayment(store: EntryWriter, accountId: string, id: string, payment: string | undefined): Promise<boolean> {
  if (payment === undefined) {
    return false;
  }
  const arrived = redactArrivedPayment(payment);
  await store.setPaymentRaw(accountId, id, arrived.raw);
  return arrived.unreadable;
}

/**
 * After the node: the one removal, then the share consumed — or KEPT, said, when its payment record could
 * not be read.
 *
 * <p>The one REMOVAL on this path: an update whose payload carries no password clears the one the entry had,
 * and by here the node no longer claims it. `deletePassword`, not `setPassword(undefined)` — which KEEPS. The
 * comment above was written as if it deleted, and for as long as that was wrong this branch did nothing at
 * all: a sender who removed a password and re-shared as an update left the old credential on the recipient's
 * machine indefinitely. Found by an audit of the write paths; the asymmetry is documented in
 * `storageManager.setPassword` and asserted in `writeOrderPaths.test.ts`.</p>
 */
async function settleShare(deps: ShareInboxDeps, share: OwnedShare, payload: SharePayload, node: TreeNode, unreadablePayment: boolean): Promise<void> {
  if (payload.secrets.password === undefined) {
    await deps.storage.deletePassword(share.accountId, node.id);
  }
  if (unreadablePayment) {
    // Reported, never silent. Both reviewers rejected the silent drop independently and were right about the
    // half I had wrong: keeping the ENTRY is justified, being quiet about a dropped card is not. And the
    // QUEUED COPY IS KEPT: advice to check for an update is only real while there is a share left to accept
    // again after updating.
    void vscode.window.showWarningMessage(
      `"${node.name}" arrived, but its payment details are in a format this version cannot read, so they were not saved. The rest of the entry is here, and the share is KEPT — check for an update and accept it again.`,
    );
  } else {
    // 'accepted': the recipient took the secret. The other outcome is in shareCommands' decline.
    await deps.sharing.removeOwnShare(share, 'accepted');
  }
  deps.onArrived?.(share.accountId, node.id);
}
