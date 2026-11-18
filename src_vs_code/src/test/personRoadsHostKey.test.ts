import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { after, test, TestContext } from 'node:test';
import * as ts from 'typescript';
import { cleanupScope, ownedDir } from '../../scripts/lib/leftovers.cjs';
import * as hostKeyPin from '../hostKeyPin';
import { materializedKeysDir } from '../materializedKeys';
import * as realBridge from '../sshBridge';
import type { SshExecOutcome } from '../sshExecRunner';
import { KEY, Parts, TIMED_OUT, World, click, knownHostsOf, passwordLogin, pinFiles, ran, settled, world } from './personRoadsWorld';
import { valuesOf } from './pinnedArgv';

/**
 * G1, E1.S3: the three roads of the person hand the pin file of their call to `ssh`, and a host key that `ssh` refused is told to
 * the person. The bridge socket check, *Install creds on host* and *Open Remote Bridge…* are driven as the extension registers
 * them, over the world of `personRoadsWorld.ts`.
 *
 * <p><b>Part 1</b> is the match and the sentence alone (`hostKeyPin.ts`). <b>Part 2</b> is what each of the five runs is SENT: strict
 * checking and ONE file of the call as both known-hosts files, the file on the disk with the line of the entry at the moment of the
 * run. <b>Part 3</b> is sentence C, and the runs that must NOT be told as a refused host key. <b>Part 4</b> is the list of the argv
 * calls.</p>
 *
 * <p>`materializeKnownHosts` and `forgetMaterializedKey` are the real ones, in a real storage folder that this file owns. The runner
 * and the spawner are stand-ins: no `ssh` starts. The texts that the stand-in answers were printed by a real `ssh` (OpenSSH 10.2p1,
 * against a real `sshd` on the loopback, 2026-11-17). That a real `ssh` refuses a host with another key is not shown by any test of
 * this file: the smoke of E1.S4 and E2 show it.</p>
 */

const scope = cleanupScope();
after(() => scope.close());

const HOST_KEY = { algorithm: 'ssh-ed25519', base64: 'AAAAC3NzaC1lZDI1NTE5AAAAIKNOWNKEY' };
const PIN = hostKeyPin.formatHostKey(HOST_KEY);
const PIN_LINE = hostKeyPin.knownHostsLine('box.example', undefined, HOST_KEY);
/** The name of a pin file of one call: the entry's id and a uuid. */
const CALL_PIN = /^known_hosts-e1-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const PROBE_OK = 'creds=-\narch=x86_64\nos=Linux\nget=/usr/bin/curl\n';
const INSTALLED = 'creds-install: installed /home/dev/.local/bin/creds\n';

const SENTENCE_C =
  '"box" did not present its saved host key, so CredsForDevs did not connect. If this server was rebuilt, use Connect SSH on this entry: it shows the new key and asks before it replaces the saved one. If it was not, do not connect.';
const BRIDGE_NOT_OPEN = `The bridge to "box" is not open: ${SENTENCE_C}`;

/** The lines of a real `ssh` as it prints them: it ends its own lines with CR LF, also on Linux. */
const printed = (...lines: string[]): string => lines.map((line) => `${line}\r\n`).join('');

/** The host presents a key that is not the pinned one: 15 lines, exit code 255. The line of the fingerprint ends with LF alone. */
const REFUSED_KEY = printed(
  '@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@',
  '@    WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!     @',
  '@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@',
  'IT IS POSSIBLE THAT SOMEONE IS DOING SOMETHING NASTY!',
  'Someone could be eavesdropping on you right now (man-in-the-middle attack)!',
  'It is also possible that a host key has just been changed.',
  'The fingerprint for the ED25519 key sent by the remote host is\nSHA256:LffarYzG0qeh+MC4Rg4fmMufJMJIjrjBIuqoQgUO2YE.',
  'Please contact your system administrator.',
  'Add correct host key in /storage/keys/4242/known_hosts-e1-0b6f3c1e to get rid of this message.',
  'Offending ED25519 key in /storage/keys/4242/known_hosts-e1-0b6f3c1e:1',
  '  remove with:',
  "  ssh-keygen -f '/storage/keys/4242/known_hosts-e1-0b6f3c1e' -R 'box.example'",
  'Host key for box.example has changed and you have requested strict checking.',
  'Host key verification failed.',
);
/** The same 15 lines, naming the pin file of THIS run, read back from its argv and written as `ssh` prints it (a backslash as two): sentence C needs that line (E2.S3). */
const refusedKeyOf = (argv: readonly string[]): string => REFUSED_KEY.replaceAll('/storage/keys/4242/known_hosts-e1-0b6f3c1e', (knownHostsOf(argv)?.file ?? '(the argv names no known-hosts file)').replaceAll('\\', '\\\\'));
const HOST_DOWN = printed('ssh: connect to host box.example port 22: Connection refused');
const LOGIN_REFUSED = printed('dev@box.example: Permission denied (publickey,password).');
const NO_ANSWER = printed('ssh: connect to host box.example port 22: Connection timed out');

const yes = (_message: string, rest: readonly unknown[]): string | undefined => rest.find((one): one is string => typeof one === 'string');

/** A real storage folder of one test: owned, and removed when this file's tests end. */
const storage = (what: string): string => ownedDir(scope, what);

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

/** A pinned entry with a password login, in a real storage folder: no key file, so every known-hosts file of the folder is a pin file. */
const pinned = (dir: string, parts: Parts = {}): Parts => ({ storageDir: dir, hostKey: PIN, realForget: true, clicks: [passwordLogin(), passwordLogin()], checks: [passwordLogin()], ...parts });

/* --- part 1: the match and the sentence --- */

/** An export of `hostKeyPin.ts`, read through the module object: this file compiles before the export exists, so its absence is a failed assertion. */
function exported<T>(name: string): T {
  const found = (hostKeyPin as Record<string, unknown>)[name];
  assert.equal(typeof found, 'function', `hostKeyPin.ts exports no ${name}`);
  return found as T;
}

test('H5: sentence C, word for word', () => {
  const refusedHostKeySentence = exported<(name: string) => string>('refusedHostKeySentence');

  assert.equal(refusedHostKeySentence('box'), SENTENCE_C);
});

/* --- part 2: what the five runs are sent --- */

/** The word that a pinned argv gives as its known-hosts file: strict checking, and ONE word in each of the two options, the same word. */
function pinWordOf(argv: readonly string[], what: string): string {
  assert.deepEqual(valuesOf(argv, 'StrictHostKeyChecking'), ['yes'], `${what} does not check the host's key against the saved one`);
  const words = [...valuesOf(argv, 'UserKnownHostsFile'), ...valuesOf(argv, 'GlobalKnownHostsFile')];
  assert.equal(words.length, 2, `${what} does not name one known-hosts file in each of the two options: ${words.join(' | ')}`);
  assert.equal(words[1], words[0], `${what} names two different known-hosts files`);
  return words[0];
}

/** The file that a pinned argv names, which must be a pin file of ONE call in this window's key folder of `dir`. */
function callPinOf(argv: readonly string[], dir: string, what: string): string {
  const file = pinWordOf(argv, what);
  assert.equal(path.dirname(file), materializedKeysDir(dir), `${what}: the pin file is not in the key folder of this window`);
  assert.match(path.basename(file), CALL_PIN, `${what}: the pin file is not a file of one call`);
  return file;
}

/** The pin file that an argv names, which must be on the disk NOW with the line of the entry. */
function pinFileOf(argv: readonly string[], dir: string, what: string): string {
  const file = callPinOf(argv, dir, what);
  assert.deepEqual(knownHostsOf(argv), { file, text: PIN_LINE }, `${what}: the pin file is not on the disk with the line of the entry`);
  return file;
}

/** The pin file of one run, which must have been on the disk with the line of the entry at the moment the run started. */
function pinFileOfRun(run: World['runs'][number], dir: string, what: string): string {
  const file = callPinOf(run.argv, dir, what);
  assert.deepEqual(run.knownHosts, { file, text: PIN_LINE }, `${what}: the pin file was not on the disk with the line of the entry when the run started`);
  return file;
}

for (const [label, folder] of [['a plain storage folder', undefined], ['a storage folder whose path holds a space', 'Application Support']] as const) {
  test(`T1: all five runs of a pinned entry, ${label}: strict checking, one pin file as both known-hosts files, and three files for the three calls`, async (t) => {
    const dir = path.join(storage('t1'), folder ?? '.');
    fs.mkdirSync(dir, { recursive: true });
    const answers = ['', '600', PROBE_OK, INSTALLED];
    const w = await bridged(t, pinned(dir, { answer: yes, run: (index) => ran(answers[index]) }));
    await click(w, 'installRemoteCli');

    const argvs = [...w.bridgeArgvs, ...w.runs.map((one) => one.argv)];
    assert.equal(argvs.length, 5, `the five runs did not all start (the bridge, the sweep, the mode check, the probe, the install): ${argvs.length}`);
    const words = argvs.map((argv) => pinWordOf(argv, 'T1: a run of a pinned entry'));
    const files = w.runs.map((one) => one.knownHosts);
    assert.deepEqual(words.slice(1), files.map((one) => (folder === undefined ? one?.file : `"${one?.file}"`)), 'T1: a path with a space is not ONE quoted word, or a path with none is not written as it is');
    assert.deepEqual(files.map((one) => one?.text), [PIN_LINE, PIN_LINE, PIN_LINE, PIN_LINE], 'T1: a run started before its pin file was on the disk with the line of the entry');
    assert.deepEqual([words[1] === words[2], words[3] === words[4], new Set(words).size], [true, true, 3], 'T1: the check and the install do not each keep ONE file, or two calls share a file');
    assert.deepEqual(w.errors, [], `T1: a pinned entry whose host answers was refused: ${w.errors.join(' | ')}`);
  });
}

const boom = (): never => {
  throw new Error('spawn ssh ENOENT');
};

/** The ways out of the socket check that run its two `ssh` (N16's list), by what the runs answer. */
const CHECK_ENDS: readonly { label: string; run: NonNullable<Parts['run']> }[] = [
  { label: 'a normal check', run: () => ran('600') },
  { label: 'a missing socket', run: () => ran('missing') },
  { label: 'a mode that cannot be read', run: () => ran('') },
  { label: 'a socket wider than 600', run: () => ran('644') },
  { label: 'runs that throw', run: boom },
];

for (const end of CHECK_ENDS) {
  test(`T2: the socket check of a pinned entry, ${end.label}: both runs name the SAME pin file of the check, and it is gone after the check`, async (t) => {
    const dir = storage('t2');
    const w = await bridged(t, pinned(dir, { run: end.run }));

    assert.equal(w.runs.length, 2, `the check did not run twice (the sweep, the mode check): ${w.runs.length}`);
    const sweep = pinFileOfRun(w.runs[0], dir, 'T2: the sweep');
    const modeCheck = pinFileOfRun(w.runs[1], dir, 'T2: the mode check');
    assert.equal(modeCheck, sweep, 'T2: the two runs of the check name two pin files');
    const ofBridge = pinFileOf(w.bridgeArgvs[0], dir, 'T2: the bridge');
    assert.notEqual(sweep, ofBridge, 'T2: the check reads the pin file of the bridge and not one of its own');
    assert.deepEqual(pinFiles(dir), [path.basename(ofBridge)], 'T2: the check left its pin file, or deleted the pin file of the bridge');
  });
}

test('T2g (guard): a socket check that gets no argv starts no ssh and leaves no pin file of its own', async (t) => {
  const dir = storage('t2g');
  const w = await bridged(t, pinned(dir, { noExecArgv: true }));

  assert.equal(w.children.length, 1, `no bridge was started: ${w.errors.join(' | ')}`);
  assert.equal(w.runs.length, 0, 'a run started with no argv');
  assert.equal(pinFiles(dir).length, 1, 'T2g: the check left its pin file, or deleted the pin file of the bridge');
  w.children[0].end(0);
  await settled();
  assert.deepEqual(pinFiles(dir), []);
});

/** The ways out of the install (N16's list), by what its runs and its question answer, and how many runs each has. */
const INSTALL_ENDS: readonly { label: string; runs: number; parts: Parts }[] = [
  { label: 'a success', runs: 2, parts: { answer: yes, run: (index) => ran(index === 0 ? PROBE_OK : INSTALLED) } },
  { label: 'a failed install', runs: 2, parts: { answer: yes, run: (index) => (index === 0 ? ran(PROBE_OK) : ran('', 22, 'curl: (22) The requested URL returned error: 404')) } },
  { label: 'a probe that times out', runs: 1, parts: { run: () => TIMED_OUT } },
  { label: 'a host that cannot be installed to', runs: 1, parts: { run: () => ran('creds=-\narch=x86_64\nos=Darwin\nget=/usr/bin/curl\n') } },
  { label: 'the person says no', runs: 1, parts: { run: () => ran(PROBE_OK) } },
];

for (const end of INSTALL_ENDS) {
  test(`T3: the install of a pinned entry, ${end.label}: every run names the SAME pin file of the install, and it is gone after`, async () => {
    const dir = storage('t3');
    const w = world(pinned(dir, end.parts));
    await click(w, 'installRemoteCli');

    assert.equal(w.runs.length, end.runs, `the install did not run ${end.runs} ssh: ${w.runs.length}`);
    const files = w.runs.map((run, i) => pinFileOfRun(run, dir, i === 0 ? 'T3: the probe' : 'T3: the install run'));
    assert.deepEqual(files, files.map(() => files[0]), 'T3: the probe and the install run name two pin files');
    assert.deepEqual(pinFiles(dir), [], 'T3: the install left its pin file');
  });
}

test('T3q: the pin file that the probe named is on the disk while the question is open; a question that throws deletes it, and the same error goes on', async () => {
  const dir = storage('t3q');
  const failure = new Error('the window is closing');
  const atQuestion: string[][] = [];
  const w = world(pinned(dir, { run: () => ran(PROBE_OK), answer: () => { atQuestion.push(pinFiles(dir)); throw failure; } }));

  await assert.rejects(click(w, 'installRemoteCli'), (error) => error === failure);

  assert.equal(w.runs.length, 1);
  const probe = pinFileOfRun(w.runs[0], dir, 'T3q: the probe');
  assert.deepEqual(atQuestion, [[path.basename(probe)]], 'T3q: the pin file of the probe was not the one on the disk while the question was open');
  assert.deepEqual(pinFiles(dir), [], 'T3q: the install left its pin file');
});

test('T4a: the argv of a pinned bridge names the pin file of the bridge; Close deletes nothing; the file goes when the ssh has ended', async () => {
  const dir = storage('t4a');
  const w = world(pinned(dir, { checks: [] }));
  await click(w, 'openRemoteBridge');
  await settled();

  assert.equal(w.bridgeArgvs.length, 1, `no bridge was started: ${w.errors.join(' | ')}`);
  const file = pinFileOf(w.bridgeArgvs[0], dir, 'T4a: the bridge');
  assert.deepEqual(pinFiles(dir), [path.basename(file)], 'T4a: the folder holds another known-hosts file than the one the bridge reads');

  await click(w, 'closeRemoteBridge');
  await settled();
  assert.deepEqual(knownHostsOf(w.bridgeArgvs[0]), { file, text: PIN_LINE }, 'T4a: Close deleted the pin file of an ssh that has not ended');

  w.children[0].end(null);
  await settled();
  assert.deepEqual(pinFiles(dir), [], 'T4a: the bridge ended and its pin file stays');
});

test('T4b: a bridge that REPLACES another: each argv names its own pin file; the first goes when the first ssh ends, the second stays with its bridge', async () => {
  const dir = storage('t4b');
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const w = world(pinned(dir, { checks: [], resolveGate: gate }));
  const both = [click(w, 'openRemoteBridge'), click(w, 'openRemoteBridge')];
  await settled();
  release();
  await Promise.all(both);
  await settled();

  assert.equal(w.bridgeArgvs.length, 2, 'the two Opens did not start two bridges');
  const first = pinFileOf(w.bridgeArgvs[0], dir, 'T4b: the first bridge');
  const second = pinFileOf(w.bridgeArgvs[1], dir, 'T4b: the second bridge');
  assert.notEqual(second, first, 'T4b: two bridges share one pin file');
  assert.equal(w.children[0].killed, 1, 'the second start did not replace the first');

  w.children[0].end(null);
  await settled();
  assert.deepEqual(pinFiles(dir), [path.basename(second)], 'T4b: the end of the replaced bridge did not delete exactly its own pin file');
  assert.deepEqual(knownHostsOf(w.bridgeArgvs[1]), { file: second, text: PIN_LINE });

  w.bridges.dispose();
  w.children[1].end(null);
  await settled();
  assert.deepEqual(pinFiles(dir), [], 'T4b: the window ended and the second pin file stays');
});

test('T4c: a start that throws was handed an argv that names the pin file; the file is deleted at once, and the same error goes on', async () => {
  const dir = storage('t4c');
  const failure = new Error('spawn EACCES');
  const handed: { argv: readonly string[]; pin: ReturnType<typeof knownHostsOf> }[] = [];
  const spawn = (_command: string, argv: readonly string[]): never => {
    handed.push({ argv, pin: knownHostsOf(argv) });
    throw failure;
  };
  const w = world(pinned(dir, { checks: [], spawn }));

  await assert.rejects(click(w, 'openRemoteBridge'), (error) => error === failure);

  assert.equal(handed.length, 1);
  const word = pinWordOf(handed[0].argv, 'T4c: the bridge');
  assert.deepEqual(handed[0].pin, { file: word, text: PIN_LINE }, 'T4c: the pin file was not on the disk with the line of the entry when the start was called');
  assert.equal(w.bridges.isOpen(KEY), false);
  assert.deepEqual(pinFiles(dir), [], 'T4c: the start failed and the pin file stays');
});

test('T4d (guard): a pinned bridge that gets no argv, or whose argv cannot be built, starts nothing and deletes its pin file at once', async () => {
  const dir = storage('t4d');
  const failure = new Error('the argv could not be built');
  const none = world(pinned(dir, { checks: [], mocks: { '../sshBridge': { ...realBridge, buildBridgeArgv: (): undefined => undefined } } }));
  const throwing = world(pinned(dir, { checks: [], mocks: { '../sshBridge': { ...realBridge, buildBridgeArgv: (): never => { throw failure; } } } }));

  await click(none, 'openRemoteBridge');
  await assert.rejects(click(throwing, 'openRemoteBridge'), (error) => error === failure);

  assert.match(none.warnings.at(-1) ?? '', /cannot be bridged/);
  assert.deepEqual([none.children.length, throwing.children.length], [0, 0]);
  assert.deepEqual(pinFiles(dir), [], 'T4d: no bridge was started and a pin file stays');
});

/* --- part 3: sentence C --- */

test('T9a: the install on a pinned entry whose host presents another key shows sentence C, and not that the host did not answer the probe', async () => {
  const dir = storage('t9a');
  const w = world(pinned(dir, { answer: yes, run: (_index, argv) => ran('', 255, refusedKeyOf(argv)) }));
  await click(w, 'installRemoteCli');

  assert.deepEqual(w.errors, [SENTENCE_C], 'T9a: the refused host key was not told to the person');
  assert.deepEqual(w.warnings, [], `T9a: the refused host key was told as something else: ${w.warnings.join(' | ')}`);
  assert.equal(w.runs.length, 1, 'T9a: the install went on after a refused host key');
  assert.deepEqual(w.asked, [], 'T9a: the install asked its question after a refused host key');
  assert.deepEqual(pinFiles(dir), [], 'T9a: the install left its pin file');
});

test('T9b: Open Remote Bridge on a pinned entry whose host presents another key: the socket check shows ONE error message, the bridge is not open and why, and logs it', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const dir = storage('t9b');
  const w = world(pinned(dir, { run: (_index, argv) => ran('', 255, refusedKeyOf(argv)) }));
  await click(w, 'openRemoteBridge');
  await settled();
  w.children[0].end(255); // the ssh of the bridge was refused too; it has no stdio, so it says nothing
  await settled();
  t.mock.timers.tick(1500);
  await settled();

  assert.equal(w.runs.length, 2, `the check did not run twice (the sweep, the mode check): ${w.runs.length}`);
  assert.deepEqual(w.errors, [BRIDGE_NOT_OPEN], 'T9b: the refused host key of the bridge was not shown as ONE error message of the socket check');
  assert.deepEqual(w.logs.filter((line) => line === BRIDGE_NOT_OPEN), [BRIDGE_NOT_OPEN], 'T9b: the refused host key of the bridge is not in the log once');
  assert.equal(w.logs.some((line) => line.includes('its mode could not be read')), false, 'T9b: the refused host key was logged as a socket that is there');
  assert.equal(w.bridges.isOpen(KEY), false);
  assert.deepEqual(pinFiles(dir), [], 'T9b: a pin file stays after the bridge and its check have ended');
});

/** Runs that are NOT a refused host key of a pinned entry, with the sentence of today that the install shows for each. */
const NOT_REFUSED: readonly { label: string; hostKey?: string; outcome: SshExecOutcome; install: RegExp }[] = [
  { label: 'an UNPINNED entry whose ssh printed the verification line', outcome: ran('', 255, REFUSED_KEY), install: /did not answer the probe/ },
  { label: 'a pinned entry whose host is down', hostKey: PIN, outcome: ran('', 255, HOST_DOWN), install: /did not answer the probe/ },
  { label: 'a pinned entry whose login was refused', hostKey: PIN, outcome: ran('', 255, LOGIN_REFUSED), install: /did not answer the probe/ },
  { label: 'a pinned entry whose host does not answer inside the time limit of ssh', hostKey: PIN, outcome: ran('', 255, NO_ANSWER), install: /did not answer the probe/ },
  { label: 'a pinned entry whose run was ended at the time limit of the extension', hostKey: PIN, outcome: TIMED_OUT, install: /did not answer within 20 seconds/ },
];

for (const row of NOT_REFUSED) {
  test(`T9c (guard): the install on ${row.label} shows the sentence of today and no sentence C`, async () => {
    const w = world(pinned(storage('t9c'), { hostKey: row.hostKey, run: () => row.outcome }));
    await click(w, 'installRemoteCli');

    assert.deepEqual(w.errors, [], `T9c: a run that is no refused host key of a pinned entry was told as one: ${w.errors.join(' | ')}`);
    assert.equal(w.warnings.length, 1, `the install did not show one warning: ${w.warnings.join(' | ')}`);
    assert.match(w.warnings[0], row.install);
  });

  test(`T9d (guard): the socket check on ${row.label} shows no message and logs the mode as not read`, async (t) => {
    const w = await bridged(t, pinned(storage('t9d'), { hostKey: row.hostKey, run: () => row.outcome }));

    assert.equal(w.runs.length, 2, `the check did not run twice (the sweep, the mode check): ${w.runs.length}`);
    assert.deepEqual(w.errors, [], `T9d: a run that is no refused host key of a pinned entry was told as one: ${w.errors.join(' | ')}`);
    assert.ok(w.logs.some((line) => line.includes('its mode could not be read')), `the unreadable mode was not logged: ${w.logs.join(' | ')}`);
  });
}

test('T9e (guard): a host key that is refused at the SECOND run of the install keeps the sentence of today', async () => {
  const w = world(pinned(storage('t9e'), { answer: yes, run: (index) => (index === 0 ? ran(PROBE_OK) : ran('', 255, REFUSED_KEY)) }));
  await click(w, 'installRemoteCli');

  assert.equal(w.runs.length, 2);
  assert.deepEqual(w.errors, ['Could not install on "box": the installer produced no result and exited 255.']);
});

/* --- part 4: the list of the argv calls --- */

const AGENT_COMMANDS = path.join(__dirname, '..', '..', 'src', 'commands', 'agentCommands.ts');
const BUILDERS = ['buildSshExecArgv', 'buildBridgeArgv'];

/** The named function that a node stands in. */
const withinOf = (node: ts.Node): string => ts.findAncestor(node, ts.isFunctionDeclaration)?.name?.text ?? '(no function)';

/** Whether an argument is an object that names `knownHostsFile`. */
const namesPinFile = (argument: ts.Expression): boolean =>
  ts.isObjectLiteralExpression(argument) && argument.properties.some((property) => property.name?.getText() === 'knownHostsFile');

/** Every call in the file, depth first. */
function callsOf(source: ts.SourceFile): ts.CallExpression[] {
  const calls: ts.CallExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      calls.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return calls;
}

/** Each call of an argv builder in `commands/agentCommands.ts`: `<builder> in <function>`, and whether an object among its arguments names `knownHostsFile`. */
function builderCalls(): { site: string; names: boolean }[] {
  const source = ts.createSourceFile('agentCommands.ts', fs.readFileSync(AGENT_COMMANDS, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  return callsOf(source)
    .filter((call) => BUILDERS.includes(call.expression.getText()))
    .map((call) => ({ site: `${call.expression.getText()} in ${withinOf(call)}`, names: call.arguments.some(namesPinFile) }))
    .sort((a, b) => a.site.localeCompare(b.site));
}

test('T11: every argv call of the three roads names knownHostsFile, and the scan finds the four calls', () => {
  const calls = builderCalls();

  assert.deepEqual(
    calls.map((call) => call.site),
    ['buildBridgeArgv in registerAgentCommands', 'buildSshExecArgv in runRemote', 'buildSshExecArgv in sweepDeadSockets', 'buildSshExecArgv in verifyBridgeSocket'],
    'the scan does not find the four argv calls of commands/agentCommands.ts: one was added, moved or renamed. Give the new call the pin file of its call, then edit this list',
  );
  assert.deepEqual(calls.filter((call) => !call.names).map((call) => call.site), [], 'T11: an argv call of the three roads names no knownHostsFile, so its ssh would not read the pin of the entry');
});
