/**
 * A promise, bounded — `undefined` when the wait runs out.
 *
 * <p>Extracted from `credsAgentServer`, which had it private and is now one of two callers.
 * The other is the locked-vault offer, where the wait is a keychain read: a keychain that
 * hangs would otherwise hold back the notification entirely, and the account has already been
 * deduped for the session, so nothing would ask again until the window is reloaded.</p>
 *
 * <p><b>The timer holds the event loop by default</b>, and that default is the whole lesson of
 * this file. Unrefd, it does not — so a caller awaiting it with nothing else running does not
 * get a late `undefined`, it gets no answer at all, because the process reaches an empty loop
 * and exits. That is invisible where this code came from (an HTTP server was always listening)
 * and it ended a CI test run mid-file the first time it was used anywhere else: four tests
 * after it reported `cancelledByParent`, with no failure to point at. Pass `unref` only when
 * something else is keeping the process alive on purpose.</p>
 *
 * <p>`promise` must not reject — nothing here catches, and a rejection would escape as an
 * unhandled one; give it a promise that resolves its own failures, as both callers do.</p>
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  options: { unref?: boolean } = {},
): Promise<T | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), ms);
    if (options.unref === true) {
      (timer as unknown as { unref?: () => void }).unref?.();
    }
    void promise.then((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}
