import {
  BackupNotice,
  NoticeMemory,
  backupNotice,
  forget,
  healthOf,
  joinNotices,
  remember,
} from './backupNotice';
import { CorpPolicyState } from './corpPolicy';
import { BackupStatus, OrgBackupClient } from './orgBackupClient';
import { StoredAccount } from './types';

/**
 * The nag that rides epic 1's policy fetch: is this deployment actually backed up?
 *
 * <p>`vscode`-free, so every rule below is a unit test rather than something observed by leaving an
 * editor open for a day. The `vscode` layer supplies the three things it cannot know — the client,
 * where the windows are persisted, and how to put a sentence on screen.</p>
 *
 * <p><b>It rides the policy fetch rather than owning a timer.</b> A second timer is a second thing
 * to get wrong about backoff, about sleep, and about an editor with four windows open; the policy
 * loop already runs on the cadence this needs and already knows when a read SUCCEEDED, which is the
 * only moment this may change its mind.</p>
 */

/** What the watch needs from the editor and the network. */
export interface BackupWatchHost {
  /** The backup client for this account's server — nothing for a folder or a git remote. */
  readonly clientFor: (account: StoredAccount) => Pick<OrgBackupClient, 'readStatus'> | undefined;
  /** The windows, as last persisted. Read fresh each time: another window may have shown one. */
  readonly shown: () => NoticeMemory;
  /** Persist the windows. `globalState`, so a reload does not nag on every startup. */
  readonly remember: (next: NoticeMemory) => PromiseLike<unknown>;
  readonly show: (message: string) => void;
  readonly now: () => number;
}

/**
 * Check ONE account, and say what should be shown — nothing, most of the time.
 *
 * <p><b>Admins only.</b> Every backup route is `RequireAdmin`, so a member's poll would be refused
 * on every cycle and the only thing that refusal could do is put a red message in front of somebody
 * who cannot act on it. The same reading the roster fetch already makes.</p>
 *
 * <p><b>A failed read changes nothing.</b> Not the windows, not the belief, not the screen. A
 * network blip must not be able to produce a nag: a notice people learn to dismiss is the same as no
 * notice at all on the day it would have mattered. The unreachable server has its own surface — the
 * readiness cycle and the account row — and saying it twice would be two messages about one outage.</p>
 */
export async function checkOneBackup(
  host: BackupWatchHost,
  account: StoredAccount,
  policy: CorpPolicyState,
): Promise<BackupNotice | undefined> {
  const status = await statusOf(host, account, policy);
  if (status === undefined) {
    return undefined;
  }
  // HEALTH first, and the notice second — they answer different questions and folding them cost a
  // real defect. A deployment that is healthy forgets its window, so the next failure is heard at
  // once rather than an hour later, measured from trouble that is already over. A deployment that is
  // NOT healthy but was interrupted about recently returns nothing too, and its window must SURVIVE:
  // clearing it there would have made the very next cycle nag again, which is the nag-every-cycle
  // this whole module exists to avoid.
  if (healthOf(status) === 'healthy') {
    await host.remember(forget(host.shown(), account.accountId));
    return undefined;
  }
  return backupNotice(account.accountId, account.email, status, host.shown(), host.now());
}

/**
 * This account's backup status, or nothing — for any of the three reasons it may be nothing.
 *
 * <p>A member is not polled at all: every backup route is `RequireAdmin`, so their poll would be
 * refused on every cycle and the only thing that refusal could do is put a red message in front of
 * somebody who cannot act on it. An account with no server has nothing to poll. And a read that
 * FAILED is not an answer — it must change nothing.</p>
 */
async function statusOf(
  host: BackupWatchHost,
  account: StoredAccount,
  policy: CorpPolicyState,
): Promise<BackupStatus | undefined> {
  const client = policy.isAdmin ? host.clientFor(account) : undefined;
  return client === undefined
    ? undefined
    : client.readStatus(account).catch(() => undefined);
}

/**
 * Check every account that has something to say, and interrupt at most ONCE.
 *
 * <p>Three popups stack in the corner, cover each other's buttons, and each names an account on a
 * different line from the button about to be pressed; with four, the last is off-screen. The same
 * reading `lockedNotice.ts` makes, and the reason the notices are joined rather than shown.</p>
 */
export async function checkBackups(
  host: BackupWatchHost,
  accounts: ReadonlyMap<StoredAccount, CorpPolicyState>,
): Promise<void> {
  const notices: BackupNotice[] = [];
  const ids: string[] = [];
  for (const [account, policy] of accounts) {
    const notice = await checkOneBackup(host, account, policy);
    if (notice !== undefined) {
      notices.push(notice);
      ids.push(account.accountId);
    }
  }
  if (notices.length === 0) {
    return;
  }
  await host.remember(remember(host.shown(), ids, host.now()));
  host.show(joinNotices(notices));
}
