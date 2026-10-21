import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { ALLOW_ONCE, ALLOW_WINDOW, ALLOW_WINDOW_MS } from '../agentConsent';
import { localWallTime } from '../requestTime';
import { FakeServer, KEY_ID, assertNoKeyMaterialLogged, keyEntity, manager, realPrivateKey, unanswered, world } from './sshAgentWorld';

/**
 * The window book at the gate (#197, E1.3): "a window belongs to one generation of one key".
 *
 * <p>What the book itself decides is `allowWindows.test.ts`, with no editor in sight. What is only true
 * here is that the manager asks it the right question at the right moment: the generation is read when the
 * request ARRIVES (before the first `await`), a key loaded again starts with no window, and an answer given
 * after the key was removed or replaced opens none. The world is `sshAgentWorld.ts`; keys are the plain
 * objects the old suite passes, so a manager that read `key.generation` off them would refuse every request
 * as "not loaded" — which is what the first assertion of each test would then say.</p>
 */

const MIN = 60_000;
const W = Date.UTC(2026, 8, 24, 10, 0, 0);
const key = { entityId: KEY_ID, name: 'prod', fingerprint: 'SHA256:abc' };
const login = { kind: 'ssh-login', user: 'me', service: 'ssh-connection' };

async function loaded(
  w: ReturnType<typeof world>,
  options: Parameters<typeof manager>[1] = {},
): Promise<{ instance: ReturnType<typeof manager>['instance']; gate: FakeServer }> {
  const { instance } = manager(w, { keys: { [KEY_ID]: realPrivateKey() }, ...options });
  await instance.load('a1', keyEntity(KEY_ID, 'prod'));
  return { instance, gate: w.server() as FakeServer };
}

/** A clock a test moves by hand: wall time `W` until told otherwise. */
function steppedClock(): { clock: () => Date; set: (ms: number) => void } {
  let now = W;
  return { clock: () => new Date(now), set: (ms) => (now = ms) };
}

/** The manager's refusal line is a REASON (the server writes the verdict), and the one phrase is "removed or replaced". */
function assertStaleReason(logs: string[]): void {
  const reason = logs.filter((line) => /answered after the key was removed or replaced — no window was opened/.test(line));
  assert.equal(reason.length, 1, `no stale-key reason in:\n${logs.join('\n')}`);
  assert.ok(!reason[0].includes('REFUSED'), `a reason, not a second verdict: ${reason[0]}`);
  assert.ok(!logs.some((line) => /removed or re-added/.test(line)), 'one phrase for the event: removed or replaced');
}

test('re-adding a key that is already loaded starts it with no window', async () => {
  // A second `load` of an id that is already served is not an unload — and it used to inherit the window.
  const w = world({ answers: [ALLOW_WINDOW, ALLOW_ONCE] });
  const { instance, gate } = await loaded(w);
  await gate.confirm(key, login);

  await instance.load('a1', keyEntity(KEY_ID, 'prod'));
  await gate.confirm(key, login);

  assert.equal(w.dialogs.length, 2, 'the re-loaded key asked again');
});

test('an answer given after Remove from SSH Agent refuses, and says so', async () => {
  const modal = unanswered();
  const w = world({ answers: [modal.answer, ALLOW_ONCE] });
  const { instance, gate } = await loaded(w, { consentTimeoutMs: 1000 });

  const pending = gate.confirm(key, login);
  instance.unload(KEY_ID);
  modal.clickLate(ALLOW_WINDOW);

  assert.equal(await pending, false, 'a window answer for a removed key must not allow');
  assertStaleReason(w.logs);
});

test('Allow for 10 minutes on a prompt whose key was unloaded opens no window for the key loaded next', async () => {
  const modal = unanswered();
  const w = world({ answers: [modal.answer, ALLOW_ONCE] });
  const { instance, gate } = await loaded(w, { consentTimeoutMs: 1000 });

  const pending = gate.confirm(key, login);
  instance.unload(KEY_ID);
  modal.clickLate(ALLOW_WINDOW);
  await pending;
  await instance.load('a1', keyEntity(KEY_ID, 'prod'));
  await (w.server() as FakeServer).confirm(key, login);

  assert.equal(w.dialogs.length, 2, 'the next generation of the key asked for itself');
});

test('an answer given across a re-load refuses, and says so', async () => {
  const modal = unanswered();
  const w = world({ answers: [modal.answer, ALLOW_ONCE] });
  const { instance, gate } = await loaded(w, { consentTimeoutMs: 1000 });

  const pending = gate.confirm(key, login);
  await instance.load('a1', keyEntity(KEY_ID, 'prod'));
  modal.clickLate(ALLOW_WINDOW);

  assert.equal(await pending, false, 'a window answer for a replaced generation must not allow');
  assertStaleReason(w.logs);
});

test('Allow for 10 minutes on a prompt whose key was re-loaded meanwhile opens no window for the new generation', async () => {
  const modal = unanswered();
  const w = world({ answers: [modal.answer, ALLOW_ONCE] });
  const { instance, gate } = await loaded(w, { consentTimeoutMs: 1000 });

  const pending = gate.confirm(key, login);
  await instance.load('a1', keyEntity(KEY_ID, 'prod'));
  modal.clickLate(ALLOW_WINDOW);
  await pending;
  await gate.confirm(key, login);

  assert.equal(w.dialogs.length, 2, 'the new generation prompted for itself');
});

test('every silent signature names the window that allowed it, and until when', async () => {
  const time = steppedClock();
  const w = world({ answers: [ALLOW_WINDOW] });
  const { gate } = await loaded(w, { clock: time.clock });
  await gate.confirm(key, login);

  time.set(W + MIN);
  assert.equal(await gate.confirm(key, login), true);

  const until = localWallTime(new Date(W + ALLOW_WINDOW_MS));
  const granted = localWallTime(new Date(W));
  const line = w.logs.find((l) => l.includes('allowed without asking'));
  assert.ok(line !== undefined, `no "allowed without asking" line in:\n${w.logs.join('\n')}`);
  assert.ok(
    line.includes(`allowed without asking: 10-minute window of "prod" until ${until} (granted ${granted}) for `),
    line,
  );
});

test('the gate reads the injected monotonic clock', async () => {
  // Wall time says one minute has passed; the monotonic clock says eleven. The wall clock alone would cover it.
  const time = steppedClock();
  let mono = 50_000;
  const w = world({ answers: [ALLOW_WINDOW, ALLOW_ONCE] });
  const { gate } = await loaded(w, { clock: time.clock, monotonic: () => mono });
  await gate.confirm(key, login);

  time.set(W + MIN);
  mono += 11 * MIN;
  await gate.confirm(key, login);

  assert.equal(w.dialogs.length, 2, 'the monotonic clock ended the window although the wall clock had not');
});

test('the monotonic clock is read at the click, not when the request arrived', async () => {
  // The prompt is held ten hours into the machine's uptime; five minutes pass before the click. The window
  // runs from the CLICK, so a request twelve minutes after ARRIVAL (seven after the click) is covered.
  // A grant stamped with mono 0, or with the arrival reading, would end it early on the monotonic clock.
  const time = steppedClock();
  const start = 10 * 60 * MIN;
  let mono = start;
  const modal = unanswered();
  const w = world({ answers: [modal.answer, ALLOW_ONCE] });
  const { gate } = await loaded(w, { clock: time.clock, monotonic: () => mono, consentTimeoutMs: 60 * MIN });

  const pending = gate.confirm(key, login);
  time.set(W + 5 * MIN);
  mono = start + 5 * MIN;
  modal.clickLate(ALLOW_WINDOW);
  assert.equal(await pending, true, 'the answer allows');
  time.set(W + 12 * MIN);
  mono = start + 12 * MIN;

  assert.equal(await gate.confirm(key, login), true);
  assert.equal(w.dialogs.length, 1, 'the second request was covered by the window, without a dialog');
});

test('the window runs ten minutes from ONE reading of the clock at the click', async () => {
  // A wall clock that advances six minutes per read: arrival reads W+6, the click W+12, the next arrival W+18.
  // The window is (granted W+12, until W+22). Two reads at the click would split grantedAt from until.
  let reads = 0;
  const w = world({ answers: [ALLOW_WINDOW, ALLOW_ONCE] });
  const { gate } = await loaded(w, { clock: () => new Date(W + 6 * MIN * ++reads), monotonic: () => 50_000 });

  assert.equal(await gate.confirm(key, login), true);
  assert.equal(await gate.confirm(key, login), true);

  assert.equal(w.dialogs.length, 1, 'the second request arrived inside the window');
  const line = w.logs.find((l) => l.includes('allowed without asking'));
  assert.ok(line !== undefined, `no "allowed without asking" line in:\n${w.logs.join('\n')}`);
  const until = localWallTime(new Date(W + 22 * MIN));
  const granted = localWallTime(new Date(W + 12 * MIN));
  assert.ok(line.includes(`until ${until} (granted ${granted})`), line);
});

test('a key loaded again gets its own window — the old generation window does not shadow it', async () => {
  // Pins the PAIR: the manager forgets the old window on a re-load, and the book would not let a generation-1
  // window block a generation-2 grant even if it did not.
  // A stopped clock: both generations are granted the very same `until`, which is what an old window used to win.
  const time = steppedClock();
  const w = world({ answers: [ALLOW_WINDOW, ALLOW_WINDOW, ALLOW_ONCE] });
  const { instance, gate } = await loaded(w, { clock: time.clock });
  assert.equal(await gate.confirm(key, login), true, 'generation 1 opens its window');

  await instance.load('a1', keyEntity(KEY_ID, 'prod'));
  assert.equal(await gate.confirm(key, login), true, 'generation 2 prompts and opens its own window');
  assert.equal(await gate.confirm(key, login), true, 'generation 2 is covered by it');

  assert.equal(w.dialogs.length, 2, 'one prompt per generation, none for the covered request');
});

test('a request for a key that is not loaded is refused without a dialog', async () => {
  const w = world({ answers: [ALLOW_ONCE] });
  const { gate } = await loaded(w);

  const allowed = await gate.confirm({ entityId: 'ghost', name: 'ghost', fingerprint: 'SHA256:g' }, login);

  assert.equal(allowed, false);
  assert.equal(w.dialogs.length, 0, 'nothing to ask about');
  const reason = w.logs.filter((line) => /the key is not loaded/.test(line));
  assert.equal(reason.length, 1, `no "the key is not loaded" line in:\n${w.logs.join('\n')}`);
  assert.ok(!reason[0].includes('REFUSED'), `a reason, not a second verdict: ${reason[0]}`);
  // The LAST test of the file: node:test runs a file in order, so every log of the suite has been written.
  assertNoKeyMaterialLogged();
});
