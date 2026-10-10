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
 * `DependencyRunRequest.startGate`, the install offer's, the host-key conversation's and the SSH
 * refusal's): checked after each await on a start's path and immediately before each effect, so a
 * client that leaves while a modal is open gets nothing started when the person later answers it
 * (`PLAN_wsl_bridge_outlives_its_client.md` §5.7).</p>
 */
export function requestGone(startGate: AbortSignal | undefined): boolean {
  return startGate?.aborted === true;
}

/** The journal's words for a request whose action had not been launched when its client left. */
export const NOT_LAUNCHED = 'as the action was starting — it was not launched';

/**
 * The error an action throws when it did not start because its request had gone — the shape `brokerCall`
 * journals as that request's `ABANDONED` (it was not launched) instead of a refusal or an internal failure,
 * answering nobody. An `AbortError`, as Node names a cancelled operation.
 */
export function notStarted(): Error {
  return new RequestEndedError(NOT_LAUNCHED);
}

/**
 * The error an action throws when its request ended AFTER something had already been handed to the shell —
 * the one case `notStarted()` would misreport (E4.S4). `what` names it for the journal: *a dependency step
 * had been typed*. What was typed is the shell's and is not taken back; nothing more is started.
 */
export function endedAfter(what: string): Error {
  return new RequestEndedError(`after ${what} — it is the shell's and is not taken back; nothing more was started`);
}

/**
 * Where a thrown error says the request's end was met — the stage the journal writes after *the client
 * left* — or `undefined` for any error that is not a request's end, which the broker then describes by
 * what it knows (`brokerCall.failedOrAbandoned`).
 *
 * <p>Recognised by its BRAND, never by `instanceof`: the broker and the action that threw can come from
 * two module graphs (the test harness loads each under its own `vscode` stub, and a bundler may split
 * them), and a class identity check would then quietly fall back to "not launched", the very words this
 * exists to correct. The brand is a `Symbol.for` key, which every copy of this module shares — and which
 * no foreign `AbortError` carries, so nothing but a request's own end can put words into the journal
 * through this reading (own review, E4.S4).</p>
 */
export function endedStage(error: unknown): string | undefined {
  const stage = isRequestEnded(error) ? error.stage : undefined;
  return typeof stage === 'string' ? stage : undefined;
}

/** The brand a request's end carries across module graphs. */
const REQUEST_ENDED = Symbol.for('creds-for-devs.requestEnded');

function isRequestEnded(error: unknown): error is { readonly stage: unknown } {
  return typeof error === 'object' && error !== null && (error as Record<symbol, unknown>)[REQUEST_ENDED] === true;
}

/** Named `AbortError` as part of the instance, as Node names a cancelled operation — never assigned after. */
class RequestEndedError extends Error {
  override readonly name = 'AbortError';
  readonly [REQUEST_ENDED] = true;

  constructor(
    /** The journal's detail: what the request's end found, in the words written after *the client left*. */
    readonly stage: string,
  ) {
    super(`Not started: the request it was for had already ended (${stage}).`);
  }
}
