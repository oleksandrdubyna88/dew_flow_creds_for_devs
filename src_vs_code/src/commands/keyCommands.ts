/* eslint-disable complexity, max-lines-per-function -- command registrations moved verbatim out of extension.ts
   (roadmap A1 stage 2, 2026-08-28): one function that registers a family of closures, each the size it
   was. The ceilings are a boundary for NEW code here; a handler meets them when it is next touched. */
import { KeyAddHost } from '../securityKeyAdd';
import { SyncReadiness } from '../syncReadiness';
import { StorageManager } from '../storageManager';
import { SyncManager } from '../syncManager';
import { TransportFactory } from '../transportFactory';
import { VaultKeys } from '../vaultKeys';
import { accountFromTargetOrPick } from '../accountPick';
import { addSecurityKey } from '../securityKeyAdd';
import { webauthnWraps } from '../keyWrap';
import { readVaultWraps } from '../cryptoUtils';
import { isKeyWrap } from '../keyWrap';
import * as vscode from 'vscode';
import { removalWouldRekey } from '../securityKeyOps';
import { hasRecoveryCode } from '../securityKeyOps';
import { envelopeWithRemovedKey } from '../securityKeyOps';
import { sharesFromEnvelope } from '../shareFormat';
import { isSecurityKeyRefusal } from '../securityKeyOps';
import { describeError } from '../describeError';
import { StoredAccount } from '../types';
import { VaultTransport } from '../vaultTransport';
import { generateRecoveryCode } from '../recoveryCode';
import { envelopeWithRecoveryCode } from '../securityKeyOps';
import { showRecoveryCodeView } from '../recoveryCodeView';
import { isRecoveryCodeError } from '../recoveryCode';
import { envelopeWithoutRecoveryCode } from '../securityKeyOps';
export interface KeyCommandsHost {
  readonly keyHost: KeyAddHost;
  readonly lockNow: (notice: string) => void;
  readonly refreshReadiness: () => Promise<Map<string, SyncReadiness>>;
  readonly register: (command: string, handler: (...args: unknown[]) => unknown) => void;
  readonly storage: StorageManager;
  readonly sync: SyncManager;
  readonly transports: TransportFactory;
  readonly vaultKeys: VaultKeys;
}

export function registerKeyCommands(host: KeyCommandsHost): void {
  const { keyHost, lockNow, refreshReadiness, register, storage, sync, transports, vaultKeys } = host;

  register('credSshManager.addSecurityKey', async (target) => {
    const account = await accountFromTargetOrPick(target, storage, 'Add a security key to…');
    if (account !== undefined) {
      await addSecurityKey(keyHost, account);
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
    // Whether this removal RE-KEYS (last key gone, PIN present) decides the wording of the
    // failure message; the arithmetic itself lives in securityKeyOps (audit A1).
    const storedPin = await vaultKeys.storedPin(account);
    const wouldRekey = removalWouldRekey(wraps, picked.wrap.id, storedPin);
    // A re-key mints a fresh master, and a printed recovery code cannot be carried onto it —
    // the code lives on paper and nowhere else. Say that BEFORE the destructive step, not in
    // the toast afterwards: it is the difference between a choice and a surprise.
    const codeWillDie = wouldRekey && hasRecoveryCode(raw);
    const confirmed = await vscode.window.showWarningMessage(
      `Remove "${picked.label}" from ${account.email}? It will no longer unlock this vault.` +
        (codeWillDie
          ? '\n\nThis is the last security key, so the vault is re-keyed under your PIN — and that ' +
            'retires the printed recovery code with it. You will be offered a new one to print.'
          : ''),
      { modal: true },
      'Remove',
    );
    if (confirmed !== 'Remove') {
      return;
    }
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
    sync.notifyChange();
    await refreshReadiness();
    if (next.recoveryCodeRetired) {
      // The rotation could not carry the code across. Offering the replacement here — rather
      // than leaving a line in a toast — is what stops somebody keeping a dead page in a
      // drawer believing it still opens the vault.
      const answer = await vscode.window.showWarningMessage(
        `Removed "${picked.label}" and re-keyed the vault. The printed recovery code no longer opens it — destroy that page. Set up a new one now?`,
        { modal: true },
        'Set Up Recovery Code',
      );
      if (answer === 'Set Up Recovery Code') {
        await vscode.commands.executeCommand('credSshManager.setupRecoveryCode', target);
      }
      return;
    }
    void vscode.window.showInformationMessage(
      next.rekeyed
        ? `Removed "${picked.label}" and re-keyed the vault under your PIN — the removed key can no longer open it.`
        : `Removed "${picked.label}". Note: existing backups/snapshots remain openable by that key until the vault is re-keyed (remove all security keys to force a re-key under the PIN).`,
    );
  });

  /**
   * The account, its transport and its stored vault — the three things every wrap-changing
   * ceremony needs before it can start, with the same refusals worded once.
   */
  async function vaultToRewrite(
    target: unknown,
    prompt: string,
  ): Promise<{ account: StoredAccount; transport: VaultTransport; raw: string } | undefined> {
    const account = await accountFromTargetOrPick(target, storage, prompt);
    if (account === undefined) {
      return undefined;
    }
    const transport = transports.forAccount(account);
    if (transport === undefined) {
      void vscode.window.showErrorMessage(
        `Set a sync location for ${account.email} first — the recovery code lives in its vault.`,
      );
      return undefined;
    }
    const raw = await transport.readVault(account);
    if (raw === undefined) {
      void vscode.window.showErrorMessage(
        `${account.email} has no vault yet — run "Sync Now" once, then set a recovery code.`,
      );
      return undefined;
    }
    return { account, transport, raw };
  }

  /**
   * Mint a printed recovery code and wrap the master key under it.
   *
   * <p>Unlocking first is what proves the person may add an opener at all; the arithmetic
   * lives in `securityKeyOps`, and the code itself is shown exactly once, by a panel that
   * has no Copy button on purpose.</p>
   */
  register('credSshManager.setupRecoveryCode', async (target) => {
    const found = await vaultToRewrite(target, 'Set up a recovery code for…');
    if (found === undefined) {
      return;
    }
    const { account, transport, raw } = found;
    const regenerated = hasRecoveryCode(raw);
    if (regenerated) {
      const answer = await vscode.window.showWarningMessage(
        `${account.email} already has a recovery code. Generating a new one immediately retires the printed one — that paper stops working.`,
        { modal: true },
        'Generate a new code',
      );
      if (answer !== 'Generate a new code') {
        return;
      }
    }
    const key = await vaultKeys.unlock(account, raw, { interactive: true });
    if (key === undefined) {
      void vscode.window.showErrorMessage('Could not unlock the vault — no recovery code was set.');
      return;
    }
    try {
      const code = generateRecoveryCode();
      const next = await envelopeWithRecoveryCode(
        {
          raw,
          key,
          account,
          storedPin: await vaultKeys.storedPin(account),
          now: Date.now(),
          pendingShares: transport.embedsShares ? sharesFromEnvelope(raw) : undefined,
          decrypt: (r, k) => vaultKeys.decrypt(r, k),
        },
        code.secret,
      );
      if (isSecurityKeyRefusal(next)) {
        // Only the legacy-upgrade path refuses, and only for a missing PIN — a vault openable
        // by a piece of paper alone is the one shape this must never create.
        void vscode.window.showErrorMessage(
          'Set a vault PIN first — a recovery code may not be the only way into a vault.',
        );
        return;
      }
      await transport.writeVault(account, next.content, []);
      vaultKeys.clearCache(account.accountId);
      showRecoveryCodeView({
        email: account.email,
        code: code.formatted,
        createdAt: Date.now(),
        regenerated,
      });
      sync.notifyChange();
      await refreshReadiness();
    } catch (error) {
      void vscode.window.showErrorMessage(
        `Setting the recovery code failed: ${describeError(error)}`,
      );
    }
  });

  /**
   * Open a vault with the printed code — the explicit path, because the automatic cascade
   * never reaches it: in the case this exists for, the vault still HAS a PIN wrap and key
   * wraps, and it is their holder who no longer has the PIN or the key.
   */
  register('credSshManager.unlockWithRecoveryCode', async (target) => {
    const found = await vaultToRewrite(target, 'Unlock which account with a recovery code?');
    if (found === undefined) {
      return;
    }
    const { account, raw } = found;
    if (!hasRecoveryCode(raw)) {
      void vscode.window.showInformationMessage(
        `${account.email} has no recovery code set up. It can only be created while the vault still opens.`,
      );
      return;
    }
    const typed = await vaultKeys.promptRecoveryCode(account);
    if (typed === undefined) {
      return;
    }
    try {
      const key = await vaultKeys.unlockWithRecoveryCode(account, raw, typed);
      if (isRecoveryCodeError(key) || key === 'no-recovery-code') {
        void vscode.window.showErrorMessage(
          key === 'bad-checksum'
            ? 'That code has a mistyped character — the checksum does not match. Check it against the paper.'
            : 'That is not this vault’s recovery code.',
        );
        return;
      }
      void vscode.window.showInformationMessage(`Vault of ${account.email} unlocked.`);
      await refreshReadiness();
      // The person is here because their PIN or key is gone. Offer the replacement now,
      // while the master key is cached — `setPin` re-keys without asking for anything else.
      const answer = await vscode.window.showWarningMessage(
        `Set a new PIN for ${account.email} now? You reached this vault with the printed code, so whatever PIN it had may be lost.`,
        { modal: true },
        'Set a new PIN',
      );
      if (answer === 'Set a new PIN') {
        await sync.setPin(account);
      }
      await sync.syncNow(account.accountId);
      await refreshReadiness();
    } catch (error) {
      void vscode.window.showErrorMessage(`Unlock failed: ${describeError(error)}`);
    }
  });

  register('credSshManager.removeRecoveryCode', async (target) => {
    const found = await vaultToRewrite(target, 'Remove the recovery code from…');
    if (found === undefined) {
      return;
    }
    const { account, transport, raw } = found;
    if (!hasRecoveryCode(raw)) {
      void vscode.window.showInformationMessage(`${account.email} has no recovery code set up.`);
      return;
    }
    const confirmed = await vscode.window.showWarningMessage(
      `Remove the recovery code from ${account.email}? If the PIN and the security keys are then lost, this vault cannot be opened by anyone.`,
      { modal: true },
      'Remove',
    );
    if (confirmed !== 'Remove') {
      return;
    }
    const key = await vaultKeys.unlock(account, raw, { interactive: true });
    if (key === undefined) {
      void vscode.window.showErrorMessage('Could not unlock the vault — nothing removed.');
      return;
    }
    const next = envelopeWithoutRecoveryCode(raw, key);
    if (isSecurityKeyRefusal(next)) {
      void vscode.window.showErrorMessage('Could not unlock to update wraps — nothing removed.');
      return;
    }
    await transport.writeVault(account, next, []);
    vaultKeys.clearCache(account.accountId);
    void vscode.window.showInformationMessage(
      'Recovery code removed. Note: a copy of the vault made earlier stays openable by that printed code until the vault is re-keyed.',
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
    lockNow(
      'Vaults locked. Background sync is paused until you unlock; your saved credentials still work locally.',
    );
  });
}
