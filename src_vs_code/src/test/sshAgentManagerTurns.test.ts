import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ALLOW_ONCE, ALLOW_WINDOW } from '../agentConsent';
import { FakeServer, KEY_ID, keyEntity, keyMaterialLogged, manager, realPrivateKey, unanswered, world } from './sshAgentWorld';

/**
 * One prompt per key at a time, and an answer that comes late or across a fence opens nothing (#197, E2.3) —
 * T1–T16 of the spec, through the real manager and its stub server. `m1` is always the FIRST modal, unanswered
 * until the test clicks it (`clickLate`), which is how a modal that VS Code cannot close behaves.
 */

const MIN = 60_000;
/** The test's monotonic clock starts here, never at 0. */
const M = 50_000;
const KEY = { entityId: KEY_ID, name: 'prod', fingerprint: 'SHA256:abc' };
const AUTH = { kind: 'auth' };

const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** The answer if it comes within half a second, `'slow'` if not — a request queued behind a held modal is slow. */
async function atOnce<T>(promise: Promise<T>): Promise<T | 'slow'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const slow = new Promise<'slow'>((resolve) => {
    timer = setTimeout(() => resolve('slow'), 500);
  });
  try {
    return await Promise.race([promise, slow]);
  } finally {
    clearTimeout(timer);
  }
}

/** A manager with the key loaded, and `ask()` — one signing request, as the server hands it over. */
async function loaded(options: {
  answers: (string | undefined | Promise<string>)[];
  consentTimeoutMs?: number;
  monotonic?: () => number;
  clock?: () => Date;
  extraKey?: string;
}): Promise<{
  w: ReturnType<typeof world>;
  instance: ReturnType<typeof manager>['instance'];
  ask: (signal?: AbortSignal) => Promise<boolean>;
}> {
  const w = world({ answers: options.answers });
  const keys = { [KEY_ID]: realPrivateKey(), ...(options.extraKey === undefined ? {} : { [options.extraKey]: realPrivateKey() }) };
  const { instance } = manager(w, { keys, consentTimeoutMs: options.consentTimeoutMs, monotonic: options.monotonic, clock: options.clock });
  await instance.load('a1', keyEntity(KEY_ID, 'prod'));
  return { w, instance, ask: (signal) => (w.server() as FakeServer).confirm(KEY, AUTH, undefined, signal) };
}

test('T1 a second request for the same key waits for the open prompt', async () => {
  const m1 = unanswered();
  const { w, ask } = await loaded({ answers: [m1.answer, ALLOW_ONCE] });
  const r1 = ask();
  const r2 = ask();
  await tick();
  assert.equal(w.dialogs.length, 1, 'one modal per key at a time');

  m1.clickLate(ALLOW_ONCE);

  assert.equal(await r1, true);
  assert.equal(await r2, true);
  assert.equal(w.dialogs.length, 2);
  assert.equal(w.presence, 2, 'Allow once authorised only its own signature — the waiting request still asked');
});

test('T2 a window opened by the first prompt covers the waiting request without a prompt', async () => {
  const m1 = unanswered();
  const { w, ask } = await loaded({ answers: [m1.answer] });
  const r1 = ask();
  const r2 = ask();
  await tick();

  m1.clickLate(ALLOW_WINDOW);

  assert.deepEqual(await Promise.all([r1, r2]), [true, true]);
  assert.equal(w.dialogs.length, 1, 'the answer was applied inside the first turn, before the second began');
});

test('T3 different keys do not wait for each other', async () => {
  const m1 = unanswered();
  const w = world({ answers: [m1.answer, ALLOW_ONCE] });
  const { instance } = manager(w, { keys: { [KEY_ID]: realPrivateKey(), 'key-2': realPrivateKey() } });
  await instance.load('a1', keyEntity(KEY_ID, 'prod'));
  await instance.load('a1', keyEntity('key-2', 'staging'));
  const gate = w.server() as FakeServer;

  const held = gate.confirm(KEY, AUTH);
  await tick();
  const other = gate.confirm({ entityId: 'key-2', name: 'staging', fingerprint: 'SHA256:def' }, AUTH);

  assert.equal(await atOnce(other), true);
  assert.equal(w.dialogs.length, 2);
  m1.clickLate(ALLOW_ONCE);
  await held;
});

test('T4 a request whose key was re-added while it waited is refused without a prompt', async () => {
  const m1 = unanswered();
  const { w, instance, ask } = await loaded({ answers: [m1.answer, ALLOW_ONCE] });
  const r1 = ask();
  const r2 = ask();
  await tick();

  await instance.load('a1', keyEntity(KEY_ID, 'prod')); // a new generation
  m1.clickLate(ALLOW_ONCE);

  await r1;
  assert.equal(await r2, false);
  assert.equal(w.dialogs.length, 1, 'no modal for a key that is no longer the one asked about');
  assert.ok(w.logs.some((line) => /removed or re-added while the request waited/.test(line)), w.logs.join('\n'));
});

test('T5 a request whose client has gone leaves the queue and is never shown', async () => {
  const m1 = unanswered();
  const { w, ask } = await loaded({ answers: [m1.answer, ALLOW_ONCE] });
  const r1 = ask();
  const client = new AbortController();
  const r2 = ask(client.signal);
  await tick();

  client.abort();
  assert.equal(await atOnce(r2), false, 'it left at once, not when the open prompt ended');
  m1.clickLate(ALLOW_ONCE);
  await r1;

  assert.equal(await ask(), true);
  assert.equal(w.dialogs.length, 2, 'the request that left was never shown');
});

test('T6 the fifth request (1 open + 3 waiting) is refused at once and never shown later', async () => {
  const m1 = unanswered();
  const { w, ask } = await loaded({ answers: [m1.answer, ALLOW_ONCE, ALLOW_ONCE, ALLOW_ONCE] });
  const waiting = [ask(), ask(), ask(), ask()];
  const fifth = ask();

  assert.equal(await atOnce(fifth), false);
  assert.equal(w.dialogs.length, 1);
  m1.clickLate(ALLOW_ONCE);

  assert.deepEqual(await Promise.all(waiting), [true, true, true, true]);
  assert.equal(w.dialogs.length, 4, 'the refused fifth never got a modal');
});

test('T7 a burst of refusals at the cap writes one log line, and the cap is per open turn', async () => {
  const m1 = unanswered();
  const { w, ask } = await loaded({ answers: [m1.answer, ALLOW_ONCE, ALLOW_ONCE, ALLOW_ONCE, ALLOW_ONCE] });
  const waiting = [ask(), ask(), ask(), ask()];
  assert.equal(await atOnce(ask()), false);
  assert.equal(await atOnce(ask()), false);
  assert.equal(w.logs.filter((line) => /too many requests are waiting/.test(line)).length, 1, w.logs.join('\n'));

  m1.clickLate(ALLOW_ONCE);
  await Promise.all(waiting);

  assert.equal(await ask(), true, 'once the queue drained, a new request is shown');
  assert.equal(w.dialogs.length, 5);
});

test('T8 a request that waited says the time it really has left', async () => {
  const m1 = unanswered();
  let mono = M;
  const { w, ask } = await loaded({ answers: [m1.answer, ALLOW_ONCE], monotonic: () => mono });
  const r1 = ask();
  const r2 = ask();
  await tick();

  mono += 4 * MIN;
  m1.clickLate(ALLOW_ONCE);
  await r1;
  await r2;

  assert.match(w.dialogs[0], /refused after 5 minutes\./);
  assert.match(w.dialogs[1], /refused after 60 seconds\./, 'under two minutes the time left is told in seconds');
});

test('T9 a waiter left with less than the floor is refused at its turn, never shown a modal it cannot answer', async () => {
  const m1 = unanswered();
  let mono = M;
  const { w, ask } = await loaded({ answers: [m1.answer, ALLOW_ONCE], monotonic: () => mono });
  const r1 = ask();
  const r2 = ask();
  await tick();

  mono += 4 * MIN + 54_000; // 6 s left of 5 minutes: under the 15 s floor
  m1.clickLate(ALLOW_ONCE);
  await r1;

  assert.equal(await r2, false);
  assert.equal(w.dialogs.length, 1);
  assert.ok(w.logs.some((line) => /waited too long behind another prompt/.test(line)), w.logs.join('\n'));
});

test('T10 the time left is read from the monotonic clock, not the wall clock', async () => {
  const m1 = unanswered();
  const mono = M;
  let wall = Date.UTC(2026, 9, 21, 9, 0, 0);
  const { w, ask } = await loaded({ answers: [m1.answer, ALLOW_ONCE], monotonic: () => mono, clock: () => new Date(wall) });
  const r1 = ask();
  const r2 = ask();
  await tick();

  wall += 4 * MIN + 54_000; // only the wall clock moves (a laptop waking, a clock set)
  m1.clickLate(ALLOW_ONCE);
  await r1;
  await r2;

  assert.equal(w.dialogs.length, 2, 'the wall clock jump did not refuse the waiter');
  assert.match(w.dialogs[1], /refused after 5 minutes\./);
});

test('T11 while an orphaned modal holds the key, a new request is refused at once; answering the orphan signs nothing, says so, and frees the key', async () => {
  const m1 = unanswered();
  const { w, ask } = await loaded({ answers: [m1.answer, ALLOW_ONCE], consentTimeoutMs: 20 });

  assert.equal(await ask(), false);
  assert.ok(w.logs.some((line) => /no answer in 1 second — refused/.test(line)), w.logs.join('\n'));

  assert.equal(await atOnce(ask()), false, 'refused at once, not queued behind the modal still on screen');
  assert.equal(w.dialogs.length, 1, 'no second modal beside the orphan');
  assert.equal(w.infos.length, 1);
  assert.match(w.infos[0], /still open from an earlier request/);
  assert.equal(await ask(), false);
  assert.equal(w.infos.length, 1, 'one notice per orphaned modal');

  m1.clickLate(ALLOW_WINDOW);
  await tick();
  assert.equal(w.presence, 0, 'nothing was signed for the orphan');
  assert.match(w.infos[1], /had already been refused/);

  assert.equal(await ask(), true, 'the key is free again');
  assert.equal(w.dialogs.length, 2);
});

test('T12 a click on a prompt whose turn ended signs nothing, and says so', async () => {
  const m1 = unanswered();
  const { w, ask } = await loaded({ answers: [m1.answer, ALLOW_ONCE], consentTimeoutMs: 20 });
  assert.equal(await ask(), false);

  m1.clickLate(ALLOW_WINDOW);
  await tick();

  assert.equal(w.infos.length, 1);
  assert.match(w.infos[0], /waited longer than 1 second, or its program had gone/);
  assert.equal(w.presence, 0);
  assert.equal(await ask(), true, 'and the late Allow opened no window: the next request asks');
  assert.equal(w.dialogs.length, 2);
});

test('T12b Escape on a prompt whose turn ended is not a click, and says nothing', async () => {
  let escape: (choice: string) => void = () => undefined;
  const modal = new Promise<string>((resolve) => {
    escape = resolve;
  });
  const { w, ask } = await loaded({ answers: [modal, ALLOW_ONCE], consentTimeoutMs: 20 });
  assert.equal(await ask(), false);

  escape(undefined as never); // Escape / the window closing: VS Code resolves the modal with `undefined`
  await tick();

  assert.equal(w.infos.length, 0, 'there was no label to say nothing was done with');
  assert.equal(await ask(), true, 'and the dismissed modal freed the key');
});

test('T13 an answer given across a lock: once, no window, and the message says the vault locked', async () => {
  const m1 = unanswered();
  const { w, instance, ask } = await loaded({ answers: [m1.answer, ALLOW_ONCE] });
  const r1 = ask();

  instance.endAllWindows('the vaults were locked');
  m1.clickLate(ALLOW_WINDOW);

  assert.equal(await r1, true, 'the one signature is allowed');
  assert.match(w.infos[0], /vault locked while you were choosing/);
  assert.equal(await ask(), true);
  assert.equal(w.dialogs.length, 2, 'no window was opened');
});

test('T14 an answer given across Ask for Every Use Again: once, no window, and the message says so', async () => {
  const m1 = unanswered();
  const { w, instance, ask } = await loaded({ answers: [m1.answer, ALLOW_ONCE] });
  const r1 = ask();

  instance.endWindows(KEY_ID);
  m1.clickLate(ALLOW_WINDOW);

  assert.equal(await r1, true);
  assert.match(w.infos[0], /Ask for Every Use Again was used while you were choosing/);
  assert.equal(await ask(), true);
  assert.equal(w.dialogs.length, 2);
});

test('T15 a lock while a request waits does not fence the answer given after its turn starts', async () => {
  const m1 = unanswered();
  const { w, instance, ask } = await loaded({ answers: [m1.answer, ALLOW_WINDOW] });
  const r1 = ask();
  const r2 = ask();
  await tick();

  instance.endAllWindows('lock'); // while r2 still waits
  m1.clickLate(ALLOW_ONCE);
  await r1;

  assert.equal(await r2, true);
  assert.equal(await ask(), true);
  assert.equal(w.dialogs.length, 2, 'r2 was fenced by nothing: its window covers the third request');
  assert.equal(w.infos.length, 0);
});

test('T16 disposing during a queue refuses everything, shows nothing and logs nothing afterwards', async () => {
  const m1 = unanswered();
  // The default bound: nothing here may be refused by TIME — only dispose() can end the open turn and the two waiters.
  const { w, instance, ask } = await loaded({ answers: [m1.answer] });
  const requests = [ask(), ask(), ask()];
  await tick();

  instance.dispose();
  const written = w.logs.length;

  assert.deepEqual(await atOnce(Promise.all(requests)), [false, false, false]);
  m1.clickLate(ALLOW_WINDOW);
  await tick();

  assert.equal(w.logs.length, written, 'no log line after the window closed');
  assert.equal(w.infos.length, 0);
  assert.equal(w.dialogs.length, 1);
});

test('T17 the waiter is known to have waited even when the monotonic clock does not move', async () => {
  // `waited` is said by the queue, not inferred from the time left: with a clock frozen at M the time left equals the
  // whole bound for a waiter too, and the window re-check must still run.
  const m1 = unanswered();
  const { w, ask } = await loaded({ answers: [m1.answer], monotonic: () => M });
  const r1 = ask();
  const r2 = ask();
  await tick();

  m1.clickLate(ALLOW_WINDOW);

  assert.deepEqual(await Promise.all([r1, r2]), [true, true]);
  assert.equal(w.dialogs.length, 1, 'the window the first prompt opened covered the waiter');
});

test('T18 a waiter that a window covers is answered by the window even with less than the floor left', async () => {
  const m1 = unanswered();
  let mono = M;
  const { w, ask } = await loaded({ answers: [m1.answer], monotonic: () => mono });
  const r1 = ask();
  const r2 = ask();
  await tick();

  mono += 4 * MIN + 54_000; // 6 s left of 5 minutes: under the 15 s floor
  m1.clickLate(ALLOW_WINDOW);

  assert.equal(await r1, true);
  assert.equal(await r2, true, 'covered, so signed silently — not refused for want of time');
  assert.equal(w.dialogs.length, 1);
  assert.equal(w.logs.some((line) => /waited too long behind another prompt/.test(line)), false, w.logs.join('\n'));
});

test('T19 the time left is told rounded DOWN, and in seconds under two minutes', async () => {
  const cases: [number, RegExp][] = [
    [30_000, /refused after 30 seconds\./],
    [45_000, /refused after 45 seconds\./],
    [210_000, /refused after 3 minutes\./],
  ];
  for (const [left, expected] of cases) {
    const m1 = unanswered();
    let mono = M;
    const { w, ask } = await loaded({ answers: [m1.answer, ALLOW_ONCE], monotonic: () => mono });
    const r1 = ask();
    const r2 = ask();
    await tick();

    mono += 5 * MIN - left;
    m1.clickLate(ALLOW_ONCE);
    await r1;
    await r2;

    assert.match(w.dialogs[1], expected, `with ${left} ms left`);
  }
});

/** Ways a client's `close` can arrive right after the click: the next macrotask, the one after, a timer. */
const GOES_AWAY_AFTER_THE_CLICK: [string, (abort: () => void) => void][] = [
  ['setImmediate', (abort) => void setImmediate(abort)],
  ['setImmediate twice', (abort) => void setImmediate(() => setImmediate(abort))],
  ['setTimeout 0', (abort) => void setTimeout(abort, 0)],
];

for (const [name, later] of GOES_AWAY_AFTER_THE_CLICK) {
  test(`R4 a client that goes away (${name}) right after the click either loses to the answer or wins entirely`, async () => {
    // The answer is applied in the SAME continuation that checks the turn (`turnStarted`): no macrotask — the
    // client's close, the bound timer — can run between the check and the window. So the request either was answered
    // (signed, window open) or refused (nothing signed, NO window); never refused with a window, never signed without.
    const m1 = unanswered();
    const { w, instance, ask } = await loaded({ answers: [m1.answer] });
    const client = new AbortController();
    const r1 = ask(client.signal);
    await tick();

    m1.clickLate(ALLOW_WINDOW);
    later(() => client.abort());
    const signed = await r1;
    await new Promise((resolve) => setTimeout(resolve, 5));

    const windowOpen = Object.keys(instance.windowsFor('a1', KEY_ID)).length > 0;
    assert.equal(windowOpen, signed, `signed=${signed} but window=${windowOpen}: an answer applied outside its turn`);
    assert.equal(w.infos.length, signed ? 0 : 1, signed ? 'answered: nothing to tell' : 'refused: the click is told it signed nothing');
    instance.dispose();
  });
}

test('nothing this suite logged carries key material', () => {
  assert.deepEqual(keyMaterialLogged(), [], 'a log line carries key material');
});
