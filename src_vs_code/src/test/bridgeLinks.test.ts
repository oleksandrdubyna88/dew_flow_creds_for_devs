import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { mock, test } from 'node:test';
import { SECOND_ENTRY_REFUSED } from '../agentNaming';
import { INTERNAL_FAILURE, MAX_EXEC_TIMEOUT_MS, statusForErrorCode } from '../brokerProtocol';
import { pinRefusalFor } from '../pinGate';
import { code, message } from './bridgeDoorHarness';
import { JUMP_NAME, KEY_BODY, KEY_NAME, LinksOptions, LinksWorld, STDERR_WITH_A_HOST, linksWorld } from './bridgeLinksWorld';
import { loadBridgeModules } from './bridgeModules';
import { Door, WallOptions, WallWorld, send, until, viaBridge, viaMain, wallWorld } from './bridgeWallWorld';
import { memoryStorage } from './pinWorld';
import { loadWithVscode } from './vscodeStub';
import type { sshDepsFor as SshDepsFor } from '../sshUseActions';
import { WslRelayManager } from '../wslRelayManager';
import { BUSY_PLACE } from '../aliasThrottle';

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
    assert.equal(lw.configWrites, 0, 'the writer of the per-call ssh_config is there and nothing calls it on this tree: the argv has no -F (E1.6 turns this into an assertion about the file)');
  });
});

test('L1: positive control — the main port runs the same entry with the same key', async () => {
  await both({}, {}, async ({ lw, ww }) => {
    assert.equal((await body(viaMain(ww), ww)).status, 200);
    assert.ok(lw.runs[0].argv.includes('-i'));
  });
});

test('L2: a key sealed with its own PIN refuses generically on a bridge — the body names no key, the journal has the real sentence; the main port reads the fixed sentence of rule B', async () => {
  const sentence = pinRefusalFor(KEY_NAME);
  await both({ key: 'sealed' }, {}, async ({ lw, ww }) => {
    const reply = await body(viaBridge(ww.bridge), ww);
    assert.deepEqual([reply.status, code(reply), message(reply)], [statusForErrorCode('no_credential'), 'no_credential', BRIDGE_USE_REFUSED('prod')]);
    for (const named of ['k1', KEY_NAME, 'PIN']) {
      assert.ok(!reply.body.includes(named), `"${named}" is not in the body`);
    }
    assert.ok(lw.notes.some((note) => note.includes(sentence)), `the journal got the real sentence: ${JSON.stringify(lw.notes)}`);
    assert.ok(lw.notes.includes(`prod: ${sentence} (a Remote Bridge was told only that it could not be used)`), 'and it is the exact line of today');
    assert.deepEqual(lw.runs, [], 'and nothing was run');
  });
  await both({ key: 'sealed' }, {}, async ({ ww }) => {
    const control = await body(viaMain(ww), ww);
    assert.deepEqual([code(control), message(control)], ['no_credential', SECOND_ENTRY_REFUSED('prod')], 'control: the fixed sentence of rule B on the main port, the key entry is not visible to agents');
    for (const named of ['k1', KEY_NAME]) {
      assert.ok(!control.body.includes(named), `"${named}" is not in the body`);
    }
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
    assert.equal(argv[argv.indexOf('-J') + 1], 'hop@jump.example.com', `the chain is used: ${argv.join(' ')}`);
    assert.doesNotMatch(reply.body, new RegExp(JUMP_NAME, 'i'), 'and the body carries nothing of it: neither the entry\'s name nor its host (both read jump)');
  });
});

test('L3: a jump host whose address is not valid refuses generically on a bridge, and with the fixed sentence of rule B on the main port', async () => {
  await both({ jump: 'invalid' }, {}, async ({ lw, ww }) => {
    const reply = await body(viaBridge(ww.bridge), ww);
    assert.deepEqual([reply.status, code(reply), message(reply)], [statusForErrorCode('no_credential'), 'no_credential', BRIDGE_USE_REFUSED('prod')]);
    assert.ok(!reply.body.includes(JUMP_NAME), 'the jump host\'s entry is not named');
    assert.ok(lw.notes.some((note) => note.includes(`The jump host "${JUMP_NAME}" cannot be used`)), 'the journal says which');
    assert.ok(lw.notes.includes(`prod: The jump host "${JUMP_NAME}" cannot be used: its address is not a valid host. (a Remote Bridge was told only that it could not be used)`), 'and it is the exact line of today');
    assert.deepEqual(lw.runs, []);
    assert.equal(lw.materialised.length, 1, 'the key had been written by then ...');
    assert.ok(!fs.existsSync(lw.materialised[0]), '... and is gone');
  });
  await both({ jump: 'invalid' }, {}, async ({ ww }) => {
    const control = await body(viaMain(ww), ww);
    assert.deepEqual([code(control), message(control)], ['no_credential', SECOND_ENTRY_REFUSED('prod')], 'control: the fixed sentence of rule B');
    for (const named of ['j1', `The jump host "${JUMP_NAME}"`]) {
      assert.ok(!control.body.includes(named), `"${named}" is not in the body`);
    }
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

test('K6: the key path that ssh prints is a call name, on a bridge too — the last part starts with nothing of the id of the key entry', async () => {
  await both({ printsKeyPath: true }, {}, async ({ lw, ww }) => {
    const printed: { label: string; last: string }[] = [];
    const doors: [string, Door][] = [['the bridge', viaBridge(ww.bridge)], ['the main port', viaMain(ww)]];
    for (const [at, [label, door]] of doors.entries()) {
      const reply = await body(door, ww);
      assert.equal(reply.status, 200, reply.body);
      const argv = lw.runs[at].argv;
      const keyPath = argv[argv.indexOf('-i') + 1];
      assert.equal((JSON.parse(reply.body) as { stderr: string }).stderr, `Load key "${keyPath}": invalid format`, `through ${label}`);
      printed.push({ label, last: path.basename(keyPath) });
    }
    const offenders = printed.filter((p) => p.last.startsWith('k1-')).map((p) => `${p.label}: the last part of the printed path starts with the id of the key entry: ${p.last}`);
    assert.deepEqual(offenders, []);
    for (const p of printed) {
      assert.match(p.last, /^call-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.key$/, p.label);
    }
  });
});

/* ---------------------------------------------------------------------------------------------------------------
 * Amendment 3, C.1-C.2 / F1 — a bridged call is one fresh connection that forwards nothing
 * ------------------------------------------------------------------------------------------------------------- */

/** Where `-o ForwardAgent=no` stands in an argv, or -1. */
const forwardAgentNoAt = (argv: readonly string[]): number => argv.findIndex((arg, i) => arg === '-o' && argv[i + 1] === 'ForwardAgent=no');

/** Where the other five options stand: every word that must be present on a bridge and absent off it. */
const OTHER_FIVE = ['ControlPath=none', 'ControlMaster=no', 'ClearAllForwardings=yes', 'ForwardX11=no', 'Tunnel=no'];

test('F1: through a bridge the argv has the jump, no -A -L -R, then the six options in order; off a bridge it has the forwards and none of the six', async () => {
  await both({ jump: 'valid', agentForward: true, forwards: true }, { agentForward: true }, async ({ lw, ww }) => {
    // The wall refuses an entry that forwards the agent on a bridge, so the bridged call here is the world's own: only
    // the port forwards remain, and the action is also reached once with the agent off.
    assert.equal((await body(viaMain(ww), ww)).status, 200);
    const local = lw.runs[0].argv;
    assert.ok(local.includes('-A') && local.includes('-L') && local.includes('-R'), `off a bridge today's argv: ${local.join(' ')}`);
    for (const word of ['ForwardAgent=no', ...OTHER_FIVE]) {
      assert.ok(!local.includes(word), `${word} is not sent off a bridge`);
    }
  });
  await both({ jump: 'valid', forwards: true }, {}, async ({ lw, ww }) => {
    assert.equal((await body(viaBridge(ww.bridge), ww)).status, 200);
    const bridged = lw.runs[0].argv;
    for (const forbidden of ['-A', '-L', '-R']) {
      assert.ok(!bridged.includes(forbidden), `${forbidden} is not sent on a bridge: ${bridged.join(' ')}`);
    }
    const at = forwardAgentNoAt(bridged);
    assert.notEqual(at, -1, `a bridged call forwards nothing, whatever ~/.ssh/config says: ${bridged.join(' ')}`);
    const options = bridged.slice(at, at + 12).filter((arg) => arg !== '-o');
    assert.deepEqual(options, ['ForwardAgent=no', ...OTHER_FIVE], `the six, in order: ${bridged.join(' ')}`);
    assert.ok(bridged.indexOf('-J') !== -1 && bridged.indexOf('-J') < at, `after the jump the composer made: ${bridged.join(' ')}`);
    assert.ok(at < bridged.indexOf('-i') && bridged.indexOf('-i') < bridged.indexOf('--'), 'before the key and the destination');
  });
});

test('F1: off a bridge, an entry that forwards the agent runs with -A as today and without ForwardAgent=no', async () => {
  await both({ agentForward: true }, { agentForward: true }, async ({ lw, ww }) => {
    assert.equal((await body(viaMain(ww), ww)).status, 200);
    assert.ok(lw.runs[0].argv.includes('-A'), lw.runs[0].argv.join(' '));
    assert.equal(forwardAgentNoAt(lw.runs[0].argv), -1);
  });
});

/* ---------------------------------------------------------------------------------------------------------------
 * Amendment 6, F.4 — the lock between partial E1 and E2: a bridged exec with no writer of the per-call ssh_config is refused
 * ------------------------------------------------------------------------------------------------------------- */

test('G1: with no writer of the per-call ssh_config a bridged exec is refused generically before any key or spawn; the journal says why; the main port runs', async () => {
  await both({ noConfigWriter: true }, {}, async ({ lw, ww }) => {
    const reply = await body(viaBridge(ww.bridge), ww);
    assert.deepEqual([reply.status, code(reply), message(reply)], [403, 'denied', BRIDGE_USE_REFUSED('prod')]);
    for (const word of ['ssh_config', 'E1.6']) {
      assert.ok(!reply.body.includes(word), `"${word}" is the journal's, not the agent's: ${reply.body}`);
    }
    assert.equal(lw.runs.length, 0, 'ssh was never started');
    assert.equal(lw.materialised.length, 0, 'and no key was written for a call that was refused');
    assert.equal(lw.notes.filter((note) => note.includes('no per-call ssh_config yet: E1.6')).length, 1, `one journal line: ${JSON.stringify(lw.notes)}`);
    assert.equal(ww.w.dialogs.length, 1, 'the guard is in the action, so it answered after the Allow');
  });
  await both({ noConfigWriter: true }, {}, async ({ lw, ww }) => {
    const control = await body(viaMain(ww), ww);
    assert.equal(control.status, 200, control.body);
    assert.ok(lw.runs[0].argv.includes('-i'), 'off a bridge nothing changed: the key is handed to ssh');
  });
});

test('G2: production hands the actions no writer of the per-call ssh_config (E1.6 flips this line when it wires the real one)', () => {
  const { sshDepsFor } = loadWithVscode<{ sshDepsFor: typeof SshDepsFor }>('../sshUseActions', { window: {} });
  const signal = new AbortController().signal;
  const parts: Parameters<typeof SshDepsFor>[0] = {
    storage: memoryStorage({ window: {} }),
    storageDir: '/unused',
    agentServer: { signal, acquireExecSlot: () => undefined, note: () => undefined },
    sshAgent: { socketPath: undefined, servesKeyForEntity: () => false },
    relays: new WslRelayManager(() => { throw new Error('no relay is spawned here'); }, () => undefined),
  };
  assert.equal('bridgedSshConfig' in sshDepsFor(parts), false);
});

/* ---------------------------------------------------------------------------------------------------------------
 * Partial E1 on the local doors (parent §7, change 5.1): the real action's failures, through the main port
 * ------------------------------------------------------------------------------------------------------------- */

test('M3: a key file that cannot be removed, through the main port — the finished exec answers 200, the slot is back, and one journal note says so', async () => {
  const nodeFs = require('node:fs') as typeof fs;
  const real = nodeFs.rmSync;
  const refused = mock.method(nodeFs, 'rmSync', (target: fs.PathLike, options?: fs.RmOptions): void => {
    if (String(target).endsWith('.key')) {
      throw Object.assign(new Error(`EPERM: operation not permitted, unlink '${String(target)}'`), { code: 'EPERM' });
    }
    real(target, options);
  });
  try {
    await both({}, {}, async ({ lw, ww }) => {
      const reply = await body(viaMain(ww), ww);
      assert.equal(reply.status, 200, reply.body);
      assert.equal(refused.mock.callCount() > 0, true, 'the removal was attempted');
      assert.equal(lw.slotsHeld, 0, 'the slot came back');
      assert.equal(lw.notes.filter((note) => note.startsWith('ssh:exec — the key file could not be removed: ')).length, 1, JSON.stringify(lw.notes));
    });
  } finally {
    refused.mock.restore();
  }
});

test('M3: a credential read that throws, through the main port — the call is answered, the slot is back and nothing ran', async () => {
  await both({ keyReadThrows: true }, {}, async ({ lw, ww }) => {
    const reply = await body(viaMain(ww), ww);
    assert.deepEqual([reply.status, code(reply), message(reply)], [500, 'internal', INTERNAL_FAILURE]);
    assert.ok(ww.w.audit.some((line) => line.includes('the keychain would not answer')), 'and the reason is in the journal');
    assert.equal(lw.slotsHeld, 0, 'the slot came back');
    assert.deepEqual(lw.runs, [], 'and nothing ran');
    const next = await body(viaMain(ww), ww);
    assert.equal(next.status, reply.status, 'the next call is answered the same way: the pool is not exhausted');
  });
});

/* ---------------------------------------------------------------------------------------------------------------
 * The follow-up contract (parent §4.10): an `exec` on a forwarding entry keeps the place while its signing prompt may stand.
 * There is no real agent socket in CI: the pretended `ssh` holds (`lw.hold`) where the socket's signing modal would be open.
 * ------------------------------------------------------------------------------------------------------------- */

const BUSY_SENTENCE = BUSY_PLACE;
const ALIAS_EXEC = { path: '/v1/alias/exec', body: { alias: 'one', command: 'id' } };

/** An exec held inside the pretended `ssh` (a signing prompt open), a second local call, and what became of it. */
async function secondCallDuringHeldExec(links: LinksOptions): Promise<{ busy: boolean; ran: number }> {
  let busy = false;
  let ran = 0;
  await both(links, { agentForward: links.agentForward === true }, async ({ lw, ww }) => {
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    lw.hold = () => gate;
    const first = send(viaMain(ww), ALIAS_EXEC);
    await until(() => lw.runs.length === 1, 'the first exec to be inside ssh (its signing prompt open)');
    const second = send(viaMain(ww), ALIAS_EXEC);
    const raced = await Promise.race([second, new Promise<string>((resolve) => setTimeout(resolve, 600, 'waiting'))]);
    busy = typeof raced !== 'string' && raced.status === 429 && message(raced) === BUSY_SENTENCE;
    ran = lw.runs.length;
    release();
    await Promise.all([first, second]);
  });
  return { busy, ran };
}

test('exec on a forwarding entry with the agent socket up keeps the place while its signing prompt may stand — a second local call is told busy (prompt mocked: no real socket here)', async () => {
  const held = await secondCallDuringHeldExec({ agentForward: true, agentSocket: '/run/agent.sock' });
  assert.deepEqual(held, { busy: true, ran: 1 });
});

test('exec on a non-forwarding entry frees the place at the dialog\'s close — a second local call is asked and runs while the first runs', async () => {
  const held = await secondCallDuringHeldExec({ agentSocket: '/run/agent.sock' });
  assert.deepEqual(held, { busy: false, ran: 2 });
});

test('exec on a forwarding entry with the agent socket DOWN frees the place: no signing prompt can come through a socket that is not there', async () => {
  const held = await secondCallDuringHeldExec({ agentForward: true });
  assert.deepEqual(held, { busy: false, ran: 2 });
});

/* ---------------------------------------------------------------------------------------------------------------
 * Change 6.1: `exec`'s follow-up flag is read when the dialog CLOSES on an Allow, not at the gate: a socket that comes up while the
 * dialog is open is seen (the signing prompt can then come), and one that went down is seen too.
 * ------------------------------------------------------------------------------------------------------------- */

const ASK_BY: Record<'alias' | 'mcp', { path: string; body: Record<string, unknown> }> = {
  alias: { path: '/v1/alias/exec', body: { alias: 'one', command: 'id' } },
  mcp: { path: '/v1/mcp/use/exec', body: { entry: 'e1', command: 'id' } },
};

/** A forwarding entry's exec whose agent socket is up or down when its dialog opens and up or down at the Allow: what a second call finds. */
async function momentOfTheFlag(door: 'alias' | 'mcp', upAtGate: boolean, upAtAllow: boolean): Promise<{ busy: boolean; asked: boolean }> {
  const SOCKET = '/run/agent.sock';
  let outcome = { busy: false, asked: false };
  await both({ agentForward: true, agentSocket: upAtGate ? SOCKET : undefined }, { agentForward: true, holdDialogs: true }, async ({ lw, ww }) => {
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    lw.hold = () => gate;
    try {
      const first = send(viaMain(ww), ASK_BY[door]);
      await until(() => ww.w.openDialogs.length === 1, 'the first dialog');
      lw.socket = upAtAllow ? SOCKET : undefined;
      ww.w.openDialogs[0]('Allow');
      await until(() => lw.runs.length === 1, 'the exec to be inside ssh');
      const second = send(viaMain(ww), ASK_BY[door]);
      const raced = await Promise.race([second, new Promise<string>((resolve) => setTimeout(resolve, 600, 'waiting'))]);
      outcome = { busy: typeof raced !== 'string' && raced.status === 429 && message(raced) === BUSY_SENTENCE, asked: ww.w.openDialogs.length === 2 };
      release();
      ww.w.openDialogs.slice(1).forEach((answer) => answer('Allow'));
      await Promise.all([first, second]);
    } finally {
      release();
      ww.w.openDialogs.forEach((answer) => answer('Deny'));
    }
  });
  return outcome;
}

for (const door of ['alias', 'mcp'] as const) {
  test(`6.1 through the ${door} door: a socket down when the dialog opens and up at the Allow keeps the place — a second call is busy, no second modal`, async () => {
    assert.deepEqual(await momentOfTheFlag(door, false, true), { busy: true, asked: false });
  });

  test(`6.1 through the ${door} door: a socket up when the dialog opens and down at the Allow frees the place — a second call is asked`, async () => {
    assert.deepEqual(await momentOfTheFlag(door, true, false), { busy: false, asked: true });
  });

  test(`6.1 through the ${door} door: up at both moments holds, down at both frees (the controls)`, async () => {
    assert.deepEqual(await momentOfTheFlag(door, true, true), { busy: true, asked: false });
    assert.deepEqual(await momentOfTheFlag(door, false, false), { busy: false, asked: true });
  });
}

/* ---------------------------------------------------------------------------------------------------------------
 * The follow-up contract through the doors (the epoch 6 review): a quiet forwarding exec holds nothing, and the hold is bounded
 * ------------------------------------------------------------------------------------------------------------- */

test('C9b (D.3): a quiet (pre-consented) forwarding exec with the agent socket up holds the place with no dialog — an asking call and a second quiet call are busy while it runs, and asked once it ends', async () => {
  await both({ agentForward: true, agentSocket: '/run/agent.sock' }, { agentForward: true, quietLocal: true, holdDialogs: true }, async ({ lw, ww }) => {
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    lw.hold = () => gate;
    try {
      const first = send(viaMain(ww), ASK_BY.mcp);
      await until(() => lw.runs.length === 1, 'the quiet exec to be inside ssh');
      for (const [who, door, ask] of [['an asking alias call', viaMain(ww), ASK_BY.alias], ['a second quiet call', viaMain(ww), ASK_BY.mcp], ['a bridged call', viaBridge(ww.bridge), ASK_BY.alias]] as const) {
        const refused = await Promise.race([send(door, ask), new Promise<string>((resolve) => setTimeout(resolve, 600, 'waiting'))]);
        assert.ok(typeof refused !== 'string', `${who} was let in over the quiet call's possible signing prompt`);
        assert.deepEqual([refused.status, message(refused)], [429, BUSY_PLACE], who);
      }
      assert.equal(ww.w.dialogs.length, 0, 'nobody was asked: the entry\'s policy answered, and no call raised a dialog');
      assert.equal(lw.runs.length, 1, 'and nothing else ran');
      release();
      assert.equal((await first).status, 200);
      const next = send(viaMain(ww), ASK_BY.alias);
      await until(() => ww.w.openDialogs.length === 1, 'the next asking call to be asked, now that the quiet call is over');
      ww.w.openDialogs[0]('Allow');
      assert.equal((await next).status, 200);
    } finally {
      release();
      ww.w.openDialogs.forEach((answer) => answer('Deny'));
    }
  });
});

test('C9b (D.3): the same entry with the agent socket down holds nothing — a second quiet call runs while the first does, and an asking call is asked', async () => {
  await both({ agentForward: true }, { agentForward: true, quietLocal: true, holdDialogs: true }, async ({ lw, ww }) => {
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    lw.hold = () => gate;
    try {
      const first = send(viaMain(ww), ASK_BY.mcp);
      await until(() => lw.runs.length === 1, 'the quiet exec to be inside ssh');
      const second = send(viaMain(ww), ASK_BY.mcp);
      await until(() => lw.runs.length === 2, 'the second quiet call to run (it was told busy: the quiet call held the place)');
      const asking = send(viaMain(ww), ASK_BY.alias);
      await until(() => ww.w.openDialogs.length === 1, 'an asking call to be asked while the quiet calls run');
      ww.w.openDialogs[0]('Allow');
      release();
      assert.deepEqual((await Promise.all([first, second, asking])).map((reply) => reply.status), [200, 200, 200]);
    } finally {
      release();
      ww.w.openDialogs.forEach((answer) => answer('Deny'));
    }
  });
});

test('the hold of a forwarding exec is bounded by the exec timeout: through a door the runner is handed at most MAX_EXEC_TIMEOUT_MS, however long the body asks (the runner ends at that bound: sshExecRunner.test.ts, "a hung child is killed at the timeout")', async () => {
  await both({}, {}, async ({ lw, ww }) => {
    const reply = await send(viaMain(ww), { path: '/v1/alias/exec', body: { alias: 'one', command: 'id', timeoutMs: 10_000_000 } });
    assert.equal(reply.status, 200, reply.body);
    assert.equal(lw.runs[0].timeoutMs, MAX_EXEC_TIMEOUT_MS);
  });
});
