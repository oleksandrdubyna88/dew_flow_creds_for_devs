import { ALLOW_WINDOW_MS, withinAllowWindow } from './agentConsent';

/**
 * The SSH agent's window book: which "allow without asking" windows are open, for which generation of which
 * key, and the rules that keep each one inside what it was given for (#197).
 *
 * <p>It replaces a bare `Map<string, number>` that had three operations and no rules; the three defects the
 * plan found (D1: a key loaded again inherited the window; D2: an answer given after the key was removed
 * opened a window for the key loaded next; D3: two grants of one scope could shorten each other) were each a
 * rule that map never had. The book is an immutable value: every function returns a NEW book, or the SAME
 * object when nothing changed, so "did anything change?" is a reference check and a tree repaints only on a
 * real change. Pure and free of `vscode`, so every one of those rules is a test with no editor in sight.</p>
 *
 * <p><b>A window belongs to one generation of one key.</b> A key loaded under an id gets a generation number
 * from the manager; a window records the generation it was granted to and covers nothing else. The answer to
 * a prompt may only open a window for the generation the prompt was asked about — the
 * {@link AskTicket} taken when the request arrived says which, and `grantWindow` checks it.</p>
 *
 * <p><b>Fences.</b> Every revocation moves a fence, and an answer that was given across one opens no window.
 * Per key (unload, re-load and the row button) and one for the whole vault (any lock). What crossed is
 * reported in this order: `stale-key` (the key was unloaded or re-loaded), `fenced-key`, `fenced-lock`.
 * On the wire since E2: the lock (`endAllWindows`, E2.1) and the row button (`endWindows`, E2.2).</p>
 *
 * <p><b>Two clocks, both must permit.</b> The wall clock says `grantedAt <= now < until`; a monotonic clock
 * says `0 <= nowMono - grantedAtMono < until - grantedAt`. A wall clock set back after the grant therefore
 * cannot stretch a window, and one moved forward ends it early. Where the monotonic clock pauses in sleep,
 * the wall clock still ends the window — that is what "both" buys.</p>
 */

/** `all`: the 10-minute window, which covers every purpose. `login`: a longer window, for SSH logins only. */
export type WindowScope = 'all' | 'login';

/** One generation of one key. */
export interface KeyRef {
  readonly entityId: string;
  readonly generation: number;
}

/** What a prompt knew when it was shown: the key's generation and both fences at that moment. */
export interface AskTicket extends KeyRef {
  readonly keyFence: number;
  readonly lockEpoch: number;
}

export interface OpenWindow {
  readonly generation: number;
  readonly grantedAt: number;
  readonly grantedAtMono: number;
  readonly until: number;
}

export type ScopeWindows = Readonly<Partial<Record<WindowScope, OpenWindow>>>;

export interface AllowWindows {
  /** Moved by any lock. */
  readonly lockEpoch: number;
  /** Moved per key by unload, re-load and the row button; a key never moved reads 0. */
  readonly keyFences: ReadonlyMap<string, number>;
  readonly open: ReadonlyMap<string, ScopeWindows>;
}

/**
 * The book with nothing open. Frozen at the TOP LEVEL only — its two Maps are not frozen, and nothing casts
 * them to mutate: every function here returns a new book instead.
 */
export const NO_WINDOWS: AllowWindows = Object.freeze({
  lockEpoch: 0,
  keyFences: new Map<string, number>(),
  open: new Map<string, ScopeWindows>(),
});

/**
 * How far a grant of each scope may reach, whatever it is handed. `all` is the ten minutes the dialog
 * promises; a `login` window is deliberately its own figure (a test pins it equal to the MCP ask window, so
 * changing one is a conscious change to both).
 */
export const MAX_WINDOW_MS: Readonly<Record<WindowScope, number>> = Object.freeze({
  all: ALLOW_WINDOW_MS,
  login: 12 * 3_600_000,
});

/** The only scopes the gate asks until a login window can be granted. */
export const ALL_ONLY: readonly WindowScope[] = Object.freeze<WindowScope[]>(['all']);

export type GrantOutcome = 'opened' | 'kept-later' | 'stale-key' | 'fenced-key' | 'fenced-lock';

/** A fence never moved reads 0 — the ONE spelling of that default, for the ticket and the check alike. */
function fenceOf(book: AllowWindows, entityId: string): number {
  return book.keyFences.get(entityId) ?? 0;
}

/** The ticket for a request that has just arrived: its key's generation and both fences, now. */
export function askTicket(book: AllowWindows, key: KeyRef): AskTicket {
  return { ...key, keyFence: fenceOf(book, key.entityId), lockEpoch: book.lockEpoch };
}

/**
 * What an answer crossed, in the order that matters: a key unloaded or re-loaded wins over every other
 * fence. Compared with `!==`, never `<`: a fence that read `undefined` would pass `undefined < 1` silently,
 * and `!==` fails safe.
 */
function crossing(book: AllowWindows, ticket: AskTicket, currentGeneration: number | undefined): GrantOutcome | undefined {
  if (currentGeneration !== ticket.generation) {
    return 'stale-key';
  }
  if (fenceOf(book, ticket.entityId) !== ticket.keyFence) {
    return 'fenced-key';
  }
  return book.lockEpoch === ticket.lockEpoch ? undefined : 'fenced-lock';
}

/** `windows` with one scope set — a new map, a new entry; nothing the caller holds is touched. */
function withScope(open: ReadonlyMap<string, ScopeWindows>, entityId: string, scope: WindowScope, window: OpenWindow): ReadonlyMap<string, ScopeWindows> {
  return new Map(open).set(entityId, { ...open.get(entityId), [scope]: window });
}

/**
 * Is the window already in the book one that must be kept? Only when it is this ticket's generation, still
 * alive at the click on BOTH clocks, and ends no earlier than the new one. A dead window (a wall clock set
 * back) or an older generation's never blocks a grant; "later" is only ever compared between live windows.
 */
function liveAndLater(existing: OpenWindow | undefined, ticket: AskTicket, until: number, at: { grantedAt: number; grantedAtMono: number }): boolean {
  return existing !== undefined && existing.until >= until && covers(existing, ticket, at.grantedAt, at.grantedAtMono);
}

/** Clamp to the scope's ceiling, keep a live later window of the same generation, else record the window. */
function placed(
  book: AllowWindows,
  ticket: AskTicket,
  scope: WindowScope,
  at: { grantedAt: number; grantedAtMono: number; until: number },
): { book: AllowWindows; outcome: GrantOutcome } {
  const until = Math.min(at.until, at.grantedAt + MAX_WINDOW_MS[scope]);
  if (liveAndLater(book.open.get(ticket.entityId)?.[scope], ticket, until, at)) {
    return { book, outcome: 'kept-later' };
  }
  const window = { generation: ticket.generation, grantedAt: at.grantedAt, grantedAtMono: at.grantedAtMono, until };
  return { book: { ...book, open: withScope(book.open, ticket.entityId, scope, window) }, outcome: 'opened' };
}

/**
 * Record the window a person's timed answer asked for — unless the answer crossed a fence, in which case the
 * SAME book comes back with the reason. An `until` at or before `grantedAt` is recorded as handed; it covers
 * nothing. `currentGeneration` is the key's generation NOW (`undefined`: not loaded); the ticket's is the one
 * the prompt was asked about.
 */
export function grantWindow(
  book: AllowWindows,
  ticket: AskTicket,
  scope: WindowScope,
  currentGeneration: number | undefined,
  grantedAt: number,
  grantedAtMono: number,
  until: number,
): { book: AllowWindows; outcome: GrantOutcome } {
  const crossed = crossing(book, ticket, currentGeneration);
  return crossed === undefined ? placed(book, ticket, scope, { grantedAt, grantedAtMono, until }) : { book, outcome: crossed };
}

/** Which windows may cover a request: a login window only for a login, and only while auto-lock is on. */
export function scopesFor(purposeIsLogin: boolean, autoLockMinutes: number): readonly WindowScope[] {
  return purposeIsLogin && autoLockMinutes > 0 ? ['all', 'login'] : ALL_ONLY;
}

/** The wall clock's half: granted already, and not yet over. Strict at the end, like `withinAllowWindow`. */
function wallPermits(window: OpenWindow, now: number): boolean {
  return window.grantedAt <= now && withinAllowWindow(window.until, now);
}

/** The monotonic clock's half: it must have moved forward, by less than the window's length. Strict at the end. */
function monoPermits(window: OpenWindow, nowMono: number): boolean {
  const elapsed = nowMono - window.grantedAtMono;
  return elapsed >= 0 && elapsed < window.until - window.grantedAt;
}

/** The one rule for "covers": this generation, and BOTH clocks. */
function covers(window: OpenWindow, key: KeyRef, now: number, nowMono: number): boolean {
  return window.generation === key.generation && wallPermits(window, now) && monoPermits(window, nowMono);
}

/** `[scope, window]` pairs of one key's entry — `Object.entries` loses the scope type; nothing stores `undefined`. */
function entriesOf(windows: ScopeWindows): [WindowScope, OpenWindow][] {
  return Object.entries(windows) as [WindowScope, OpenWindow][];
}

/** Every one of this key's windows, among `scopes`, that covers a request now. */
export function windowsFor(book: AllowWindows, key: KeyRef, scopes: readonly WindowScope[], now: number, nowMono: number): ScopeWindows {
  const entries = entriesOf(book.open.get(key.entityId) ?? {});
  return Object.fromEntries(entries.filter(([scope, window]) => scopes.includes(scope) && covers(window, key, now, nowMono)));
}

/** The first of `scopes`, in that order, whose window covers a request now. */
export function windowCovers(book: AllowWindows, key: KeyRef, scopes: readonly WindowScope[], now: number, nowMono: number): OpenWindow | undefined {
  const live = windowsFor(book, key, scopes, now, nowMono);
  return scopes.map((scope) => live[scope]).find((window) => window !== undefined);
}

/** A new open-map without one key. */
function withoutKey(open: ReadonlyMap<string, ScopeWindows>, entityId: string): ReadonlyMap<string, ScopeWindows> {
  const next = new Map(open);
  next.delete(entityId);
  return next;
}

/** Move one key's fence and drop its windows. Always a new book, even with nothing open (I3). */
function fenced(book: AllowWindows, entityId: string): AllowWindows {
  return {
    ...book,
    keyFences: new Map(book.keyFences).set(entityId, fenceOf(book, entityId) + 1),
    open: withoutKey(book.open, entityId),
  };
}

/** The row button: this key's windows end, and an answer being given right now opens none. */
export function endWindows(book: AllowWindows, entityId: string): AllowWindows {
  return fenced(book, entityId);
}

/** Unload or re-load: the same operation, named for the caller's intent. */
export function forgetKey(book: AllowWindows, entityId: string): AllowWindows {
  return fenced(book, entityId);
}

/** Any lock: every window ends and an answer given across it opens none. Fences are kept. Always new. */
export function endAllWindows(book: AllowWindows): AllowWindows {
  return { ...book, lockEpoch: book.lockEpoch + 1, open: new Map() };
}

/** The number of windows in a list of key entries. */
function windowCount(entries: Iterable<readonly [string, ScopeWindows]>): number {
  return [...entries].reduce((sum, [, windows]) => sum + entriesOf(windows).length, 0);
}

/** One key's entry with only the windows `keep` accepts; a key left with none is no entry at all. */
function keptEntry(id: string, windows: ScopeWindows, keep: (scope: WindowScope, window: OpenWindow) => boolean): [string, ScopeWindows][] {
  const entries = entriesOf(windows).filter(([scope, window]) => keep(scope, window));
  return entries.length === 0 ? [] : [[id, Object.fromEntries(entries)]];
}

/** The book without the windows `keep` refuses — the SAME object when it refuses none. No fence moves. */
function pruned(book: AllowWindows, keep: (scope: WindowScope, window: OpenWindow) => boolean): AllowWindows {
  const kept = [...book.open].flatMap(([id, windows]) => keptEntry(id, windows, keep));
  return windowCount(kept) === windowCount(book.open) ? book : { ...book, open: new Map(kept) };
}

/** Auto-lock set to 0: every `login` window ends; the 10-minute ones and every fence stay. */
export function endLoginWindows(book: AllowWindows): AllowWindows {
  return pruned(book, (scope) => scope !== 'login');
}

/** Drop what is over on either clock, and a key left with nothing. */
export function withoutExpired(book: AllowWindows, now: number, nowMono: number): AllowWindows {
  return pruned(book, (_scope, window) => wallPermits(window, now) && monoPermits(window, nowMono));
}

/** Where a window ends, as a wall-clock time: the earlier of its wall deadline and where the monotonic clock puts it. */
function endOf(window: OpenWindow, now: number, nowMono: number): number {
  const monoEnd = now + (window.grantedAtMono + (window.until - window.grantedAt) - nowMono);
  return Math.min(window.until, monoEnd);
}

/**
 * These windows with `until` replaced by where each really ends on BOTH clocks — what a row may promise. A wall
 * clock set back after the grant leaves the wall deadline later than the monotonic end, and the gate honours the
 * earlier one; a copy for display, never fed back into the book.
 */
export function withEndOnBothClocks(windows: ScopeWindows, now: number, nowMono: number): ScopeWindows {
  return Object.fromEntries(entriesOf(windows).map(([scope, window]) => [scope, { ...window, until: endOf(window, now, nowMono) }]));
}

/** The nearest end, on either clock, among the open windows that have not ended yet, for the timer that repaints the row. */
export function nextExpiry(book: AllowWindows, now: number, nowMono: number): number | undefined {
  const ends = [...book.open.values()].flatMap((windows) => entriesOf(windows).map(([, window]) => endOf(window, now, nowMono))).filter((end) => end > now);
  return ends.length === 0 ? undefined : Math.min(...ends);
}
