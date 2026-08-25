import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { copiedMessage, copySecret, setSecretClipboardTtl } from './secretClipboard';
import { AuthError, signIn } from './authManager';
import { backupToNas, restoreFromBackup } from './backupManager';
import {
  formatEntityBlock,
  pickAccount,
  pickFolderType,
  pickTargetFolder,
  promptFolderName,
} from './dialogs';
import { EntityFormValues, KeyCandidate, showEntityForm } from './entityFormPanel';
import { showEntityView } from './entityViewPanel';
import { GoogleAuthProvider } from './googleAuthProvider';
import { nasPathFor, setAccountNasPath } from './nasPaths';
import { describeSender } from './shareSender';
import { keyringMayBeUnprotected, keyringWarningMessage } from './keyringWarning';
import { confirmCommandMessage, isCommandTrusted, trustCommand } from './commandTrust';
import { judgeSender, pinSenderKey, pinnedKey, verdictBlocksAccept } from './senderPinning';
import { keyFingerprint } from './shareSignature';
import { diagnoseTeamFailure, teamFailureIsActionable } from './teamDiagnosis';
import {
  backupIntervalHoursFor,
  backupPathFor,
  setAccountBackupInterval,
  setAccountBackupPath,
} from './backupPaths';
import { INTERVAL_CHOICES, describeInterval } from './backupSchedule';
import { buildCommandLine, describeCommand } from './commandLine';
import { SyncReadiness, syncReadiness } from './syncReadiness';
import { BackupScheduler } from './backupScheduler';
import { isServerLocation } from './vaultTransport';
import {
  installKeyToSystem,
  lockToOwner,
  removeInstalledKey,
  materializeVpnConfig,
  materializedKeysDir,
  purgeMaterializedKeys,
} from './keyInstaller';
import {
  VpnPlatform,
  isVpnStartable,
  vpnConfigFileName,
  vpnStartCommand,
  vpnStopCommand,
  vpnTunnelName,
} from './vpnCommand';
import { StorageManager } from './storageManager';
import { Revision, RevisionHead, revisionHead } from './revisionHistory';
import { SyncManager } from './syncManager';
import { buildSshCommand, describeSshTarget } from './terminalManager';
import { connectEntity } from './sshConnect';
import { CredsAgentServer } from './credsAgentServer';
import { UseActionRegistry } from './useActions';
import { sshExecAction, sshTerminalAction } from './sshUseActions';
import { buildAgentSnippet, buildKindSnippet } from './agentShareSnippet';
import { DB_DEFAULT_PORTS, parseDbConnectionString } from './dbConnString';
import { openInDbExtension } from './dbLauncher';
import { openShare, resolveShares, sealShare, shareTranscript, sharesFromEnvelope } from './shareFormat';
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
  wrapWithPinAsync,
  wrapWithPrf,
} from './keyWrap';
import {
  decryptJson,
  encryptJson,
  encryptJsonWrapped,
  readVaultWraps,
  resignEnvelopeWraps,
} from './cryptoUtils';
import { registerSecurityKey } from './webauthnPrf';
import { validatePin } from './pinPolicy';
import { CredTreeDataProvider, VIEW_ID, passwordKey } from './treeDataProvider';
import { RemoteState, buildDefaultFolders, inheritedFolderType } from './defaultFolders';
import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import { resolveVpnLauncher } from './vpnExec';
import { applyEnvBindings, bindableFieldValue } from './envApply';
import { envProbeCommand } from './envProbe';
import { imageMime } from './attachment';
import { syncReminderDue } from './syncReminder';
import { detectSecretPrints, resolveScriptEnv } from './scriptRender';
import { scriptRunPlan } from './scriptRun';
import { buildExternalBundle, isExternalBundle, remapExternalIds } from './externalBundle';
import { withoutPassword } from './dbConnString';
import { SelectedNode, describeSkips, resolveSelection } from './selectionResolver';
import { recordOrigin, resolveOrigin } from './shareOrigin';
import {
  credentialExportEnvAction,
  dbQueryAction,
  scriptRunAction,
  terminalRunAction,
  vpnAction,
} from './agentUseActions';
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


/** Set in activate(); the module-level slot keeps editNode's signature unchanged. */
let envCollection: vscode.GlobalEnvironmentVariableCollection;

const ORIGINS_KEY = 'credSshManager.shareOrigins';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  envCollection = context.environmentVariableCollection;

  // One place decides how long a copied secret lingers; see secretClipboard.ts for why
  // it is a settable default rather than an argument at every copy site.
  const applyClipboardTtl = (): void =>
    setSecretClipboardTtl(
      vscode.workspace.getConfiguration('credSshManager').get<number>('secretClipboardTtlSeconds', 45) * 1000,
    );
  applyClipboardTtl();
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('credSshManager.secretClipboardTtlSeconds')) {
        applyClipboardTtl();
      }
    }),
  );
  const storage = new StorageManager(context.globalState, context.secrets);
  context.subscriptions.push(storage); // it listens to SecretStorage changes
  // Seal-at-rest for the local metadata cache (audit B8): load or mint the device key and
  // seal any plaintext node slots BEFORE anything renders a tree. globalState is a plain
  // SQLite file in the profile; the topology it held (hosts, users, CLI args, env-var names)
  // is exactly what a stolen profile folder should not contain in the clear.
  await storage.init();
  if (storage.metadataFault !== undefined) {
    void vscode.window.showWarningMessage(`CredsForDevs: ${storage.metadataFault}`);
  }
  const provider = new CredTreeDataProvider(storage, context.extensionUri);
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
    // Ctrl/Shift selection. Only Delete, Export and Share read the selection; every
    // other command still acts on the row that was clicked, which is what makes turning
    // this on safe for the other forty-odd of them.
    canSelectMany: true,
  });

  // Unlock coordinator (PIN / security keys / cached master keys).
  const vaultKeys = new VaultKeys(context.secrets);

  // Transport per account (NAS folder or vault server) + sharing on top.
  const transports = new TransportFactory(storage, googleAuth);
  const sharing = new SharingManager(storage, transports, () => provider.refresh());
  provider.sharing = sharing;
  void sharing.reload();

  // NAS auto-sync (two-way merge); it re-renders the tree after pulling — and re-reads the
  // per-entity flags, because a pulled merge can add or remove a password.
  const sync = new SyncManager(
    storage,
    vaultKeys,
    transports,
    () => {
      provider.refresh();
      void refreshEntityFlags();
    },
    () => void sharing.reload(),
    (accountId) => void context.globalState.update(`syncReminder.lastOk.${accountId}`, Date.now()),
  );
  context.subscriptions.push(sync);

  // Dated snapshots, separately from sync. Constructed AFTER the sync manager because a
  // snapshot is a copy of what sync maintains — with no sync location there is nothing to
  // copy, and the scheduler says so rather than inventing an export of its own.
  const backups = new BackupScheduler(storage, transports, context.globalState, (message) =>
    console.log(`[creds-for-devs/backup] ${message}`),
  );
  context.subscriptions.push(backups);

  // Stale-sync reminder: an account with a sync location that has not synced for three
  // days gets a warning, repeated every four hours until a sync succeeds. The point is
  // the quiet failure — a lock left on, a cleared PIN, an unmounted NAS — where the
  // off-machine copy stops moving and nothing else says so.
  const syncReminderTick = async (): Promise<void> => {
    for (const account of storage.getAccounts()) {
      if (nasPathFor(account) === undefined) {
        continue; // nothing was ever supposed to sync
      }
      const keyOf = (kind: string) => `syncReminder.${kind}.${account.accountId}`;
      if (context.globalState.get<number>(keyOf('firstSeen')) === undefined) {
        await context.globalState.update(keyOf('firstSeen'), Date.now());
      }
      const verdict = syncReminderDue({
        lastSyncMs: context.globalState.get<number>(keyOf('lastOk')),
        firstSeenMs: context.globalState.get<number>(keyOf('firstSeen')),
        lastRemindedMs: context.globalState.get<number>(keyOf('lastReminded')),
        nowMs: Date.now(),
      });
      if (!verdict.due) {
        continue;
      }
      await context.globalState.update(keyOf('lastReminded'), Date.now());
      const reason = provider.readiness.get(account.accountId)?.reason;
      const picked = await vscode.window.showWarningMessage(
        `${account.email} has not synced for ${verdict.staleDays} days.` +
          (reason !== undefined ? ` ${reason}` : ''),
        'Sync Now',
      );
      if (picked === 'Sync Now') {
        await vscode.commands.executeCommand('credSshManager.syncNow');
      }
    }
  };
  const reminderTimer = setInterval(() => void syncReminderTick(), 15 * 60_000);
  context.subscriptions.push({ dispose: () => clearInterval(reminderTimer) });
  void syncReminderTick();

  // Auto-lock. Checked on a coarse timer: the window is measured in tens of minutes, so
  // a minute of drift costs nothing and a tighter tick would only wake the machine more.
  const autoLock = setInterval(() => {
    const minutes = vscode.workspace
      .getConfiguration('credSshManager')
      .get<number>('autoLockMinutes', 60);
    if (vaultKeys.dueForAutoLock(Date.now(), minutes)) {
      vaultKeys.lock();
      void refreshReadiness();
      void vscode.window.showInformationMessage(
        `Vaults locked after ${minutes} minutes idle. Local credentials still work; sync resumes when you unlock.`,
      );
    }
  }, 60_000);
  context.subscriptions.push({ dispose: () => clearInterval(autoLock) });

  /**
   * Recompute what each account can and cannot do, and repaint.
   *
   * Answering needs SecretStorage, so it cannot happen while a tree item is being built —
   * the result is cached on the provider instead and refreshed at the moments it can
   * actually change: startup, a sync cycle, a PIN being set, a lock.
   */
  /**
   * Which entries keep previous versions, and which have a stored password. Both answers live
   * in SecretStorage, which `getTreeItem` cannot await — so they are cached on the provider and
   * refreshed at the moments they can change: startup, an edit, an accepted update, a restore,
   * a pulled sync. One walk for both, because it is the same walk over the same entities; the
   * caches are swapped at the end rather than cleared at the start, so a repaint that lands
   * mid-walk never shows a tree with every flag briefly off.
   */
  const refreshEntityFlags = async (): Promise<void> => {
    const history = new Map<string, RevisionHead[]>();
    const withPassword = new Set<string>();
    for (const account of storage.getAccounts()) {
      for (const node of storage.getNodes(account.accountId)) {
        if (node.type !== 'entity') {
          continue;
        }
        const [revisions, password] = await Promise.all([
          storage.getHistory(account.accountId, node.id),
          storage.getPassword(account.accountId, node.id),
        ]);
        if (revisions.length > 0) {
          // Heads only: the tree needs dates and names, never the old secrets.
          history.set(node.id, revisions.map(revisionHead));
        }
        if (password !== undefined) {
          withPassword.add(passwordKey(account.accountId, node.id));
        }
      }
    }
    provider.historyById.clear();
    for (const [id, heads] of history) {
      provider.historyById.set(id, heads);
    }
    provider.passwordIds.clear();
    for (const key of withPassword) {
      provider.passwordIds.add(key);
    }
    provider.refresh();
  };
  void refreshEntityFlags();

  const refreshReadiness = async (): Promise<Map<string, SyncReadiness>> => {
    const locked = vaultKeys.isLocked();
    for (const account of storage.getAccounts()) {
      const pin = await vaultKeys.storedPin(account);
      provider.readiness.set(
        account.accountId,
        syncReadiness({
          hasLocation: nasPathFor(account) !== undefined,
          hasStoredPin: pin !== undefined && pin.length > 0,
          // Registered keys live inside the vault envelope, which is a network read; the
          // sync cycle records what it saw. Absent means "not seen yet", never "none".
          hasSecurityKey: sync.hasSecurityKey(account.accountId),
          isLocked: locked,
        }),
      );
    }
    provider.refresh();
    return provider.readiness;
  };
  void refreshReadiness();

  provider.onMutate = () => sync.notifyChange();
  const mutated = () => {
    provider.refresh();
    sync.notifyChange();
    // An edit or an accepted update may have created the first revision of something, or
    // stored its first password — one refresher here rather than a call at every mutation
    // site that could forget.
    void refreshEntityFlags();
  };

  // The agent broker: a loopback surface through which a coding agent can USE
  // a credential (run a command, open the terminal) without ever receiving it.
  // Constructed cheaply here; it opens no socket until the first share.
  const useActions = new UseActionRegistry();
  const agentServer = new CredsAgentServer(useActions, () => vaultKeys.noteUserActivity(), storageDir);
  const sshDeps = {
    storage,
    storageDir,
    signal: agentServer.signal,
    acquireExecSlot: agentServer.acquireExecSlot,
    note: agentServer.note,
  };
  useActions.register(sshExecAction(sshDeps));
  useActions.register(sshTerminalAction(sshDeps));

  // The other kinds ride the same registry — the broker's dispatch never learned about
  // any of them, which is what the (kind, action) seam was for.
  const agentDeps = {
    ...sshDeps,
    trustStore: context.globalState,
    applyEnv: (details: EntityMetadata, accountId: string) =>
      applyEnvBindings(envCollection, storage, accountId, details),
    onPath,
    // The grant carries the account, so the tree element runVpn expects can be rebuilt
    // exactly — the same function the human Start button calls, so an agent-opened
    // tunnel is indistinguishable in mechanism from a hand-opened one.
    open: async (accountId: string, entityId: string, action: 'start' | 'stop'): Promise<boolean> => {
      const node = storage.getNode(accountId, entityId);
      if (node === undefined) {
        return false;
      }
      await runVpn({ kind: 'node', accountId, node }, action, storage, storageDir, vaultKeys);
      return true;
    },
  };
  useActions.register(scriptRunAction(agentDeps));
  useActions.register(terminalRunAction(agentDeps));
  useActions.register(credentialExportEnvAction(agentDeps));
  useActions.register(dbQueryAction(agentDeps));
  useActions.register(vpnAction(agentDeps, 'up'));
  useActions.register(vpnAction(agentDeps, 'down'));
  context.subscriptions.push(agentServer);

  warnIfKeyringMissing(context);

  const register = (command: string, handler: (...args: unknown[]) => unknown) =>
    context.subscriptions.push(vscode.commands.registerCommand(command, handler));

  register('credSshManager.refresh', () => {
    provider.refresh();
    void sharing.reload();
  });

  /**
   * The filter row's field.
   *
   * <p>An input box rather than a QuickPick: a QuickPick would put the results in a floating
   * list, and the request was to filter the tree you are looking at. `onDidChangeValue` is
   * what makes it filter as you type; Escape puts back whatever was filtered before, so a
   * cancelled search is not a lost one.</p>
   */
  register('credSshManager.search', () => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const box = vscode.window.createInputBox();
    const before = provider.searchQuery;
    let accepted = false;
    box.title = 'Filter credentials';
    box.value = before;
    box.placeholder = 'name, host, user, command…';
    box.prompt = 'Filters as you type. Secrets are never searched.';
    box.onDidChangeValue((value) => provider.setSearchQuery(value));
    box.onDidAccept(() => {
      accepted = true;
      box.hide();
    });
    box.onDidHide(() => {
      if (!accepted) {
        provider.setSearchQuery(before);
      }
      box.dispose();
    });
    box.show();
  });

  register('credSshManager.clearSearch', () => {
    provider.setSearchQuery('');
  });
  /**
   * Say a refusal out loud after a sync somebody asked for.
   *
   * <p>Only on the manual command, and only for a refusal: the tree carries the
   * rest. The background timer stays silent — a modal every five minutes is how
   * people learn to dismiss modals, and this is the modal that matters.</p>
   */
  const reportTeamRefusals = (): void => {
    for (const [accountId, failure] of sharing.teamFailures) {
      if (!teamFailureIsActionable(failure)) {
        continue;
      }
      const email = storage.getAccount(accountId)?.email ?? accountId;
      void vscode.window.showWarningMessage(`${email}: ${diagnoseTeamFailure(failure)}`);
    }
  };

  register('credSshManager.syncNow', async () => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock

    // Say what WILL happen before doing it. Pressing Sync and getting silence, because
    // two of three accounts were never set up, is the complaint this answers — the
    // per-account state was knowable all along and simply never shown.
    const readiness = await refreshReadiness();
    const accounts = storage.getAccounts();
    const blocked = accounts.filter((a) => readiness.get(a.accountId)?.ready !== true);

    if (accounts.length === 0) {
      void vscode.window.showInformationMessage('No accounts yet — add one first.');
      return;
    }

    if (blocked.length === accounts.length) {
      // Nothing can sync. Offer the fix for the FIRST one rather than a list nobody can
      // act on from a notification.
      const first = readiness.get(blocked[0].accountId);
      const choice = await vscode.window.showWarningMessage(
        `Nothing can sync yet. ${blocked[0].email}: ${first?.reason ?? ''}` +
          (blocked.length > 1 ? `  (and ${blocked.length - 1} more)` : ''),
        ...(first?.fixLabel !== undefined ? [first.fixLabel] : []),
      );
      if (choice !== undefined && first?.fixCommand !== undefined) {
        await vscode.commands.executeCommand(first.fixCommand, { kind: 'account', account: blocked[0] });
      }
      return;
    }

    await sync.syncNow();
    await refreshReadiness();
    // The team is rescanned as part of that; if the server refused, say so here
    // rather than leaving an empty list to be read as "nobody has joined yet".
    reportTeamRefusals();

    if (blocked.length > 0) {
      // Synced what it could, and named what it could not — rather than reporting
      // success and quietly leaving accounts behind.
      const detail = blocked
        .map((a) => `• ${a.email} — ${readiness.get(a.accountId)?.reason ?? 'not ready'}`)
        .join('\n');
      void vscode.window.showWarningMessage(
        `Synced ${accounts.length - blocked.length} of ${accounts.length} accounts.`,
        { modal: false, detail } as vscode.MessageOptions,
        'Show details',
      ).then(async (choice) => {
        if (choice === 'Show details') {
          const document = await vscode.workspace.openTextDocument({
            content: `Not synced:

${detail}
`,
          });
          await vscode.window.showTextDocument(document, { preview: true });
        }
      });
    }
  });
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
        // Seed the default folder set only into a still-empty, never-seeded account
        // that we can SEE has nothing waiting for it remotely. The existence of a vault
        // file is enough to refuse — whether we can decrypt it yet is a different
        // question, and on a fresh machine the answer is usually "not until the PIN is
        // set". Seeding on that ignorance is what produced two of every folder.
        if (await storage.seedDefaultFolders(account.accountId, await probeRemote(account, transports))) {
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
  // ---------- terminal commands ----------

  register('credSshManager.runCommand', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const element = await nodeAt(asElement(target), storage);
    if (element?.kind !== 'node') {
      return;
    }
    const d = element.node.details;
    const line = buildCommandLine(d?.command ?? '', d?.commandArgs);
    if (line.length === 0) {
      void vscode.window.showWarningMessage(
        `"${element.node.name}" has no command yet — edit it and fill in the command.`,
      );
      return;
    }
    // Read before it runs, once per exact line per machine. The justification for
    // running unconfirmed was "these are commands you wrote yourself" — true until
    // sync and Accept Share, both of which can deliver a command entry from
    // somewhere else, under a name the reader has no reason to distrust.
    if (!isCommandTrusted(context.globalState, element.node.id, line)) {
      const choice = await vscode.window.showWarningMessage(
        confirmCommandMessage(element.node.name, line),
        { modal: true },
        'Run',
      );
      if (choice !== 'Run') {
        return;
      }
      await trustCommand(context.globalState, element.node.id, line);
    }

    // A dedicated terminal per entry, reused: running the same command twice should not
    // leave two panels behind, and mixing it into whatever terminal happened to be open
    // loses the association between the entry and its output.
    const name = `CredsForDevs: ${element.node.name}`;
    const existing = vscode.window.terminals.find((t) => t.name === name);
    const terminal = existing ?? vscode.window.createTerminal({ name });
    terminal.show();
    // Runs it. The first version put the line on the prompt and left Enter to the user;
    // the operator asked for the button to do the whole job, which is theirs to decide —
    // these are commands they wrote and saved themselves, not something arriving from
    // elsewhere. `Copy Command` remains for the times you want to edit before running.
    terminal.sendText(line, true);
  });

  register('credSshManager.copyCommand', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const element = await nodeAt(asElement(target), storage);
    if (element?.kind !== 'node') {
      return;
    }
    const d = element.node.details;
    const line = buildCommandLine(d?.command ?? '', d?.commandArgs);
    if (line.length === 0) {
      void vscode.window.showWarningMessage(`"${element.node.name}" has no command yet.`);
      return;
    }
    // Not a secret, so it does not expire the way a password copy does.
    await vscode.env.clipboard.writeText(line);
    void vscode.window.showInformationMessage(`Copied: ${line}`);
  });

  register('credSshManager.showCommand', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const element = await nodeAt(asElement(target), storage);
    if (element?.kind !== 'node') {
      return;
    }
    const d = element.node.details;
    const text = describeCommand(d?.command ?? '', d?.commandArgs, d?.commandNote);
    const document = await vscode.workspace.openTextDocument({
      content: text.length > 0 ? text : 'This entry has no command yet.',
      language: 'shellscript',
    });
    await vscode.window.showTextDocument(document, { preview: true });
  });

  // ---------- clone ----------

  register('credSshManager.cloneNode', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const element = await nodeAt(asElement(target), storage);
    if (element?.kind !== 'node') {
      return;
    }
    const source = element.node;
    const accountId = element.accountId;

    const name = await vscode.window.showInputBox({
      title: `Clone "${source.name}"`,
      prompt: 'Name for the copy',
      value: `${source.name} (copy)`,
      validateInput: (v) => (v.trim().length === 0 ? 'Name must not be empty.' : undefined),
    });
    if (name === undefined) {
      return;
    }

    const clonedId = StorageManager.newId();
    await storage.addNode(accountId, {
      id: clonedId,
      name: name.trim(),
      type: source.type,
      parentId: source.parentId,
      folderType: source.folderType,
      // A clone is metadata only by design. Copying the SECRETS would double every
      // password on disk and in every backup, and the usual reason to clone is to make
      // a near-identical entry that needs its OWN credential anyway.
      details:
        source.details === undefined
          ? undefined
          : { ...source.details, id: clonedId, name: name.trim() },
    });
    mutated();

    const hint =
      source.type === 'folder'
        ? 'The folder was copied; its contents were not.'
        : 'Settings were copied; passwords and keys were not — set them on the copy.';
    void vscode.window.showInformationMessage(`Cloned as "${name.trim()}". ${hint}`);
  });

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

  register('credSshManager.setBackupSchedule', async (target) => {
    const element = asElement(target);
    if (element?.kind !== 'account') {
      return;
    }
    const current = backupIntervalHoursFor(element.account);
    const items: (vscode.QuickPickItem & { hours?: number; custom?: boolean })[] = [
      ...INTERVAL_CHOICES.map((c) => ({
        label: c.label,
        detail: c.detail,
        description: c.hours === current ? '$(check) current' : undefined,
        hours: c.hours,
      })),
      { label: 'Custom…', detail: 'Any number of hours', custom: true },
    ];
    const picked = await vscode.window.showQuickPick(items, {
      title: `How often to snapshot ${element.account.email}`,
      placeHolder: `Currently: ${describeInterval(current)}`,
      ignoreFocusOut: true,
    });
    if (picked === undefined) {
      return;
    }

    let hours = picked.hours;
    if (picked.custom === true) {
      const entered = await vscode.window.showInputBox({
        title: 'Snapshot interval',
        prompt: 'Hours between snapshots. 0 switches them off.',
        value: String(current),
        ignoreFocusOut: true,
        validateInput: (v) => {
          const n = Number(v);
          return Number.isFinite(n) && n >= 0 && Number.isInteger(n)
            ? undefined
            : 'A whole number of hours, 0 or more.';
        },
      });
      if (entered === undefined) {
        return;
      }
      hours = Number(entered);
    }
    if (hours === undefined) {
      return;
    }

    // No reschedule() call: the scheduler's own configuration listener restarts it.
    await setAccountBackupInterval(element.account.email, hours);
    const where = backupPathFor(element.account);
    void vscode.window.showInformationMessage(
      hours <= 0
        ? `${element.account.email}: snapshots switched off. The sync location is unaffected.`
        : where === undefined
          ? `${element.account.email}: ${describeInterval(hours).toLowerCase()} — but no snapshot folder is set yet. Use "Set Backup Location…".`
          : `${element.account.email}: ${describeInterval(hours).toLowerCase()} snapshots into ${where}.`,
    );
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
    // A subfolder of a typed folder is of that type. Asking would offer answers the
    // parent already refuses.
    const inherited = folderKindOf(storage, location.accountId, location.parentId);
    const folderType = inherited ?? (await pickFolderType());
    if (folderType === undefined) {
      return;
    }
    const folderId = StorageManager.newId();
    await storage.addNode(location.accountId, {
      id: folderId,
      name,
      type: 'folder',
      parentId: location.parentId,
      folderType,
    });
    if (folderType === 'project') {
      // The feature itself: a project is the account's structure in miniature — the
      // same named, typed set the account starts with, seeded inside this folder.
      for (const sub of buildDefaultFolders(() => StorageManager.newId(), folderId)) {
        await storage.addNode(location.accountId, sub);
      }
    }
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
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
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
      hasStoredAttachment: false,
      hasStoredImage: false,
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
    await applyEnvBindings(envCollection, storage, location.accountId, result.details);
    mutated();
  });

  register('credSshManager.editNode', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const element = asElement(target);
    if (element?.kind !== 'node') {
      return;
    }
    await editNode(element.accountId, element.node, storage, mutated);
  });

  register('credSshManager.deleteNode', async (target, selected) => {
    const { targets, skippedNote } = resolveBulkTargets(storage, target, selected);
    if (targets.length === 0) {
      return;
    }
    const what =
      targets.length === 1
        ? targets[0].node.type === 'folder'
          ? `folder "${targets[0].node.name}" and everything inside it`
          : `entity "${targets[0].node.name}" and its stored secrets`
        : `${targets.length} selected items, folders with everything inside them`;
    const confirmed = await vscode.window.showWarningMessage(
      `Delete ${what}? This cannot be undone.${skippedNote === '' ? '' : ` ${skippedNote}`}`,
      { modal: true },
      'Delete',
    );
    if (confirmed !== 'Delete') {
      return;
    }
    // Sequential, and not as a matter of style: every storage mutator is an unlocked
    // read-modify-write of one flat array per account, so two of these in flight would
    // race and the later write would silently drop the earlier deletion.
    const removed: string[] = [];
    for (const t of targets) {
      removed.push(...(await storage.deleteNodeRecursive(t.accountId, t.node.id)));
    }
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
        required !== 'project' &&
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

  register('credSshManager.revisionClicked', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const element = await nodeAt(asElement(target), storage);
    if (element?.revision === undefined || element.node.details === undefined) {
      return;
    }
    openRevisionViewer(element.node, element.revision);
  });

  register('credSshManager.viewDetails', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const element = asElement(target);
    if (element?.kind !== 'node' || !element.node.details) {
      return;
    }
    // The viewer, not the old QuickPick: that one knew only the SSH fields, so a VPN, database,
    // script or command entity opened as "Host —, Password not set" and read as broken.
    await openEntityViewer(element.accountId, element.node, storage);
  });

  register('credSshManager.copyPassword', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
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
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const element = asElement(target);
    if (element?.kind === 'node' && element.node.details) {
      await connectEntity(element.accountId, element.node.details, storage, storageDir);
    }
  });

  // Hand a coding agent the ABILITY to use this entity, never the credential.
  register('credSshManager.shareWithAgent', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const element = asElement(target);
    if (element?.kind !== 'node' || !element.node.details) {
      return;
    }
    const details = element.node.details;
    const kind = kindOf(details);
    // Next to the RUNNING entry — out/ under tsc, dist/ in the packaged bundle — so the
    // snippet always names a CLI built the same way as the extension that minted the grant.
    const cliPath = path.join(__dirname, 'agentCli.js');

    // SSH keeps its own snippet: it is the only kind whose instructions name a target
    // (`user@host`), and the only one where the agent composes what runs.
    let snippet: string | undefined;
    if (kind === 'ssh') {
      const targetLabel = describeSshTarget(details);
      if (targetLabel === undefined) {
        void vscode.window.showWarningMessage(
          `"${element.node.name}" has no host configured — there is nothing an agent could connect to.`,
        );
        return;
      }
      snippet = buildAgentSnippet({
        entityName: element.node.name,
        target: targetLabel,
        token: await agentServer.share(element.accountId, details.id, element.node.name, 'ssh'),
        cliPath,
      });
    } else {
      const token = await agentServer.share(element.accountId, details.id, element.node.name, kind);
      snippet = buildKindSnippet(kind, { entityName: element.node.name, token, cliPath });
    }
    if (snippet === undefined) {
      void vscode.window.showWarningMessage(
        `"${element.node.name}" has nothing an agent could do with it. SSH keys are deliberately excluded — a key only means anything attached to a host.`,
      );
      return;
    }
    // The token is a bearer capability for as long as this window lives, so it
    // gets the same expiring clipboard every secret here does.
    await copySecret(vscode.env.clipboard, snippet);
    void vscode.window.showInformationMessage(
      copiedMessage(`Claude Code instructions for "${element.node.name}"`),
    );
  });

  register('credSshManager.installSshKey', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const element = asElement(target);
    if (element?.kind !== 'node' || !element.node.details) {
      return;
    }
    const privateKey = await storage.getPrivateKey(element.accountId, element.node.details.id);
    await installKeyToSystem(element.node.details, privateKey);
  });

  // Write the stored VPN config back out as a file.
  register('credSshManager.removeInstalledKey', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const element = asElement(target);
    if (element?.kind !== 'node' || !element.node.details) {
      return;
    }
    await removeInstalledKey(element.node.details);
  });

  register('credSshManager.saveVpnConfig', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const element = asElement(target);
    if (element?.kind !== 'node' || !element.node.details) {
      return;
    }
    await saveVpnConfigToFile(element.accountId, element.node.details, storage);
  });

  register('credSshManager.exportExternal', async (target, selected) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const { targets, skippedNote } = resolveBulkTargets(storage, target, selected);
    if (targets.length === 0) {
      return;
    }
    if (skippedNote !== '') {
      void vscode.window.showWarningMessage(skippedNote);
    }
    const accountId = targets[0].accountId;
    const exportName =
      targets.length === 1 ? targets[0].node.name : `${targets.length}-items`;

    // A folder exports its whole subtree; an entity exports itself. The resolver already
    // dropped any target contained by another, so the union cannot repeat a node.
    const all = storage.getNodes(accountId);
    const picked: TreeNode[] = [];
    const collect = (n: TreeNode): void => {
      picked.push(n);
      if (n.type === 'folder') {
        for (const c of all.filter((x) => x.parentId === n.id)) {
          collect(c);
        }
      }
    };
    for (const t of targets) {
      collect(t.node);
    }

    const secrets: Record<string, import('./externalBundle').ExternalSecrets> = {};
    for (const n of picked) {
      if (n.type !== 'entity') {
        continue;
      }
      const s: import('./externalBundle').ExternalSecrets = {};
      s.password = await storage.getPassword(accountId, n.id);
      s.privateKey = await storage.getPrivateKey(accountId, n.id);
      s.vpnConfig = await storage.getVpnConfig(accountId, n.id);
      s.dbConnection = await storage.getDbConnection(accountId, n.id);
      s.notes = await storage.getNotes(accountId, n.id);
      s.attachment = await storage.getAttachment(accountId, n.id);
      s.image = await storage.getImage(accountId, n.id);
      for (const key of Object.keys(s) as (keyof typeof s)[]) {
        if (s[key] === undefined) {
          delete s[key];
        }
      }
      secrets[n.id] = s;
    }
    const bundle = buildExternalBundle(picked, secrets);

    const mode = await vscode.window.showQuickPick(
      [
        {
          label: '$(lock) Password-protected file',
          detail: 'scrypt + AES-256-GCM under a password you tell the recipient out-of-band.',
          plain: false,
        },
        {
          label: '$(warning) Plain JSON — NOT protected',
          detail: 'Readable by anyone who touches the file. Secrets included. Your explicit choice.',
          plain: true,
        },
      ],
      { title: `Export "${exportName}" for someone outside the organisation`, ignoreFocusOut: true },
    );
    if (mode === undefined) {
      return;
    }

    let content: string;
    let ext: string;
    if (mode.plain) {
      const sure = await vscode.window.showWarningMessage(
        `The plain JSON file will contain ${Object.keys(secrets).length} entities' secrets readable by ANYONE. Continue?`,
        { modal: true },
        'Write plain JSON',
      );
      if (sure !== 'Write plain JSON') {
        return;
      }
      content = JSON.stringify(bundle, null, 2);
      ext = 'json';
    } else {
      const password = await vscode.window.showInputBox({
        title: 'Password for the export',
        prompt: 'Tell it to the recipient out-of-band — it is the only key to this file.',
        password: true,
        ignoreFocusOut: true,
        validateInput: validatePin,
      });
      if (password === undefined) {
        return;
      }
      content = encryptJson(bundle, password);
      ext = 'enc';
    }
    const targetUri = await vscode.window.showSaveDialog({
      title: 'Export to file',
      defaultUri: vscode.Uri.file(path.join(os.homedir(), `${exportName}.${ext}`)),
      filters: mode.plain ? { JSON: ['json'] } : { 'Encrypted export': ['enc'] },
    });
    if (targetUri === undefined) {
      return;
    }
    await vscode.workspace.fs.writeFile(targetUri, Buffer.from(content, 'utf8'));
    void vscode.window.showInformationMessage(
      `Exported ${picked.length} node(s) to ${targetUri.fsPath}.`,
    );
  });

  register('credSshManager.importExternal', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const location = await resolveLocation(asElement(target), storage, 'Import into which profile?');
    if (location === undefined) {
      return;
    }
    const uris = await vscode.window.showOpenDialog({
      title: 'Import from external file',
      canSelectMany: false,
      filters: { 'CredsForDevs export': ['enc', 'json'] },
    });
    const uri = uris?.[0];
    if (uri === undefined) {
      return;
    }
    const raw = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');

    let payload: unknown;
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (parsed.format === 'creds-for-devs-external') {
        payload = parsed;
      } else {
        // A sealed envelope: ask for the password it was exported with.
        const password = await vscode.window.showInputBox({
          title: 'Password for this export',
          prompt: 'The password the sender protected the file with.',
          password: true,
          ignoreFocusOut: true,
        });
        if (password === undefined) {
          return;
        }
        payload = decryptJson(raw, password);
      }
    } catch (error) {
      void vscode.window.showErrorMessage(
        `Import failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }
    if (!isExternalBundle(payload)) {
      void vscode.window.showErrorMessage('Import failed: this is not a CredsForDevs export file.');
      return;
    }

    // NEW ids for everything — the sender's ids belong to the sender's tree.
    const remapped = remapExternalIds(payload, () => StorageManager.newId(), location.parentId);
    for (const n of remapped.nodes) {
      await storage.addNode(location.accountId, n);
    }
    for (const [id, s] of Object.entries(remapped.secrets)) {
      await storage.setPassword(location.accountId, id, s.password);
      if (s.privateKey !== undefined) {
        await storage.setPrivateKey(location.accountId, id, s.privateKey);
      }
      if (s.vpnConfig !== undefined) {
        await storage.setVpnConfig(location.accountId, id, s.vpnConfig);
      }
      if (s.dbConnection !== undefined) {
        await storage.setDbConnection(location.accountId, id, s.dbConnection);
      }
      await storage.setNotes(location.accountId, id, s.notes);
      if (s.attachment !== undefined) {
        await storage.setAttachment(location.accountId, id, s.attachment);
      }
      if (s.image !== undefined) {
        await storage.setImage(location.accountId, id, s.image);
      }
    }
    mutated();
    void vscode.window.showInformationMessage(
      `Imported ${remapped.nodes.length} node(s) from ${path.basename(uri.fsPath)}.`,
    );
  });

  register('credSshManager.runScript', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const element = await nodeAt(asElement(target), storage);
    if (element?.kind !== 'node' || element.node.details === undefined) {
      return;
    }
    const details = element.node.details;
    if (details.script === undefined || details.script.trim().length === 0) {
      void vscode.window.showWarningMessage('This script is empty — open Edit and write it first.');
      return;
    }
    const plan = scriptRunPlan(details.scriptLanguage ?? 'other', process.platform);
    if (plan.kind === 'unsupported') {
      void vscode.window.showInformationMessage(plan.reason);
      return;
    }
    // Same content-trust gate the saved terminal commands have had since sync and
    // Accept Share made "you wrote this yourself" untrue. A script arriving from
    // elsewhere is one click from running; the fingerprint is of the exact body, so an
    // edit asks again and a re-run of the approved one does not.
    if (!isCommandTrusted(context.globalState, element.node.id, details.script)) {
      const approved = await vscode.window.showWarningMessage(
        confirmCommandMessage(element.node.name, details.script),
        { modal: true },
        'Run',
      );
      if (approved !== 'Run') {
        return;
      }
      await trustCommand(context.globalState, element.node.id, details.script);
    }

    // Values live in the environment now, but the script is the user's own code and can
    // print them itself. Notice, say so once per exact body, never block.
    const printed = detectSecretPrints(
      details.script,
      Object.keys(resolveScriptEnv(details.script, details.scriptVars, details.scriptLanguage ?? 'other').env),
      details.scriptLanguage ?? 'other',
    );
    if (printed.length > 0) {
      const key = `scriptPrint:${element.node.id}`;
      if (!isCommandTrusted(context.globalState, key, details.script)) {
        const go = await vscode.window.showWarningMessage(
          `This script prints ${printed.map((n) => '${' + n + '}').join(', ')} — the value will be visible in the terminal and its history. Run anyway?`,
          { modal: true },
          'Run',
        );
        if (go !== 'Run') {
          return;
        }
        await trustCommand(context.globalState, key, details.script);
      }
    }

    // The values go into the terminal's ENVIRONMENT; the file gets a body that reads
    // them by name. Before this, the substituted body — values and all — was written to
    // disk and left there until the next purge.
    const resolved = resolveScriptEnv(details.script, details.scriptVars, details.scriptLanguage ?? 'other');
    const fileName = `script-${details.id}${plan.extension}`;
    const scriptPath = path.join(materializedKeysDir(storageDir), fileName);
    fs.mkdirSync(path.dirname(scriptPath), { recursive: true, mode: 0o700 });
    fs.writeFileSync(
      scriptPath,
      resolved.body.endsWith('\n') ? resolved.body : resolved.body + '\n',
      { mode: 0o700 },
    );
    lockToOwner(scriptPath);

    // A FRESH terminal every run: VS Code can only set a terminal's environment when it
    // is created, so a reused one would run this script with the PREVIOUS entry's values
    // — the same reasoning the SSH password path already follows.
    const name = `CredsForDevs: ${element.node.name}`;
    vscode.window.terminals.find((t) => t.name === name && t.exitStatus === undefined)?.dispose();
    const terminal = vscode.window.createTerminal({ name, env: resolved.env });
    terminal.show();
    terminal.sendText([plan.command, ...plan.args, `"${scriptPath}"`].join(' '), true);
  });

  register('credSshManager.startVpn', (target) =>
    runVpn(target, 'start', storage, storageDir, vaultKeys),
  );
  register('credSshManager.stopVpn', (target) =>
    runVpn(target, 'stop', storage, storageDir, vaultKeys),
  );

  // Open a database entity in the matching DB extension.
  register('credSshManager.copyDbConnectionNoPassword', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const element = asElement(target);
    if (element?.kind !== 'node' || !element.node.details) {
      return;
    }
    const conn = await storage.getDbConnection(element.accountId, element.node.details.id);
    if (conn === undefined) {
      void vscode.window.showWarningMessage('No connection string stored for this entry.');
      return;
    }
    await copySecret(vscode.env.clipboard, withoutPassword(conn));
    void vscode.window.showInformationMessage(
      'Connection string copied WITHOUT the password. It clears from the clipboard shortly.',
    );
  });

  register('credSshManager.connectDb', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
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
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
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
        const master = key.masterKey;
        wraps = upsertWrap(
          readVaultWraps(raw).filter(isKeyWrap),
          wrapWithPrf(master, prf.credentialId, prfSalt, prf.secret, label.trim(), Date.now()),
        );
        content = resignEnvelopeWraps(raw, wraps, key.masterKey);
      } else {
        // Upgrade v1 → v2: new master key, payload re-encrypted, two wraps.
        const pin = await vaultKeys.storedPin(account);
        if (pin === undefined) {
          void vscode.window.showErrorMessage('A vault PIN is required before adding a key.');
          return;
        }
        const payload = await vaultKeys.decrypt(raw, key);
        const master = newMasterKey();
        wraps = [
          await wrapWithPinAsync(master, account.accountId, pin, Date.now()),
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
      // The account row's icon and reason come from the readiness cache, which nothing
      // else refreshes here — the sync cycle repaints the tree from the STALE map.
      await refreshReadiness();
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
    // Judged by the KEY SLOTS in the file, not by a version number — the number moved
    // to 3 and `!== 2` would tell an owner of a key-wrapped vault they have no keys.
    // Same rule as restore and backup (0.46.2).
    const hasKeyWraps =
      raw !== undefined && webauthnWraps(readVaultWraps(raw).filter(isKeyWrap)).length > 0;
    if (transport === undefined || raw === undefined || !hasKeyWraps) {
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
      const payload = await vaultKeys.decrypt(raw, key);
      const master = newMasterKey();
      const content = encryptJsonWrapped(
        payload,
        master.toString('base64'),
        [await wrapWithPinAsync(master, account.accountId, pin, Date.now())],
        account,
        transport.embedsShares ? sharesFromEnvelope(raw) : undefined,
      );
      await transport.writeVault(account, content, []);
      vaultKeys.clearCache(account.accountId);
      void vscode.window.showInformationMessage(
        `Removed "${picked.label}" and re-keyed the vault under your PIN — the removed key can no longer open it.`,
      );
      sync.notifyChange();
      await refreshReadiness();
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
        resignEnvelopeWraps(raw, remaining, key.masterKey),
        [],
      );
      vaultKeys.clearCache(account.accountId);
      void vscode.window.showInformationMessage(
        `Removed "${picked.label}". Note: existing backups/snapshots remain openable by that key until the vault is re-keyed (remove all security keys to force a re-key under the PIN).`,
      );
      sync.notifyChange();
      await refreshReadiness();
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
      // Repaint straight away: the icon is grey BECAUSE the vault was locked, and leaving
      // it grey after unlocking makes the colour say the opposite of what happened.
      await refreshReadiness();
      await sync.syncNow(account.accountId);
      // Again after the sync, because whether a security key is registered is something
      // only a completed cycle knows.
      await refreshReadiness();
    } catch (error) {
      void vscode.window.showErrorMessage(
        `Unlock failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });

  register('credSshManager.setAutoLock', async () => {
    const config = vscode.workspace.getConfiguration('credSshManager');
    const current = config.get<number>('autoLockMinutes', 60);
    const hours = [1, 3, 5, 8, 12, 24];
    const items: (vscode.QuickPickItem & { minutes: number })[] = [
      ...hours.map((h) => ({
        label: h === 1 ? '1 hour' : `${h} hours`,
        description: current === h * 60 ? '$(check) current' : undefined,
        minutes: h * 60,
      })),
      {
        label: 'Only when the window closes',
        detail:
          'No idle timer. The cached key lives only in memory, so closing VS Code always locks — this switches off just the idle lock.',
        description: current === 0 ? '$(check) current' : undefined,
        minutes: 0,
      },
    ];
    const picked = await vscode.window.showQuickPick(items, {
      title: 'Lock the vaults after how long without you using them?',
      placeHolder:
        '“Using them” is your own action on a stored secret — background sync never counts.',
      ignoreFocusOut: true,
    });
    if (picked === undefined) {
      return;
    }
    await config.update('autoLockMinutes', picked.minutes, vscode.ConfigurationTarget.Global);
    void vscode.window.showInformationMessage(
      picked.minutes === 0
        ? 'Idle auto-lock is off. The vaults still lock whenever the window closes.'
        : `Vaults will lock after ${picked.label} idle.`,
    );
  });

  register('credSshManager.lockVaults', () => {
    vaultKeys.lock();
    void refreshReadiness();
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
    // Sign only where a signature means anything. The server stamps the sender
    // from a verified token, which is stronger than anything a client can sign and
    // needs no key distribution; on a folder there is nothing else to go on.
    const location = nasPathFor(sender);
    const signing =
      location !== undefined && !isServerLocation(location)
        ? await storage.ensureSigningKeypair(sender.accountId)
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

  register('credSshManager.shareEntity', async (target, selected) => {
    const { targets, skippedNote } = resolveBulkTargets(storage, target, selected);
    if (targets.length === 0) {
      return;
    }
    if (skippedNote !== '') {
      void vscode.window.showWarningMessage(skippedNote);
    }
    const accountId = targets[0].accountId;
    // One list of payloads across everything selected — delivery already batched, so
    // recipients and the share PIN are asked for once whatever the selection size.
    const payloads: SharePayload[] = [];
    for (const t of targets) {
      payloads.push(
        ...(t.node.type === 'entity'
          ? [await buildSharePayload(storage, accountId, t.node)]
          : await collectFolderPayloads(accountId, t.node)),
      );
    }
    if (payloads.length === 0) {
      void vscode.window.showInformationMessage(
        targets.length === 1
          ? `Folder "${targets[0].node.name}" holds no entities — nothing to share.`
          : 'Nothing to share — the selected folders hold no entities.',
      );
      return;
    }
    const recipients = await pickRecipients(accountId);
    if (recipients === undefined) {
      return;
    }
    const pin = await promptSharePin(true);
    if (pin === undefined) {
      return;
    }
    await deliverSharesBatch(accountId, payloads, recipients, pin);
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
      hasStoredAttachment: false,
      hasStoredImage: false,
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
    // Is this an update of something the SAME sender sent before? The map is ours,
    // keyed by (their address, their id) — a sender can never address an entry they
    // never sent, which is what the fresh-id rule was protecting.
    const origins = context.globalState.get<Record<string, string>>(ORIGINS_KEY, {});
    const previousId = resolveOrigin(
      origins,
      share.item.fromEmail,
      payload.node.id,
      (id) => storage.getNode(share.accountId, id) !== undefined,
    );

    let node: TreeNode;
    if (previousId !== undefined) {
      const existing = storage.getNode(share.accountId, previousId);
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
        await storage.recordRevision(share.accountId, previousId, {
          at: Date.now(),
          name: existing?.name ?? payload.node.name,
          details: existing?.details ?? payload.node.details!,
          secrets: {
            password: await storage.getPassword(share.accountId, previousId),
            privateKey: await storage.getPrivateKey(share.accountId, previousId),
            vpnConfig: await storage.getVpnConfig(share.accountId, previousId),
            dbConnection: await storage.getDbConnection(share.accountId, previousId),
            notes: await storage.getNotes(share.accountId, previousId),
          },
        });
        node = {
          ...payload.node,
          id: previousId,
          parentId: existing?.parentId ?? parentId,
          createdAt: existing?.createdAt,
          children: undefined,
        };
        await storage.updateNode(share.accountId, node);
      } else {
        node = { ...payload.node, id: StorageManager.newId(), parentId, children: undefined };
        await storage.addNode(share.accountId, node);
      }
    } else {
      // A fresh local id: a peer must never address (and thus silently overwrite) an
      // entity that already exists in our vault.
      node = { ...payload.node, id: StorageManager.newId(), parentId, children: undefined };
      await storage.addNode(share.accountId, node);
    }
    await context.globalState.update(
      ORIGINS_KEY,
      recordOrigin(origins, share.item.fromEmail, payload.node.id, node.id),
    );
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

  /**
   * What the recipient is allowed to conclude about who sent this, and whether to
   * go on. Runs BEFORE the PIN prompt: a share whose sender cannot be trusted
   * should never reach the point where somebody is typing a secret for it.
   */
  const senderCheck = async (share: OwnedShare): Promise<boolean> => {
    const account = storage.getAccount(share.accountId);
    if (account === undefined) {
      return false;
    }
    const location = nasPathFor(account);
    if (location !== undefined && isServerLocation(location)) {
      return true; // the server stamped it; nothing here can add to that
    }

    const verdict = judgeSender(context.globalState, share.accountId, {
      transcript: shareTranscript(share.item, account.email),
      signature: share.item.signature,
    });

    if (verdictBlocksAccept(verdict)) {
      const known = pinnedKey(context.globalState, share.accountId, share.item.fromEmail);
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
        await pinSenderKey(context.globalState, share.accountId, share.item.fromEmail, share.item.senderPublicKey);
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
      await pinSenderKey(context.globalState, share.accountId, share.item.fromEmail, share.item.senderPublicKey);
    }
    return true;
  };

  /**
   * Show this account's own fingerprint, so the comparison can be two-sided.
   *
   * <p>The recipient is shown the sender's fingerprint on first contact — but a
   * comparison needs both halves, and until now the sender had no way to read
   * theirs. Without this the fingerprint step is theatre: the only person who can
   * confirm the key is the one who cannot see it.</p>
   */
  register('credSshManager.showShareFingerprint', async (target) => {
    const account = await accountFromTargetOrPick(target, storage, 'Whose signing fingerprint?');
    if (account === undefined) {
      return;
    }
    const keypair = await storage.ensureSigningKeypair(account.accountId);
    const print = keyFingerprint(keypair.publicKey);
    const choice = await vscode.window.showInformationMessage(
      `Signing fingerprint for ${account.email}:

${print}

Read this to whoever is accepting your first share. It only matters on a shared folder — over the vault server the sender is stamped from your sign-in and cannot be forged.`,
      { modal: true },
      'Copy',
    );
    if (choice === 'Copy') {
      await vscode.env.clipboard.writeText(print);
    }
  });

  register('credSshManager.acceptShare', async (target) => {
    const element = asElement(target);
    if (element?.kind !== 'sharedItem') {
      return;
    }
    const share = element.share;
    if (!(await senderCheck(share))) {
      return;
    }
    const pin = await vscode.window.showInputBox({
      title: `Accept "${share.item.entityName}" from ${describeSender(
        share.item.fromEmail,
        senderLocation(storage, share.accountId),
      )} — into ${storage.getAccount(share.accountId)?.email ?? 'this account'}`,
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
      // Only the PIN just entered — never the whole accumulated list. An item is still in
      // `remaining` precisely because every earlier PIN already failed to open it, so
      // re-trying them is pure waste: each retry is a full scrypt (~1s), and the old
      // O(items × PINs-so-far) cost froze the editor for tens of seconds on a handful of
      // shares. openShare is deterministic, so a PIN that did not open an item never will.
      const { opened, remaining: rest } = resolveShares(remaining, [pin]);
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

  const runBackup = () => backupToNas(storage, vaultKeys);
  const runRestore = () => restoreFromBackup(storage, vaultKeys, mutated);
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
  return inheritedFolderType(storage.getNode(accountId, parentId)?.folderType);
}

/**
 * What is waiting for this account at its sync location, as far as we can tell.
 *
 * <p>Deliberately does NOT try to decrypt: a vault file that exists is proof the account
 * has a structure somewhere, and that is the whole question. Being unable to open it yet
 * is the normal state of a machine that has just signed in.</p>
 */
async function probeRemote(
  account: StoredAccount,
  transports: TransportFactory,
): Promise<RemoteState> {
  const transport = transports.forAccount(account);
  if (transport === undefined) {
    return 'no-location';
  }
  try {
    return (await transport.readVault(account)) === undefined ? 'empty' : 'unknown';
  } catch {
    // Unreachable is not empty. Treating it as empty is exactly the mistake.
    return 'unknown';
  }
}

/**
 * The nodes a bulk command should act on, and one sentence about what was left out.
 *
 * <p>Thin on purpose: every rule worth testing lives in `resolveSelection`, and this only
 * fetches the anchor account's nodes so the ancestor walk has a tree to walk.</p>
 */
function resolveBulkTargets(
  storage: StorageManager,
  clicked: unknown,
  selected: unknown,
): { targets: SelectedNode[]; skippedNote: string } {
  const anchor = asElement(clicked);
  if (anchor?.kind !== 'node') {
    return { targets: [], skippedNote: '' };
  }
  const rows = Array.isArray(selected) ? selected.map(asElement) : undefined;
  const resolved = resolveSelection(anchor, rows, storage.getNodes(anchor.accountId));
  return { targets: resolved.targets, skippedNote: describeSkips(resolved) };
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
  if (result.clearAttachment) {
    await storage.setAttachment(accountId, entityId, undefined);
  } else if (result.newAttachment !== undefined) {
    await storage.setAttachment(accountId, entityId, result.newAttachment);
  }
  if (result.clearImage) {
    await storage.setImage(accountId, entityId, undefined);
  } else if (result.newImage !== undefined) {
    await storage.setImage(accountId, entityId, result.newImage);
  }
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
    hasStoredAttachment: (await storage.getAttachment(accountId, node.id)) !== undefined,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    hasStoredImage: (await storage.getImage(accountId, node.id)) !== undefined,
    hasStoredVpnConfig: (await storage.getVpnConfig(accountId, node.id)) !== undefined,
    hasStoredDbConnection: (await storage.getDbConnection(accountId, node.id)) !== undefined,
    initialDbConnection: await storage.getDbConnection(accountId, node.id),
    initialNotes: (await storage.getNotes(accountId, node.id)) ?? node.details?.notes,
    keyCandidates: await collectKeyCandidates(storage, accountId, node.id),
  });
  if (result === undefined) {
    return;
  }
  // Snapshot what is there before it is replaced — the whole point of history is being
  // able to see what a change changed, which is only knowable from the old state.
  await storage.recordRevision(accountId, node.id, {
    at: Date.now(),
    name: node.name,
    details: node.details,
    secrets: {
      password: await storage.getPassword(accountId, node.id),
      privateKey: await storage.getPrivateKey(accountId, node.id),
      vpnConfig: await storage.getVpnConfig(accountId, node.id),
      dbConnection: await storage.getDbConnection(accountId, node.id),
      notes: await storage.getNotes(accountId, node.id),
    },
  });
  await storage.updateNode(accountId, {
    ...node,
    name: result.details.name,
    details: result.details,
  });
  await applySecrets(storage, accountId, node.id, result);
  // AFTER the secrets land, so the values written are the ones just saved. The old
  // bindings are passed so a renamed or switched-off variable is deleted, not orphaned.
  await applyEnvBindings(envCollection, storage, accountId, result.details, node.details.envBindings);
  onMutated();
}

/**
 * Connect over SSH resolving the key source: a referenced key entity wins,
 * then this entity's stored private key (materialized to a 0600 file),
 * then its plain key path.
 */

/**
 * Bring a VPN tunnel up or down.
 *
 * <p>The config is materialized into the extension's private storage under the file name
 * the tool expects, and the command is shown in a terminal so the elevation prompt — UAC
 * on Windows, sudo on POSIX — is the operating system's own. Nothing is elevated
 * silently, and the line that will run is on screen before it runs.</p>
 */
async function runVpn(
  target: unknown,
  action: 'start' | 'stop',
  storage: StorageManager,
  storageDir: string,
  vaultKeys: VaultKeys,
): Promise<void> {
  vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
  const element = asElement(target);
  if (element?.kind !== 'node' || !element.node.details) {
    return;
  }
  const details = element.node.details;
  const type = details.vpnType;
  if (!isVpnStartable(type) || type === undefined) {
    void vscode.window.showWarningMessage(
      `"${details.name}" is a ${details.vpnType ?? 'VPN'} entry. Only WireGuard and OpenVPN can be started from here — use Save Config and import it where your OS expects it.`,
    );
    return;
  }

  const platform = process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux';
  const tunnel = vpnTunnelName(details.name);
  const fileName = vpnConfigFileName(type, details.name);
  const configPath = path.join(materializedKeysDir(storageDir), fileName);

  // Stop does not need the config re-written; start does. Asking for the vault on a Stop
  // would mean a locked vault could leave a tunnel up with no way to bring it down.
  if (action === 'start') {
    const config = await storage.getVpnConfig(element.accountId, details.id);
    if (config === undefined || config.trim().length === 0) {
      void vscode.window.showWarningMessage(
        `"${details.name}" has no stored VPN config — open Edit and upload the file first.`,
      );
      return;
    }
    materializeVpnConfig(storageDir, fileName, config);
  }

  // Find the binary BEFORE composing a command around it. `openvpn.exe` is not on
  // PATH on a default install, and "OpenVPN on this machine" is often OpenVPN Connect —
  // a GUI that neither takes --config nor belongs on a command line.
  const launcher = resolveVpnLauncher(type, process.platform, process.env, onPath, fs.existsSync);
  if (launcher.kind === 'missing') {
    void vscode.window.showErrorMessage(
      `Could not find ${type} on this machine. Looked for: ${launcher.looked.join(', ')}. Install it, or connect with the client you normally use.`,
    );
    return;
  }
  if (launcher.kind === 'openvpn-connect') {
    if (action === 'stop') {
      void vscode.window.showInformationMessage(
        'This machine uses OpenVPN Connect — disconnect from its own window.',
      );
      return;
    }
    // The GUI can IMPORT a profile; it cannot be driven like the CLI. Importing is the
    // honest half we can do — connecting stays in its window, where the tunnel may in
    // fact already be up.
    const open = await vscode.window.showInformationMessage(
      'This machine has OpenVPN Connect (the GUI), not the OpenVPN command line. Import this profile into it? If this VPN is already connected there, there is nothing to start.',
      'Import profile',
    );
    if (open === 'Import profile') {
      const terminal = vpnTerminal(details.name);
      terminal.sendText(`& "${launcher.exe}" --import-profile="${configPath}"`, true);
    }
    return;
  }

  const launch =
    action === 'start'
      ? vpnStartCommand(type, platform as VpnPlatform, configPath, launcher.exe)
      : vpnStopCommand(type, platform as VpnPlatform, tunnel, configPath);

  if (launch.kind === 'unsupported') {
    void vscode.window.showInformationMessage(launch.reason);
    return;
  }

  const terminal = vpnTerminal(details.name);
  terminal.sendText(launch.command, true);
  void vscode.window.showInformationMessage(launch.note);
}

function vpnTerminal(entryName: string): vscode.Terminal {
  const name = `CredsForDevs VPN: ${entryName}`;
  const existing = vscode.window.terminals.find((t) => t.name === name);
  const terminal = existing ?? vscode.window.createTerminal({ name });
  terminal.show();
  return terminal;
}

/** Whether `name` resolves on PATH — `where` on Windows, `command -v` elsewhere. */
function onPath(name: string): boolean {
  try {
    childProcess.execFileSync(
      process.platform === 'win32' ? 'where' : 'which',
      [name],
      { stdio: 'ignore', timeout: 3_000 },
    );
    return true;
  } catch {
    return false;
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
  await saveTextAs('Save VPN config', details.vpnConfigFileName ?? `${details.name}.ovpn`, content);
}

/** Save-As for a text secret the caller already holds. */
async function saveTextAs(title: string, suggestedName: string, content: string): Promise<void> {
  const uri = await vscode.window.showSaveDialog({
    title,
    defaultUri: vscode.Uri.file(path.join(os.homedir(), suggestedName)),
  });
  if (uri === undefined) {
    return;
  }
  await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
  void vscode.window.showInformationMessage(`Saved to ${uri.fsPath}.`);
}

/**
 * The read-only viewer, on a PREVIOUS version.
 *
 * <p>Every secret comes from the revision itself, never from the current entry — that is the
 * whole point of looking. Two things the current entry's viewer offers are refused here:
 * writing the value into a terminal variable (an old password into a live variable is a
 * trap with a plausible name), and the history list (a version has no history of its own).
 * Attachments are not kept in revisions, so none are shown.</p>
 */
function openRevisionViewer(node: TreeNode, revision: Revision): void {
  const details = revision.details;
  const { password, privateKey, vpnConfig, dbConnection, notes } = revision.secrets;
  const dbParts = dbConnection !== undefined ? parseDbConnectionString(dbConnection) : undefined;
  let dbPortIsDefault = false;
  if (dbParts !== undefined && dbParts.port === undefined && details.dbType !== undefined) {
    dbParts.port = DB_DEFAULT_PORTS[details.dbType];
    dbPortIsDefault = true;
  }
  const refuseEnv = (): Promise<boolean> => {
    void vscode.window.showWarningMessage(
      'This is a previous version. Set terminal variables from the current entry, not from history.',
    );
    return Promise.resolve(false);
  };
  showEntityView({
    details: {
      ...details,
      name: `${revision.name} — version replaced ${new Date(revision.at).toLocaleString()}`,
    },
    hasPassword: password !== undefined,
    hasPrivateKey: privateKey !== undefined,
    hasVpnConfig: vpnConfig !== undefined,
    hasDbConnection: dbConnection !== undefined,
    notes,
    dbParts: dbParts !== undefined ? { ...dbParts, password: undefined } : undefined,
    dbPortIsDefault,
    dbHasPassword: dbParts?.password !== undefined,
    sshCommand: buildSshCommand(details),
    resolveSecret: (field) =>
      Promise.resolve(
        field === 'password'
          ? password
          : field === 'privateKey'
            ? privateKey
            : field === 'vpnConfig'
              ? vpnConfig
              : field === 'dbPassword'
                ? dbParts?.password
                : dbConnection,
      ),
    copyAllText: () => Promise.resolve(formatEntityBlock(details, password, dbConnection, notes)),
    saveVpnConfig: () =>
      vpnConfig === undefined
        ? Promise.resolve()
        : saveTextAs(
            'Save VPN config (previous version)',
            details.vpnConfigFileName ?? `${revision.name}.ovpn`,
            vpnConfig,
          ),
    hasAttachment: false,
    createdAt: node.createdAt,
    updatedAt: revision.at,
    history: [],
    saveAttachment: () => Promise.resolve(),
    setEnv: refuseEnv,
    checkEnv: () => void refuseEnv(),
  });
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
  const imageB64 = await storage.getImage(accountId, details.id);
  const imageMimeType = details.imageFileName !== undefined ? imageMime(details.imageFileName) : undefined;
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
    hasAttachment: (await storage.getAttachment(accountId, details.id)) !== undefined,
    createdAt: node?.createdAt,
    updatedAt: node?.updatedAt,
    history: await storage.getHistory(accountId, details.id),
    imageDataUri:
      imageB64 !== undefined && imageMimeType !== undefined
        ? `data:${imageMimeType};base64,${imageB64}`
        : undefined,
    saveAttachment: async (which) => {
      const base64 =
        which === 'image'
          ? await storage.getImage(accountId, details.id)
          : await storage.getAttachment(accountId, details.id);
      if (base64 === undefined) {
        return;
      }
      const suggested =
        which === 'image'
          ? (details.imageFileName ?? `${details.name}.png`)
          : (details.attachmentFileName ?? `${details.name}.bin`);
      const target = await vscode.window.showSaveDialog({
        title: which === 'image' ? 'Save image' : 'Save file',
        defaultUri: vscode.Uri.file(path.join(os.homedir(), suggested)),
      });
      if (target === undefined) {
        return;
      }
      await vscode.workspace.fs.writeFile(target, Buffer.from(base64, 'base64'));
      void vscode.window.showInformationMessage(`Saved to ${target.fsPath}.`);
    },
    // The manual half of env bindings: the automatic write happens on save, but the
    // collection can be lost with the extension's storage — this button re-sets one
    // variable from the CURRENT stored value, on this machine, right now.
    // A FRESH terminal every time: the collection applies to terminals created after
    // the write, so probing in an old one would "prove" the variable is missing.
    checkEnv: (name) => {
      const terminal = vscode.window.createTerminal({ name: `env check: ${name}` });
      terminal.show();
      terminal.sendText(envProbeCommand(vscode.env.shell, name), true);
    },
    setEnv: async (field, name) => {
      const value = await bindableFieldValue(storage, accountId, details, field);
      if (value === undefined || value.length === 0) {
        void vscode.window.showWarningMessage('Nothing stored in that field — nothing was set.');
        return false;
      }
      envCollection.replace(name, value);
      envCollection.description = 'CredsForDevs: secrets exposed as terminal variables';
      void vscode.window.showInformationMessage(
        `$${name} is set for NEW integrated terminals. Already-open terminals keep their old environment.`,
      );
      return true;
    },
  });
}

// ---------- helpers ----------

/**
 * Where the account holding this share syncs — which is what decides whether the
 * share's claimed sender was stamped by a server or merely written into a file.
 */
function senderLocation(storage: StorageManager, accountId: string): string | undefined {
  const account = storage.getAccount(accountId);
  return account === undefined ? undefined : nasPathFor(account);
}

/**
 * Say so, once, when this machine may have no keychain behind SecretStorage.
 *
 * <p>Once per machine, not once per window: VS Code says nothing about the
 * fallback itself, so the person has to hear it — but a security warning that
 * arrives every morning is one people learn to dismiss, and then the one that
 * matters arrives after the habit is formed. The flag is deliberately in
 * `globalState` rather than a setting: it is a "you have been told", not a
 * preference anybody should have to find.</p>
 */
function warnIfKeyringMissing(context: vscode.ExtensionContext): void {
  const KEY = 'credSshManager.keyringWarningShown';
  if (context.globalState.get<boolean>(KEY) === true) {
    return;
  }
  const unprotected = keyringMayBeUnprotected({
    platform: process.platform,
    dbusAddress: process.env.DBUS_SESSION_BUS_ADDRESS,
    remoteName: vscode.env.remoteName,
  });
  if (!unprotected) {
    return;
  }
  void context.globalState.update(KEY, true);
  void vscode.window
    .showWarningMessage(keyringWarningMessage(), 'How to fix this')
    .then((choice) => {
      if (choice === 'How to fix this') {
        void vscode.env.openExternal(
          vscode.Uri.parse('https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs#readme'),
        );
      }
    });
}

/**
 * The entity a row stands for — the current one, or the version it was at a point in time.
 *
 * <p>A revision row resolves to a node element carrying THAT version's name and metadata, so
 * Run, Copy Command, Show Command and Clone need no second code path: they act on "the
 * entity as it was" through the same shape they already take. The revision itself is read
 * from SecretStorage here rather than carried on the element — the tree caches heads only,
 * so an old password is never resident in the extension host longer than one action.</p>
 */
async function nodeAt(
  element: TreeElement | undefined,
  storage: StorageManager,
): Promise<(Extract<TreeElement, { kind: 'node' }> & { revision?: Revision }) | undefined> {
  if (element?.kind === 'node') {
    return element;
  }
  if (element?.kind !== 'revision') {
    return undefined;
  }
  const revision = (await storage.getHistory(element.accountId, element.node.id))[element.index];
  if (revision === undefined) {
    void vscode.window.showWarningMessage('That version is no longer kept.');
    return undefined;
  }
  return {
    kind: 'node',
    accountId: element.accountId,
    node: { ...element.node, name: revision.name, details: revision.details, children: undefined },
    revision,
  };
}

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
  if (
    v.kind === 'revision' &&
    typeof v.accountId === 'string' &&
    typeof v.node?.id === 'string' &&
    typeof v.index === 'number'
  ) {
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
