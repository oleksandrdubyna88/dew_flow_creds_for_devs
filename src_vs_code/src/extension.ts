/* eslint-disable max-lines, max-lines-per-function, complexity --
   The 3,000-line activate() is audit item A1's subject: this file is being dismantled into
   modules, each of which lints clean; a marker per violation here would be deleted within
   days. Remove this header as the LAST step of A1, when the file is a thin composition. */
import { describeError } from './describeError';
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
import { keyringMayBeUnprotected, keyringWarningMessage } from './keyringWarning';
import { confirmCommandMessage, isCommandTrusted, trustCommand } from './commandTrust';
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
  materializedKeyPath,
  purgeMaterializedKeys,
  safeFileComponent,
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
import { Revision } from './revisionHistory';
import { SyncManager } from './syncManager';
import { buildSshCommand, describeSshTarget } from './terminalManager';
import { connectEntity } from './sshConnect';
import { CredsAgentServer } from './credsAgentServer';
import { UseActionRegistry } from './useActions';
import { sshExecAction, sshTerminalAction } from './sshUseActions';
import { buildAgentSnippet, buildKindSnippet } from './agentShareSnippet';
import { openInDbExtension } from './dbLauncher';
import { sharesFromEnvelope } from './shareFormat';
import { ShareInbox } from './shareInbox';
import { SharingManager } from './sharingManager';
import { TransportFactory } from './transportFactory';
import { VaultKeys } from './vaultKeys';
import { isKeyWrap, newPrfSalt, webauthnWraps } from './keyWrap';
import { decryptJson, encryptJson, readVaultWraps } from './cryptoUtils';
import { registerSecurityKey } from './webauthnPrf';
import {
  dbDisplay,
  revisionSecretReader,
  totpViewFor,
  secretResolver,
  storageSecretReader,
} from './viewerOptions';
import { snapshotForRevision } from './revisionSnapshot';
import {
  envelopeWithAddedKey,
  envelopeWithRemovedKey,
  isSecurityKeyRefusal,
  removalWouldRekey,
} from './securityKeyOps';
import { validatePin } from './pinPolicy';
import { CredTreeDataProvider, VIEW_ID } from './treeDataProvider';
import { DepDecorationProvider } from './depDecorations';
import { ExpansionMemory, expansionKey } from './treeExpansion';
import { buildDependencyCandidates, buildDependencyColorMap } from './depGraph';
import { EntityFlagsRefresher, entityFlagSource } from './entityFlags';
import { createDiagnosticLog } from './diagnosticLog';
import { resolveKind } from './entityKind';
import { burnIfOneUse } from './burnOnUse';
import {
  bridgeId,
  buildBridgeArgv,
  describeWideSocket,
  isOwnerOnlyMode,
  modeCheckCommand,
  remoteInstructions,
  remoteSocketPath,
  sweepCommand,
} from './sshBridge';
import { SshBridgeManager } from './sshBridgeManager';
import { entityKey } from './entityFlags';
import { parseToken } from './grantToken';
import { materializePrivateKey } from './keyInstaller';
import { isSafeSshTarget } from './sshCommand';
import { buildSshExecArgv } from './sshExecCommand';
import { runSshExec } from './sshExecRunner';
import { resolveSshCredential } from './sshCredential';
import {
  AliasMap,
  aliasFor,
  describeAliasProblem,
  listAliases,
  resolveAlias,
  withAlias,
  withoutAlias,
} from './cliAliases';
import { EphemeralSweeper } from './ephemeralSweeper';
import { maskEntriesFor } from './maskEntries';
import { MaskEntry, buildMaskTable } from './secretMasker';
import { describeScan, scanForSecrets } from './secretScan';
import { RemoteState, buildDefaultFolders } from './defaultFolders';
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
import { describeTotp, parseTotpSecret, totpSnapshot } from './totp';
import { hostKeyFingerprint, parseHostKey } from './hostKeyPin';
import { RefSource, resolveSecretRefs } from './secretRef';
import {
  buildCommandLineWithRefs,
  planRefs,
  refField,
  rewriteScriptRefs,
} from './runPlan';
import { runInMaskedTerminal } from './maskedTerminal';
import { MIN_MASKABLE_LENGTH } from './outputMask';
import { SshAgentManager } from './sshAgentManager';
import { gitSigningClipboardText, gitSigningConfig } from './gitSigningConfig';
import { parseSshPrivateKey } from './sshKeyParse';
import {
  DEFAULT_PASSPHRASE,
  DEFAULT_PASSWORD,
  generatePassphrase,
  generatePassword,
} from './secretGenerator';
import { folderPath, quickOpenItems } from './quickOpen';
import { runHygieneScan } from './hygieneScan';
import { ImportedEntity, parseImport, toTreeNodes } from './importFormats';
import { LockStatusBar } from './statusBar';
import {
  asElement,
  collectJumpCandidates,
  folderKindOf,
  resolveBulkTargets,
} from './commandTargets';
import {
  credentialExportEnvAction,
  dbQueryAction,
  scriptRunAction,
  terminalRunAction,
  vpnAction,
} from './agentUseActions';
import {
  AuthProvider,
  ENTITY_KIND_LABELS,
  StoredAccount,
  EntityMetadata,
  SharePayload,
  TreeElement,
  TreeNode,
} from './types';


/** Set in activate(); the module-level slot keeps editNode's signature unchanged. */
let envCollection: vscode.GlobalEnvironmentVariableCollection;

/**
 * How long the keychain must be quiet before a foreign write triggers a flag refresh.
 * One edit writes several secret kinds in a row; this coalesces them into one walk.
 */
const SECRETS_SETTLE_MS = 400;

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


  // CLI aliases: name → which entry, and nothing else. Kept in globalState rather than in the
  // vault because a name is machine-local by nature — the terminal that types it is on this
  // machine — and because putting it in the synced record would make every colleague's copy
  // carry names only this machine can act on.
  const ALIAS_KEY = 'credSshManager.cliAliases';
  const aliasMap = (): AliasMap => context.globalState.get<AliasMap>(ALIAS_KEY, {});
  const setAliasMap = (next: AliasMap): Thenable<void> =>
    context.globalState.update(ALIAS_KEY, next);
  const storageDir = context.globalStorageUri.fsPath;

  // One diagnostic channel for everything that is not the agent broker, plus a file per run
  // (audit A6). A toast is right for interrupting a person and wrong for a bug report: it is
  // gone by the time anyone asks what it said. Nothing here can read a vault — see
  // diagnosticLog.ts on why "no secret reaches the log" is a property and not a filter.
  const log = createDiagnosticLog({ storageDir });
  context.subscriptions.push(log);
  log.info('extension', `activated; diagnostics for this run are in ${log.file}`);

  // Live `ssh -R` bridges. Every one is killed with the window: a forwarded socket is an
  // opening into this machine's broker, and one that outlived the window authorizing it would
  // let a remote host reach a broker nobody is watching.
  //
  // Constructed here rather than beside the tree provider because it logs, and `log` does not
  // exist until above. A bridge ending by itself — a dropped network, a refused forward — is
  // exactly the kind of thing nobody sees happen and everybody needs afterwards.
  const bridges = new SshBridgeManager(
    (command, args, env) => {
      const child = childProcess.spawn(command, [...args], { env, windowsHide: true, stdio: 'ignore' });
      return {
        kill: () => child.kill(),
        exited: new Promise<number | null>((resolve) => child.once('exit', (code) => resolve(code))),
      };
    },
    (key, code) => log.warn('bridge', `${key} ended (${String(code)})`),
  );
  context.subscriptions.push({ dispose: () => bridges.dispose() });


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

  // Which rows were open, kept in globalState so they survive a reload and a reboot.
  //
  // Recorded from the view's own events rather than guessed from anything the provider does:
  // VS Code is the only thing that knows a twisty was clicked. While a filter is active the term
  // decides what is open, so those events are ignored — otherwise clearing the filter would leave
  // behind a tree shaped by a search nobody is running any more.
  const expansion = new ExpansionMemory(context.globalState);
  provider.expansion = expansion;
  context.subscriptions.push(
    treeView.onDidExpandElement((e) => {
      if (provider.searchQuery.length === 0) {
        void expansion.set(expansionKey(e.element), true);
      }
    }),
    treeView.onDidCollapseElement((e) => {
      if (provider.searchQuery.length === 0) {
        void expansion.set(expansionKey(e.element), false);
      }
    }),
  );

  // The label colour and badge for entities in a dependency relationship. It reads the tree
  // provider's OWN index rather than building a second one, so the colour a row is painted in
  // and the sub-tree hanging under it can never disagree about who depends on what.
  const depDecorations = new DepDecorationProvider(provider.dependencies);
  context.subscriptions.push(
    depDecorations,
    vscode.window.registerFileDecorationProvider(depDecorations),
  );

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
    log,
  );
  context.subscriptions.push(sync);

  // Dated snapshots, separately from sync. Constructed AFTER the sync manager because a
  // snapshot is a copy of what sync maintains — with no sync location there is nothing to
  // copy, and the scheduler says so rather than inventing an export of its own.
  const backups = new BackupScheduler(storage, transports, context.globalState, (message) =>
    log.info('backup', message),
  );
  context.subscriptions.push(backups);

  // Short-lived entries: delete what has run out of clock, and renew the lease on what this
  // window is holding open. Started here rather than lazily because a window OPENING is when
  // entries orphaned by a window that crashed are found — that first pass is the whole
  // crash-safety story, and a lazy start would skip it in exactly the case it exists for.
  const ephemeral = new EphemeralSweeper(
    storage,
    context.globalState,
    (message) => log.info('ephemeral', message),
    () => provider.refresh(),
  );
  ephemeral.start();
  context.subscriptions.push(ephemeral);

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
  const entityFlags = new EntityFlagsRefresher(entityFlagSource(storage), provider);
  const refreshEntityFlags = (): Promise<void> => entityFlags.refresh();
  void refreshEntityFlags();

  /**
   * Another window of this profile wrote a secret.
   *
   * <p>Both flag caches mirror the keychain, and a second window's write reaches this one only
   * as this event — before it, the row kept the menu it had when this window last walked, which
   * is how a password saved next door left "Copy Password" missing here until an unrelated
   * mutation. Debounced because a single edit writes several kinds in a row, and the refresher
   * itself coalesces anything that still overlaps.</p>
   */
  let secretsSettle: ReturnType<typeof setTimeout> | undefined;
  context.subscriptions.push(
    context.secrets.onDidChange(() => {
      if (secretsSettle !== undefined) {
        clearTimeout(secretsSettle);
      }
      secretsSettle = setTimeout(() => {
        secretsSettle = undefined;
        void refreshEntityFlags();
      }, SECRETS_SETTLE_MS);
    }),
    { dispose: () => clearTimeout(secretsSettle) },
  );

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
    // The status bar answers the same question the readiness icons do, so it is repainted from
    // the same place rather than from every caller that might have changed the lock.
    statusBar.render(locked, storage.getAccounts().length, false);
    return provider.readiness;
  };

  // Whether the vault is locked decides whether background sync runs at all; until this it
  // could only be discovered by trying something.
  const statusBar = new LockStatusBar();
  context.subscriptions.push(statusBar);
  void refreshReadiness();

  provider.onMutate = () => sync.notifyChange();
  const mutated = () => {
    provider.refresh();
    // `refresh()` threw the dependency index away; this makes VS Code come back and ask for
    // the decorations again. Both are needed: the tree repaints its rows, the decorations
    // repaint their labels, and they are two different notification channels.
    depDecorations.refresh();
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
  // The fourth argument is what makes masking live: the broker asks for the grant entity's own
  // secret values and redacts them out of whatever the agent is about to read.
  const agentServer = new CredsAgentServer(
    useActions,
    () => vaultKeys.noteUserActivity(),
    storageDir,
    (accountId, entityId) => maskEntriesFor(storage, accountId, entityId),
    // The fifth makes "until an agent uses it once" real: a successful call destroys the
    // entry through the one deletion path, tombstone and revision history included.
    async (accountId, entityId) => {
      const burned = await burnIfOneUse(storage, accountId, entityId);
      if (burned) {
        provider.refresh();
      }
      return burned;
    },
    // The sixth lets `creds ssh prod-db` name an entry instead of pasting a token. The
    // registry holds only which entry a name points at — never a token and never a secret —
    // so an alias says WHICH, and the consent modal still says WHETHER.
    (name) => {
      const alias = resolveAlias(aliasMap(), name);
      if (alias === undefined) {
        return undefined;
      }
      const node = storage.getNode(alias.accountId, alias.entityId);
      return node === undefined
        ? undefined
        : {
            accountId: alias.accountId,
            entityId: alias.entityId,
            entityName: node.name,
            kind: resolveKind(node.details),
          };
    },
    // The seventh answers `creds ls`. Names and kinds only — the same registry the resolver
    // reads, but a different disclosure: being handed every name is not the same as resolving
    // one you already know, which is why the broker takes them as two callbacks.
    () => listAliases(aliasMap()),
  );
  // The SSH agent: keys served from memory, every use confirmed, SSH_AUTH_SOCK injected into
  // new terminals. Nothing starts until a key is actually loaded.
  const sshAgent = new SshAgentManager(
    storage,
    storageDir,
    envCollection,
    () => vaultKeys.noteUserActivity(),
    // Published in the endpoint file so a relay inside WSL can find this agent without a pid.
    agentServer.setAgentAddress,
  );
  context.subscriptions.push(sshAgent);
  void sshAgent.loadMarked().then((count) => {
    if (count > 0) {
      void vscode.window.showInformationMessage(
        `${count} SSH key(s) are served by the CredsForDevs agent. Every use asks first; see "CredsForDevs: SSH Agent" for the record.`,
      );
    }
  });

  const sshDeps = {
    storage,
    storageDir,
    signal: agentServer.signal,
    acquireExecSlot: agentServer.acquireExecSlot,
    note: agentServer.note,
    // What makes `-A` real rather than decorative: the child needs SSH_AUTH_SOCK in its own
    // environment, and the collection above reaches terminals only. See `sshProgram.ts`.
    agentSocket: (): string | undefined => sshAgent.socketPath,
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

  /**
   * Give an entry a name a terminal can use — or take it away again.
   *
   * <p>The name is all that is stored. It is not a credential and confers nothing: the first
   * `creds` call under it still raises the same consent modal as a pasted token would, and the
   * grant it mints still dies with this window.</p>
   */
  /**
   * Hold an `ssh -R` open to this host so `creds` works there.
   *
   * <p>The direction is the whole feature: VS Code's own forwarding shows a LOCAL client a
   * REMOTE service, and this needs the opposite — the remote host reaching the broker on THIS
   * machine. Nothing is copied over: no key, no password, no vault. The remote gets a socket
   * that speaks to a broker here, the consent modal appears here, and only the output of an
   * action travels back.</p>
   *
   * <p>The grant is minted first because it is what starts the broker and names its port, and
   * because the person needs a token on the far side anyway — so one action produces both
   * halves of what makes the remote useful.</p>
   */
  /**
   * Look at what the forwarded socket's permissions actually are.
   *
   * <p>They are the boundary on that host and this end cannot set them: for a `-R` forward the
   * socket is created by sshd, so the SERVER's `StreamLocalBindMask` decides. Measured on a real
   * host — a client asking for mode 0000 still got `srw-------`, because the client's copy of
   * that option is ignored for a remote forward. So the honest thing is to observe and say when
   * it is wrong, rather than ship a flag that reads like a guarantee.</p>
   *
   * <p>Best-effort and never fatal: a host without `stat`, or one that has not finished binding
   * yet, simply produces no claim either way. Silence here means "not observed", never "safe".</p>
   */
  /**
   * Remove this user's dead bridge sockets on the remote host.
   *
   * <p>Best-effort and quiet: litter is a tidiness problem, and a host where the sweep cannot
   * run is a host with some extra inert files, not a broken bridge. The command itself refuses
   * to do anything when `ss` is missing — without it the liveness test would answer "nobody
   * listening" for every socket and the sweep would delete every live bridge on the machine.</p>
   */
  async function sweepDeadSockets(
    entity: EntityMetadata,
    keyPath: string | undefined,
    user: string,
  ): Promise<void> {
    const argv = buildSshExecArgv(entity, keyPath, sweepCommand(user));
    if (argv === undefined) {
      return;
    }
    try {
      await runSshExec(argv, { env: process.env, timeoutMs: 15_000, signal: agentServer.signal });
    } catch (error) {
      log.info('bridge', `socket sweep did not run: ${describeError(error)}`);
    }
  }

  async function verifyBridgeSocket(
    accountId: string,
    entity: EntityMetadata,
    remote: { path: string },
  ): Promise<void> {
    try {
      const credential = await resolveSshCredential(storage, accountId, entity);
      const keyPath =
        credential.kind === 'storedKey' && storageDir !== undefined
          ? materializePrivateKey(storageDir, `bridgecheck-${entity.id}`, credential.content)
          : undefined;
      const argv = buildSshExecArgv(entity, keyPath, modeCheckCommand(remote));
      if (argv === undefined) {
        return;
      }
      // sshd does not unlink a `-R` socket when its session ends — measured on a real host —
      // and nothing else does, so every dropped bridge leaves one behind. Swept here, AFTER the
      // new one is up: it is then live, and the sweep keeps anything still being listened on,
      // which is what stops it removing another window's working bridge.
      await sweepDeadSockets(entity, keyPath, entity.user ?? '');
      // A moment for sshd to bind before asking about the file.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const outcome = await runSshExec(argv, {
        env: process.env,
        timeoutMs: 15_000,
        signal: agentServer.signal,
      });
      const mode = (outcome.stdout ?? '').trim();
      if (mode.length === 0 || mode === 'unknown') {
        log.info('bridge', `could not read the mode of ${remote.path} on that host`);
        return;
      }
      if (!isOwnerOnlyMode(mode)) {
        log.warn('bridge', `${remote.path} is mode ${mode}, not 600`);
        void vscode.window.showWarningMessage(describeWideSocket(mode, remote));
      }
    } catch (error) {
      log.info('bridge', `socket check did not complete: ${describeError(error)}`);
    }
  }

  register('credSshManager.openRemoteBridge', async (...args: unknown[]) => {
    const element = args[0] as { accountId?: string; node?: { id: string; name: string } };
    const accountId = element?.accountId;
    const node = element?.node;
    if (accountId === undefined || node === undefined) {
      return;
    }
    const key = entityKey(accountId, node.id);

    if (bridges.isOpen(key)) {
      const answer = await vscode.window.showQuickPick(['Keep it open', 'Close the bridge'], {
        title: `"${node.name}" is bridged at ${bridges.remotePathFor(key)}`,
      });
      if (answer === 'Close the bridge') {
        bridges.stop(key);
        void vscode.window.showInformationMessage(`The bridge to "${node.name}" is closed.`);
      }
      return;
    }

    const details = storage.getNode(accountId, node.id)?.details;
    if (details === undefined || (details.host ?? '') === '') {
      void vscode.window.showWarningMessage(
        `"${node.name}" has no host configured — there is nothing to bridge to.`,
      );
      return;
    }

    // Minting also starts the broker, which is what gives the port the forward needs.
    const token = await agentServer.share(accountId, node.id, node.name, 'ssh');
    const parsed = parseToken(token);
    if (parsed === undefined) {
      return;
    }

    const credential = await resolveSshCredential(storage, accountId, details);
    const keyPath =
      credential.kind === 'storedKey' && storageDir !== undefined
        ? materializePrivateKey(storageDir, `bridge-${node.id}`, credential.content)
        : undefined;

    const remote = { path: remoteSocketPath(details.user ?? '', bridgeId(() => crypto.randomUUID())) };
    const argv = buildBridgeArgv(details, { port: parsed.port, remote, keyPath }, isSafeSshTarget);
    if (argv === undefined) {
      void vscode.window.showWarningMessage(
        `"${node.name}" cannot be bridged: its host is not a shape ssh can be given safely.`,
      );
      return;
    }

    bridges.start(key, remote.path, 'ssh', argv, process.env);

    // The socket's permissions are the boundary on that host, and we cannot set them: for a
    // `-R` forward sshd creates the socket, so the SERVER's StreamLocalBindMask governs. So
    // look instead of assuming — measured on a real host after a version of this claimed a
    // client flag did it. A host whose admin widened that mask hands every login there an
    // opening into this machine's broker, and nobody would ever find out.
    void verifyBridgeSocket(accountId, details, remote);

    // The token goes THROUGH `remoteInstructions`, never appended after it: the block is pasted
    // into a shell, and appending prose is what put a bearer token into a remote's history as a
    // failed command.
    const instructions = remoteInstructions(remote, token);
    const answer = await vscode.window.showInformationMessage(
      `Bridge open to "${node.name}". Paste the setup block on that host and \`creds\` works there.`,
      'Copy the setup block',
    );
    if (answer !== undefined) {
      await vscode.env.clipboard.writeText(instructions);
    }
  });

  register('credSshManager.enableCliAccess', async (...args: unknown[]) => {
    const element = args[0] as { accountId?: string; node?: { id: string; name: string } };
    const accountId = element?.accountId;
    const node = element?.node;
    if (accountId === undefined || node === undefined) {
      return;
    }

    const existing = aliasFor(aliasMap(), accountId, node.id);
    if (existing !== undefined) {
      const answer = await vscode.window.showQuickPick(['Keep it', `Remove "${existing}"`], {
        title: `"${node.name}" is available to the CLI as "${existing}"`,
      });
      if (answer?.startsWith('Remove') === true) {
        await setAliasMap(withoutAlias(aliasMap(), existing));
        void vscode.window.showInformationMessage(`"${existing}" is no longer available to the CLI.`);
      }
      return;
    }

    const name = await vscode.window.showInputBox({
      title: `Name for "${node.name}" in the terminal`,
      prompt: 'Then: creds ssh <name> -- <command>. The name is not a secret; every call still asks you to allow it.',
      value: node.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40),
      validateInput: (value) => describeAliasProblem(value.trim()) ?? null,
    });
    if (name === undefined) {
      return;
    }

    const kind = resolveKind(storage.getNode(accountId, node.id)?.details);
    await setAliasMap(withAlias(aliasMap(), name.trim(), { accountId, entityId: node.id, kind }));
    void vscode.window.showInformationMessage(
      `"${node.name}" is now available in the terminal as: creds ${kind === 'db' ? 'db' : 'ssh'} ${name.trim()}`,
    );
  });

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

  /**
   * Is a vault secret in this text?
   *
   * <p>Asked, never watched. VS Code exposes no clipboard-change event, and on Windows the
   * clipboard is captured by Clipboard History at the moment of the copy — before any
   * extension could react — which `secretClipboard.ts` already documents for its own TTL
   * clearing. A background watcher would be a promise the platform cannot keep, so the answer
   * is exact and on demand instead.</p>
   */
  const scanText = async (text: string, what: string): Promise<void> => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const entries: MaskEntry[] = [];
    for (const account of storage.getAccounts()) {
      for (const node of storage.getNodes(account.accountId)) {
        if (node.type === 'entity') {
          entries.push(...(await maskEntriesFor(storage, account.accountId, node.id)));
        }
      }
    }
    const report = scanForSecrets(text, buildMaskTable(entries));
    const message = describeScan(report, what);
    // A hit is a warning, a miss is information — the two must not look alike at a glance.
    if (report.total > 0) {
      void vscode.window.showWarningMessage(message);
    } else {
      void vscode.window.showInformationMessage(message);
    }
  };

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
            `Local profile removed, but the remote vault could not be deleted: ${describeError(error)}`,
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
      hasStoredTotp: false,
      hasStoredHostKey: false,
      lockedKind: folderKindOf(storage, location.accountId, location.parentId),
      keyCandidates: await collectKeyCandidates(storage, location.accountId, id),
      dependencyFolders: buildDependencyCandidates(storage.getNodes(location.accountId), id),
      dependencyColors: buildDependencyColorMap(storage.getNodes(location.accountId)),
      jumpCandidates: collectJumpCandidates(storage, location.accountId, id),
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
    await applyDependencyColors(storage, location.accountId, result.dependsOnColors);
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
        resolveKind(element.node.details) !== required
      ) {
        void vscode.window.showWarningMessage(
          `Folder "${targetFolder?.name}" holds only ${required} entities — "${element.node.name}" is ${resolveKind(element.node.details)}.`,
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

  // The current one-time code, computed from the stored seed at this moment. The seed
  // itself never leaves SecretStorage; what lands on the clipboard expires twice — once
  // when the period ends, once when the clipboard TTL clears it.
  register('credSshManager.copyTotpCode', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const element = asElement(target);
    if (element?.kind !== 'node' || !element.node.details) {
      return;
    }
    const now = Date.now();
    const snapshot = totpSnapshot(await storage.getTotp(element.accountId, element.node.details.id), now);
    if (snapshot === undefined) {
      void vscode.window.showWarningMessage(
        `"${element.node.name}" has no one-time code seed — open Edit and paste the otpauth:// URI or the base32 secret.`,
      );
      return;
    }
    await copySecret(vscode.env.clipboard, snapshot.code);
    const secondsLeft = Math.ceil((snapshot.validUntil - now) / 1000);
    void vscode.window.showInformationMessage(
      copiedMessage(`One-time code of "${element.node.name}" (valid for ${secondsLeft} s more)`),
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
      await connectEntity(
        element.accountId,
        element.node.details,
        storage,
        storageDir,
        sshAgent.servesKeyFor(element.node),
      );
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
    const kind = resolveKind(details);
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

  // Serve this key through the extension's own SSH agent — the alternative to writing it out
  // as a file, and the only door to Git commit signing with a vault-held key.
  register('credSshManager.addKeyToAgent', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const element = asElement(target);
    if (element?.kind !== 'node' || !element.node.details) {
      return;
    }
    const details = element.node.details;
    const result = await sshAgent.load(element.accountId, details);
    if (!result.ok) {
      void vscode.window.showWarningMessage(result.reason);
      return;
    }
    await storage.updateNode(element.accountId, {
      ...element.node,
      details: { ...details, sshAgent: true },
    });
    mutated();
    void vscode.window.showInformationMessage(
      `"${element.node.name}" (${result.fingerprint}) is served by the agent. New terminals get ` +
        'SSH_AUTH_SOCK automatically; every use of the key asks first.' +
        (process.platform === 'win32'
          ? ' On Windows the built-in OpenSSH client reaches it; the ssh that ships with Git for Windows cannot.'
          : ''),
    );
  });

  register('credSshManager.removeKeyFromAgent', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const element = asElement(target);
    if (element?.kind !== 'node' || !element.node.details) {
      return;
    }
    sshAgent.unload(element.node.details.id);
    await storage.updateNode(element.accountId, {
      ...element.node,
      details: { ...element.node.details, sshAgent: undefined },
    });
    mutated();
    void vscode.window.showInformationMessage(
      `"${element.node.name}" is no longer served by the agent.`,
    );
  });

  /**
   * The `git config` lines that make Git sign commits with this key.
   *
   * <p>Reads the public half out of the stored key rather than requiring the key to be loaded
   * first: a person asking how to configure signing has not necessarily loaded it yet, and
   * refusing at that point would be an obstacle with no reason behind it.</p>
   */
  register('credSshManager.copyGitSigningConfig', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const element = asElement(target);
    if (element?.kind !== 'node' || !element.node.details) {
      return;
    }
    const details = element.node.details;
    const loaded = sshAgent.loadedKeys().find((k) => k.entityId === details.id);
    let publicLine = loaded?.publicLine;
    if (publicLine === undefined) {
      const content = await storage.getPrivateKey(element.accountId, details.id);
      const parsed = content === undefined ? undefined : parseSshPrivateKey(content, element.node.name);
      if (parsed === undefined) {
        void vscode.window.showWarningMessage(
          `"${element.node.name}" has no private key stored, so there is no public half to sign with.`,
        );
        return;
      }
      if (!parsed.ok) {
        void vscode.window.showWarningMessage(`"${element.node.name}": ${parsed.reason}`);
        return;
      }
      publicLine = parsed.key.publicLine;
    }
    const config = gitSigningConfig(
      publicLine,
      process.platform,
      sshAgent.socketPath ?? '(add the key to the agent to start it)',
    );
    await copySecret(vscode.env.clipboard, gitSigningClipboardText(config));
    void vscode.window.showInformationMessage(
      copiedMessage(`Git signing config for "${element.node.name}"`),
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
    await openEntityViewer(picked.accountId, node, storage);
  });

  /**
   * The health report: weak and reused passwords, unencrypted keys in `~/.ssh`, plaintext
   * credentials in the workspace's `.env` files.
   *
   * <p>Local by construction. The one check that could leave the machine — the breach corpus —
   * is off by default and asks before it runs, saying exactly what travels.</p>
   */
  /**
   * Import from another tool: `~/.ssh/config`, or a CSV/JSON export from Bitwarden, 1Password,
   * KeePass, LastPass or Termius.
   *
   * <p>Nothing lands until the reader has seen the count and what was skipped — an import that
   * silently drops a quarter of a file is worse than one that refuses it. Every node gets a
   * fresh id: an id from somebody else's export would collide in the next sync merge.</p>
   */
  register('credSshManager.importFrom', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const location = await resolveLocation(asElement(target), storage, 'Import into which profile?');
    if (location === undefined) {
      return;
    }
    const uris = await vscode.window.showOpenDialog({
      title: 'Import from another tool',
      canSelectMany: false,
      filters: { 'Exports and ssh config': ['csv', 'json', 'txt', 'config'], 'Any file': ['*'] },
      defaultUri: vscode.Uri.file(path.join(os.homedir(), '.ssh')),
    });
    const uri = uris?.[0];
    if (uri === undefined) {
      return;
    }
    const text = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
    const parsed = parseImport(text, uri.fsPath);
    if (parsed.entities.length === 0) {
      void vscode.window.showWarningMessage(
        `Nothing to import from ${path.basename(uri.fsPath)} (read as ${parsed.source}). ` +
          (parsed.skipped[0] ?? 'The file held no entries this reader understands.'),
      );
      return;
    }
    const skippedNote =
      parsed.skipped.length === 0
        ? ''
        : `\n\n${parsed.skipped.length} entr(ies) will be SKIPPED:\n· ${parsed.skipped.slice(0, 8).join('\n· ')}`;
    const confirmed = await vscode.window.showWarningMessage(
      `Import ${parsed.entities.length} entr(ies) from ${path.basename(uri.fsPath)}, read as ${parsed.source}?` +
        skippedNote,
      { modal: true },
      'Import',
    );
    if (confirmed !== 'Import') {
      return;
    }
    const created = await importEntities(storage, location, parsed.entities);
    mutated();
    void vscode.window.showInformationMessage(
      `Imported ${created} entr(ies) into ${storage.getAccount(location.accountId)?.email ?? 'the profile'}.` +
        (parsed.skipped.length > 0 ? ` ${parsed.skipped.length} skipped.` : ''),
    );
  });

  register('credSshManager.healthReport', async () => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'CredsForDevs: checking…',
        // Cancellable because the optional breach check makes network calls: without this the
        // only way out of a long scan is reloading the window.
        cancellable: true,
      },
      (_progress, token) => runHygieneScan(storage, token),
    );
    const document = await vscode.workspace.openTextDocument({
      content: result.markdown,
      language: 'markdown',
    });
    await vscode.window.showTextDocument(document, { preview: true });
  });

  register('credSshManager.generateSecret', async () => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const kind = await vscode.window.showQuickPick(
      [
        { label: '$(key) Password', detail: '20 characters, mixed sets — for a field, not for typing', id: 'password' },
        { label: '$(comment) Passphrase', detail: '6 words — for a PIN, or anything said aloud', id: 'passphrase' },
      ],
      { title: 'Generate a secret', ignoreFocusOut: true },
    );
    if (kind === undefined) {
      return;
    }
    const made = kind.id === 'passphrase'
      ? generatePassphrase(DEFAULT_PASSPHRASE)
      : generatePassword(DEFAULT_PASSWORD);
    await copySecret(vscode.env.clipboard, made.value);
    void vscode.window.showInformationMessage(`${made.description} ${copiedMessage('It')}`);
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

    const secrets = await storage.exportSecretsFor(
      accountId,
      picked.filter((n) => n.type === 'entity').map((n) => n.id),
    );
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
        `Import failed: ${describeError(error)}`,
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
      if (s.totp !== undefined) {
        await storage.setTotp(location.accountId, id, s.totp);
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
    // The id is vault data — import and restore write an envelope's ids verbatim — so it is
    // sanitised before it becomes a path. See `safeFileComponent`.
    const fileName = `script-${safeFileComponent(details.id)}${plan.extension}`;
    const scriptPath = materializedKeyPath(storageDir, fileName);
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

  /**
   * Everything the reference resolver needs, built over this window's storage. Entities carry
   * their folder path so an ambiguous name can be disambiguated by writing `Folder/Name`.
   */
  const refSource: RefSource = {
    accounts: () => storage.getAccounts().map((a) => ({ accountId: a.accountId, email: a.email })),
    entities: (accountId) => {
      const nodes = storage.getNodes(accountId);
      const byId = new Map(nodes.map((n) => [n.id, n]));
      // `folderPath` is the quick-open walk, reused: two implementations of "where does this
      // node sit" would disagree the first time a malformed parent chain arrived by sync.
      return nodes
        .filter((n) => n.type === 'entity')
        .map((n) => ({ id: n.id, name: n.name, path: [...folderPath(n, byId), n.name] }));
    },
    fieldValue: async (accountId, entityId, field) => {
      const details = storage.getNode(accountId, entityId)?.details;
      if (details === undefined) {
        return undefined;
      }
      if (field === 'notes') {
        return (await storage.getNotes(accountId, entityId)) ?? details.notes;
      }
      if (field === 'totp') {
        return totpSnapshot(await storage.getTotp(accountId, entityId), Date.now())?.code;
      }
      // The remaining five are exactly the env-bindable fields, so the one table that already
      // maps a field to a value answers here too rather than a second copy of it.
      return bindableFieldValue(storage, accountId, details, field);
    },
  };

  /**
   * Run a stored command or script with `creds://` references resolved into the CHILD's
   * environment, and every resolved value masked in what the child prints.
   *
   * <p>The broker's `env` verb writes values into this window's terminal environment, where any
   * later shell can read them back with `printenv`. This is the stronger shape: the value exists
   * in one child process, for one run, and never reaches the screen.</p>
   */
  register('credSshManager.runWithSecrets', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const element = await nodeAt(asElement(target), storage);
    if (element?.kind !== 'node' || element.node.details === undefined) {
      return;
    }
    const details = element.node.details;
    const isScript = details.isScript === true;
    const rawBody = isScript
      ? (details.script ?? '')
      : buildCommandLine(details.command ?? '', details.commandArgs);
    if (rawBody.trim().length === 0) {
      void vscode.window.showWarningMessage(
        `"${element.node.name}" has nothing to run yet — open Edit and fill in the ${isScript ? 'script' : 'command'}.`,
      );
      return;
    }

    // The same content-trust gate the ordinary Run has: a body can arrive by sync or by an
    // accepted share, and resolving secrets into it makes reading it first matter more, not less.
    if (!isCommandTrusted(context.globalState, element.node.id, rawBody)) {
      const choice = await vscode.window.showWarningMessage(
        confirmCommandMessage(element.node.name, rawBody),
        { modal: true },
        'Run',
      );
      if (choice !== 'Run') {
        return;
      }
      await trustCommand(context.globalState, element.node.id, rawBody);
    }

    const scriptPlan = isScript
      ? scriptRunPlan(details.scriptLanguage ?? 'other', process.platform)
      : undefined;
    if (scriptPlan?.kind === 'unsupported') {
      void vscode.window.showInformationMessage(scriptPlan.reason);
      return;
    }

    // A script's own variables travel the way they always have; references are the addition.
    const scriptEnv = isScript
      ? resolveScriptEnv(details.script ?? '', details.scriptVars, details.scriptLanguage ?? 'other')
      : undefined;
    const searched = isScript
      ? [scriptEnv?.body ?? '', ...(details.scriptVars ?? []).map((v) => v.value)]
      : [details.command ?? '', ...(details.commandArgs ?? []).map((a) => a.value)];
    const plan = planRefs(searched);
    if (plan.refs.length === 0) {
      void vscode.window.showWarningMessage(
        `"${element.node.name}" holds no creds:// reference. Write one as a value — ` +
          'creds://<account email>/<entity>/<field> — then run this again. ' +
          `Nothing was run.`,
      );
      return;
    }

    const resolution = await resolveSecretRefs(plan.refs, refSource);
    if (!resolution.ok) {
      void vscode.window.showErrorMessage(`Nothing was run: ${resolution.error}`);
      return;
    }

    const env: Record<string, string> = { ...(scriptEnv?.env ?? {}) };
    for (const ref of plan.refs) {
      env[plan.names[ref]] = resolution.values[ref];
    }
    // Script variable VALUES are masked too: a body may print those as readily as a reference,
    // and the point of owning the output is that neither reaches the screen. Each carries the
    // NAME it is read by, so the placeholder says which secret stood there.
    const secrets = [
      ...plan.refs.map((ref) => ({ value: resolution.values[ref], label: plan.names[ref] })),
      ...Object.entries(scriptEnv?.env ?? {}).map(([label, value]) => ({ value, label })),
    ];

    let commandLine: string;
    if (isScript && scriptPlan?.kind === 'run') {
      const body = rewriteScriptRefs(scriptEnv?.body ?? '', plan, details.scriptLanguage ?? 'other');
      const scriptPath = materializedKeyPath(storageDir, `run-${details.id}${scriptPlan.extension}`);
      fs.mkdirSync(path.dirname(scriptPath), { recursive: true, mode: 0o700 });
      fs.writeFileSync(scriptPath, body.endsWith('\n') ? body : `${body}\n`, { mode: 0o700 });
      lockToOwner(scriptPath);
      commandLine = [scriptPlan.command, ...scriptPlan.args, `"${scriptPath}"`].join(' ');
    } else {
      commandLine = buildCommandLineWithRefs(
        details.command ?? '',
        details.commandArgs,
        plan,
        process.platform,
        vscode.env.shell,
      );
    }

    const described = plan.refs
      .map((ref) => `${plan.names[ref]} = ${refField(ref) ?? 'value'} of ${ref.replace(/^creds:\/\//, '')}`)
      .join('; ');
    runInMaskedTerminal({
      name: `CredsForDevs run: ${element.node.name}`,
      commandLine,
      env,
      secrets,
      // The same shell the rewrite above spelled its variable reads for.
      shell: vscode.env.shell,
      banner: `${described}\r\n${maskingBanner(secrets)}`,
    });
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
      // The re-wrap/re-key arithmetic lives in securityKeyOps (audit A1); this handler
      // holds only the ceremony and the conversation.
      const next = await envelopeWithAddedKey(
        {
          raw,
          key,
          account,
          storedPin: await vaultKeys.storedPin(account),
          now: Date.now(),
          pendingShares: transport.embedsShares ? sharesFromEnvelope(raw) : undefined,
          decrypt: (r, k) => vaultKeys.decrypt(r, k),
        },
        { credentialId: prf.credentialId, prfSalt, secret: prf.secret },
        label,
      );
      if (isSecurityKeyRefusal(next)) {
        // The add path can only refuse for a missing PIN (the v1 upgrade needs it).
        void vscode.window.showErrorMessage('A vault PIN is required before adding a key.');
        return;
      }
      await transport.writeVault(account, next.content, []);
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
        `Adding the security key failed: ${describeError(error)}`,
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
    // Whether this removal RE-KEYS (last key gone, PIN present) decides the wording of the
    // failure message; the arithmetic itself lives in securityKeyOps (audit A1).
    const storedPin = await vaultKeys.storedPin(account);
    const wouldRekey = removalWouldRekey(wraps, picked.wrap.id, storedPin);
    const key = await vaultKeys.unlock(account, raw, { interactive: true });
    if (key === undefined) {
      void vscode.window.showErrorMessage(
        wouldRekey
          ? 'Could not unlock to re-key — nothing removed.'
          : 'Could not unlock to update wraps — nothing removed.',
      );
      return;
    }
    const next = await envelopeWithRemovedKey(
      {
        raw,
        key,
        account,
        storedPin,
        now: Date.now(),
        pendingShares: transport.embedsShares ? sharesFromEnvelope(raw) : undefined,
        decrypt: (r, k) => vaultKeys.decrypt(r, k),
      },
      picked.wrap.id,
    );
    if (isSecurityKeyRefusal(next)) {
      void vscode.window.showErrorMessage('Could not unlock to update wraps — nothing removed.');
      return;
    }
    await transport.writeVault(account, next.content, []);
    vaultKeys.clearCache(account.accountId);
    void vscode.window.showInformationMessage(
      next.rekeyed
        ? `Removed "${picked.label}" and re-keyed the vault under your PIN — the removed key can no longer open it.`
        : `Removed "${picked.label}". Note: existing backups/snapshots remain openable by that key until the vault is re-keyed (remove all security keys to force a re-key under the PIN).`,
    );
    sync.notifyChange();
    await refreshReadiness();
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
        `Unlock failed: ${describeError(error)}`,
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

  // The whole sharing conversation — sealing, delivery, sender checks, the accept
  // round-robin, the import — lives in ShareInbox (audit A1); the handlers below only
  // resolve what was clicked.
  const shareInbox = new ShareInbox({
    storage,
    sharing,
    state: context.globalState,
    onMutated: mutated,
  });

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
      },
    };
    await shareInbox.deliver(sender.accountId, payload, recipients, pin);
  });

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

  // ---------- backup ----------

  const runBackup = () => backupToNas(storage, vaultKeys);
  const runRestore = () => restoreFromBackup(storage, vaultKeys, mutated);
  register('credSshManager.backupToNas', runBackup);
  register('credSshManager.restoreBackup', runRestore);
  // Aliases kept for the original spec's command ids.
  register('extension.exportSecrets', runBackup);
  register('extension.importSecrets', runRestore);

  // The provider as well as the view: disposing a TreeView does not dispose its provider, and
  // the provider owns a debounce timer and an emitter of its own.
  context.subscriptions.push(treeView, provider);
}

export function deactivate(): void {
  // Nothing to clean up — everything lives in context.subscriptions.
}

// ---------- command bodies ----------

interface NodeLocation {
  accountId: string;
  parentId: string | null;
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

/**
 * Stamp the picked colour onto the entities this one now depends ON.
 *
 * <p>A write to a DIFFERENT record than the one being saved, and deliberately so: the colour
 * belongs to the target, which is what makes "change it once and every dependent follows" true
 * with no propagation code anywhere — the dependents do not store a colour to update. The cost
 * is this one extra write, and a crash between the two leaves the colour unset, which the next
 * save re-picks. Self-healing, and the same single-node-at-a-time shape every other mutator
 * here has.</p>
 *
 * <p>Unchanged colours are skipped rather than rewritten: a rewrite would bump the target's
 * version vector and make an untouched entity look edited to every other machine.</p>
 */
async function applyDependencyColors(
  storage: StorageManager,
  accountId: string,
  picks: readonly { targetId: string; color: string }[],
): Promise<void> {
  for (const pick of picks) {
    const target = storage.getNode(accountId, pick.targetId);
    if (target?.details !== undefined && target.details.depColor !== pick.color) {
      await storage.updateNode(accountId, {
        ...target,
        details: { ...target.details, depColor: pick.color },
      });
    }
  }
}

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

/**
 * What the terminal says about masking, told truthfully.
 *
 * <p>A value shorter than `MIN_MASKABLE_LENGTH` is deliberately NOT masked — replacing a
 * six-digit string would turn every line number and byte count in the output into a placeholder,
 * which is worse than the leak it prevents. But a **one-time code is exactly six digits**, so a
 * banner promising that everything is masked would be false precisely where somebody is watching
 * for it. So the promise is scoped to the values it actually covers, and the short ones are named
 * as not covered.</p>
 */
export function maskingBanner(secrets: readonly { value: string; label: string }[]): string {
  const short = secrets.filter((s) => s.value.length < MIN_MASKABLE_LENGTH).map((s) => s.label);
  const masked =
    "Values are in this process's environment only, and are replaced with <CREDS_MASKED:NAME> in its output.";
  const caveat =
    short.length === 0
      ? ''
      : ` NOT masked, because they are too short to replace without mangling ordinary output: ` +
        `${short.join(', ')} — a one-time code is six digits, so treat this window as showing it.`;
  return `${masked}${caveat} No PTY: a program that needs a real terminal should use Run in Terminal instead.`;
}

/**
 * Land an import: the folders it asked for, then the nodes, then their secrets.
 *
 * <p>Folders are created once and reused, so a hundred rows from one Bitwarden folder produce
 * one folder here rather than a hundred. Secrets go through `StorageManager`, which puts them
 * in the keychain — never into the node metadata that syncs in plaintext.</p>
 */
async function importEntities(
  storage: StorageManager,
  location: NodeLocation,
  entities: readonly ImportedEntity[],
): Promise<number> {
  const folders = new Map<string, string>();
  const folderFor = async (name: string | undefined): Promise<string | null> => {
    if (name === undefined || name.length === 0) {
      return location.parentId;
    }
    const existing = folders.get(name);
    if (existing !== undefined) {
      return existing;
    }
    const id = StorageManager.newId();
    await storage.addNode(location.accountId, {
      id,
      name,
      type: 'folder',
      parentId: location.parentId,
      folderType: 'any',
    });
    folders.set(name, id);
    return id;
  };

  // Resolved up front so `toTreeNodes` stays pure and synchronous.
  const parents = new Map<string, string | null>();
  for (const entity of entities) {
    const key = entity.folder ?? '';
    if (!parents.has(key)) {
      parents.set(key, await folderFor(entity.folder));
    }
  }

  const made = toTreeNodes(entities, () => StorageManager.newId(), (folder) => parents.get(folder ?? '') ?? null);
  for (const { node, secrets } of made) {
    await storage.addNode(location.accountId, node);
    await storage.setPassword(location.accountId, node.id, secrets.password);
    await storage.setNotes(location.accountId, node.id, secrets.notes);
    if (secrets.privateKey !== undefined) {
      await storage.setPrivateKey(location.accountId, node.id, secrets.privateKey);
    }
    if (secrets.dbConnection !== undefined) {
      await storage.setDbConnection(location.accountId, node.id, secrets.dbConnection);
    }
    if (secrets.totp !== undefined) {
      await storage.setTotp(location.accountId, node.id, secrets.totp);
    }
  }
  return made.length;
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
  // The form already canonicalised the seed (`toValues`), so this is a store, not a parse.
  if (result.clearTotp) {
    await storage.deleteTotp(accountId, entityId);
  } else if (result.newTotp !== undefined) {
    await storage.setTotp(accountId, entityId, result.newTotp);
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
  const storedHostKey = parseHostKey(node.details.hostKey);
  // The form is told a seed exists and how it is configured — never the seed itself.
  const storedTotp = await storage.getTotp(accountId, node.id);
  const storedTotpParsed = storedTotp === undefined ? undefined : parseTotpSecret(storedTotp);
  const storedTotpDescription =
    storedTotpParsed === undefined ? undefined : describeTotp(storedTotpParsed.config);
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
    hasStoredTotp: storedTotpDescription !== undefined,
    storedTotpDescription,
    keyCandidates: await collectKeyCandidates(storage, accountId, node.id),
    dependencyFolders: buildDependencyCandidates(storage.getNodes(accountId), node.id),
    dependencyColors: buildDependencyColorMap(storage.getNodes(accountId)),
    jumpCandidates: collectJumpCandidates(storage, accountId, node.id),
    hasStoredHostKey: storedHostKey !== undefined,
    hostKeyFingerprint: storedHostKey === undefined ? undefined : hostKeyFingerprint(storedHostKey),
  });
  if (result === undefined) {
    return;
  }
  // Snapshot what is there before it is replaced — the whole point of history is being
  // able to see what a change changed, which is only knowable from the old state.
  await storage.recordRevision(
    accountId,
    node.id,
    await snapshotForRevision(storage, accountId, {
      id: node.id,
      name: node.name,
      details: node.details,
    }),
  );
  await storage.updateNode(accountId, {
    ...node,
    name: result.details.name,
    details: result.details,
  });
  await applySecrets(storage, accountId, node.id, result);
  await applyDependencyColors(storage, accountId, result.dependsOnColors);
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
  const configPath = materializedKeyPath(storageDir, fileName);

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
  const db = dbDisplay(dbConnection, details.dbType);
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
    ...db,
    sshCommand: buildSshCommand(details),
    resolveSecret: secretResolver(revisionSecretReader(revision)),
    totp:
      revision.secrets.totp === undefined
        ? undefined
        : totpViewFor(revisionSecretReader(revision)),
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
  const notes = (await storage.getNotes(accountId, details.id)) ?? details.notes;
  // Always show a port for DB entities — the type's default when not explicit.
  const db = dbDisplay(dbConnection, details.dbType);
  const keySourceName =
    details.sshKeyEntityId !== undefined
      ? (storage.getNode(accountId, details.sshKeyEntityId)?.name ?? '(missing entity)')
      : undefined;
  // Resolved for the reader: an id names nothing, and a raw host key is a wall of base64 that
  // cannot be compared with anything. A name and a SHA256 fingerprint can.
  const jumpHostName =
    details.jumpHostEntityId !== undefined
      ? (storage.getNode(accountId, details.jumpHostEntityId)?.name ?? '(missing entity)')
      : undefined;
  const pinnedKey = parseHostKey(details.hostKey);
  const imageB64 = await storage.getImage(accountId, details.id);
  const imageMimeType = details.imageFileName !== undefined ? imageMime(details.imageFileName) : undefined;
  // The seed can be edited while the panel is open, so the code is derived per request — and
  // the webview only ever receives that code, never the seed it came from.
  const totpReader = storageSecretReader(storage, accountId, details.id);
  const hasTotp = (await storage.getTotp(accountId, details.id)) !== undefined;
  showEntityView({
    details,
    keySourceName,
    jumpHostName,
    hostKeyFingerprint: pinnedKey === undefined ? undefined : hostKeyFingerprint(pinnedKey),
    hasPassword,
    hasPrivateKey,
    hasVpnConfig,
    hasDbConnection: dbConnection !== undefined,
    notes,
    ...db,
    sshCommand: buildSshCommand(details),
    resolveSecret: secretResolver(totpReader),
    totp: hasTotp ? totpViewFor(totpReader) : undefined,
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

