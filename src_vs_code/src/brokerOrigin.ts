import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';
import { errorBody, statusForErrorCode } from './brokerProtocol';

/**
 * The door: what the broker refuses before it routes anything.
 *
 * <p>The broker is a loopback HTTP server, and a web page in the person's own browser is also on
 * loopback. Nothing looked at `Origin` or `Host`, and two things follow from that.</p>
 *
 * <p><b>The alias door needs no token</b> — its authorisation is a rate limit and the consent modal,
 * by design. A cross-origin `fetch` with `Content-Type: text/plain` is a SIMPLE request: no preflight,
 * and the body is parsed as JSON whatever it claims to be. So a page the person merely visits could
 * raise the consent dialog in their VS Code for any alias it could name. It could not read the answer
 * — no response here carries `Access-Control-Allow-Origin` — but on <i>Allow</i> the stored command
 * ran.</p>
 *
 * <p><b>And the read routes authenticate nothing.</b> Under DNS rebinding — a hostname the attacker
 * controls, re-resolved to `127.0.0.1` — the page becomes same-origin with the broker and can read
 * the alias and entry lists: names, folders, kinds. Metadata, not secrets, and exactly the names the
 * first half needs.</p>
 *
 * <p><b>Which check does which job is worth stating, because the review gate caught this plan getting
 * it backwards.</b> `Origin` closes the ordinary cross-origin POST. It does NOT close rebinding: a
 * browser omits `Origin` on a same-origin GET, and after a rebind the page IS same-origin. What closes
 * rebinding is `Host` — the browser sends the name the page was loaded from, which is the attacker's,
 * never ours.</p>
 */

/**
 * The handler, behind the door.
 *
 * <p>A WRAPPER rather than a branch inside the router, so "every listener is covered" is true by
 * construction rather than by every listener happening to route through one method. Both the
 * loopback port and the pipe are handed this.</p>
 *
 * <p>`note` is called at most once per window: the first browser-shaped request is worth telling a
 * person about, and the thousandth would flood the journal that exists to show what an AGENT did.</p>
 */
export function behindTheDoor(
  handle: (req: IncomingMessage, res: ServerResponse) => void,
  at: () => Loopback,
  respond: (res: ServerResponse, status: number, body: unknown) => void,
  note: (message: string) => void,
): (req: IncomingMessage, res: ServerResponse) => void {
  let said = false;
  return (req, res) => {
    if (!turnAwayAtTheDoor(req.headers, at(), (status, body) => respond(res, status, body), res)) {
      handle(req, res);
      return;
    }
    if (!said) {
      said = true;
      note(REFUSAL_NOTE);
    }
  };
}

const REFUSAL_NOTE =
  'Something on this machine sent this window a browser-shaped request, and it was refused. Nothing '
  + 'ran and nothing was asked of you. If you did not expect that, a page you have open is talking '
  + 'to localhost.';

/**
 * Answer a request the door refuses, and say whether it did.
 *
 * <p>Here rather than on the server because `credsAgentServer.ts` lives at its 800-line ceiling and
 * this needs nothing from it: a header bag, a port, and somewhere to write.</p>
 *
 * <p>`Connection: close` because the body was never read, and a keep-alive socket holding an unread
 * body is a socket doing nothing for anybody.</p>
 */
export function turnAwayAtTheDoor(
  headers: IncomingHttpHeaders,
  at: Loopback,
  respond: (status: number, body: unknown) => void,
  res: { setHeader(name: string, value: string): void },
): boolean {
  const refusal = admitsRequest(headers, at);
  if (refusal === undefined) {
    return false;
  }
  res.setHeader('Connection', 'close');
  respond(statusForErrorCode('forbidden'), errorBody('forbidden', refusal.message));
  return true;
}

/** Where this window listens, as a `Host` header must name it. */
export interface Loopback {
  readonly port: number;
}

export interface DoorRefusal {
  readonly message: string;
}

const REFUSED =
  'This is a local agent broker, not a web service. Requests that look like they came from a browser '
  + 'are refused: it answers command-line tools on this machine only.';

/**
 * Whether this request may be routed at all — `undefined` admits it.
 *
 * <p>Applied in `handle` before every route, including the ones that authenticate nothing, and for
 * both listeners, since they share one handler.</p>
 */
export function admitsRequest(headers: IncomingHttpHeaders, at: Loopback): DoorRefusal | undefined {
  return browserMarked(headers) || !loopbackHost(headers.host, at) ? { message: REFUSED } : undefined;
}

/**
 * Headers only a browser sends.
 *
 * <p>Presence, never truthiness: `Origin:` with an empty value is a header a browser sent, and
 * `''` is falsy. Node collapses repeated headers, but the type admits an array, so both shapes are
 * handled rather than assumed away.</p>
 *
 * <p>`Sec-Fetch-Site: none` is a person typing the address, which is not a page acting on its own;
 * every other value is. Its ABSENCE admits, because no non-browser client sends it at all — requiring
 * it would refuse every real caller.</p>
 */
function browserMarked(headers: IncomingHttpHeaders): boolean {
  if (headers.origin !== undefined) {
    return true;
  }
  const site = first(headers['sec-fetch-site']);
  return site !== undefined && site !== 'none';
}

/**
 * Whether `Host` names this very listener.
 *
 * <p>The hostname must be loopback AND the port must be the one we are listening on. The port half
 * is what the review gate added, and it is not pedantry: a browser sends the port it connected to, so
 * a mismatch cannot come from a page that reached us — it comes from a proxy or a rebind that kept
 * the default port. `Host: localhost` with no port means 80, and we do not listen there.</p>
 *
 * <p>Parsed through `URL` rather than split on `:`, so `[::1]:4123` and `127.0.0.1:evil` are decided
 * by the same rules a browser uses rather than by a regex that has to anticipate them.</p>
 */
function loopbackHost(host: string | undefined, at: Loopback): boolean {
  const url = parsedHost(host);
  return url !== undefined && isLoopbackName(url.hostname) && portOf(url) === at.port;
}

/** `Host` as a URL, or nothing — an absent, empty or unparseable one is all the same answer. */
function parsedHost(host: string | undefined): URL | undefined {
  try {
    return host === undefined || host.length === 0 ? undefined : new URL(`http://${host}`);
  } catch {
    return undefined;
  }
}

/** No port in a `Host` means 80, which is not where anything of ours listens. */
function portOf(url: URL): number {
  return url.port === '' ? 80 : Number(url.port);
}

const LOOPBACK_NAMES: readonly string[] = ['127.0.0.1', 'localhost', '[::1]'];

/** Exact, never a suffix: `localhost.attacker.test` is the attacker's name, not ours. */
function isLoopbackName(hostname: string): boolean {
  return LOOPBACK_NAMES.includes(hostname.toLowerCase());
}

/** Node collapses repeats, but the type says an array is possible; take the first either way. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0]?.toLowerCase() : value?.toLowerCase();
}
