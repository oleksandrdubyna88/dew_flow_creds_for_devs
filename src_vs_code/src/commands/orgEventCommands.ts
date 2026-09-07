import * as vscode from 'vscode';
import { accountFromTargetOrPick } from '../accountPick';
import { showOrgEventLog } from '../orgEventsPanel';
import { StorageManager } from '../storageManager';
import { TransportFactory } from '../transportFactory';

/**
 * The one command of epic 4's last story: open the corporate event log for an account.
 *
 * <p>Registered from `activate` like every other family, with an explicit host of the locals it
 * uses. The command is offered on a corporate account row, and it opens a tab rather than a
 * QuickPick because the answer is a table somebody reads, compares and scrolls — the one place the
 * umbrella's decision 14 says is an editor tab rather than the tree.</p>
 */
export interface OrgEventCommandsHost {
  readonly register: (command: string, handler: (...args: unknown[]) => unknown) => void;
  readonly storage: StorageManager;
  /** Where the events client for an account's server comes from — nothing for a folder or a git remote. */
  readonly transports: TransportFactory;
}

export function registerOrgEventCommands(host: OrgEventCommandsHost): void {
  host.register('credSshManager.orgEventLog', (target) => runOrgEventLog(host, target));
}

async function runOrgEventLog(host: OrgEventCommandsHost, target: unknown): Promise<void> {
  const account = await accountFromTargetOrPick(target, host.storage, 'Whose event log?');
  if (account === undefined) {
    return;
  }
  const client = host.transports.orgEventsFor(account);
  if (client === undefined) {
    // A folder or a git remote has no server, so there is nothing that could have recorded this.
    // Said plainly rather than opening an empty tab somebody would read as "nothing ever happened".
    void vscode.window.showInformationMessage(
      `${account.email} does not sync to a vault server, so there is no event log for it.`,
    );
    return;
  }
  showOrgEventLog(client, account);
}
