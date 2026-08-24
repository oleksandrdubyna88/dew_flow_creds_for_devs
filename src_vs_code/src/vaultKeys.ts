import * as vscode from 'vscode';
import { LockState } from './lockState';
import {
  BackupError,
  decryptJson,
  decryptJsonWithMasterKey,
  encryptJson,
  encryptJsonWrapped,
  readVaultVersion,
  readVaultWraps,
} from './cryptoUtils';
import {
  KeyWrap,
  isKeyWrap,
  unwrapWithPin,
  unwrapWithPrf,
  webauthnWraps,
} from './keyWrap';
import { authenticateSecurityKey } from './webauthnPrf';
import { validatePin } from './pinPolicy';
import { StoredAccount } from './types';

/**
 * Owns "how do we open this account's vault": the per-account PIN, the
 * registered security keys, and the in-memory master key cache.
 *
 * Unlock order for a v2 vault: cached master key → the PIN wrap (using the
 * PIN saved for this machine) → a security key (native touch prompt). The
 * master key is cached for the window's lifetime so background sync never
 * asks for a touch again; nothing key-derived is ever written to disk.
 */

const LEGACY_PIN_KEY = 'credSshManager.syncPin';

function pinKey(accountId: string): string {
  return `credSshManager.syncPin.${accountId}`;
}

export type VaultKey =
  | { version: 1; passphrase: string }
  | { version: 2; masterKeyBase64: string; wraps: KeyWrap[] };

export class VaultKeys {
  private readonly cache = new Map<string, VaultKey>();

  /** Locked-ness and the idle clock. Kept out of this class so its rules are testable
   *  without a `vscode` runtime — see lockState.ts. */
  private readonly lockState = new LockState();

  constructor(private readonly secrets: vscode.SecretStorage) {}

  clearCache(accountId?: string): void {
    if (accountId === undefined) {
      this.cache.clear();
    } else {
      this.cache.delete(accountId);
    }
  }

  /**
   * Lock the vaults: forget the cached keys AND refuse the stored PIN until somebody
   * unlocks deliberately.
   *
   * <p>The second half is the part that was missing. Clearing the cache alone left the
   * Sync PIN sitting in the OS keychain, and the next automatic sync — five minutes
   * later by default — opened the vault again without asking anyone.</p>
   */
  lock(): void {
    this.cache.clear();
    this.lockState.lock();
  }

  isLocked(): boolean {
    return this.lockState.isLocked();
  }

  /** Whether the idle window has elapsed. The caller owns the timer; this owns the rule. */
  dueForAutoLock(nowMs: number, idleMinutes: number): boolean {
    return this.lockState.dueForAutoLock(nowMs, idleMinutes);
  }

  // ---------- PIN storage ----------

  /** This account's PIN, falling back to the legacy machine-wide one. */
  async storedPin(account: StoredAccount): Promise<string | undefined> {
    const own = await this.secrets.get(pinKey(account.accountId));
    if (own !== undefined && own.length > 0) {
      return own;
    }
    const legacy = await this.secrets.get(LEGACY_PIN_KEY);
    return legacy !== undefined && legacy.length > 0 ? legacy : undefined;
  }

  async savePin(account: StoredAccount, pin: string): Promise<void> {
    await this.secrets.store(pinKey(account.accountId), pin);
    this.cache.delete(account.accountId);
  }

  /** Ask for the PIN (used when none is stored, or to re-enter it). */
  async promptPin(account: StoredAccount, purpose: string): Promise<string | undefined> {
    return vscode.window.showInputBox({
      title: `${purpose} — ${account.email}`,
      prompt: "This account's vault PIN (same on every machine for this account)",
      password: true,
      ignoreFocusOut: true,
      validateInput: validatePin,
    });
  }

  // ---------- unlock ----------

  /**
   * The key material for this account's vault. `vaultContent` is the stored
   * vault (undefined when nothing exists yet — then a PIN-only v1 key is
   * produced, and registering a security key later upgrades it to v2).
   * Returns undefined when the vault cannot be opened without more input
   * than `interactive` allows.
   */
  async unlock(
    account: StoredAccount,
    vaultContent: string | undefined,
    options: { interactive: boolean },
  ): Promise<VaultKey | undefined> {
    const key = await this.unlockInner(account, vaultContent, options);
    if (key !== undefined) {
      // Only a caller that CAN prompt is the user being present. A background cycle
      // opening the vault must not postpone auto-lock — that is what made the setting
      // inert as soon as auto-sync was switched on.
      if (options.interactive) {
        this.lockState.noteUnlocked(Date.now());
      } else {
        this.lockState.noteBackgroundUnlock(Date.now());
      }
    }
    return key;
  }

  /** The user touched a stored secret. Postpones auto-lock; does not unlock anything. */
  noteUserActivity(): void {
    this.lockState.noteUserActivity(Date.now());
  }

  private async unlockInner(
    account: StoredAccount,
    vaultContent: string | undefined,
    options: { interactive: boolean },
  ): Promise<VaultKey | undefined> {
    // While locked, only a caller that can ASK is allowed through. Background sync
    // cannot ask, so it is refused rather than quietly reopening what the user just shut.
    if (!options.interactive && !this.lockState.allowsSilentUnlock()) {
      return undefined;
    }

    const version = vaultContent === undefined ? 1 : safeVersion(vaultContent);

    if (version === 1) {
      // A v1 vault has no security-key wrap to touch, so presence means typing the PIN.
      const pin = this.lockState.requiresPresence()
        ? await this.promptPin(account, 'Unlock vault')
        : await this.resolvePin(account, options.interactive);
      if (pin === undefined) {
        return undefined;
      }
      return { version: 1, passphrase: account.accountId + pin };
    }

    // Unlocking a LOCKED vault has to cost a gesture. Everything below that opens it
    // from a secret already on this machine — the cache, the stored PIN — is skipped
    // while the lock stands, or Lock protects nothing on the unattended machine it is
    // for. See LockState.requiresPresence().
    const needsGesture = this.lockState.requiresPresence();

    const cached = this.cache.get(account.accountId);
    if (cached?.version === 2 && !needsGesture) {
      return cached;
    }
    const wraps = readVaultWraps(vaultContent!).filter(isKeyWrap);
    if (wraps.length === 0) {
      throw new BackupError('corrupted', 'This vault has no unlock wraps.');
    }

    // 1) the PIN wrap, from a PIN already stored — the unattended path
    const pinWrap = wraps.find((w) => w.kind === 'pin');
    if (pinWrap !== undefined && !needsGesture) {
      const pin = await this.resolvePin(account, false);
      if (pin !== undefined) {
        try {
          const master = unwrapWithPin(pinWrap, account.accountId, pin);
          return this.remember(account, master.toString('base64'), wraps);
        } catch {
          // stored PIN does not fit this vault — fall through
        }
      }
    }

    // 2) a security key (native "touch your key" prompt)
    const keys = webauthnWraps(wraps);
    if (keys.length > 0 && options.interactive) {
      const prfSalt = keys[0].prfSalt;
      if (prfSalt !== undefined) {
        const result = await authenticateSecurityKey(
          account.email,
          prfSalt,
          keys.map((k) => k.id),
        );
        const used = keys.find((k) => k.id === result.credentialId) ?? keys[0];
        const master = unwrapWithPrf(used, result.secret);
        return this.remember(account, master.toString('base64'), wraps);
      }
    }

    // 3) last resort: ask for the PIN explicitly
    if (pinWrap !== undefined && options.interactive) {
      const pin = await this.promptPin(account, 'Unlock vault');
      if (pin !== undefined) {
        const master = unwrapWithPin(pinWrap, account.accountId, pin);
        await this.savePin(account, pin);
        return this.remember(account, master.toString('base64'), wraps);
      }
    }
    return undefined;
  }

  /** Decrypt a stored vault with a previously obtained key. */
  decrypt(vaultContent: string, key: VaultKey): unknown {
    return key.version === 1
      ? decryptJson(vaultContent, key.passphrase)
      : decryptJsonWithMasterKey(vaultContent, key.masterKeyBase64);
  }

  /** Re-encrypt a vault payload with the same key material. */
  encrypt(
    payload: unknown,
    key: VaultKey,
    account: StoredAccount,
    shares: unknown[] | undefined,
  ): string {
    return key.version === 1
      ? encryptJson(payload, key.passphrase, account, shares)
      : encryptJsonWrapped(payload, key.masterKeyBase64, key.wraps, account, shares);
  }

  private remember(account: StoredAccount, masterKeyBase64: string, wraps: KeyWrap[]): VaultKey {
    const key: VaultKey = { version: 2, masterKeyBase64, wraps };
    this.cache.set(account.accountId, key);
    return key;
  }

  private async resolvePin(
    account: StoredAccount,
    interactive: boolean,
  ): Promise<string | undefined> {
    const stored = await this.storedPin(account);
    if (stored !== undefined) {
      return stored;
    }
    if (!interactive) {
      return undefined;
    }
    const entered = await this.promptPin(account, 'Vault PIN');
    if (entered === undefined) {
      return undefined;
    }
    await this.savePin(account, entered);
    return entered;
  }
}

function safeVersion(vaultContent: string): number {
  try {
    return readVaultVersion(vaultContent);
  } catch {
    return 1;
  }
}
