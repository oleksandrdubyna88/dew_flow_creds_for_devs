import * as vscode from 'vscode';
import { accountFromTargetOrPick } from '../accountPick';
import { showOrgBackup } from '../orgBackupPanel';
import { StorageManager } from '../storageManager';
import { TransportFactory } from '../transportFactory';
import { CredTreeDataProvider } from '../treeDataProvider';

/**
 * The one command of epic 5's last story: open the server backup for an account.
 *
 * <p>Registered from `activate` like every other family, with an explicit host of the locals it
 * uses — the shape `orgEventCommands.ts` established. It opens a TAB rather than a QuickPick because
 * the answer is a status, a schedule and a table of destinations somebody reads and compares, which
 * the umbrella's decision 14 puts in an editor tab rather than in the tree.</p>
 *
 * <p>Offered on a corporate ADMIN row only. A developer cannot see the backup and has no reason to:
 * every route behind this is `RequireAdmin`, so the alternative is a menu entry that always answers
 * 403.</p>
 */
export interface OrgBackupCommandsHost {
  readonly register: (command: string, handler: (...args: unknown[]) => unknown) => void;
  readonly storage: StorageManager;
  /** Where the backup client for an account's server comes from — nothing for a folder or a git remote. */
  readonly transports: TransportFactory;
  /**
   * The tree, for the Backup row: every status the tab reads lands in the same cache the backup
   * watch fills, and the tree repaints — so the row agrees with the tab the moment it acts rather
   * than on the next readiness tick (#134).
   */
  readonly provider: Pick<CredTreeDataProvider, 'server' | 'refresh'>;
}

export function registerOrgBackupCommands(host: OrgBackupCommandsHost): void {
  host.register('credSshManager.orgBackup', (target) => runOrgBackup(host, target));
}

async function runOrgBackup(host: OrgBackupCommandsHost, target: unknown): Promise<void> {
  const account = await accountFromTargetOrPick(target, host.storage, 'Which server’s backup?');
  if (account === undefined) {
    return;
  }
  const client = host.transports.orgBackupFor(account);
  if (client === undefined) {
    // A folder or a git remote has no server, so there is nothing that could take a backup of one.
    // Said plainly rather than opening a tab whose every button would fail.
    void vscode.window.showInformationMessage(
      `${account.email} does not sync to a vault server, so there is no server backup for it. `
      + 'Its own vault is backed up by the local snapshot schedule.',
    );
    return;
  }
  showOrgBackup(client, account, (status) => {
    // The same envelope the backup watch writes (corpPolicyWiring.ts), so the next tick and this
    // agree on what the row holds; the status came from readStatus, never from a guess.
    host.provider.server.backup.set(account.accountId, { value: status, at: Date.now() });
    host.provider.refresh();
  });
}
