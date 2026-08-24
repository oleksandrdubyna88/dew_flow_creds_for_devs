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

  /**
   * When the PERSON last used the vault, in epoch ms. Undefined = never used here.
   *
   * <p>Deliberately not "when the key was last used". Auto-lock first measured that, and
   * auto-sync touches the key every five minutes — so with auto-sync on the window never
   * elapsed and auto-lock never fired. Two features quietly cancelling each other is
   * worse than either being absent, because the setting still says 60.</p>
   */
  private lastActivity: number | undefined;

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

  /**
   * Whether opening the vault must involve a GESTURE — a key touch, or the PIN typed —
   * rather than a secret already sitting on this machine.
   *
   * <p>`allowsSilentUnlock` covers the caller that cannot ask. This covers the one that
   * can, and it is a separate question: *Unlock Vault* could ask, so it counted as
   * deliberate, but it never actually did — the stored Sync PIN opened the vault before
   * the security-key branch was reached. The vault then announced itself unlocked with
   * nobody having proved anything, which makes Lock decorative on exactly the unattended
   * machine it exists for.</p>
   *
   * <p>Only the LOCK demands this. Reading a password from an unlocked vault must not
   * turn into a key touch.</p>
   */
  requiresPresence(): boolean {
    return this.locked;
  }

  /**
   * A person opened the vault. Clears the lock — somebody got in deliberately — and
   * restarts the idle window.
   */
  noteUnlocked(nowMs: number): void {
    this.locked = false;
    this.lastActivity = nowMs;
  }

  /**
   * A person used the vault without unlocking it: read a password, opened an entry,
   * connected somewhere. Postpones auto-lock without touching locked-ness.
   */
  noteUserActivity(nowMs: number): void {
    this.lastActivity = nowMs;
  }

  /**
   * Background work opened the vault. Deliberately records NOTHING: a sync cycle running
   * on a timer is not the user being present, and treating it as presence is exactly
   * what stopped auto-lock from ever firing.
   */
  noteBackgroundUnlock(_nowMs: number): void {
    // Intentionally empty. Named rather than omitted so the caller reads as a decision.
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
    if (idleMinutes <= 0 || this.locked || this.lastActivity === undefined) {
      return false;
    }
    const elapsed = nowMs - this.lastActivity;
    return elapsed >= idleMinutes * 60_000;
  }
}
