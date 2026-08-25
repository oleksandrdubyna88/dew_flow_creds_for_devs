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
  prfSaltsByCredential,
  wrapForCredential,
  isKeyWrap,
  unwrapWithPin,
  unwrapWithPrf,
} from './keyWrap';
import { authenticateSecurityKey } from './webauthnPrf';
import { validatePin } from './pinPolicy';
import { StoredAccount } from './types';
import { unlockPlan } from './unlockPlan';
import { detachVaultKey, wipeVaultKey } from './vaultKeyLifetime';

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
  | { version: 2; masterKey: Buffer; wraps: KeyWrap[] };

// Wiping a key, and handing one out without aliasing the cached Buffer, live in a pure
// vscode-free module so the anti-aliasing rule is a unit test — see vaultKeyLifetime.ts.
const wipe = wipeVaultKey;

export class VaultKeys {
  private readonly cache = new Map<string, VaultKey>();

  /** Locked-ness and the idle clock. Kept out of this class so its rules are testable
   *  without a `vscode` runtime — see lockState.ts. */
  private readonly lockState = new LockState();

  constructor(private readonly secrets: vscode.SecretStorage) {}

  clearCache(accountId?: string): void {
    if (accountId === undefined) {
      for (const key of this.cache.values()) {
        wipe(key);
      }
      this.cache.clear();
    } else {
      const key = this.cache.get(accountId);
      if (key !== undefined) {
        wipe(key);
      }
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
    // Dropping the reference is not forgetting the key: it leaves the bytes in the
    // heap for the collector to move around at its convenience, and a dump taken in
    // between reads them. Locking is supposed to mean the key is gone.
    for (const key of this.cache.values()) {
      wipe(key);
    }
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
      // A detached copy: a caller holding this across awaits must not have its bytes
      // zeroed by an auto-lock tick wiping the cache mid-operation. See detachVaultKey.
      return detachVaultKey(cached);
    }
    const wraps = readVaultWraps(vaultContent!).filter(isKeyWrap);
    if (wraps.length === 0) {
      throw new BackupError('corrupted', 'This vault has no unlock wraps.');
    }

    const pinWrap = wraps.find((w) => w.kind === 'pin');
    const salts = prfSaltsByCredential(wraps);
    const storedPin = pinWrap !== undefined ? await this.resolvePin(account, false) : undefined;

    // The cascade broke three times while it lived inline here; the decision is
    // unlockPlan now, tested on its own — including the one question the old cascade
    // never asked: both ways in and a person present means the PERSON picks.
    const plan = unlockPlan({
      interactive: options.interactive,
      needsGesture,
      hasStoredPin: storedPin !== undefined,
      hasPinWrap: pinWrap !== undefined,
      hasKeyWrap: Object.keys(salts).length > 0,
    });

    if (plan.kind === 'refuse') {
      return undefined;
    }

    if (plan.kind === 'silentPin') {
      try {
        const master = unwrapWithPin(pinWrap!, account.accountId, storedPin!);
        return this.remember(account, master, wraps);
      } catch {
        // The stored PIN does not fit this vault. A person present falls through to a
        // gesture; a background caller has nothing else and stops here.
        if (!options.interactive) {
          return undefined;
        }
      }
    }

    // Only the ways that actually exist in THIS vault are offered — a picker with a
    // dead option is how the wrong-PIN fallthrough would advertise a key the vault
    // does not hold.
    const offered: Array<{ label: string; detail: string; way: 'key' | 'pin' }> = [];
    if (Object.keys(salts).length > 0) {
      offered.push({
        label: '$(key) Touch the security key',
        detail: 'Uses the key registered on this vault.',
        way: 'key',
      });
    }
    if (pinWrap !== undefined) {
      offered.push({
        label: '$(lock) Enter the PIN',
        detail: 'The vault PIN — the same on every machine for this account.',
        way: 'pin',
      });
    }
    if (offered.length === 0) {
      return undefined;
    }
    let way = offered[0].way;
    if (offered.length > 1) {
      const picked = await vscode.window.showQuickPick(offered, {
        title: `Unlock ${account.email} — how?`,
        ignoreFocusOut: true,
      });
      if (picked === undefined) {
        return undefined;
      }
      way = picked.way;
    }

    if (way === 'key') {
      const result = await authenticateSecurityKey(account.email, salts);
      const used = wrapForCredential(wraps, result.credentialId);
      if (used === undefined) {
        // A leftover registration that never reached the vault. Unwrapping any OTHER
        // wrap with its secret can only fail; say what is wrong instead.
        throw new BackupError(
          'corrupted',
          'The security key answered with a credential this vault does not hold. ' +
            'Remove unused resident credentials from the key (ykman fido credentials list / delete) or re-register it.',
        );
      }
      const master = unwrapWithPrf(used, result.secret);
      return this.remember(account, master, wraps);
    }

    const pin = await this.promptPin(account, 'Unlock vault');
    if (pin !== undefined && pinWrap !== undefined) {
      const master = unwrapWithPin(pinWrap, account.accountId, pin);
      await this.savePin(account, pin);
      return this.remember(account, master, wraps);
    }
    return undefined;
  }

  /** Decrypt a stored vault with a previously obtained key. */
  decrypt(vaultContent: string, key: VaultKey): unknown {
    return key.version === 1
      ? decryptJson(vaultContent, key.passphrase)
      : decryptJsonWithMasterKey(vaultContent, key.masterKey);
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
      : encryptJsonWrapped(payload, key.masterKey, key.wraps, account, shares);
  }

  private remember(account: StoredAccount, masterKey: Buffer, wraps: KeyWrap[]): VaultKey {
    const key: VaultKey = { version: 2, masterKey, wraps };
    this.cache.set(account.accountId, key);
    // Cache the original; hand back a detached copy, so a later lock() wiping the cached
    // Buffer cannot zero the key a caller is still using. See detachVaultKey.
    return detachVaultKey(key);
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
