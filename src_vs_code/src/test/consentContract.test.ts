import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getEventListeners } from 'node:events';
import { mock, test } from 'node:test';
import { CONSENT_TIMEOUT_MS } from '../agentConsent';
import { BUSY_PLACE, LOCAL_DOOR, TokenlessCeilings, countedOnPlace } from '../aliasThrottle';
import { BRIDGED_BUTTONS, LOCAL_BUTTONS, consentButtons } from '../bridgeConsentText';
import { CONSENT_TIMED_OUT, CONSENT_TIMED_OUT_ON_PLACE, consentTimedOut } from '../brokerProtocol';
import { GRANT_NOT_ALLOWED, consentRefusal } from '../brokerRequests';
import { STAMPS_KEY } from '../mcpConsentPolicy';
import { untilGone } from '../requestLife';
import { Reply, code, message, pause } from './bridgeDoorHarness';
import { LEDGER } from './promptSiteLedger';
import { memento } from './bridgeModules';
import { ACCOUNT, Ask, Door, WallWorld, answeredAtOnce, send, sendAbortable, settleAll, until, viaBridge, viaMain, wallWorld } from './bridgeWallWorld';

/**
 * The consent lifecycle of E1.5 (parent §4.10): the place is the dialog's until a person's act, never a timer's. This file holds the
 * pure half (the sentences, the buttons, the chooser, the place's own rules) and the scenarios through the real broker.
 */

/* ---------------------------------------------------------------------------------------------------------------
 * C2 — the words say what the constant is; and every sentence of the contract is pinned byte for byte
 * ------------------------------------------------------------------------------------------------------------- */

test('C2: both timeout sentences say "within five minutes", and the constant they describe is five minutes', () => {
  assert.ok(CONSENT_TIMED_OUT_ON_PLACE.includes('within five minutes'));
  assert.ok(CONSENT_TIMED_OUT.includes('within five minutes'));
  assert.equal(CONSENT_TIMEOUT_MS, 5 * 60_000);
  assert.equal(CONSENT_TIMEOUT_MS, 300_000);
});

test('S5.3: the sentences of the contract, byte for byte', () => {
  assert.equal(
    BUSY_PLACE,
    "Another request holds this window's dialog place. A consent dialog may be standing unanswered, a prompt that followed an Allow may be open (a PIN box, an install offer, a trust modal), a dependency step may still be running in a terminal, or a request that may prompt again may still be running with nothing on screen yet, in the VS Code window that owns the place. Answer or finish it there, or wait for the running request to end; then try again.",
  );
  assert.equal(
    CONSENT_TIMED_OUT_ON_PLACE,
    "Nobody answered within five minutes. The question is still on the person's screen and keeps this window's shared dialog place until they answer it. This request did not run.",
  );
  assert.equal(CONSENT_TIMED_OUT, "Nobody answered within five minutes. The question is still on the person's screen until they answer it. This request did not run.");
  assert.equal(consentTimedOut(true), CONSENT_TIMED_OUT_ON_PLACE);
  assert.equal(consentTimedOut(false), CONSENT_TIMED_OUT);
  assert.equal(GRANT_NOT_ALLOWED, 'The human did not allow this grant.', 'unchanged');
});

test('C8 (the words): BUSY_PLACE opens with the parent\'s sentence and names the four things the place can be held by', () => {
  assert.ok(BUSY_PLACE.startsWith("Another request holds this window's dialog place."), 'the parent\'s first sentence');
  assert.ok(BUSY_PLACE.includes('nothing on screen yet') && !BUSY_PLACE.includes('is then asked'), 'F4a: the quiet holder is named, and no claim about what the next call will do');
  for (const named of ['consent dialog may be standing unanswered', 'a prompt that followed an Allow may be open', 'a dependency step may still be running', 'a request that may prompt again may still be running', 'the VS Code window that owns the place']) {
    assert.ok(BUSY_PLACE.includes(named), `the help names: ${named}`);
  }
});

/* ---------------------------------------------------------------------------------------------------------------
 * consentRefusal — the one chooser for a consent that was not given, on every door (S5.2)
 * ------------------------------------------------------------------------------------------------------------- */

test('consentRefusal: a Deny is 403 `denied` with the door\'s words; a dismissal is today\'s 504 with the same words; a timeout is the 504 sentence of its door', () => {
  const words = 'The human did not allow this deletion.';
  assert.deepEqual(consentRefusal('denied', words, true), { code: 'denied', message: words });
  assert.deepEqual(consentRefusal('dismissed', words, true), { code: 'consent_timeout', message: words });
  assert.deepEqual(consentRefusal('dismissed', GRANT_NOT_ALLOWED, false), { code: 'consent_timeout', message: GRANT_NOT_ALLOWED });
  assert.deepEqual(consentRefusal('timeout', words, true), { code: 'consent_timeout', message: CONSENT_TIMED_OUT_ON_PLACE });
  assert.deepEqual(consentRefusal('timeout', words, false), { code: 'consent_timeout', message: CONSENT_TIMED_OUT });
});

/* ---------------------------------------------------------------------------------------------------------------
 * C6 (pure) — the buttons by door
 * ------------------------------------------------------------------------------------------------------------- */

test('C6 (pure): a bridged modal puts Deny first; a local one is unchanged', () => {
  assert.deepEqual([...BRIDGED_BUTTONS], ['Deny', 'Allow']);
  assert.deepEqual([...LOCAL_BUTTONS], ['Allow', 'Deny']);
  assert.deepEqual([...consentButtons(true)], ['Deny', 'Allow']);
  assert.deepEqual([...consentButtons(false)], ['Allow', 'Deny']);
});

/* ---------------------------------------------------------------------------------------------------------------
 * countedOnPlace — which dialogs the place counts (H4)
 * ------------------------------------------------------------------------------------------------------------- */

test('countedOnPlace: a bridge\'s dialog, every door; the local alias and MCP doors; never a local token call', () => {
  assert.equal(countedOnPlace('bridge-1', 'token'), true, 'a bridged token call is counted');
  assert.equal(countedOnPlace('bridge-1', 'alias'), true);
  assert.equal(countedOnPlace(undefined, 'alias'), true);
  assert.equal(countedOnPlace(undefined, 'mcp'), true);
  assert.equal(countedOnPlace(undefined, 'token'), false, 'a local token call is counted on no door');
});

/* ---------------------------------------------------------------------------------------------------------------
 * D.3 — a quiet call whose action may prompt again holds the place (unit)
 * ------------------------------------------------------------------------------------------------------------- */

test('D.3: a quiet call with a follow-up holds the place with no dialog; one without holds nothing', () => {
  const ceilings = new TokenlessCeilings();
  const quiet = ceilings.admit(false, 0, LOCAL_DOOR, true);
  assert.equal(quiet.refusal, undefined, 'admitted');
  const asking = ceilings.admit(true, 1);
  assert.equal(asking.refusal?.message, BUSY_PLACE, 'an asking call is told busy while the quiet one holds the place');
  quiet.release();
  assert.equal(ceilings.admit(true, 2).refusal, undefined, 'the place came back when the quiet call ended');

  const plain = new TokenlessCeilings();
  const first = plain.admit(false, 0, LOCAL_DOOR, false);
  assert.equal(first.refusal, undefined);
  assert.equal(plain.admit(true, 1).refusal, undefined, 'a quiet call without a follow-up holds nothing');
  first.release();
});

test('D.3: the quiet call takes the silent window, and a full window gives the place back', () => {
  const ceilings = new TokenlessCeilings();
  for (let call = 1; call <= 60; call += 1) {
    const admitted = ceilings.admit(false, 0, LOCAL_DOOR, true);
    assert.equal(admitted.refusal, undefined, `quiet call ${call}`);
    admitted.release();
  }
  const refused = ceilings.admit(false, 0, LOCAL_DOOR, true);
  assert.ok(refused.refusal?.message.startsWith('Too many requests'), 'the sixty-first is refused by the silent ceiling, not told busy');
  assert.equal(ceilings.admit(true, 0).refusal, undefined, 'and the refusal gave the place back: an asking call is admitted');
});

/* ---------------------------------------------------------------------------------------------------------------
 * C7 — `KEPT_PLACE_MS` does not exist (a guard against the superseded D.2)
 * ------------------------------------------------------------------------------------------------------------- */

const sourceDir = path.resolve(__dirname, '..', '..', 'src');

/** Every non-test source under `src/`, relative to it. */
function shipped(dir = ''): string[] {
  return fs.readdirSync(path.join(sourceDir, dir), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'test' ? [] : shipped(relative);
    }
    return relative.endsWith('.ts') ? [relative] : [];
  });
}

test('C7: no shipped source holds a fixed-time place (KEPT_PLACE_MS), and the scan walked them all', () => {
  const files = shipped();
  assert.ok(files.length > 400, `the scan walked every source (${files.length})`);
  assert.ok(files.includes('aliasThrottle.ts'));
  for (const file of files) {
    assert.equal(fs.readFileSync(path.join(sourceDir, file), 'utf8').includes('KEPT_PLACE_MS'), false, `${file} must not name KEPT_PLACE_MS`);
  }
});

/* ===============================================================================================================
 * Through the real broker: the bridge wall world, with dialogs held and the call's wait lowered
 * ============================================================================================================= */

/** The notice of S5.3 (4), pinned as a literal: `brokerConsent.ts` imports the editor, a test of the words does not. */
const NOTICE = 'That request had already ended, so this answer changed nothing.';

const alias = (command = 'id'): Ask => ({ path: '/v1/alias/exec', body: { alias: 'one', command } });
const mcp = (command = 'id'): Ask => ({ path: '/v1/mcp/use/exec', body: { entry: 'e1', command } });
const create = (): Ask => ({ path: '/v1/mcp/create', body: { name: 'app-03', kind: 'ssh', secret: 'k' } });
const remove = (): Ask => ({ path: '/v1/mcp/delete', body: { entry: 'e1' } });
const tokenAsk = async (ww: WallWorld): Promise<Ask> => ({ path: '/v1/use/exec', token: await ww.tokenFor(ACCOUNT, 'e1', 'prod'), body: { command: 'id' } });

const timedOut = (reply: Reply, sentence: string, what = ''): void => assert.deepEqual([reply.status, code(reply), message(reply)], [504, 'consent_timeout', sentence], what);
const lines = (ww: WallWorld, text: string): string[] => ww.w.audit.filter((line) => line.includes(text));
const ignoredLines = (ww: WallWorld): string[] => lines(ww, '→ ignored');

/** An ask is told `busy` at once, with no dialog of its own. */
async function assertBusy(door: Door, ask: Ask, what: string): Promise<void> {
  const refused = await answeredAtOnce(send(door, ask), `${what}: not answered at once, so it was let in and is waiting on a dialog of its own`);
  assert.deepEqual([refused.status, code(refused), message(refused)], [429, 'too_many_requests', BUSY_PLACE], what);
}

/** The next ask is raised as a dialog (not refused) and Allowed; it ran. */
async function assertAskedThenRuns(ww: WallWorld, door: Door, ask: Ask, what: string): Promise<void> {
  const dialogs = ww.w.openDialogs.length;
  const next = send(door, ask);
  await until(() => ww.w.openDialogs.length === dialogs + 1, `${what}: the next call to be asked`);
  ww.w.openDialogs[dialogs]('Allow');
  assert.equal((await next).status, 200, what);
}

/* ---------------------------------------------------------------------------------------------------------------
 * C1 — the timer answers the call and frees nothing
 * ------------------------------------------------------------------------------------------------------------- */

test('C1: a bridged call whose dialog nobody answers is answered 504 with the place sentence, and the place stays the dialog\'s — every door is busy, no second dialog', async () => {
  const ww = await wallWorld({ holdDialogs: true, consentTimeoutMs: 100 });
  try {
    timedOut(await send(viaBridge(ww.bridge), alias()), CONSENT_TIMED_OUT_ON_PLACE);
    assert.equal(ww.w.dialogs.length, 1);
    await assertBusy(viaBridge(ww.bridge), alias(), 'an alias call through the bridge');
    await assertBusy(viaMain(ww), alias(), 'an alias call through the main port');
    await assertBusy(viaMain(ww), mcp(), 'an MCP call through the main port');
    await assertBusy(viaBridge(ww.bridge), await tokenAsk(ww), 'a token call through the bridge');
    assert.equal(ww.w.dialogs.length, 1, 'and nobody raised a second dialog');
  } finally {
    settleAll(ww);
    ww.dispose();
  }
});

test('C1b: the same through each local door — the place sentence, and the next local alias and MCP calls are busy', async () => {
  for (const [name, ask] of [['alias', alias()], ['MCP', mcp()]] as const) {
    const ww = await wallWorld({ holdDialogs: true, consentTimeoutMs: 100 });
    try {
      timedOut(await send(viaMain(ww), ask), CONSENT_TIMED_OUT_ON_PLACE, `the local ${name} door`);
      await assertBusy(viaMain(ww), alias(), `${name}: the next local alias call`);
      await assertBusy(viaMain(ww), mcp(), `${name}: the next local MCP call`);
      assert.equal(ww.w.dialogs.length, 1, name);
    } finally {
      settleAll(ww);
      ww.dispose();
    }
  }
});

test('C1c: the local token door hears the sentence without the place clause and takes no place — the next local alias call is asked, and so is a second call on the same token', async () => {
  const ww = await wallWorld({ holdDialogs: true, consentTimeoutMs: 100 });
  try {
    const token = await tokenAsk(ww);
    const reply = await send(viaMain(ww), token);
    timedOut(reply, CONSENT_TIMED_OUT);
    assert.equal(message(reply).includes("keeps this window's shared dialog place"), false, 'no place clause: this call held none');
    await assertAskedThenRuns(ww, viaMain(ww), alias(), 'the next local alias call');
    // The stated exception (parent §4.10): a second dialog beside the standing one. Observed, not guarded; nothing here says how the screen shows two.
    const second = send(viaMain(ww), token);
    await until(() => ww.w.openDialogs.length === 3, 'a second call on the same local token to be asked beside the standing dialog');
    timedOut(await second, CONSENT_TIMED_OUT);
  } finally {
    settleAll(ww);
    ww.dispose();
  }
});

test('C1d: a bridged token call is counted — it hears the place clause, and the next bridged call is busy', async () => {
  const ww = await wallWorld({ holdDialogs: true, consentTimeoutMs: 100 });
  try {
    timedOut(await send(viaBridge(ww.bridge), await tokenAsk(ww)), CONSENT_TIMED_OUT_ON_PLACE);
    await assertBusy(viaBridge(ww.bridge), alias(), 'the next bridged call');
    assert.equal(ww.w.dialogs.length, 1);
  } finally {
    settleAll(ww);
    ww.dispose();
  }
});

/** Wait for `done` on the event loop's immediates, which a mocked `setTimeout` leaves alone. */
async function untilImmediate(done: () => boolean, what: string): Promise<void> {
  for (let turn = 0; !done(); turn += 1) {
    assert.ok(turn < 20_000, `timed out waiting for ${what}`);
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

test('C2r: the real five-minute path — nobody answered at 299 s, 504 with the place sentence at 300.1 s, the next local call is busy (no second modal), a late Allow runs nothing, and then the next call is asked', async () => {
  const ww = await wallWorld({ holdDialogs: true });
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    let settled = false;
    const first = send(viaMain(ww), alias()).then((reply) => {
      settled = true;
      return reply;
    });
    await untilImmediate(() => ww.w.openDialogs.length === 1, 'the first local dialog');
    mock.timers.tick(299_000);
    for (let turn = 0; turn < 300; turn += 1) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    assert.equal(settled, false, 'at 299 s nobody has been answered');
    mock.timers.tick(1_100);
    timedOut(await first, CONSENT_TIMED_OUT_ON_PLACE);
    const refused = send(viaMain(ww), alias());
    const raced = await Promise.race([refused, (async (): Promise<string> => { for (let turn = 0; turn < 2_000; turn += 1) { await new Promise<void>((resolve) => setImmediate(resolve)); } return 'pending'; })()]);
    assert.notEqual(raced, 'pending', 'the second call answered at once');
    assert.deepEqual([(raced as Reply).status, message(raced as Reply)], [429, BUSY_PLACE]);
    assert.equal(ww.w.dialogs.length, 1, 'no second modal');
    ww.w.openDialogs[0]('Allow');
    await untilImmediate(() => ignoredLines(ww).length === 1, 'the late click to be read');
    assert.equal(lines(ww, 'ALLOWED').length, 0);
    assert.deepEqual(ww.w.ran, []);
    const second = send(viaMain(ww), alias());
    await untilImmediate(() => ww.w.openDialogs.length === 2, 'the next call to be asked once the dialog was answered');
    ww.w.openDialogs[1]('Allow');
    assert.equal((await second).status, 200);
  } finally {
    mock.timers.reset();
    settleAll(ww);
    ww.dispose();
  }
});

/* ---------------------------------------------------------------------------------------------------------------
 * C3 — a late answer authorises nothing, and says so
 * ------------------------------------------------------------------------------------------------------------- */

const LATE_ALLOW = '"Allow" answered after its call had ended; the answer changed nothing';

test('C3: a late Allow on an expired dialog authorises nothing — one ignored line, no ALLOWED, nothing ran, the notice once, and the next bridged call is asked and runs', async () => {
  const ww = await wallWorld({ holdDialogs: true, consentTimeoutMs: 100 });
  try {
    timedOut(await send(viaBridge(ww.bridge), alias()), CONSENT_TIMED_OUT_ON_PLACE);
    const presence = ww.w.presence;
    ww.w.openDialogs[0]('Allow');
    await until(() => ignoredLines(ww).length === 1, 'the late click to be written');
    const [line] = ignoredLines(ww);
    assert.ok(line.includes(LATE_ALLOW), line);
    assert.equal(line.includes('nothing ran'), false, 'F2a: the old words claimed more than the speaker knows');
    assert.ok(line.includes('bridge=prod_server') || line.includes('bridge='), `the grant field names the bridge: ${line}`);
    assert.equal(lines(ww, 'ALLOWED').length, 0);
    assert.deepEqual(ww.w.ran, []);
    assert.deepEqual(ww.w.consents, []);
    assert.equal(ww.w.presence, presence, 'a late click is not a person at the keyboard');
    assert.deepEqual(ww.w.notices, [NOTICE]);
    await assertAskedThenRuns(ww, viaBridge(ww.bridge), alias(), 'the next bridged call');
    assert.equal(ignoredLines(ww).length, 1, 'still one');
  } finally {
    settleAll(ww);
    ww.dispose();
  }
});

test('C3 (follow-up variant): a late Allow on an action that declares a follow-up frees the place — it is not kept for ever (M23)', async () => {
  const ww = await wallWorld({ holdDialogs: true, consentTimeoutMs: 100, asksAfterConsent: true });
  try {
    timedOut(await send(viaBridge(ww.bridge), alias()), CONSENT_TIMED_OUT_ON_PLACE);
    ww.w.openDialogs[0]('Allow');
    await until(() => ignoredLines(ww).length === 1, 'the late click to be written');
    await assertAskedThenRuns(ww, viaBridge(ww.bridge), alias(), 'the next call');
  } finally {
    settleAll(ww);
    ww.dispose();
  }
});

test('C3b: a late Deny tombstones nothing — one ignored line, no DENIED, the notice, and the next call on the same token is asked, not refused', async () => {
  const ww = await wallWorld({ holdDialogs: true, consentTimeoutMs: 100 });
  try {
    const token = await tokenAsk(ww);
    timedOut(await send(viaMain(ww), token), CONSENT_TIMED_OUT);
    ww.w.openDialogs[0]('Deny');
    await until(() => ignoredLines(ww).length === 1, 'the late click to be written');
    assert.ok(ignoredLines(ww)[0].includes('"Deny" answered after its call had ended; the answer changed nothing'));
    assert.equal(lines(ww, 'DENIED').length, 0);
    assert.deepEqual(ww.w.notices, [NOTICE]);
    await assertAskedThenRuns(ww, viaMain(ww), token, 'the next call on the same token');
  } finally {
    settleAll(ww);
    ww.dispose();
  }
});

test('C3c: a late Escape frees the place and says nothing — no line, no notice, the next call is asked', async () => {
  const ww = await wallWorld({ holdDialogs: true, consentTimeoutMs: 100 });
  try {
    timedOut(await send(viaBridge(ww.bridge), alias()), CONSENT_TIMED_OUT_ON_PLACE);
    ww.w.openDialogs[0](undefined);
    await pause(50);
    assert.deepEqual(ignoredLines(ww), []);
    assert.deepEqual(ww.w.notices, []);
    await assertAskedThenRuns(ww, viaBridge(ww.bridge), alias(), 'the next call');
  } finally {
    settleAll(ww);
    ww.dispose();
  }
});

/* ---------------------------------------------------------------------------------------------------------------
 * C4 — a client that leaves keeps the place until the click, and the click is told
 * ------------------------------------------------------------------------------------------------------------- */

test('C4: a client that leaves during its dialog — the place stays until the click; the click leaves the new line and the notice; nothing ran; the next call is asked', async () => {
  const ww = await wallWorld({ holdDialogs: true });
  try {
    const first = sendAbortable(viaMain(ww), alias());
    first.reply.catch(() => undefined);
    await until(() => ww.w.openDialogs.length === 1, 'the dialog');
    first.abort();
    await until(() => lines(ww, 'ABANDONED').length === 1, 'the abandoned line');
    await assertBusy(viaMain(ww), alias(), 'a second local call while the dialog still stands');
    ww.w.openDialogs[0]('Allow');
    await until(() => ignoredLines(ww).length === 1, 'the late click to be written');
    assert.ok(ignoredLines(ww)[0].includes(LATE_ALLOW), ignoredLines(ww)[0]);
    assert.deepEqual(ww.w.notices, [NOTICE]);
    assert.deepEqual(ww.w.ran, []);
    await assertAskedThenRuns(ww, viaMain(ww), alias(), 'the next call');
  } finally {
    settleAll(ww);
    ww.dispose();
  }
});

test('C4b: the same when the timer fires after the client left — busy through the timer, then one ABANDONED line and one ignored line', async () => {
  const ww = await wallWorld({ holdDialogs: true, consentTimeoutMs: 100 });
  try {
    const first = sendAbortable(viaMain(ww), alias());
    first.reply.catch(() => undefined);
    await until(() => ww.w.openDialogs.length === 1, 'the dialog');
    first.abort();
    await until(() => lines(ww, 'ABANDONED').length === 1, 'the abandoned line');
    await pause(250);
    await assertBusy(viaMain(ww), alias(), 'a second call after the timer fired');
    ww.w.openDialogs[0]('Allow');
    await until(() => ignoredLines(ww).length === 1, 'the late click to be written');
    assert.equal(lines(ww, 'ABANDONED').length, 1);
    assert.equal(ignoredLines(ww).length, 1);
    await assertAskedThenRuns(ww, viaMain(ww), alias(), 'the next call');
  } finally {
    settleAll(ww);
    ww.dispose();
  }
});

/* ---------------------------------------------------------------------------------------------------------------
 * C5 — Escape is a person's act, answered as today
 * ------------------------------------------------------------------------------------------------------------- */

test('C5: an Escape is answered as today — 504 with the grant sentence — and frees the place: the next call is asked, no ignored line, no presence', async () => {
  const ww = await wallWorld({ holdDialogs: true });
  try {
    const first = send(viaMain(ww), alias());
    await until(() => ww.w.openDialogs.length === 1, 'the dialog');
    ww.w.openDialogs[0](undefined);
    timedOut(await first, GRANT_NOT_ALLOWED);
    assert.equal(ww.w.presence, 0);
    assert.deepEqual(ignoredLines(ww), []);
    await assertAskedThenRuns(ww, viaMain(ww), alias(), 'the next call');
  } finally {
    settleAll(ww);
    ww.dispose();
  }
});

/* ---------------------------------------------------------------------------------------------------------------
 * C6 — buttons by door
 * ------------------------------------------------------------------------------------------------------------- */

test('C6: the buttons a dialog is shown with, by door — bridged Deny first, both local doors as before', async () => {
  const ww = await wallWorld({ holdDialogs: true });
  try {
    for (const [door, ask, expected] of [
      [viaBridge(ww.bridge), alias(), ['Deny', 'Allow']],
      [viaMain(ww), alias(), ['Allow', 'Deny']],
      [viaMain(ww), await tokenAsk(ww), ['Allow', 'Deny']],
    ] as const) {
      const shown = ww.w.buttons.length;
      const reply = send(door, ask);
      await until(() => ww.w.buttons.length === shown + 1, 'a dialog');
      assert.deepEqual(ww.w.buttons[shown], expected, ask.path);
      ww.w.openDialogs[shown]('Allow');
      assert.equal((await reply).status, 200);
    }
  } finally {
    settleAll(ww);
    ww.dispose();
  }
});

/* ---------------------------------------------------------------------------------------------------------------
 * C13 — the overnight row
 * ------------------------------------------------------------------------------------------------------------- */

test('C13: ten bridged calls over two seconds with the wait at 100 ms — one 504, nine busy, one dialog; a click clears it and the eleventh is asked', async () => {
  const ww = await wallWorld({ holdDialogs: true, consentTimeoutMs: 100 });
  try {
    const first = send(viaBridge(ww.bridge), alias());
    const tally: string[] = [];
    for (let call = 2; call <= 10; call += 1) {
      await pause(200);
      const reply = await send(viaBridge(ww.bridge), alias());
      tally.push(`${reply.status} ${message(reply) === BUSY_PLACE ? 'busy' : message(reply)}`);
    }
    timedOut(await first, CONSENT_TIMED_OUT_ON_PLACE);
    assert.deepEqual(tally, Array.from({ length: 9 }, () => '429 busy'));
    assert.equal(ww.w.dialogs.length, 1);
    ww.w.openDialogs[0]('Allow');
    await until(() => ignoredLines(ww).length === 1, 'the click to be read');
    await assertAskedThenRuns(ww, viaBridge(ww.bridge), alias(), 'the eleventh call');
  } finally {
    settleAll(ww);
    ww.dispose();
  }
});

/* ---------------------------------------------------------------------------------------------------------------
 * C14 — a late answer writes no stamp
 * ------------------------------------------------------------------------------------------------------------- */

test('C14: with the real consent hooks, a late Allow on a timed-out bridged MCP call writes no stamp, offers nothing to the store, and the next call through the bridge is asked', async () => {
  const state = memento();
  const ww = await wallWorld({ holdDialogs: true, consentTimeoutMs: 100, quiet: true, consent: { ask: 'every12h', state, now: () => 1_700_000_000_000 } });
  try {
    timedOut(await send(viaBridge(ww.bridge), mcp()), CONSENT_TIMED_OUT_ON_PLACE);
    ww.w.openDialogs[0]('Allow');
    await until(() => ignoredLines(ww).length === 1, 'the late click to be written');
    assert.deepEqual(Object.keys(state.get<Record<string, unknown>>(STAMPS_KEY) ?? {}), [], 'the store has no new key');
    assert.deepEqual(ww.w.consents, []);
    assert.equal(lines(ww, 'ALLOWED').length, 0);
    await assertAskedThenRuns(ww, viaBridge(ww.bridge), mcp(), 'the next call through the bridge');
  } finally {
    settleAll(ww);
    ww.dispose();
  }
});

/* ---------------------------------------------------------------------------------------------------------------
 * C15 — create and delete on the MCP door
 * ------------------------------------------------------------------------------------------------------------- */

test('C15: a timed-out create and delete hear the place clause; a dismissal of each is today\'s sentence; busy after the timeout, asked after the dismissal', async () => {
  for (const [name, ask, words] of [['create', create(), 'The human did not allow this.'], ['delete', remove(), 'The human did not allow this deletion.']] as const) {
    const slow = await wallWorld({ holdDialogs: true, consentTimeoutMs: 100 });
    try {
      timedOut(await send(viaMain(slow), ask), CONSENT_TIMED_OUT_ON_PLACE, `${name} timed out`);
      await assertBusy(viaMain(slow), alias(), `${name}: the next call after the timeout`);
    } finally {
      settleAll(slow);
      slow.dispose();
    }
    const escaped = await wallWorld({ holdDialogs: true });
    try {
      const reply = send(viaMain(escaped), ask);
      await until(() => escaped.w.openDialogs.length === 1, `${name}'s dialog`);
      escaped.w.openDialogs[0](undefined);
      timedOut(await reply, words, `${name} dismissed`);
      await assertAskedThenRuns(escaped, viaMain(escaped), alias(), `${name}: the next call after the dismissal`);
    } finally {
      settleAll(escaped);
      escaped.dispose();
    }
  }
});

/* ---------------------------------------------------------------------------------------------------------------
 * C19 — a rejected dialog is an end like any other
 * ------------------------------------------------------------------------------------------------------------- */

const SENTINEL = 'sentinel-window-going-down-5521';

/** `process.on('unhandledRejection')` spy for the length of `body`; what escaped is handed back. */
async function escapedRejections(body: () => Promise<void>): Promise<unknown[]> {
  const escaped: unknown[] = [];
  const spy = (reason: unknown): void => void escaped.push(reason);
  process.on('unhandledRejection', spy);
  try {
    await body();
    await pause(30);
  } finally {
    process.off('unhandledRejection', spy);
  }
  return escaped;
}

test('C19 (a): a dialog that REJECTS after the call timed out frees the place and decides nothing — no line, no notice, no presence, nothing unhandled, the sentinel nowhere', async () => {
  const ww = await wallWorld({ holdDialogs: true, consentTimeoutMs: 100 });
  try {
    const escaped = await escapedRejections(async () => {
      timedOut(await send(viaBridge(ww.bridge), alias()), CONSENT_TIMED_OUT_ON_PLACE);
      ww.w.failDialogs[0](new Error(SENTINEL));
      await pause(50);
    });
    assert.deepEqual(escaped, [], 'nothing escaped as an unhandled rejection');
    assert.deepEqual(ignoredLines(ww), []);
    assert.equal(lines(ww, 'ALLOWED').length + lines(ww, 'DENIED').length, 0);
    assert.deepEqual(ww.w.notices, []);
    assert.equal(ww.w.presence, 0);
    assert.equal(ww.w.audit.some((line) => line.includes(SENTINEL)), false, 'the message is in no journal line');
    await assertAskedThenRuns(ww, viaBridge(ww.bridge), alias(), 'the next call');
  } finally {
    settleAll(ww);
    ww.dispose();
  }
});

test('C19 (b): a dialog that REJECTS before the timer is a dismissal — 504 with the grant sentence, the place freed, nothing applied, nothing unhandled, the sentinel in no body and no line', async () => {
  const ww = await wallWorld({ holdDialogs: true });
  try {
    let reply: Reply | undefined;
    const escaped = await escapedRejections(async () => {
      const pending = send(viaMain(ww), alias());
      await until(() => ww.w.failDialogs.length === 1, 'the dialog');
      ww.w.failDialogs[0](new Error(SENTINEL));
      reply = await pending;
    });
    assert.deepEqual(escaped, []);
    timedOut(reply as Reply, GRANT_NOT_ALLOWED);
    assert.equal((reply as Reply).body.includes(SENTINEL), false);
    assert.equal(ww.w.audit.some((line) => line.includes(SENTINEL)), false);
    assert.equal(ww.w.presence, 0);
    assert.equal(lines(ww, 'ALLOWED').length + lines(ww, 'DENIED').length, 0);
    await assertAskedThenRuns(ww, viaMain(ww), alias(), 'the next call');
  } finally {
    settleAll(ww);
    ww.dispose();
  }
});

/* ---------------------------------------------------------------------------------------------------------------
 * C8 (a) — the facts the help names: a standing dialog
 * ------------------------------------------------------------------------------------------------------------- */

test('C8 (a): a standing dialog — busy with the constant, one dialog open, no second', async () => {
  const ww = await wallWorld({ holdDialogs: true });
  try {
    const standing = send(viaMain(ww), alias());
    await until(() => ww.w.openDialogs.length === 1, 'the dialog');
    await assertBusy(viaMain(ww), alias(), 'an alias call during the dialog');
    assert.deepEqual([ww.w.dialogs.length, ww.w.openDialogs.length], [1, 1]);
    ww.w.openDialogs[0]('Allow');
    assert.equal((await standing).status, 200);
  } finally {
    settleAll(ww);
    ww.dispose();
  }
});

/* ---------------------------------------------------------------------------------------------------------------
 * C9 — D.3: a quiet call that may prompt again holds the place for its length
 * ------------------------------------------------------------------------------------------------------------- */

/** A held action: awaited inside the scripted run, released by the test. */
function heldRun(ww: WallWorld): { release(): void } {
  let release = (): void => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  ww.w.hold = () => gate;
  return { release: () => release() };
}

test('C9: a quiet local MCP call of an action that may prompt again holds the place — both doors are busy with no dialog while it runs, and the next call is asked once it ends', async () => {
  const ww = await wallWorld({ holdDialogs: true, quietLocal: true, asksAfterConsent: true });
  const run = heldRun(ww);
  try {
    const quiet = send(viaMain(ww), mcp());
    await until(() => ww.w.ran.length === 1, 'the quiet call to be inside its action');
    await assertBusy(viaBridge(ww.bridge), alias(), 'a bridged alias call during the quiet run');
    await assertBusy(viaMain(ww), alias(), 'a local alias call during the quiet run');
    assert.equal(ww.w.dialogs.length, 0, 'no dialog was raised by anybody');
    run.release();
    assert.equal((await quiet).status, 200);
    assert.equal(lines(ww, 'allowed without a prompt').length, 1, 'the quiet call\'s own line is written as today');
    await assertAskedThenRuns(ww, viaMain(ww), alias(), 'the next call after the quiet one ended');
  } finally {
    run.release();
    settleAll(ww);
    ww.dispose();
  }
});

test('C9: a quiet call of an action WITHOUT the flag holds nothing — an asking call is asked while it runs (today\'s exec script)', async () => {
  const ww = await wallWorld({ holdDialogs: true, quietLocal: true, asksAfterConsent: false });
  const run = heldRun(ww);
  try {
    const quiet = send(viaMain(ww), mcp());
    await until(() => ww.w.ran.length === 1, 'the quiet call to be inside its action');
    const asking = send(viaMain(ww), alias());
    await until(() => ww.w.openDialogs.length === 1, 'the asking call to be asked while the quiet call runs');
    ww.w.openDialogs[0]('Allow');
    await until(() => ww.w.ran.length === 2, 'the asking call to run');
    run.release();
    assert.deepEqual([(await quiet).status, (await asking).status], [200, 200]);
  } finally {
    run.release();
    settleAll(ww);
    ww.dispose();
  }
});

/* ---------------------------------------------------------------------------------------------------------------
 * C18 — `untilGone` leaves the gate clean
 * ------------------------------------------------------------------------------------------------------------- */

const abortListeners = (signal: AbortSignal): number => getEventListeners(signal, 'abort').length;

test('C18: untilGone leaves the gate clean — 500 settled by the promise on one signal, 500 by the gate, 200 whose promise rejects; a listener stays on no signal that never fires', async () => {
  const shared = new AbortController();
  for (let race = 0; race < 500; race += 1) {
    assert.equal(await untilGone(Promise.resolve(race), shared.signal), race);
    assert.equal(abortListeners(shared.signal), 0, `race ${race}: the shared signal holds a listener from a race that settled`);
  }
  for (let race = 0; race < 500; race += 1) {
    const gate = new AbortController();
    const late: number[] = [];
    let resolveLate: (value: number) => void = () => undefined;
    const pending = untilGone(new Promise<number>((resolve) => void (resolveLate = resolve)), gate.signal, (value) => void late.push(value));
    assert.equal(abortListeners(gate.signal), 1, 'one listener while the race is open');
    gate.abort();
    assert.equal(await pending, undefined);
    assert.equal(abortListeners(gate.signal), 0);
    resolveLate(race);
    resolveLate(race + 1);
    await Promise.resolve();
    assert.deepEqual(late, [race], 'onLate fires once, with the value that resolved the promise after the gate won');
  }
  for (let race = 0; race < 200; race += 1) {
    assert.equal(await untilGone(Promise.reject(new Error('the dialog failed')), shared.signal), undefined, 'a rejection resolves undefined');
    assert.equal(abortListeners(shared.signal), 0);
  }
});

test('C18: with no gate the value comes through; onLate never fires when the promise wins', async () => {
  const late: string[] = [];
  assert.equal(await untilGone(Promise.resolve('answer'), undefined, (value) => void late.push(value)), 'answer');
  const gate = new AbortController();
  assert.equal(await untilGone(Promise.resolve('answer'), gate.signal, (value) => void late.push(value)), 'answer');
  gate.abort();
  await Promise.resolve();
  assert.deepEqual(late, [], 'the promise won: nothing is late');
});

test('C18: a gate that has already fired resolves undefined at once, leaves no listener, and reports the late value', async () => {
  const gate = new AbortController();
  gate.abort();
  const late: string[] = [];
  assert.equal(await untilGone(Promise.resolve('answer'), gate.signal, (value) => void late.push(value)), undefined);
  await Promise.resolve();
  assert.deepEqual(late, ['answer']);
  assert.equal(abortListeners(gate.signal), 0);
});

/* ---------------------------------------------------------------------------------------------------------------
 * C17 — the ledger's three reasons say what the code does now (the table is exact in `promptSites.test.ts`; this reads three words)
 * ------------------------------------------------------------------------------------------------------------- */

/** A ledger row's reason, or the empty string. */
const reasonOf = (id: string): string => LEDGER[id]?.reason ?? '';

test('C17: the prompt-site ledger\'s three reasons say the place is a person\'s, and the two questions are modal on an agent call', () => {
  const shown = reasonOf('brokerConsent.ts#ConsentGate.shown#showWarningMessage#1');
  assert.ok(shown.includes('never a timer'), `the consent dialog's row: ${shown}`);
  assert.equal(shown.includes('`shown` frees'), false, 'it no longer says `shown` frees the place');
  for (const id of ['dependencyRunHost.ts#askToContinue#showInformationMessage#1', 'vpnRun.ts#openVpnConnect#showInformationMessage#1']) {
    assert.ok(reasonOf(id).includes('a modal on an agent call'), `${id}: ${reasonOf(id)}`);
    assert.equal(reasonOf(id).includes('not a modal'), false, `${id} still says it is not a modal`);
  }
});
