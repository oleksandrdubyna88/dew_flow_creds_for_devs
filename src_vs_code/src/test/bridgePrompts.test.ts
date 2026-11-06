import * as assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { code, message, pause } from './bridgeDoorHarness';
import { ACCOUNT, CONTEXT_1, Ask, Door, WallWorld, answeredAtOnce, registryOf, send, sendAbortable, settleAll, until, viaBridge, viaMain, wallWorld } from './bridgeWallWorld';

/**
 * Prompts per bridge (S26): each bridge has its own sliding window of dialogs, one dialog is in flight for the whole
 * laptop, and a call refused before any dialog spends nothing (E1.3 epoch 3, A.3.5).
 *
 * <p>Through the real broker and real listeners. The counts themselves are in `aliasThrottle.test.ts`; what these show
 * is that the broker keys the right door, stamps where a dialog is raised, and says the right sentence.</p>
 */

const CONTEXT_B = { ...CONTEXT_1, bridgeId: 'bridge-B', serverEntityId: 'server-B', serverName: 'other' };
const BRIDGE_SENTENCE = 'Too many requests: this Remote Bridge may prompt at most 5 times a minute.';
const LOCAL_SENTENCE = 'Too many requests: a caller without a token may prompt at most 5 times a minute.';
const BUSY = 'Another request is already waiting for the person to answer. Try again once they have.';

const alias = (command = 'id'): Ask => ({ path: '/v1/alias/exec', body: { alias: 'one', command } });
const mcp = (command = 'id'): Ask => ({ path: '/v1/mcp/use/exec', body: { entry: 'e1', command } });

/** A broker's ceilings, reached the way `registryOf` reaches the registry: E2 calls `forget` on Close, and nothing calls it yet. */
const ceilingsOf = (ww: WallWorld): { forget(door: string, nowMs?: number): void } => (ww.w.server as unknown as { ceilings: { forget(door: string, nowMs?: number): void } }).ceilings;

test('S26: each bridge has its own five — the sixth through A is refused, a sixth through B is asked, and so is a local call', async () => {
  const ww = await wallWorld();
  try {
    const b = await ww.openOther(CONTEXT_B, ['e1']);
    for (let call = 1; call <= 5; call += 1) {
      assert.equal((await send(viaBridge(ww.bridge), alias())).status, 200, `through A, call ${call}`);
    }
    assert.equal(ww.w.dialogs.length, 5);
    const sixth = await send(viaBridge(ww.bridge), alias());
    assert.deepEqual([sixth.status, code(sixth), message(sixth)], [429, 'too_many_requests', BRIDGE_SENTENCE]);
    assert.equal(ww.w.dialogs.length, 5, 'and the refused one raised nothing');
    assert.equal((await send(viaBridge(b), alias())).status, 200, 'B is asked');
    assert.equal((await send(viaMain(ww), alias())).status, 200, 'and so is a local alias call');
    assert.equal(ww.w.dialogs.length, 7);
  } finally {
    ww.dispose();
  }
});

test('S26: one dialog in flight for the whole laptop — a dialog held open on A makes B and a local alias call busy', async () => {
  const ww = await wallWorld({ holdDialogs: true });
  try {
    const b = await ww.openOther(CONTEXT_B, ['e1']);
    const held = send(viaBridge(ww.bridge), alias());
    await until(() => ww.w.openDialogs.length === 1, 'the dialog on A');
    for (const [who, door] of [['B', viaBridge(b)], ['a local alias call', viaMain(ww)]] as const) {
      const refused = await send(door, alias());
      assert.deepEqual([refused.status, code(refused), message(refused)], [429, 'too_many_requests', BUSY], who);
    }
    assert.equal(ww.w.dialogs.length, 1, 'neither raised a dialog of its own');
    ww.w.openDialogs[0]('Allow');
    assert.equal((await held).status, 200);
  } finally {
    ww.dispose();
  }
});

test('S26: five calls refused before any dialog spend nothing — the next five dialogs are all asked', async () => {
  const ww = await wallWorld({ storedTexts: ['deploy creds://a@x.test/Agents/leak-target/password'] });
  try {
    for (let call = 1; call <= 5; call += 1) {
      const refused = await send(viaBridge(ww.bridge), mcp());
      assert.deepEqual([refused.status, code(refused)], [403, 'denied'], `refused call ${call}`);
    }
    assert.deepEqual(ww.w.dialogs, [], 'not one dialog');
    ww.texts.current = [];
    for (let call = 1; call <= 5; call += 1) {
      assert.equal((await send(viaBridge(ww.bridge), mcp())).status, 200, `asked call ${call}`);
    }
    assert.equal(ww.w.dialogs.length, 5, 'all five were asked');
    assert.equal((await send(viaBridge(ww.bridge), mcp())).status, 429, 'and now the window is full');
  } finally {
    ww.dispose();
  }
});

test('S26: a token on a bridge is counted on its bridge and says so — the sixth is the bridge sentence, never "a caller without a token"', async () => {
  const ww = await wallWorld();
  try {
    const token = await ww.tokenFor(ACCOUNT, 'e1', 'prod');
    for (let call = 1; call <= 5; call += 1) {
      assert.equal((await send(viaBridge(ww.bridge), { path: '/v1/use/exec', token, body: { command: 'id' } })).status, 200, `call ${call}`);
    }
    const sixth = await send(viaBridge(ww.bridge), { path: '/v1/use/exec', token, body: { command: 'id' } });
    assert.deepEqual([sixth.status, code(sixth), message(sixth)], [429, 'too_many_requests', BRIDGE_SENTENCE]);
    assert.doesNotMatch(message(sixth), /caller without a token/);
  } finally {
    ww.dispose();
  }
});

test('S26: forgetting a bridge starts its window over — five more on A are asked, and the sixth is refused again', async () => {
  const ww = await wallWorld();
  try {
    for (let call = 1; call <= 5; call += 1) {
      await send(viaBridge(ww.bridge), alias());
    }
    assert.equal((await send(viaBridge(ww.bridge), alias())).status, 429);
    ceilingsOf(ww).forget(CONTEXT_1.bridgeId);
    for (let call = 1; call <= 5; call += 1) {
      assert.equal((await send(viaBridge(ww.bridge), alias())).status, 200, `after forget, call ${call}`);
    }
    assert.equal((await send(viaBridge(ww.bridge), alias())).status, 429, 'and the new window fills too');
  } finally {
    ww.dispose();
  }
});

test('S26: the local alias door is as it was — five, then the sixth refused with the local sentence, and a bridge is unaffected', async () => {
  const ww = await wallWorld();
  try {
    for (let call = 1; call <= 5; call += 1) {
      assert.equal((await send(viaMain(ww), alias())).status, 200, `local call ${call}`);
    }
    const sixth = await send(viaMain(ww), alias());
    assert.deepEqual([sixth.status, code(sixth), message(sixth)], [429, 'too_many_requests', LOCAL_SENTENCE]);
    assert.equal((await send(viaBridge(ww.bridge), alias())).status, 200, 'a bridge has its own five');
  } finally {
    ww.dispose();
  }
});

test('S26: a local token call raises a dialog and is not throttled — six tokens on the main port, then the local alias five are still five', async () => {
  const ww = await wallWorld();
  try {
    for (let call = 1; call <= 6; call += 1) {
      const token = await ww.tokenFor(ACCOUNT, 'e1', 'prod');
      assert.equal((await send(viaMain(ww), { path: '/v1/use/exec', token, body: { command: 'id' } })).status, 200, `token ${call}`);
    }
    assert.equal(ww.w.dialogs.length, 6, 'each first use asked');
    for (let call = 1; call <= 5; call += 1) {
      assert.equal((await send(viaMain(ww), alias())).status, 200, `alias call ${call}`);
    }
    assert.equal((await send(viaMain(ww), alias())).status, 429, 'the alias five were not eaten by the six token dialogs');
  } finally {
    ww.dispose();
  }
});

test('S26 consequence: on the local alias and MCP doors a call refused before its dialog no longer spends a prompt', async () => {
  // A command the action's own validation refuses is refused before anybody is asked. It used to spend one of the five
  // (the window counted calls admitted); now the window counts dialogs raised, so six of them leave all five dialogs free.
  for (const [door, ask] of [['alias', alias], ['mcp', mcp]] as const) {
    const ww = await wallWorld();
    try {
      for (let call = 1; call <= 6; call += 1) {
        const refused = await send(viaMain(ww), ask(''));
        assert.deepEqual([refused.status, code(refused)], [400, 'invalid_request'], `${door}: refused call ${call} is a validation refusal, not a throttle`);
      }
      assert.deepEqual(ww.w.dialogs, [], `${door}: nobody was asked`);
      for (let call = 1; call <= 5; call += 1) {
        assert.equal((await send(viaMain(ww), ask())).status, 200, `${door}: dialog ${call}`);
      }
      assert.equal((await send(viaMain(ww), ask())).status, 429, `${door}: five dialogs a minute and one in flight hold exactly as before`);
    } finally {
      ww.dispose();
    }
  }
});

test('S26: a dialog the MCP door raises for its own verbs (a move to the Trash) is counted on the local door like any other', async () => {
  const ww = await wallWorld();
  try {
    for (let call = 1; call <= 5; call += 1) {
      const reply = await send(viaMain(ww), { path: '/v1/mcp/delete', body: { entry: 'e1' } });
      assert.equal(reply.status, 200, `delete ${call}: ${reply.body}`);
    }
    assert.equal(ww.w.dialogs.length, 5);
    const sixth = await send(viaMain(ww), { path: '/v1/mcp/delete', body: { entry: 'e1' } });
    assert.deepEqual([sixth.status, code(sixth), message(sixth)], [429, 'too_many_requests', LOCAL_SENTENCE]);
    assert.equal((await send(viaMain(ww), alias())).status, 429, 'and the alias door shares that local window');
  } finally {
    ww.dispose();
  }
});

/* ---------------------------------------------------------------------------------------------------------------
 * Amendment 2, B.1 — a call refused before any dialog is bounded, holds no grant, and cannot flood the journal
 * ------------------------------------------------------------------------------------------------------------- */

const ASKING_BRIDGE = 'Too many requests: this Remote Bridge may ask at most 60 times a minute, calls refused before any dialog included.';
const ASKING_LOCAL = 'Too many requests: a caller without a token may ask at most 60 times a minute, calls refused before any dialog included.';

/** `count` calls the action's own validation refuses (an empty command), one after the other: what each answered. */
async function refusedLoop(door: Door, ask: (command?: string) => Ask, count: number): Promise<{ tally: Record<string, number>; sentences: Set<string> }> {
  const tally: Record<string, number> = {};
  const sentences = new Set<string>();
  for (let call = 0; call < count; call += 1) {
    const reply = await send(door, ask(''));
    const key = `${reply.status} ${code(reply)}`;
    tally[key] = (tally[key] ?? 0) + 1;
    if (reply.status === 429) {
      sentences.add(message(reply));
    }
  }
  return { tally, sentences };
}

const pendingCalls = (ww: WallWorld): number => [...registryOf(ww).grants.values()].filter((grant) => grant.scope === 'call' && grant.status === 'pending').length;

test('A1: 300 refused-before-the-dialog calls through a bridge — 60 are refused for their command, 240 for the count; no grant is left and the journal is bounded', async () => {
  const ww = await wallWorld();
  try {
    const journal = ww.w.audit.length;
    const { tally, sentences } = await refusedLoop(viaBridge(ww.bridge), mcp, 300);
    assert.deepEqual(tally, { '400 invalid_request': 60, '429 too_many_requests': 240 });
    assert.deepEqual([...sentences], [ASKING_BRIDGE], 'every refusal for the count says the one sentence');
    assert.equal(pendingCalls(ww), 0, 'a call refused before anybody was asked holds no grant');
    assert.ok(ww.w.audit.length - journal <= 121, `the journal grew by ${ww.w.audit.length - journal} lines: 60 calls of two lines and one for the ceiling`);
    const ceiling = ww.w.audit.filter((line) => line.includes('too_many_requests'));
    assert.equal(ceiling.length, 1, 'the ceiling is one line a window');
    assert.doesNotMatch(ceiling[0], / via /, 'and it names no door: an asking call can come by any of them');
    assert.deepEqual(ww.w.dialogs, [], 'nobody was asked');
  } finally {
    ww.dispose();
  }
});

test('A1: a refusal is a call — sixty refused at the start of a minute and sixty at its middle keep the door closed when the first sixty have aged out', async () => {
  const ww = await wallWorld();
  mock.timers.enable({ apis: ['Date'], now: Date.now() });
  try {
    const first = await refusedLoop(viaBridge(ww.bridge), mcp, 120);
    assert.deepEqual(first.tally, { '400 invalid_request': 60, '429 too_many_requests': 60 }, 'sixty asked, sixty refused for the count');
    mock.timers.tick(30_000);
    await refusedLoop(viaBridge(ww.bridge), mcp, 60);
    mock.timers.tick(31_000); // 61 s after the first sixty: they are gone; the sixty refused at the middle are not
    const late = await send(viaBridge(ww.bridge), mcp(''));
    assert.deepEqual([late.status, message(late)], [429, ASKING_BRIDGE], 'the refused calls still count: a loop does not get a fresh sixty every minute');
    mock.timers.tick(30_000);
    assert.equal((await send(viaBridge(ww.bridge), mcp(''))).status, 400, 'and once they too have aged out the door is open again');
  } finally {
    mock.timers.reset();
    ww.dispose();
  }
});

test('A1: the alias route through a bridge is bounded the same way', async () => {
  const ww = await wallWorld();
  try {
    const journal = ww.w.audit.length;
    const { tally, sentences } = await refusedLoop(viaBridge(ww.bridge), alias, 300);
    assert.deepEqual(tally, { '400 invalid_request': 60, '429 too_many_requests': 240 });
    assert.deepEqual([...sentences], [ASKING_BRIDGE]);
    assert.equal(pendingCalls(ww), 0);
    assert.ok(ww.w.audit.length - journal <= 121, `the journal grew by ${ww.w.audit.length - journal} lines`);
  } finally {
    ww.dispose();
  }
});

test('A1: an action the entry\'s kind does not have is refused without leaving a grant either', async () => {
  const ww = await wallWorld();
  try {
    for (const door of [viaBridge(ww.bridge), viaMain(ww)]) {
      for (let call = 0; call < 30; call += 1) {
        const reply = await send(door, { path: '/v1/alias/nosuchaction', body: { alias: 'one', command: 'id' } });
        assert.deepEqual([reply.status, code(reply)], [404, 'not_supported'], `call ${call + 1}`);
      }
    }
    assert.equal(pendingCalls(ww), 0, 'neither door left a pending call grant');
  } finally {
    ww.dispose();
  }
});

test('A1: a token call through a bridge is bounded the same way — and the token itself is not a call grant', async () => {
  const ww = await wallWorld();
  try {
    const token = await ww.tokenFor(ACCOUNT, 'e1', 'prod');
    const journal = ww.w.audit.length;
    const { tally, sentences } = await refusedLoop(viaBridge(ww.bridge), (command) => ({ path: '/v1/use/exec', token, body: { command: command ?? 'id' } }), 300);
    assert.deepEqual(tally, { '400 invalid_request': 60, '429 too_many_requests': 240 });
    assert.deepEqual([...sentences], [ASKING_BRIDGE]);
    assert.equal(pendingCalls(ww), 0);
    assert.equal(registryOf(ww).get(token)?.status, 'pending', 'the shared token itself is still there');
    assert.ok(ww.w.audit.length - journal <= 121, `the journal grew by ${ww.w.audit.length - journal} lines`);
  } finally {
    ww.dispose();
  }
});

test('A2: a shared token whose dialog is open, an allowed token and three denied ones survive 600 refused-before-the-dialog calls', async () => {
  const ww = await wallWorld({ holdDialogs: true });
  const askToken = (token: string): Ask => ({ path: '/v1/use/exec', token, body: { command: 'id' } });
  try {
    const allowed = await ww.tokenFor(ACCOUNT, 'e1', 'prod');
    const firstUse = send(viaMain(ww), askToken(allowed));
    await until(() => ww.w.openDialogs.length === 1, 'the first token\'s dialog');
    ww.w.openDialogs[0]('Allow');
    assert.equal((await firstUse).status, 200);

    const denied: string[] = [];
    for (let n = 0; n < 3; n += 1) {
      const token = await ww.tokenFor(ACCOUNT, 'e1', 'prod');
      const use = send(viaMain(ww), askToken(token));
      await until(() => ww.w.openDialogs.length === 2 + n, `the dialog of denied token ${n + 1}`);
      ww.w.openDialogs[1 + n]('Deny');
      assert.deepEqual([(await use).status], [403], `token ${n + 1} is denied`);
      denied.push(token);
    }

    const open = await ww.tokenFor(ACCOUNT, 'e1', 'prod');
    const decided = send(viaMain(ww), askToken(open));
    await until(() => ww.w.openDialogs.length === 5, 'the dialog that stays open through the flood');

    await refusedLoop(viaBridge(ww.bridge), mcp, 300);
    await refusedLoop(viaMain(ww), alias, 300);

    ww.w.openDialogs[4]('Allow');
    assert.equal((await decided).status, 200, 'the open dialog still decides its call');
    const again = await send(viaMain(ww), askToken(allowed));
    assert.equal(again.status, 200, 'the allowed token still runs');
    assert.equal(ww.w.openDialogs.length, 5, 'and without asking again');
    for (const [n, token] of denied.entries()) {
      const reply = await send(viaMain(ww), askToken(token));
      assert.deepEqual([reply.status, code(reply)], [403, 'denied'], `tombstone ${n + 1} still answers denied, not unknown`);
    }
  } finally {
    ww.dispose();
  }
});

test('A3: the same loop on the local MCP door and on the local alias door — the local sentence, no grant left, a bounded journal', async () => {
  for (const [door, ask] of [['mcp', mcp], ['alias', alias]] as const) {
    const ww = await wallWorld();
    try {
      const journal = ww.w.audit.length;
      const { tally, sentences } = await refusedLoop(viaMain(ww), ask, 300);
      assert.deepEqual(tally, { '400 invalid_request': 60, '429 too_many_requests': 240 }, door);
      assert.deepEqual([...sentences], [ASKING_LOCAL], door);
      assert.equal(pendingCalls(ww), 0, `${door}: no grant left`);
      assert.ok(ww.w.audit.length - journal <= 121, `${door}: the journal grew by ${ww.w.audit.length - journal} lines`);
      assert.deepEqual(ww.w.dialogs, [], door);
    } finally {
      ww.dispose();
    }
  }
});

test('A3: the local doors share one asking window, and a bridge keeps its own', async () => {
  const ww = await wallWorld();
  try {
    await refusedLoop(viaMain(ww), mcp, 60);
    const alias61 = await send(viaMain(ww), alias(''));
    assert.deepEqual([alias61.status, message(alias61)], [429, ASKING_LOCAL], 'the alias door spends the same sixty as the MCP door');
    assert.equal((await send(viaBridge(ww.bridge), mcp(''))).status, 400, 'and the bridge is not touched');
    assert.equal((await send(viaMain(ww), mcp())).status, 429, 'a legitimate local call is refused too while the minute is full: the ceiling is the door\'s');
  } finally {
    ww.dispose();
  }
});

/* ---------------------------------------------------------------------------------------------------------------
 * Amendment 2, B.2 — the one place is the dialog's, not the call's
 * ------------------------------------------------------------------------------------------------------------- */

test('P1: a client that posts and goes away does not free the place its dialog holds — the next call is busy until the dialog is answered', async () => {
  const ww = await wallWorld({ holdDialogs: true });
  try {
    const first = sendAbortable(viaBridge(ww.bridge), alias());
    first.reply.catch(() => undefined);
    await until(() => ww.w.openDialogs.length === 1, 'the first dialog');
    first.abort();
    await until(() => ww.w.audit.some((line) => line.includes('ABANDONED')), 'the broker to learn the client left');

    const second = await answeredAtOnce(send(viaBridge(ww.bridge), alias()), 'the second call was not answered busy: it was let in behind the open dialog');
    assert.deepEqual([second.status, message(second)], [429, BUSY]);
    assert.equal(ww.w.dialogs.length, 1, 'one modal on screen, and the second call raised none');

    ww.w.openDialogs[0]('Allow');
    await until(() => ww.w.audit.some((line) => line.includes('ignored')), 'the click on a dialog nobody waits for to be read and applied to nothing');
    const third = send(viaBridge(ww.bridge), alias());
    await until(() => ww.w.openDialogs.length === 2, 'the third call to be asked, now that the first dialog is gone');
    ww.w.openDialogs[1]('Allow');
    assert.equal((await third).status, 200);
  } finally {
    settleAll(ww);
    ww.dispose();
  }
});

test('P1 through the main port: a local client that posts and goes away does not free the place its dialog holds — local and bridged calls are busy until it is answered', async () => {
  const ww = await wallWorld({ holdDialogs: true });
  try {
    const first = sendAbortable(viaMain(ww), alias());
    first.reply.catch(() => undefined);
    await until(() => ww.w.openDialogs.length === 1, 'the first dialog');
    first.abort();
    await until(() => ww.w.audit.some((line) => line.includes('ABANDONED')), 'the broker to learn the client left');

    for (const [who, door] of [['a local alias call', viaMain(ww)], ['a call through a bridge', viaBridge(ww.bridge)]] as const) {
      const refused = await answeredAtOnce(send(door, alias()), `${who} was let in behind the open dialog`);
      assert.deepEqual([refused.status, message(refused)], [429, BUSY], who);
    }
    assert.equal(ww.w.dialogs.length, 1, 'one modal on screen');

    ww.w.openDialogs[0]('Allow');
    await until(() => ww.w.audit.some((line) => line.includes('ignored')), 'the click on a dialog nobody waits for to be applied to nothing');
    const next = send(viaMain(ww), alias());
    await until(() => ww.w.openDialogs.length === 2, 'the next local call to be asked once the first dialog was clicked');
    ww.w.openDialogs[1]('Allow');
    assert.equal((await next).status, 200);
  } finally {
    settleAll(ww);
    ww.dispose();
  }
});

test('P2: a long action does not hold the place — while one runs, a call through another bridge and a local call are both asked', async () => {
  const ww = await wallWorld();
  try {
    const b = await ww.openOther(CONTEXT_B, ['e1']);
    let finish = (): void => undefined;
    const running = new Promise<void>((resolve) => {
      finish = resolve;
    });
    ww.w.hold = () => running;
    const first = send(viaBridge(ww.bridge), alias());
    await until(() => ww.w.ran.length === 1, 'the first call to be inside its action');
    const second = send(viaBridge(b), alias());
    await until(() => ww.w.ran.length === 2, 'the call through the other bridge to run (it was told busy while the first action ran)');
    const third = send(viaMain(ww), alias());
    await until(() => ww.w.ran.length === 3, 'the local call to run (it was told busy while the first action ran)');
    assert.equal(ww.w.dialogs.length, 3, 'all three were asked');
    finish();
    assert.deepEqual((await Promise.all([first, second, third])).map((reply) => reply.status), [200, 200, 200]);
  } finally {
    ww.dispose();
  }
});

test('P2: an action that ends while ANOTHER call\'s dialog is open frees nothing of that dialog\'s place', async () => {
  const ww = await wallWorld({ holdDialogs: true });
  try {
    let finish = (): void => undefined;
    const running = new Promise<void>((resolve) => {
      finish = resolve;
    });
    ww.w.hold = () => running;
    const first = send(viaBridge(ww.bridge), alias());
    await until(() => ww.w.openDialogs.length === 1, 'the first dialog');
    ww.w.openDialogs[0]('Allow');
    await until(() => ww.w.ran.length === 1, 'the first call to be inside its action');
    const second = send(viaMain(ww), alias());
    await until(() => ww.w.openDialogs.length === 2, 'the second dialog, raised while the first action runs');
    finish();
    assert.equal((await first).status, 200, 'the first action ended, with the second dialog open');
    const third = await answeredAtOnce(send(viaMain(ww), alias()), 'the third call was let in: the first call ending freed the second dialog\'s place');
    assert.deepEqual([third.status, message(third)], [429, BUSY]);
    ww.w.openDialogs[1]('Allow');
    assert.equal((await second).status, 200);
  } finally {
    settleAll(ww);
    ww.dispose();
  }
});

test('P3 through the main port: an unanswered LOCAL dialog times out with the sentence main spells, and the next LOCAL call is asked', async () => {
  const ww = await wallWorld({ holdDialogs: true, consentTimeoutMs: 300 });
  try {
    const first = await send(viaMain(ww), alias());
    assert.deepEqual([first.status, code(first), message(first)], [504, 'consent_timeout', 'The human did not allow this grant.']);
    const second = send(viaMain(ww), alias());
    await until(() => ww.w.openDialogs.length === 2, 'the next local call to be asked: the timeout freed the place');
    ww.w.openDialogs[1]('Allow');
    assert.equal((await second).status, 200);
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

test('P3 through the main port, the REAL path: no answer at 299 s, 504 at 300.1 s with main\'s sentence, and the next local call raises a second modal and runs', async () => {
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
      await new Promise<void>((resolve) => setImmediate(resolve)); // long enough for an answer to cross the socket, if one were sent
    }
    assert.equal(settled, false, 'at 299 s nobody has been answered: the consent timeout is five minutes, not less');
    mock.timers.tick(1_100);
    const timedOut = await first;
    assert.deepEqual([timedOut.status, code(timedOut), message(timedOut)], [504, 'consent_timeout', 'The human did not allow this grant.']);
    const second = send(viaMain(ww), alias());
    await untilImmediate(() => ww.w.openDialogs.length === 2, 'the re-ask: a second modal while the first was never answered');
    assert.equal(ww.w.dialogs.length, 2);
    ww.w.openDialogs[1]('Allow');
    assert.equal((await second).status, 200);
  } finally {
    mock.timers.reset();
    settleAll(ww);
    ww.dispose();
  }
});

test('P2 through the main port: a local alias exec that is running holds nothing — a second local alias call is asked and runs while it does', async () => {
  const ww = await wallWorld();
  let finish = (): void => undefined;
  try {
    const running = new Promise<void>((resolve) => {
      finish = resolve;
    });
    ww.w.hold = () => running;
    const first = send(viaMain(ww), alias());
    await until(() => ww.w.ran.length === 1, 'the first local exec to be inside its action');
    const second = send(viaMain(ww), alias());
    await until(() => ww.w.ran.length === 2, 'the second local call to be asked and to run (it was told busy: the first dialog kept the place)');
    assert.equal(ww.w.dialogs.length, 2, 'both were asked');
    finish();
    assert.deepEqual((await Promise.all([first, second])).map((reply) => reply.status), [200, 200]);
  } finally {
    finish();
    ww.dispose();
  }
});

test('L8 through the main port: a token dialog that closes frees nothing of an alias dialog\'s place — the next alias call is still busy', async () => {
  const ww = await wallWorld({ holdDialogs: true });
  try {
    const token = await ww.tokenFor(ACCOUNT, 'e1', 'prod');
    const standing = send(viaMain(ww), alias());
    await until(() => ww.w.openDialogs.length === 1, 'the alias dialog');
    const denied = send(viaMain(ww), { path: '/v1/use/exec', token, body: { command: 'id' } });
    await until(() => ww.w.openDialogs.length === 2, 'the token dialog, raised beside the alias one (a local token call takes no place)');
    ww.w.openDialogs[1]('Deny');
    assert.equal((await denied).status, 403);
    const next = await answeredAtOnce(send(viaMain(ww), alias()), 'the next alias call was let in: the token dialog\'s close freed the alias dialog\'s place');
    assert.deepEqual([next.status, message(next)], [429, BUSY]);
    ww.w.openDialogs[0]('Allow');
    assert.equal((await standing).status, 200);
  } finally {
    settleAll(ww);
    ww.dispose();
  }
});

test('P3: an unanswered dialog times out, frees the place, and a late click frees nothing of the next dialog\'s', async () => {
  const ww = await wallWorld({ holdDialogs: true, consentTimeoutMs: 300 });
  try {
    const first = await send(viaBridge(ww.bridge), alias());
    assert.deepEqual([first.status, code(first)], [504, 'consent_timeout'], 'nobody answered: the caller is told so');

    const second = send(viaBridge(ww.bridge), alias());
    await until(() => ww.w.openDialogs.length === 2, 'the next call to be asked: the timeout freed the place');
    ww.w.openDialogs[0]('Allow'); // the click on the first dialog, long after the broker stopped waiting for it
    await pause(30);
    assert.equal(ww.w.audit.some((line) => line.includes('ALLOWED')), false, 'and it decided nothing');
    const third = await answeredAtOnce(send(viaBridge(ww.bridge), alias()), 'the third call was let in behind the second dialog: the late click freed its place');
    assert.deepEqual([third.status, message(third)], [429, BUSY]);
    assert.equal(ww.w.dialogs.length, 2);
    ww.w.openDialogs[1]('Allow');
    assert.equal((await second).status, 200);
    assert.deepEqual(ww.w.ran.length, 1, 'only the second call ran');
  } finally {
    settleAll(ww);
    ww.dispose();
  }
});
