import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { statusForErrorCode } from '../brokerProtocol';
import { materializedKeysDir } from '../materializedKeys';
import { code, message } from './bridgeDoorHarness';
import { allowListedNames, body, both, notified } from './bridgeLinksRun';
import { ClientAnswer, LinksOptions, LinksWorld } from './bridgeLinksWorld';
import { loadBridgeModules } from './bridgeModules';
import { viaBridge, viaMain } from './bridgeWallWorld';

/**
 * The client check of a bridged call (the E1.6 spec §S6.14 Y3, L15-L18 and G3), through the REAL `sshExecAction` behind the real broker and a
 * real bridge listener, as `bridgeLinks.test.ts` runs it: `ssh -V` under the bridged environment before any file of the call is written.
 */

const { BRIDGE_USE_REFUSED } = loadBridgeModules().scope;

const GOOD_VERSION: ClientAnswer = { exit: 0, stderr: 'OpenSSH_10.2p1 Ubuntu-2ubuntu3, OpenSSL 3.4.1 11 Feb 2025\n' };
const OLD_VERSION: ClientAnswer = { exit: 0, stderr: 'OpenSSH_8.6p1 Ubuntu-4ubuntu0.7, OpenSSL 3.0.2 15 Mar 2022\n' };
const NO_VERSION: ClientAnswer = { exit: 255, stderr: '' };
const R13_LINE = 'The ssh on this computer answered OpenSSH_8.6. A Remote Bridge needs OpenSSH 8.9 or newer, and on Windows the OpenSSH that Windows ships, 9.5 or newer.';
const R12_LINE = 'ssh did not answer its version under the environment a Remote Bridge gives it (exit 255). No call can go through a Remote Bridge from this computer until it does.';
const versionRuns = (lw: LinksWorld): LinksWorld['runs'] => lw.runs.filter((run) => run.argv.length === 1 && run.argv[0] === '-V');

test('L15: a client that answers OpenSSH_8.6p1 is refused generically; runs holds the -V spawn alone, in an empty folder that is gone, and the journal has R13; the main port is not asked', async () => {
  await both({ client: [OLD_VERSION], jump: 'valid' }, {}, async ({ lw, ww }) => {
    const reply = await body(viaBridge(ww.bridge), ww);

    assert.deepEqual([reply.status, code(reply), message(reply)], [statusForErrorCode('no_credential'), 'no_credential', BRIDGE_USE_REFUSED('prod')]);
    assert.ok(lw.notes.includes(notified(R13_LINE)), `the journal has R13: ${JSON.stringify(lw.notes)}`);
    assert.ok(!reply.body.includes('OpenSSH'), `the agent is told nothing of the client: ${reply.body}`);
    assert.equal(lw.runs.length, 1, 'the -V spawn alone');
    const [spawn] = lw.runs;
    assert.deepEqual(spawn.argv, ['-V']);
    assert.deepEqual(Object.keys(spawn.env).sort(), allowListedNames().sort(), 'the bridged environment');
    assert.equal(spawn.timeoutMs, 10_000);
    assert.deepEqual(spawn.cwdFiles, [], 'an empty folder');
    assert.equal(path.dirname(spawn.cwd as string), materializedKeysDir(lw.storageDir));
    assert.equal(lw.slotsHeld, 0, 'the slot is back');
    assert.deepEqual(fs.readdirSync(materializedKeysDir(lw.storageDir)), [], 'the folder of the check is gone, and no file of the call was written');
    assert.equal(lw.materialised.length, 1, 'only the destination\'s own key: the hop\'s key file of the call was never written');
    assert.equal(lw.configWrites, 1, 'the writer ran pass 1 and was stopped by the check');
  });
  await both({ client: [OLD_VERSION] }, {}, async ({ lw, ww }) => {
    assert.equal((await body(viaMain(ww), ww)).status, 200, 'control: the main port runs');
    assert.deepEqual(versionRuns(lw), [], 'and does not ask for a version');
  });
});

test('L16: two good calls spawn `ssh -V` once, and the first spawn of the window comes before the call\'s own ssh', async () => {
  await both({ client: [GOOD_VERSION] }, {}, async ({ lw, ww }) => {
    assert.equal((await body(viaBridge(ww.bridge), ww)).status, 200);
    assert.equal((await body(viaBridge(ww.bridge), ww)).status, 200);

    assert.equal(versionRuns(lw).length, 1);
    assert.deepEqual(lw.runs.map((run) => run.argv.length === 1), [true, false, false]);
  });
});

test('L17: a bad answer then a good one: two -V spawns, the first call refused with R12, the second runs, a third asks nothing', async () => {
  await both({ client: [NO_VERSION, GOOD_VERSION] }, {}, async ({ lw, ww }) => {
    const first = await body(viaBridge(ww.bridge), ww);
    assert.deepEqual([first.status, message(first)], [statusForErrorCode('no_credential'), BRIDGE_USE_REFUSED('prod')]);
    assert.ok(lw.notes.includes(notified(R12_LINE)), JSON.stringify(lw.notes));
    assert.equal(versionRuns(lw).length, 1);

    assert.equal((await body(viaBridge(ww.bridge), ww)).status, 200);
    assert.equal(versionRuns(lw).length, 2, 'the bad answer was not kept');
    assert.equal((await body(viaBridge(ww.bridge), ww)).status, 200);
    assert.equal(versionRuns(lw).length, 2, 'the good one was');
  });
});

test('L18: an entry that pass 1 refuses (R5) spends no -V spawn, and says R5, not R13, whatever the client is', async () => {
  const line = '"prod" logs in by password and pins no host key. Through a Remote Bridge a password goes only to a host whose key is pinned.';
  await both({ client: [OLD_VERSION], key: 'none', destPassword: 'a password' }, {}, async ({ lw, ww }) => {
    const reply = await body(viaBridge(ww.bridge), ww);

    assert.equal(reply.status, statusForErrorCode('no_credential'));
    assert.ok(lw.notes.includes(notified(line)), JSON.stringify(lw.notes));
    assert.ok(!lw.notes.some((note) => note.includes('OpenSSH')), 'R13 was not said');
    assert.deepEqual(lw.runs, [], 'no spawn at all');
  });
});

test('G3: with no client check in the deps a bridged exec is refused generically before any key or spawn; the journal says why; the main port runs', async () => {
  await both({ noClientCheck: true }, {}, async ({ lw, ww }) => {
    const reply = await body(viaBridge(ww.bridge), ww);

    assert.deepEqual([reply.status, code(reply), message(reply)], [403, 'denied', BRIDGE_USE_REFUSED('prod')]);
    assert.equal(lw.notes.filter((note) => note.includes('no client check for this call')).length, 1, JSON.stringify(lw.notes));
    assert.deepEqual([lw.runs.length, lw.materialised.length, lw.configWrites], [0, 0, 0]);
    assert.equal((await body(viaMain(ww), ww)).status, 200, 'control: off a bridge nothing is needed');
  });
});

const UNCHECKED_LINE = 'The files of this call were written without the client check having passed.';
const noCheck = (): Promise<string | undefined> => Promise.resolve(undefined);

test('L19: a writer that says ok without the client check having passed is refused (internal) by the road: nothing runs, its files are gone, one journal line', async () => {
  const skipping: LinksOptions['writer'] = (real) => (request) => real({ ...request, beforeFiles: noCheck });
  const asksThenIgnores: LinksOptions['writer'] = (real) => async (request) => {
    await request.beforeFiles();
    return real({ ...request, beforeFiles: noCheck });
  };
  for (const [writer, client] of [[skipping, [GOOD_VERSION]], [asksThenIgnores, [OLD_VERSION]]] as const) {
    await both({ writer, client }, {}, async ({ lw, ww }) => {
      const reply = await body(viaBridge(ww.bridge), ww);

      assert.equal(reply.status, statusForErrorCode('internal'), `the call is refused: ${reply.body}`);
      assert.deepEqual([reply.status, code(reply), message(reply)], [statusForErrorCode('internal'), 'internal', BRIDGE_USE_REFUSED('prod')]);
      assert.deepEqual(lw.notes.filter((note) => note.includes(UNCHECKED_LINE)), [notified(UNCHECKED_LINE)], JSON.stringify(lw.notes));
      assert.deepEqual(lw.runs.filter((run) => !(run.argv.length === 1 && run.argv[0] === '-V')), [], 'no ssh of the call was started');
      assert.equal(lw.slotsHeld, 0, 'the slot is back');
      assert.deepEqual(fs.readdirSync(materializedKeysDir(lw.storageDir)), [], 'the files the writer made are gone');
    });
  }
});
