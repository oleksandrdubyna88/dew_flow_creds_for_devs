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
