import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { copiedMessage, copySecret } from './secretClipboard';
import { AuthError, signIn } from './authManager';
import { backupToNas, restoreFromBackup } from './backupManager';
import {
  formatEntityBlock,
  pickAccount,
  pickFolderType,
  pickTargetFolder,
  promptFolderName,
  showEntityDetails,
} from './dialogs';
import { EntityFormValues, KeyCandidate, showEntityForm } from './entityFormPanel';
import { showEntityView } from './entityViewPanel';
import { GoogleAuthProvider } from './googleAuthProvider';
import { nasPathFor, setAccountNasPath } from './nasPaths';
import { backupPathFor, setAccountBackupPath } from './backupPaths';
import { BackupScheduler } from './backupScheduler';
import { isServerLocation } from './vaultTransport';
import {
  forgetMaterializedKey,
  installKeyToSystem,
  materializePrivateKey,
  purgeMaterializedKeys,
} from './keyInstaller';
import { StorageManager } from './storageManager';
import { SyncManager } from './syncManager';
import { buildSshCommand, openSshTerminal } from './terminalManager';
import { DB_DEFAULT_PORTS, parseDbConnectionString } from './dbConnString';
import { openInDbExtension } from './dbLauncher';
import { openShare, resolveShares, sealShare, sharesFromEnvelope } from './shareFormat';
import { SharingManager } from './sharingManager';
import { TransportFactory } from './transportFactory';
import { VaultKeys } from './vaultKeys';
import {
  KeyWrap,
  isKeyWrap,
  newMasterKey,
  newPrfSalt,
  removeWrap,
  upsertWrap,
  webauthnWraps,
  wrapWithPin,
  wrapWithPrf,
} from './keyWrap';
import {
  encryptJsonWrapped,
  readVaultVersion,
  readVaultWraps,
  resignEnvelopeWraps,
} from './cryptoUtils';
import { registerSecurityKey } from './webauthnPrf';
import { validatePin } from './pinPolicy';
import { CredTreeDataProvider, VIEW_ID } from './treeDataProvider';
import {
  AuthProvider,
  EntityKind,
  StoredAccount,
  EntityMetadata,
  OwnedShare,
  SharePayload,
  TeamMember,
  TreeElement,
  TreeNode,
  kindOf,
} from './types';

export function activate(context: vscode.ExtensionContext): void {
  const storage = new StorageManager(context.globalState, context.secrets);
  const provider = new CredTreeDataProvider(storage);
  const storageDir = context.globalStorageUri.fsPath;
  // Never let decrypted SSH key material outlive a session: clear any that a
  // crash left behind, and clear again on shutdown (see deactivate()).
  purgeMaterializedKeys(storageDir);
  context.subscriptions.push({ dispose: () => purgeMaterializedKeys(storageDir) });

  // VS Code ships no built-in "google" auth provider — register our own so
  // getSession('google', …) opens the browser instead of timing out.
  const googleAuth = new GoogleAuthProvider(context.secrets);
  context.subscriptions.push(googleAuth);

  const treeView = vscode.window.createTreeView(VIEW_ID, {
    treeDataProvider: provider,
    dragAndDropController: provider,
    showCollapseAll: true,
  });

  // Unlock coordinator (PIN / security keys / cached master keys).
  const vaultKeys = new VaultKeys(context.secrets);

  // Transport per account (NAS folder or vault server) + sharing on top.
  const transports = new TransportFactory(storage, googleAuth);
  const sharing = new SharingManager(storage, transports, () => provider.refresh());
  provider.sharing = sharing;
  void sharing.reload();

  // NAS auto-sync (two-way merge); it re-renders the tree after pulling.
  const sync = new SyncManager(
    storage,
    vaultKeys,
    transports,
    () => provider.refresh(),
    () => void sharing.reload(),
  );
  context.subscriptions.push(sync);

  // Dated snapshots, separately from sync. Constructed AFTER the sync manager because a
  // snapshot is a copy of what sync maintains — with no sync location there is nothing to
  // copy, and the scheduler says so rather than inventing an export of its own.
  const backups = new BackupScheduler(storage, transports, context.globalState, (message) =>
    console.log(`[creds-for-devs/backup] ${message}`),
  );
  context.subscriptions.push(backups);

  // Auto-lock. Checked on a coarse timer: the window is measured in tens of minutes, so
  // a minute of drift costs nothing and a tighter tick would only wake the machine more.
  const autoLock = setInterval(() => {
    const minutes = vscode.workspace
      .getConfiguration('credSshManager')
      .get<number>('autoLockMinutes', 60);
    if (vaultKeys.dueForAutoLock(Date.now(), minutes)) {
      vaultKeys.lock();
      provider.refresh();
      void vscode.window.showInformationMessage(
        `Vaults locked after ${minutes} minutes idle. Local credentials still work; sync resumes when you unlock.`,
      );
    }
  }, 60_000);
  context.subscriptions.push({ dispose: () => clearInterval(autoLock) });

  provider.onMutate = () => sync.notifyChange();
  const mutated = () => {
    provider.refresh();
    sync.notifyChange();
  };

  const register = (command: string, handler: (...args: unknown[]) => unknown) =>
    context.subscriptions.push(vscode.commands.registerCommand(command, handler));

  register('credSshManager.refresh', () => {
    provider.refresh();
    void sharing.reload();
  });
  register('credSshManager.syncNow', () => sync.syncNow());
  register('credSshManager.setSyncPin', () => sync.setPin());

  // ---------- account profiles ----------

  register('credSshManager.addAccount', async () => {
    const picked = await vscode.window.showQuickPick(
      [
        { label: '$(azure) Microsoft', provider: 'microsoft' as AuthProvider },
        { label: '$(globe) Google', provider: 'google' as AuthProvider },
      ],
      { placeHolder: 'Sign in with…' },
    );
    if (picked === undefined) {
      return;
    }
    try {
      const account = await signIn(picked.provider);
      const isNewAccount = storage.getAccount(account.accountId) === undefined;
      await storage.upsertAccount(account);
      mutated();
      void vscode.window.showInformationMessage(`Added account profile ${account.email}.`);
      if (isNewAccount) {
        // Pull any existing remote vault first (quietly), so a returning user's
        // data lands before we decide whether to create the default folders.
        try {
          await sync.pullAccount(account.accountId);
        } catch {
          // Best-effort: a brand-new user usually has no sync location yet.
        }
        // Seed the default folder set only into a still-empty, never-seeded
        // account — an existing/renamed structure is left untouched.
        if (await storage.seedDefaultFolders(account.accountId)) {
          mutated();
        }
      }
    } catch (error) {
      const message = error instanceof AuthError ? error.message : String(error);
      void vscode.window.showErrorMessage(message);
    }
  });

  register('credSshManager.resetGoogleOAuth', async () => {
    const confirmed = await vscode.window.showWarningMessage(
      'Forget the stored Google client secret and all Google sign-in sessions?',
      { modal: true },
      'Reset',
    );
    if (confirmed !== 'Reset') {
      return;
    }
    await googleAuth.reset();
    void vscode.window.showInformationMessage('Google OAuth state cleared.');
  });

  // Per-account vault location: a folder (NAS/SMB) or a vault server URL.
  register('credSshManager.setBackupLocation', async (target) => {
    const element = asElement(target);
    if (element?.kind !== 'account') {
      return;
    }
    const current = backupPathFor(element.account);
    const syncLocation = nasPathFor(element.account);
    const picked = await vscode.window.showOpenDialog({
      title: `Snapshot folder for ${element.account.email}`,
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Keep snapshots here',
      defaultUri: current !== undefined ? vscode.Uri.file(current) : undefined,
    });
    const folder = picked?.[0]?.fsPath;
    if (folder === undefined) {
      return;
    }

    // Snapshots exist to survive the sync location. Putting both on one disk means one
    // ransomware run, one dying drive or one bad merge takes the vault and its history
    // together — which is the failure the snapshots were for.
    if (syncLocation !== undefined && !isServerLocation(syncLocation)) {
      const trim = (p: string) => p.toLowerCase().replace(/[\\/]+$/, '');
      const child = trim(folder);
      const parent = trim(syncLocation);
      const sameDisk =
        child === parent ||
        child.startsWith(parent + '/') ||
        child.startsWith(parent + '\\');
      if (sameDisk) {
        const proceed = await vscode.window.showWarningMessage(
          'That is inside the sync location. A snapshot is meant to survive whatever happens to the live vault — on the same disk it will not.',
          { modal: true },
          'Use it anyway',
        );
        if (proceed !== 'Use it anyway') {
          return;
        }
      }
    }

    await setAccountBackupPath(element.account.email, folder);
    void vscode.window.showInformationMessage(
      `${element.account.email}: snapshots will be written to ${folder}.`,
    );
    void backups.runDue(true);
  });

  register('credSshManager.backupNow', async () => {
    await backups.runDue(true);
    void vscode.window.showInformationMessage('Vault snapshot taken.');
  });

  register('credSshManager.setAccountNasPath', async (target) => {
    const element = asElement(target);
    if (element?.kind !== 'account') {
      return;
    }
    const current = nasPathFor(element.account);
    const how = await vscode.window.showQuickPick(
      [
        { label: '$(folder-opened) Folder…', mode: 'folder' as const },
        { label: '$(cloud) Vault server URL…', mode: 'server' as const },
      ],
      {
        title: `Sync location for ${element.account.email}`,
        placeHolder: current !== undefined ? `Current: ${current}` : 'Not configured yet',
      },
    );
    if (how === undefined) {
      return;
    }
    let location: string | undefined;
    if (how.mode === 'folder') {
      const picked = await vscode.window.showOpenDialog({
        title: `Sync folder for ${element.account.email}`,
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Use this folder',
        defaultUri:
          current !== undefined && !isServerLocation(current)
            ? vscode.Uri.file(current)
            : undefined,
      });
      location = picked?.[0]?.fsPath;
    } else {
      const entered = await vscode.window.showInputBox({
        title: `Vault server for ${element.account.email}`,
        prompt: 'Base URL of the Cred Vault Server (https recommended)',
        value: current !== undefined && isServerLocation(current) ? current : 'https://',
        ignoreFocusOut: true,
        validateInput: (v) =>
          isServerLocation(v) ? undefined : 'Must start with http:// or https://',
      });
      location = entered?.trim().replace(/\/+$/, '');
      if (
        location !== undefined &&
        /^http:\/\//i.test(location) &&
        !/^http:\/\/(localhost|127\.0\.0\.1)([:/]|$)/i.test(location)
      ) {
        const proceed = await vscode.window.showWarningMessage(
          'This is a plain-HTTP URL. Your sign-in token and the encrypted vault would travel unencrypted. Use https:// unless a trusted proxy terminates TLS.',
          { modal: true },
          'Use it anyway',
        );
        if (proceed !== 'Use it anyway') {
          return;
        }
      }
    }
    if (location === undefined || location.length === 0) {
      return;
    }
    await setAccountNasPath(element.account.email, location);
    void vscode.window.showInformationMessage(
      `${element.account.email} now syncs to ${location}.`,
    );
    sync.notifyChange();
    void sharing.reload();
  });

  register('credSshManager.removeAccount', async (target) => {
    const element = asElement(target);
    if (element?.kind !== 'account') {
      return;
    }
    const confirmed = await vscode.window.showWarningMessage(
      `Remove profile ${element.account.email} and delete its stored tree and passwords? This cannot be undone.`,
      { modal: true },
      'Remove',
    );
    if (confirmed !== 'Remove') {
      return;
    }
    // Offer to also wipe the encrypted vault (and inbox) at the sync location,
    // not just the local copy.
    const transport = transports.forAccount(element.account);
    if (transport !== undefined) {
      const wipe = await vscode.window.showWarningMessage(
        `Also delete ${element.account.email}'s encrypted vault from ${transport.location}? Other machines syncing this account will lose it too.`,
        { modal: true },
        'Delete remote too',
        'Keep remote',
      );
      if (wipe === undefined) {
        return; // Esc — abort the whole removal
      }
      if (wipe === 'Delete remote too') {
        try {
          await transport.deleteVault(element.account);
        } catch (error) {
          void vscode.window.showWarningMessage(
            `Local profile removed, but the remote vault could not be deleted: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }
    await storage.removeAccount(element.account.accountId);
    if (element.account.provider === 'google') {
      await googleAuth.removeSessionsForAccount(element.account.accountId);
    }
    mutated();
    void vscode.window.showInformationMessage(
      element.account.provider === 'microsoft'
        ? `Removed profile ${element.account.email}. To also sign out of the Microsoft session, use the Accounts menu in the Activity Bar.`
        : `Signed out and removed profile ${element.account.email}.`,
    );
  });

  // ---------- folder / entity CRUD ----------

  register('credSshManager.addFolder', async (target) => {
    const location = await resolveLocation(asElement(target), storage, 'Add folder to which profile?');
    if (location === undefined) {
      return;
    }
    const name = await promptFolderName();
    if (name === undefined) {
      return;
    }
    const folderType = await pickFolderType();
    if (folderType === undefined) {
      return;
    }
    await storage.addNode(location.accountId, {
      id: StorageManager.newId(),
      name,
      type: 'folder',
      parentId: location.parentId,
      folderType,
    });
    mutated();
  });

  // Manual folder ordering among siblings.
  const moveFolder = async (target: unknown, direction: -1 | 1) => {
    const element = asElement(target);
    if (element?.kind !== 'node' || element.node.type !== 'folder') {
      return;
    }
    const { accountId, node } = element;
    const siblings = storage
      .getChildren(accountId, node.parentId ?? null)
      .filter((n) => n.type === 'folder');
    const index = siblings.findIndex((n) => n.id === node.id);
    const swapWith = index + direction;
    if (index < 0 || swapWith < 0 || swapWith >= siblings.length) {
      return; // already at the edge
    }
    // Normalize orders to the current visual positions, then swap.
    const reordered = [...siblings];
    [reordered[index], reordered[swapWith]] = [reordered[swapWith], reordered[index]];
    for (const [i, folder] of reordered.entries()) {
      if (folder.sortOrder !== i) {
        await storage.updateNode(accountId, { ...folder, sortOrder: i });
      }
    }
    mutated();
  };
  register('credSshManager.folderUp', (target) => moveFolder(target, -1));
  register('credSshManager.folderDown', (target) => moveFolder(target, 1));

  register('credSshManager.changeFolderType', async (target) => {
    const element = asElement(target);
    if (element?.kind !== 'node' || element.node.type !== 'folder') {
      return;
    }
    const folderType = await pickFolderType(element.node.folderType);
    if (folderType === undefined) {
      return;
    }
    await storage.updateNode(element.accountId, { ...element.node, folderType });
    mutated();
  });

  register('credSshManager.addEntity', async (target) => {
    const location = await resolveLocation(asElement(target), storage, 'Add entity to which profile?');
    if (location === undefined) {
      return;
    }
    const id = StorageManager.newId();
    const result = await showEntityForm({
      mode: 'create',
      entityId: id,
      hasStoredPassword: false,
      hasStoredPrivateKey: false,
      hasStoredVpnConfig: false,
      hasStoredDbConnection: false,
      lockedKind: folderKindOf(storage, location.accountId, location.parentId),
      keyCandidates: await collectKeyCandidates(storage, location.accountId, id),
    });
    if (result === undefined) {
      return;
    }
    await storage.addNode(location.accountId, {
      id,
      name: result.details.name,
      type: 'entity',
      parentId: location.parentId,
      details: result.details,
    });
    await applySecrets(storage, location.accountId, id, result);
    mutated();
  });

  register('credSshManager.editNode', async (target) => {
    const element = asElement(target);
    if (element?.kind !== 'node') {
      return;
    }
    await editNode(element.accountId, element.node, storage, mutated);
  });

  register('credSshManager.deleteNode', async (target) => {
    const element = asElement(target);
    if (element?.kind !== 'node') {
      return;
    }
    const { accountId, node } = element;
    const what =
      node.type === 'folder'
        ? `folder "${node.name}" and everything inside it`
        : `entity "${node.name}" and its stored secrets`;
    const confirmed = await vscode.window.showWarningMessage(
      `Delete ${what}? This cannot be undone.`,
      { modal: true },
      'Delete',
    );
    if (confirmed !== 'Delete') {
      return;
    }
    const removed = await storage.deleteNodeRecursive(accountId, node.id);
    mutated();
    void vscode.window.showInformationMessage(
      removed.length === 1 ? `Deleted "${removed[0]}".` : `Deleted ${removed.length} items.`,
    );
  });

  register('credSshManager.moveNode', async (target) => {
    const element = asElement(target);
    if (element?.kind !== 'node') {
      return;
    }
    const picked = await pickTargetFolder(storage, element.accountId, element.node);
    if (picked === undefined) {
      return;
    }
    if (element.node.type === 'entity' && picked.parentId !== null) {
      const targetFolder = storage.getNode(element.accountId, picked.parentId);
      const required = targetFolder?.folderType;
      if (
        required !== undefined &&
        required !== 'any' &&
        kindOf(element.node.details) !== required
      ) {
        void vscode.window.showWarningMessage(
          `Folder "${targetFolder?.name}" holds only ${required} entities — "${element.node.name}" is ${kindOf(element.node.details)}.`,
        );
        return;
      }
    }
    await storage.moveNode(element.accountId, element.node.id, picked.parentId);
    mutated();
  });

  // ---------- entity actions ----------

  // Single click = select only; double click (two clicks on the same row
  // within 500ms) = open the read-only viewer with copy buttons.
  let lastClick = { id: '', time: 0 };
  register('credSshManager.itemClicked', async (target) => {
    const element = asElement(target);
    if (element?.kind !== 'node' || element.node.type !== 'entity' || !element.node.details) {
      return;
    }
    const now = Date.now();
    const isDouble = lastClick.id === element.node.id && now - lastClick.time < 500;
    lastClick = { id: element.node.id, time: now };
    if (!isDouble) {
      return;
    }
    await openEntityViewer(element.accountId, element.node, storage);
  });

  register('credSshManager.viewDetails', async (target) => {
    const element = asElement(target);
    if (element?.kind !== 'node' || !element.node.details) {
      return;
    }
    await openDetails(element.accountId, element.node, storage, mutated, storageDir);
  });

  register('credSshManager.copyPassword', async (target) => {
    const element = asElement(target);
    if (element?.kind !== 'node' || !element.node.details) {
      return;
    }
    const password = await storage.getPassword(element.accountId, element.node.details.id);
    if (password === undefined) {
      void vscode.window.showWarningMessage(
        `"${element.node.name}" has no stored password.`,
      );
      return;
    }
    await copySecret(vscode.env.clipboard, password);
    void vscode.window.showInformationMessage(
      copiedMessage(`Password of "${element.node.name}"`),
    );
  });

  // Per-entry SSH on/off switch (default is off for new entities).
  register('credSshManager.toggleSsh', async (target) => {
    const element = asElement(target);
    if (element?.kind !== 'node' || !element.node.details) {
      return;
    }
    const details = { ...element.node.details, isSshEnabled: !element.node.details.isSshEnabled };
    await storage.updateNode(element.accountId, { ...element.node, details });
    mutated();
    void vscode.window.showInformationMessage(
      `SSH ${details.isSshEnabled ? 'enabled' : 'disabled'} for "${element.node.name}".`,
    );
  });

  register('credSshManager.connectSsh', async (target) => {
    const element = asElement(target);
    if (element?.kind === 'node' && element.node.details) {
      await connectEntity(element.accountId, element.node.details, storage, storageDir);
    }
  });

  register('credSshManager.installSshKey', async (target) => {
    const element = asElement(target);
    if (element?.kind !== 'node' || !element.node.details) {
      return;
    }
    const privateKey = await storage.getPrivateKey(element.accountId, element.node.details.id);
    await installKeyToSystem(element.node.details, privateKey);
  });

  // Write the stored VPN config back out as a file.
  register('credSshManager.saveVpnConfig', async (target) => {
    const element = asElement(target);
    if (element?.kind !== 'node' || !element.node.details) {
      return;
    }
    await saveVpnConfigToFile(element.accountId, element.node.details, storage);
  });

  // Open a database entity in the matching DB extension.
  register('credSshManager.connectDb', async (target) => {
    const element = asElement(target);
    if (element?.kind !== 'node' || !element.node.details) {
      return;
    }
    const connectionString = await storage.getDbConnection(
      element.accountId,
      element.node.details.id,
    );
    await openInDbExtension(element.node.details, connectionString);
  });

  register('credSshManager.copyDbConnection', async (target) => {
    const element = asElement(target);
    if (element?.kind !== 'node' || !element.node.details) {
      return;
    }
    const value = await storage.getDbConnection(element.accountId, element.node.details.id);
    if (value === undefined) {
      void vscode.window.showWarningMessage(
        `"${element.node.name}" has no stored connection string.`,
      );
      return;
    }
    await copySecret(vscode.env.clipboard, value);
    void vscode.window.showInformationMessage(
      copiedMessage(`Connection string of "${element.node.name}"`),
    );
  });

  // ---------- security keys (YubiKey / FIDO2) ----------

  /**
   * Register a security key for an account. A v1 (PIN-only) vault is
   * upgraded to v2 in the same step: its payload is re-encrypted under a
   * fresh master key, which is then wrapped for the PIN and for the key.
   */
  register('credSshManager.addSecurityKey', async (target) => {
    const account = await accountFromTargetOrPick(target, storage, 'Add a security key to…');
    if (account === undefined) {
      return;
    }
    const transport = transports.forAccount(account);
    if (transport === undefined) {
      void vscode.window.showErrorMessage(
        `Set a sync location for ${account.email} first — security keys are stored in its vault.`,
      );
      return;
    }
    const raw = await transport.readVault(account);
    if (raw === undefined) {
      void vscode.window.showErrorMessage(
        `${account.email} has no vault yet — run "Sync Now" once, then add the key.`,
      );
      return;
    }

    // Unlocking first proves we can re-wrap the very same master key.
    const key = await vaultKeys.unlock(account, raw, { interactive: true });
    if (key === undefined) {
      void vscode.window.showErrorMessage('Could not unlock the vault — key not added.');
      return;
    }
    const label = await vscode.window.showInputBox({
      title: 'Name this security key',
      prompt: 'Shown when the vault asks for a touch (e.g. "YubiKey 5C — work")',
      value: 'YubiKey',
      ignoreFocusOut: true,
    });
    if (label === undefined) {
      return;
    }

    try {
      const prfSalt = newPrfSalt();
      const prf = await registerSecurityKey(account.email, prfSalt);

      let wraps: KeyWrap[];
      let content: string;
      if (key.version === 2) {
        // Already wrapped: add one more wrap around the SAME master key.
        const master = Buffer.from(key.masterKeyBase64, 'base64');
        wraps = upsertWrap(
          readVaultWraps(raw).filter(isKeyWrap),
          wrapWithPrf(master, prf.credentialId, prfSalt, prf.secret, label.trim(), Date.now()),
        );
        content = resignEnvelopeWraps(raw, wraps, key.masterKeyBase64);
      } else {
        // Upgrade v1 → v2: new master key, payload re-encrypted, two wraps.
        const pin = await vaultKeys.storedPin(account);
        if (pin === undefined) {
          void vscode.window.showErrorMessage('A vault PIN is required before adding a key.');
          return;
        }
        const payload = vaultKeys.decrypt(raw, key);
        const master = newMasterKey();
        wraps = [
          wrapWithPin(master, account.accountId, pin, Date.now()),
          wrapWithPrf(master, prf.credentialId, prfSalt, prf.secret, label.trim(), Date.now()),
        ];
        content = encryptJsonWrapped(
          payload,
          master.toString('base64'),
          wraps,
          account,
          transport.embedsShares ? sharesFromEnvelope(raw) : undefined,
        );
      }
      await transport.writeVault(account, content, []);
      vaultKeys.clearCache(account.accountId);
      void vscode.window.showInformationMessage(
        `"${label.trim()}" can now unlock ${account.email}. The PIN keeps working as a fallback.`,
      );
      sync.notifyChange();
    } catch (error) {
      void vscode.window.showErrorMessage(
        `Adding the security key failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });

  register('credSshManager.removeSecurityKey', async (target) => {
    const account = await accountFromTargetOrPick(target, storage, 'Remove a security key from…');
    if (account === undefined) {
      return;
    }
    const transport = transports.forAccount(account);
    const raw = transport === undefined ? undefined : await transport.readVault(account);
    if (transport === undefined || raw === undefined || readVaultVersion(raw) !== 2) {
      void vscode.window.showInformationMessage(
        `${account.email} has no security keys registered.`,
      );
      return;
    }
    const wraps = readVaultWraps(raw).filter(isKeyWrap);
    const keys = webauthnWraps(wraps);
    if (keys.length === 0) {
      void vscode.window.showInformationMessage(
        `${account.email} has no security keys registered.`,
      );
      return;
    }
    const picked = await vscode.window.showQuickPick(
      keys.map((k) => ({
        label: k.label ?? 'Security key',
        description: new Date(k.createdAt).toLocaleDateString(),
        detail: k.id.slice(0, 16) + '…',
        wrap: k,
      })),
      { title: `Remove a security key from ${account.email}` },
    );
    if (picked === undefined) {
      return;
    }
    const confirmed = await vscode.window.showWarningMessage(
      `Remove "${picked.label}" from ${account.email}? It will no longer unlock this vault.`,
      { modal: true },
      'Remove',
    );
    if (confirmed !== 'Remove') {
      return;
    }
    const remaining = removeWrap(wraps, 'webauthn', picked.wrap.id);
    const keysLeft = webauthnWraps(remaining);
    const pin = await vaultKeys.storedPin(account);

    if (keysLeft.length === 0 && pin !== undefined) {
      // Last security key gone: RE-KEY the vault so the removed key (and any
      // stale backup that still holds its wrap) can no longer decrypt future
      // versions. Requires unlocking once to read the current payload.
      const key = await vaultKeys.unlock(account, raw, { interactive: true });
      if (key === undefined) {
        void vscode.window.showErrorMessage('Could not unlock to re-key — nothing removed.');
        return;
      }
      const payload = vaultKeys.decrypt(raw, key);
      const master = newMasterKey();
      const content = encryptJsonWrapped(
        payload,
        master.toString('base64'),
        [wrapWithPin(master, account.accountId, pin, Date.now())],
        account,
        transport.embedsShares ? sharesFromEnvelope(raw) : undefined,
      );
      await transport.writeVault(account, content, []);
      vaultKeys.clearCache(account.accountId);
      void vscode.window.showInformationMessage(
        `Removed "${picked.label}" and re-keyed the vault under your PIN — the removed key can no longer open it.`,
      );
    } else {
      // Other keys remain (re-keying would need each of them present to
      // re-wrap): drop this wrap, re-sign the envelope, and be honest that
      // copies already made stay openable by the removed key until a re-key.
      const key = await vaultKeys.unlock(account, raw, { interactive: true });
      if (key === undefined || key.version !== 2) {
        void vscode.window.showErrorMessage('Could not unlock to update wraps — nothing removed.');
        return;
      }
      await transport.writeVault(
        account,
        resignEnvelopeWraps(raw, remaining, key.masterKeyBase64),
        [],
      );
      vaultKeys.clearCache(account.accountId);
      void vscode.window.showInformationMessage(
        `Removed "${picked.label}". Note: existing backups/snapshots remain openable by that key until the vault is re-keyed (remove all security keys to force a re-key under the PIN).`,
      );
    }
  });

  register('credSshManager.unlockWithSecurityKey', async (target) => {
    const account = await accountFromTargetOrPick(target, storage, 'Unlock which account?');
    if (account === undefined) {
      return;
    }
    const transport = transports.forAccount(account);
    const raw = transport === undefined ? undefined : await transport.readVault(account);
    if (raw === undefined) {
      void vscode.window.showErrorMessage(`No vault stored for ${account.email} yet.`);
      return;
    }
    try {
      const key = await vaultKeys.unlock(account, raw, { interactive: true });
      if (key === undefined) {
        void vscode.window.showErrorMessage('Vault stays locked.');
        return;
      }
      void vscode.window.showInformationMessage(`Vault of ${account.email} unlocked.`);
      void sync.syncNow(account.accountId);
    } catch (error) {
      void vscode.window.showErrorMessage(
        `Unlock failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });

  register('credSshManager.lockVaults', () => {
    vaultKeys.lock();
    provider.refresh();
    void vscode.window.showInformationMessage(
      'Vaults locked. Background sync is paused until you unlock; your saved credentials still work locally.',
    );
  });

  // ---------- sharing ----------

  const promptSharePin = async (confirm: boolean): Promise<string | undefined> => {
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
  };

  const pickRecipients = async (
    senderAccountId: string,
    preselected?: TeamMember,
  ): Promise<TeamMember[] | undefined> => {
    if (preselected !== undefined) {
      return [preselected];
    }
    // Teams are account-scoped: offer only the sender account's NAS folder.
    const sender = storage.getAccount(senderAccountId);
    const candidates = sender !== undefined ? sharing.teamFor(sender) : [];
    if (candidates.length === 0) {
      void vscode.window.showInformationMessage(
        'No team found on this account\'s NAS folder — people appear after their first sync there.',
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
  };

  const deliverSharesBatch = async (
    senderAccountId: string,
    payloads: SharePayload[],
    recipients: TeamMember[],
    pin: string,
  ): Promise<void> => {
    const sender = storage.getAccount(senderAccountId);
    if (sender === undefined) {
      return;
    }
    const delivered: string[] = [];
    const failed: string[] = [];
    for (const recipient of recipients) {
      try {
        const items = payloads.map((p) =>
          sealShare(p, recipient.shareKeyId, sender, pin, Date.now()),
        );
        await sharing.appendShares(sender, recipient, items);
        delivered.push(recipient.account.email);
      } catch (error) {
        failed.push(
          `${recipient.account.email}: ${error instanceof Error ? error.message : String(error)}`,
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
    void sharing.reload();
  };
  const deliverShares = (
    senderAccountId: string,
    payload: SharePayload,
    recipients: TeamMember[],
    pin: string,
  ): Promise<void> => deliverSharesBatch(senderAccountId, [payload], recipients, pin);

  // Collect every entity in a folder subtree, with its folder chain.
  const collectFolderPayloads = async (
    accountId: string,
    folder: TreeNode,
  ): Promise<SharePayload[]> => {
    const payloads: SharePayload[] = [];
    const walk = async (
      node: TreeNode,
      path: Array<{ name: string; folderType?: TreeNode['folderType'] }>,
    ): Promise<void> => {
      if (node.type === 'entity') {
        payloads.push({
          ...(await buildSharePayload(storage, accountId, node)),
          folderPath: path,
        });
        return;
      }
      const childPath = [...path, { name: node.name, folderType: node.folderType }];
      for (const child of storage.getChildren(accountId, node.id)) {
        await walk(child, childPath);
      }
    };
    await walk(folder, []);
    return payloads;
  };

  register('credSshManager.shareEntity', async (target) => {
    const element = asElement(target);
    if (element?.kind !== 'node') {
      return;
    }
    const payloads =
      element.node.type === 'entity'
        ? [await buildSharePayload(storage, element.accountId, element.node)]
        : await collectFolderPayloads(element.accountId, element.node);
    if (payloads.length === 0) {
      void vscode.window.showInformationMessage(
        `Folder "${element.node.name}" holds no entities — nothing to share.`,
      );
      return;
    }
    const recipients = await pickRecipients(element.accountId);
    if (recipients === undefined) {
      return;
    }
    const pin = await promptSharePin(true);
    if (pin === undefined) {
      return;
    }
    await deliverSharesBatch(element.accountId, payloads, recipients, pin);
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
    const recipients = await pickRecipients(sender.accountId, preselected);
    if (recipients === undefined) {
      return;
    }
    const id = StorageManager.newId();
    const result = await showEntityForm({
      mode: 'create',
      entityId: id,
      hasStoredPassword: false,
      hasStoredPrivateKey: false,
      hasStoredVpnConfig: false,
      hasStoredDbConnection: false,
      keyCandidates: [],
    });
    if (result === undefined) {
      return;
    }
    const pin = await promptSharePin(true);
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
      },
    };
    await deliverShares(sender.accountId, payload, recipients, pin);
  });

  const importShared = async (share: OwnedShare, payload: SharePayload): Promise<void> => {
    // Recreate (or reuse by name) the sender's folder chain, if any.
    let parentId: string | null = null;
    for (const seg of payload.folderPath ?? []) {
      const existing: TreeNode | undefined = storage
        .getChildren(share.accountId, parentId)
        .find((n) => n.type === 'folder' && n.name === seg.name);
      if (existing !== undefined) {
        parentId = existing.id;
      } else {
        const folderId = StorageManager.newId();
        await storage.addNode(share.accountId, {
          id: folderId,
          name: seg.name,
          type: 'folder',
          parentId,
          folderType: seg.folderType,
        });
        parentId = folderId;
      }
    }
    // Always mint a FRESH local id: a peer must never address (and thus
    // silently overwrite) an entity that already exists in our vault.
    const node: TreeNode = {
      ...payload.node,
      id: StorageManager.newId(),
      parentId,
      children: undefined,
    };
    await storage.addNode(share.accountId, node);
    const { password, privateKey, vpnConfig, dbConnection } = payload.secrets;
    await storage.setPassword(share.accountId, node.id, password);
    if (privateKey !== undefined) {
      await storage.setPrivateKey(share.accountId, node.id, privateKey);
    }
    if (vpnConfig !== undefined) {
      await storage.setVpnConfig(share.accountId, node.id, vpnConfig);
    }
    if (dbConnection !== undefined) {
      await storage.setDbConnection(share.accountId, node.id, dbConnection);
    }
    if (payload.secrets.notes !== undefined) {
      await storage.setNotes(share.accountId, node.id, payload.secrets.notes);
    }
    await sharing.removeOwnShare(share);
  };

  register('credSshManager.acceptShare', async (target) => {
    const element = asElement(target);
    if (element?.kind !== 'sharedItem') {
      return;
    }
    const share = element.share;
    const pin = await vscode.window.showInputBox({
      title: `Accept "${share.item.entityName}" from ${share.item.fromEmail}`,
      prompt: 'Enter the share PIN',
      password: true,
      ignoreFocusOut: true,
    });
    if (pin === undefined) {
      return;
    }
    try {
      const payload = openShare(share.item, share.shareKeyId, pin);
      await importShared(share, payload);
      mutated();
      void sharing.reload();
      void vscode.window.showInformationMessage(`Accepted "${share.item.entityName}".`);
    } catch {
      void vscode.window.showErrorMessage(
        `"${share.item.entityName}" does not decrypt with that PIN.`,
      );
    }
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

  // Round-robin accept: try known PINs on everything, ask a new PIN for the
  // first item that resists, repeat until done or Esc.
  const acceptMany = async (items: OwnedShare[]): Promise<void> => {
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
      const { opened, remaining: rest } = resolveShares(remaining, pins);
      for (const o of opened) {
        await importShared(o, o.payload);
        imported++;
      }
      if (opened.length === 0) {
        void vscode.window.showWarningMessage('That PIN did not open any of the items.');
      }
      remaining = rest;
    }
    if (imported > 0) {
      mutated();
    }
    void sharing.reload();
    void vscode.window.showInformationMessage(
      `Accepted ${imported} item(s)${remaining.length > 0 ? `, ${remaining.length} still pending` : ''}.`,
    );
  };

  register('credSshManager.acceptAllFromSender', async (target) => {
    const element = asElement(target);
    if (element?.kind !== 'sharedSender') {
      return;
    }
    await acceptMany(sharing.ownShares.filter((s) => s.item.fromEmail === element.email));
  });

  register('credSshManager.acceptAllShares', async () => {
    await acceptMany([...sharing.ownShares]);
  });

  // ---------- backup ----------

  const runBackup = () => backupToNas(storage);
  const runRestore = () => restoreFromBackup(storage, mutated);
  register('credSshManager.backupToNas', runBackup);
  register('credSshManager.restoreBackup', runRestore);
  // Aliases kept for the original spec's command ids.
  register('extension.exportSecrets', runBackup);
  register('extension.importSecrets', runRestore);

  context.subscriptions.push(treeView);
}

export function deactivate(): void {
  // Nothing to clean up — everything lives in context.subscriptions.
}

// ---------- command bodies ----------

interface NodeLocation {
  accountId: string;
  parentId: string | null;
}

/** The entity kind a parent folder dictates, if it is typed. */
function folderKindOf(
  storage: StorageManager,
  accountId: string,
  parentId: string | null | undefined,
): EntityKind | undefined {
  if (parentId == null) {
    return undefined;
  }
  const folder = storage.getNode(accountId, parentId);
  const t = folder?.folderType;
  return t !== undefined && t !== 'any' ? t : undefined;
}

/** Where a new node goes, based on what the command was invoked on. */
async function resolveLocation(
  element: TreeElement | undefined,
  storage: StorageManager,
  accountPlaceholder: string,
): Promise<NodeLocation | undefined> {
  if (element?.kind === 'account') {
    return { accountId: element.account.accountId, parentId: null };
  }
  if (element?.kind === 'node') {
    return {
      accountId: element.accountId,
      parentId: element.node.type === 'folder' ? element.node.id : (element.node.parentId ?? null),
    };
  }
  const account = await pickAccount(storage, accountPlaceholder);
  return account === undefined ? undefined : { accountId: account.accountId, parentId: null };
}

/** Other entities of the account that can serve as an SSH key source. */
async function collectKeyCandidates(
  storage: StorageManager,
  accountId: string,
  excludeEntityId: string,
): Promise<KeyCandidate[]> {
  const candidates: KeyCandidate[] = [];
  for (const node of storage.getNodes(accountId)) {
    if (node.type !== 'entity' || node.id === excludeEntityId || !node.details) {
      continue;
    }
    const hasKey =
      node.details.isSshKey === true ||
      node.details.sshKeyPath !== undefined ||
      (await storage.getPrivateKey(accountId, node.id)) !== undefined;
    if (hasKey) {
      candidates.push({ id: node.id, name: node.name });
    }
  }
  return candidates;
}

/** Persist the password/private-key changes coming out of the form. */
async function applySecrets(
  storage: StorageManager,
  accountId: string,
  entityId: string,
  result: EntityFormValues,
): Promise<void> {
  if (result.clearPassword) {
    await storage.deletePassword(accountId, entityId);
  } else {
    await storage.setPassword(accountId, entityId, result.newPassword);
  }
  if (result.clearPrivateKey) {
    await storage.deletePrivateKey(accountId, entityId);
  } else if (result.newPrivateKey !== undefined) {
    await storage.setPrivateKey(accountId, entityId, result.newPrivateKey);
  }
  if (result.clearVpnConfig) {
    await storage.deleteVpnConfig(accountId, entityId);
  } else if (result.newVpnConfig !== undefined) {
    await storage.setVpnConfig(accountId, entityId, result.newVpnConfig);
  }
  if (result.clearDbConnection) {
    await storage.deleteDbConnection(accountId, entityId);
  } else if (result.newDbConnection !== undefined) {
    await storage.setDbConnection(accountId, entityId, result.newDbConnection);
  }
  await storage.setNotes(accountId, entityId, result.newNotes);
}

async function editNode(
  accountId: string,
  node: TreeNode,
  storage: StorageManager,
  onMutated: () => void,
): Promise<void> {
  if (node.type === 'folder') {
    const name = await promptFolderName(node.name);
    if (name === undefined) {
      return;
    }
    await storage.updateNode(accountId, { ...node, name });
    onMutated();
    return;
  }

  if (!node.details) {
    return;
  }
  const result = await showEntityForm({
    mode: 'edit',
    entityId: node.id,
    initial: node.details,
    lockedKind: folderKindOf(storage, accountId, node.parentId ?? null),
    hasStoredPassword: (await storage.getPassword(accountId, node.id)) !== undefined,
    hasStoredPrivateKey: (await storage.getPrivateKey(accountId, node.id)) !== undefined,
    hasStoredVpnConfig: (await storage.getVpnConfig(accountId, node.id)) !== undefined,
    hasStoredDbConnection: (await storage.getDbConnection(accountId, node.id)) !== undefined,
    initialDbConnection: await storage.getDbConnection(accountId, node.id),
    initialNotes: (await storage.getNotes(accountId, node.id)) ?? node.details?.notes,
    keyCandidates: await collectKeyCandidates(storage, accountId, node.id),
  });
  if (result === undefined) {
    return;
  }
  await storage.updateNode(accountId, {
    ...node,
    name: result.details.name,
    details: result.details,
  });
  await applySecrets(storage, accountId, node.id, result);
  onMutated();
}

/**
 * Connect over SSH resolving the key source: a referenced key entity wins,
 * then this entity's stored private key (materialized to a 0600 file),
 * then its plain key path.
 */
async function connectEntity(
  accountId: string,
  entity: EntityMetadata,
  storage: StorageManager,
  storageDir: string,
): Promise<void> {
  let keySource: EntityMetadata = entity;
  if (entity.sshKeyEntityId !== undefined) {
    const ref = storage.getNode(accountId, entity.sshKeyEntityId);
    if (ref?.details) {
      keySource = ref.details;
    } else {
      void vscode.window.showWarningMessage(
        `The key entity referenced by "${entity.name}" no longer exists — using its own key settings.`,
      );
    }
  }

  let keyPath = keySource.sshKeyPath;
  let materialized: string | undefined;
  const storedKey = await storage.getPrivateKey(accountId, keySource.id);
  if (storedKey !== undefined) {
    try {
      keyPath = materializePrivateKey(storageDir, keySource.id, storedKey);
      materialized = keyPath;
    } catch (error) {
      void vscode.window.showErrorMessage(
        `Could not write the stored key to disk: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }
  }
  const terminal = openSshTerminal({ ...entity, sshKeyPath: keyPath });
  // Wipe the decrypted key from disk as soon as the session ends.
  if (materialized !== undefined) {
    if (terminal === undefined) {
      forgetMaterializedKey(materialized);
    } else {
      const sub = vscode.window.onDidCloseTerminal((closed) => {
        if (closed === terminal) {
          forgetMaterializedKey(materialized as string);
          sub.dispose();
        }
      });
    }
  }
}

/** Save-As flow for a stored VPN config (context menu + viewer download). */
async function saveVpnConfigToFile(
  accountId: string,
  details: EntityMetadata,
  storage: StorageManager,
): Promise<void> {
  const content = await storage.getVpnConfig(accountId, details.id);
  if (content === undefined) {
    void vscode.window.showWarningMessage(
      `"${details.name}" has no stored VPN config — open Edit and upload the file first.`,
    );
    return;
  }
  const uri = await vscode.window.showSaveDialog({
    title: 'Save VPN config',
    defaultUri: vscode.Uri.file(
      path.join(os.homedir(), details.vpnConfigFileName ?? `${details.name}.ovpn`),
    ),
  });
  if (uri === undefined) {
    return;
  }
  await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
  void vscode.window.showInformationMessage(`VPN config saved to ${uri.fsPath}.`);
}

/** Double-click target: the read-only viewer with per-field Copy buttons. */
async function openEntityViewer(
  accountId: string,
  node: TreeNode,
  storage: StorageManager,
): Promise<void> {
  const details = node.details;
  if (!details) {
    return;
  }
  const hasPassword = (await storage.getPassword(accountId, details.id)) !== undefined;
  const hasPrivateKey = (await storage.getPrivateKey(accountId, details.id)) !== undefined;
  const hasVpnConfig = (await storage.getVpnConfig(accountId, details.id)) !== undefined;
  const dbConnection = await storage.getDbConnection(accountId, details.id);
  const dbParts = dbConnection !== undefined ? parseDbConnectionString(dbConnection) : undefined;
  const notes = (await storage.getNotes(accountId, details.id)) ?? details.notes;
  // Always show a port for DB entities — the type's default when not explicit.
  let dbPortIsDefault = false;
  if (dbParts !== undefined && dbParts.port === undefined && details.dbType !== undefined) {
    dbParts.port = DB_DEFAULT_PORTS[details.dbType];
    dbPortIsDefault = true;
  }
  const keySourceName =
    details.sshKeyEntityId !== undefined
      ? (storage.getNode(accountId, details.sshKeyEntityId)?.name ?? '(missing entity)')
      : undefined;
  showEntityView({
    details,
    keySourceName,
    hasPassword,
    hasPrivateKey,
    hasVpnConfig,
    hasDbConnection: dbConnection !== undefined,
    notes,
    dbParts: dbParts !== undefined ? { ...dbParts, password: undefined } : undefined,
    dbPortIsDefault,
    dbHasPassword: dbParts?.password !== undefined,
    sshCommand: buildSshCommand(details),
    resolveSecret: (field) =>
      field === 'password'
        ? storage.getPassword(accountId, details.id)
        : field === 'privateKey'
          ? storage.getPrivateKey(accountId, details.id)
          : field === 'vpnConfig'
            ? storage.getVpnConfig(accountId, details.id)
            : field === 'dbPassword'
              ? storage
                  .getDbConnection(accountId, details.id)
                  .then((v) =>
                    v === undefined ? undefined : parseDbConnectionString(v).password,
                  )
              : storage.getDbConnection(accountId, details.id),
    copyAllText: async () =>
      formatEntityBlock(
        details,
        await storage.getPassword(accountId, details.id),
        await storage.getDbConnection(accountId, details.id),
        notes,
      ),
    saveVpnConfig: () => saveVpnConfigToFile(accountId, details, storage),
  });
}

async function openDetails(
  accountId: string,
  node: TreeNode,
  storage: StorageManager,
  onMutated: () => void,
  storageDir: string,
): Promise<void> {
  const action = await showEntityDetails(accountId, node, storage);
  if (action === 'edit') {
    await editNode(accountId, node, storage, onMutated);
  } else if (action === 'connect' && node.details) {
    await connectEntity(accountId, node.details, storage, storageDir);
  } else if (action === 'install' && node.details) {
    const privateKey = await storage.getPrivateKey(accountId, node.details.id);
    await installKeyToSystem(node.details, privateKey);
  }
}

// ---------- helpers ----------

function asElement(value: unknown): TreeElement | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const v = value as TreeElement;
  if (v.kind === 'account' && typeof v.account?.accountId === 'string') {
    return v;
  }
  if (v.kind === 'node' && typeof v.accountId === 'string' && typeof v.node?.id === 'string') {
    return v;
  }
  if (v.kind === 'teamMember' && typeof v.member?.account?.accountId === 'string') {
    return v;
  }
  if (v.kind === 'teamScope' && typeof v.account?.accountId === 'string') {
    return v;
  }
  if (v.kind === 'sharedSender' && typeof v.email === 'string') {
    return v;
  }
  if (v.kind === 'sharedItem' && typeof v.share?.item?.id === 'string') {
    return v;
  }
  if (v.kind === 'sharedRoot') {
    return v;
  }
  return undefined;
}

/** The account a command was invoked on, or a picked one. */
async function accountFromTargetOrPick(
  target: unknown,
  storage: StorageManager,
  placeHolder: string,
): Promise<StoredAccount | undefined> {
  const element = asElement(target);
  if (element?.kind === 'account') {
    return element.account;
  }
  if (element?.kind === 'teamScope') {
    return element.account;
  }
  if (
    typeof target === 'object' &&
    target !== null &&
    typeof (target as StoredAccount).accountId === 'string' &&
    typeof (target as StoredAccount).email === 'string'
  ) {
    return target as StoredAccount;
  }
  return pickAccount(storage, placeHolder);
}

/** Everything an entity carries, packaged for a share. */
async function buildSharePayload(
  storage: StorageManager,
  accountId: string,
  node: TreeNode,
): Promise<SharePayload> {
  const note = (await storage.getNotes(accountId, node.id)) ?? node.details?.notes;
  const sharedDetails = node.details ? { ...node.details, notes: undefined } : node.details;
  return {
    node: { ...node, details: sharedDetails, parentId: null, children: undefined },
    secrets: {
      password: await storage.getPassword(accountId, node.id),
      privateKey: await storage.getPrivateKey(accountId, node.id),
      vpnConfig: await storage.getVpnConfig(accountId, node.id),
      dbConnection: await storage.getDbConnection(accountId, node.id),
      notes: note,
    },
  };
}
