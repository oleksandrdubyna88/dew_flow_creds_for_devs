import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { code, message } from './bridgeDoorHarness';
import { ACCOUNT, CONTEXT_1, Ask, WallWorld, send, until, viaBridge, viaMain, wallWorld } from './bridgeWallWorld';

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
