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

/**
 * What one account came to.
 *
 * <p>A verdict rather than a side effect: this used to persist the notice map itself, once per
 * account, which meant a hundred healthy accounts wrote `globalState` a hundred times on every
 * policy fetch to say nothing had changed. Deciding here and writing once is the same answer for
 * less.</p>
 */
export interface BackupCheck {
  /** True when this deployment is fine, so its window may be forgotten. */
  readonly healthy: boolean;
  /** The notice to show, when there is one that is not deduped away. */
  readonly notice?: BackupNotice;
  /**
   * The status this check READ, for the caller that draws it. Absent = the read said nothing.
   *
   * <p>Added for the tree's Backup row (2026-09-12): this loop already fetches exactly that
   * document once per readiness cycle for every admin account, and then threw it away. Handing it
   * back is a field; a second poll would be a second timer to get wrong about backoff, about sleep
   * and about an editor with four windows open — which this module's header argues against.</p>
   */
  readonly status?: BackupStatus;
}

/**
 * A member, an account with no server, or a read that FAILED.
 *
 * <p>Not healthy — which matters: a failed read must not clear a window either. It says nothing at
 * all, and nothing is exactly what should change.</p>
 */
const SAYS_NOTHING: BackupCheck = { healthy: false };

/** What the watch needs from the editor and the network. */
export interface BackupWatchHost {
  /** The backup client for this account's server — nothing for a folder or a git remote. */
  readonly clientFor: (account: StoredAccount) => Pick<OrgBackupClient, 'readStatus'> | undefined;
  /** The windows, as last persisted. Read fresh each time: another window may have shown one. */
  readonly shown: () => NoticeMemory;
  /** Persist the windows. `globalState`, so a reload does not nag on every startup. */
  readonly remember: (next: NoticeMemory) => PromiseLike<unknown>;
  readonly show: (message: string) => void;
  /**
   * Where a status that ARRIVED should be written down, for a caller that draws it.
   *
   * <p>Optional, so every host built before this existed is unchanged. The tree provider fills it
   * with its own cache; nothing here decides what that cache is for.</p>
   */
  readonly record?: (accountId: string, status: BackupStatus) => void;
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
): Promise<BackupCheck> {
  const status = await statusOf(host, account, policy);
  if (status === undefined) {
    return SAYS_NOTHING;
  }
  // HEALTH first, and the notice second — they answer different questions and folding them cost a
  // real defect. A healthy deployment's window is FORGOTTEN, so the next failure is heard at once
  // rather than an hour later, measured from trouble that is already over. A deployment that is NOT
  // healthy but was interrupted about recently also yields no notice, and its window must SURVIVE:
  // clearing it there would have made the very next cycle nag again, which is the nag-every-cycle
  // this whole module exists to avoid.
  return healthOf(status) === 'healthy'
    ? { healthy: true, status }
    : {
      healthy: false,
      status,
      notice: backupNotice(account.accountId, account.email, status, host.shown(), host.now()),
    };
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
  const entries = [...accounts];
  // TOGETHER, not one after another. This runs inside the readiness cycle that repaints the tree,
  // and every read carries its own five-second deadline — so serially, one unreachable server per
  // account delays the repaint by five seconds each. The set is the corporate accounts signed in on
  // this machine, which is single digits; a limit would be machinery for a number that is not there.
  const checked = await Promise.all(
    entries.map(([account, policy]) => checkOneBackup(host, account, policy)),
  );
  record(host, entries, checked);
  const notices = checked.map((check) => check.notice).filter(isNotice);
  const next = settle(host, entries, checked, notices);
  if (next !== host.shown()) {
    // One write per cycle, and only when something actually moved.
    await host.remember(next);
  }
  if (notices.length > 0) {
    host.show(joinNotices(notices));
  }
}

function isNotice(notice: BackupNotice | undefined): notice is BackupNotice {
  return notice !== undefined;
}

/**
 * Hand every status that ARRIVED to whoever asked to be told, keyed by account.
 *
 * <p>The pairing is already here: `entries` and `checked` are parallel, because `settle` below
 * needs them that way. A read that said nothing records nothing — the row it feeds keeps whatever
 * it had, which is the same rule the notices follow.</p>
 */
function record(
  host: BackupWatchHost,
  entries: readonly (readonly [StoredAccount, CorpPolicyState])[],
  checked: readonly BackupCheck[],
): void {
  entries.forEach(([account], at) => {
    const status = checked[at].status;
    if (status !== undefined) {
      host.record?.(account.accountId, status);
    }
  });
}

/** The windows after this cycle: healthy accounts forgotten, interrupted ones stamped. */
function settle(
  host: BackupWatchHost,
  entries: readonly (readonly [StoredAccount, CorpPolicyState])[],
  checked: readonly BackupCheck[],
  notices: readonly BackupNotice[],
): NoticeMemory {
  let memory = host.shown();
  entries.forEach(([account], at) => {
    if (checked[at].healthy) {
      memory = forget(memory, account.accountId);
    }
  });
  const interrupted = entries
    .filter((_entry, at) => checked[at].notice !== undefined)
    .map(([account]) => account.accountId);
  return notices.length === 0 ? memory : remember(memory, interrupted, host.now());
}
