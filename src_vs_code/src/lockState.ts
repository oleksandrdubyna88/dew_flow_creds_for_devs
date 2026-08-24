/**
 * Whether the vault is locked, and when it should lock itself.
 *
 * <p>Pure and `vscode`-free on purpose: this is the part with the rules, and the rules
 * are what went wrong. *Lock Vaults* used to clear the cached master key and nothing
 * else — so the next automatic sync silently re-opened the vault with the Sync PIN
 * stored in the OS keychain, five minutes later by default. The command told the user
 * the next sync "will ask for the PIN or a key touch"; it did not ask.</p>
 *
 * <p>So a lock is not "forget the key". It is "refuse the stored secret until a person
 * says otherwise" — which is the only reading under which the word means anything.</p>
 */
export class LockState {
  private locked = false;

  /** When the vault was last opened, in epoch ms. Undefined = never opened here. */
  private lastUnlocked: number | undefined;

  /** Lock now. Idempotent — the auto-lock timer and the command both call it. */
  lock(): void {
    this.locked = true;
  }

  isLocked(): boolean {
    return this.locked;
  }

  /**
   * Whether a caller that CANNOT prompt — the sync timer, the debounce after an edit —
   * may open the vault with a secret already on this machine.
   *
   * <p>This is the single line that makes the lock real. Everything else about locking
   * is bookkeeping.</p>
   */
  allowsSilentUnlock(): boolean {
    return !this.locked;
  }

  /** Record that the vault was opened. Clears the lock: a person got in, so it is open. */
  noteUnlocked(nowMs: number): void {
    this.locked = false;
    this.lastUnlocked = nowMs;
  }

  /**
   * Whether the idle window has elapsed and the vault should lock itself.
   *
   * <p>Never true for a vault that was never opened (there is no key to drop), for one
   * already locked (nothing to do, and a second notification would be noise), or when
   * the feature is switched off with `0`.</p>
   *
   * <p>A "now" earlier than the last use means the clock moved backwards. Elapsed time
   * is then negative rather than enormous, so this reports "not due" instead of locking
   * the moment a machine resyncs its clock.</p>
   */
  dueForAutoLock(nowMs: number, idleMinutes: number): boolean {
    if (idleMinutes <= 0 || this.locked || this.lastUnlocked === undefined) {
      return false;
    }
    const elapsed = nowMs - this.lastUnlocked;
    return elapsed >= idleMinutes * 60_000;
  }
}
