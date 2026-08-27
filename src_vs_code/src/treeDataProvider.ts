import * as vscode from 'vscode';
import { StorageManager } from './storageManager';
import { nasPathFor } from './nasPaths';
import { senderIsVerified } from './shareSender';
import { diagnoseTeamFailure } from './teamDiagnosis';
import type { SharingManager } from './sharingManager';
import { OwnedShare, TreeElement, TreeNode } from './types';

import { DepIndexCache } from './depIndexCache';
import { dependentGroups, dependentsFolderItem, dependentsItem } from './depTreeItems';
import { RevisionHead } from './revisionHistory';
import {
  FilterMemo,
  NodeJudge,
  accountMatches,
  filterChildren,
  matchesTerms,
  nodeHaystack,
  searchTerms,
} from './treeSearch';
import { entityKey } from './entityFlags';
import { describeRemaining } from './entityExpiry';
import { resolveKind } from './entityKind';
import { SyncReadiness } from './syncReadiness';
import { OrgRecoveryAccess, accountContextValue } from './orgRecoveryAccess';
import { describeTarget, entityContextValue, markInvalid } from './treeRowText';
import { FOLDER_COLOR, buildTooltip, entityIcon, folderIcon, kindIcon } from './treeIcons';
import { parentOf } from './treeParent';
import { describeRetention, isTrashFolder } from './trash';
import { ExpansionMemory, expansionKey } from './treeExpansion';
import { accountCounts, formatAccountCounts } from './accountCounts';
import { buildJudge, searchRowFor } from './providerSearch';
import { revisionRowItem } from './revisionRowItem';
import { depUri } from './depDecorations';

export const VIEW_ID = 'credSshManagerView';
const DND_MIME = `application/vnd.code.tree.${VIEW_ID.toLowerCase()}`;

/**
 * How long after the last keystroke the tree is repainted. Long enough to swallow a burst of
 * typing, short enough that a single keystroke still feels immediate.
 */
const SEARCH_DEBOUNCE_MS = 50;

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
  implements
    vscode.TreeDataProvider<TreeElement>,
    vscode.TreeDragAndDropController<TreeElement>,
    vscode.Disposable
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
   * What each account may see of corporate recovery, refreshed by the extension alongside
   * `readiness` and cached for the same reason: answering needs a network read of the server's
   * roster, and a tree item is built synchronously.
   *
   * <p>Absent means "not asked yet", which resolves to `none` — the menu is then what it was
   * before corporate recovery existed. Erring towards hiding is right here: a command that is
   * missing for a moment is a smaller fault than four an ordinary user cannot run.</p>
   */
  readonly orgAccess = new Map<string, OrgRecoveryAccess>();

  /**
   * Kept previous versions, per entity id.
   *
   * <p>Reading history means reading SecretStorage, which `getTreeItem` cannot await — so
   * the answer is cached here and refreshed at the moments it changes (an edit, an
   * accepted update, a load), exactly as `readiness` is. The revisions themselves are
   * cached rather than only a has/has-not flag because the refresh already reads them, and
   * the tree needs their dates and names to render the rows under an entity.</p>
   */
  readonly historyById = new Map<string, RevisionHead[]>();

  /** The kept versions of one entity, or none — keyed by `entityKey`, as the passwords are. */
  historyOf(accountId: string, entityId: string): readonly RevisionHead[] {
    return this.historyById.get(entityKey(accountId, entityId)) ?? [];
  }

  hasHistory(accountId: string, entityId: string): boolean {
    return this.historyOf(accountId, entityId).length > 0;
  }

  /**
   * Entities that have a stored password, as `entityKey(accountId, entityId)`.
   *
   * <p>Whether "Copy Password" belongs in an entity's menu used to be answered by reading the
   * keychain in `getTreeItem` — one cross-process read per row, so opening a folder of 300
   * entries made 300 of them, to decide the contents of menus nobody had opened. Cached here
   * and refreshed at the moments it changes (an edit, an accepted share, a restore, a pulled
   * sync), exactly as `readiness` and `historyById` are. Keyed by account as well as entity
   * because a restore can put the same ids into two profiles, and the keychain key carries
   * both.</p>
   */
  readonly passwordIds = new Set<string>();

  hasPassword(accountId: string, entityId: string): boolean {
    return this.passwordIds.has(entityKey(accountId, entityId));
  }

  /** Configs whose stored body does not parse. Why it marks the LABEL: `markInvalid` says. */
  readonly invalidConfigIds = new Set<string>();

  /** Set by the extension: Team / Shared-with-me data source. */
  sharing: SharingManager | undefined;

  /**
   * Set by the extension: which rows the person had open.
   *
   * <p>Optional so the provider still renders in a test that has no memento — the defaults are
   * exactly what the tree did before this existed.</p>
   */
  expansion: ExpansionMemory | undefined;

  /**
   * Set by the extension: whether a Remote Bridge is open to an entry right now.
   *
   * <p>Optional for the same reason `expansion` is — a test with no bridge manager renders the
   * tree exactly as it did before this existed. Absent means "no bridge", which is the state
   * every row is in until one is opened.</p>
   */
  isBridged: ((accountId: string, nodeId: string) => boolean) | undefined;
  /** Whether a CLI alias points at this entry — filled by the extension (T23). */
  hasCliAlias: ((accountId: string, nodeId: string) => boolean) | undefined;

  constructor(
    private readonly storage: StorageManager,
    private readonly extensionUri: vscode.Uri,
  ) {
    // In the body, not as a field initializer: a parameter property is not assigned until the
    // constructor runs, so `new DepIndexCache(this.storage)` beside the declaration would be
    // handed `undefined` — which TypeScript catches, and a plain field would not have.
    this.dependencies = new DepIndexCache(storage);
  }

  /**
   * Give up the debounce timer and the emitter.
   *
   * <p>Disposing a `TreeView` does NOT dispose its provider, so without this a filter keystroke
   * within the debounce window of a teardown fires a repaint into a view that is going away, and
   * every activation cycle (an extension update, a profile switch) leaves the previous provider's
   * emitter behind with its listeners still attached.</p>
   */
  dispose(): void {
    if (this.pendingRefresh !== undefined) {
      clearTimeout(this.pendingRefresh);
      this.pendingRefresh = undefined;
    }
    this.onDidChangeTreeDataEmitter.dispose();
  }

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

  /**
   * Answers the current term has already produced for the current tree (see `FilterMemo`).
   * Cleared by `refresh()`, which is where every mutation arrives; the term itself is handled
   * by the memo's tuning.
   */
  private readonly filterMemo = new FilterMemo();

  /** The repaint a burst of keystrokes is waiting on, if any. */
  private pendingRefresh: ReturnType<typeof setTimeout> | undefined;

  get searchQuery(): string {
    return this.query;
  }

  /**
   * Set the live filter term.
   *
   * <p>The term takes effect at once — `getChildren` answers with it from this line on — but
   * the repaint is coalesced: a burst of keystrokes fires `onDidChangeTreeData` once, after the
   * last one, instead of making VS Code re-ask for the whole tree per character. Only the repaint
   * is deferred, never the value, which is what lets Escape put the previous term back without
   * a late keystroke overtaking it.</p>
   */
  setSearchQuery(value: string): void {
    if (value === this.query) {
      return;
    }
    this.query = value;
    if (this.pendingRefresh !== undefined) {
      clearTimeout(this.pendingRefresh);
    }
    this.pendingRefresh = setTimeout(() => {
      this.pendingRefresh = undefined;
      this.refresh();
    }, SEARCH_DEBOUNCE_MS);
  }

  private terms(): string[] {
    return searchTerms(this.query);
  }

  /** The judged query for one account — lives in providerSearch.ts, where it is documented. */
  private judge(accountId: string): NodeJudge {
    return buildJudge(this.query, accountId, this.storage, this.hasCliAlias);
  }

  /** The filter row — built in providerSearch.ts, which owns everything about the query. */
  private searchItem(): vscode.TreeItem {
    return searchRowFor(this.query, this.storage, this.filterMemo, (id) => this.judge(id));
  }

  /**
   * One kept version, as a row under its entity.
   *
   * <p>The context value starts with `revision` and then carries the same `:cmd` / `:script`
   * suffixes an entity would, so Run and Copy Command work on an old version exactly as on
   * the current one — and nothing else does: no Edit, no Share, no Copy Password. A previous
   * version is something to look at, run, or clone from; it is not something to change.</p>
   */
  private revisionItem(element: Extract<TreeElement, { kind: 'revision' }>): vscode.TreeItem {
    return revisionRowItem(element, this.historyOf(element.accountId, element.node.id)[element.index]);
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

  /**
   * Repaint now. Every mutation arrives here, so this is also where the filter's memoized
   * answers become void — and a repaint a keystroke was still waiting on is absorbed, since
   * this one carries the current term already.
   */
  /**
   * The dependency index, shared with the decoration provider so the tree and the colours can
   * never disagree about who depends on what. See `depIndexCache.ts` for why it is a per-repaint
   * memo rather than a background walk.
   */
  readonly dependencies: DepIndexCache;

  refresh(): void {
    this.filterMemo.clear();
    this.dependencies.clear();
    if (this.pendingRefresh !== undefined) {
      clearTimeout(this.pendingRefresh);
      this.pendingRefresh = undefined;
    }
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  /**
   * Required by `TreeView.reveal`, and written for it — the provider went without one until the
   * "go to the original folder" button needed a row to be walked to. The arithmetic is in
   * `treeParent.ts`, where it is testable without an editor; this is the seam.
   *
   * <p>A `dependentEntity` row deliberately answers `undefined`: reconstructing its parent means
   * rebuilding the folder grouping it was rendered from, and nothing reveals a shadow row —
   * the button navigates to the REAL folder, which is a plain node.</p>
   */
  getParent(element: TreeElement): TreeElement | undefined {
    return parentOf(element, this.storage);
  }

  // eslint-disable-next-line complexity, max-lines-per-function
  getChildren(element?: TreeElement): TreeElement[] {
    if (element === undefined) {
      const terms = this.terms();
      // The filter row is FIRST, above everything, because that is where a filter has to
      // be to be found — and it stays visible when the filter hides every account, which
      // is the one moment an invisible clear button would be unrecoverable.
      const roots: TreeElement[] = [{ kind: 'search' }];
      for (const account of this.storage.getAccounts()) {
        if (accountMatches(this.storage, account.accountId, this.judge(account.accountId), this.filterMemo)) {
          // BETWEEN accounts only (T29): never before the first, never after the last — a
          // separator at an edge separates nothing.
          if (roots.some((existing) => existing.kind === 'account')) {
            roots.push({ kind: 'separator', afterAccountId: account.accountId });
          }
          roots.push({ kind: 'account', account });
        }
      }
      if ((this.sharing?.ownShares.length ?? 0) > 0 && this.sharedMatches(terms).length > 0) {
        roots.push({ kind: 'sharedRoot' });
      }
      return roots;
    }
    if (element.kind === 'search' || element.kind === 'separator') {
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
    if (element.kind === 'revision') {
      return [];
    }
    if (element.kind === 'dependents') {
      return dependentGroups(
        this.storage.getNodes(element.accountId),
        this.dependencies.indexFor(element.accountId),
        element.accountId,
        element.node.id,
      );
    }
    if (element.kind === 'dependentsFolder') {
      // Only the entities the group was built from — never `storage`'s children of that
      // folder. Showing the folder's other contents here would answer a question nobody asked.
      return element.entities.map((node) => ({
        kind: 'dependentEntity' as const,
        accountId: element.accountId,
        targetId: element.targetId,
        node,
      }));
    }
    // A shadow row is a leaf: it is one entity's SECOND position, and nesting its own history
    // and dependents under it would let the tree walk in circles.
    if (element.kind === 'dependentEntity') {
      return [];
    }
    // An entity's children are its kept versions, newest first, and — when anything depends on
    // it — one more row leading to what does. Two sub-trees, side by side rather than in each
    // other's way: they are simply two different element kinds in one array.
    if (element.kind === 'node' && element.node.type === 'entity') {
      const { accountId, node } = element;
      const revisions = this.historyOf(accountId, node.id).map((_head, index) => ({
        kind: 'revision' as const,
        accountId,
        node,
        index,
      }));
      return this.dependencies.hasDependents(accountId, node.id)
        ? [...revisions, { kind: 'dependents' as const, accountId, node }]
        : revisions;
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
      this.judge(accountId),
      parentMatched,
      this.filterMemo,
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

  // Synchronous on purpose: everything a row needs is in memory. The one answer that used
  // to be awaited here — has this entity a password — is the `passwordIds` cache above.
  // eslint-disable-next-line complexity, max-lines-per-function
  getTreeItem(element: TreeElement): vscode.TreeItem {
    if (element.kind === 'search') {
      return this.searchItem();
    }
    if (element.kind === 'revision') {
      return this.revisionItem(element);
    }
    if (element.kind === 'teamScope') {
      const item = new vscode.TreeItem('Team', this.collapsible(element, false));
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
    if (element.kind === 'separator') {
      // Inert on purpose: no command, no icon, and a contextValue no menu contribution
      // matches — a separator that grows a right-click menu has stopped separating.
      const item = new vscode.TreeItem('', vscode.TreeItemCollapsibleState.None);
      item.id = `separator:${element.afterAccountId}`;
      item.contextValue = 'separator';
      return item;
    }

    if (element.kind === 'account') {
      const item = new vscode.TreeItem(
        element.account.email,
        // Open unless the person shut it. It used to be `Expanded` unconditionally, which meant
        // a collapsed account re-opened on the next repaint — and a repaint happens on every
        // edit, every pulled sync and every keystroke in the filter.
        this.collapsible(element, true),
      );
      item.id = `account:${element.account.accountId}`;
      // The menu a row offers is chosen HERE, by the value the `when` clauses match. Ordinary
      // accounts keep the exact string every other entry was contributed against.
      item.contextValue = accountContextValue(
        this.orgAccess.get(element.account.accountId) ?? 'none',
      );
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
      // The three counts (T32) replace the row's plus: entries / trash / shared, zeros
      // written out. Colours for the numbers are not expressible in a description — the
      // limit is recorded in accountCounts.ts.
      const counts = accountCounts(
        this.storage.getNodes(element.account.accountId),
        (id) => this.storage.getNode(element.account.accountId, id),
        this.sharing?.ownShares ?? [],
        element.account.accountId,
      );
      item.description = [
        element.account.provider,
        formatAccountCounts(counts),
        ready !== undefined && !ready.ready ? ready.reason : undefined,
      ]
        .filter(Boolean)
        .join('  ·  ');
      item.tooltip = `${counts.entries} entries · ${counts.trash} in the Trash · ${counts.shared} shared with this account`;
      return item;
    }

    if (element.kind === 'dependents') {
      return dependentsItem(
        element.accountId,
        element.node,
        this.dependencies.indexFor(element.accountId),
        this.collapsible(element, false),
      );
    }
    if (element.kind === 'dependentsFolder') {
      return dependentsFolderItem(element, this.collapsible(element, false));
    }
    if (element.kind === 'dependentEntity') {
      // A DIFFERENT id for the same node — VS Code keys expansion and selection on it, so the
      // two positions of one entity must not share one or they would move together.
      return this.entityItem(
        element.accountId,
        element.node,
        `dep:${element.accountId}:${element.targetId}:${element.node.id}`,
      );
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
        // While filtering the term decides, as it always has. Otherwise the person does: a
        // folder left open stays open across a repaint, a reload and a reboot.
        filtering ? vscode.TreeItemCollapsibleState.Expanded : this.collapsible(element, false),
      );
      item.id = filtering ? `${accountId}:${node.id}:q${this.query}` : `${accountId}:${node.id}`;
      // The trash says what it is and when it empties, in the place a folder says its type —
      // "kept until emptied" beside a folder full of deleted secrets is the fact that matters.
      const trash = isTrashFolder(node);
      item.contextValue = trash ? 'trashFolder' : 'folder';
      item.iconPath = trash
        ? new vscode.ThemeIcon('trash', FOLDER_COLOR)
        : folderIcon(node.folderType);
      if (trash) {
        item.description = describeRetention(node);
      } else if (node.folderType !== undefined && node.folderType !== 'any') {
        item.description = node.folderType;
      }
      return item;
    }

    return this.entityItem(accountId, node, `${accountId}:${node.id}`);
  }

  /**
   * An entity's row — built here for BOTH of the places an entity can appear: its own row, and
   * again under whatever it is a dependency of.
   *
   * <p>One builder rather than two, because the shadow row must offer the same menu, the same
   * icon and the same tint as the real one — an entry you can Connect to is one you can Connect
   * to wherever you happen to be looking at it from. Only the `id` differs, and it has to: VS
   * Code keys expansion and selection on it, so two positions sharing one id would move
   * together.</p>
   */
  private entityItem(accountId: string, node: TreeNode, id: string): vscode.TreeItem {
    const details = node.details;
    const item = new vscode.TreeItem(
      markInvalid(node.name, this.invalidConfigIds.has(entityKey(accountId, node.id))),
      this.entityCollapsible(accountId, node),
    );
    item.id = id;
    // A synthetic address, not a file: it is what lets a FileDecorationProvider colour the
    // LABEL, which a TreeItem cannot do on its own. Safe to set unconditionally because
    // `label` and `iconPath` are both given explicitly below — a resourceUri only supplies
    // those two when they are absent.
    item.resourceUri = depUri(accountId, node.id);
    // Capability flags drive the context menu: only actions that are
    // actually possible for THIS entity are offered.
    item.contextValue = entityContextValue(
      details,
      this.hasPassword(accountId, node.id),
      this.isBridged?.(accountId, node.id) ?? false,
    );
    // Both the kind glyph and — where an agent may reach this entry — the access ladder, because
    // a row has exactly one icon slot. See `entityIcon` for what that costs and why.
    item.iconPath = entityIcon(
      this.extensionUri,
      node,
      (id) => this.storage.getNode(accountId, id),
      this.hasHistory(accountId, node.id),
    );
    // What it points at, and — for a short-lived entry — how long it has. Deliberately in the
    // description rather than as a second icon tint: the tint already means "has previous
    // versions", and one channel carrying two meanings tells you neither. Same separator the
    // account row uses.
    item.description = [describeTarget(node), describeRemaining(node, Date.now())]
      .filter(Boolean)
      .join('  ·  ');
    item.tooltip = buildTooltip(node);
    // Single click only selects (the handler ignores it); a DOUBLE click
    // opens the read-only viewer. Actions live in the context menu.
    //
    // The argument is the PLAIN node element even when this row is a shadow one, so the
    // handler opens the entity rather than learning that an entity has two positions.
    item.command = {
      command: 'credSshManager.itemClicked',
      title: 'Open',
      arguments: [{ kind: 'node', accountId, node }],
    };
    return item;
  }

  /**
   * A twisty when the entity has kept versions, or something depends on it — or both.
   *
   * <p>The two sub-trees are siblings, never alternatives: an entry can have been edited AND be
   * something three other entries need, and being told about only one of those is worse than
   * being told about neither.</p>
   */
  /**
   * Open, closed, or open-because-it-was-left-open.
   *
   * <p>Every expandable row goes through here rather than naming a state directly, which is what
   * makes "the tree does not forget" one rule instead of one per row kind.</p>
   */
  private collapsible(
    element: TreeElement,
    defaultOpen: boolean,
  ): vscode.TreeItemCollapsibleState {
    return this.expansion?.isOpen(expansionKey(element), defaultOpen) ?? defaultOpen
      ? vscode.TreeItemCollapsibleState.Expanded
      : vscode.TreeItemCollapsibleState.Collapsed;
  }

  private entityCollapsible(
    accountId: string,
    node: TreeNode,
  ): vscode.TreeItemCollapsibleState {
    const expandable =
      this.hasHistory(accountId, node.id) || this.dependencies.hasDependents(accountId, node.id);
    return expandable
      ? this.collapsible({ kind: 'node', accountId, node }, false)
      : vscode.TreeItemCollapsibleState.None;
  }

  // ---------- drag & drop ----------

  // eslint-disable-next-line complexity
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
    // Say what was left out. The bulk actions report their skips through describeSkips;
    // a drag that silently narrowed a two-profile selection to one was the odd one out.
    const skipped = nodes.length - payload.ids.length;
    if (skipped > 0) {
      const email = this.storage.getAccount(accountId)?.email ?? accountId;
      void vscode.window.showWarningMessage(
        `Dragging ${payload.ids.length} item(s) from ${email}. Skipped: ${skipped} belong to another profile — a move stays inside one profile.`,
      );
    }
    dataTransfer.set(DND_MIME, new vscode.DataTransferItem(payload));
  }

  // eslint-disable-next-line complexity, max-lines-per-function
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
        resolveKind(moving.details) !== targetFolder.folderType
      ) {
        void vscode.window.showWarningMessage(
          `Folder "${targetFolder.name}" holds only ${targetFolder.folderType} entities — "${moving.name}" is ${resolveKind(moving.details)}.`,
        );
        continue;
      }
      await this.storage.moveNode(payload.accountId, id, newParentId);
    }
    this.refresh();
    this.onMutate?.();
  }
}

/** Team/people rows are dark blue so they read as "other people", not data. */
const TEAM_COLOR = new vscode.ThemeColor('credSshManager.teamIcon');






