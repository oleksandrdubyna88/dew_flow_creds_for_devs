import { McpEntry } from './mcpEntries';

/**
 * The entries an agent may see, remembered between calls.
 *
 * <p><b>Why this exists, measured.</b> Building that answer costs five keychain reads per visible
 * entry — a vault with 200 entries opened to agents is 1000 cross-process reads, which is most of
 * a second on the extension host thread. The route is deliberately unthrottled, because it raises
 * no prompt; without a cache a local process could hold that thread down by asking in a loop, and
 * an agent doing its ordinary work would wait most of a second for every list.</p>
 *
 * <p><b>Invalidated exactly, not by a timer.</b> `mutated()` already fires after every write to
 * the vault — an edit, an accepted share, a pulled sync, a restore — and that is the moment this
 * answer stops being true. A TTL would be a guess about how stale is acceptable; an event is the
 * fact. The short TTL below is a backstop and not the mechanism: it bounds the damage of a write
 * path that forgets to announce itself, at the cost of one rebuild a minute in the worst case.</p>
 *
 * <p>Pure: it holds a value and a clock, and is told when to forget.</p>
 */

/** The backstop, not the mechanism. Long enough to be free, short enough to bound a mistake. */
export const CACHE_TTL_MS = 60_000;

export class McpEntriesCache {
  private held: readonly McpEntry[] | undefined;
  private builtAt = 0;

  constructor(
    private readonly build: () => Promise<readonly McpEntry[]>,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * The current answer, built once and reused until the vault changes.
   *
   * <p>Concurrent callers share one build. Two agents asking at the same moment used to mean two
   * thousand keychain reads and two identical answers; the in-flight promise is kept so the second
   * one waits on the first.</p>
   */
  async entries(): Promise<readonly McpEntry[]> {
    if (this.held !== undefined && this.now() - this.builtAt < CACHE_TTL_MS) {
      return this.held;
    }
    this.inFlight ??= this.rebuild();
    return this.inFlight;
  }

  private inFlight: Promise<readonly McpEntry[]> | undefined;

  /**
   * Which era of the vault a build belongs to.
   *
   * <p>Clearing two fields is not enough on its own: a rebuild that started BEFORE a write still
   * assigns its result afterwards, and the cache then holds an answer that was never true. The
   * counter is what makes forgetting win — a build whose era has passed hands its answer to the
   * caller that asked for it and stores nothing.</p>
   */
  private era = 0;

  private async rebuild(): Promise<readonly McpEntry[]> {
    const era = this.era;
    try {
      const built = await this.build();
      if (era === this.era) {
        this.held = built;
        this.builtAt = this.now();
      }
      return built;
    } finally {
      if (era === this.era) {
        this.inFlight = undefined;
      }
    }
  }

  /**
   * Forget it — the vault changed.
   *
   * <p>Also drops an in-flight build. A rebuild that started before a write would otherwise be
   * stored as current afterwards, which is the one way a cache invalidated on an event can still
   * serve something that was never true.</p>
   */
  forget(): void {
    this.held = undefined;
    this.builtAt = 0;
    this.inFlight = undefined;
    this.era += 1;
  }
}
