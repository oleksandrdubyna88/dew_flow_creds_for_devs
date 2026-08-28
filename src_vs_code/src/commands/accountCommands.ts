/* eslint-disable complexity, max-lines-per-function -- command registrations moved verbatim out of extension.ts
   (roadmap A1 stage 2, 2026-08-28): one function that registers a family of closures, each the size it
   was. The ceilings are a boundary for NEW code here; a handler meets them when it is next touched. */
import { BackupScheduler } from '../backupScheduler';
import { GoogleAuthProvider } from '../googleAuthProvider';
import { SyncReadiness } from '../syncReadiness';
import { SharingManager } from '../sharingManager';
import { StorageManager } from '../storageManager';
import { SyncManager } from '../syncManager';
import { TransportFactory } from '../transportFactory';
import { VaultKeys } from '../vaultKeys';
import * as vscode from 'vscode';
import { AuthProvider } from '../types';
import { signIn } from '../authManager';
import { probeRemote } from '../installFlow';
import { AuthError } from '../authManager';
import { asElement } from '../commandTargets';
import { backupPathFor } from '../backupPaths';
import { nasPathFor } from '../nasPaths';
import { isServerLocation } from '../vaultTransport';
import { setAccountBackupPath } from '../backupPaths';
import { backupIntervalHoursFor } from '../backupPaths';
import { INTERVAL_CHOICES } from '../backupSchedule';
import { describeInterval } from '../backupSchedule';
import { setAccountBackupInterval } from '../backupPaths';
import { setAccountNasPath } from '../nasPaths';
import { describeError } from '../describeError';
export interface AccountCommandsHost {
  readonly backups: BackupScheduler;
  readonly googleAuth: GoogleAuthProvider;
  readonly mutated: () => void;
  readonly refreshReadiness: () => Promise<Map<string, SyncReadiness>>;
  readonly register: (command: string, handler: (...args: unknown[]) => unknown) => void;
  readonly reportTeamRefusals: () => void;
  readonly runBackup: () => Promise<unknown>;
  readonly runRestore: () => Promise<unknown>;
  readonly sharing: SharingManager;
  readonly storage: StorageManager;
  readonly sync: SyncManager;
  readonly transports: TransportFactory;
  readonly vaultKeys: VaultKeys;
}

export function registerAccountCommands(host: AccountCommandsHost): void {
  const { backups, googleAuth, mutated, refreshReadiness, register, reportTeamRefusals, runBackup, runRestore, sharing, storage, sync, transports, vaultKeys } = host;

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

  register('credSshManager.backupToNas', runBackup);

  register('credSshManager.restoreBackup', runRestore);
}
