import type * as http from 'node:http';

/**
 * The life of one broker request, as a signal: it fires when the client that asked hung up before
 * it was answered.
 *
 * <p><b>Why the broker needs this at all</b> (`PLAN_wsl_bridge_outlives_its_client.md` §2.3, a
 * security defect). A use call can wait minutes on a consent modal. Nothing used to observe the
 * caller leaving in that time, so an MCP client that was closed — its session ended, its tool call
 * cancelled — left a modal behind it, and a person who clicked <i>Allow</i> on it later allowed the
 * grant and RAN the action on their machine for a request nobody was waiting for any more. The
 * answer went to a dead socket; the side effect did not.</p>
 *
 * <p><b>`close` with the response unfinished is "the client is gone".</b> A `ServerResponse` emits
 * `close` both when it completed normally and when its connection ended first; `writableFinished`
 * is what tells the two apart, and it is the form Node's own documentation recommends for detecting
 * an aborted response. A finished response — keep-alive or not — therefore never aborts the signal.</p>
 *
 * <p>Made once per request, at the top of the router, before anything awaits: a listener attached
 * later could miss a `close` that had already fired.</p>
 */
export function abandonedWhenClosed(res: http.ServerResponse): AbortSignal {
  const life = new AbortController();
  if (res.destroyed && !res.writableFinished) {
    life.abort();
    return life.signal;
  }
  res.once('close', () => {
    if (!res.writableFinished) {
      life.abort();
    }
  });
  return life.signal;
}

/**
 * Whether the request a start serves has gone — `false` when no request stands behind it at all, which
 * is the person's own click: nothing a client does can cancel what a person asked for in the window.
 *
 * <p>The one reading of a start gate (`ConnectOptions.startGate`, `VpnRunContext.startGate`,
 * `DependencyRunRequest.startGate`, the install offer's): checked after each await on a start's path and
 * immediately before each effect, so a client that leaves while a modal is open gets nothing started when
 * the person later answers it (`PLAN_wsl_bridge_outlives_its_client.md` §5.7).</p>
 */
export function requestGone(startGate: AbortSignal | undefined): boolean {
  return startGate?.aborted === true;
}

/**
 * The error an action throws when it did not start because its request had gone — the shape `brokerCall`
 * journals as that request's `ABANDONED` (it was not launched) instead of a refusal or an internal failure,
 * answering nobody. An `AbortError`, as Node names a cancelled operation.
 */
export function notStarted(): Error {
  return new RequestEndedError();
}

/** Named `AbortError` as part of the instance, as Node names a cancelled operation — never assigned after. */
class RequestEndedError extends Error {
  override readonly name = 'AbortError';

  constructor() {
    super('Not started: the request it was for had already ended.');
  }
}
