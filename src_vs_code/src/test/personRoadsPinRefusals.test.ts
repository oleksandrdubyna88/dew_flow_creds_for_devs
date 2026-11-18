import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { after, test, TestContext } from 'node:test';
import { cleanupScope, ownedDir, ownedFile } from '../../scripts/lib/leftovers.cjs';
import { formatHostKey } from '../hostKeyPin';
import type { PinClient } from '../pinClient';
import { KEY, KNOWS, OLDER, Parts, World, click, pinFiles, ran, settled, unreadable, world, writtenKey } from './personRoadsWorld';
import { sourceWordsOf, valuesOf } from './pinnedArgv';

/**
 * G1, E2.S2: the two refusals that stand before the words of a pinned call, on the three roads of the person (the plan's §3.10 and
 * §3.11; its test 19, the road half, and its test 22). A path of the pin file that `ssh` would not read as the one file, and an `ssh`
 * program whose version cannot be read, start nothing: no `ssh` run, no pin file, the sentence for the person, the key file of the call
 * deleted. An entry with no saved host key is asked nothing.
 *
 * <p>The question about the client is the world's stand-in of `./pinClient` (`clientAsks`), a kind of its own: `runs` counts
 * connections only, so the counts of E1's road tests stay as they are. `materializeKnownHosts` is the real one.</p>
 */

const scope = cleanupScope();
after(() => scope.close());

const PIN = formatHostKey({ algorithm: 'ssh-ed25519', base64: 'AAAAC3NzaC1lZDI1NTE5AAAAIKNOWNKEY' });
const KEY_FILE = '/nonexistent/creds-test/call.key';
const PROBE_OK = 'creds=-\narch=x86_64\nos=Linux\nget=/usr/bin/curl\n';
const INSTALLED = 'creds-install: installed /home/dev/.local/bin/creds\n';
const yes = (_message: string, rest: readonly unknown[]): string | undefined => rest.find((one): one is string => typeof one === 'string');

const sentenceE = (kind: string): string =>
  `The saved host key of "box" cannot be handed to ssh, so nothing was sent to that host. The folder where this editor keeps the files of CredsForDevs has a path with ${kind}, and ssh does not read a file under such a path as the one file it is. This is about this computer, not about the host or the saved key.`;
const sentenceF = (how: string): string =>
  `CredsForDevs could not read the version of the ssh program on this computer (${how}), so it did not start a connection that has to check the saved host key of "box". Nothing was sent to that host. The reason is the ssh program here, not the host.`;

/**
 * A FILE of this test. A storage folder "inside" it can never be made, by any user and on any platform: so a product that does not
 * refuse (the one before E2.S2, in the RED run) fails at its write and leaves nothing behind, in no folder.
 */
const NOT_A_FOLDER = ownedFile(scope, 'blocked', 'not-a-folder');
fs.writeFileSync(NOT_A_FOLDER, '');
const under = (name: string): string => path.join(NOT_A_FOLDER, name);

/**
 * Two backslashes in a row. Windows' `path.join` folds them into one inside a path and keeps them only at the start of a network
 * path, so there the folder is one (a reserved name: nothing answers it, and this product never asks).
 */
const NETWORK_FOLDER = process.platform === 'win32' ? '\\\\creds-test.invalid\\share\\creds' : under('a\\\\b');

/**
 * A storage folder whose path makes the pin file's path one of the refused kinds, and the words sentence E says for it. None is ever
 * made. Two kinds have no row, and the pure rule holds them (P1 of `pinWords.test.ts`): a backslash at the end cannot come from a
 * folder (the file's name ends the path), and a tilde at the start would be a folder relative to where the tests run.
 */
const REFUSED_FOLDERS: readonly (readonly [kind: string, storageDir: string])[] = [
  ['a control character', under('a\tb')],
  ['a double quote', under('a"b')],
  ['two backslashes in a row (a network path)', NETWORK_FOLDER],
  ['a backslash before an apostrophe', under("a\\'b")],
  ['a percent sign', under('100%')],
  ['the characters ${', under('a${b}')],
];

/** Open a bridge and let its socket check run to its end: the check waits 1.5 s on a timer between its two runs. */
async function bridged(t: TestContext, parts: Parts): Promise<World> {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const w = world(parts);
  await click(w, 'openRemoteBridge');
  await settled();
  t.mock.timers.tick(1500);
  await settled();
  return w;
}

/** Nothing was started and nothing was written for a refused call, and its key file is deleted once. */
function startedNothing(w: World, dir: string, what: string): void {
  assert.deepEqual(w.runs.map((one) => one.argv), [], `${what}: an ssh run started`);
  assert.equal(w.children.length, 0, `${what}: a bridge was started`);
  assert.equal(w.bridges.remotePathFor(KEY), undefined, `${what}: the row is bridged`);
  assert.deepEqual(pinFiles(dir), [], `${what}: a pin file was written`);
  assert.deepEqual(w.forgotten, [KEY_FILE], `${what}: the key file of the call was not deleted once`);
}

for (const [kind, storageDir] of REFUSED_FOLDERS) {
  test(`E1: a storage folder with ${kind} in its path starts no install: sentence E, no question to the client, no run, no pin file, the key file deleted`, async () => {
    const w = world({ storageDir, hostKey: PIN, clicks: [writtenKey(KEY_FILE)], answer: yes });

    await click(w, 'installRemoteCli');

    assert.deepEqual(w.errors, [`Cannot reach "box": ${sentenceE(kind)}`]);
    assert.equal(w.errors[0].includes(storageDir), false, 'the sentence echoes the path');
    assert.deepEqual(w.clientAsks, [], 'the rule of the path is asked before the client');
    startedNothing(w, storageDir, kind);
  });

  test(`E2: a storage folder with ${kind} in its path opens no bridge: sentence E, no run, no pin file, the key file deleted, no socket check`, async (t) => {
    const w = await bridged(t, { storageDir, hostKey: PIN, clicks: [writtenKey(KEY_FILE)], checks: [writtenKey('/nonexistent/creds-test/check.key')] });

    assert.deepEqual(w.errors, [`Cannot bridge to "box": ${sentenceE(kind)}`]);
    assert.deepEqual(w.infos.filter((text) => text.startsWith('Bridge open')), [], 'the person was told the bridge is open');
    assert.deepEqual(w.clientAsks, []);
    startedNothing(w, storageDir, kind);
  });
}

for (const [how, client] of [['exit code 1', unreadable(1)], ['exit code 0', unreadable(0)], ['it did not start, or did not end in time', unreadable(null)]] as const) {
  test(`F1: an ssh program whose version cannot be read (${how}) starts no install: sentence F, no run, no pin file, the key file deleted`, async () => {
    const dir = ownedDir(scope, 'f1');
    const w = world({ storageDir: dir, hostKey: PIN, client, clicks: [writtenKey(KEY_FILE)], answer: yes });

    await click(w, 'installRemoteCli');

    assert.deepEqual(w.errors, [`Cannot reach "box": ${sentenceF(how)}`]);
    assert.equal(w.clientAsks.length, 1);
    startedNothing(w, dir, how);
    assert.equal(fs.existsSync(path.join(dir, 'keys')), false, 'nothing was made in the storage folder');
  });

  test(`F2: an ssh program whose version cannot be read (${how}) opens no bridge: sentence F, no run, no pin file, the key file deleted, no socket check`, async (t) => {
    const dir = ownedDir(scope, 'f2');
    const w = await bridged(t, { storageDir: dir, hostKey: PIN, client, clicks: [writtenKey(KEY_FILE)], checks: [writtenKey('/nonexistent/creds-test/check.key')] });

    assert.deepEqual(w.errors, [`Cannot bridge to "box": ${sentenceF(how)}`]);
    assert.deepEqual(w.infos.filter((text) => text.startsWith('Bridge open')), []);
    assert.equal(w.clientAsks.length, 1, 'the socket check never ran, so it never asked');
    startedNothing(w, dir, how);
  });
}

test('F3: the socket check whose own question finds no version does not run: the log says sentence F, no run of the check starts, its pin file is not written', async (t) => {
  const dir = ownedDir(scope, 'f3');
  const answers: PinClient[] = [KNOWS, unreadable(255)];
  const w = await bridged(t, { storageDir: dir, hostKey: PIN, client: (index) => answers[index], clicks: [writtenKey(KEY_FILE)], checks: [writtenKey('/nonexistent/creds-test/check.key')] });

  assert.equal(w.children.length, 1, 'the bridge itself opened: its own question was answered');
  assert.equal(w.clientAsks.length, 2, 'the bridge asked, and the check asked');
  assert.deepEqual(w.runs.map((one) => one.argv), [], 'a run of the check started');
  assert.deepEqual(w.logs.filter((line) => line.startsWith('socket check did not run: ')), [`socket check did not run: ${sentenceF('exit code 255')}`]);
  assert.equal(pinFiles(dir).length, 1, 'only the pin file of the bridge is on the disk');
  assert.deepEqual(w.errors, []);
});

test('F4: "cannot be read" is asked again: a second click asks the client a second time, and connects when it then answers', async () => {
  const dir = ownedDir(scope, 'f4');
  const answers: PinClient[] = [unreadable(1), KNOWS];
  const w = world({ storageDir: dir, hostKey: PIN, client: (index) => answers[index], clicks: [writtenKey(KEY_FILE), writtenKey(KEY_FILE)], answer: yes, run: (index) => ran([PROBE_OK, INSTALLED][index]) });

  await click(w, 'installRemoteCli');
  assert.equal(w.runs.length, 0);
  await click(w, 'installRemoteCli');

  assert.equal(w.clientAsks.length, 2);
  assert.equal(w.runs.length, 2, 'the probe and the install of the second click');
  assert.deepEqual(w.errors, [`Cannot reach "box": ${sentenceF('exit code 1')}`]);
});

test('A1: a pinned call asks the client ONCE per call, before any pin file is written and before any run: of the bare word ssh, in no folder, with the environment of the credential', async () => {
  const dir = ownedDir(scope, 'a1');
  const env = { PATH: '/opt/bin:/usr/bin', CREDS_SSH_PASSWORD: 'a-secret' };
  const w = world({ storageDir: dir, hostKey: PIN, clicks: [{ ok: true, env, auth: 'askpass' }], answer: yes, run: (index) => ran([PROBE_OK, INSTALLED][index]) });

  await click(w, 'installRemoteCli');

  assert.equal(w.runs.length, 2, 'the probe and the install: the question is not among the runs');
  assert.equal(w.clientAsks.length, 1);
  const [asked] = w.clientAsks;
  assert.deepEqual({ pinFilesBefore: asked.pinFilesBefore, runsBefore: asked.runsBefore }, { pinFilesBefore: 0, runsBefore: 0 });
  assert.equal(asked.call.program, 'ssh');
  assert.equal('cwd' in asked.call, false);
  assert.equal(asked.call.env, env, 'the environment that the runs of this call get');
  assert.equal(w.runs.every((one) => one.argv.every((word) => word !== '-V')), true);
});

test('A2: a bridge and its socket check ask once each; the three connections are the bridge, the sweep and the mode check, as before', async (t) => {
  const dir = ownedDir(scope, 'a2');
  const w = await bridged(t, { storageDir: dir, hostKey: PIN, clicks: [writtenKey(KEY_FILE)], checks: [writtenKey('/nonexistent/creds-test/check.key')] });

  assert.equal(w.bridgeArgvs.length, 1);
  assert.equal(w.runs.length, 2, 'the sweep and the mode check');
  assert.equal(w.clientAsks.length, 2);
  assert.deepEqual(w.clientAsks.map((one) => one.call.program), ['ssh', 'ssh']);
});

for (const [label, hostKey] of [['no saved host key', undefined], ['an empty saved host key', ''], ['a saved host key of white space', ' \n\t ']] as const) {
  test(`A3: an entry with ${label} is asked nothing, also in a folder that the rule refuses and with a client that cannot be read: its five runs start as before`, async (t) => {
    const answers = ['', '600', PROBE_OK, INSTALLED];
    const w = await bridged(t, {
      storageDir: under('100%'), hostKey, client: unreadable(1), answer: yes, run: (index) => ran(answers[index]),
      clicks: [writtenKey(KEY_FILE), writtenKey(KEY_FILE)], checks: [writtenKey(KEY_FILE)],
    });
    await click(w, 'installRemoteCli');

    const argvs = [...w.bridgeArgvs, ...w.runs.map((one) => one.argv)];
    assert.equal(argvs.length, 5, `the five runs did not all start: ${argvs.length}`);
    assert.deepEqual(w.clientAsks, []);
    assert.deepEqual(w.errors, []);
    for (const argv of argvs) {
      assert.ok(argv.includes('StrictHostKeyChecking=accept-new'), argv.join(' '));
      assert.deepEqual(sourceWordsOf(argv), [], 'an unpinned run carries a word of a pinned call');
    }
  });
}

for (const [label, client, command] of [['a client that knows the option', KNOWS, ['none']], ['a client below 8.5', OLDER, []]] as const) {
  test(`W1: with ${label}, each of the five runs of a pinned entry says VerifyHostKeyDNS=no and LogLevel=ERROR, and KnownHostsCommand ${command.length === 1 ? '=none' : 'in no word'}`, async (t) => {
    const dir = ownedDir(scope, 'w1');
    const answers = ['', '600', PROBE_OK, INSTALLED];
    const w = await bridged(t, {
      storageDir: dir, hostKey: PIN, client, answer: yes, run: (index) => ran(answers[index]),
      clicks: [writtenKey(KEY_FILE), writtenKey(KEY_FILE)], checks: [writtenKey(KEY_FILE)],
    });
    await click(w, 'installRemoteCli');

    const argvs = [...w.bridgeArgvs, ...w.runs.map((one) => one.argv)];
    assert.equal(argvs.length, 5, `the five runs did not all start: ${argvs.length}; errors: ${w.errors.join(' | ')}`);
    for (const argv of argvs) {
      assert.deepEqual(valuesOf(argv, 'StrictHostKeyChecking'), ['yes']);
      assert.deepEqual(valuesOf(argv, 'VerifyHostKeyDNS'), ['no']);
      assert.deepEqual(valuesOf(argv, 'LogLevel'), ['ERROR']);
      assert.deepEqual(valuesOf(argv, 'KnownHostsCommand'), command);
    }
    assert.deepEqual(w.errors, []);
  });
}

test('W2: a storage folder with a space and an apostrophe works: the pin file is written, each run names it in double quotes as BOTH files, and it holds the pin while the run starts', async () => {
  const dir = path.join(ownedDir(scope, 'w2'), "it's here");
  fs.mkdirSync(dir);
  const w = world({ storageDir: dir, hostKey: PIN, realForget: true, clicks: [{ ok: true, env: {}, auth: 'askpass' }], answer: yes, run: (index) => ran([PROBE_OK, INSTALLED][index]) });

  await click(w, 'installRemoteCli');

  assert.equal(w.runs.length, 2, w.errors.join(' | '));
  for (const one of w.runs) {
    const [user] = valuesOf(one.argv, 'UserKnownHostsFile');
    assert.match(user, /^".*it's here.*known_hosts-e1-[0-9a-f-]{36}"$/);
    assert.deepEqual(valuesOf(one.argv, 'GlobalKnownHostsFile'), [user]);
    assert.equal(one.knownHosts?.text, `box.example ${PIN}\n`, 'the file that the word names held the pin when the run started');
  }
  assert.deepEqual(pinFiles(dir), [], 'the pin file went with the call');
});
