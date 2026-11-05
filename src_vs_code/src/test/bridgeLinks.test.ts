import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { test } from 'node:test';
import { statusForErrorCode } from '../brokerProtocol';
import { pinRefusalFor } from '../pinGate';
import { code, message } from './bridgeDoorHarness';
import { JUMP_NAME, KEY_BODY, KEY_NAME, LinksOptions, LinksWorld, STDERR_WITH_A_HOST, linksWorld } from './bridgeLinksWorld';
import { loadBridgeModules } from './bridgeModules';
import { Door, WallOptions, WallWorld, send, viaBridge, viaMain, wallWorld } from './bridgeWallWorld';

/**
 * What a Remote Bridge may be told about the entries an in-scope entry LINKS to (E1.3 epoch 3, L1-L5, A.3.6).
 *
 * <p>The REAL `sshExecAction`, over a vault whose `e1` uses a stored key `k1` and may go through a jump host `j1`, behind
 * the real broker and a real bridge listener. A linked key and a jump chain are part of using the entry, so they are not
 * scope targets and they work; but what the action SAYS when one of them fails names something the agent may not see, so
 * on a bridge the body is the generic sentence and the real one goes to the journal.</p>
 */

const { scope } = loadBridgeModules();
const { AGENT_FORWARD_REFUSED, BRIDGE_USE_REFUSED } = scope;

const ASK = { path: '/v1/mcp/use/exec', body: { entry: 'e1', command: 'id' } };

interface Ran {
  readonly lw: LinksWorld;
  readonly ww: WallWorld;
}

/** A links world and the wall world that runs its action for real; both are torn down whatever `scenario` did. */
async function both(links: LinksOptions, wall: WallOptions, scenario: (r: Ran) => Promise<void>): Promise<void> {
  const lw = await linksWorld(links);
  const ww = await wallWorld({ ...wall, exec: lw.exec });
  try {
    await scenario({ lw, ww });
  } finally {
    ww.dispose();
    lw.cleanup();
  }
}

const body = (door: Door, ww: WallWorld): ReturnType<typeof send> => send(door, ASK).then((reply) => reply, () => assert.fail(`no answer through ${ww.main}`));

test('L1: a linked key out of scope is part of using e1 — it works through the bridge, the file is gone after, and nothing about the key is told', async () => {
  await both({}, {}, async ({ lw, ww }) => {
    const reply = await body(viaBridge(ww.bridge), ww);
    assert.equal(reply.status, 200, reply.body);
    assert.equal(lw.runs.length, 1);
    const argv = lw.runs[0].argv;
    assert.ok(argv.includes('-i'), `the key is handed to ssh: ${argv.join(' ')}`);
    assert.ok(argv[argv.indexOf('-i') + 1].startsWith(lw.storageDir), 'as a file under the storage folder');
    for (const secret of [KEY_BODY, 'k1', KEY_NAME]) {
      assert.ok(!reply.body.includes(secret), `"${secret}" is not in the body: ${reply.body}`);
    }
    assert.equal(lw.materialised.length, 1);
    assert.ok(!fs.existsSync(lw.materialised[0]), 'and the materialised file is gone');
    assert.deepEqual(ww.w.dialogs.length, 1, 'asked once, for e1');
  });
});

test('L1: positive control — the main port runs the same entry with the same key', async () => {
  await both({}, {}, async ({ lw, ww }) => {
    assert.equal((await body(viaMain(ww), ww)).status, 200);
    assert.ok(lw.runs[0].argv.includes('-i'));
  });
});

test('L2: a key sealed with its own PIN refuses generically on a bridge — the body names no key, the journal has the real sentence, the main port is as it was', async () => {
  const sentence = pinRefusalFor(KEY_NAME);
  await both({ key: 'sealed' }, {}, async ({ lw, ww }) => {
    const reply = await body(viaBridge(ww.bridge), ww);
    assert.deepEqual([reply.status, code(reply), message(reply)], [statusForErrorCode('no_credential'), 'no_credential', BRIDGE_USE_REFUSED('prod')]);
    for (const named of ['k1', KEY_NAME, 'PIN']) {
      assert.ok(!reply.body.includes(named), `"${named}" is not in the body`);
    }
    assert.ok(lw.notes.some((note) => note.includes(sentence)), `the journal got the real sentence: ${JSON.stringify(lw.notes)}`);
    assert.deepEqual(lw.runs, [], 'and nothing was run');
  });
  await both({ key: 'sealed' }, {}, async ({ ww }) => {
    const control = await body(viaMain(ww), ww);
    assert.deepEqual([code(control), message(control)], ['no_credential', sentence], 'control: today\'s sentence, naming the key entity, on the main port');
  });
});

test('L2: a key that cannot be written to disk refuses generically — the path in the error stays in the journal', async () => {
  await both({ writeFails: true }, {}, async ({ lw, ww }) => {
    const reply = await body(viaBridge(ww.bridge), ww);
    assert.deepEqual([reply.status, code(reply), message(reply)], [statusForErrorCode('internal'), 'internal', BRIDGE_USE_REFUSED('prod')]);
    assert.ok(!reply.body.includes(lw.storageDir), 'no path in the body');
    assert.ok(lw.notes.some((note) => note.includes('Could not write the stored key to disk') && note.includes(lw.storageDir)), `the journal has the error: ${JSON.stringify(lw.notes)}`);
  });
  await both({ writeFails: true }, {}, async ({ lw, ww }) => {
    const control = await body(viaMain(ww), ww);
    assert.match(message(control), /Could not write the stored key to disk: .*EACCES/, 'control: the main port says what it said');
    assert.ok(message(control).includes(lw.storageDir));
  });
});

test('L3: a jump host out of scope works through the bridge and its name is not told', async () => {
  await both({ jump: 'valid' }, {}, async ({ lw, ww }) => {
    const reply = await body(viaBridge(ww.bridge), ww);
    assert.equal(reply.status, 200, reply.body);
    const argv = lw.runs[0].argv;
    assert.equal(argv[argv.indexOf('-J') + 1], 'hop@jump.corp.com', `the chain is used: ${argv.join(' ')}`);
    assert.ok(!reply.body.includes(JUMP_NAME) && !reply.body.includes('jump.corp.com'), 'and the body carries nothing of it');
  });
});

test('L3: a jump host whose address is not valid refuses generically on a bridge, and by name on the main port', async () => {
  await both({ jump: 'invalid' }, {}, async ({ lw, ww }) => {
    const reply = await body(viaBridge(ww.bridge), ww);
    assert.deepEqual([reply.status, code(reply), message(reply)], [statusForErrorCode('no_credential'), 'no_credential', BRIDGE_USE_REFUSED('prod')]);
    assert.ok(!reply.body.includes(JUMP_NAME), 'the jump host\'s entry is not named');
    assert.ok(lw.notes.some((note) => note.includes(`The jump host "${JUMP_NAME}" cannot be used`)), 'the journal says which');
    assert.deepEqual(lw.runs, []);
    assert.equal(lw.materialised.length, 1, 'the key had been written by then ...');
    assert.ok(!fs.existsSync(lw.materialised[0]), '... and is gone');
  });
  await both({ jump: 'invalid' }, {}, async ({ ww }) => {
    const control = await body(viaMain(ww), ww);
    assert.deepEqual([code(control), message(control)], ['no_credential', `The jump host "${JUMP_NAME}" cannot be used: its address is not a valid host.`], 'control');
  });
});

test('L3: an ssh that cannot be started refuses generically on a bridge — the error may carry argv and a path', async () => {
  await both({ runFails: true }, {}, async ({ lw, ww }) => {
    const reply = await body(viaBridge(ww.bridge), ww);
    assert.deepEqual([reply.status, code(reply), message(reply)], [statusForErrorCode('internal'), 'internal', BRIDGE_USE_REFUSED('prod')]);
    assert.ok(!reply.body.includes(lw.storageDir));
    assert.ok(lw.notes.some((note) => note.includes('Could not run ssh') && note.includes(lw.storageDir)), 'the journal has the real error');
  });
  await both({ runFails: true }, {}, async ({ ww }) => {
    assert.match(message(await body(viaMain(ww), ww)), /^Could not run ssh: spawn ssh ENOENT/, 'control');
  });
});

test('L4: an entry that forwards the agent is refused before anybody is asked, and ssh is never started', async () => {
  await both({ agentForward: true }, { agentForward: true }, async ({ lw, ww }) => {
    const reply = await body(viaBridge(ww.bridge), ww);
    assert.equal(reply.status, 403, `the entry was used with the laptop's agent forwarded: ${reply.body}`);
    assert.deepEqual([reply.status, code(reply), message(reply)], [403, 'denied', AGENT_FORWARD_REFUSED('prod')]);
    assert.deepEqual(ww.w.dialogs, [], 'the wall refused first: no dialog');
    assert.deepEqual(lw.runs, [], 'ssh was never started');
  });
});

test('L4: the action refuses on its own when the wall does not — a dialog, then the same sentence, and ssh is never started', async () => {
  await both({ agentForward: true }, { agentForward: true, entryRefusal: 'none' }, async ({ lw, ww }) => {
    const reply = await body(viaBridge(ww.bridge), ww);
    assert.equal(reply.status, 403, `the action went ahead with the laptop's agent forwarded: ${reply.body}`);
    assert.deepEqual([reply.status, code(reply), message(reply)], [403, 'denied', AGENT_FORWARD_REFUSED('prod')]);
    assert.equal(ww.w.dialogs.length, 1, 'the wall said nothing, so a person was asked');
    assert.deepEqual(lw.runs, [], 'and then the action itself would not');
    assert.equal(lw.materialised.length, 0, 'before a key was written to disk');
  });
});

test('L4: control — on the main port the same entry runs with -A', async () => {
  await both({ agentForward: true }, { agentForward: true }, async ({ lw, ww }) => {
    assert.equal((await body(viaMain(ww), ww)).status, 200);
    assert.ok(lw.runs[0].argv.includes('-A'), lw.runs[0].argv.join(' '));
  });
});

test('L5: ssh\'s own stderr stays as returned, on a bridge too — it may carry a jump host\'s address, and that is the decision', async () => {
  await both({ stderr: STDERR_WITH_A_HOST }, {}, async ({ ww }) => {
    for (const door of [viaBridge(ww.bridge), viaMain(ww)]) {
      const reply = await body(door, ww);
      assert.equal(reply.status, 200);
      assert.equal((JSON.parse(reply.body) as { stderr: string }).stderr, STDERR_WITH_A_HOST, `through ${door === viaMain(ww) ? 'the main port' : 'the bridge'}`);
    }
  });
});
