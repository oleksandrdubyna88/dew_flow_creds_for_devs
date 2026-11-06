import * as assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { Reply, code, message, pause } from './bridgeDoorHarness';
import { INTERNAL_FAILURE } from '../brokerProtocol';
import { ACCOUNT, CONTEXT_1, Ask, WallWorld, answeredAtOnce, send, sendAbortable, settleAll, until, viaBridge, viaMain, wallWorld } from './bridgeWallWorld';

/**
 * The one dialog place after an Allow, the registry under a loop of quiet calls, a denied token's loop, and a journal that
 * throws (Amendment 3, C.3-C.7): through the real broker and real listeners. The counts themselves are in
 * `aliasThrottle.test.ts` and `grantRegistry.test.ts`; what these show is that the broker keeps the place only where a call may
 * ask again, and gives it back everywhere else.
 */

const CONTEXT_B = { ...CONTEXT_1, bridgeId: 'bridge-B', serverEntityId: 'server-B', serverName: 'other' };
const BUSY = 'Another request is already waiting for the person to answer. Try again once they have.';

const alias = (command = 'id'): Ask => ({ path: '/v1/alias/exec', body: { alias: 'one', command } });
const mcp = (command = 'id'): Ask => ({ path: '/v1/mcp/use/exec', body: { entry: 'e1', command } });

/* ---------------------------------------------------------------------------------------------------------------
 * Amendment 3, C.3 — an Allow keeps the place while the call's own follow-up prompt may be on screen, and only then
 * ------------------------------------------------------------------------------------------------------------- */

const create = (): Ask => ({ path: '/v1/mcp/create', body: { name: 'app-03', kind: 'ssh', secret: 'k' } });

/** Hold the folder PIN step of the next create until the test lets it go, or the request's life ends. */
function holdPinStep(ww: WallWorld): { release(): void } {
  let release = (): void => undefined;
  ww.w.holdSettle = () =>
    new Promise<void>((resolve) => {
      release = resolve;
      ww.w.settleSignals.at(-1)?.addEventListener('abort', () => resolve());
    });
  return { release: () => release() };
}

/** Raise a local `create`, answer its dialog, and hand back the reply the PIN step is still holding (in an object: a bare promise would be awaited). */
async function createAllowedAndWaitingForPin(ww: WallWorld): Promise<{ created: Promise<Reply> }> {
  const created = send(viaMain(ww), create());
  await until(() => ww.w.openDialogs.length === 1, 'the create\'s dialog');
  ww.w.openDialogs[0]('Allow');
  await until(() => ww.w.settleSignals.length === 1, 'the create to reach its folder PIN step');
  return { created };
}

test('K1: a local create that is Allowed keeps the place while its PIN box may be up — a bridge and a local alias call are busy until it ends', async () => {
  const ww = await wallWorld({ holdDialogs: true });
  let pin: { release(): void } | undefined;
  try {
    pin = holdPinStep(ww);
    const { created } = await createAllowedAndWaitingForPin(ww);
    for (const [who, door] of [['a call through the bridge', viaBridge(ww.bridge)], ['a local alias call', viaMain(ww)]] as const) {
      const refused = await answeredAtOnce(send(door, alias()), `${who} was let in over the PIN box: it raised a second modal`);
      assert.deepEqual([refused.status, message(refused)], [429, BUSY], who);
    }
    assert.equal(ww.w.dialogs.length, 1, 'one modal, and the PIN box under it is not covered by a second');
    pin.release();
    pin = undefined;
    const reply = await created;
    assert.equal(reply.status, 200, reply.body);
    assert.deepEqual(ww.w.created, ['app-03']);
    const next = send(viaBridge(ww.bridge), alias());
    await until(() => ww.w.openDialogs.length === 2, 'the bridge\'s next call to be asked, now that the create is over');
    ww.w.openDialogs[1]('Allow');
    assert.equal((await next).status, 200);
  } finally {
    pin?.release();
    settleAll(ww);
    ww.dispose();
  }
});

test('K2: a Deny frees the place at once — the create never reached its PIN step, and the next call is asked', async () => {
  const ww = await wallWorld({ holdDialogs: true });
  try {
    const denied = send(viaMain(ww), create());
    await until(() => ww.w.openDialogs.length === 1, 'the create\'s dialog');
    ww.w.openDialogs[0]('Deny');
    assert.equal((await denied).status, 403);
    const next = send(viaBridge(ww.bridge), alias());
    await until(() => ww.w.openDialogs.length === 2, 'the next call to be asked');
    assert.deepEqual(ww.w.settleSignals, [], 'the PIN step was never reached');
    ww.w.openDialogs[1]('Allow');
    assert.equal((await next).status, 200);
  } finally {
    settleAll(ww);
    ww.dispose();
  }
});

test('K3: an unanswered create times out, and the place is free: the next call is asked', async () => {
  const ww = await wallWorld({ holdDialogs: true, consentTimeoutMs: 100 });
  try {
    const timedOut = await send(viaMain(ww), create());
    assert.deepEqual([timedOut.status, code(timedOut)], [504, 'consent_timeout']);
    const next = send(viaBridge(ww.bridge), alias());
    await until(() => ww.w.openDialogs.length === 2, 'the next call to be asked');
    ww.w.openDialogs[1]('Allow');
    assert.equal((await next).status, 200);
  } finally {
    settleAll(ww);
    ww.dispose();
  }
});

test('K4: a client that leaves during the PIN step frees the place — an abandoned line, nothing created, and the next call asked', async () => {
  const ww = await wallWorld({ holdDialogs: true });
  try {
    holdPinStep(ww);
    const created = sendAbortable(viaMain(ww), create());
    created.reply.catch(() => undefined);
    await until(() => ww.w.openDialogs.length === 1, 'the create\'s dialog');
    ww.w.openDialogs[0]('Allow');
    await until(() => ww.w.settleSignals.length === 1, 'the create to reach its folder PIN step');
    created.abort();
    await until(() => ww.w.audit.some((line) => line.includes('during the folder PIN step')), 'the abandoned line');
    assert.deepEqual(ww.w.created, [], 'nothing was created for a client that left');
    const next = send(viaBridge(ww.bridge), alias());
    await until(() => ww.w.openDialogs.length === 2, 'the next call to be asked, not told busy');
    ww.w.openDialogs[1]('Allow');
    assert.equal((await next).status, 200);
  } finally {
    settleAll(ww);
    ww.dispose();
  }
});

test('K5: an Allowed exec does not keep the place (P2 is untouched) — while it runs, a call through another bridge and a local MCP call are both asked', async () => {
  const ww = await wallWorld();
  try {
    const b = await ww.openOther(CONTEXT_B, ['e1']);
    let finish = (): void => undefined;
    const running = new Promise<void>((resolve) => {
      finish = resolve;
    });
    ww.w.hold = () => running;
    const first = send(viaBridge(ww.bridge), alias());
    await until(() => ww.w.ran.length === 1, 'the first exec to be inside its action');
    const second = send(viaBridge(b), alias());
    await until(() => ww.w.ran.length === 2, 'the call through the other bridge to run (it was told busy)');
    const third = send(viaMain(ww), mcp());
    await until(() => ww.w.ran.length === 3, 'the local MCP call to run (it was told busy)');
    finish();
    assert.deepEqual((await Promise.all([first, second, third])).map((reply) => reply.status), [200, 200, 200]);
  } finally {
    ww.dispose();
  }
});

test('K6: a late Allow on a create whose client had gone frees the place — a kept place does not outlive the call', async () => {
  const ww = await wallWorld({ holdDialogs: true });
  try {
    const created = sendAbortable(viaMain(ww), create());
    created.reply.catch(() => undefined);
    await until(() => ww.w.openDialogs.length === 1, 'the create\'s dialog');
    created.abort();
    await until(() => ww.w.audit.some((line) => line.includes('ABANDONED')), 'the broker to learn the client left');
    ww.w.openDialogs[0]('Allow');
    await until(() => ww.w.audit.some((line) => line.includes('ignored')), 'the late click to be read and applied to nothing');
    assert.equal(ww.w.audit.some((line) => line.includes('ALLOWED')), false, 'it decided nothing');
    assert.deepEqual(ww.w.created, []);
    const next = send(viaBridge(ww.bridge), alias());
    await until(() => ww.w.openDialogs.length === 2, 'the next call to be asked: the door is not left busy for good');
    ww.w.openDialogs[1]('Allow');
    assert.equal((await next).status, 200);
  } finally {
    settleAll(ww);
    ww.dispose();
  }
});

test('K8: an action that declares asksAfterConsent keeps the place until it ends — a second door is busy, and asked once the action is over', async () => {
  const ww = await wallWorld({ asksAfterConsent: true });
  let finish = (): void => undefined;
  try {
    const running = new Promise<void>((resolve) => {
      finish = resolve;
    });
    ww.w.hold = () => running;
    const first = send(viaBridge(ww.bridge), alias());
    first.catch(() => undefined);
    await until(() => ww.w.ran.length === 1, 'the first call to be inside its action');
    const refused = await answeredAtOnce(send(viaMain(ww), alias()), 'the second door\'s call did not answer while the action was running');
    assert.deepEqual([refused.status, message(refused)], [429, BUSY]);
    assert.equal(ww.w.ran.length, 1, 'and it ran nothing');
    finish();
    assert.equal((await first).status, 200);
    assert.equal((await send(viaMain(ww), alias())).status, 200, 'the place came back when the action ended');
  } finally {
    finish();
    ww.dispose();
  }
});

test('K8: the same action without the flag keeps nothing (P2) — a second door is asked while it runs', async () => {
  const ww = await wallWorld({ asksAfterConsent: false });
  let finish = (): void => undefined;
  try {
    const running = new Promise<void>((resolve) => {
      finish = resolve;
    });
    ww.w.hold = () => running;
    const first = send(viaBridge(ww.bridge), alias());
    first.catch(() => undefined);
    await until(() => ww.w.ran.length === 1, 'the first call to be inside its action');
    const second = send(viaMain(ww), alias());
    await until(() => ww.w.ran.length === 2, 'the second door\'s call to run');
    finish();
    assert.deepEqual((await Promise.all([first, second])).map((reply) => reply.status), [200, 200]);
  } finally {
    finish();
    ww.dispose();
  }
});

/* ---------------------------------------------------------------------------------------------------------------
 * Amendment 3, C.4 — through the broker: a loop of quiet calls cannot evict an open dialog's call grant (Q1)
 * ------------------------------------------------------------------------------------------------------------- */

/** 300 quiet local MCP calls, the clock moved a minute every sixty (the silent ceiling is sixty a minute per door): how each was answered. */
async function quietLoop(ww: WallWorld, ask: Ask): Promise<Record<string, number>> {
  const tally: Record<string, number> = {};
  for (let call = 1; call <= 300; call += 1) {
    const reply = await send(viaMain(ww), ask);
    tally[reply.status] = (tally[reply.status] ?? 0) + 1;
    if (call % 60 === 0) {
      mock.timers.tick(61_000);
    }
  }
  return tally;
}

test('Q1: 300 quiet local MCP calls while a bridged exec\'s dialog is open do not evict its grant — the Allow runs the exec, with one ALLOWED line', async () => {
  const ww = await wallWorld({ holdDialogs: true, quietLocal: true });
  mock.timers.enable({ apis: ['Date'], now: Date.now() });
  try {
    const exec = send(viaBridge(ww.bridge), alias());
    await until(() => ww.w.openDialogs.length === 1, 'the bridged exec\'s dialog');
    assert.deepEqual(await quietLoop(ww, mcp()), { 200: 300 }, 'every quiet call ran, without a dialog');
    assert.equal(ww.w.dialogs.length, 1, 'and nobody was asked but the bridge\'s dialog');
    ww.w.openDialogs[0]('Allow');
    const reply = await exec;
    assert.deepEqual([reply.status, reply.status === 200 ? '' : code(reply)], [200, ''], reply.body);
    assert.equal(ww.w.audit.filter((line) => line.includes('ALLOWED')).length, 1, 'one ALLOWED line, for a grant that still existed');
  } finally {
    mock.timers.reset();
    settleAll(ww);
    ww.dispose();
  }
});

test('Q2 (Amendment 6, D.5): 300 quiet local MCP calls with an empty command, each refused after its pre-consent, do not evict a bridged exec\'s grant either', async () => {
  const ww = await wallWorld({ holdDialogs: true, quietLocal: true });
  mock.timers.enable({ apis: ['Date'], now: Date.now() });
  try {
    const exec = send(viaBridge(ww.bridge), alias());
    await until(() => ww.w.openDialogs.length === 1, 'the bridged exec\'s dialog');
    const tally = await quietLoop(ww, mcp(''));
    assert.equal(tally[200], undefined, `the empty command ran nowhere: ${JSON.stringify(tally)}`);
    assert.equal(ww.w.dialogs.length, 1, 'and nobody was asked but the bridge\'s dialog');
    ww.w.openDialogs[0]('Allow');
    const reply = await exec;
    assert.deepEqual([reply.status, reply.status === 200 ? '' : code(reply)], [200, ''], reply.body);
    assert.equal(ww.w.audit.filter((line) => line.includes('ALLOWED')).length, 1, 'one ALLOWED line, for a grant that still existed');
    assert.equal(ww.w.audit.some((line) => line.includes('unauthorized')), false, 'and no unauthorized line');
  } finally {
    mock.timers.reset();
    settleAll(ww);
    ww.dispose();
  }
});

/* ---------------------------------------------------------------------------------------------------------------
 * Amendment 3, C.5 — the denied token's loop is an asking call like any other (D1)
 * ------------------------------------------------------------------------------------------------------------- */

test('D1: 300 posts with a token the person denied, through a bridge — 60 answer denied, 240 too many; a bounded journal, no dialog, no minted line; busy while another dialog is open', async () => {
  const ww = await wallWorld({ holdDialogs: true });
  try {
    const token = await ww.tokenFor(ACCOUNT, 'e1', 'prod');
    const ask: Ask = { path: '/v1/use/exec', token, body: { command: 'id' } };
    const first = send(viaMain(ww), ask);
    await until(() => ww.w.openDialogs.length === 1, 'the token\'s first dialog on the main port');
    ww.w.openDialogs[0]('Deny');
    assert.equal((await first).status, 403, 'the person denied the token');

    const journal = ww.w.audit.length;
    const tally: Record<string, number> = {};
    for (let call = 0; call < 300; call += 1) {
      const reply = await send(viaBridge(ww.bridge), ask);
      const key = `${reply.status} ${code(reply)}`;
      tally[key] = (tally[key] ?? 0) + 1;
    }
    assert.deepEqual(tally, { '403 denied': 60, '429 too_many_requests': 240 });
    const lines = ww.w.audit.slice(journal);
    assert.ok(lines.length <= 61, `the journal grew by ${lines.length} lines: sixty refusals and one for the ceiling`);
    assert.equal(lines.filter((line) => line.includes('denied')).length, 60, 'each refusal for the token is a line: a denied token is a call like any other');
    assert.equal(ww.w.audit.slice(journal).some((line) => line.includes('minted')), false, 'no call grant was minted');
    assert.equal(ww.w.dialogs.length, 1, 'and nobody was asked again');

    const other = send(viaMain(ww), alias());
    await until(() => ww.w.openDialogs.length === 2, 'the dialog of another call');
    const busy = await send(viaBridge(ww.bridge), ask);
    assert.deepEqual([busy.status, message(busy)], [429, BUSY], 'while another dialog is open the denied token answers busy; it learns denied on its next try');
    ww.w.openDialogs[1]('Allow');
    assert.equal((await other).status, 200);
  } finally {
    settleAll(ww);
    ww.dispose();
  }
});

/* ---------------------------------------------------------------------------------------------------------------
 * Amendment 3, C.7 — nothing sits between `admit` and its `try`: a journal line that throws gives the place back
 * ------------------------------------------------------------------------------------------------------------- */

/** The ask that reaches the door under test, by the bridge: an alias, an MCP id, or the token of the entry. */
async function askFor(ww: WallWorld, door: 'alias' | 'mcp' | 'token'): Promise<Ask> {
  if (door === 'token') {
    return { path: '/v1/use/exec', token: await ww.tokenFor(ACCOUNT, 'e1', 'prod'), body: { command: 'id' } };
  }
  return door === 'alias' ? alias() : mcp();
}

/** The journal throws, once, on the first line that says a grant was minted; the returned function says whether it did. */
function journalThrowsOnMint(ww: WallWorld): () => boolean {
  const append = ww.w.audit.push.bind(ww.w.audit);
  let threw = false;
  ww.w.audit.push = (...lines: string[]): number => {
    if (!threw && lines.some((line) => line.includes('minted'))) {
      threw = true;
      throw new Error('the journal could not be written');
    }
    return append(...lines);
  };
  return () => threw;
}

/** One door: its journal throws right after admission, the failed request is answered, and the next call must be asked, not told busy. */
async function afterJournalFailure(door: 'alias' | 'mcp' | 'token'): Promise<{ failed: Reply; next: Reply }> {
  const ww = await wallWorld();
  try {
    const ask = await askFor(ww, door);
    const threw = journalThrowsOnMint(ww);
    const failed = await send(viaBridge(ww.bridge), ask);
    assert.equal(threw(), true, `${door}: the minted line was written and threw`);
    const next = await answeredAtOnce(send(viaBridge(ww.bridge), ask), `${door}: the next call did not answer: the place was left held`);
    return { failed, next };
  } finally {
    ww.dispose();
  }
}

test('C.7: a journal append that throws right after admission is answered 500 and gives the place back — on the alias, MCP and token doors', async () => {
  // Amendment 6, D.8: the throw no longer escapes `handle`. The spy sits beside the runner's own handler (which would fail the test for an
  // escape too), so `escaped.length === 0` is a count and not an absence of evidence.
  const escaped: unknown[] = [];
  const spy = (reason: unknown): void => {
    escaped.push(reason);
  };
  process.on('unhandledRejection', spy);
  try {
    for (const door of ['alias', 'mcp', 'token'] as const) {
      const { failed, next } = await afterJournalFailure(door);
      assert.deepEqual([failed.status, code(failed), message(failed)], [500, 'internal', INTERNAL_FAILURE], `${door}: the failed request was answered, with the generic sentence`);
      assert.equal(next.status, 200, `${door}: the next call was asked and ran, not told busy: ${next.body}`);
    }
    await pause(20);
    assert.equal(escaped.length, 0, 'no throw escaped as an unhandled rejection');
  } finally {
    process.off('unhandledRejection', spy);
  }
});
