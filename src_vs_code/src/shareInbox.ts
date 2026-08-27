import { describeError } from './describeError';
import * as vscode from 'vscode';
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
  shareableDetails,
} from './shareFormat';
import { recordOrigin, resolveOrigin } from './shareOrigin';
import { snapshotForRevision } from './revisionSnapshot';
import { validatePin } from './pinPolicy';
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
  /** Called after an accepted share changed the tree, so caches refresh and sync runs. */
  readonly onMutated: () => void;
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
      validateInput: validatePin,
    });
    if (pin === undefined || !confirm) {
      return pin;
    }
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
  // eslint-disable-next-line complexity, max-lines-per-function
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
    for (const recipient of recipients) {
      try {
        const items = payloads.map((p) =>
          sealShare(
            p,
            recipient.shareKeyId,
            sender,
            pin,
            Date.now(),
            signing,
            recipient.account.email,
          ),
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
        `Share finished with errors — delivered: ${delivered.length}, failed: ${failed.join('; ')}`,
      );
    } else {
      void vscode.window.showInformationMessage(
        `Shared ${what} with ${delivered.join(', ')}. Tell them the PIN out-of-band.`,
      );
    }
    void this.deps.sharing.reload();
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
    const includeTotp = await this.askIncludeTotp(countTotpEntries(this.deps.storage, accountId, nodes));
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
            `${count} of the selected entr${count === 1 ? 'y carries' : 'ies carry'} one. ` +
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
      prompt: 'Enter the share PIN',
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
      payload = openShare(share.item, share.shareKeyId, pin);
    } catch {
      void vscode.window.showErrorMessage(
        `"${share.item.entityName}" does not decrypt with that PIN.`,
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
      const { opened, remaining: rest } = resolveShares(remaining, [pin]);
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
    await this.deps.sharing.removeOwnShare(share);
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
  const sharedDetails = shareableDetails(node.details, includeTotp);
  return {
    node: { ...node, details: sharedDetails, parentId: null, children: undefined },
    secrets: {
      password: await storage.getPassword(accountId, node.id),
      privateKey: await storage.getPrivateKey(accountId, node.id),
      vpnConfig: await storage.getVpnConfig(accountId, node.id),
      dbConnection: await storage.getDbConnection(accountId, node.id),
      notes: note,
      // Read only when it is going to travel: a seed nobody asked to send has no business being
      // fetched out of the keychain, let alone sealed into a payload.
      totp: includeTotp ? await storage.getTotp(accountId, node.id) : undefined,
      // Handing a colleague the document IS the feature. Sealed like every other secret here.
      config: await storage.getConfigBody(accountId, node.id),
    },
  };
}

/**
 * How many of the selected entries carry a one-time-code seed.
 *
 * <p>Counted from the plaintext `hasTotp` flag, never by reading the keychain per row — the same
 * reason the tree's `:totp` token is built from it (audit finding C1). Nothing is decrypted to
 * decide whether to ask a question.</p>
 */
export function countTotpEntries(
  storage: StorageManager,
  accountId: string,
  nodes: readonly TreeNode[],
): number {
  let count = 0;
  const hasSeed = (node: TreeNode): boolean => node.details?.hasTotp === true;
  const walk = (node: TreeNode): void => {
    if (node.type === 'entity') {
      count += hasSeed(node) ? 1 : 0;
      return;
    }
    for (const child of storage.getChildren(accountId, node.id)) {
      walk(child);
    }
  };
  for (const node of nodes) {
    walk(node);
  }
  return count;
}
