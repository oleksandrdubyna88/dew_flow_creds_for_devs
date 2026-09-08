/**
 * A promise, bounded — `undefined` when the wait runs out.
 *
 * <p>Extracted from `credsAgentServer`, which had it private and is now one of two callers.
 * The other is the locked-vault offer, where the wait is a keychain read: a keychain that
 * hangs would otherwise hold back the notification entirely, and the account has already been
 * deduped for the session, so nothing would ask again until the window is reloaded.</p>
 *
 * <p>The timer is unref'd, so a pending wait never holds a process open. `promise` must not
 * reject — nothing here catches, and a rejection would escape as an unhandled one; give it a
 * promise that resolves its own failures, as both callers do.</p>
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), ms);
    (timer as unknown as { unref?: () => void }).unref?.();
    void promise.then((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}
