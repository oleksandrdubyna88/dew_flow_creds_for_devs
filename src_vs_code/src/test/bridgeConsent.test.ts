import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseAuditLine } from '../agentAuditLog';
import type { McpAskPolicy } from '../mcpAccess';
import { ConsentStamps, STAMPS_KEY, stampKey } from '../mcpConsentPolicy';
import { code, message } from './bridgeDoorHarness';
import { memento, put } from './bridgeModules';
import { ACCOUNT, CONTEXT_1, SERVER, Ask, Door, WallWorld, send, sendAbortable, settleAll, until, viaBridge, viaMain, wallWorld } from './bridgeWallWorld';

/**
 * Per-server consent, the modal line and the audit line (E1.4, C4-C22).
 *
 * <p>Through the real broker, real listeners, the real `mcpUseHooks` over a real vault and a store that holds what a
 * `Memento` would: the question is what SILENCES a prompt on a bridge, and every answer here comes from the code that
 * decides it in a window. The stamp clock is the test's own, apart from the throttle's, so "past twelve hours" is one line.</p>
 */

const NOW = 1_700_000_000_000;
const HOURS_12 = 12 * 60 * 60 * 1000;
const CONTEXT_B = { ...CONTEXT_1, bridgeId: 'bridge-B', serverEntityId: 'server-B', serverName: 'second server' };
const DENIED = 'The human did not allow this grant.';
const NOT_FOUND = 'No such entry, or this window does not serve it.';
const OFF = 'Allowing covers this call only.';
const ON = "Allowing follows this entry's own consent setting, for this server only: not for another server, and not for this computer.";
const TOKEN_TAIL = 'Allowing covers every later call on this token';
const LAPTOP = 'Through the Remote Bridge of "prod server". It runs on this computer, and only its output goes to that server.';
const SILENT_SENTENCE = 'Too many requests: this Remote Bridge may make at most 60 silent calls a minute — ones a consent policy lets through without a prompt.';

const mcp = (command = 'id'): Ask => ({ path: '/v1/mcp/use/exec', body: { entry: 'e1', command } });
const alias = (command = 'id'): Ask => ({ path: '/v1/alias/exec', body: { alias: 'one', command } });

interface Consenting {
  readonly ww: WallWorld;
  readonly state: ReturnType<typeof memento>;
  readonly clock: { now: number };
  /** The keys of the stamp map: what has been remembered, under what. */
  keys(): string[];
  /** The journal's lines since the world was built: the share that hands the world its token is setup, not a call. */
  journal(): string[];
}

/** A world whose folder asks `ask`, whose stamps live in a store of their own, and whose stamp clock the test moves. */
async function consenting(ask: McpAskPolicy, quiet: boolean, options: Parameters<typeof wallWorld>[0] = {}): Promise<Consenting> {
  const state = memento();
  const clock = { now: NOW };
  const ww = await wallWorld({ ...options, quiet, consent: { ask, state, now: () => clock.now } });
  const setup = ww.w.audit.length;
  return { ww, state, clock, keys: () => Object.keys(state.get<Record<string, unknown>>(STAMPS_KEY) ?? {}), journal: () => ww.w.audit.slice(setup) };
}

/** Turn a bridge's `quiet` switch, keeping its entries: what the picker of E2 will do through the scope file. */
async function setQuiet(ww: WallWorld, quiet: boolean, context = CONTEXT_1): Promise<void> {
  const entries = [...ww.scopes.read(context.accountId, context.serverEntityId).entries];
  await put(ww.scopes, context.accountId, context.serverEntityId, entries, quiet);
}

async function ok(door: Door, ask: Ask = mcp()): Promise<void> {
  const reply = await send(door, ask);
  assert.equal(reply.status, 200, reply.body);
}

const A = (c: Consenting): Door => viaBridge(c.ww.bridge);
const LOCAL = (c: Consenting): Door => viaMain(c.ww);

/* ---------------------------------------------------------------------------------------------------------------
 * C4-C9, C16 — what silences a prompt on a bridge
 * ------------------------------------------------------------------------------------------------------------- */

test('C4: quiet off asks every time — never-ask, and every-12h with a fresh stamp from local use — and writes no stamp', async () => {
  const never = await consenting('never', false);
  try {
    await ok(A(never));
    await ok(A(never));
    assert.equal(never.ww.w.dialogs.length, 2, 'never-ask does not silence a bridge whose quiet switch is off');
    assert.deepEqual(never.ww.w.consents, [], 'and nothing was offered to the store');
  } finally {
    never.ww.dispose();
  }
  const every = await consenting('every12h', false);
  try {
    await ok(LOCAL(every));
    assert.deepEqual(every.keys(), [stampKey(ACCOUNT, 'e1')], 'the fixture: local use has a fresh stamp');
    await ok(LOCAL(every));
    assert.equal(every.ww.w.dialogs.length, 1, 'the fixture: local use is quiet now');
    for (let call = 0; call < 3; call += 1) {
      await ok(A(every));
    }
    assert.equal(every.ww.w.dialogs.length, 4, 'the bridge asked all three times');
    assert.equal(every.ww.w.consents.length, 1, 'and its answers were not offered to the store: only the local answer was');
    assert.deepEqual(every.keys(), [stampKey(ACCOUNT, 'e1')], 'no new key');
  } finally {
    every.ww.dispose();
  }
});

test('C5: quiet on follows the entry\'s own setting — never is silent and says so, every-12h asks once then not within the window, always asks every time', async () => {
  const never = await consenting('never', true);
  try {
    await ok(A(never));
    await ok(A(never));
    assert.deepEqual(never.ww.w.dialogs, [], 'never-ask, quiet on: nobody is asked');
    const said = never.ww.w.audit.filter((line) => line.includes('allowed without a prompt'));
    assert.equal(said.length, 2, 'and each call says so in the journal');
    assert.match(said[0], /consent prod \(\S+… bridge=prod_server\) via mcp → allowed without a prompt/);
    assert.equal(never.ww.w.ran.length, 2);
  } finally {
    never.ww.dispose();
  }
  const every = await consenting('every12h', true);
  try {
    await ok(A(every));
    assert.equal(every.ww.w.dialogs.length, 1, 'the first call asks');
    await ok(A(every));
    await ok(A(every));
    assert.equal(every.ww.w.dialogs.length, 1, 'and the next two, inside the window, do not');
    every.clock.now = NOW + HOURS_12 - 1;
    await ok(A(every));
    assert.equal(every.ww.w.dialogs.length, 1, 'a millisecond inside twelve hours');
    every.clock.now = NOW + HOURS_12 + 1;
    await ok(A(every));
    assert.equal(every.ww.w.dialogs.length, 2, 'past it, it asks again');
  } finally {
    every.ww.dispose();
  }
  const always = await consenting('always', true);
  try {
    for (let call = 0; call < 3; call += 1) {
      await ok(A(always));
    }
    assert.equal(always.ww.w.dialogs.length, 3, 'always asks every time, whatever quiet says');
    assert.deepEqual(always.keys(), [], 'and remembers nothing');
  } finally {
    always.ww.dispose();
  }
});

test('C6: a stamp given through A covers neither B nor local use — and the reverse', async () => {
  const c = await consenting('every12h', true);
  try {
    const b = viaBridge(await c.ww.openOther(CONTEXT_B, ['e1']));
    await setQuiet(c.ww, true, CONTEXT_B);
    await ok(A(c));
    assert.deepEqual(c.keys(), [stampKey(ACCOUNT, 'e1', SERVER)], 'the answer is under A\'s key');
    assert.deepEqual(c.ww.w.consents.map((row) => row.serverEntityId), [SERVER], 'and was offered to the store as A\'s');
    await ok(A(c));
    assert.equal(c.ww.w.dialogs.length, 1, 'A is quiet');
    await ok(b);
    assert.equal(c.ww.w.dialogs.length, 2, 'B asks');
    await ok(LOCAL(c));
    assert.equal(c.ww.w.dialogs.length, 3, 'and so does the local MCP door');
    assert.deepEqual(c.keys().sort(), [stampKey(ACCOUNT, 'e1'), stampKey(ACCOUNT, 'e1', 'server-B'), stampKey(ACCOUNT, 'e1', SERVER)].sort(), 'one key each');
    await ok(LOCAL(c));
    await ok(b);
    await ok(A(c));
    assert.equal(c.ww.w.dialogs.length, 3, 'now all three are quiet, each on its own answer');
  } finally {
    c.ww.dispose();
  }
});

test('C6, reversed: a local stamp silences neither bridge', async () => {
  const c = await consenting('every12h', true);
  try {
    const b = viaBridge(await c.ww.openOther(CONTEXT_B, ['e1']));
    await setQuiet(c.ww, true, CONTEXT_B);
    await ok(LOCAL(c));
    await ok(LOCAL(c));
    assert.equal(c.ww.w.dialogs.length, 1, 'the fixture: local use is quiet');
    await ok(A(c));
    await ok(b);
    assert.equal(c.ww.w.dialogs.length, 3, 'both bridges asked, though local use is quiet');
  } finally {
    c.ww.dispose();
  }
});

test('C7: an answer given while quiet was off cannot reach forward — turn it on and the next call asks', async () => {
  const c = await consenting('every12h', false);
  try {
    await ok(A(c));
    await ok(A(c));
    assert.equal(c.ww.w.dialogs.length, 2);
    assert.deepEqual(c.keys(), [], 'nothing was remembered');
    await setQuiet(c.ww, true);
    await ok(A(c));
    assert.equal(c.ww.w.dialogs.length, 3, 'asked: no stamp reached back');
    await ok(A(c));
    assert.equal(c.ww.w.dialogs.length, 3, 'and the answer given with it on is the one that counts');
  } finally {
    c.ww.dispose();
  }
});

test('C8: Forget clears local and server stamps together — both ask again', async () => {
  const c = await consenting('every12h', true);
  try {
    await ok(A(c));
    await ok(LOCAL(c));
    await ok(A(c));
    await ok(LOCAL(c));
    assert.equal(c.ww.w.dialogs.length, 2, 'the fixture: both are quiet');
    assert.equal(c.keys().length, 2);
    await new ConsentStamps(c.state).forgetAll(c.clock.now);
    c.clock.now += 1;
    await ok(A(c));
    await ok(LOCAL(c));
    assert.equal(c.ww.w.dialogs.length, 4, 'a Forget takes back the server\'s answer as well as the local one');
    await ok(A(c));
    assert.equal(c.ww.w.dialogs.length, 4, 'and an answer given after it is honoured');
  } finally {
    c.ww.dispose();
  }
});

test('C9: quiet speaks for the MCP door only — the alias and token routes through a quiet bridge still ask, and say "this call only"', async () => {
  const c = await consenting('never', true);
  try {
    await ok(A(c), alias());
    const token = await c.ww.tokenFor(ACCOUNT, 'e1', 'prod');
    await ok(A(c), { path: '/v1/use/exec', token, body: { command: 'id' } });
    assert.equal(c.ww.w.dialogs.length, 2, 'both raised a dialog');
    for (const dialog of c.ww.w.dialogs) {
      assert.ok(dialog.includes(OFF), 'this door never follows the entry\'s setting, so the dialog must not say it does');
      assert.equal(dialog.includes(ON), false);
    }
    await ok(A(c));
    assert.equal(c.ww.w.dialogs.length, 2, 'while the MCP door is silent on the same bridge');
  } finally {
    c.ww.dispose();
  }
});

test('C16: a stamp given with quiet on survives quiet off, inert, and speaks again inside its window', async () => {
  const c = await consenting('every12h', true);
  try {
    await ok(A(c));
    assert.equal(c.keys().length, 1, 'the stamp is written');
    await setQuiet(c.ww, false);
    await ok(A(c));
    await ok(A(c));
    assert.equal(c.ww.w.dialogs.length, 3, 'quiet off: it asks, whatever is on record');
    assert.equal(c.ww.w.consents.length, 1, 'and offers nothing to the store');
    assert.equal(c.keys().length, 1);
    await setQuiet(c.ww, true);
    await ok(A(c));
    assert.equal(c.ww.w.dialogs.length, 3, 'quiet on again inside the window: no dialog');
    c.clock.now = NOW + HOURS_12 + 1;
    await ok(A(c));
    assert.equal(c.ww.w.dialogs.length, 4, 'past the window it asks');
  } finally {
    c.ww.dispose();
  }
});

/* ---------------------------------------------------------------------------------------------------------------
 * C17, C19, C22 — a Deny writes nothing, the request cannot set quiet, the stamp waits for the gate
 * ------------------------------------------------------------------------------------------------------------- */

test('C17: a Deny writes nothing, and a dialog that times out writes nothing', async () => {
  const denied = await consenting('every12h', true, { holdDialogs: true });
  try {
    const pending = send(A(denied), mcp());
    await until(() => denied.ww.w.openDialogs.length === 1, 'the dialog');
    denied.ww.w.openDialogs[0]('Deny');
    const reply = await pending;
    assert.deepEqual([reply.status, code(reply), message(reply)], [403, 'denied', DENIED]);
    assert.deepEqual(denied.keys(), [], 'the store has no new key');
    assert.deepEqual(denied.ww.w.consents, [], 'and nothing was offered to it');
  } finally {
    settleAll(denied.ww);
    denied.ww.dispose();
  }
  const slow = await consenting('every12h', true, { holdDialogs: true, consentTimeoutMs: 100 });
  try {
    const reply = await send(A(slow), mcp());
    assert.deepEqual([reply.status, code(reply)], [504, 'consent_timeout']);
    assert.deepEqual(slow.keys(), []);
    assert.deepEqual(slow.ww.w.consents, []);
  } finally {
    settleAll(slow.ww);
    slow.ww.dispose();
  }
});

test('C19: quiet is not the request\'s to set — a body field, a header and a query on a quiet-off bridge change nothing', async () => {
  const c = await consenting('never', false);
  try {
    const sent: [Door, Ask][] = [
      [A(c), { path: '/v1/mcp/use/exec', body: { entry: 'e1', command: 'id', quiet: true } }],
      [A(c), { path: '/v1/mcp/use/exec', body: { entry: 'e1', command: 'id', preConsented: true, rungs: 'x', consent: 'never' } }],
      [viaBridge(c.ww.bridge, { 'X-Creds-Quiet': '1', 'X-Creds-Pre-Consented': 'true' }), mcp()],
      [A(c), { path: '/v1/mcp/use/exec?quiet=1&preConsented=true', body: { entry: 'e1', command: 'id' } }],
    ];
    for (const [door, ask] of sent) {
      await ok(door, ask);
    }
    assert.equal(c.ww.w.dialogs.length, 4, 'a dialog every time');
    assert.deepEqual(c.ww.w.audit.filter((line) => line.includes('allowed without a prompt')), [], 'and not one silent call');
  } finally {
    c.ww.dispose();
  }
});

test('C22: the stamp is written behind the launch gate — an Allow given while the scope was narrowed stamps nothing', async () => {
  const narrowed = await consenting('every12h', true, { holdDialogs: true });
  try {
    const pending = send(A(narrowed), mcp());
    await until(() => narrowed.ww.w.openDialogs.length === 1, 'the dialog');
    await put(narrowed.ww.scopes, ACCOUNT, SERVER, [], true);
    narrowed.ww.w.openDialogs[0]('Allow');
    const reply = await pending;
    assert.deepEqual([reply.status, code(reply), message(reply)], [404, 'not_found', NOT_FOUND], 'the route\'s own sentence');
    assert.deepEqual(narrowed.ww.w.consents, [], 'nothing was offered to the store');
    assert.deepEqual(narrowed.keys(), [], 'and the store has no new key');
    assert.deepEqual(narrowed.ww.w.ran, [], 'nothing ran');
  } finally {
    settleAll(narrowed.ww);
    narrowed.ww.dispose();
  }
  const kept = await consenting('every12h', true, { holdDialogs: true });
  try {
    const pending = send(A(kept), mcp());
    await until(() => kept.ww.w.openDialogs.length === 1, 'the dialog');
    kept.ww.w.openDialogs[0]('Allow');
    assert.equal((await pending).status, 200);
    assert.deepEqual(kept.keys(), [stampKey(ACCOUNT, 'e1', SERVER)], 'the same without the narrow writes the one stamp');
    assert.equal(kept.ww.w.consents.length, 1);
  } finally {
    settleAll(kept.ww);
    kept.ww.dispose();
  }
});

/* ---------------------------------------------------------------------------------------------------------------
 * C10, C11, C15 — the dialog
 * ------------------------------------------------------------------------------------------------------------- */

test('C10: the modal line follows the request time and names the context\'s server, whatever the body claims', async () => {
  const c = await consenting('always', false);
  try {
    const caller = { agent: 'evil', session: '', sessionName: '', cwd: '' };
    await ok(viaBridge(c.ww.bridge, { 'X-Creds-Server': 'evil', 'X-Bridge-Id': 'evil' }), {
      path: '/v1/mcp/use/exec',
      body: { entry: 'e1', command: 'id', caller, serverName: 'evil', bridge: { serverName: 'evil' }, server: 'evil' },
    });
    const lines = c.ww.w.dialogs[0].split('\n');
    assert.ok(lines[0].startsWith('evil wants to run a command on "prod"'), 'the caller line shows the claim, as a label');
    assert.match(lines[1], /^Requested \d{4}-\d\d-\d\d /, 'the request-time line');
    assert.equal(lines[2], LAPTOP, 'and the bridge line comes right after it');
    assert.equal(c.ww.w.dialogs[0].includes('of "evil"'), false, 'the server is not the caller\'s to name');
    assert.ok(c.ww.w.dialogs[0].includes('Identity as reported by the caller — a label, not a check.'), 'the disclaimer stays');
  } finally {
    c.ww.dispose();
  }
});

test('C11: the coverage line — quiet off and quiet on say their exact sentences, and the token sentence is gone from a bridged dialog', async () => {
  const c = await consenting('always', false);
  try {
    await ok(A(c));
    await setQuiet(c.ww, true);
    await ok(A(c));
    const [off, on] = c.ww.w.dialogs;
    assert.ok(off.includes(`${OFF} Each call is logged in the "CredsForDevs: Agent Access" output panel.`), off);
    assert.ok(on.includes(`${ON} Each call is logged in the "CredsForDevs: Agent Access" output panel.`), on);
    for (const dialog of [off, on]) {
      assert.equal(dialog.includes(TOKEN_TAIL), false, 'the token sentence would be false here');
      assert.equal(dialog.includes('using its stored credential'), true, 'the rest of the dialog is as it was');
    }
    await ok(LOCAL(c));
    assert.ok(c.ww.w.dialogs[2].includes(TOKEN_TAIL), 'off a bridge the dialog still says what it always did');
    assert.equal(c.ww.w.dialogs[2].includes('Remote Bridge'), false, 'and nothing about a bridge');
  } finally {
    c.ww.dispose();
  }
});

/* ---------------------------------------------------------------------------------------------------------------
 * C13, C15, C20, C21 — the journal
 * ------------------------------------------------------------------------------------------------------------- */

test('C13: every line about a bridged call carries the bridge, from minted to the end, and no line off a bridge does', async () => {
  const c = await consenting('always', false, { holdDialogs: true });
  try {
    const done = send(A(c), mcp());
    await until(() => c.ww.w.openDialogs.length === 1, 'the dialog');
    c.ww.w.openDialogs[0]('Allow');
    await done;
    const refused = await send(A(c), { path: '/v1/mcp/use/exec', body: { entry: 'e1', command: '' } });
    assert.equal(refused.status, 400);
    const left = sendAbortable(A(c), mcp());
    left.reply.catch(() => undefined);
    await until(() => c.ww.w.openDialogs.length === 2, 'the second dialog');
    left.abort();
    await new Promise<void>((resolve) => setTimeout(resolve, 30));
    c.ww.w.openDialogs[1]('Allow');
    await until(() => c.ww.w.audit.some((line) => line.includes('ignored')), 'the ignored line');
    const outcomes = c.journal().map((line) => parseAuditLine(line)?.outcome);
    for (const wanted of ['minted', 'ALLOWED', 'exit 0', 'invalid_request', 'ABANDONED', 'ignored']) {
      assert.ok(outcomes.includes(wanted), `a ${wanted} line was written (${outcomes.join(', ')})`);
    }
    for (const line of c.journal()) {
      assert.match(line, / bridge=prod_server\)/, `${line} does not carry the bridge`);
    }
  } finally {
    settleAll(c.ww);
    c.ww.dispose();
  }
  const local = await consenting('always', false);
  try {
    await ok(LOCAL(local));
    await ok(LOCAL(local), alias());
    assert.ok(local.journal().length >= 3, 'the local calls wrote their lines');
    for (const line of local.journal()) {
      assert.equal(line.includes('bridge='), false, `${line} mentions a bridge off one`);
    }
  } finally {
    local.ww.dispose();
  }
});

test('C15: the audit line names the context\'s server, whatever the body says', async () => {
  const c = await consenting('always', false);
  try {
    await ok(A(c), { path: '/v1/mcp/use/exec', body: { entry: 'e1', command: 'id', serverName: 'evil', caller: { agent: 'evil', session: '', sessionName: '', cwd: '' } } });
    assert.ok(c.journal().length >= 2);
    for (const line of c.journal()) {
      assert.match(line, / bridge=prod_server\)/);
      assert.equal(/bridge=\S*evil/.test(line), false);
    }
  } finally {
    c.ww.dispose();
  }
});

/** The grant field of every line a ceiling wrote, read back through the parser a person's filter uses. */
const ceilingGrants = (ww: WallWorld): string[] => ww.w.audit.filter((line) => line.includes('→ too_many_requests')).map((line) => parseAuditLine(line)?.grant ?? line);

/** Sixty-one calls the action refuses for their command: sixty are asked about it, the sixty-first meets the asking ceiling. */
async function asking61(door: Door): Promise<void> {
  for (let call = 0; call < 60; call += 1) {
    assert.equal((await send(door, mcp(''))).status, 400);
  }
  assert.equal((await send(door, mcp(''))).status, 429);
}

test('C20: the line a ceiling writes with no grant says which bridge — A\'s name, B\'s name, and a dash off a bridge', async () => {
  const c = await consenting('always', false);
  try {
    const b = viaBridge(await c.ww.openOther(CONTEXT_B, ['e1']));
    await asking61(A(c));
    await asking61(b);
    await asking61(LOCAL(c));
    assert.deepEqual(ceilingGrants(c.ww), ['— bridge=prod_server', '— bridge=second_server', '—']);
  } finally {
    c.ww.dispose();
  }
});

test('C20: a busy call and a call over the dialog budget leave no line — only the two ceilings that mean a loop do', async () => {
  const c = await consenting('always', false, { holdDialogs: true });
  try {
    const first = send(A(c), mcp());
    await until(() => c.ww.w.openDialogs.length === 1, 'the first dialog');
    for (let call = 2; call <= 6; call += 1) {
      const busy = await send(A(c), mcp());
      assert.equal(busy.status, 429, `call ${call}: ${busy.body}`);
      assert.match(message(busy), /already waiting for the person/);
    }
    assert.deepEqual(ceilingGrants(c.ww), [], 'six at once: five are busy, and busy is not reported');
    c.ww.w.openDialogs[0]('Allow');
    await first;
    for (let call = 2; call <= 5; call += 1) {
      const next = send(A(c), mcp());
      await until(() => c.ww.w.openDialogs.length === call, `dialog ${call}`);
      c.ww.w.openDialogs[call - 1]('Allow');
      await next;
    }
    const sixth = await send(A(c), mcp());
    assert.deepEqual([sixth.status, code(sixth)], [429, 'too_many_requests']);
    assert.match(message(sixth), /this Remote Bridge may prompt at most 5 times a minute/);
    assert.deepEqual(ceilingGrants(c.ww), [], 'and neither is the dialog budget: a person is already being asked');
  } finally {
    settleAll(c.ww);
    c.ww.dispose();
  }
});

test('C21: the silent ceiling is the bridge\'s own — sixty-one quiet calls through A, the last refused with the bridge sentence and the bridge\'s name; B, a local quiet call and a dialog open on a third bridge are untouched', async () => {
  const c = await consenting('never', true, { holdDialogs: true });
  try {
    const b = viaBridge(await c.ww.openOther(CONTEXT_B, ['e1']));
    await setQuiet(c.ww, true, CONTEXT_B);
    const third = { ...CONTEXT_1, bridgeId: 'bridge-C', serverEntityId: 'server-C', serverName: 'third server' };
    const held = send(viaBridge(await c.ww.openOther(third, ['e1'])), mcp());
    await until(() => c.ww.w.openDialogs.length === 1, 'the dialog on the third bridge, whose quiet switch is off');
    for (let call = 1; call <= 60; call += 1) {
      assert.equal((await send(A(c), mcp())).status, 200, `quiet call ${call}`);
    }
    const sixtyFirst = await send(A(c), mcp());
    assert.deepEqual([sixtyFirst.status, code(sixtyFirst), message(sixtyFirst)], [429, 'too_many_requests', SILENT_SENTENCE]);
    assert.equal((await send(b, mcp())).status, 200, 'a silent call through B is served');
    assert.equal((await send(LOCAL(c), mcp())).status, 200, 'and a local quiet call');
    assert.equal(c.ww.w.dialogs.length, 1, 'nobody was asked but the third bridge');
    assert.deepEqual(ceilingGrants(c.ww), ['— bridge=prod_server'], 'the line names A');
    assert.match(c.ww.w.audit.filter((line) => line.includes('→ too_many_requests'))[0], / via mcp /);
    c.ww.w.openDialogs[0]('Allow');
    assert.equal((await held).status, 200, 'the dialog held open before the loop still decides its call');
    assert.equal(c.ww.w.ran.length, 63, 'sixty, B, local and the held one');
  } finally {
    settleAll(c.ww);
    c.ww.dispose();
  }
});
