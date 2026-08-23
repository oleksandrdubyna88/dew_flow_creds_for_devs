import * as vscode from 'vscode';
import { StorageManager } from './storageManager';
import type { SharingManager } from './sharingManager';
import { EntityKind, FolderType, TreeElement, TreeNode, kindOf } from './types';

export const VIEW_ID = 'credSshManagerView';
const DND_MIME = `application/vnd.code.tree.${VIEW_ID.toLowerCase()}`;

interface DragPayload {
  accountId: string;
  ids: string[];
}

/**
 * Sidebar tree: account profiles as top-level collapsibles, folders as
 * collapsible categories inside them, entities as leaves. Drag-and-drop
 * moves nodes between folders within the same account profile.
 */
export class CredTreeDataProvider
  implements vscode.TreeDataProvider<TreeElement>, vscode.TreeDragAndDropController<TreeElement>
{
  readonly dragMimeTypes = [DND_MIME];
  readonly dropMimeTypes = [DND_MIME];

  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<
    TreeElement | undefined
  >();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  /** Set by the extension: notified after drag-and-drop mutations. */
  onMutate: (() => void) | undefined;

  /** Set by the extension: Team / Shared-with-me data source. */
  sharing: SharingManager | undefined;

  constructor(private readonly storage: StorageManager) {}

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  getChildren(element?: TreeElement): TreeElement[] {
    if (element === undefined) {
      const roots: TreeElement[] = this.storage
        .getAccounts()
        .map((account) => ({ kind: 'account' as const, account }));
      if ((this.sharing?.ownShares.length ?? 0) > 0) {
        roots.push({ kind: 'sharedRoot' });
      }
      return roots;
    }
    switch (element.kind) {
      case 'teamScope':
        return (this.sharing?.teamFor(element.account) ?? []).map((member) => ({
          kind: 'teamMember' as const,
          member,
          viaAccountId: element.account.accountId,
        }));
      case 'sharedRoot': {
        const emails = [
          ...new Set((this.sharing?.ownShares ?? []).map((s) => s.item.fromEmail)),
        ].sort();
        return emails.map((email) => ({ kind: 'sharedSender' as const, email }));
      }
      case 'sharedSender':
        return (this.sharing?.ownShares ?? [])
          .filter((s) => s.item.fromEmail === element.email)
          .map((share) => ({ kind: 'sharedItem' as const, share }));
      case 'teamMember':
      case 'sharedItem':
        return [];
      default:
        break;
    }
    const accountId = element.kind === 'account' ? element.account.accountId : element.accountId;
    const parentId = element.kind === 'account' ? null : element.node.id;
    const children: TreeElement[] = this.storage
      .getChildren(accountId, parentId)
      .map((node) => ({ kind: 'node' as const, accountId, node }));
    // Each account carries ITS OWN team (the people on its NAS folder).
    if (
      element.kind === 'account' &&
      (this.sharing?.teamFor(element.account).length ?? 0) > 0
    ) {
      return [{ kind: 'teamScope', account: element.account }, ...children];
    }
    return children;
  }

  async getTreeItem(element: TreeElement): Promise<vscode.TreeItem> {
    if (element.kind === 'teamScope') {
      const item = new vscode.TreeItem('Team', vscode.TreeItemCollapsibleState.Collapsed);
      item.id = `teamScope:${element.account.accountId}`;
      item.contextValue = 'teamScope';
      item.iconPath = new vscode.ThemeIcon('organization', TEAM_COLOR);
      item.description = `${this.sharing?.teamFor(element.account).length ?? 0}`;
      return item;
    }
    if (element.kind === 'teamMember') {
      const { account, isSelf } = element.member;
      const item = new vscode.TreeItem(
        isSelf ? `${account.email} (you)` : account.email,
        vscode.TreeItemCollapsibleState.None,
      );
      item.id = `team:${element.viaAccountId}:${account.accountId}`;
      item.contextValue = 'teamMember';
      item.iconPath = new vscode.ThemeIcon('person', TEAM_COLOR);
      item.description = account.provider;
      return item;
    }
    if (element.kind === 'sharedRoot') {
      const item = new vscode.TreeItem(
        'Shared with me',
        vscode.TreeItemCollapsibleState.Expanded,
      );
      item.id = 'sharedRoot';
      item.contextValue = 'sharedRoot';
      item.iconPath = new vscode.ThemeIcon('gift');
      item.description = `${this.sharing?.ownShares.length ?? 0}`;
      return item;
    }
    if (element.kind === 'sharedSender') {
      const item = new vscode.TreeItem(
        element.email,
        vscode.TreeItemCollapsibleState.Expanded,
      );
      item.id = `sender:${element.email}`;
      item.contextValue = 'sharedSender';
      item.iconPath = new vscode.ThemeIcon('account', TEAM_COLOR);
      return item;
    }
    if (element.kind === 'sharedItem') {
      const { item: share } = element.share;
      const item = new vscode.TreeItem(share.entityName, vscode.TreeItemCollapsibleState.None);
      item.id = `share:${share.id}`;
      item.contextValue = 'sharedItem';
      item.iconPath = new vscode.ThemeIcon(kindIcon(share.entityKind));
      item.description = share.entityKind;
      item.tooltip = `Shared by ${share.fromEmail} · ${new Date(share.createdAt).toLocaleString()}`;
      return item;
    }
    if (element.kind === 'account') {
      const item = new vscode.TreeItem(
        element.account.email,
        vscode.TreeItemCollapsibleState.Expanded,
      );
      item.id = `account:${element.account.accountId}`;
      item.contextValue = 'account';
      item.iconPath = new vscode.ThemeIcon('account');
      item.description = element.account.provider;
      return item;
    }

    const { accountId, node } = element;
    if (node.type === 'folder') {
      const item = new vscode.TreeItem(node.name, vscode.TreeItemCollapsibleState.Collapsed);
      item.id = `${accountId}:${node.id}`;
      item.contextValue = 'folder';
      item.iconPath = folderIcon(node.folderType);
      if (node.folderType !== undefined && node.folderType !== 'any') {
        item.description = node.folderType;
      }
      return item;
    }

    const details = node.details;
    const item = new vscode.TreeItem(node.name, vscode.TreeItemCollapsibleState.None);
    item.id = `${accountId}:${node.id}`;
    // Capability flags drive the context menu: only actions that are
    // actually possible for THIS entity are offered.
    const hasPassword =
      (await this.storage.getPassword(accountId, node.id)) !== undefined;
    let contextValue = 'entity';
    if (details?.host) {
      contextValue += ':ssh';
    }
    if (details?.isSshKey) {
      contextValue += ':key';
    }
    if (details?.isVpn) {
      contextValue += ':vpn';
    }
    if (details?.isDb) {
      contextValue += ':db';
    }
    if (hasPassword) {
      contextValue += ':pwd';
    }
    item.contextValue = contextValue;
    item.iconPath = new vscode.ThemeIcon(
      details?.isDb
        ? 'database'
        : details?.isVpn
          ? 'shield'
          : details?.isSshKey
            ? 'key'
            : details?.isSshEnabled
              ? 'remote'
              : 'lock',
    );
    item.description = describeTarget(node);
    item.tooltip = buildTooltip(node);
    // Single click only selects (the handler ignores it); a DOUBLE click
    // opens the read-only viewer. Actions live in the context menu.
    item.command = {
      command: 'credSshManager.itemClicked',
      title: 'Open',
      arguments: [element],
    };
    return item;
  }

  // ---------- drag & drop ----------

  handleDrag(source: readonly TreeElement[], dataTransfer: vscode.DataTransfer): void {
    const nodes = source.filter(
      (e): e is Extract<TreeElement, { kind: 'node' }> => e.kind === 'node',
    );
    if (nodes.length === 0) {
      return;
    }
    // All dragged nodes must belong to one profile; take the first one's.
    const accountId = nodes[0].accountId;
    const payload: DragPayload = {
      accountId,
      ids: nodes.filter((n) => n.accountId === accountId).map((n) => n.node.id),
    };
    dataTransfer.set(DND_MIME, new vscode.DataTransferItem(payload));
  }

  async handleDrop(
    target: TreeElement | undefined,
    dataTransfer: vscode.DataTransfer,
  ): Promise<void> {
    const item = dataTransfer.get(DND_MIME);
    const payload = item?.value as DragPayload | undefined;
    if (!payload || !Array.isArray(payload.ids) || typeof payload.accountId !== 'string') {
      return;
    }

    // Dropping on empty space is ambiguous across profiles — require a
    // target inside a profile (Team/Shared rows are not drop targets).
    if (target === undefined || (target.kind !== 'account' && target.kind !== 'node')) {
      return;
    }
    const targetAccountId =
      target.kind === 'account' ? target.account.accountId : target.accountId;
    if (targetAccountId !== payload.accountId) {
      void vscode.window.showWarningMessage(
        'Cannot move items between account profiles.',
      );
      return;
    }

    // Account root → root level; entity target → into that entity's folder.
    const newParentId =
      target.kind === 'account'
        ? null
        : target.node.type === 'folder'
          ? target.node.id
          : (target.node.parentId ?? null);
    const targetFolder =
      newParentId !== null ? this.storage.getNode(payload.accountId, newParentId) : undefined;

    for (const id of payload.ids) {
      if (typeof id !== 'string') {
        continue;
      }
      if (
        newParentId !== null &&
        this.storage.isSelfOrDescendant(payload.accountId, id, newParentId)
      ) {
        void vscode.window.showWarningMessage('Cannot move a folder into itself.');
        continue;
      }
      const moving = this.storage.getNode(payload.accountId, id);
      // A typed folder only accepts entities of its own kind.
      if (
        moving?.type === 'entity' &&
        targetFolder?.folderType !== undefined &&
        targetFolder.folderType !== 'any' &&
        kindOf(moving.details) !== targetFolder.folderType
      ) {
        void vscode.window.showWarningMessage(
          `Folder "${targetFolder.name}" holds only ${targetFolder.folderType} entities — "${moving.name}" is ${kindOf(moving.details)}.`,
        );
        continue;
      }
      await this.storage.moveNode(payload.accountId, id, newParentId);
    }
    this.refresh();
    this.onMutate?.();
  }
}

function kindIcon(kind: EntityKind): string {
  switch (kind) {
    case 'db':
      return 'database';
    case 'vpn':
      return 'shield';
    case 'sshkey':
      return 'key';
    case 'ssh':
      return 'remote';
    default:
      return 'lock';
  }
}

/** Folders are painted dark orange so they never blend in with items. */
const FOLDER_COLOR = new vscode.ThemeColor('credSshManager.folderIcon');
/** Team/people rows are dark blue so they read as "other people", not data. */
const TEAM_COLOR = new vscode.ThemeColor('credSshManager.teamIcon');

function folderIcon(folderType: FolderType | undefined): vscode.ThemeIcon {
  switch (folderType) {
    case 'db':
      return new vscode.ThemeIcon('database', FOLDER_COLOR);
    case 'vpn':
      return new vscode.ThemeIcon('shield', FOLDER_COLOR);
    case 'sshkey':
      return new vscode.ThemeIcon('key', FOLDER_COLOR);
    case 'ssh':
      return new vscode.ThemeIcon('remote', FOLDER_COLOR);
    case 'credential':
      return new vscode.ThemeIcon('lock', FOLDER_COLOR);
    default:
      return new vscode.ThemeIcon('folder', FOLDER_COLOR);
  }
}

function describeTarget(node: TreeNode): string {
  const d = node.details;
  if (d?.isDb && !d.host) {
    return d.dbType ?? 'db';
  }
  if (d?.isVpn && !d.host) {
    return d.vpnType ?? 'vpn';
  }
  if (!d?.host) {
    return '';
  }
  const target = d.user ? `${d.user}@${d.host}` : d.host;
  return d.port !== undefined && d.port !== 22 ? `${target}:${d.port}` : target;
}

function buildTooltip(node: TreeNode): vscode.MarkdownString {
  // Entity fields can originate from another user (accepted shares), so the
  // tooltip must not render sender-controlled markdown/images. appendText
  // escapes every metacharacter; isTrusted stays false.
  const md = new vscode.MarkdownString();
  md.supportThemeIcons = false;
  const d0 = node.details;
  const rows: string[] = [node.name];
  if (d0?.host) rows.push(`Host: ${d0.host}`);
  if (d0?.user) rows.push(`User: ${d0.user}`);
  if (d0?.port !== undefined) rows.push(`Port: ${d0.port}`);
  if (d0?.sshKeyPath) rows.push(`Key: ${d0.sshKeyPath}`);
  rows.push(d0?.host ? 'Click: details · connects SSH via the play button' : 'Click: view details');
  if (d0?.notes) rows.push('', d0.notes);
  md.appendText(rows.join('\n'));
  return md;
}

