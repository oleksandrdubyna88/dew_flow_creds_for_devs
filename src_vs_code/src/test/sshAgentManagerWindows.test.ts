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
 * after the key was removed or re-added opens none. The world is `sshAgentWorld.ts`; keys are the plain
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

test('re-adding a key that is already loaded starts it with no window', async () => {
  // A second `load` of an id that is already served is not an unload — and it used to inherit the window.
  const w = world({ answers: [ALLOW_WINDOW, ALLOW_ONCE] });
  const { instance, gate } = await loaded(w);
  await gate.confirm(key, login);

  await instance.load('a1', keyEntity(KEY_ID, 'prod'));
  await gate.confirm(key, login);

  assert.equal(w.dialogs.length, 2, 'the re-loaded key asked again');
  assertNoKeyMaterialLogged();
});

test('an answer given after Remove from SSH Agent refuses, and says so', async () => {
  const modal = unanswered();
  const w = world({ answers: [modal.answer, ALLOW_ONCE] });
  const { instance, gate } = await loaded(w, { consentTimeoutMs: 1000 });

  const pending = gate.confirm(key, login);
  instance.unload(KEY_ID);
  modal.clickLate(ALLOW_WINDOW);

  assert.equal(await pending, false, 'a window answer for a removed key must not allow');
  assert.ok(w.logs.some((line) => /REFUSED .* removed or re-added/.test(line)), `no refusal line in:\n${w.logs.join('\n')}`);
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
  assert.ok(w.logs.some((line) => /REFUSED .* removed or re-added/.test(line)), `no refusal line in:\n${w.logs.join('\n')}`);
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

test('a request for a key that is not loaded is refused without a dialog', async () => {
  const w = world({ answers: [ALLOW_ONCE] });
  const { gate } = await loaded(w);

  const allowed = await gate.confirm({ entityId: 'ghost', name: 'ghost', fingerprint: 'SHA256:g' }, login);

  assert.equal(allowed, false);
  assert.equal(w.dialogs.length, 0, 'nothing to ask about');
  assert.ok(w.logs.some((line) => /not loaded/.test(line)), `no "not loaded" line in:\n${w.logs.join('\n')}`);
});
