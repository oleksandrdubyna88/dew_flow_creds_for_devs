import { OwnedShare, ShareItem, StoredAccount, TeamMember } from './types';

/**
 * Where an account's vault lives. Two implementations:
 *  - {@link FolderTransport}: a NAS/SMB folder of `vault_*.enc` files, with
 *    pending shares carried in each file's plaintext envelope array.
 *  - {@link ServerTransport}: the Cred Vault Server (authenticated HTTPS),
 *    which keeps vault blobs and per-recipient share inboxes separately.
 *
 * A location string decides which one: `http(s)://…` → server, else folder.
 */
export interface VaultTransport {
  /** Human-readable location (folder path or server URL). */
  readonly location: string;
  readonly kind: 'folder' | 'server';
  /**
   * True when pending shares travel INSIDE the vault envelope (folder
   * transport), so every rewrite must carry them along. False when the
   * location stores share inboxes separately (server transport).
   */
  readonly embedsShares: boolean;

  /** Raw vault file content, or undefined when it does not exist yet. */
  readVault(account: StoredAccount): Promise<string | undefined>;

  /**
   * Store the vault. `pendingShares` are the plaintext share items that must
   * survive the rewrite (folder transport embeds them; the server keeps its
   * own inbox and ignores them).
   */
  writeVault(
    account: StoredAccount,
    content: string,
    pendingShares: ShareItem[],
  ): Promise<void>;

  /** Everyone discoverable at this location (self included). */
  listTeam(ownAccounts: readonly StoredAccount[]): Promise<TeamMember[]>;

  /** Pending shares addressed to `account`. */
  listShares(account: StoredAccount): Promise<OwnedShare[]>;

  /**
   * Deliver share items to a recipient discovered at this location,
   * authorized as `actingAs` (the sender's own account).
   */
  appendShares(
    actingAs: StoredAccount,
    recipient: TeamMember,
    items: ShareItem[],
  ): Promise<void>;

  /** Remove one of MY pending shares (after accept or decline). */
  removeShare(actingAs: StoredAccount, share: OwnedShare): Promise<void>;

  /** Permanently delete MY vault (and inbox) at this location. */
  deleteVault(account: StoredAccount): Promise<void>;
}

export function isServerLocation(location: string): boolean {
  return /^https?:\/\//i.test(location.trim());
}
