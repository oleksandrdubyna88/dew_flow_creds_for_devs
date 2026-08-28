/* eslint-disable max-lines, max-lines-per-function, complexity --
   The 3,000-line activate() is audit item A1's subject: this file is being dismantled into
   modules, each of which lints clean; a marker per violation here would be deleted within
   days. Remove this header as the LAST step of A1, when the file is a thin composition. */
import { registerEntityCommands } from './commands/entityCommands';
import { registerTreeMutationCommands } from './commands/treeMutationCommands';
import { registerRunCommands } from './commands/runCommands';
import { registerRecoveryCommands } from './commands/recoveryCommands';
import { registerKeyCommands } from './commands/keyCommands';
import { registerAgentCommands } from './commands/agentCommands';
import { registerWslRelayCommands } from './commands/wslRelayCommands';
import { registerAccountCommands } from './commands/accountCommands';
import { registerShareCommands } from './commands/shareCommands';
import { registerViewCommands } from './commands/viewCommands';
import * as vscode from 'vscode';
import { setSecretClipboardTtl } from './secretClipboard';
import { backupToNas, restoreFromBackup } from './backupManager';
import { describeInstall } from './installWords';
import { GoogleAuthProvider } from './googleAuthProvider';
import { nasPathFor } from './nasPaths';
import { diagnoseTeamFailure, teamFailureIsActionable } from './teamDiagnosis';
import { SyncReadiness, syncReadiness } from './syncReadiness';
import { BackupScheduler } from './backupScheduler';
import { purgeMaterializedKeys } from './keyInstaller';
import { StorageManager } from './storageManager';
import { SyncManager } from './syncManager';
import { CredsAgentServer } from './credsAgentServer';
import { UseActionRegistry } from './useActions';
import { sshExecAction, sshTerminalAction } from './sshUseActions';
import { ShareInbox } from './shareInbox';
import { SharingManager } from './sharingManager';
import { TransportFactory } from './transportFactory';
import { VaultKeys } from './vaultKeys';
import { KeyAddHost, offerKeyMigration } from './securityKeyAdd';
import { snapshotForRevision } from './revisionSnapshot';
import { judgeOrgRecovery } from './orgRecoveryPinning';
import { EscrowEnrolment } from './orgEscrowOps';
import { orgRecoveryAccess } from './orgRecoveryAccess';
import { RecoverySessionKeys } from './breakGlass';
import { CredTreeDataProvider, VIEW_ID } from './treeDataProvider';
import { ArrivalHighlights } from './arrivalHighlight';
import { ViewerClicks } from './viewerClicks';
import { warnIfKeyringMissing } from './keyringWarningHost';
import { AgentDoors, DoorSources, doorsOf } from './agentDoors';
import { ARRIVAL_WINDOW_MS } from './arrivalHighlight';
import { DepDecorationProvider } from './depDecorations';
import { ExpansionMemory, expansionKey } from './treeExpansion';
import { formPanels, lockNotice } from './formPanels';
import { ConfigRouteSources } from './brokerConfigRoute';
import { EntityFlagsRefresher, entityFlagSource } from './entityFlags';
import { createDiagnosticLog } from './diagnosticLog';
import { resolveKind } from './entityKind';
import { burnIfOneUse } from './burnOnUse';
import { SshBridgeManager } from './sshBridgeManager';
import { entityKey } from './entityFlags';
import { Machine } from './installCommand';
import { toWslPath } from './wslRelay';
import { DEFAULT_DISTRO, WslRelayManager, spawnWslRelay } from './wslRelayManager';
import { AliasMap, aliasFor, listAliases, resolveAlias } from './cliAliases';
import { EphemeralSweeper } from './ephemeralSweeper';
import { maskEntriesFor } from './maskEntries';
import { visibleConfigDetails, visibleMcpEntries } from './mcpEntries';
import { McpEntriesCache } from './mcpEntriesCache';
import { RotateDeps, rotateAction } from './rotateAction';
import { generateSecret } from './secretKinds';
import { CREDS_CLI, CredsProduct, ridFor } from './credsInstall';
import { binaryPath, installMenu } from './binaryInstaller';
import { MaskEntry, buildMaskTable } from './secretMasker';
import { describeScan, scanForSecrets } from './secretScan';
import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import { applyEnvBindings, bindableFieldValue } from './envApply';
import { syncReminderDue } from './syncReminder';
import { totpSnapshot } from './totp';
import { RefSource } from './secretRef';
import { MIN_MASKABLE_LENGTH } from './outputMask';
import { SshAgentManager } from './sshAgentManager';
import { folderPath } from './quickOpen';
import { LockStatusBar } from './statusBar';
import { asElement } from './commandTargets';
import {
  credentialExportEnvAction,
  dbQueryAction,
  scriptRunAction,
  terminalRunAction,
  vpnAction,
} from './agentUseActions';
import { StoredAccount, EntityMetadata, TreeElement, TreeNode } from './types';
import { mcpUseLookup } from './mcpHooks';
import { moveEntryToTrash } from './mcpHooks';
import { mcpCreateHooks } from './mcpHooks';
import { runVpn } from './vpnRun';
import { nodeAt } from './entityViewerCommands';
import { openRevisionViewer } from './entityViewerCommands';
import { applyInstallChoice } from './installFlow';
import { collectConfigHolders } from './configCommands';
import { onPath } from './installFlow';
import { setEnvCollection } from './envCollectionRef';
import { DoorsFor } from './entityEditCommands';
import { envCollection } from './envCollectionRef';

/** Set in activate(); the module-level slot keeps editNode's signature unchanged. */

/**
 * How long the keychain must be quiet before a foreign write triggers a flag refresh.
 * One edit writes several secret kinds in a row; this coalesces them into one walk.
 */
const SECRETS_SETTLE_MS = 400;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  setEnvCollection(context.environmentVariableCollection);

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
  /** Every alias NAME pointing at one entry — the viewer's CLI row and has:cli share it (T23). */
  const cliAliasesFor = (accountId: string, entityId: string): string[] =>
    Object.entries(aliasMap())
      .filter(([, alias]) => alias.accountId === accountId && alias.entityId === entityId)
      .map(([name]) => name)
      .sort();
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
    (key, code) => {
      log.warn('bridge', `${key} ended (${String(code)})`);
      // A bridge that dies by itself — a dropped network, a killed ssh — must take its row
      // back to "Open Remote Bridge…". Without this the menu keeps offering *Close* for a
      // bridge that no longer exists, which is the stuck-in-flight state rule 8 forbids.
      provider.refresh();
    },
  );
  // Answered per row, never cached: the map is the truth and it changes underneath the tree.
  provider.isBridged = (accountId, nodeId) => bridges.isOpen(entityKey(accountId, nodeId));
  // T24b: the doors the MCP switches do not show, read here where the sources live.
  const doorSources: DoorSources = {
    aliasesFor: cliAliasesFor,
    bridgeOpen: (accountId, id) => bridges.isOpen(entityKey(accountId, id)),
    wslRelayOn: () => vscode.workspace.getConfiguration('credSshManager').get<boolean>('wslAgentRelay', false),
    isKeyEntity: (details) => resolveKind(details as never) === 'sshkey',
  };
  const doorsAt = (accountId: string, node: TreeNode): AgentDoors => doorsOf(doorSources, accountId, node.id, node.details);
  const doorsFor: DoorsFor = (accountId, node) => ({ agentDoors: doorsAt(accountId, node), entityTarget: { kind: 'node', accountId, node } });
  // T23: the has:cli filter and the viewer's CLI row ask the SAME reverse lookup.
  provider.hasCliAlias = (accountId, nodeId) =>
    aliasFor(aliasMap(), accountId, nodeId) !== undefined;
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
  // T13: rows that just arrived glow for a few seconds through the SAME provider the
  // dependency colours use — a second provider racing it is how the tint would flicker.
  const arrivals = new ArrivalHighlights();
  const depDecorations = new DepDecorationProvider(provider.dependencies, arrivals);
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

  /**
   * Corporate escrow, attached to the sync cycle.
   *
   * <p>Assigned here rather than passed to the constructor because the transports have to exist
   * first, and because a `SyncManager` built without it must behave exactly as it did before
   * this feature — which is what every deployment with no corporate recovery is.</p>
   *
   * <p>What it answers is a TRUST decision as much as a configuration one: `judgeOrgRecovery`
   * turns the server's answer into a verdict against what this machine pinned, and
   * `escrowAction` refuses to seal anything to a key the verdict rejects. Returning `undefined`
   * means "could not ask" — an unreachable server, an older one, a folder transport — and the
   * cycle then leaves the wraps exactly as they are.</p>
   */
  sync.resolveEscrow = async (account): Promise<EscrowEnrolment | undefined> => {
    const client = transports.orgRecoveryFor(account);
    if (client === undefined) {
      return undefined;
    }
    const config = await client.readConfig(account);
    const facts = {
      enabled: config.enabled,
      setupComplete: config.setupComplete,
      orgPublicKeyFingerprint: config.orgPublicKeyFingerprint,
      rosterFingerprint: config.rosterFingerprint,
      location: client.location,
    };
    sync.escrowOfficers = config.officerEmails;
    return {
      orgPublicKey: Buffer.from(config.orgPublicKey, 'base64'),
      orgPublicKeyFingerprint: config.orgPublicKeyFingerprint,
      verdict: judgeOrgRecovery(pinStore(context), account.accountId, facts),
    };
  };

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

  /**
   * Lock the vaults, and everything that must follow from it.
   *
   * <p>One helper rather than the same sequence spelled at two call sites: the idle timer and
   * the *Lock Vaults* command differ only in what they say afterwards. Closing the open forms is
   * exactly the kind of step that gets added to one of two copies — a form holds a plaintext
   * secret in its webview, and since the page now survives being hidden it holds it for as long
   * as the tab is open, which is the trade this change made deliberately.</p>
   */
  const lockNow = (notice: string): void => {
    vaultKeys.lock();
    const closedForms = formPanels.closeAll();
    void refreshReadiness();
    void vscode.window.showInformationMessage(lockNotice(notice, closedForms));
  };

  // Auto-lock. Checked on a coarse timer: the window is measured in tens of minutes, so
  // a minute of drift costs nothing and a tighter tick would only wake the machine more.
  const autoLock = setInterval(() => {
    const minutes = vscode.workspace
      .getConfiguration('credSshManager')
      .get<number>('autoLockMinutes', 60);
    if (vaultKeys.dueForAutoLock(Date.now(), minutes)) {
      lockNow(
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

  /**
   * What this account may see of corporate recovery, cached on the provider so the tree can
   * choose a menu synchronously.
   *
   * <p>A failure answers `none` rather than throwing: an unreachable server must hide four
   * commands for a cycle, never break the repaint that draws every other row.</p>
   */
  const refreshOrgAccess = async (account: StoredAccount): Promise<void> => {
    const client = transports.orgRecoveryFor(account);
    if (client === undefined) {
      provider.orgAccess.set(account.accountId, 'none');
      return;
    }
    try {
      const config = await client.readConfig(account);
      provider.orgAccess.set(
        account.accountId,
        orgRecoveryAccess({
          onServer: true,
          enabled: config.enabled,
          officerEmails: config.officerEmails,
          accountEmail: account.email,
        }),
      );
    } catch {
      provider.orgAccess.set(account.accountId, 'none');
    }
  };

  const refreshReadiness = async (): Promise<Map<string, SyncReadiness>> => {
    const locked = vaultKeys.isLocked();
    for (const account of storage.getAccounts()) {
      await refreshOrgAccess(account);
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
  /**
   * What an agent may see, held between calls.
   *
   * <p>Declared before `mutated` because that is what forgets it: building this answer costs five
   * keychain reads per visible entry, and the route it serves raises no prompt and is therefore
   * not throttled. Measured at 1000 reads for a vault with 200 entries opened to agents.</p>
   */
  const mcpEntries = new McpEntriesCache(() => visibleMcpEntries(storage));

  const mutated = () => {
    provider.refresh();
    // The one moment the agent-visible answer stops being true. An event rather than a timer:
    // a TTL would be a guess about how stale is acceptable, and this is the fact.
    mcpEntries.forget();
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
    // The eighth answers the MCP server's one read route: the non-secret half of the entries
    // somebody opened to agents. Nothing appears until a switch is on, which is what stands in
    // for a token there — see `isMcpEntriesRoute`.
    () => mcpEntries.entries(),
    // The snippet route's supplier (T10): the same visibility wall as the listing, answered
    // for ONE id. A config an agent cannot list is a config this cannot name.
    (entityId) => visibleConfigDetails(storage, entityId),
    // The ninth is the same question one rung up: may an agent USE this entry. A single callback
    // because the lookup and the permission are one answer, and splitting them is how a route
    // ends up asking the first and forgetting the second.
    (entryId, action) => mcpUseLookup(storage, entryId, action),
    // The tenth: an agent deleting. To the Trash, always — `deleteNodeRecursive` is the one real
    // deletion path and an agent never reaches it, which is what made this permission grantable.
    async (accountId, entityId) => {
      const moved = await moveEntryToTrash(storage, accountId, entityId);
      if (moved) {
        mutated();
      }
      return moved;
    },
    // The eleventh and last: where an agent may create, and how. The gate is a FOLDER's switch,
    // because there is no entry yet — and the set of open folders is the person's decision, which
    // is the whole of what stops an agent choosing where to put things.
    mcpCreateHooks(storage, () => mutated()),
    // The twelfth: the config read route. A key rather than a grant, no consent modal, and every
    // attempt audited — the reasons are in `brokerProtocol.isConfigReadRoute`.
    configRouteSources(storage),
  );
  // The SSH agent: keys served from memory, every use confirmed, SSH_AUTH_SOCK injected into
  // new terminals. Nothing starts until a key is actually loaded.
  const sshAgent = new SshAgentManager(
    storage,
    storageDir,
    envCollection(),
    () => vaultKeys.noteUserActivity(),
    // Published in the endpoint file so a relay inside WSL can find this agent without a pid,
    // and — when the setting is on — used to raise and lower the relay with the agent itself.
    (socketPath) => {
      agentServer.setAgentAddress(socketPath);
      followAgentWithRelay(socketPath);
    },
  );
  context.subscriptions.push(sshAgent);
  void sshAgent.loadMarked().then((count) => {
    if (count > 0) {
      void vscode.window.showInformationMessage(
        `${count} SSH key(s) are served by the CredsForDevs agent. Every use asks first; see "CredsForDevs: SSH Agent" for the record.`,
      );
    }
  });

  // The relay that carries this agent into WSL, where a Linux kernel cannot open a named pipe.
  // Off unless asked for: it widens the agent's reach from one Windows user to every process in
  // the distribution running as that user — see `research/PLAN_wsl_agent_relay.md`.
  const wslRelay = new WslRelayManager(
    (args) => spawnWslRelay(args, (text) => log.info('wsl-relay', text)),
    (message) => log.info('wsl-relay', message),
  );
  context.subscriptions.push(wslRelay);

  /**
   * Where the Windows half lives, as WSL sees it — or nothing when it is not installed.
   *
   * <p>Not a convenience. A relay spawns `creds.exe relay-pipe` per connection and looks on the
   * PATH; the installer puts it in this extension's global storage, which is on nobody's PATH.
   * Someone could install both halves through the buttons here and still be told only
   * "communication with agent failed" by `ssh-add`. The path comes from the SAME function the
   * installer writes to, so the two cannot drift apart.</p>
   */
  function windowsCredsForWsl(): string {
    const rid = ridFor(process.platform, process.arch);
    if (rid === undefined) {
      return '';
    }
    const installed = binaryPath(
      { storage: context.globalStorageUri, state: context.globalState },
      CREDS_CLI,
      rid,
    );
    return fs.existsSync(installed.fsPath) ? toWslPath(installed.fsPath) : '';
  }

  function relaySettings(): { enabled: boolean; command: string; distros: string[] } {
    const config = vscode.workspace.getConfiguration('credSshManager');
    const chosen = config.get<string[]>('wslRelayDistros', []);
    return {
      enabled: config.get<boolean>('wslAgentRelay', false),
      command: config.get<string>('wslRelayCommand', 'creds'),
      // An empty list means the distribution WSL calls default — which is what someone who never
      // opened the picker gets, and the only sane answer when they have exactly one.
      distros: chosen.length > 0 ? chosen : [DEFAULT_DISTRO],
    };
  }

  function followAgentWithRelay(socketPath: string | undefined): void {
    const { enabled, command, distros } = relaySettings();
    if (socketPath === undefined || !enabled || process.platform !== 'win32') {
      wslRelay.stop();
      return;
    }
    const started = wslRelay.start(command, distros, windowsCredsForWsl());
    if (!started.ok) {
      log.warn('wsl-relay', started.reason);
      void vscode.window.showWarningMessage(`CredsForDevs: ${started.reason}`);
    }
  }

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
      applyEnvBindings(envCollection(), storage, accountId, details),
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

  // Level 3. Each rotation WRAPS the action that already knows how to reach the far side, so
  // there is one implementation of "run a query against this database" and not two — the
  // rotating one adds the generate before it and the store after it, and nothing else.
  const rotateDeps: RotateDeps = {
    generate: (kind, options) => generateSecret(kind, options),
    entity: (ctx) => storage.getNode(ctx.accountId, ctx.entityId)?.details,
    current: (ctx, slot) =>
      slot === 'password'
        ? Promise.resolve(storage.getPassword(ctx.accountId, ctx.entityId))
        : Promise.resolve(storage.getDbConnection(ctx.accountId, ctx.entityId)),
    snapshot: (ctx, details) =>
      snapshotForRevision(storage, ctx.accountId, { id: ctx.entityId, name: ctx.entityName, details }),
    record: (ctx, revision) => storage.recordRevision(ctx.accountId, ctx.entityId, revision),
    store: (ctx, slot, value) =>
      slot === 'password'
        ? storage.setPassword(ctx.accountId, ctx.entityId, value)
        : storage.setDbConnection(ctx.accountId, ctx.entityId, value),
    onRotated: () => mutated(),
  };
  useActions.register(rotateAction(dbQueryAction(agentDeps), 'query', rotateDeps));
  useActions.register(rotateAction(sshExecAction(sshDeps), 'command', rotateDeps));
  context.subscriptions.push(agentServer);

  warnIfKeyringMissing(context);

  const register = (command: string, handler: (...args: unknown[]) => unknown) =>
    context.subscriptions.push(vscode.commands.registerCommand(command, handler));

  /**
   * The list of machines, in the order a person scans it.
   *
   * <p>Detection first and recommended: the script runs ON the machine it installs to, so
   * `uname -m` knows more than whoever copied it. The pinned four are for when the target is
   * known — and for a script you can read at a glance before running it on a server.</p>
   */
  const MACHINES: { label: string; description: string; machine: Machine }[] = [
    {
      label: 'Windows',
      description: 'PowerShell, architecture detected there',
      machine: { os: 'windows' },
    },
    {
      label: 'Linux, WSL or a container',
      description: 'bash, architecture detected there',
      machine: { os: 'linux' },
    },
    { label: 'Windows x64', description: 'PowerShell', machine: { os: 'windows', rid: 'win-x64' } },
    { label: 'Windows arm64', description: 'PowerShell', machine: { os: 'windows', rid: 'win-arm64' } },
    { label: 'Linux x64', description: 'bash', machine: { os: 'linux', rid: 'linux-x64' } },
    { label: 'Linux arm64', description: 'bash', machine: { os: 'linux', rid: 'linux-arm64' } },
  ];

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

  // ---------- account profiles ----------

  // Per-account vault location: a folder (NAS/SMB) or a vault server URL.
  // ---------- terminal commands ----------

  // ---------- clone ----------

  // ---------- folder / entity CRUD ----------

  /**
   * "It worked" and "here it is" as one event (T13): reveal the row and tint it for a few
   * seconds. Every path that puts a NEW row into the tree calls this — an accepted share, an
   * import, a fresh entity or folder, and the filter's parting reveal (T15). Not edit: a
   * highlight that fires on everything highlights nothing.
   *
   * <p>The reveal must run AFTER any active filter is cleared and the tree refreshed — a
   * filtered-out row cannot be revealed, and the failure is silent (see goToOriginalFolder's
   * own note). Callers that clear the filter do so before calling this.</p>
   */
  const announceArrival = async (accountId: string, entityId: string): Promise<void> => {
    arrivals.announce(accountId, entityId, Date.now());
    arrivals.sweep(Date.now());
    depDecorations.refresh();
    // Repaint once more when the window lapses, so the tint actually goes away — the provider
    // answers from the clock, but nothing else would ask it again.
    setTimeout(() => depDecorations.refresh(), ARRIVAL_WINDOW_MS + 100);
    const node = storage.getNode(accountId, entityId);
    if (node !== undefined) {
      try {
        await treeView.reveal(
          { kind: 'node', accountId, node },
          { select: true, focus: true, expand: true },
        );
      } catch {
        // Reveal is best-effort: a row inside a collapsed remote state must not fail the add.
      }
    }
  };

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

  // ---------- entity actions ----------

  // One click selects and previews in the shared tab; a double click pins it (viewerClicks.ts).
  const clicks = new ViewerClicks();

  register('credSshManager.revisionClicked', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const element = await nodeAt(asElement(target), storage);
    if (element?.revision === undefined || element.node.details === undefined) {
      return;
    }
    openRevisionViewer(element.node, element.revision);
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

  registerRunCommands({ context, refSource, register, storage, storageDir, vaultKeys });

  register('credSshManager.stopVpn', (target) =>
    runVpn(target, 'stop', storage, storageDir, vaultKeys),
  );

  // ---------- security keys (YubiKey / FIDO2) ----------

  // The add / re-register flow lives in securityKeyAdd.ts; the host is this scope, by interface.
  const keyHost: KeyAddHost = { transportFor: (a) => transports.forAccount(a), vaultKeys, notifyChange: () => sync.notifyChange(), refreshReadiness: () => refreshReadiness() };
  // Security-tail item 1: a key that opened the vault under the bare `localhost` RP ID is
  // offered a re-registration — once per window and account, as a notification.
  const migrationOffered = new Set<string>();
  vaultKeys.onLegacyKeyUsed = (account, wrap) => {
    if (!migrationOffered.has(account.accountId)) {
      migrationOffered.add(account.accountId);
      void offerKeyMigration(keyHost, account, wrap);
    }
  };

  // ---------- corporate recovery (research/PLAN_org_recovery.md) ----------

  /**
   * Session keypairs for recoveries THIS window started.
   *
   * <p>In memory only, and that is the design: the private half is what turns the collected
   * contributions back into shares, and writing it anywhere would put the means to decrypt a
   * quorum's worth of key material on disk beside them. Closing the window abandons the
   * recovery, which is the correct trade — starting another one costs a click.</p>
   */
  const breakGlassSessions = new Map<string, RecoverySessionKeys>();

  /** The `Memento` the TOFU pins live in — the same store shape share signing uses. */
  function pinStore(ctx: vscode.ExtensionContext): {
    get(key: string): Record<string, string> | undefined;
    update(key: string, value: Record<string, string>): Thenable<void>;
  } {
    return {
      get: (key) => ctx.globalState.get<Record<string, string>>(key),
      update: (key, value) => ctx.globalState.update(key, value),
    };
  }

  // ---------- the printed recovery code (roadmap D9) ----------

  registerRecoveryCommands({ breakGlassSessions, context, pinStore, register, storage, transports, vaultKeys });
  registerKeyCommands({ keyHost, lockNow, refreshReadiness, register, storage, sync, transports, vaultKeys });

  /**
   * Install one of the two published binaries — `creds` for a terminal, `creds-mcp` for an agent.
   *
   * <p>One command, two products, because the only differences are three strings and the
   * decisions are all in `credsInstall.ts`. What it does after the download differs: a terminal
   * binary is a path to copy, and an MCP server is a path plus the block that points a client
   * at it.</p>
   */
  const offerInstall = async (product: CredsProduct): Promise<void> => {
    const host = { storage: context.globalStorageUri, state: context.globalState };
    const { rid, action, choices } = await installMenu(host, product);
    const picked = await vscode.window.showInformationMessage(
      describeInstall(product, action),
      ...choices,
    );
    if (picked === undefined || rid === undefined) {
      return;
    }
    await applyInstallChoice(host, product, rid, action, picked);
  };

  registerViewCommands({ announceArrival, clicks, doorsAt, log, moveFolder, provider, register, scanText, sharing, storage, treeView, vaultKeys });

  registerAgentCommands({ MACHINES, agentServer, aliasMap, bridges, log, mutated, offerInstall, provider, register, setAliasMap, sshAgent, storage, storageDir, vaultKeys });
  registerWslRelayCommands({ register, relaySettings, sshAgent, windowsCredsForWsl, wslRelay });

  // ---------- sharing ----------

  // The whole sharing conversation — sealing, delivery, sender checks, the accept
  // round-robin, the import — lives in ShareInbox (audit A1); the handlers below only
  // resolve what was clicked.
  const shareInbox = new ShareInbox({
    storage,
    sharing,
    state: context.globalState,
    extensionVersion: String((context.extension.packageJSON as { version?: string }).version ?? '0.0.0'),
    onMutated: mutated,
    // Fire-and-forget: the tint and reveal must never fail an accept.
    onArrived: (accountId, entityId) => void announceArrival(accountId, entityId),
  });

  registerEntityCommands({ doorsAt, mutated, register, storage, storageDir, vaultKeys });
  registerTreeMutationCommands({ announceArrival, doorsFor, mutated, register, storage, transports, vaultKeys });

  registerShareCommands({ register, shareInbox, sharing, storage });

  // ---------- backup ----------

  const runBackup = () => backupToNas(storage, vaultKeys);
  const runRestore = () => restoreFromBackup(storage, vaultKeys, mutated);
  registerAccountCommands({ backups, googleAuth, mutated, refreshReadiness, register, reportTeamRefusals, runBackup, runRestore, sharing, storage, sync, transports, vaultKeys });
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

/** Other entities of the account that can serve as an SSH key source. */

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
 * What the config read route needs: which entries carry a key hash, and how to read one.
 *
 * <p>The walk stays here rather than in the route because it is a question about a VAULT — the
 * same reason the other five suppliers are outside `CredsAgentServer`. Folders are skipped and
 * so is anything in the Trash: an entry somebody deleted must stop answering, and the Trash is
 * where deleting puts it.</p>
 */
function configRouteSources(storage: StorageManager): ConfigRouteSources {
  return {
    holders: () => collectConfigHolders(storage),
    body: (holder) => Promise.resolve(storage.getConfigBody(holder.accountId, holder.entityId)),
    // No audit sink here: the server supplies its own, so every door writes through one channel.
  };
}

/**
 * Connect over SSH resolving the key source: a referenced key entity wins,
 * then this entity's stored private key (materialized to a 0600 file),
 * then its plain key path.
 */

// ---------- helpers ----------

/**
 * The tree element for one id, across every unlocked account.
 *
 * <p>Every account, because an agent's list already merged them and the id it quotes carries no
 * account with it. Folders are findable too: an agent naming the folder an entry lives in is a
 * reasonable thing to want to look at.</p>
 */
export function findById(storage: StorageManager, id: string): TreeElement | undefined {
  for (const account of storage.getAccounts()) {
    const node = storage.getNode(account.accountId, id);
    if (node !== undefined) {
      return { kind: 'node', accountId: account.accountId, node };
    }
  }
  return undefined;
}
