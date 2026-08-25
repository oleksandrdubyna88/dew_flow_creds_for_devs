/**
 * Start something at most once — but only count a SUCCESS as "started".
 *
 * <p>The trap this replaces is `this.p ??= factory()`. It memoizes the promise whether it
 * resolves or rejects, so one transient failure (a loopback bind that lost a race, a
 * momentary resource limit) pins the rejected promise forever: every later caller re-awaits
 * the same stale rejection, and the only cure is throwing the whole object away — for the
 * broker, that meant one failed "Share with Agent" disabled the feature until the window was
 * reloaded. Here a rejection is forgotten, so the next caller tries again; a success is
 * shared, so concurrent callers do not each bind their own listener.</p>
 *
 * <p>Pure and `vscode`-free, so the retry rule is a unit test.</p>
 */
export function startOnce<T>(): (factory: () => Promise<T>) => Promise<T> {
  let inFlight: Promise<T> | undefined;
  return (factory) => {
    if (inFlight === undefined) {
      inFlight = factory().catch((error) => {
        inFlight = undefined; // forget the failure so a later call can retry
        throw error;
      });
    }
    return inFlight;
  };
}
