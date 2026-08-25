import * as vscode from 'vscode';
import * as crypto from 'node:crypto';
import { BackupError } from './cryptoUtils';
import { StorageManager } from './storageManager';
import { sharesFromEnvelope } from './shareFormat';
import { emptySnapshot, mergeProfiles, ProfileSnapshot } from './syncMerge';
import {
  encryptJsonWrapped,
  macStatusBlocksSync,
  readVaultWraps,
  verifyEnvelopeMac,
} from './cryptoUtils';
import { isKeyWrap, webauthnWraps, upsertWrap, wrapWithPin, wrapPinVault } from './keyWrap';
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

  /**
   * The last remote envelope we decrypted, per account, keyed by a hash of its exact
   * bytes. Identical ciphertext means identical plaintext, so an idle cycle whose remote
   * file has not changed reuses this instead of decrypting again — which for a PIN-only
   * (v1) vault is a full scrypt (~1s) on the extension-host thread, run on every timer
   * tick. Keyed on the content, never on the account alone: any real change misses and
   * decrypts. Dropped after we push, so a stale plaintext can never be served.
   */
  private readonly decryptedByHash = new Map<string, { rawHash: string; snapshot: ProfileSnapshot }>();

  /**
   * Accounts whose vault envelope was seen to carry a security-key wrap.
   *
   * Recorded opportunistically during a cycle rather than probed on demand: the wraps
   * live inside the envelope, so finding out costs a network read, and the readiness
   * indicator must not make one every time the tree repaints. Absent therefore means
   * "not seen yet", never "none" — which is why a missing entry is reported as
   * not-configured only in combination with a missing PIN.
   */
  private readonly securityKeyAccounts = new Set<string>();
  private readonly configListener: vscode.Disposable;

  constructor(
    private readonly storage: StorageManager,
    private readonly keys: VaultKeys,
    private readonly transports: TransportFactory,
    private readonly onApplied: () => void,
    private readonly onCycleEnd?: () => void,
    /** Called with the accountId after each account's cycle SUCCEEDS — feeds the stale-sync reminder. */
    private readonly onAccountSynced?: (accountId: string) => void,
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

  /** Whether this account's vault was seen to carry a security-key wrap. */
  hasSecurityKey(accountId: string): boolean {
    return this.securityKeyAccounts.has(accountId);
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
      const master = key.masterKey;
      const wraps = upsertWrap(
        readVaultWraps(raw).filter(isKeyWrap),
        wrapWithPin(master, account.accountId, newPin, Date.now()),
      );
      content = encryptJsonWrapped(payload, key.masterKey, wraps, account, shares);
    } else {
      // v1: a PIN change is also the moment to leave v1 behind — write v3 with the new
      // PIN's wrap instead of another scrypt-per-op envelope.
      content = wrapPinVault(payload, account.accountId, newPin, Date.now(), account, shares).content;
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
        this.onAccountSynced?.(account.accountId);
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
    if (raw !== undefined) {
      // The envelope is already here; noting what it carries costs nothing, and makes
      // the readiness indicator answerable without a read of its own.
      const seen = webauthnWraps(readVaultWraps(raw).filter(isKeyWrap));
      if (seen.length > 0) {
        this.securityKeyAccounts.add(account.accountId);
      } else {
        this.securityKeyAccounts.delete(account.accountId);
      }
    }
    // PIN, cached master key, or a security-key touch — VaultKeys decides.
    const key = await this.keys.unlock(account, raw, { interactive });
    if (key === undefined) {
      this.warnLocked(account);
      return { applied: false, pushed: false };
    }
    // Detect tampering of the envelope's signed fields (account / unlock wraps / the
    // sealed blob) on this — the owner's — file. Only meaningful for v2+ (signed).
    if (raw !== undefined && key.version === 2) {
      const mac = verifyEnvelopeMac(raw, key.masterKey);
      if (macStatusBlocksSync(mac)) {
        this.warnTampered(account);
        // Fail closed. Decrypting, merging and re-encrypting would write a fresh valid MAC
        // over the altered file — healing a detected tamper into a legitimate-looking one.
        // Refuse the whole cycle and leave the evidence for a person to judge.
        return { applied: false, pushed: false };
      }
      // Clean again — let a future recurrence warn instead of being silently deduped.
      this.warnedAccounts.delete(`mac:${account.accountId}`);
    }
    try {
      if (raw === undefined) {
        throw new Error('no vault stored yet');
      }
      if (transport.embedsShares) {
        pendingShares = sharesFromEnvelope(raw);
      }
      const rawHash = crypto.createHash('sha256').update(raw).digest('base64');
      const cached = this.decryptedByHash.get(account.accountId);
      if (cached !== undefined && cached.rawHash === rawHash) {
        // Byte-identical to what we last decrypted — skip the scrypt, reuse the plaintext.
        remote = cached.snapshot;
      } else {
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
          attachments: payload.attachments ?? {},
          images: payload.images ?? {},
          tombstones: payload.tombstones ?? {},
          horizon: payload.horizon ?? {},
        };
        this.decryptedByHash.set(account.accountId, { rawHash, snapshot: remote });
      }
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
    // A legacy PIN-only (v1) file we just decrypted is rewritten even with nothing to sync,
    // so it migrates to v3 promptly — `encrypt` produces v3 for a v1 key. This is only
    // reached after a SUCCESSFUL decrypt (a wrong PIN threw above), so it can never overwrite
    // an unreadable file with local-only data.
    const migrateV1 = raw !== undefined && key.version === 1;
    const willWrite = remoteChanged || !remoteExists || migrateV1;
    if (willWrite) {
      const content = this.keys.encrypt(
        { ...merged, exportedAt: Date.now() },
        key,
        account,
        transport.embedsShares ? pendingShares : undefined,
      );
      await transport.writeVault(account, content, []);
      // We just replaced the remote; its next read will not match the cached hash anyway,
      // and caching what we wrote would duplicate the encrypt. Drop it so the next cycle
      // re-decrypts once and re-caches — the idle-cycle case is what this optimizes.
      this.decryptedByHash.delete(account.accountId);
    }
    return { applied: localChanged, pushed: willWrite };
  }

  private warnTampered(account: StoredAccount): void {
    if (this.warnedAccounts.has(`mac:${account.accountId}`)) {
      return;
    }
    this.warnedAccounts.add(`mac:${account.accountId}`);
    void vscode.window.showWarningMessage(
      `The vault of ${account.email} failed its integrity check — its stored file (account, unlock keys, or the encrypted blob) was modified at the sync location. Auto-sync for this account is PAUSED so the change is not merged or re-signed; your local data is safe and still encrypted. Restore the file from a trusted copy and review its security keys.`,
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
        ? `Sync for ${account.email}: the NAS file does not decrypt with this machine's PIN — run "CredsForDevs: Set Sync PIN" with the same PIN as the other machine.`
        : `Sync for ${account.email} failed: ${error instanceof Error ? error.message : String(error)}`;
    void vscode.window.showWarningMessage(message);
  }
}
