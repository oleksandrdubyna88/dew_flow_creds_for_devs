import { parseGitRemote } from './gitRemote';
import { OwnedShare, ShareItem, StoredAccount, TeamMember } from './types';

/**
 * Where an account's vault lives. Two implementations:
 *  - {@link FolderTransport}: a NAS/SMB folder of `vault_*.enc` files, with
 *    pending shares carried in each file's plaintext envelope array.
 *  - {@link ServerTransport}: the Cred Vault Server (authenticated HTTPS),
 *    which keeps vault blobs and per-recipient share inboxes separately.
 *  - {@link GitTransport}: a private git repository holding the same
 *    `vault_*.enc` files, with the clone as a cache and a rejected push
 *    standing in for the server's `412`.
 *
 * A location string decides which one, and git is recognised FIRST because a
 * `https://…/vault.git` URL is otherwise indistinguishable from a server.
 */
export interface VaultTransport {
  /** Human-readable location (folder path or server URL). */
  readonly location: string;
  readonly kind: 'folder' | 'server' | 'git';
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

  /**
   * Remove one of MY pending shares, saying which way it went.
   *
   * <p>The outcome is for the corporate event log, which otherwise records only that a share left
   * an inbox and cannot say whether the secret was taken or refused. It is OPTIONAL because a
   * folder and a git remote have no server to tell, and because a client that omits it must
   * degrade exactly as every released one does — the server records "unknown" and deletes the
   * share.</p>
   */
  removeShare(actingAs: StoredAccount, share: OwnedShare, outcome?: ShareOutcome): Promise<void>;

  /** Permanently delete MY vault (and inbox) at this location. */
  deleteVault(account: StoredAccount): Promise<void>;
}

/**
 * What a recipient did with a share.
 *
 * <p>Two values, and they are the SERVER's two: `OrgEventsEndpoints`' `ShareOutcome` maps exactly
 * these strings to `share.accepted` and `share.declined`, and anything else to `share.unknown`.
 * Two implementations of one contract, so the strings are asserted against the server's own `.http`
 * file rather than agreed by eye — see `eventQuery.test.ts`.</p>
 */
export type ShareOutcome = 'accepted' | 'declined';

/**
 * Whether a location is a VAULT SERVER — the one road every corporate client takes.
 *
 * <p>`isServerLocation` alone is not that road, and the gap was real: an `https://` git remote
 * matches it, so a vault synced to `https://git.example.com/team/vault.git` would have been handed a
 * corporate client that sends `Authorization: Bearer <token>` to a git host. Four factories asked
 * the same half-question — the shape the security rule calls "a measure applied at SOME of its
 * sites" — so the question is asked once, here, where it is a unit test.</p>
 */
export function isCorpServerLocation(location: string): boolean {
  return isServerLocation(location) && parseGitRemote(location) === undefined;
}

export function isServerLocation(location: string): boolean {
  return /^https?:\/\//i.test(location.trim());
}
