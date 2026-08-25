import * as vscode from 'vscode';
import { planBackupFileNames } from './backupNaming';
import { readBackupAccount } from './cryptoUtils';
import { envelopeWithShares, sharesFromEnvelope } from './shareFormat';
import { OwnedShare, ShareItem, StoredAccount, TeamMember } from './types';
import { VaultTransport } from './vaultTransport';
import { writeVaultFileAtomically } from './nasFileWrite';

/**
 * The original transport: a shared folder of `vault_<email>.enc` files.
 * Pending shares live as a plaintext array inside the recipient's own vault
 * envelope, so appends are read-modify-write with verify-and-retry (the
 * owner's sync may rewrite the file concurrently).
 */
export class FolderTransport implements VaultTransport {
  readonly kind = 'folder' as const;
  readonly embedsShares = true;

  constructor(
    readonly location: string,
    private readonly allAccounts: () => readonly StoredAccount[],
  ) {}

  private get dir(): vscode.Uri {
    return vscode.Uri.file(this.location);
  }

  private fileNameFor(account: StoredAccount): string | undefined {
    return planBackupFileNames(this.allAccounts()).get(account.accountId);
  }

  async readVault(account: StoredAccount): Promise<string | undefined> {
    const fileName = this.fileNameFor(account);
    if (fileName === undefined) {
      return undefined;
    }
    try {
      const bytes = await vscode.workspace.fs.readFile(
        vscode.Uri.joinPath(this.dir, fileName),
      );
      return Buffer.from(bytes).toString('utf8');
    } catch {
      return undefined; // most likely not created yet
    }
  }

  async writeVault(account: StoredAccount, content: string): Promise<void> {
    const fileName = this.fileNameFor(account);
    if (fileName === undefined) {
      throw new Error('internal: no vault file name planned for this account');
    }
    // `content` already embeds the pending shares (the caller builds the
    // envelope with them), so nothing extra to merge here.
    await this.writeAtomically(fileName, content);
  }

  async listTeam(ownAccounts: readonly StoredAccount[]): Promise<TeamMember[]> {
    const ownIds = new Set(ownAccounts.map((a) => a.accountId));
    const members: TeamMember[] = [];
    let entries: Array<[string, vscode.FileType]> = [];
    try {
      entries = await vscode.workspace.fs.readDirectory(this.dir);
    } catch {
      return [];
    }
    for (const [name, type] of entries) {
      if (type !== vscode.FileType.File || !name.startsWith('vault_') || !name.endsWith('.enc')) {
        continue;
      }
      try {
        const raw = Buffer.from(
          await vscode.workspace.fs.readFile(vscode.Uri.joinPath(this.dir, name)),
        ).toString('utf8');
        const account = readBackupAccount(raw);
        if (account === undefined) {
          continue;
        }
        members.push({
          account,
          fileName: name,
          location: this.location,
          // Folder shares are bound to the recipient's account id.
          shareKeyId: account.accountId,
          isSelf: ownIds.has(account.accountId),
        });
      } catch {
        // unreadable/foreign file — skip
      }
    }
    return members;
  }

  async listShares(account: StoredAccount): Promise<OwnedShare[]> {
    const raw = await this.readVault(account);
    if (raw === undefined) {
      return [];
    }
    return sharesFromEnvelope(raw).map((item) => ({
      accountId: account.accountId,
      shareKeyId: account.accountId,
      item,
    }));
  }

  async appendShares(
    _actingAs: StoredAccount,
    recipient: TeamMember,
    items: ShareItem[],
  ): Promise<void> {
    const fileName = recipient.fileName;
    if (fileName === undefined) {
      throw new Error(`No vault file known for ${recipient.account.email}.`);
    }
    const fileUri = vscode.Uri.joinPath(this.dir, fileName);
    const ids = items.map((i) => i.id);
    for (let attempt = 0; attempt < 3; attempt++) {
      const raw = Buffer.from(await vscode.workspace.fs.readFile(fileUri)).toString('utf8');
      const present = new Set(sharesFromEnvelope(raw).map((s) => s.id));
      const missing = items.filter((i) => !present.has(i.id));
      if (missing.length === 0) {
        return;
      }
      await this.writeAtomically(
        fileName,
        envelopeWithShares(raw, (current) => [...current, ...missing]),
      );
      // Verify our items survived a concurrent rewrite by the owner's sync.
      const check = Buffer.from(await vscode.workspace.fs.readFile(fileUri)).toString('utf8');
      const after = new Set(sharesFromEnvelope(check).map((s) => s.id));
      if (ids.every((id) => after.has(id))) {
        return;
      }
    }
    throw new Error(
      `Could not deliver the share to ${recipient.account.email} — the vault file kept changing. Try again.`,
    );
  }

  async removeShare(_actingAs: StoredAccount, share: OwnedShare): Promise<void> {
    const account = this.allAccounts().find((a) => a.accountId === share.accountId);
    const fileName = account !== undefined ? this.fileNameFor(account) : undefined;
    if (fileName === undefined) {
      return;
    }
    const fileUri = vscode.Uri.joinPath(this.dir, fileName);
    for (let attempt = 0; attempt < 3; attempt++) {
      const raw = Buffer.from(await vscode.workspace.fs.readFile(fileUri)).toString('utf8');
      if (!sharesFromEnvelope(raw).some((s) => s.id === share.item.id)) {
        return; // already gone
      }
      await this.writeAtomically(
        fileName,
        envelopeWithShares(raw, (current) => current.filter((s) => s.id !== share.item.id)),
      );
      const check = Buffer.from(await vscode.workspace.fs.readFile(fileUri)).toString('utf8');
      if (!sharesFromEnvelope(check).some((s) => s.id === share.item.id)) {
        return;
      }
    }
  }

  async deleteVault(account: StoredAccount): Promise<void> {
    const fileName = this.fileNameFor(account);
    if (fileName === undefined) {
      return;
    }
    await vscode.workspace.fs
      .delete(vscode.Uri.joinPath(this.dir, fileName))
      .then(undefined, () => undefined);
  }

  private writeAtomically(fileName: string, content: string): Promise<void> {
    return writeVaultFileAtomically(this.dir, fileName, content);
  }
}
