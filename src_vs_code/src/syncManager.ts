import * as vscode from 'vscode';
import { BackupError } from './cryptoUtils';
import { StorageManager } from './storageManager';
import { sharesFromEnvelope } from './shareFormat';
import { emptySnapshot, mergeProfiles, ProfileSnapshot } from './syncMerge';
import { encryptJson, encryptJsonWrapped, readVaultWraps, verifyEnvelopeMac } from './cryptoUtils';
import { isKeyWrap, upsertWrap, wrapWithPin } from './keyWrap';
import { TransportFactory } from './transportFactory';
import { VaultKeys } from './vaultKeys';
import { validatePin } from './pinPolicy';
import { VaultTransport } from './vaultTransport';
import { StoredAccount, isBackupBundle } from './types';

const CONFIG_SECTION = 'credSshManager';
const AUTO_SYNC_SETTING = 'autoSync';
const INTERVAL_SETTING = 'autoSyncIntervalMinutes';
const DEBOUNCE_MS = 5_000;

/**
 * Automatic cross-machine sync over the NAS: the encrypted per-profile
 * vault_*.enc files are the transport. Cycle (per profile):
 * read the NAS file → two-way merge with local state (see syncMerge.ts) →
 * apply locally when local lost updates → rewrite the NAS file when it did.
 * Runs debounced after every change, on startup, and on an interval.
 * The master PIN is entered once per machine and cached in SecretStorage.
 */
export class SyncManager implements vscode.Disposable {
  private interval: ReturnType<typeof setInterval> | undefined;
  private debounce: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  private rerunWanted = false;
  private readonly warnedAccounts = new Set<string>();
  private readonly configListener: vscode.Disposable;

  constructor(
    private readonly storage: StorageManager,
    private readonly keys: VaultKeys,
    private readonly transports: TransportFactory,
    private readonly onApplied: () => void,
    private readonly onCycleEnd?: () => void,
  ) {
    this.configListener = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(CONFIG_SECTION)) {
        this.restart();
      }
    });
    this.restart();
  }

  dispose(): void {
    this.configListener.dispose();
    this.stopTimers();
  }

  /** Debounced trigger, called after every local mutation. */
  notifyChange(): void {
    if (!this.isEnabled()) {
      return;
    }
    if (this.debounce !== undefined) {
      clearTimeout(this.debounce);
    }
    this.debounce = setTimeout(() => void this.syncAll(false), DEBOUNCE_MS);
  }

  /** Manual "Sync Now" — verbose; optionally limited to one account. */
  syncNow(onlyAccountId?: string): Promise<void> {
    return this.syncAll(true, onlyAccountId);
  }

  /**
   * Quiet, awaitable pull+merge for one account (no toasts). Used right after a
   * new account is added, so a returning user's remote data lands before we
   * decide whether to seed default folders.
   */
  pullAccount(accountId: string): Promise<void> {
    return this.syncAll(false, accountId);
  }

  /** Set the sync PIN for ONE account (asks which one when not given). */
  async setPin(account?: StoredAccount): Promise<void> {
    let target = account;
    if (target === undefined) {
      const accounts = this.storage.getAccounts();
      if (accounts.length === 0) {
        void vscode.window.showInformationMessage('Add an account profile first.');
        return;
      }
      if (accounts.length === 1) {
        target = accounts[0];
      } else {
        const picked = await vscode.window.showQuickPick(
          accounts.map((a) => ({ label: a.email, description: a.provider, account: a })),
          { title: 'Set sync PIN for which account?' },
        );
        if (picked === undefined) {
          return;
        }
        target = picked.account;
      }
    }
    const pin = await vscode.window.showInputBox({
      title: `Sync PIN for ${target.email}`,
      prompt:
        'Encrypts this account\'s NAS vault. Must be the SAME on every machine for this account.',
      password: true,
      ignoreFocusOut: true,
      validateInput: validatePin,
    });
    if (pin === undefined) {
      return;
    }
    // Re-wrap the existing vault under the NEW pin so the OLD pin can no
    // longer decrypt it (even on a stale offline copy). Requires unlocking
    // with the current credentials first.
    const rekeyed = await this.rekeyToNewPin(target, pin);
    if (rekeyed === 'cancelled') {
      return;
    }
    await this.keys.savePin(target, pin);
    this.warnedAccounts.delete(target.accountId);
    void vscode.window.showInformationMessage(
      rekeyed === 'rekeyed'
        ? `Sync PIN changed for ${target.email} — the old PIN no longer opens the vault.`
        : `Sync PIN saved for ${target.email}.`,
    );
    if (this.isEnabled()) {
      void this.syncAll(false);
    }
  }

  /**
   * Re-encrypt/re-wrap this account's stored vault under `newPin`.
   * Returns 'rekeyed' when a vault was re-secured, 'none' when there is
   * nothing stored yet (first-time set), or 'cancelled' if the current
   * credentials could not be supplied.
   */
  private async rekeyToNewPin(
    account: StoredAccount,
    newPin: string,
  ): Promise<'rekeyed' | 'none' | 'cancelled'> {
    const transport = this.transports.forAccount(account);
    if (transport === undefined) {
      return 'none';
    }
    let raw: string | undefined;
    try {
      raw = await transport.readVault(account);
    } catch {
      return 'none'; // location unreachable — nothing to re-key here
    }
    if (raw === undefined) {
      return 'none';
    }
    const key = await this.keys.unlock(account, raw, { interactive: true });
    if (key === undefined) {
      void vscode.window.showErrorMessage(
        'Could not unlock the vault with the current PIN/key — PIN not changed.',
      );
      return 'cancelled';
    }
    const payload = this.keys.decrypt(raw, key);
    const shares = transport.embedsShares ? sharesFromEnvelope(raw) : undefined;
    let content: string;
    if (key.version === 2) {
      // Same master key, new PIN wrap; other (security-key) wraps untouched.
      const master = Buffer.from(key.masterKeyBase64, 'base64');
      const wraps = upsertWrap(
        readVaultWraps(raw).filter(isKeyWrap),
        wrapWithPin(master, account.accountId, newPin, Date.now()),
      );
      content = encryptJsonWrapped(payload, key.masterKeyBase64, wraps, account, shares);
    } else {
      // v1: the passphrase IS accountId+PIN, so re-encrypt under the new one.
      content = encryptJson(payload, account.accountId + newPin, account, shares);
    }
    await transport.writeVault(account, content, []);
    this.keys.clearCache(account.accountId);
    return 'rekeyed';
  }

  // ---------- internals ----------

  private isEnabled(): boolean {
    return vscode.workspace.getConfiguration(CONFIG_SECTION).get<boolean>(AUTO_SYNC_SETTING, false);
  }

  private restart(): void {
    this.stopTimers();
    if (!this.isEnabled()) {
      return;
    }
    const minutes = Math.max(
      1,
      vscode.workspace.getConfiguration(CONFIG_SECTION).get<number>(INTERVAL_SETTING, 5),
    );
    this.interval = setInterval(() => void this.syncAll(false), minutes * 60_000);
    void this.syncAll(false); // initial pull on startup / enable
  }

  private stopTimers(): void {
    if (this.interval !== undefined) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
    if (this.debounce !== undefined) {
      clearTimeout(this.debounce);
      this.debounce = undefined;
    }
  }

  private async syncAll(verbose: boolean, onlyAccountId?: string): Promise<void> {
    // Never run two cycles concurrently; remember to run again if triggered.
    if (this.running) {
      this.rerunWanted = true;
      return;
    }
    this.running = true;
    try {
      await this.syncAllOnce(verbose, onlyAccountId);
    } finally {
      this.running = false;
      if (this.rerunWanted) {
        this.rerunWanted = false;
        void this.syncAll(false);
      }
    }
  }

  private async syncAllOnce(verbose: boolean, onlyAccountId?: string): Promise<void> {
    const all = this.storage.getAccounts();
    const accounts =
      onlyAccountId === undefined ? all : all.filter((a) => a.accountId === onlyAccountId);
    if (accounts.length === 0) {
      if (verbose) {
        void vscode.window.showInformationMessage('Nothing to sync — no account profiles.');
      }
      return;
    }

    let applied = 0;
    let pushed = 0;
    for (const account of accounts) {
      // Per-account transport: NAS folder or vault server.
      const transport = this.transports.forAccount(account);
      if (transport === undefined) {
        if (verbose) {
          void vscode.window.showErrorMessage(
            `No sync location configured for ${account.email} — set credSshManager.nasBackupPath or a per-account mapping.`,
          );
        }
        continue;
      }
      try {
        const result = await this.syncProfile(account, transport, verbose);
        applied += result.applied ? 1 : 0;
        pushed += result.pushed ? 1 : 0;
        this.warnedAccounts.delete(account.accountId);
      } catch (error) {
        this.warnOnce(account, error);
      }
    }
    if (applied > 0) {
      this.onApplied();
    }
    this.onCycleEnd?.();
    if (verbose) {
      void vscode.window.showInformationMessage(
        `Sync finished: pulled changes for ${applied} profile(s), pushed ${pushed}.`,
      );
    }
  }

  private async syncProfile(
    account: StoredAccount,
    transport: VaultTransport,
    interactive: boolean,
  ): Promise<{ applied: boolean; pushed: boolean }> {
    let remote: ProfileSnapshot = emptySnapshot();
    let remoteExists = false;
    // On the folder transport shares live PLAINTEXT in the envelope —
    // carry them through every rewrite. The server keeps its own inbox.
    let pendingShares: unknown[] = [];
    const raw = await transport.readVault(account);
    // PIN, cached master key, or a security-key touch — VaultKeys decides.
    const key = await this.keys.unlock(account, raw, { interactive });
    if (key === undefined) {
      this.warnLocked(account);
      return { applied: false, pushed: false };
    }
    // Detect tampering of the envelope's unauthenticated metadata (account /
    // wraps) on this — the owner's — file. Only meaningful for v2 (signed).
    if (raw !== undefined && key.version === 2) {
      const mac = verifyEnvelopeMac(raw, key.masterKeyBase64);
      if (mac === 'bad') {
        this.warnTampered(account);
      }
    }
    try {
      if (raw === undefined) {
        throw new Error('no vault stored yet');
      }
      if (transport.embedsShares) {
        pendingShares = sharesFromEnvelope(raw);
      }
      const payload = this.keys.decrypt(raw, key);
      if (!isBackupBundle(payload)) {
        throw new BackupError('corrupted', 'Stored vault content does not match the schema.');
      }
      remote = {
        nodes: payload.nodes,
        passwords: payload.passwords,
        privateKeys: payload.privateKeys ?? {},
        vpnConfigs: payload.vpnConfigs ?? {},
        dbConnections: payload.dbConnections ?? {},
        notes: payload.notes ?? {},
        tombstones: payload.tombstones ?? {},
        horizon: payload.horizon ?? {},
      };
      remoteExists = true;
    } catch (error) {
      if (error instanceof BackupError) {
        throw error; // wrong PIN / corrupted file — surface, don't overwrite
      }
      // Nothing stored yet: first sync for this profile at this location.
    }

    const local = await this.storage.getSnapshot(account.accountId);
    const { merged, localChanged, remoteChanged } = mergeProfiles(local, remote, Date.now());

    if (localChanged) {
      await this.storage.applySnapshot(account.accountId, merged);
    }
    if (remoteChanged || !remoteExists) {
      const content = this.keys.encrypt(
        { ...merged, exportedAt: Date.now() },
        key,
        account,
        transport.embedsShares ? pendingShares : undefined,
      );
      await transport.writeVault(account, content, []);
    }
    return { applied: localChanged, pushed: remoteChanged || !remoteExists };
  }

  private warnTampered(account: StoredAccount): void {
    if (this.warnedAccounts.has(`mac:${account.accountId}`)) {
      return;
    }
    this.warnedAccounts.add(`mac:${account.accountId}`);
    void vscode.window.showWarningMessage(
      `The vault metadata for ${account.email} failed its integrity check — someone may have modified the stored file (account or unlock keys). Your data is still encrypted; review its security keys.`,
    );
  }

  private warnLocked(account: StoredAccount): void {
    if (this.warnedAccounts.has(`locked:${account.accountId}`)) {
      return;
    }
    this.warnedAccounts.add(`locked:${account.accountId}`);
    void vscode.window
      .showWarningMessage(
        `Auto-sync: the vault of ${account.email} is locked on this machine.`,
        'Set Sync PIN',
        'Unlock with Security Key',
      )
      .then((choice) => {
        if (choice === 'Set Sync PIN') {
          void this.setPin(account);
        } else if (choice === 'Unlock with Security Key') {
          void vscode.commands.executeCommand('credSshManager.unlockWithSecurityKey', account);
        }
      });
  }

  private warnOnce(account: StoredAccount, error: unknown): void {
    if (this.warnedAccounts.has(account.accountId)) {
      return;
    }
    this.warnedAccounts.add(account.accountId);
    const message =
      error instanceof BackupError && error.kind === 'wrong-password'
        ? `Sync for ${account.email}: the NAS file does not decrypt with this machine's PIN — run "Cred SSH: Set Sync PIN" with the same PIN as the other machine.`
        : `Sync for ${account.email} failed: ${error instanceof Error ? error.message : String(error)}`;
    void vscode.window.showWarningMessage(message);
  }
}
