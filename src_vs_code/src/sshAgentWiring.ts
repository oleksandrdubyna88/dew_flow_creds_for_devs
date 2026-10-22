import * as vscode from 'vscode';
import { SshAgentManager } from './sshAgentManager';
import type { StorageManager } from './storageManager';
import type { CredTreeDataProvider } from './treeDataProvider';
import { signWindowLabel } from './treeRowText';
import type { VaultKeys } from './vaultKeys';
import { autoLockMinutesSetting } from './autoLockSetting';
import { autoLockIsOn } from './agentConsent';

/**
 * The SSH agent's wiring, out of `extension.ts` (#197, E2.1): the manager, the notice about the keys it
 * serves, and the link from every vault lock to every signing window.
 *
 * <p>Its own module for two reasons. `extension.ts` is frozen at its size by the ratchet, so every line the
 * agent grows there is a line something else has to give back; and a test can drive `wireSshAgent(deps)`
 * itself — the wiring, not only the helpers it calls — which is the only way a deleted subscription shows up
 * as a red test instead of an open window after a lock.</p>
 */

/** What `wireSshAgent` needs from the extension. Narrow on purpose: a test passes plain stubs. */
export interface SshAgentWiringDeps {
  readonly context: Pick<vscode.ExtensionContext, 'subscriptions'>;
  readonly storage: StorageManager;
  readonly storageDir: string;
  readonly envCollection: vscode.GlobalEnvironmentVariableCollection;
  readonly vaultKeys: Pick<VaultKeys, 'noteUserActivity' | 'onDidLock' | 'isLocked' | 'dueForAutoLock'>;
  /** The tree: told to repaint when a window opens or ends, and given the text a key's row shows (E2.2). */
  readonly provider: Pick<CredTreeDataProvider, 'refresh' | 'signWindowLabel'>;
  /**
   * Called on both edges of the agent's life with its address, or `undefined` once it stops.
   *
   * <p>The caller's lambda reads `wslRelay`, a `const` declared LATER in `activate`. That is safe only
   * because no address is published during construction: `load()` awaits the vault read before
   * `ensureStarted` (`sshAgentManager.ts`), and `wireSshAgent` returns before any key has loaded.</p>
   */
  readonly onAddress: (socketPath: string | undefined) => void;
}

/**
 * Every lock of the vaults ends every SSH signing window.
 *
 * <p>Hooked to the event, not to a caller: `VaultKeys.lock()` fires `onDidLock` as its last statement, so
 * the idle timer, *Lock Vaults* and a corporate deactivation (which calls `lock()` directly and skips the
 * command's own steps) all arrive here. A key stays loaded — the next signature simply asks again.</p>
 */
export function connectAgentToLock(
  vaultKeys: Pick<VaultKeys, 'onDidLock'>,
  sshAgent: Pick<SshAgentManager, 'endAllWindows'>,
): vscode.Disposable {
  return vaultKeys.onDidLock(() => sshAgent.endAllWindows('the vaults were locked'));
}

/**
 * The key's row and the agent's windows (#197, E2.2): the row shows an open window as `signs without asking until
 * 12:10`, and is told to repaint whenever the book of windows changes — a grant, an expiry, a lock, *Ask for Every
 * Use Again*, an unload. Two assignments, both under test through `wireSshAgent`: a deleted one is a tree that
 * keeps claiming a window after it ended, or never claims one at all.
 */
export function connectAgentToTree(
  provider: Pick<CredTreeDataProvider, 'refresh' | 'signWindowLabel'>,
  sshAgent: Pick<SshAgentManager, 'windowsFor' | 'onWindowsChanged'>,
): void {
  sshAgent.onWindowsChanged = () => provider.refresh();
  provider.signWindowLabel = (accountId, nodeId) =>
    signWindowLabel(sshAgent.windowsFor(accountId, nodeId), Date.now(), -new Date().getTimezoneOffset());
}

/**
 * What a long login window is bounded by (#197, E3.3): the lock state, how overdue the idle auto-lock is and what it
 * is set to. Three assignments the manager asks at EVERY check — it fails closed without them, so a deleted one is a
 * prompt that never offers *Allow longer…*, never a window that outlives its lock. Returns the subscription to the
 * setting: turning idle auto-lock off (`!autoLockIsOn`: 0, a negative value or anything that is not a number) ends
 * every login window that is open — the same reading `scopesFor` and the offer use.
 */
export function connectAgentToSettings(
  vaultKeys: Pick<VaultKeys, 'isLocked' | 'dueForAutoLock'>,
  sshAgent: Pick<SshAgentManager, 'lockedNow' | 'autoLockOverdue' | 'autoLockMinutes' | 'endLoginWindows'>,
): vscode.Disposable {
  sshAgent.lockedNow = () => vaultKeys.isLocked();
  sshAgent.autoLockOverdue = () => vaultKeys.dueForAutoLock(Date.now(), autoLockMinutesSetting());
  sshAgent.autoLockMinutes = autoLockMinutesSetting;
  return vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('credSshManager.autoLockMinutes') && !autoLockIsOn(autoLockMinutesSetting())) {
      sshAgent.endLoginWindows('idle auto-lock was turned off');
    }
  });
}

/**
 * The SSH agent: keys served from memory, asked before signing, `SSH_AUTH_SOCK` injected into new
 * terminals. Nothing starts until a key is actually loaded.
 */
export function wireSshAgent(deps: SshAgentWiringDeps): SshAgentManager {
  const { context, storage, storageDir, envCollection, vaultKeys, provider, onAddress } = deps;
  const sshAgent = new SshAgentManager(storage, storageDir, envCollection, () => vaultKeys.noteUserActivity(), onAddress);
  context.subscriptions.push(sshAgent, connectAgentToLock(vaultKeys, sshAgent), connectAgentToSettings(vaultKeys, sshAgent));
  connectAgentToTree(provider, sshAgent);
  void sshAgent.loadMarked().then(tellKeysServed);
  return sshAgent;
}

/** One line at startup when keys are already served — silent when there are none. */
function tellKeysServed(count: number): void {
  if (count > 0) {
    void vscode.window.showInformationMessage(
      `${count} SSH key(s) are served by the CredsForDevs agent. A signature asks first; the answer covers it once, or every use for 10 minutes; see "CredsForDevs: SSH Agent" for the record.`,
    );
  }
}
