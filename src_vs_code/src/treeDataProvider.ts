import * as vscode from 'vscode';
import { StorageManager } from './storageManager';
import { nasPathFor } from './nasPaths';
import { senderIsVerified } from './shareSender';
import { diagnoseTeamFailure } from './teamDiagnosis';
import type { SharingManager } from './sharingManager';
import { EntityKind, FolderType, OwnedShare, TreeElement, TreeNode, kindOf } from './types';
import {
  accountMatches,
  countMatches,
  filterChildren,
  matchesTerms,
  nodeHaystack,
  searchTerms,
} from './treeSearch';
import { SyncReadiness } from './syncReadiness';
import { isVpnStartable } from './vpnCommand';

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

  /**
   * Per-account sync readiness, refreshed by the extension.
   *
   * Cached rather than computed here because answering needs SecretStorage, and a tree
   * item is built synchronously — an icon that had to await would either block the tree
   * or flicker.
   */
  readonly readiness = new Map<string, SyncReadiness>();

  /**
   * Entity ids known to have kept revisions.
   *
   * <p>Reading history means reading SecretStorage, which `getTreeItem` cannot await — so
   * the answer is cached here and refreshed at the moments it changes (an edit, an
   * accepted update, a load), exactly as `readiness` is.</p>
   */
  readonly withHistory = new Set<string>();

  /** Set by the extension: Team / Shared-with-me data source. */
  sharing: SharingManager | undefined;

  constructor(
    private readonly storage: StorageManager,
    private readonly extensionUri: vscode.Uri,
  ) {}

  /**
   * Whether ANY share under this sender arrived somewhere its sender could be
   * written by hand. One unverifiable share is enough to make the name a claim,
   * so the group is marked on "any", never on "most".
   */
  private unverifiedSender(email: string): boolean {
    return (this.sharing?.ownShares ?? [])
      .filter((share) => share.item.fromEmail === email)
      .some((share) => {
        const account = this.storage.getAccount(share.accountId);
        return !senderIsVerified(account === undefined ? undefined : nasPathFor(account));
      });
  }

  /**
   * The live filter term. Empty means no filtering at all.
   *
   * <p>Held here rather than in the elements so that typing changes what the tree SHOWS
   * without changing what any row IS — the account and node elements keep their identity,
   * and only the folder rows take the term into their id, to be re-expanded (see
   * `getTreeItem`).</p>
   */
  private query = '';

  get searchQuery(): string {
    return this.query;
  }

  setSearchQuery(value: string): void {
    if (value === this.query) {
      return;
    }
    this.query = value;
    this.refresh();
  }

  private terms(): string[] {
    return searchTerms(this.query);
  }

  /**
   * The filter row.
   *
   * <p>A tree cannot hold a real text field — the API takes rows, not widgets — so the row
   * IS the field: clicking it opens an input that filters as you type, and it then shows the
   * term it is filtering by, with how many entries survived. The count is the part that
   * matters when nothing matches, because an empty tree and a broken tree look identical
   * otherwise.</p>
   */
  private searchItem(): vscode.TreeItem {
    const terms = this.terms();
    const active = terms.length > 0;
    const item = new vscode.TreeItem(
      active ? `Search: ${this.query}` : 'Search',
      vscode.TreeItemCollapsibleState.None,
    );
    item.id = 'search';
    // Two context values, because the × is contributed as an inline action and an inline
    // action cannot be conditional on anything but this string.
    item.contextValue = active ? 'credSearchActive' : 'credSearch';
    item.iconPath = new vscode.ThemeIcon(active ? 'filter-filled' : 'search');
    if (active) {
      const found = countMatches(
        this.storage,
        this.storage.getAccounts().map((a) => a.accountId),
        terms,
      );
      item.description = found === 0 ? 'nothing matches' : `${found} found`;
    } else {
      item.description = 'filter by name, host, command…';
    }
    item.tooltip = active
      ? `Filtering by "${this.query}" — click to change it, × to clear. Secrets are never searched.`
      : 'Click to filter the tree as you type. Names, hosts, users, commands — never secrets.';
    item.command = { command: 'credSshManager.search', title: 'Search' };
    return item;
  }

  /**
   * Shares the filter keeps — matched on what their row shows: the entity's name, its kind,
   * and who sent it. Never on the payload, which is still encrypted anyway.
   */
  private sharedMatches(terms: readonly string[]): OwnedShare[] {
    const shares = this.sharing?.ownShares ?? [];
    if (terms.length === 0) {
      return [...shares];
    }
    return shares.filter((share) =>
      matchesTerms(
        `${share.item.entityName} ${share.item.entityKind} ${share.item.fromEmail}`.toLowerCase(),
        terms,
      ),
    );
  }

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  getChildren(element?: TreeElement): TreeElement[] {
    if (element === undefined) {
      const terms = this.terms();
      // The filter row is FIRST, above everything, because that is where a filter has to
      // be to be found — and it stays visible when the filter hides every account, which
      // is the one moment an invisible clear button would be unrecoverable.
      const roots: TreeElement[] = [{ kind: 'search' }];
      for (const account of this.storage.getAccounts()) {
        if (accountMatches(this.storage, account.accountId, terms)) {
          roots.push({ kind: 'account', account });
        }
      }
      if ((this.sharing?.ownShares.length ?? 0) > 0 && this.sharedMatches(terms).length > 0) {
        roots.push({ kind: 'sharedRoot' });
      }
      return roots;
    }
    if (element.kind === 'search') {
      return [];
    }
    const terms = this.terms();
    switch (element.kind) {
      case 'teamScope':
        return (this.sharing?.teamFor(element.account) ?? [])
          .filter((member) => matchesTerms(member.account.email.toLowerCase(), terms))
          .map((member) => ({
            kind: 'teamMember' as const,
            member,
            viaAccountId: element.account.accountId,
          }));
      case 'sharedRoot': {
        const emails = [...new Set(this.sharedMatches(terms).map((s) => s.item.fromEmail))].sort();
        return emails.map((email) => ({ kind: 'sharedSender' as const, email }));
      }
      case 'sharedSender':
        return this.sharedMatches(terms)
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
    // A folder that matched by its own NAME opens in full: the answer to "show me
    // Passwords" is its contents, not an empty folder.
    const parentMatched =
      element.kind === 'node' && matchesTerms(nodeHaystack(element.node), terms);
    const children: TreeElement[] = filterChildren(
      this.storage,
      accountId,
      parentId,
      terms,
      parentMatched,
    ).map((node) => ({ kind: 'node' as const, accountId, node }));
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
    if (element.kind === 'search') {
      return this.searchItem();
    }
    if (element.kind === 'teamScope') {
      const item = new vscode.TreeItem('Team', vscode.TreeItemCollapsibleState.Collapsed);
      item.id = `teamScope:${element.account.accountId}`;
      item.contextValue = 'teamScope';
      // An empty team and a refused one used to look identical. Only one of them
      // is somebody's fault, and it is the one nobody could see.
      const failure = this.sharing?.teamFailures.get(element.account.accountId);
      if (failure === undefined) {
        item.iconPath = new vscode.ThemeIcon('organization', TEAM_COLOR);
        item.description = `${this.sharing?.teamFor(element.account).length ?? 0}`;
      } else {
        item.iconPath = new vscode.ThemeIcon(
          'warning',
          new vscode.ThemeColor('problemsWarningIcon.foreground'),
        );
        item.description = failure.status === undefined ? 'unreachable' : `refused (${failure.status})`;
        item.tooltip = diagnoseTeamFailure(failure);
      }
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
      // A name is the first thing the eye lands on, and on a shared folder it is a
      // string the writer chose rather than an identity anyone checked. The accept
      // dialog says so too, but by then the reader has already decided who this is
      // from.
      const unverified = this.unverifiedSender(element.email);
      item.iconPath = unverified
        ? new vscode.ThemeIcon('unverified', new vscode.ThemeColor('problemsWarningIcon.foreground'))
        : new vscode.ThemeIcon('account', TEAM_COLOR);
      item.description = unverified ? 'unverified sender' : undefined;
      item.tooltip = unverified
        ? `${element.email} — claimed, not verified. This share came through a shared folder, where anyone with write access can put any name here. A share through the vault server carries a sender stamped from a verified sign-in.`
        : `${element.email} — stamped by the vault server from a verified sign-in.`;
      return item;
    }
    if (element.kind === 'sharedItem') {
      const { item: share } = element.share;
      const item = new vscode.TreeItem(share.entityName, vscode.TreeItemCollapsibleState.None);
      item.id = `share:${share.id}`;
      item.contextValue = 'sharedItem';
      item.iconPath = new vscode.ThemeIcon(kindIcon(share.entityKind));
      // WHERE it arrived matters as much as who sent it: with several accounts, the
      // sender alone leaves you guessing which vault (and which sync PIN) accepting
      // will involve.
      const toEmail = this.storage.getAccount(element.share.accountId)?.email;
      item.description = toEmail !== undefined ? `${share.entityKind} → ${toEmail}` : share.entityKind;
      item.tooltip =
        `Shared by ${share.fromEmail}` +
        (toEmail !== undefined ? ` → to your account ${toEmail}` : '') +
        ` · ${new Date(share.createdAt).toLocaleString()}`;
      return item;
    }
    if (element.kind === 'account') {
      const item = new vscode.TreeItem(
        element.account.email,
        vscode.TreeItemCollapsibleState.Expanded,
      );
      item.id = `account:${element.account.accountId}`;
      item.contextValue = 'account';
      const ready = this.readiness.get(element.account.accountId);
      // An SVG file, not a ThemeIcon with a colour: VS Code repaints themed icons in the
      // selection colour the moment the row is selected, which made a signed-in account
      // look signed-out exactly while you were looking at it.
      item.iconPath = vscode.Uri.joinPath(
        this.extensionUri,
        'media',
        ready?.ready === true ? 'account-green.svg' : 'account-grey.svg',
      );
      // The reason belongs on the row itself: a grey icon that does not say why is a
      // riddle — and it used to be overwritten by the provider name one line later.
      item.description = [
        element.account.provider,
        ready !== undefined && !ready.ready ? ready.reason : undefined,
      ]
        .filter(Boolean)
        .join('  ·  ');
      return item;
    }

    const { accountId, node } = element;
    if (node.type === 'folder') {
      const filtering = this.query.length > 0;
      // Filtering opens the folders it kept, otherwise the hit is behind a twisty and the
      // filter looks like it found nothing. The term rides the id because VS Code remembers
      // expansion per id: with a stable id it would honour the collapsed state you left
      // behind and refuse to open.
      const item = new vscode.TreeItem(
        node.name,
        filtering
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.Collapsed,
      );
      item.id = filtering ? `${accountId}:${node.id}:q${this.query}` : `${accountId}:${node.id}`;
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
      if (isVpnStartable(details.vpnType)) {
        contextValue += ':vpnrun';
      }
    }
    if (details?.isDb) {
      contextValue += ':db';
    }
    if (details?.isTerminal) {
      contextValue += ':cmd';
    }
    if (details?.isScript) {
      contextValue += ':script';
    }
    if (hasPassword) {
      contextValue += ':pwd';
    }
    // One suffix the menu can test, computed where contextValue is already assembled:
    // the alternative was a lookahead regex in package.json doing inclusion AND the
    // sshkey exclusion, which nothing could test and nobody could read.
    const shareable =
      details !== undefined &&
      details.isSshKey !== true &&
      (Boolean(details.host) ||
        details.isDb === true ||
        (details.isVpn === true && isVpnStartable(details.vpnType)) ||
        details.isTerminal === true ||
        details.isScript === true ||
        hasPassword);
    if (shareable) {
      contextValue += ':shareable';
    }
    item.contextValue = contextValue;
    item.iconPath = new vscode.ThemeIcon(
      details?.isScript
        ? 'file-code'
        : details?.isTerminal
        ? 'terminal'
        : details?.isDb
        ? 'database'
        : details?.isVpn
          ? 'shield'
          : details?.isSshKey
            ? 'key'
            : details?.isSshEnabled
              ? 'remote'
              : 'lock',
      // Tinted when previous versions are kept, so "this has been changed" is visible in
      // the tree rather than only after opening the entry. A theme colour rather than a
      // second set of SVG files: seven kinds times two states is fourteen files to keep
      // in step, and the tint says the same thing.
      this.withHistory.has(node.id) ? HISTORY_COLOR : undefined,
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
        targetFolder.folderType !== 'project' &&
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
    case 'terminal':
      return 'terminal';
    case 'script':
      return 'file-code';
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

/** Green: this account can sync on its own. Anything else stays the default grey. */
/** Team/people rows are dark blue so they read as "other people", not data. */
const HISTORY_COLOR = new vscode.ThemeColor('credSshManager.historyIcon');

const TEAM_COLOR = new vscode.ThemeColor('credSshManager.teamIcon');

function folderIcon(folderType: FolderType | undefined): vscode.ThemeIcon {
  switch (folderType) {
    case 'project':
      return new vscode.ThemeIcon('project', FOLDER_COLOR);
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
    case 'terminal':
      return new vscode.ThemeIcon('terminal', FOLDER_COLOR);
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

