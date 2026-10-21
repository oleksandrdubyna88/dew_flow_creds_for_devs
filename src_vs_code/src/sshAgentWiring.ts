import * as vscode from 'vscode';
import { SshAgentManager } from './sshAgentManager';
import type { StorageManager } from './storageManager';
import type { VaultKeys } from './vaultKeys';

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
  readonly vaultKeys: Pick<VaultKeys, 'noteUserActivity' | 'onDidLock'>;
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
 * The SSH agent: keys served from memory, asked before signing, `SSH_AUTH_SOCK` injected into new
 * terminals. Nothing starts until a key is actually loaded.
 */
export function wireSshAgent(deps: SshAgentWiringDeps): SshAgentManager {
  const { context, storage, storageDir, envCollection, vaultKeys, onAddress } = deps;
  const sshAgent = new SshAgentManager(storage, storageDir, envCollection, () => vaultKeys.noteUserActivity(), onAddress);
  context.subscriptions.push(sshAgent, connectAgentToLock(vaultKeys, sshAgent));
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
