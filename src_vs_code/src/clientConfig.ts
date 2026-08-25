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

  private async load(location: string): Promise<ClientConfig | undefined> {
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

/**
 * Which scope to ask for, given what the server said and what the user configured.
 *
 * <p>The explicit setting wins. It is the escape hatch for a server that advertises
 * the wrong thing, and an operator who has typed a value should not be silently
 * overridden by a machine — that is the kind of surprise nobody can debug.</p>
 */
export function resolveMicrosoftScope(
  configured: string | undefined,
  advertised: string | undefined,
): string {
  const explicit = (configured ?? '').trim();
  return explicit.length > 0 ? explicit : (advertised ?? '').trim();
}
