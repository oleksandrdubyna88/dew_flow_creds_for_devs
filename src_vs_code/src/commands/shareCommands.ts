/* eslint-disable complexity, max-lines-per-function -- command registrations moved verbatim out of extension.ts
   (roadmap A1 stage 2, 2026-08-28): one function that registers a family of closures, each the size it
   was. The ceilings are a boundary for NEW code here; a handler meets them when it is next touched. */
import { serializePaymentFields } from '../paymentFields';
import { redactPaymentForShare } from '../paymentRedaction';
import { ShareInbox } from '../shareInbox';
import { SharingManager } from '../sharingManager';
import { StorageManager } from '../storageManager';
import { resolveBulkTargets } from '../commandTargets';
import * as vscode from 'vscode';
import { asElement } from '../commandTargets';
import { pickAccount } from '../dialogs';
import { showEntityForm } from '../entityFormPanel';
import { SharePayload } from '../types';
import { serializeFields } from '../entityFields';
export interface ShareCommandsHost {
  readonly register: (command: string, handler: (...args: unknown[]) => unknown) => void;
  readonly shareInbox: ShareInbox;
  readonly sharing: SharingManager;
  readonly storage: StorageManager;
}

export function registerShareCommands(host: ShareCommandsHost): void {
  const { register, shareInbox, sharing, storage } = host;

  register('credSshManager.shareEntity', async (target, selected) => {
    const { targets, skippedNote } = resolveBulkTargets(storage, target, selected);
    if (targets.length === 0) {
      return;
    }
    if (skippedNote !== '') {
      void vscode.window.showWarningMessage(skippedNote);
    }
    await shareInbox.shareNodes(
      targets[0].accountId,
      targets.map((t) => t.node),
    );
  });

  // Author an entity directly FOR someone else — nothing stays local.
  register('credSshManager.createForUser', async (target) => {
    const element = asElement(target);
    let sender =
      element?.kind === 'teamMember' ? storage.getAccount(element.viaAccountId) : undefined;
    if (sender === undefined) {
      sender = await pickAccount(storage, 'Share from which of your profiles?');
    }
    if (sender === undefined) {
      return;
    }
    const preselected = element?.kind === 'teamMember' ? element.member : undefined;
    const recipients = await shareInbox.pickRecipients(sender.accountId, preselected);
    if (recipients === undefined) {
      return;
    }
    const id = StorageManager.newId();
    const result = await showEntityForm({
      mode: 'create',
      entityId: id,
      hasStoredPassword: false,
      hasStoredPrivateKey: false,
      hasStoredAttachment: false,
      hasStoredImage: false,
      hasStoredVpnConfig: false,
      hasStoredDbConnection: false,
      hasStoredTotp: false,
      hasStoredHostKey: false,
      keyCandidates: [],
      // Authoring an entity for somebody else: a dependency on an entry in THIS vault would
      // name an id their vault has never heard of. Same call the key and jump candidates make.
      dependencyFolders: [],
      dependencyColors: {},
      // An entity authored FOR somebody else references nothing in this vault: a jump host id
      // here would name an entity the recipient does not have.
      jumpCandidates: [],
    });
    if (result === undefined) {
      return;
    }
    const pin = await shareInbox.promptSharePin(true);
    if (pin === undefined) {
      return;
    }
    const payload: SharePayload = {
      node: {
        id,
        name: result.details.name,
        type: 'entity',
        parentId: null,
        details: result.details,
        updatedAt: Date.now(),
      },
      secrets: {
        password: result.newPassword,
        privateKey: result.newPrivateKey,
        vpnConfig: result.newVpnConfig,
        dbConnection: result.newDbConnection,
        notes: result.newNotes,
        totp: result.newTotp,
        config: result.newConfigBody,
        fields: serializeFields(result.newFields),
        // THROUGH the redaction, never by symmetry with the line above.
        //
        // This is the SECOND payload builder in the codebase — `shareInbox.buildSharePayload` is the
        // other, and it redacts. An audit found this one simply omitting `payment`, which was safe only
        // by accident: the obvious "fix" is to add `serializePaymentFields(result.newPayment)` here to
        // match its neighbours, and that one line would carry a CVV and a PIN into another person's
        // vault. So the redaction is applied AT the call site, where the mistake would be made.
        payment: redactPaymentForShare(serializePaymentFields(result.newPayment)),
      },
    };
    await shareInbox.deliver(sender.accountId, payload, recipients, pin);
  });

  register('credSshManager.acceptShare', async (target) => {
    const element = asElement(target);
    if (element?.kind !== 'sharedItem') {
      return;
    }
    await shareInbox.acceptOne(element.share);
  });

  register('credSshManager.declineShare', async (target) => {
    const element = asElement(target);
    if (element?.kind !== 'sharedItem') {
      return;
    }
    const confirmed = await vscode.window.showWarningMessage(
      `Decline "${element.share.item.entityName}" from ${element.share.item.fromEmail}? It will be removed without importing.`,
      { modal: true },
      'Decline',
    );
    if (confirmed !== 'Decline') {
      return;
    }
    await sharing.removeOwnShare(element.share);
    void sharing.reload();
  });

  register('credSshManager.acceptAllFromSender', async (target) => {
    const element = asElement(target);
    if (element?.kind !== 'sharedSender') {
      return;
    }
    await shareInbox.acceptMany(sharing.ownShares.filter((s) => s.item.fromEmail === element.email));
  });

  register('credSshManager.acceptAllShares', async () => {
    await shareInbox.acceptMany([...sharing.ownShares]);
  });
}
