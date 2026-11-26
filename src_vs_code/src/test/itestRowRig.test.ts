import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { after, test } from 'node:test';
import { cleanupScope, ownedDir, ownedFile } from '../../scripts/lib/leftovers.cjs';
import { PIN_PATH_KINDS, checkedPin, hostKeyWords, pinPathSentence, refusedHostKeySentence, unnamedHostKeySentence, pinClientSentence } from '../hostKeyPin';
import { materializedKeysDir } from '../materializedKeys';
import { confirmationFor, interpretProbe } from '../remoteCliInstall';
import { Parts, Vault, click, ran, settled, world } from './personRoadsWorld';
import { HOST_KEY_OPTIONS, withoutGlobal, withoutSources } from './pinnedArgv';
import { loadWithVscode } from './vscodeStub';

/**
 * G1, E3.S4 (`todo/PLAN_person_roads_pin_host_key_E3_S4_spec.md`, §8): the rig of the real-road rows. RR1 to RR5 hold the pure rules of the
 * record (`scripts/lib/rowRecord.cjs`: what a start, a connection start, an authentication attempt and an accepted login are; the sentences of
 * §3.5; the handed client config; the words of E1), RR6 and RR7 hold the two ways a row could cheat (a counterpart or a world of its own; a
 * stand-in of the resolve or of the asker), and RR8 holds the world's REAL resolve over a disposable vault.
 *
 * <p>It is the rig's own test, not a test of the parent's §5. The lib is read at run time (`createRequire`), so this file compiles before
 * the lib exists. (RR8 was first written with its world parts cast, so that it compiled before the world had `realResolve` and `vault`.) The log lines are those of F5 and F6 of the spec, with the
 * user `someone` and port numbers of this file.</p>
 */

const SCRIPTS = path.join(__dirname, '..', '..', 'scripts');
const LIB = path.join(SCRIPTS, 'lib', 'rowRecord.cjs');

const scope = cleanupScope();
after(() => scope.close());

/** An export of the lib, checked at run time: the file exists and the name is a function. */
function exported<T>(name: string): T {
  assert.ok(fs.existsSync(LIB), `${LIB} does not exist`);
  const value: unknown = createRequire(__filename)(LIB)[name];
  assert.equal(typeof value, 'function', `${name} is not a function of scripts/lib/rowRecord.cjs`);
  return value as T;
}

interface Accepted {
  readonly method: string;
  readonly port: number;
  readonly session: string;
}
interface Counts {
  readonly connections: number;
  readonly authAttempts: number;
  readonly attemptPorts: readonly number[];
  readonly attemptConnections: readonly string[];
  readonly accepted: readonly Accepted[];
  readonly passwords: { readonly failed: number; readonly accepted: number };
  readonly lines: readonly string[];
}
type LogCounts = (log: string, user: string) => Counts;
type Argv = readonly string[];

const USER = 'someone';

/** The nine lines of a key login with a command, F6 of the spec. `port` is the client's. */
const keyLogin = (port: number, session = 'command'): string[] => [
  `Connection from 127.0.0.1 port ${port} on 127.0.0.1 port 40022 rdomain ""`,
  'Accepted key ED25519 SHA256:abcdef found at /o/authorized_keys:1',
  'Accepted key ED25519 SHA256:abcdef found at /o/authorized_keys:1',
  `Postponed publickey for ${USER} from 127.0.0.1 port ${port} ssh2 [preauth]`,
  `Accepted publickey for ${USER} from 127.0.0.1 port ${port} ssh2: ED25519 SHA256:abcdef`,
  'User child is on pid 4711',
  ...(session === 'none' ? [] : [`Starting session: ${session} for ${USER} from 127.0.0.1 port ${port} id 0`]),
  `Received disconnect from 127.0.0.1 port ${port}:11: disconnected by user`,
  `Disconnected from user ${USER} 127.0.0.1 port ${port}`,
];

/** The three lines of a refused password, F5 of the spec. */
const refusedPassword = (port: number): string[] => [
  `Could not get shadow information for ${USER}`,
  `Failed password for ${USER} from 127.0.0.1 port ${port} ssh2`,
  `Connection closed by authenticating user ${USER} 127.0.0.1 port ${port} [preauth]`,
];

const text = (lines: readonly string[]): string => `${lines.join('\n')}\n`;

test('RR1: a question is `-V` alone, a connection start names a destination after `--`, and each kind of start has its road', () => {
  const isQuestion = exported<(argv: Argv) => boolean>('isQuestion');
  const isConnectionStart = exported<(argv: Argv) => boolean>('isConnectionStart');
  const roadOf = exported<(kind: string) => string | undefined>('roadOf');
  const probe = ['-o', 'StrictHostKeyChecking=yes', '-p', '40022', '--', `${USER}@127.0.0.1`, 'echo probe'];
  const bridge = ['-N', '-R', '/tmp/creds-x.sock:127.0.0.1:40023', '--', `${USER}@127.0.0.1`];

  assert.equal(isQuestion(['-V']), true);
  assert.equal(isQuestion(['-V', '-v']), false);
  assert.equal(isQuestion(probe), false);
  assert.equal(isConnectionStart(probe), true, 'the probe names a destination');
  assert.equal(isConnectionStart(bridge), true, 'the bridge names a destination');
  assert.equal(isConnectionStart(['-V']), false, 'the question is no connection start');
  assert.equal(isConnectionStart(['-G', '-F', '/o/config', 'x']), false);
  assert.equal(isConnectionStart(['-O', 'check', '-S', '/o/control', 'x']), false);
  assert.equal(isConnectionStart(['--']), false, 'a `--` with no word after it names no destination');
  assert.deepEqual(['probe', 'install', 'bridge', 'sweep', 'mode'].map(roadOf), ['install', 'install', 'bridge', 'check', 'check']);
  assert.equal(roadOf('question'), undefined);
  assert.equal(roadOf('other'), undefined);
});

test('RR2: the four counts of a log: a login is one connection, one attempt and one accepted login', () => {
  const counts = exported<LogCounts>('logCounts');

  const key = counts(text(keyLogin(41001)), USER);
  assert.equal(key.connections, 1);
  assert.equal(key.authAttempts, 1, 'two `Accepted key … found at` lines (no port) and `Postponed` add none');
  assert.deepEqual(key.attemptPorts, [41001]);
  assert.deepEqual(key.accepted, [{ method: 'publickey', port: 41001, session: 'command' }]);
  assert.deepEqual(key.passwords, { failed: 0, accepted: 0 });

  const forward = counts(text(keyLogin(41002, 'none')), USER);
  assert.deepEqual(forward.accepted, [{ method: 'publickey', port: 41002, session: 'none' }], 'a -N login logs no `Starting session` line');

  const two = counts(text([...keyLogin(41003), ...keyLogin(41004, 'none')]), USER);
  assert.equal(two.connections, 2);
  assert.equal(two.authAttempts, 2);
  assert.deepEqual(two.accepted, [
    { method: 'publickey', port: 41003, session: 'command' },
    { method: 'publickey', port: 41004, session: 'none' },
  ], 'each login gets the session of its own port, not the first session line of the log');

  const refused = counts(text(refusedPassword(41005)), USER);
  assert.equal(refused.authAttempts, 1);
  assert.equal(refused.accepted.length, 0);
  assert.deepEqual(refused.passwords, { failed: 1, accepted: 0 });

  const silent = counts(text(['Connection from 127.0.0.1 port 41006 on 127.0.0.1 port 40022 rdomain ""', 'Connection closed by 127.0.0.1 port 41006 [preauth]']), USER);
  assert.equal(silent.connections, 1);
  assert.equal(silent.authAttempts, 0, 'a connection that reached no authentication line is no attempt');

  const empty = counts('', USER);
  assert.deepEqual({ ...empty, lines: [...empty.lines], accepted: [...empty.accepted] }, { connections: 0, authAttempts: 0, attemptPorts: [], attemptConnections: [], accepted: [], passwords: { failed: 0, accepted: 0 }, lines: [] });
});

test('RR2b: an attempt is counted per connection, not per client port: a port the kernel gives the client twice is two attempts', () => {
  const counts = exported<LogCounts>('logCounts');

  // The run of 89a9667e: port 52142 served the 2nd and the 5th login of one leg; the counterpart logged 5 `Postponed publickey` lines and 5 accepted logins.
  const ports = [52140, 52142, 52144, 52146, 52142];
  const reused = counts(text(ports.flatMap((port) => keyLogin(port))), USER);
  assert.equal(reused.authAttempts, 5, 'five connections reached authentication, though only four distinct ports did');
  assert.equal(reused.accepted.length, 5);
  assert.equal(reused.connections, 5);
  assert.deepEqual(reused.attemptPorts, [52140, 52142, 52144, 52146], 'the ports stay as they were: distinct');
  assert.deepEqual(reused.attemptConnections, ['52140#0', '52142#0', '52144#0', '52146#0', '52142#1']);

  const twice = counts(text([...keyLogin(52150), ...keyLogin(52150, 'none')]), USER);
  assert.equal(twice.authAttempts, 2, 'two authenticated connections on one port are two attempts');
  assert.equal(twice.accepted.length, 2);
  assert.deepEqual(twice.accepted.map((one) => one.session), ['command', 'none']);

  // A log cut after a mark may start with the attempt lines of a connection whose `Connection from` line lies before the cut: that is instance 0 of its port.
  const cut = counts(text(keyLogin(52160).slice(1)), USER);
  assert.equal(cut.authAttempts, 1);
  assert.deepEqual(cut.attemptConnections, ['52160#0']);
});

test('RR2c: a control that gets a port used before adds one attempt, so a before/after comparison sees it', () => {
  const counts = exported<LogCounts>('logCounts');

  const before = text(keyLogin(52142));
  const control = ['Connection from 127.0.0.1 port 52142 on 127.0.0.1 port 40023 rdomain ""', ...refusedPassword(52142)];
  const after = text([...keyLogin(52142), ...control]);
  assert.equal(counts(before, USER).authAttempts, 1);
  assert.equal(counts(after, USER).authAttempts - counts(before, USER).authAttempts, 1, 'the control reused the port of the earlier login and its attempt is still new');
  assert.equal(counts(after, USER).accepted.length, counts(before, USER).accepted.length, 'the control logged no new accepted login');

  const silentControl = text([...keyLogin(52142), 'Connection from 127.0.0.1 port 52142 on 127.0.0.1 port 40023 rdomain ""', 'Connection closed by 127.0.0.1 port 52142 [preauth]']);
  assert.equal(counts(silentControl, USER).authAttempts, counts(before, USER).authAttempts, 'a control on a reused port that reaches no authentication line adds no attempt');
});

type SentencesOf = (parts: Record<string, unknown>, name: string) => string[];
type Says = (shown: string, sentences: readonly string[]) => boolean;

/** `personPin.ts` imports no `vscode` itself, but its chain does (`hostKeyTrust.ts`): it is loaded under the stub, as `personPin.test.ts` does (a fact the spec's F16 missed). */
const { unusablePinSentence, pinWriteFailedSentence } = loadWithVscode<typeof import('../personPin')>('../personPin', {});

/** The six functions of §3.5 and the kinds of E, the product's own. */
const PARTS = { unusablePinSentence, pinWriteFailedSentence, refusedHostKeySentence, unnamedHostKeySentence, pinPathSentence, pinClientSentence, PIN_PATH_KINDS };

test('RR3: the sentences of §3.5 are read from the product, one E per kind, and are found inside a longer text and in no other text of a road', () => {
  const sentencesOf = exported<SentencesOf>('sentencesOf');
  const says = exported<Says>('saysASentence');
  const sentences = sentencesOf(PARTS, 'box');
  const kinds = Object.keys(PIN_PATH_KINDS);

  const expected = [
    unusablePinSentence('box', 'askpass'),
    unusablePinSentence('box', 'key'),
    refusedHostKeySentence('box'),
    unnamedHostKeySentence('box'),
    pinClientSentence('box', null),
    ...kinds.map((kind) => pinPathSentence('box', kind as keyof typeof PIN_PATH_KINDS)),
  ];
  for (const one of expected) {
    assert.ok(sentences.includes(one), `the lib does not hold: ${one}`);
  }
  assert.ok(sentences.some((one) => one.startsWith('Could not write the saved host key of "box" to disk: ')), 'the opening of sentence B');
  assert.ok(sentences.some((one) => one.endsWith('(exit code ')), 'the opening of sentence F with an exit code, cut at the mark');
  assert.equal(sentences.length, expected.length + 2, 'one E per kind, and B and F with a code as openings, no more');
  assert.equal(kinds.length, 8, 'the product has eight kinds of E');

  for (const one of sentences) {
    assert.ok(says(`Cannot reach "box": ${one} and more`, sentences), `not found inside a longer text: ${one}`);
  }
  const question = confirmationFor(interpretProbe('creds=-\narch=x86_64\nos=Linux\nget=/usr/bin/curl\n'), 'box').message;
  assert.equal(says('Bridge open to "box". The socket is owner-only.', sentences), false);
  assert.equal(says(question, sentences), false, 'the install\'s question is no sentence of §3.5');
  assert.equal(says('`creds` is installed on "box" at /o/standin/bin/creds.', sentences), false);
});

/** What `ssh -G` printed for the handed config of a folder, or `undefined` when there is no `ssh` here. */
function resolvedUnder(config: string): string[] | undefined {
  const answer = spawnSync('ssh', ['-G', '-F', config, '-p', '1', 'x'], { encoding: 'utf8', timeout: 15_000 }); // NOSONAR: the PATH's ssh is the subject
  return answer.error === undefined && answer.status === 0 ? answer.stdout.split('\n') : undefined;
}
const hasSsh = resolvedUnder('/dev/null') !== undefined;

test('RR4: the handed client config is the five lines of §1.4, and a leg process\'s lines are read as checks or as prints', () => {
  const handed = exported<(dir: string) => string>('handedClientConfig');
  const legLine = exported<(line: string) => Record<string, unknown>>('legLine');

  assert.equal(handed('/o/leg'), 'Host *\n  UserKnownHostsFile /dev/null\n  GlobalKnownHostsFile /dev/null\n  IdentityFile /o/leg/no-default-identity\n  IdentityAgent none\n');
  assert.deepEqual(legLine('ok  a b'), { kind: 'check', ok: true, name: 'a b', detail: undefined });
  assert.deepEqual(legLine('ok   a b'), { kind: 'check', ok: true, name: 'a b', detail: undefined }, 'the script prints `ok  ` and a space');
  assert.deepEqual(legLine('FAIL a — b'), { kind: 'check', ok: false, name: 'a', detail: 'b' });
  assert.deepEqual(legLine('FAIL a'), { kind: 'check', ok: false, name: 'a', detail: undefined });
  assert.deepEqual(legLine('evidence {"record":1}'), { kind: 'print', text: 'evidence {"record":1}' });
  assert.deepEqual(legLine('info  M1: the question took 5 ms'), { kind: 'print', text: 'info  M1: the question took 5 ms' });
});

test('RR4b: the real client resolves ONE identity file, the one that is never made, and no agent, under the handed config', { skip: !hasSsh }, () => {
  const handed = exported<(dir: string) => string>('handedClientConfig');
  const file = ownedFile(scope, 'rr4b', 'client_config');
  fs.writeFileSync(file, handed('/o/leg'));

  const lines = resolvedUnder(file) ?? [];
  assert.deepEqual(lines.filter((line) => line.startsWith('identityfile ')), ['identityfile /o/leg/no-default-identity']);
  assert.ok(lines.includes('identityagent none'), 'identityagent none');
});

test('RR5: E1\'s words are the three pairs of a checked pin, and a missing one is refused', () => {
  const e1Words = exported<(words: Argv, without: (argv: Argv) => string[], options: Argv) => string[]>('e1Words');
  const checked = checkedPin('/o/keys/known_hosts-e1-x', { kind: 'knows', token: 'OpenSSH_10.2' });
  assert.ok(checked.ok, 'the fixture pin is checked');
  const words = hostKeyWords(checked.pin);

  const six = e1Words(words, withoutSources, HOST_KEY_OPTIONS);
  assert.equal(six.length, 6);
  for (const name of HOST_KEY_OPTIONS) {
    assert.equal(six.filter((word) => word.startsWith(`${name}=`)).length, 1, `${name} once`);
  }
  assert.throws(() => e1Words(withoutGlobal(words), withoutSources, HOST_KEY_OPTIONS), /GlobalKnownHostsFile/);
  assert.throws(() => e1Words([...words, '-o', 'StrictHostKeyChecking=yes'], withoutSources, HOST_KEY_OPTIONS), /StrictHostKeyChecking/);
});

/** The names of the row scripts that the scans read: every `itestRow*.cjs` but the rig, and the rig's proof. */
function rowScripts(): string[] {
  return fs.readdirSync(SCRIPTS).filter((name) => (/^itestRow.+\.cjs$/.test(name) && name !== 'itestRowRig.cjs') || name === 'itestRigProof.cjs').sort();
}
const read = (name: string): string => fs.readFileSync(path.join(SCRIPTS, name), 'utf8');
const count = (source: string, needle: string): number => source.split(needle).length - 1;

test('RR6: no row starts a counterpart or opens a world of its own; the rig has ONE start of a counterpart', () => {
  const found = rowScripts();
  for (const known of ['itestRowM1.cjs', 'itestRowM6.cjs', 'itestRigProof.cjs']) {
    assert.ok(found.includes(known), `${known} is not discovered: ${found.join(', ')}`);
  }
  const holding = found.flatMap((name) => ['startServingSshd(', 'stopListener(', 'endServer(', '.world(', 'launch('].filter((needle) => read(name).includes(needle)).map((needle) => `${name}: ${needle}`));
  assert.deepEqual(holding, []);
  assert.equal(count(read('itestRowRig.cjs'), 'startServingSshd('), 1, 'the rig is the one place that starts a counterpart');
});

test('RR7: the real resolve and the real asker are the rows\' only ones; no script of the rows names a stand-in of either module', () => {
  const found = rowScripts();
  for (const known of ['itestRowM1.cjs', 'itestRowM6.cjs', 'itestRigProof.cjs']) {
    assert.ok(found.includes(known), `${known} is not discovered: ${found.join(', ')}`);
  }
  const standIns = [...found, 'itestRowRig.cjs'].filter((name) => read(name).includes('sshExecAuth') || read(name).includes("pinClient'")).map((name) => name);
  assert.deepEqual(standIns, []);
  const rig = read('itestRowRig.cjs');
  assert.equal(count(rig, 'realResolve: true'), 1, 'the rig opens its world with the real resolve, once');
  assert.ok(rig.includes('realClient: true'), 'and with the real asker');
});

const PROBE_OK = 'creds=-\narch=x86_64\nos=Linux\nget=/usr/bin/curl\n';
const KEY_TEXT = 'RR8-a-throwaway-key-text\n';

/** One click of *Install creds on host* in the world with the real resolve over `vault`; the world's stand-in runner reads what the probe names. */
async function installed(what: string, vault: Vault, realResolve = true): Promise<{ dir: string; argv: readonly string[]; during: string | undefined; runs: number }> {
  const dir = ownedDir(scope, what);
  const seen: { argv: readonly string[]; during: string | undefined }[] = [];
  const parts: Parts = {
    storageDir: dir,
    realForget: true,
    realResolve,
    vault,
    run: (_index: number, argv: readonly string[]) => {
      const file = argv[argv.indexOf('-i') + 1];
      seen.push({ argv, during: argv.includes('-i') && fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined });
      return ran(PROBE_OK);
    },
  };
  const w = world(parts);
  await click(w, 'installRemoteCli');
  await settled();
  const first = seen.at(0) ?? { argv: [], during: undefined };
  return { dir, argv: first.argv, during: first.during, runs: w.runs.length };
}

/** The names in this window's key folder, or none when it was never made. */
const keysIn = (dir: string): string[] => (fs.existsSync(materializedKeysDir(dir)) ? fs.readdirSync(materializedKeysDir(dir)).sort() : []);
const keyOf = (argv: readonly string[]): string | undefined => (argv.includes('-i') ? argv[argv.indexOf('-i') + 1] : undefined);

test('RR8: the world\'s real resolve, over a vault: a stored key is written for the call and deleted with it, a named key is never written, a password writes the helper', async () => {
  const stored = await installed('rr8-stored', { privateKey: KEY_TEXT });
  assert.equal(stored.runs, 1, 'one probe ran: the real resolve answered a credential');
  const written = keyOf(stored.argv);
  assert.ok(written !== undefined && written.startsWith(materializedKeysDir(stored.dir)) && /call-.+\.key$/.test(written), `the probe names a key file of its own: ${written}`);
  assert.equal(stored.during, KEY_TEXT, 'the file held the key text while the probe ran');
  assert.deepEqual(keysIn(stored.dir), [], 'no key file is left after the click');

  const own = ownedFile(scope, 'rr8-own', 'user_key');
  fs.writeFileSync(own, KEY_TEXT, { mode: 0o600 });
  const named = await installed('rr8-named', { keyPath: own });
  assert.equal(named.runs, 1);
  assert.equal(keyOf(named.argv), own, 'the probe names the person\'s file');
  assert.equal(fs.readFileSync(own, 'utf8'), KEY_TEXT, 'and it is still there, the same bytes');
  assert.deepEqual(keysIn(named.dir), [], 'nothing was written');

  const password = await installed('rr8-password', { password: 'not-a-password-rr8' });
  assert.equal(password.runs, 1);
  assert.ok(password.argv.includes('NumberOfPasswordPrompts=1'), `the argv asks one password prompt: ${password.argv.join(' ')}`);
  assert.equal(password.argv.includes('-i'), false, 'a password call names no key file');
  assert.deepEqual(keysIn(password.dir), ['askpass.sh'], 'the window\'s helper is the only file');
});

test('RR8b: without `realResolve` the same vault gives the stand-in\'s "no credential": the switch decides, and no probe runs', async () => {
  const stored = await installed('rr8-default', { privateKey: KEY_TEXT }, false);
  assert.equal(stored.runs, 0);
  assert.deepEqual(keysIn(stored.dir), []);
});
