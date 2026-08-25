/**
 * What the vault server says a client needs before it can sign in.
 *
 * <p>The problem this removes: Microsoft sign-in only works against a server if the
 * extension asks Entra for the operator's own API scope — ask for `user.read` and you
 * get a <b>Graph</b> token, which Microsoft deliberately makes unverifiable by third
 * parties, so no server can accept it. Until now that scope had to be pasted into
 * every developer's `settings.json` by hand, and the failure when nobody did was an
 * empty Team with no error.</p>
 *
 * <p>The server already knows the value. It now says so on an anonymous endpoint —
 * anonymous by necessity, since the caller has no token yet, and safe because a client
 * id is public by construction: it appears in every authorization URL and in the
 * audience of every token the server accepts.</p>
 *
 * <p>Fetching is best-effort and cached per location. A server that does not answer,
 * or an older one that has no such endpoint, leaves the caller exactly where it was —
 * on the configured setting — rather than breaking sign-in over a discovery step.</p>
 */

export interface ClientConfig {
  microsoftScope: string;
}

/** The subset of `fetch` used, so the cache is testable without a network. */
export type ConfigFetcher = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

const TIMEOUT_MS = 5_000;

export class ClientConfigCache {
  private readonly byLocation = new Map<string, ClientConfig | undefined>();

  constructor(private readonly fetcher: ConfigFetcher) {}

  /**
   * The server's advertised config, or undefined when it has none to give.
   *
   * <p>Cached including the negative answer: a server that does not publish this is
   * not going to start mid-session, and asking again on every sync would add a round
   * trip to the one path that is already slow.</p>
   */
  async forLocation(location: string): Promise<ClientConfig | undefined> {
    if (this.byLocation.has(location)) {
      return this.byLocation.get(location);
    }
    const config = await this.load(location);
    this.byLocation.set(location, config);
    return config;
  }

  /** Forget what a server said — for when its URL or configuration changes. */
  forget(location?: string): void {
    if (location === undefined) {
      this.byLocation.clear();
    } else {
      this.byLocation.delete(location);
    }
  }

  // eslint-disable-next-line complexity
  private async load(location: string): Promise<ClientConfig | undefined> {
    // A scope fetched over plaintext http from a remote host is a scope an on-path attacker
    // could choose — and the extension would mint a token for it and hand it back. Discover
    // only over https, or over http to loopback where there is no network to sit on.
    if (!isDiscoverableLocation(location)) {
      return undefined;
    }
    try {
      const response = await this.fetcher(`${location.replace(/\/+$/, '')}/api/client-config`);
      if (!response.ok) {
        return undefined;
      }
      const body = (await response.json()) as Record<string, unknown>;
      const scope = typeof body.microsoftScope === 'string' ? body.microsoftScope.trim() : '';
      return scope.length > 0 ? { microsoftScope: scope } : undefined;
    } catch {
      return undefined;
    }
  }
}

/** A fetcher with a deadline, so a hung server cannot stall a sign-in. */
export function defaultConfigFetcher(url: string): Promise<Response> {
  return fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
}

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]'
  );
}

/**
 * Whether a scope may be discovered from this location at all. https is trusted; plain
 * http only for loopback, where there is no network path for a man in the middle. Anything
 * else falls back to the operator's own setting rather than a value an attacker could pick.
 */
export function isDiscoverableLocation(location: string): boolean {
  try {
    const url = new URL(location);
    return url.protocol === 'https:' || (url.protocol === 'http:' && isLoopbackHost(url.hostname));
  } catch {
    return false;
  }
}

/**
 * Whether a server-advertised scope is safe to request a token for.
 *
 * <p>The confused-deputy this closes: the extension asks Entra for whatever scope the
 * server (an anonymous endpoint) names, then hands the resulting token back to that same
 * server. If the server could name a <b>first-party</b> Microsoft scope — a Graph
 * permission, a `.default` — it could make the extension mint a Graph token for the user
 * and deliver it. Only an application-specific `api://…/scope` is allowed: a token for that
 * audience is useless anywhere but the app registration that named it.</p>
 */
export function isSafeAdvertisedScope(scope: string): boolean {
  const s = scope.trim();
  return s.length > 0 && s.length <= 512 && /^api:\/\/\S+\/[A-Za-z0-9._-]+$/.test(s);
}

/**
 * Which scope to ask for, given what the server said and what the user configured.
 *
 * <p>The explicit setting wins. It is the escape hatch for a server that advertises
 * the wrong thing, and an operator who has typed a value should not be silently
 * overridden by a machine — that is the kind of surprise nobody can debug.</p>
 */
// eslint-disable-next-line complexity
export function resolveMicrosoftScope(
  configured: string | undefined,
  advertised: string | undefined,
): string {
  const explicit = (configured ?? '').trim();
  if (explicit.length > 0) {
    return explicit; // a person typed it — trusted, and never overridden by a machine
  }
  const fromServer = (advertised ?? '').trim();
  // The server's value is unauthenticated data: use it only if it is an app-specific scope.
  return isSafeAdvertisedScope(fromServer) ? fromServer : '';
}
