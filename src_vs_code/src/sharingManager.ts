import * as vscode from 'vscode';
import { ShareItem, OwnedShare, StoredAccount, TeamMember, teamOthers } from './types';
import { TransportFactory } from './transportFactory';
import { StorageManager } from './storageManager';
import { TeamFailure } from './teamDiagnosis';
import { ServerTransport } from './serverTransport';
import { ShareForm } from './shareFormat';
import { VaultTransport } from './vaultTransport';

/**
 * Team discovery and pending shares, per account, over whatever transport
 * each account is configured with (NAS folder or vault server). The
 * location is the source of truth; this class caches the last scan.
 */
export class SharingManager {
  /**
   * accountId -> why that account's team came back empty, when it did.
   *
   * <p>Read by the UI so an empty team can say WHICH kind of empty it is. Both
   * this class and the transport used to answer the question the same way for a
   * refusal and for a location nobody has synced to yet.</p>
   */
  readonly teamFailures = new Map<string, TeamFailure>();

  /** accountId -> the people found at that account's location. */
  private teamByAccount = new Map<string, TeamMember[]>();
  /** Pending shares addressed to any of MY accounts. */
  ownShares: OwnedShare[] = [];

  constructor(
    private readonly storage: StorageManager,
    private readonly transports: TransportFactory,
    private readonly onChanged: () => void,
  ) {}

  /** Everyone discovered anywhere (deduped) — used for empty-state checks. */
  get team(): TeamMember[] {
    const seen = new Map<string, TeamMember>();
    for (const members of this.teamByAccount.values()) {
      for (const member of members) {
        seen.set(`${member.location}|${member.account.accountId}`, member);
      }
    }
    return [...seen.values()];
  }

  /**
   * The team of ONE own account: the people sharing its location, minus that account
   * itself. Filtered here rather than in each transport, because only this layer knows
   * WHOSE team is being asked for — a transport returns every owner it can see.
   */
  teamFor(account: StoredAccount): TeamMember[] {
    return teamOthers(account, this.teamByAccount.get(account.accountId) ?? []);
  }

  /** Rescan every account's location: team + what is shared with me. */
  // eslint-disable-next-line complexity
  async reload(): Promise<void> {
    const accounts = this.storage.getAccounts();
    const teamByAccount = new Map<string, TeamMember[]>();
    const ownShares: OwnedShare[] = [];
    for (const account of accounts) {
      const transport = this.transports.forAccount(account);
      if (transport === undefined) {
        continue;
      }
      this.teamFailures.delete(account.accountId);
      try {
        const members = await transport.listTeam(accounts);
        teamByAccount.set(
          account.accountId,
          [...members].sort((a, b) => a.account.email.localeCompare(b.account.email)),
        );
        const status =
          transport instanceof ServerTransport ? transport.lastTeamStatus : undefined;
        if (members.length === 0 && status !== undefined) {
          this.teamFailures.set(account.accountId, {
            status,
            hasApiScope: this.hasApiScope(),
            provider: account.provider,
          });
        }
      } catch {
        teamByAccount.set(account.accountId, []);
        this.teamFailures.set(account.accountId, {
          hasApiScope: this.hasApiScope(),
          provider: account.provider,
        });
      }
      try {
        ownShares.push(...(await transport.listShares(account)));
      } catch {
        // location unreachable / token expired — sync reports it separately
      }
    }
    ownShares.sort((a, b) => b.item.createdAt - a.item.createdAt);
    this.teamByAccount = teamByAccount;
    this.ownShares = ownShares;
    this.onChanged();
  }

  /**
   * Whether the Microsoft API scope is configured — the one setting whose absence
   * guarantees a refusal, so the diagnosis must know about it before blaming it.
   */
  private hasApiScope(): boolean {
    return (
      vscode.workspace.getConfiguration('credSshManager').get<string>('microsoftApiScope', '').trim()
        .length > 0
    );
  }

  /**
   * Which binding form a share leaving this account must be sealed in.
   *
   * <p>A property of the TRANSPORT, and knowable only here: a folder or a git remote writes the
   * item verbatim and takes the bound form, while a vault server rewrites the sender and the time
   * the bound form's AAD covers — and only carries the `format` that says so from contract 2.
   * Below that, unbound is the only form that can be opened at the other end.</p>
   */
  shareFormFor(sender: StoredAccount): ShareForm {
    const transport = this.transportFor(sender);
    if (!(transport instanceof ServerTransport)) {
      return 'bound';
    }
    return transport.carriesShareFormat ? 'server' : 'legacy';
  }

  /**
   * Whether a pending share arrived somewhere that stamps its sender — the one thing the item
   * itself cannot say, and what decides whether its label may be believed.
   *
   * <p>Asked of the TRANSPORT, never of the location string. `isServerLocation` is a test for
   * `http(s)://` and a git remote is routinely `https://host/team/vault.git`, so answering from
   * the URL would call a git share server-stamped — and a git share is written verbatim by
   * whoever can push, which is exactly the case the stamp is supposed to exclude. The factory
   * asks git first, so its answer is the one the share actually travelled through.</p>
   */
  serverStamped(share: OwnedShare): boolean {
    const account = this.storage.getAccount(share.accountId);
    if (account === undefined) {
      return false;
    }
    return this.transportFor(account) instanceof ServerTransport;
  }

  /**
   * The transport for an account, or nothing — never a throw.
   *
   * <p>`forAccount` refuses a location it cannot build (a git remote in a build without git
   * sync). That is the right answer for a caller about to USE it, and the wrong one for the two
   * questions above, which are asked while deciding how to seal and how much to believe: a
   * throw there would abort a delivery before the error that explains it, and would make
   * "is this a server" answerable only by exception.</p>
   */
  private transportFor(account: StoredAccount): VaultTransport | undefined {
    try {
      return this.transports.forAccount(account);
    } catch {
      return undefined;
    }
  }

  /** Deliver share items, authorized as the sending account. */
  async appendShares(
    sender: StoredAccount,
    recipient: TeamMember,
    items: ShareItem[],
  ): Promise<void> {
    const transport = this.transports.forAccount(sender);
    if (transport === undefined) {
      throw new Error(`No sync location configured for ${sender.email}.`);
    }
    await transport.appendShares(sender, recipient, items);
  }

  /** Remove one pending share of mine (after accept or decline). */
  async removeOwnShare(share: OwnedShare): Promise<void> {
    const account = this.storage.getAccount(share.accountId);
    if (account === undefined) {
      return;
    }
    const transport = this.transports.forAccount(account);
    if (transport === undefined) {
      return;
    }
    await transport.removeShare(account, share);
  }

}
