/* eslint-disable complexity, max-lines-per-function -- command registrations moved verbatim out of extension.ts
   (roadmap A1 stage 2, 2026-08-28): one function that registers a family of closures, each the size it
   was. The ceilings are a boundary for NEW code here; a handler meets them when it is next touched. */
import { ViewerClicks } from '../viewerClicks';
import { TreeNode } from '../types';
import { AgentDoors } from '../agentDoors';
import { createDiagnosticLog } from '../diagnosticLog';
import { CredTreeDataProvider } from '../treeDataProvider';
import { SharingManager } from '../sharingManager';
import { StorageManager } from '../storageManager';
import { TreeElement } from '../types';
import { VaultKeys } from '../vaultKeys';
import * as vscode from 'vscode';
import { showHelp } from '../helpPanel';
import { wireSearchBox } from '../searchBox';
import { asElement } from '../commandTargets';
import { entityKey } from '../entityFlags';
import { clickToView } from '../viewerClicks';
import { pinPreview } from '../entityViewPanel';
import { openEntityViewer } from '../entityViewerCommands';
import { quickOpenItems } from '../quickOpen';
import { ENTITY_KIND_LABELS } from '../types';
import { askForEntryId } from '../mcpHooks';
import { findById } from '../extension';
export interface ViewCommandsHost {
  readonly announceArrival: (accountId: string, entityId: string) => Promise<void>;
  readonly clicks: ViewerClicks;
  readonly doorsAt: (accountId: string, node: TreeNode) => AgentDoors;
  readonly log: ReturnType<typeof createDiagnosticLog>;
  readonly moveFolder: (target: unknown, direction: -1 | 1) => Promise<void>;
  readonly provider: CredTreeDataProvider;
  readonly register: (command: string, handler: (...args: unknown[]) => unknown) => void;
  readonly scanText: (text: string, what: string) => Promise<void>;
  readonly sharing: SharingManager;
  readonly storage: StorageManager;
  readonly treeView: vscode.TreeView<TreeElement>;
  readonly vaultKeys: VaultKeys;
}

export function registerViewCommands(host: ViewCommandsHost): void {
  const { announceArrival, clicks, doorsAt, log, moveFolder, provider, register, scanText, sharing, storage, treeView, vaultKeys } = host;

  register('credSshManager.refresh', () => {
    provider.refresh();
    void sharing.reload();
  });

  /**
   * Show the diagnostics, and say where the file is (audit A6).
   *
   * <p>The channel is what somebody reads now; the path is what they attach to a bug report,
   * which is the case this exists for — a failure that has already scrolled away.</p>
   */
  register('credSshManager.showDiagnostics', () => {
    log.show();
    void vscode.window.showInformationMessage(`Diagnostics for this window: ${log.file}`, 'Copy path').then(
      (choice) => (choice === 'Copy path' ? vscode.env.clipboard.writeText(log.file) : undefined),
    );
  });

  /**
   * The filter row's field.
   *
   * <p>An input box rather than a QuickPick: a QuickPick would put the results in a floating
   * list, and the request was to filter the tree you are looking at. `onDidChangeValue` is
   * what makes it filter as you type; Escape puts back whatever was filtered before, so a
   * cancelled search is not a lost one.</p>
   */
  // T21/T22: the help page — the yellow question mark in the view's title bar.
  register('credSshManager.help', () => showHelp());

  register('credSshManager.search', () => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    // Wiring in searchBox.ts, where it is tested — including the T15 flag that lets a person
    // CLICK what the filter found without the box reading it as "never mind".
    wireSearchBox(vscode.window.createInputBox(), {
      before: provider.searchQuery,
      apply: (term) => provider.setSearchQuery(term),
    });
  });

  register('credSshManager.clearSearch', async () => {
    // Keep the reader's place (T15's second half): the row selected under the filter is
    // revealed — and briefly tinted, the same "here it is" an accepted share gets — in the
    // now-unfiltered tree. Clear FIRST: a filtered-out row cannot be revealed, and that
    // failure is silent (the goToOriginalFolder note).
    const selected = treeView.selection.find(
      (element): element is Extract<typeof element, { kind: 'node' }> =>
        (element as { kind?: string }).kind === 'node',
    );
    provider.setSearchQuery('');
    if (selected !== undefined) {
      await announceArrival(selected.accountId, selected.node.id);
    }
  });

  /**
   * From a folder inside the "Depended on by" list to that folder where it really lives.
   *
   * <p>The filter is cleared first, and that is not tidiness: a filtered-out row cannot be
   * revealed, so a reveal into an active filter silently does nothing — the worst outcome for a
   * button whose entire job is "take me there".</p>
   */
  register('credSshManager.goToOriginalFolder', async (target?: unknown) => {
    const element = asElement(target);
    if (element?.kind !== 'dependentsFolder' || element.folderId === null) {
      return;
    }
    const folder = storage.getNode(element.accountId, element.folderId);
    if (folder === undefined) {
      void vscode.window.showWarningMessage('That folder is no longer in this vault.');
      return;
    }
    provider.setSearchQuery('');
    await treeView.reveal(
      { kind: 'node', accountId: element.accountId, node: folder },
      { select: true, focus: true, expand: true },
    );
  });

  register('credSshManager.scanClipboard', async () => {
    await scanText(await vscode.env.clipboard.readText(), 'the clipboard');
  });

  register('credSshManager.scanDocument', async () => {
    const editor = vscode.window.activeTextEditor;
    if (editor === undefined) {
      void vscode.window.showInformationMessage('Open a file first, then run this to scan it.');
      return;
    }
    const selection = editor.selection.isEmpty ? undefined : editor.document.getText(editor.selection);
    await scanText(
      selection ?? editor.document.getText(),
      selection === undefined ? 'this file' : 'the selection',
    );
  });

  register('credSshManager.folderUp', (target) => moveFolder(target, -1));

  register('credSshManager.folderDown', (target) => moveFolder(target, 1));

  register('credSshManager.itemClicked', async (target) => {
    const element = asElement(target);
    if (element?.kind !== 'node' || element.node.type !== 'entity' || !element.node.details) {
      return;
    }
    const key = entityKey(element.accountId, element.node.id);
    await clickToView(clicks, key, Date.now(), () => pinPreview(key), (tab) =>
      openEntityViewer(element.accountId, element.node, storage, doorsAt(element.accountId, element.node), tab),
    );
  });

  /**
   * Generate a secret and put it on the clipboard, without an entity to hang it on.
   *
   * <p>The form has its own buttons; this is for the times a password is needed for something
   * that is not stored here at all, which is most of them. It reports the entropy it drew
   * rather than a colour, because the number is the only part that means anything.</p>
   */
  /**
   * Go to an entity by name, across every account — the keyboard road into the tree.
   *
   * <p>It matches what the tree filter matches (`nodeHaystack`), so a picker can no more find a
   * password by its value than the filter can.</p>
   */
  register('credSshManager.quickOpen', async () => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const items = quickOpenItems(
      storage.getAccounts().map((account) => ({
        accountId: account.accountId,
        email: account.email,
        nodes: storage.getNodes(account.accountId),
      })),
    );
    if (items.length === 0) {
      void vscode.window.showInformationMessage('No entities yet — add an account and create one first.');
      return;
    }
    const picked = await vscode.window.showQuickPick(
      items.map((item) => ({ ...item, label: `$(${ENTITY_KIND_LABELS[item.entityKind].icon}) ${item.label}` })),
      { title: 'Go to credential', matchOnDescription: true, matchOnDetail: true, placeHolder: 'Type a name, host or user' },
    );
    if (picked === undefined) {
      return;
    }
    const node = storage.getNode(picked.accountId, picked.nodeId);
    if (node === undefined) {
      return;
    }
    // Straight to the viewer rather than revealing the row: `TreeView.reveal` needs
    // `getParent` on the provider, which this one does not implement — and opening the thing
    // asked for is what the picker was for anyway.
    await openEntityViewer(picked.accountId, node, storage, doorsAt(picked.accountId, node));
  });

  /**
   * Find an entry by the id an agent quoted, and show it.
   *
   * <p>An agent that lists your entries gets an id with each, and the id is the one thing it can
   * hand back that names an entry unambiguously. It is also the one thing the tree filter cannot
   * find: `nodeHaystack` searches name, host, user, port and tags, and an identifier is
   * deliberately not among them — "if a row does not say it out loud, you cannot search for it".
   * So this is not a search. It resolves the id and reveals the row.</p>
   *
   * <p>The filter is cleared first. A filtered tree may not contain the row at all, and
   * `reveal` on a row the provider is not currently offering does nothing — silently, which
   * would read as the id being wrong.</p>
   */
  register('credSshManager.revealById', async (...args: unknown[]) => {
    const given = typeof args[0] === 'string' ? args[0] : await askForEntryId();
    if (given === undefined) {
      return;
    }
    const found = findById(storage, given.trim());
    if (found === undefined) {
      void vscode.window.showWarningMessage(
        `No entry with id "${given.trim()}" is in any unlocked vault. Ids are per vault — check the right account is signed in.`,
      );
      return;
    }
    provider.setSearchQuery('');
    await treeView.reveal(found, { select: true, focus: true, expand: true });
  });
}
