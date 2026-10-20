import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { ALLOW_WINDOW_MS } from '../agentConsent';
import {
  ALL_ONLY,
  AllowWindows,
  KeyRef,
  MAX_WINDOW_MS,
  NO_WINDOWS,
  WindowScope,
  askTicket,
  endAllWindows,
  endLoginWindows,
  endWindows,
  forgetKey,
  grantWindow,
  nextExpiry,
  scopesFor,
  windowCovers,
  windowsFor,
  withoutExpired,
} from '../allowWindows';
import { ASK_WINDOW_MS } from '../mcpConsentPolicy';

/**
 * The window book (#197, E1.3), pure — no editor, no socket, no clock but the numbers each test hands in.
 *
 * <p>None of these can be RED on the code that came before: the module is new. They were shown to have
 * teeth the other way — each rule broken in the module and the test that names it watched failing (the
 * story's summary lists them).</p>
 *
 * <p>Two clocks everywhere: a probe is `(wall, mono)`. The monotonic origin `M` is NOT 0, so a book that
 * never stored `grantedAtMono`, or stored 0, computes the wrong elapsed time and fails here.</p>
 */

const MIN = 60_000;
const H = 3_600_000;
const W = Date.UTC(2026, 8, 24, 10, 0, 0);
const M = 50_000;
const A: KeyRef = { entityId: 'key-1', generation: 1 };
const B: KeyRef = { entityId: 'key-2', generation: 1 };

/** A grant to `key`'s own generation — the ticket is taken from `book` as the gate takes it. */
function grant(book: AllowWindows, key: KeyRef, scope: WindowScope, grantedAt: number, mono: number, until: number): AllowWindows {
  return grantWindow(book, askTicket(book, key), scope, key.generation, grantedAt, mono, until).book;
}

/** The standard window: `A`, scope `all`, granted `(W, M)` for ten minutes. */
function tenMinutes(book: AllowWindows = NO_WINDOWS, key: KeyRef = A): AllowWindows {
  return grant(book, key, 'all', W, M, W + 10 * MIN);
}

/** Where `key-1`'s window of a scope ends, as recorded. */
const untilOf = (book: AllowWindows, scope: WindowScope): number | undefined => book.open.get('key-1')?.[scope]?.until;

const covered = (book: AllowWindows, wall: number, mono: number, key: KeyRef = A): boolean =>
  windowCovers(book, key, ALL_ONLY, wall, mono) !== undefined;

test('a window granted to one generation of a key never covers the next', () => {
  const book = tenMinutes();
  const next: KeyRef = { entityId: 'key-1', generation: 2 };

  assert.equal(windowCovers(book, next, ALL_ONLY, W + MIN, M + MIN), undefined);
  assert.ok(windowCovers(book, A, ALL_ONLY, W + MIN, M + MIN) !== undefined);

  const forgotten = forgetKey(book, 'key-1');
  assert.equal(windowCovers(forgotten, A, ALL_ONLY, W + MIN, M + MIN), undefined);
  assert.equal(windowCovers(forgotten, next, ALL_ONLY, W + MIN, M + MIN), undefined);
  assert.equal(forgotten.open.has('key-1'), false);
});

test('a revocation fences an answer even when no window was open', () => {
  const ticket = askTicket(NO_WINDOWS, A);

  const keyRevoked = endWindows(NO_WINDOWS, 'key-1');
  const byKey = grantWindow(keyRevoked, ticket, 'all', 1, W, M, W + 10 * MIN);
  assert.equal(byKey.outcome, 'fenced-key');
  assert.equal(byKey.book, keyRevoked);

  const locked = endAllWindows(NO_WINDOWS);
  const byLock = grantWindow(locked, ticket, 'all', 1, W, M, W + 10 * MIN);
  assert.equal(byLock.outcome, 'fenced-lock');
  assert.equal(byLock.book, locked);
});

test('a revocation on one key never fences an answer for another', () => {
  const ticket = askTicket(NO_WINDOWS, A);
  const book = forgetKey(endWindows(NO_WINDOWS, 'key-2'), 'key-2');

  assert.equal(grantWindow(book, ticket, 'all', 1, W, M, W + 10 * MIN).outcome, 'opened');
});

test('unload and re-load win over every other fence', () => {
  const ticket = askTicket(NO_WINDOWS, A);
  const book = forgetKey(endAllWindows(NO_WINDOWS), 'key-1');

  assert.equal(grantWindow(book, ticket, 'all', 2, W, M, W + 10 * MIN).outcome, 'stale-key');
  assert.equal(grantWindow(book, ticket, 'all', undefined, W, M, W + 10 * MIN).outcome, 'stale-key');
});

test("a fresh key's first grant opens", () => {
  // A fence never moved reads 0 for the ticket and for the check alike.
  const result = grantWindow(NO_WINDOWS, askTicket(NO_WINDOWS, A), 'all', 1, W, M, W + 10 * MIN);

  assert.equal(askTicket(NO_WINDOWS, A).keyFence, 0, 'a fence never moved reads 0, not undefined');
  assert.equal(result.outcome, 'opened');
  assert.deepEqual(result.book.open.get('key-1')?.all, { generation: 1, grantedAt: W, grantedAtMono: M, until: W + 10 * MIN });
});

test('no grant reaches past its scope ceiling, whatever it is handed', () => {
  const all = grant(NO_WINDOWS, A, 'all', W, M, W + H);
  assert.equal(untilOf(all, 'all'), W + ALLOW_WINDOW_MS);
  assert.equal(windowCovers(all, A, ALL_ONLY, W + 11 * MIN, M + 11 * MIN), undefined);

  const login = grant(NO_WINDOWS, A, 'login', W, M, W + 13 * H);
  assert.equal(untilOf(login, 'login'), W + 12 * H);

  assert.equal(MAX_WINDOW_MS.login, ASK_WINDOW_MS, 'the two twelve-hour figures move together, on purpose');
  assert.equal(MAX_WINDOW_MS.all, ALLOW_WINDOW_MS);
});

test('a shorter grant never shortens a longer one of the same scope', () => {
  const book = tenMinutes();

  const shorter = grantWindow(book, askTicket(book, A), 'all', 1, W + MIN, M + MIN, W + 5 * MIN);
  assert.equal(shorter.outcome, 'kept-later');
  assert.equal(shorter.book, book);
  assert.ok(covered(shorter.book, W + 9 * MIN, M + 9 * MIN));

  const shortFirst = grant(NO_WINDOWS, A, 'all', W, M, W + 5 * MIN);
  const longer = grantWindow(shortFirst, askTicket(shortFirst, A), 'all', 1, W + MIN, M + MIN, W + 11 * MIN);
  assert.equal(longer.outcome, 'opened');
  assert.ok(covered(longer.book, W + 9 * MIN, M + 9 * MIN));
});

test('scopes are independent', () => {
  const book = grant(tenMinutes(), A, 'login', W, M, W + H);

  const both = windowsFor(book, A, ['all', 'login'], W + MIN, M + MIN);

  assert.deepEqual(Object.keys(both).sort(), ['all', 'login']);
});

test('a window granted in the future covers nothing', () => {
  const book = tenMinutes();

  assert.equal(covered(book, W - MIN, M + MIN), false, 'wall below grantedAt');
  assert.equal(covered(book, W + MIN, M - 1), false, 'mono below grantedAtMono');
});

test('a clock moved forward ends a window early, never extends it', () => {
  assert.equal(covered(tenMinutes(), W + 25 * MIN, M + MIN), false);
});

test('two clocks: eleven minutes on the wall and one on the monotonic clock refuses', () => {
  assert.equal(covered(tenMinutes(), W + 11 * MIN, M + MIN), false);
});

test('two clocks: one minute on the wall and eleven on the monotonic clock refuses', () => {
  assert.equal(covered(tenMinutes(), W + MIN, M + 11 * MIN), false);
});

test('the boundary expires on both clocks', () => {
  const book = tenMinutes();

  assert.equal(covered(book, W + MIN, M + MIN), true, 'the control');
  assert.equal(covered(book, W + 10 * MIN - 1, M + 10 * MIN - 1), true, 'one millisecond before the end');
  assert.equal(covered(book, W + 10 * MIN, M + MIN), false, 'the wall clock ends it at until');
  assert.equal(covered(book, W + MIN, M + 10 * MIN), false, 'the monotonic clock ends it at the length');
});

test('a wall clock set back that stays above grantedAt refuses', () => {
  // Granted 10:00. After nine real minutes the wall clock is reset to 10:01; eight more minutes make it 10:09,
  // which the wall clock alone permits — but 17 real minutes have passed. Eight, not nine: with nine the wall
  // clock alone would end the window at 10:10, and the test would not hinge on the second clock.
  const book = tenMinutes();

  assert.equal(covered(book, W + 9 * MIN, M + 17 * MIN), false);
  assert.equal(covered(book, W + 9 * MIN, M + 9 * MIN), true, 'the control: the same wall time, honest monotonic time');
});

test('a login window never covers a Git signature or an unrecognised request', () => {
  const book = grant(NO_WINDOWS, A, 'login', W, M, W + H);

  assert.equal(windowCovers(book, A, scopesFor(false, 60), W + 30 * MIN, M + 30 * MIN), undefined);
  assert.ok(windowCovers(book, A, scopesFor(true, 60), W + 30 * MIN, M + 30 * MIN) !== undefined);
});

test('a 10-minute window still covers every purpose', () => {
  const book = tenMinutes();

  for (const [isLogin, autoLock] of [[false, 60], [true, 60], [true, 0]] as const) {
    assert.ok(windowCovers(book, A, scopesFor(isLogin, autoLock), W + MIN, M + MIN) !== undefined, `${isLogin} ${autoLock}`);
  }
  assert.deepEqual(scopesFor(true, 60), ['all', 'login']);
  assert.deepEqual(scopesFor(false, 60), ['all']);
  assert.deepEqual(scopesFor(true, 0), ['all']);
  assert.deepEqual(scopesFor(true, -1), ['all'], 'a negative setting reads as off');
});

test('a book that did not change is the same object, and a grant never changes the book it was given', () => {
  const book = tenMinutes();
  const ticket = askTicket(book, A);

  assert.equal(grantWindow(book, ticket, 'all', 1, W + MIN, M + MIN, W + 5 * MIN).book, book, 'kept-later');
  assert.equal(grantWindow(book, ticket, 'all', 2, W, M, W + MIN).book, book, 'stale-key');
  const keyFenced = endWindows(NO_WINDOWS, 'key-1');
  assert.equal(grantWindow(keyFenced, askTicket(NO_WINDOWS, A), 'all', 1, W, M, W + MIN).book, keyFenced, 'fenced-key');
  const locked = endAllWindows(NO_WINDOWS);
  assert.equal(grantWindow(locked, askTicket(NO_WINDOWS, A), 'all', 1, W, M, W + MIN).book, locked, 'fenced-lock');
  assert.equal(endLoginWindows(book), book, 'no login window to end');
  assert.equal(withoutExpired(book, W + MIN, M + MIN), book, 'nothing expired');

  const before = NO_WINDOWS;
  grantWindow(before, askTicket(before, A), 'all', 1, W, M, W + 10 * MIN);
  assert.equal(before.open.size, 0, 'the book handed in is untouched');
  assert.equal(NO_WINDOWS.open.size, 0);
});

test('a lock ends every window and keeps the fences', () => {
  const book = endWindows(tenMinutes(), 'key-3');

  const locked = endAllWindows(book);

  assert.equal(locked.open.size, 0);
  assert.equal(locked.lockEpoch, book.lockEpoch + 1);
  assert.deepEqual([...locked.keyFences], [...book.keyFences]);
});

test('ending the login windows moves no fence', () => {
  const book = grant(tenMinutes(), A, 'login', W, M, W + H);
  const ticket = askTicket(NO_WINDOWS, A); // a prompt shown before any window was open

  const ended = endLoginWindows(book);

  assert.ok(ended.open.get('key-1')?.all !== undefined, 'the 10-minute window survives');
  assert.equal(ended.open.get('key-1')?.login, undefined);
  assert.equal(grantWindow(ended, ticket, 'all', 1, W + MIN, M + MIN, W + 11 * MIN).outcome, 'opened', 'a pending answer still opens');
});

test('an expired window leaves the book, nextExpiry names the nearest end, and both clocks count', () => {
  const book = grant(tenMinutes(), B, 'all', W, M, W + 5 * MIN);

  const swept = withoutExpired(book, W + 6 * MIN, M + 6 * MIN);
  assert.equal(swept.open.has('key-2'), false);
  assert.equal(swept.open.has('key-1'), true);

  assert.equal(nextExpiry(book, W), W + 5 * MIN);
  assert.equal(nextExpiry(book, W + 6 * MIN), W + 10 * MIN);
  assert.equal(nextExpiry(NO_WINDOWS, W), undefined);

  const monoSwept = withoutExpired(book, W + MIN, M + 11 * MIN);
  assert.equal(monoSwept.open.has('key-1'), false, 'the monotonic clock ends it although the wall clock has not');
});

test('sweeping a key drops only the scope that ended, and a key left with nothing is no entry', () => {
  const book = grant(tenMinutes(), A, 'login', W, M, W + H);

  const swept = withoutExpired(book, W + 11 * MIN, M + 11 * MIN);

  assert.equal(swept.open.get('key-1')?.all, undefined);
  assert.ok(swept.open.get('key-1')?.login !== undefined, 'the login window outlives the 10-minute one');
  assert.equal(withoutExpired(swept, W + 2 * H, M + 2 * H).open.has('key-1'), false);
});
