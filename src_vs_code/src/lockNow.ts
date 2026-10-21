import { lockNotice } from './formPanels';
import type { VaultKeys } from './vaultKeys';

/**
 * Lock the vaults, and everything that must follow from it — out of `extension.ts` (#197, E2.1 review).
 *
 * <p>The idle timer and the *Lock Vaults* command differ only in what they say afterwards, so both go through
 * the one function this builds. It was an inline closure in `activate`, which a test could not drive: a
 * refactor that stopped calling `vaultKeys.lock()` there would have left every lock a notice and nothing else —
 * no window ended, no key wiped — with every test green. Here the four dependencies are plain values, and the
 * guarantee ("it locks, it closes the forms, it repaints, it says so") is a test.</p>
 *
 * <p>Not every road to a lock goes through here: a corporate deactivation calls `vaultKeys.lock()` directly
 * (`evictAndLock`), and what must follow from THAT is hooked to the lock event (`VaultKeys.onDidLock`), not to
 * this function.</p>
 */
export interface LockNowDeps {
  readonly vaultKeys: Pick<VaultKeys, 'lock'>;
  /** Closes the open forms, which hold a plaintext secret in their webview; answers how many it closed. */
  readonly closeForms: () => number;
  /** Recomputes what each account can do now that the vault is locked, and repaints. */
  readonly refreshReadiness: () => Promise<unknown>;
  /** Tells the person (an information message). */
  readonly say: (message: string) => void;
}

export function makeLockNow(deps: LockNowDeps): (notice: string) => void {
  return (notice) => {
    deps.vaultKeys.lock();
    const closedForms = deps.closeForms();
    void deps.refreshReadiness();
    deps.say(lockNotice(notice, closedForms));
  };
}
