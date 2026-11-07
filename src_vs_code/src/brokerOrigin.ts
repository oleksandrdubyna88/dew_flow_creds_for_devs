import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';
import type { BridgeContext } from './bridgeContext';
import { BRIDGE_KEY_HEADER } from './bridgeNote';
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
 * <p>Three kinds are built, by `doorsFor` below: the port's door checks `Host`, the socket's cannot
 * (see {@link NOT_ON_THE_NETWORK}), and a Remote Bridge listener's also requires a key and hands the router
 * its `BridgeContext`. They share the notes, so a person is told once per window and not once per
 * listener.</p>
 *
 * <p>NOT exported, deliberately — a reviewer pointed out that another listener added later would
 * reach for this and get its own `said` flag, turning "once per window" back into once per
 * listener. `doorsFor` is the only way to obtain a door, so that invariant is structural.</p>
 */
function behindTheDoor(
  handle: Handle,
  decide: (headers: IncomingHttpHeaders) => DoorRefusal | undefined,
  respond: (res: ServerResponse, status: number, body: unknown) => void,
  note: (refusal: DoorRefusal) => void,
  bridge: BridgeContext | undefined,
): Served {
  return (req, res) => {
    const refusal = decide(req.headers);
    if (refusal === undefined) {
      handle(req, res, bridge);
      return;
    }
    turnAwayAtTheDoor(refusal, (status, body) => respond(res, status, body), res);
    note(refusal);
  };
}

/** A node request handler — the shape both listeners take. */
export type Served = (req: IncomingMessage, res: ServerResponse) => void;

/**
 * The router, as a door hands it a request: the bridge it arrived by, or `undefined` for the port and the
 * socket. WRITTEN at every call site and never defaulted (the doctrine of `brokerMcpDoor.ts`), because
 * a default is how a request with no bridge would come to look like one with a bridge, or the reverse.
 */
export type Handle = (req: IncomingMessage, res: ServerResponse, bridge: BridgeContext | undefined) => void;

/** One router, three kinds of listener, three doors — because only some of them have a port, and one a key. */
export interface Doors {
  readonly onThePort: Served;
  readonly onTheSocket: Served;
  /** The door of one Remote Bridge listener: the main door's checks, and the key, and the context it hands the router. */
  forBridge(port: number, key: string, context: BridgeContext): Served;
}

/**
 * Every door onto one router.
 *
 * <p>Built together so the note is said at most ONCE per window rather than once per listener: the
 * first browser-shaped request is worth telling a person about, and the thousandth would flood the
 * journal that exists to show what an agent did. A key refusal has its own note, once per window too,
 * because the browser one says "browser-shaped" and that would be false for an old `creds`.</p>
 */
export function doorsFor(
  handle: Handle,
  port: () => number,
  respond: (res: ServerResponse, status: number, body: unknown) => void,
  note: (message: string) => void,
): Doors {
  let said = false;
  let saidKey = false;
  const once = (): void => {
    if (!said) {
      said = true;
      note(REFUSAL_NOTE);
    }
  };
  const onceKey = (): void => {
    if (!saidKey) {
      saidKey = true;
      note(KEY_REFUSAL_NOTE);
    }
  };
  const noteFor = (refusal: DoorRefusal): void => (refusal.kind === 'key' ? onceKey() : once());
  return {
    onThePort: behindTheDoor(handle, (h) => admitsRequest(h, { port: port() }), respond, once, undefined),
    onTheSocket: behindTheDoor(handle, (h) => admitsRequest(h, NOT_ON_THE_NETWORK), respond, once, undefined),
    forBridge: (bridgePort, key, context) =>
      behindTheDoor(handle, (h) => admitsBridgeRequest(h, { port: bridgePort, key }), respond, noteFor, context),
  };
}

const REFUSAL_NOTE =
  'Something on this machine sent this window a browser-shaped request, and it was refused. Nothing '
  + 'ran and nothing was asked of you. If you did not expect that, a page you have open is talking '
  + 'to localhost.';

const KEY_REFUSAL_NOTE =
  'Something on this machine called a Remote Bridge listener without its key, and it was refused. Nothing '
  + 'ran and nothing was asked of you. An older creds on that server does this too; updating it stops this line.';

/**
 * Answer a request the door refuses.
 *
 * <p>Here rather than on the server because `credsAgentServer.ts` lives at its 800-line ceiling and
 * this needs nothing from it: a header bag, a port, and somewhere to write.</p>
 *
 * <p>`Connection: close` because the body was never read, and a keep-alive socket holding an unread
 * body is a socket doing nothing for anybody.</p>
 */
function turnAwayAtTheDoor(
  refusal: DoorRefusal,
  respond: (status: number, body: unknown) => void,
  res: { setHeader(name: string, value: string): void },
): void {
  res.setHeader('Connection', 'close');
  respond(statusForErrorCode('forbidden'), errorBody('forbidden', refusal.message));
}

/** Where this window listens, as a `Host` header must name it. */
export interface Loopback {
  readonly port: number;
}

/**
 * The listener a browser cannot reach at all: a Unix socket on POSIX, a named pipe on Windows.
 *
 * <p>Both listeners share one handler, so this one inherited the `Host` check — and there is no
 * `Host` it can pass. A caller that reaches the broker this way was never told a port (that is the
 * point: the WSL bridge and Remote-SSH forward a socket precisely because no loopback port is
 * reachable), so the URL it composes cannot name the one we are listening on. It broke the alias
 * call over the socket, which is the bridge's whole reason for existing.</p>
 *
 * <p>Skipping the check here is not a hole, because `Host` does exactly one job: it stops DNS
 * rebinding. That is a browser attack, and no page can open a Unix socket or a named pipe. What
 * guards this transport is the file mode — 0600 on POSIX — and the grant token, as before. The
 * browser-header checks still apply, because they cost nothing.</p>
 */
export const NOT_ON_THE_NETWORK = Symbol('a unix socket or named pipe — no browser can speak it');

/** Which listener a request arrived on, since only one of them has a port to name. */
export type DoorFacing = Loopback | typeof NOT_ON_THE_NETWORK;

export interface DoorRefusal {
  readonly message: string;
  /** `'key'` for a bridge key refusal, which has a note of its own; absent for the browser and `Host` refusal. */
  readonly kind?: 'key';
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
export function admitsRequest(headers: IncomingHttpHeaders, at: DoorFacing): DoorRefusal | undefined {
  return browserMarked(headers) || !addressedToUs(headers.host, at) ? { message: REFUSED } : undefined;
}

export const BRIDGE_NO_KEY =
  'This is a Remote Bridge listener, and this request carries no bridge key. Update creds on this host: this '
  + 'version cannot use it. Nothing ran.';

export const BRIDGE_WRONG_KEY =
  'This Remote Bridge listener did not accept that key. The bridge has reconnected or closed. Nothing ran.';

/**
 * The bridge door's decision — `undefined` admits. In this order, and the order is the design:
 *
 * <ol>
 * <li>a browser mark → `REFUSED`, before the key is looked at: a page is refused as a page;</li>
 * <li>no key header → `BRIDGE_NO_KEY`;</li>
 * <li>a key that differs (or is not one string) → `BRIDGE_WRONG_KEY`;</li>
 * <li>`Host` → `REFUSED`.</li>
 * </ol>
 *
 * <p>The key is decided BEFORE `Host` on purpose: an old `creds` sends `Host: 127.0.0.1:1` or the main
 * port and no key, and it must be told to update rather than that it looks like a browser. Nothing leaks
 * by the order — every answer is a 403 carrying one fixed sentence.</p>
 */
export function admitsBridgeRequest(
  headers: IncomingHttpHeaders,
  at: { readonly port: number; readonly key: string },
): DoorRefusal | undefined {
  if (browserMarked(headers)) {
    return { message: REFUSED };
  }
  return keyRefusal(headers[BRIDGE_KEY_HEADER.toLowerCase()], at.key) ?? (loopbackHost(headers.host, at) ? undefined : { message: REFUSED });
}

/** No header is `BRIDGE_NO_KEY`; anything but one string equal to the key is `BRIDGE_WRONG_KEY`. */
function keyRefusal(given: string | string[] | undefined, key: string): DoorRefusal | undefined {
  if (given === undefined) {
    return { message: BRIDGE_NO_KEY, kind: 'key' };
  }
  return typeof given === 'string' && sameKey(given, key) ? undefined : { message: BRIDGE_WRONG_KEY, kind: 'key' };
}

/**
 * Equal keys, in constant time and without a length oracle: both sides are hashed first, so
 * `timingSafeEqual` always sees two 32-byte digests. It throws on buffers of different length, and
 * comparing the raw strings would either throw or answer early.
 */
function sameKey(given: string, key: string): boolean {
  return timingSafeEqual(sha256(given), sha256(key));
}

function sha256(text: string): Buffer {
  return createHash('sha256').update(text, 'utf8').digest();
}

/** A socket has no address a `Host` could get wrong; a port has exactly one. */
function addressedToUs(host: string | undefined, at: DoorFacing): boolean {
  return at === NOT_ON_THE_NETWORK || loopbackHost(host, at);
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

const LOOPBACK_NAMES: readonly string[] = ['127.0.0.1', 'localhost', '::1'];

/**
 * Exact, never a suffix: `localhost.attacker.test` is the attacker's name, not ours.
 *
 * <p>Brackets are stripped first. `new URL('http://[::1]:4123').hostname` gives `[::1]` on this
 * runtime, and a reviewer asked whether every runtime agrees — comparing the bare address costs
 * nothing and removes the question.</p>
 */
function isLoopbackName(hostname: string): boolean {
  return LOOPBACK_NAMES.includes(hostname.toLowerCase().replace(/^\[|\]$/g, ''));
}

/** Node collapses repeats, but the type says an array is possible; take the first either way. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0]?.toLowerCase() : value?.toLowerCase();
}
