import { describeError } from './describeError';
import * as vscode from 'vscode';
import { BackupError } from './cryptoUtils';
import { StorageManager } from './storageManager';
import type { SharingManager } from './sharingManager';
import { nasPathFor } from './nasPaths';
import { isServerLocation } from './vaultTransport';
import { describeSender } from './shareSender';
import { judgeSender, pinSenderKey, pinnedKey, verdictBlocksAccept } from './senderPinning';
import { keyFingerprint } from './shareSignature';
import {
  openShare,
  resolveShares,
  sealShare,
  shareTranscript,
  shareableDetails, shareLabelTrusted } from './shareFormat';
import { recordOrigin, resolveOrigin } from './shareOrigin';
import { snapshotForRevision } from './revisionSnapshot';
import { pinValidator } from './pinInput';
import { redactArrivedPayment, redactPaymentForShare, withheldFromShare } from './paymentRedaction';
import { OwnedShare, SharePayload, TeamMember, TreeNode } from './types';

/**
 * Sharing, as one object: sealing and delivering shares to teammates, and receiving
 * theirs — the sender check, the PIN round-robin, the import into the tree.
 *
 * <p>Extracted from `activate()` (audit 2026-08-25, A1), where it lived as ~500 lines of
 * closures beside a 136-line `SharingManager`. The manager stays what it was — the data
 * source for team lists and the share inbox files; this class is the CONVERSATION: every
 * prompt, warning and decision between "share this" / "accept this" and the storage write.
 * Dependencies are explicit constructor state, after the `SyncManager` pattern, so the
 * behaviour is testable with fakes under `node:test`.</p>
 */

/** Where the (their address, their id) -> our id map lives in the memento. */
const ORIGINS_KEY = 'credSshManager.shareOrigins';

export interface ShareInboxDeps {
  readonly storage: StorageManager;
  readonly sharing: SharingManager;
  /** The extension's globalState: share origins and pinned sender keys live here. */
  readonly state: vscode.Memento;
  /** Called with each accepted entry's LOCAL id, so the tree can reveal and tint it (T13). */
  readonly onArrived?: (accountId: string, entityId: string) => void;
  /** Called after an accepted share changed the tree, so caches refresh and sync runs. */
  readonly onMutated: () => void;
  /** This build's version — legacy (unbound) shares stop opening at `LEGACY_SHARES_UNTIL`. */
  readonly extensionVersion?: string;
}

export class ShareInbox {
  constructor(private readonly deps: ShareInboxDeps) {}

  /** Ask for the one-time share PIN; `confirm` adds the repeat prompt used when sealing. */
  async promptSharePin(confirm: boolean): Promise<string | undefined> {
    const pin = await vscode.window.showInputBox({
      title: 'One-time share PIN',
      prompt: 'Encrypts the shared item. Tell it to the recipient out-of-band.',
      password: true,
      ignoreFocusOut: true,
      // Advice only while CHOOSING (sealing a new share) — accepting types it back.
      validateInput: pinValidator(confirm ? 'choosing' : 'entering'),
    });
    if (pin === undefined || !confirm) {
      return pin;
    }
    return this.confirmSharePin(pin);
  }

  /** The repeat prompt: the same PIN typed twice, or nothing. */
  private async confirmSharePin(pin: string): Promise<string | undefined> {
    const repeat = await vscode.window.showInputBox({
      title: 'One-time share PIN',
      prompt: 'Repeat the PIN',
      password: true,
      ignoreFocusOut: true,
    });
    if (repeat !== pin) {
      void vscode.window.showErrorMessage('PINs do not match — cancelled.');
      return undefined;
    }
    return pin;
  }

  // Moved as written (A1); the pre-existing complexity is marked, not hidden.
  // eslint-disable-next-line complexity
  async pickRecipients(
    senderAccountId: string,
    preselected?: TeamMember,
  ): Promise<TeamMember[] | undefined> {
    if (preselected !== undefined) {
      return [preselected];
    }
    // Teams are account-scoped: offer only the sender account's NAS folder.
    const sender = this.deps.storage.getAccount(senderAccountId);
    const candidates = sender !== undefined ? this.deps.sharing.teamFor(sender) : [];
    if (candidates.length === 0) {
      void vscode.window.showInformationMessage(
        "No team found on this account's NAS folder — people appear after their first sync there.",
      );
      return undefined;
    }
    const picked = await vscode.window.showQuickPick(
      candidates.map((m) => ({
        label: m.isSelf ? `${m.account.email} (you)` : m.account.email,
        description: m.account.provider,
        member: m,
      })),
      { title: 'Share with…', canPickMany: true, placeHolder: 'Type to filter by email' },
    );
    return picked === undefined || picked.length === 0
      ? undefined
      : picked.map((p) => p.member);
  }

  // Moved as written (A1 moves, it does not rewrite); the complexity is pre-existing debt.
  // eslint-disable-next-line complexity
  async deliverBatch(
    senderAccountId: string,
    payloads: SharePayload[],
    recipients: TeamMember[],
    pin: string,
  ): Promise<void> {
    const sender = this.deps.storage.getAccount(senderAccountId);
    if (sender === undefined) {
      return;
    }
    const delivered: string[] = [];
    const failed: string[] = [];
    // Sign only where a signature means anything. The server stamps the sender
    // from a verified token, which is stronger than anything a client can sign and
    // needs no key distribution; on a folder there is nothing else to go on.
    const location = nasPathFor(sender);
    const signing =
      location !== undefined && !isServerLocation(location)
        ? await this.deps.storage.ensureSigningKeypair(sender.accountId)
        : undefined;
    // Which fields the AAD may cover is the transport's answer, not this method's — a server
    // rewrites two of the four the folder form binds.
    const form = this.deps.sharing.shareFormFor(sender);
    // BEFORE the first delivery, and that ordering is the fix for a defect the review found in my own
    // previous version: the note was computed inside the success message, AFTER `appendShares` had
    // succeeded. A keychain read that rejected there rejected the whole method — so recipients held
    // the share while the sender saw no success at all, and a retry would deliver it twice. Post-
    // delivery enrichment must never decide the outcome of an operation that already happened.
    //
    // Computed once here rather than per recipient, and available to BOTH terminal messages, which is
    // the other thing the old placement got wrong: a partial failure reported counts and never
    // mentioned that the recipient who DID receive the entry got it without its CVV.
    const withheld = await this.withheldNote(senderAccountId, payloads);
    for (const recipient of recipients) {
      try {
        const items = payloads.map((p) =>
          sealShare(p, recipient.shareKeyId, sender, pin, Date.now(), {
            form,
            signing,
            toEmail: recipient.account.email,
          }),
        );
        await this.deps.sharing.appendShares(sender, recipient, items);
        delivered.push(recipient.account.email);
      } catch (error) {
        failed.push(
          `${recipient.account.email}: ${describeError(error)}`,
        );
      }
    }
    const what =
      payloads.length === 1 ? `"${payloads[0].node.name}"` : `${payloads.length} entities`;
    if (failed.length > 0) {
      void vscode.window.showErrorMessage(
        `Share finished with errors — delivered: ${delivered.length}, failed: ${failed.join('; ')}${delivered.length > 0 ? withheld : ''}`,
      );
    } else {
      // What the redaction removed, said out loud. `withheldFromShare` existed and was tested and was
      // never CALLED — the same "helper with no caller" defect the gate had already caught me at one
      // story earlier, found this time by four reviewers at once. Without it somebody who shares a
      // hidden phrase reads "Shared …" and believes the phrase arrived; it cannot have, because
      // unweaving needs a code the person remembers and nothing transmits.
      void vscode.window.showInformationMessage(
        `Shared ${what} with ${delivered.join(', ')}. Tell them the PIN out-of-band.${withheld}`,
      );
    }
    void this.deps.sharing.reload();
  }

  /**
   * The sentence naming what a share left behind, or '' when it left nothing behind.
   *
   * <p>Computed from the PAYLOADS rather than from the selection, so one implementation covers both a
   * single entry and a folder subtree — a payload keeps the SENDER's node id, which is what reads the
   * sender's own record. Only payment entries are read, so a folder of a hundred passwords costs
   * nothing.</p>
   *
   * <p>Field NAMES only. This reaches a notification, and several UI layers log those.</p>
   */
  private async withheldNote(accountId: string, payloads: readonly SharePayload[]): Promise<string> {
    const names = new Set<string>();
    for (const payload of payloads.filter((p) => p.node.details?.isPayment === true)) {
      const stored = await this.deps.storage.getPaymentRaw(accountId, payload.node.id);
      withheldFromShare(stored).forEach((field) => names.add(field));
    }
    return names.size === 0 ? '' : ` Not sent, and they cannot be: ${[...names].sort().join(', ')}.`;
  }

  deliver(
    senderAccountId: string,
    payload: SharePayload,
    recipients: TeamMember[],
    pin: string,
  ): Promise<void> {
    return this.deliverBatch(senderAccountId, [payload], recipients, pin);
  }

  /**
   * The whole "share these rows" conversation: payloads (a folder shares its subtree,
   * with the folder chain), recipients, PIN, delivery. The command handler only resolves
   * the selection.
   */
  // The orchestration of four moved steps; each early exit counts against the limit.
  // eslint-disable-next-line complexity
  async shareNodes(accountId: string, nodes: TreeNode[]): Promise<void> {
    // Asked BEFORE anything is read: a seed nobody chose to send is never fetched at all.
    const includeTotp = await this.askIncludeTotp(await countTotpEntries(this.deps.storage, accountId, nodes));
    if (includeTotp === undefined) {
      return;
    }
    // One list of payloads across everything selected — delivery already batched, so
    // recipients and the share PIN are asked for once whatever the selection size.
    const payloads: SharePayload[] = [];
    for (const node of nodes) {
      payloads.push(
        ...(node.type === 'entity'
          ? [await buildSharePayload(this.deps.storage, accountId, node, includeTotp)]
          : await this.collectFolderPayloads(accountId, node, includeTotp)),
      );
    }
    if (payloads.length === 0) {
      void vscode.window.showInformationMessage(
        nodes.length === 1
          ? `Folder "${nodes[0].name}" holds no entities — nothing to share.`
          : 'Nothing to share — the selected folders hold no entities.',
      );
      return;
    }
    const recipients = await this.pickRecipients(accountId);
    if (recipients === undefined) {
      return;
    }
    const pin = await this.promptSharePin(true);
    if (pin === undefined) {
      return;
    }
    await this.deliverBatch(accountId, payloads, recipients, pin);
  }

  /**
   * The one-time-code question, asked once per share and only when there is one to ask about.
   *
   * <p>A checkbox rather than a confirmation, because the honest default is <b>off</b>: not
   * sending a seed leaves the recipient asking for it, while sending one they did not need hands
   * over a second factor that keeps working. Cancelling the list cancels the share, like every
   * other step of this conversation.</p>
   */
  private async askIncludeTotp(count: number): Promise<boolean | undefined> {
    if (count === 0) {
      return false;
    }
    const chosen = await vscode.window.showQuickPick(
      [
        {
          label: 'Include the one-time code (TOTP) seed',
          detail:
            `${count === 1 ? 'One selected entry carries' : `${count} selected entries carry`} one. ` +
            'The recipient will be able to produce codes for that login until the seed is changed.',
          picked: false,
        },
      ],
      {
        canPickMany: true,
        ignoreFocusOut: true,
        title: 'What travels with this share?',
        placeHolder: 'Leave it unticked to share everything else and keep the second factor here',
      },
    );
    return chosen === undefined ? undefined : chosen.length > 0;
  }

  /** Collect every entity in a folder subtree, with its folder chain. */
  private async collectFolderPayloads(
    accountId: string,
    folder: TreeNode,
    includeTotp: boolean,
  ): Promise<SharePayload[]> {
    const payloads: SharePayload[] = [];
    const walk = async (
      node: TreeNode,
      path: Array<{ name: string; folderType?: TreeNode['folderType'] }>,
    ): Promise<void> => {
      if (node.type === 'entity') {
        payloads.push({
          ...(await buildSharePayload(this.deps.storage, accountId, node, includeTotp)),
          folderPath: path,
        });
        return;
      }
      const childPath = [...path, { name: node.name, folderType: node.folderType }];
      for (const child of this.deps.storage.getChildren(accountId, node.id)) {
        await walk(child, childPath);
      }
    };
    await walk(folder, []);
    return payloads;
  }

  /** The accept flow for ONE share: sender check, PIN, import, refresh. */
  // Moved as written (A1); the pre-existing complexity is marked, not hidden.
  // eslint-disable-next-line complexity
  async acceptOne(share: OwnedShare): Promise<void> {
    if (!(await this.senderCheck(share))) {
      return;
    }
    const pin = await vscode.window.showInputBox({
      title: `Accept "${share.item.entityName}" from ${describeSender(
        share.item.fromEmail,
        senderLocation(this.deps.storage, share.accountId),
      )} — into ${this.deps.storage.getAccount(share.accountId)?.email ?? 'this account'}`,
      prompt: shareLabelTrusted(share.item, this.deps.sharing.serverStamped(share))
        ? 'Enter the share PIN'
        : 'Enter the share PIN — sent by an extension older than 0.82: its label is not bound to its contents',
      password: true,
      ignoreFocusOut: true,
    });
    if (pin === undefined) {
      return;
    }
    // Two try blocks, not one: only the DECRYPT can fail because of the PIN. A storage write
    // failing halfway through the import used to be reported as "does not decrypt with that
    // PIN", sending the reader back to retype a PIN that was right, against a tree the failed
    // import had already half-changed — with the real error never shown anywhere.
    let payload: SharePayload;
    try {
      payload = openShare(
        share.item,
        share.shareKeyId,
        pin,
        this.deps.extensionVersion,
        this.deps.sharing.serverStamped(share),
      );
    } catch (error) {
      void vscode.window.showErrorMessage(
        error instanceof BackupError && error.kind === 'unsupported-version'
          ? error.message
          : `"${share.item.entityName}" does not decrypt with that PIN — or its label was edited after it was sealed.`,
      );
      return;
    }
    try {
      await this.importShared(share, payload);
    } catch (error) {
      void vscode.window.showErrorMessage(
        `"${share.item.entityName}" opened, but saving it failed: ${describeError(error)}`,
      );
      return;
    }
    this.deps.onMutated();
    void this.deps.sharing.reload();
    void vscode.window.showInformationMessage(`Accepted "${share.item.entityName}".`);
  }

  /**
   * Round-robin accept: try known PINs on everything, ask a new PIN for the
   * first item that resists, repeat until done or Esc.
   */
  // Moved as written (A1); the pre-existing complexity is marked, not hidden.
  // eslint-disable-next-line complexity
  async acceptMany(items: OwnedShare[]): Promise<void> {
    let remaining = items;
    const pins: string[] = [];
    let imported = 0;
    while (remaining.length > 0) {
      const next = remaining[0];
      const pin = await vscode.window.showInputBox({
        title:
          pins.length === 0
            ? 'Accept shared items'
            : `"${next.item.entityName}" from ${next.item.fromEmail} does not decrypt`,
        prompt:
          pins.length === 0
            ? 'Share PIN (tried on all items; Esc cancels)'
            : 'Enter its PIN (Esc skips everything still locked)',
        password: true,
        ignoreFocusOut: true,
      });
      if (pin === undefined) {
        break;
      }
      pins.push(pin);
      // Only the PIN just entered — never the whole accumulated list. An item is still in
      // `remaining` precisely because every earlier PIN already failed to open it, so
      // re-trying them is pure waste: each retry is a full scrypt (~1s), and the old
      // O(items × PINs-so-far) cost froze the editor for tens of seconds on a handful of
      // shares. openShare is deterministic, so a PIN that did not open an item never will.
      const { opened, remaining: rest } = resolveShares(
        remaining,
        [pin],
        this.deps.extensionVersion,
        (owned) => this.deps.sharing.serverStamped(owned),
      );
      for (const o of opened) {
        await this.importShared(o, o.payload);
        imported++;
      }
      if (opened.length === 0) {
        void vscode.window.showWarningMessage('That PIN did not open any of the items.');
      }
      remaining = rest;
    }
    if (imported > 0) {
      this.deps.onMutated();
    }
    void this.deps.sharing.reload();
    void vscode.window.showInformationMessage(
      `Accepted ${imported} item(s)${remaining.length > 0 ? `, ${remaining.length} still pending` : ''}.`,
    );
  }

  /**
   * What the recipient is allowed to conclude about who sent this, and whether to
   * go on. Runs BEFORE the PIN prompt: a share whose sender cannot be trusted
   * should never reach the point where somebody is typing a secret for it.
   */
  // Moved as written (A1); the pre-existing complexity is marked, not hidden.
  // eslint-disable-next-line complexity
  private async senderCheck(share: OwnedShare): Promise<boolean> {
    const account = this.deps.storage.getAccount(share.accountId);
    if (account === undefined) {
      return false;
    }
    const location = nasPathFor(account);
    if (location !== undefined && isServerLocation(location)) {
      return true; // the server stamped it; nothing here can add to that
    }

    const verdict = judgeSender(this.deps.state, share.accountId, {
      transcript: shareTranscript(share.item, account.email),
      signature: share.item.signature,
    });

    if (verdictBlocksAccept(verdict)) {
      const known = pinnedKey(this.deps.state, share.accountId, share.item.fromEmail);
      const detail =
        verdict === 'mismatch'
          ? `This is signed by a DIFFERENT key than the one pinned for ${share.item.fromEmail}.

Pinned:  ${known === undefined ? '—' : keyFingerprint(known)}
This one: ${keyFingerprint(share.item.senderPublicKey ?? '')}

Either they rotated their key, or somebody else is using their name. Compare the fingerprint with them directly before trusting it.`
          : verdict === 'downgraded'
            ? `${share.item.fromEmail} has signed shares before, and this one is not signed at all. That is what stripping a signature looks like.`
            : 'The signature on this share does not verify.';
      const choice = await vscode.window.showWarningMessage(detail, { modal: true }, 'Trust this key anyway');
      if (choice !== 'Trust this key anyway') {
        return false;
      }
      if (share.item.senderPublicKey !== undefined) {
        await pinSenderKey(this.deps.state, share.accountId, share.item.fromEmail, share.item.senderPublicKey);
      }
      return true;
    }

    if (verdict === 'firstContact' && share.item.senderPublicKey !== undefined) {
      // Not "verified" — nobody has checked this key belongs to them yet. The
      // fingerprint is the only thing that can, and it is shown here rather than
      // buried in a command nobody runs.
      const choice = await vscode.window.showInformationMessage(
        `First share from ${share.item.fromEmail}. Read this fingerprint back to them before you trust it:

${keyFingerprint(share.item.senderPublicKey)}

After this, a share signed by any other key is refused.`,
        { modal: true },
        'Pin this key',
      );
      if (choice !== 'Pin this key') {
        return false;
      }
      await pinSenderKey(this.deps.state, share.accountId, share.item.fromEmail, share.item.senderPublicKey);
    }
    return true;
  }

  /** Import an opened payload into the recipient's tree. */
  // Moved as written (A1); the pre-existing complexity is marked, not hidden.
  // eslint-disable-next-line complexity, max-lines-per-function
  private async importShared(share: OwnedShare, payload: SharePayload): Promise<void> {
    // Recreate (or reuse by name) the sender's folder chain, if any.
    let parentId: string | null = null;
    for (const seg of payload.folderPath ?? []) {
      const existing: TreeNode | undefined = this.deps.storage
        .getChildren(share.accountId, parentId)
        .find((n) => n.type === 'folder' && n.name === seg.name);
      if (existing !== undefined) {
        parentId = existing.id;
      } else {
        const folderId = StorageManager.newId();
        await this.deps.storage.addNode(share.accountId, {
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
    const origins = this.deps.state.get<Record<string, string>>(ORIGINS_KEY, {});
    const previousId = resolveOrigin(
      origins,
      share.item.fromEmail,
      payload.node.id,
      (id) => this.deps.storage.getNode(share.accountId, id) !== undefined,
    );

    let node: TreeNode;
    if (previousId !== undefined) {
      const existing = this.deps.storage.getNode(share.accountId, previousId);
      const choice = await vscode.window.showWarningMessage(
        `"${existing?.name}" already came from ${share.item.fromEmail}. Update it in place, or keep both?`,
        { modal: true },
        'Update it',
        'Keep both',
      );
      if (choice === undefined) {
        // Dismissed on purpose: the human wants to look before deciding. The share must
        // survive that — consuming it here would destroy the only copy of the decision.
        void vscode.window.showInformationMessage(
          'Left in "Shared with me" — accept it again when you have decided.',
        );
        return;
      }
      if (choice === 'Update it') {
        // Keep its place in the tree and its own id; record what it was first.
        await this.deps.storage.recordRevision(
          share.accountId,
          previousId,
          await snapshotForRevision(this.deps.storage, share.accountId, {
            id: previousId,
            name: existing?.name ?? payload.node.name,
            details: existing?.details ?? payload.node.details!,
          }),
        );
        node = {
          ...payload.node,
          id: previousId,
          parentId: existing?.parentId ?? parentId,
          createdAt: existing?.createdAt,
          children: undefined,
        };
        await this.deps.storage.updateNode(share.accountId, node);
      } else {
        node = { ...payload.node, id: StorageManager.newId(), parentId, children: undefined };
        await this.deps.storage.addNode(share.accountId, node);
      }
    } else {
      // A fresh local id: a peer must never address (and thus silently overwrite) an
      // entity that already exists in our vault.
      node = { ...payload.node, id: StorageManager.newId(), parentId, children: undefined };
      await this.deps.storage.addNode(share.accountId, node);
    }
    await this.deps.state.update(
      ORIGINS_KEY,
      recordOrigin(origins, share.item.fromEmail, payload.node.id, node.id),
    );
    const { password, privateKey, vpnConfig, dbConnection } = payload.secrets;
    /** A payment record arrived that this build cannot read — decides whether the share is kept. */
    let unreadablePayment = false;
    await this.deps.storage.setPassword(share.accountId, node.id, password);
    if (privateKey !== undefined) {
      await this.deps.storage.setPrivateKey(share.accountId, node.id, privateKey);
    }
    if (vpnConfig !== undefined) {
      await this.deps.storage.setVpnConfig(share.accountId, node.id, vpnConfig);
    }
    if (dbConnection !== undefined) {
      await this.deps.storage.setDbConnection(share.accountId, node.id, dbConnection);
    }
    if (payload.secrets.notes !== undefined) {
      await this.deps.storage.setNotes(share.accountId, node.id, payload.secrets.notes);
    }
    if (payload.secrets.totp !== undefined) {
      await this.deps.storage.setTotp(share.accountId, node.id, payload.secrets.totp);
    }
    if (payload.secrets.config !== undefined) {
      await this.deps.storage.setConfigBody(share.accountId, node.id, payload.secrets.config);
    }
    if (payload.secrets.fields !== undefined) {
      await this.deps.storage.setFieldsRaw(share.accountId, node.id, payload.secrets.fields);
    }
    if (payload.secrets.payment !== undefined) {
      // Redacted AGAIN on arrival, through the same function the sender used. This is a trust
      // boundary: everything here was written by somebody else's process, so "a share cannot carry a
      // CVV" has to be true of what ARRIVES and not merely of what we send. One function called at
      // both ends is one opinion applied twice, not two opinions — the shape this repository already
      // uses for sender identity, which is stamped from a verified token and never accepted from the
      // body. Accepted from the S1.3 code review, which overturned the opposite decision.
      const arrived = redactArrivedPayment(payload.secrets.payment);
      await this.deps.storage.setPaymentRaw(share.accountId, node.id, arrived.raw);
      unreadablePayment = arrived.unreadable;
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
      await this.deps.sharing.removeOwnShare(share);
    }
    this.deps.onArrived?.(share.accountId, node.id);
  }
}

/**
 * Where the account holding this share syncs — which is what decides whether the
 * share's claimed sender was stamped by a server or merely written into a file.
 */
function senderLocation(storage: StorageManager, accountId: string): string | undefined {
  const account = storage.getAccount(accountId);
  return account === undefined ? undefined : nasPathFor(account);
}

/**
 * Everything an entity carries, packaged for a share.
 *
 * <p><b>`includeTotp` is a parameter and not a default</b> because the one-time-code seed is the
 * only secret here whose sharing is a separate decision. Every other field in this payload is
 * something the recipient needs in order to use what they were given; a TOTP seed is the sender's
 * <i>second factor</i>, and handing it over lets the recipient produce codes for that login for as
 * long as the seed lives. Sometimes that is exactly the intent — a shared service account nobody
 * owns personally — and sometimes it is the last thing the sender meant to do. So the caller asks,
 * and passes the answer here.</p>
 *
 * <p>This used to read every secret except this one, while the accept side wrote
 * `payload.secrets.totp` if it ever arrived — so a shared entry silently lost its second factor
 * while its metadata still said it had one.</p>
 */
export async function buildSharePayload(
  storage: StorageManager,
  accountId: string,
  node: TreeNode,
  includeTotp: boolean,
): Promise<SharePayload> {
  const note = (await storage.getNotes(accountId, node.id)) ?? node.details?.notes;
  // Read only when it is going to travel: a seed nobody asked to send has no business being
  // fetched out of the keychain, let alone sealed into a payload.
  const seed = includeTotp ? await storage.getTotp(accountId, node.id) : undefined;
  // The flag follows the SEED, not the request and not the stored metadata. `hasTotp` is a
  // plaintext convenience that can outlive what it describes, and a copy carrying it over an
  // empty keychain shows the recipient a *Copy One-Time Code* row with nothing behind it. Derived
  // here rather than trusted, so "the flag travels exactly when the seed does" is structural.
  const sharedDetails = shareableDetails(node.details, seed !== undefined);
  return {
    node: { ...node, details: sharedDetails, parentId: null, children: undefined },
    secrets: {
      password: await storage.getPassword(accountId, node.id),
      privateKey: await storage.getPrivateKey(accountId, node.id),
      vpnConfig: await storage.getVpnConfig(accountId, node.id),
      dbConnection: await storage.getDbConnection(accountId, node.id),
      notes: note,
      totp: seed,
      // Handing a colleague the document IS the feature. Sealed like every other secret here.
      config: await storage.getConfigBody(accountId, node.id),
      fields: await storage.getFieldsRaw(accountId, node.id),
      // The ONE stripping direction in the product. Handing a colleague a card is the feature — they
      // need the number and the expiry — and the CVV and the PIN are the two fields that are only
      // ever proof the holder is present, so they do not leave the vault they were typed into.
      // `paymentRedaction.ts` owns the list; this line must not grow a second opinion about it.
      payment: redactPaymentForShare(await storage.getPaymentRaw(accountId, node.id)),
    },
  };
}

/**
 * How many of the selected entries carry a one-time-code seed.
 *
 * <p><b>The flag first, then the keychain.</b> `hasTotp` is a plaintext convenience the tree reads
 * once per row, and it is right almost always — but it is a description of a secret, not the
 * secret, and the two can disagree: an entry written by an older build, an import, an edit to the
 * metadata. A question gated on the flag alone is therefore a question that sometimes never gets
 * asked, and an unasked question is a silent "no": the seed could never be opted IN.</p>
 *
 * <p>So an entry the flag does not vouch for is checked against the keychain. That is a real read
 * per unflagged entry, and it is affordable here for the reason it is not affordable in the tree
 * (audit finding C1): this runs once, on an explicit action, over the handful of rows somebody
 * selected — not on every row of every folder every time one is expanded.</p>
 */
export async function countTotpEntries(
  storage: StorageManager,
  accountId: string,
  nodes: readonly TreeNode[],
): Promise<number> {
  let count = 0;
  for (const entity of entitiesIn(storage, accountId, nodes)) {
    count += (await carriesSeed(storage, accountId, entity)) ? 1 : 0;
  }
  return count;
}

/** Every entity in the selection, folders walked through. */
function entitiesIn(
  storage: StorageManager,
  accountId: string,
  nodes: readonly TreeNode[],
): TreeNode[] {
  const entities: TreeNode[] = [];
  const walk = (node: TreeNode): void => {
    if (node.type === 'entity') {
      entities.push(node);
      return;
    }
    for (const child of storage.getChildren(accountId, node.id)) {
      walk(child);
    }
  };
  for (const node of nodes) {
    walk(node);
  }
  return entities;
}

/** The flag if it vouches for one; otherwise the keychain, which is the truth. */
async function carriesSeed(storage: StorageManager, accountId: string, entity: TreeNode): Promise<boolean> {
  if (entity.details?.hasTotp === true) {
    return true;
  }
  return (await storage.getTotp(accountId, entity.id)) !== undefined;
}
