import * as vscode from 'vscode';
import { NoticeMemory } from './backupNotice';
import { BackupWatchHost } from './backupWatch';
import { CorpPolicyState, policyHeartbeatKey } from './corpPolicy';
import { OrgPolicyHost, policyHost } from './orgPolicyRefresh';
import { projectFolderReconciler, vscodeProjectFolderDeps } from './projectFolderWiring';
import { StorageManager } from './storageManager';
import { StoredAccount } from './types';
import { TransportFactory } from './transportFactory';

/**
 * The `vscode` wiring of the corporate policy loop: the caches, the heartbeat, and what a
 * SUCCESSFUL read sets in motion.
 *
 * <p>Out of `extension.ts` because that file is at its size ratchet and may only shrink — a feature
 * paid for by taking something else out of it is a feature that made an unrelated one harder to
 * find. It is also the honest home for this: every line here is "which concrete thing fills which
 * seam", and none of it decides anything, which is what `orgPolicyRefresh.ts` and `backupWatch.ts`
 * are for.</p>
 */

/** Where the backup nag's per-account windows are persisted. */
export const BACKUP_NOTICE_KEY = 'credSshManager.backupNoticeShown';

/** The caches the policy loop fills, as the tree provider happens to hold them. */
export type PolicyCaches = Pick<
  OrgPolicyHost, 'orgPolicy' | 'orgRoster' | 'orgProjects' | 'orgPolicyServer'
>;

/** The policy host, with epic 3's project-folder reconciliation hung off a successful read. */
export function corpPolicyWiring(
  context: vscode.ExtensionContext,
  caches: PolicyCaches,
  storage: StorageManager,
  sync: Parameters<typeof vscodeProjectFolderDeps>[1],
  transports: TransportFactory,
): OrgPolicyHost {
  return policyHost(
    caches,
    (account) => transports.orgMembersFor(account),
    (id, at) => context.globalState.update(policyHeartbeatKey(id), at),
    Date.now,
    projectFolderReconciler(vscodeProjectFolderDeps(
      storage, sync, transports, (m) => void vscode.window.showInformationMessage(m))),
  );
}

/**
 * The backup watch's host: where its windows live, and how it interrupts.
 *
 * <p><b>`globalState`, not memory.</b> An in-memory window resets on every reload, so a machine
 * whose editor is restarted twice a day would be nagged twice a day about something the person
 * already knows and cannot fix in a minute — which is how a notice becomes something people dismiss
 * without reading.</p>
 */
export function vscodeBackupWatch(
  context: vscode.ExtensionContext,
  transports: TransportFactory,
): BackupWatchHost {
  return {
    clientFor: (account) => transports.orgBackupFor(account),
    shown: () => context.globalState.get<NoticeMemory>(BACKUP_NOTICE_KEY) ?? {},
    remember: (next) => context.globalState.update(BACKUP_NOTICE_KEY, next),
    show: (message) => void vscode.window.showWarningMessage(message),
    now: Date.now,
  };
}

/**
 * The accounts whose policy this cycle actually holds, paired with it.
 *
 * <p>An account with no cached policy is one whose read has never succeeded, and the watch must not
 * guess at it: "we could not ask" and "you are not backed up" are different sentences, and only one
 * of them is worth interrupting somebody for.</p>
 */
export function policiedAccounts(
  accounts: readonly StoredAccount[],
  policies: ReadonlyMap<string, CorpPolicyState>,
): Map<StoredAccount, CorpPolicyState> {
  const paired = new Map<StoredAccount, CorpPolicyState>();
  for (const account of accounts) {
    const policy = policies.get(account.accountId);
    if (policy !== undefined) {
      paired.set(account, policy);
    }
  }
  return paired;
}
