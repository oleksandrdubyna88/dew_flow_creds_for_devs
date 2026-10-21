import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { ALLOW_ONCE, ALLOW_WINDOW, ALLOW_WINDOW_MS } from '../agentConsent';
import {
  FakeServer,
  KEY_ID,
  SIGNED_BYTES,
  assertNoKeyMaterialLogged,
  keyEntity,
  manager,
  realPrivateKey,
  servedKey,
  unanswered,
  world,
} from './sshAgentWorld';

/**
 * What the key's row and its button ask of the manager (#197, E2.2): *Ask for Every Use Again* ends a key's
 * windows and nothing else, the row sees only a window the gate would honour, and the expiry timer repaints
 * the row without ever sleeping through a clock that moved.
 *
 * <p>The tree text itself is `treeRowText.test.ts`; the wiring that carries `windowsFor` to the tree and
 * `onWindowsChanged` back to its `refresh` is `vaultKeysLock.test.ts`. What is only true HERE is the
 * manager's half: the end, the fence it moves, and what `windowsFor` answers.</p>
 */

const MIN = 60_000;
const W = Date.UTC(2026, 8, 24, 10, 0, 0);
const M = 50_000;
const key = { entityId: KEY_ID, name: 'prod', fingerprint: 'SHA256:abc' };
const login = { kind: 'ssh-login', user: 'me', service: 'ssh-connection' };

/** Both clocks in the test's hand: wall time `W` and monotonic `M`, moved separately. */
function clocks(): { clock: () => Date; monotonic: () => number; wall: (ms: number) => void; mono: (ms: number) => void } {
  let now = W;
  let monotonic = M;
  return { clock: () => new Date(now), monotonic: () => monotonic, wall: (ms) => (now = ms), mono: (ms) => (monotonic = ms) };
}

async function loaded(
  w: ReturnType<typeof world>,
  options: Parameters<typeof manager>[1] = {},
): Promise<{ instance: ReturnType<typeof manager>['instance']; gate: FakeServer }> {
  const { instance } = manager(w, { keys: { [KEY_ID]: realPrivateKey() }, ...options });
  await instance.load('a1', keyEntity(KEY_ID, 'prod'));
  return { instance, gate: w.server() as FakeServer };
}

test('Ask for Every Use Again ends the window and keeps the key loaded', async () => {
  // R8: only the WINDOW goes. The key object the server holds still signs, and the next signature asks.
  const w = world({ answers: [ALLOW_WINDOW, ALLOW_ONCE] });
  const { instance, gate } = await loaded(w);
  await gate.confirm(key, login);
  const captured = servedKey(w);

  const had = instance.endWindows(KEY_ID);
  assert.equal(await gate.confirm(key, login), true, 'one more answer and it signs');

  assert.equal(w.dialogs.length, 2, 'the button left the window open');
  assert.equal(had, true, 'a window was open, and the button says so');
  assert.equal(instance.isLoaded(KEY_ID), true, 'the button unloaded the key');
  assert.ok(Buffer.isBuffer(captured.sign(SIGNED_BYTES, 0)), 'the captured key object was revoked');
});

test('an answer given across Ask for Every Use Again signs once and opens no window', async () => {
  // The prompt is on screen when the button is used (a row the timer has not repainted yet). Nothing was open,
  // so there is no window to end — but the fence still moves, and the answer is consent for ONE signature.
  const modal = unanswered();
  const w = world({ answers: [modal.answer, ALLOW_ONCE] });
  const { instance, gate } = await loaded(w);

  const pending = gate.confirm(key, login);
  const had = instance.endWindows(KEY_ID);
  modal.clickLate(ALLOW_WINDOW);

  assert.equal(await pending, true, 'the explicit answer allows this one signature');
  await gate.confirm(key, login);
  assert.equal(w.dialogs.length, 2, 'the answer given across the button opened a window');
  assert.equal(had, false, 'no window was open when the button was used');
});

test('an answer given across Ask for Every Use Again is said in the agent log: allowed once, no window was opened', async () => {
  // The audit (Fable): the key fence changes the outcome of a timed answer, so the record must say so.
  const modal = unanswered();
  const w = world({ answers: [modal.answer] });
  const { instance, gate } = await loaded(w);

  const pending = gate.confirm(key, login);
  instance.endWindows(KEY_ID);
  modal.clickLate(ALLOW_WINDOW);
  await pending;

  assert.ok(
    w.logs.some((line) => line.endsWith('"prod": answered "Allow for 10 minutes" after Ask for Every Use Again — allowed once, no window was opened')),
    `the log does not say the answer crossed the button: ${JSON.stringify(w.logs)}`,
  );
});

test('a lock with a key loaded writes the reason line, whether or not a window was open', async () => {
  const w = world({});
  const { instance } = await loaded(w);

  instance.endAllWindows('the vaults were locked');

  assert.ok(
    w.logs.some((line) => line.endsWith('every signing window ended: the vaults were locked')),
    `the reason line is missing: ${JSON.stringify(w.logs)}`,
  );
});

test('a lock with no key loaded is silent: no log line and no output channel', () => {
  // Every lock reaches the agent now (E2.1), so a person who never loaded a key must not get a channel of
  // their own on their first lock.
  const w = world({});
  const { instance } = manager(w, {});

  instance.endAllWindows('the vaults were locked');

  assert.deepEqual(w.logs, [], 'a lock with nothing to end wrote a line');
  assert.equal(w.channels, 0, 'a lock with nothing to end created the output channel');
});

test('a lock after the manager is disposed is harmless: no throw, no line, no channel', async () => {
  // Deactivation disposes the manager; a lock arriving after it (the idle timer's last tick) must not reach
  // the closed log.
  const w = world({});
  const { instance } = await loaded(w);
  instance.dispose();
  const channels = w.channels;

  assert.doesNotThrow(() => instance.endAllWindows('the vaults were locked'));

  assert.equal(w.channels, channels, 'a lock after dispose made a new channel');
});

test('a fence alone is not an open window: the button after a re-load says there was none', async () => {
  // A re-load moves the key's fence (and forgets the key), so the book now HAS an entry for it — but no window.
  const w = world({ answers: [ALLOW_ONCE] });
  const { instance } = await loaded(w);
  await instance.load('a1', keyEntity(KEY_ID, 'prod'));

  assert.equal(instance.endWindows(KEY_ID), false, 'a fence was read as an open window');
});

test('the button on a key that is not loaded says there was no window', () => {
  const w = world({});
  const { instance } = manager(w, {});

  assert.equal(instance.endWindows('nope'), false);
  assert.deepEqual(instance.windowsFor('a1', 'nope'), {});
});

test('the row sees a window of this key while it is open, and none after the button', async () => {
  const w = world({ answers: [ALLOW_WINDOW] });
  const { instance, gate } = await loaded(w);
  assert.deepEqual(instance.windowsFor('a1', KEY_ID), {}, 'nothing is open before the grant');
  await gate.confirm(key, login);

  assert.equal(instance.windowsFor('a1', KEY_ID).all !== undefined, true, 'the open window is not on the row');
  instance.endWindows(KEY_ID);

  assert.deepEqual(instance.windowsFor('a1', KEY_ID), {}, 'the ended window is still on the row');
});

test('a row in another account never shows the window of this key', async () => {
  // The tree asks per (account, node); the manager keys by the bare entity id. A key loaded under one account
  // answers {} for a row of the same id in another.
  const w = world({ answers: [ALLOW_WINDOW] });
  const { instance, gate } = await loaded(w);
  await gate.confirm(key, login);

  assert.deepEqual(instance.windowsFor('another-account', KEY_ID), {}, 'a window leaked into another account');
  assert.equal(instance.windowsFor('a1', KEY_ID).all !== undefined, true, 'and it is still on its own row');
});

test('the row never shows a window the gate would not honour: wall 1 minute, monotonic 11', async () => {
  // Both clocks must permit (I5). The wall clock says 9 minutes are left; the monotonic clock says it is over.
  const c = clocks();
  const w = world({ answers: [ALLOW_WINDOW, ALLOW_ONCE] });
  const { instance, gate } = await loaded(w, { clock: c.clock, monotonic: c.monotonic });
  await gate.confirm(key, login);

  c.wall(W + MIN);
  c.mono(M + 11 * MIN);

  assert.deepEqual(instance.windowsFor('a1', KEY_ID), {}, 'the row shows a window the gate refuses');
  await gate.confirm(key, login);
  assert.equal(w.dialogs.length, 2, 'and the gate agrees: it asked again');
});

test('the row shows the end on BOTH clocks: after the wall clock is set back, the earlier (monotonic) end', async () => {
  // Granted at wall W, mono M: the wall deadline is W+10. Five minutes pass on both clocks, then the wall clock is
  // set back three minutes (W+2) while the monotonic one carries on (M+5): the window really ends ten minutes
  // after the grant on the monotonic clock — five more from now, which is W+7 on the NEW wall time. Both clocks
  // must permit, so the row shows the earlier of the two.
  const c = clocks();
  const w = world({ answers: [ALLOW_WINDOW] });
  const { instance, gate } = await loaded(w, { clock: c.clock, monotonic: c.monotonic });
  await gate.confirm(key, login);

  c.mono(M + 5 * MIN);
  c.wall(W + 2 * MIN);

  assert.equal(instance.windowsFor('a1', KEY_ID).all?.until, W + 7 * MIN, 'the row promised the wall deadline, not the earlier end');
});

test('the row shows the wall deadline when it is the earlier end', async () => {
  const c = clocks();
  const w = world({ answers: [ALLOW_WINDOW] });
  const { instance, gate } = await loaded(w, { clock: c.clock, monotonic: c.monotonic });
  await gate.confirm(key, login);

  c.wall(W + 2 * MIN);
  c.mono(M + 2 * MIN);

  assert.equal(instance.windowsFor('a1', KEY_ID).all?.until, W + ALLOW_WINDOW_MS, 'both clocks agree, so the end is the deadline');
});

test('a window that has ended but is still in the book is dropped and the row repainted, even when no timer is pending', async (t) => {
  // After a clock jump `nextExpiry` finds nothing left to wait for, yet the book still holds the ended window:
  // the next change of the book must arm a look at once, not leave the entry (and the row) behind.
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const c = clocks();
  const w = world({ answers: [ALLOW_WINDOW] });
  const { instance, gate } = await loaded(w, { clock: c.clock, monotonic: c.monotonic });
  await gate.confirm(key, login);
  c.wall(W + 60 * MIN);
  c.mono(M + 60 * MIN);
  instance.endWindows('another-key');
  const changes: string[] = [];
  instance.onWindowsChanged = () => changes.push('changed');

  t.mock.timers.tick(1);

  assert.deepEqual(changes, ['changed'], 'the ended window stayed in the book and the row was not repainted');
});

test('the expiry timer is never armed for more than five minutes, so a clock that jumped is noticed', async (t) => {
  // A laptop wakes with the wall clock an hour on: a timer armed for the full ten minutes would leave the row
  // claiming a window for ten more minutes. At most five minutes late.
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const c = clocks();
  const w = world({ answers: [ALLOW_WINDOW] });
  const { instance, gate } = await loaded(w, { clock: c.clock, monotonic: c.monotonic });
  const changes: string[] = [];
  await gate.confirm(key, login);
  instance.onWindowsChanged = () => changes.push('changed');

  c.wall(W + 60 * MIN);
  c.mono(M + 60 * MIN);
  t.mock.timers.tick(5 * MIN);

  assert.deepEqual(changes, ['changed'], 'the row was not told within five minutes of the window ending');
  assert.deepEqual(instance.windowsFor('a1', KEY_ID), {});
});

test('the expiry timer re-arms: a window that outlives the first look is repainted when it ends', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const c = clocks();
  const w = world({ answers: [ALLOW_WINDOW] });
  const { instance, gate } = await loaded(w, { clock: c.clock, monotonic: c.monotonic });
  const changes: string[] = [];
  await gate.confirm(key, login);
  instance.onWindowsChanged = () => changes.push('changed');

  c.wall(W + 5 * MIN);
  c.mono(M + 5 * MIN);
  t.mock.timers.tick(5 * MIN);
  assert.deepEqual(changes, [], 'five minutes in, the window is still open and nothing changed');

  c.wall(W + ALLOW_WINDOW_MS);
  c.mono(M + ALLOW_WINDOW_MS);
  t.mock.timers.tick(5 * MIN);

  assert.deepEqual(changes, ['changed'], 'the timer was not armed again after the first look');
  assert.deepEqual(instance.windowsFor('a1', KEY_ID), {});
});

test('disposing the manager clears the expiry timer it armed', async (t) => {
  // The timer is unref'd and harmless once the book is empty, so what is observable is the CLEAR itself: the handle
  // the last setTimeout returned (the expiry timer is armed after the click) is handed to clearTimeout by dispose.
  const armed = t.mock.method(globalThis, 'setTimeout');
  const cleared = t.mock.method(globalThis, 'clearTimeout');
  const w = world({ answers: [ALLOW_WINDOW] });
  const { instance, gate } = await loaded(w);
  await gate.confirm(key, login);
  const timer = armed.mock.calls.at(-1)?.result;
  assert.notEqual(timer, undefined, 'a granted window arms the expiry timer');
  const clearedBefore = cleared.mock.callCount();

  instance.dispose();

  const handed = cleared.mock.calls.slice(clearedBefore).map((call) => call.arguments[0]);
  assert.equal(handed.includes(timer), true, 'the expiry timer outlived the manager');
});

test('nothing this suite logged carries key material', () => {
  assertNoKeyMaterialLogged();
});
