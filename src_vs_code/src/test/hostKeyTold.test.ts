import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { after, test, TestContext } from 'node:test';
import { cleanupScope, ownedDir } from '../../scripts/lib/leftovers.cjs';
import * as hostKeyPin from '../hostKeyPin';
import { KEY, Parts, World, click, knownHostsOf, passwordLogin, pinFiles, ran, settled, world } from './personRoadsWorld';
import { testPin } from './pinnedArgv';

/**
 * G1, E2.S3: what a person is told when a PINNED call ended with `ssh`'s line `Host key verification failed.`. Sentence C names the
 * entry's host as the cause, so it is shown only on evidence: `ssh`'s own line `Offending <type> key in <file>:<n>` that names the
 * pin file of THIS call. The verification line without that evidence gets sentence D, which names no host as the cause.
 *
 * <p><b>Part 1</b> is the one function alone (`hostKeyTold` of `hostKeyPin.ts`), on the texts that a real `ssh` printed. <b>Part
 * 2</b> is the two roads that show its answer, driven as the extension registers them, over the world of `personRoadsWorld.ts`.</p>
 *
 * <p>The texts are those of OpenSSH 10.2p1 with the words of a pinned call and `LogLevel=ERROR`, measured by hand on 2026-11-18
 * against public `sshd`s (the pin file held another key; no login was attempted). The file that a text names is always handed in:
 * a road test reads it back from the argv of the run, it is never guessed. No test of this file starts a process: that a real `ssh`
 * prints the line with the pin file of a call through these roads is shown by leg 2 of the smoke (section 10 of `scripts/ssh-agent-itest.cjs`),
 * which E2.S4 ran on 2026-11-19: 48 ok, locally, on OpenSSH 10.2p1 (CI is its second run). One text is that of `ssh.exe`
 * (OpenSSH_for_Windows 9.5p2, the same day, measured by hand): 13 lines, with every backslash of the path as two. No login was made on Windows.</p>
 */

const scope = cleanupScope();
after(() => scope.close());

const SENTENCE_C =
  '"box" did not present its saved host key, so CredsForDevs did not connect. If this server was rebuilt, use Connect SSH on this entry: it shows the new key and asks before it replaces the saved one. If it was not, do not connect.';
const SENTENCE_D =
  'The connection to "box" ended with "Host key verification failed", and ssh did not name the saved host key of this entry as the reason. It can be the key of a jump host in your own ssh config, which your own known_hosts file checks, or your ssh config gives this host another name or port than this entry does. Do not replace a saved key because of this message. Connect SSH on this entry checks this host\'s key again and asks before it changes anything.';
const TOLD_C = { install: SENTENCE_C, bridge: `The bridge to "box" is not open: ${SENTENCE_C}` };
const TOLD_D = { install: SENTENCE_D, bridge: `The bridge to "box" could not be checked: ${SENTENCE_D}` };

/** The lines of a real `ssh` as it prints them: it ends its own lines with CR LF, also on Linux. */
const printed = (...lines: string[]): string => lines.map((line) => `${line}\r\n`).join('');

/**
 * A file name as `ssh` prints it: a backslash as two, and each byte outside printable ASCII as a backslash and three octal digits
 * (measured; S0 holds this helper to the two names that were printed). A road test passes the pin file of its run through it, so
 * that its text is the one a real `ssh` would print on every platform: on Windows every path has backslashes.
 */
const asSshPrints = (name: string): string =>
  [...Buffer.from(name, 'utf8')].map((byte) => (byte === 0x5c ? '\\\\' : byte >= 0x20 && byte < 0x7f ? String.fromCharCode(byte) : `\\${byte.toString(8).padStart(3, '0')}`)).join('');

/**
 * What `ssh` prints when the key that `host` presents is not the one in the file it names: 15 lines, exit code 255. `named` is the
 * file AS `ssh` PRINTS IT. The line `Add correct host key in` is cut at 100 characters; the `Offending` line holds the whole name.
 */
const refusedKey = (named: string, host = 'box.example'): string =>
  printed(
    '@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@',
    '@    WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!     @',
    '@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@',
    'IT IS POSSIBLE THAT SOMEONE IS DOING SOMETHING NASTY!',
    'Someone could be eavesdropping on you right now (man-in-the-middle attack)!',
    'It is also possible that a host key has just been changed.',
    'The fingerprint for the ED25519 key sent by the remote host is\nSHA256:LffarYzG0qeh+MC4Rg4fmMufJMJIjrjBIuqoQgUO2YE.',
    'Please contact your system administrator.',
    `Add correct host key in ${named.slice(0, 100)} to get rid of this message.`,
    `Offending ED25519 key in ${named}:1`,
    '  remove with:',
    `  ssh-keygen -f '${named}' -R '${host}'`,
    `Host key for ${host} has changed and you have requested strict checking.`,
    'Host key verification failed.',
  );

/** The same refusal as `ssh.exe` of OpenSSH_for_Windows 9.5p2 prints it: 13 lines, without the two lines about `ssh-keygen`. */
const refusedKeyOnWindows = (named: string): string => refusedKey(named).split('\r\n').filter((line) => !line.startsWith('  ')).join('\r\n');

const FOLDER = '/storage/keys/4242';
/** The pin file of the call that is asked about, and the pin file of ANOTHER call of the same entry in the same folder. */
const PIN_FILE = `${FOLDER}/known_hosts-e1-3f2b8c1e-7a4d-4e9b-9c55-0d1e2f3a4b5c`;
const OTHER_CALL = `${FOLDER}/known_hosts-e1-9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d`;
const VERIFICATION = 'Host key verification failed.';

/** A hop of the person's own `ProxyJump` whose key the nested `ssh` refused: the same 15 lines, and they name the person's file. */
const HOP_REFUSED = refusedKey('/home/dev/.ssh/known_hosts', 'hop.example');
/** `ssh` found no key for the name it looked up: a config that gives the host another name or port, or a file with no key for it. */
const NO_KEY_KNOWN = printed('No ED25519 host key is known for box.example and you have requested strict checking.', VERIFICATION);
const HOST_DOWN = printed('ssh: connect to host box.example port 22: Connection refused');
const LOGIN_REFUSED = printed('dev@box.example: Permission denied (publickey,password).');
const NO_ANSWER = printed('ssh: connect to host box.example port 22: Connection timed out');
const NO_BANNER = printed('Connection timed out during banner exchange');

/* --- part 1: the one function --- */

/** `hostKeyTold`. Its first argument is the checked pin of the call (E2.S2's `CheckedPin`): a test makes one with `testPin`, through the product's own maker. */
type Told = (pin: unknown, stderr: string, name: string) => { install: string; bridge: string } | undefined;

/** An export of `hostKeyPin.ts`, read through the module object: this file compiles before the export exists, so its absence is a failed assertion. */
function exported<T>(name: string): T {
  const found = (hostKeyPin as Record<string, unknown>)[name];
  assert.equal(typeof found, 'function', `hostKeyPin.ts exports no ${name}`);
  return found as T;
}

test('S0 (guard): the printer of the fixtures writes a name as ssh printed it: a backslash as two, a letter outside ASCII as octal escapes, the rest as it is', () => {
  assert.equal(asSshPrints('/st/a\\b/keys/4242/known_hosts-e1-3f2b8c1e'), '/st/a\\\\b/keys/4242/known_hosts-e1-3f2b8c1e');
  assert.equal(asSshPrints('/st/Jörg Пётр/keys'), '/st/J\\303\\266rg \\320\\237\\321\\221\\321\\202\\321\\200/keys');
  assert.equal(asSshPrints("/st/it's here/a:1"), "/st/it's here/a:1");
});

/** Texts in which `ssh` names the pin file of THIS call beside the verification line: the file as the call knows it, and the text. */
const EVIDENCE: readonly { label: string; pinFile: string; stderr: string }[] = [
  { label: 'the 15 lines as ssh prints them, with CR LF', pinFile: PIN_FILE, stderr: refusedKey(PIN_FILE) },
  { label: 'the same lines ended with LF alone', pinFile: PIN_FILE, stderr: refusedKey(PIN_FILE).replaceAll('\r\n', '\n') },
  { label: 'a path with a space (the word was in double quotes; ssh prints the path with none)', pinFile: '/Users/dev/Library/Application Support/keys/4242/known_hosts-e1-3f2b8c1e', stderr: refusedKey('/Users/dev/Library/Application Support/keys/4242/known_hosts-e1-3f2b8c1e') },
  { label: 'a path with a pair of apostrophes', pinFile: "/home/dev/a'b'c/keys/4242/known_hosts-e1-3f2b8c1e", stderr: refusedKey("/home/dev/a'b'c/keys/4242/known_hosts-e1-3f2b8c1e") },
  { label: 'a path with a colon and digits in it', pinFile: '/home/dev/v:2/keys/4242/known_hosts-e1-3f2b8c1e', stderr: refusedKey('/home/dev/v:2/keys/4242/known_hosts-e1-3f2b8c1e') },
  { label: 'a path with a backslash, which ssh prints as two', pinFile: '/home/dev/a\\b/keys/4242/known_hosts-e1-3f2b8c1e', stderr: refusedKey('/home/dev/a\\\\b/keys/4242/known_hosts-e1-3f2b8c1e') },
  { label: 'a path with a literal backslash and then three octal digits, which ssh prints as two backslashes and the digits', pinFile: '/home/dev/a\\303b/keys/4242/known_hosts-e1-3f2b8c1e', stderr: refusedKey('/home/dev/a\\\\303b/keys/4242/known_hosts-e1-3f2b8c1e') },
  { label: 'a path with letters outside ASCII, which ssh prints byte by byte as a backslash and three octal digits', pinFile: '/home/dev/Jörg Пётр/keys/4242/known_hosts-e1-3f2b8c1e', stderr: refusedKey('/home/dev/J\\303\\266rg \\320\\237\\321\\221\\321\\202\\321\\200/keys/4242/known_hosts-e1-3f2b8c1e') },
  { label: 'the same path printed as it is', pinFile: '/home/dev/Jörg Пётр/keys/4242/known_hosts-e1-3f2b8c1e', stderr: refusedKey('/home/dev/Jörg Пётр/keys/4242/known_hosts-e1-3f2b8c1e') },
  { label: 'a path of Windows, as ssh.exe prints it: every backslash as two (a path with a drive letter was not run)', pinFile: 'C:\\Users\\dev\\keys\\4242\\known_hosts-e1-3f2b8c1e', stderr: refusedKeyOnWindows('C:\\\\Users\\\\dev\\\\keys\\\\4242\\\\known_hosts-e1-3f2b8c1e') },
  { label: 'a key of another type', pinFile: PIN_FILE, stderr: refusedKey(PIN_FILE).replaceAll('ED25519', 'RSA') },
];

for (const row of EVIDENCE) {
  test(`S1: ssh names the pin file of this call beside the verification line, ${row.label}: sentence C in both forms`, () => {
    const hostKeyTold = exported<Told>('hostKeyTold');

    assert.deepEqual(hostKeyTold(testPin(row.pinFile), row.stderr, 'box'), TOLD_C);
  });
}

/** The line that names a file, as the only line before the verification line. */
const offending = (line: string): string => printed(line, VERIFICATION);

/** Texts that hold the verification line and do NOT name the pin file of this call. */
const NO_EVIDENCE: readonly { label: string; stderr: string }[] = [
  { label: 'the lines name the pin file of ANOTHER call (another uuid, the same folder)', stderr: refusedKey(OTHER_CALL) },
  { label: "a hop of the person's own ProxyJump: the nested ssh names the person's own known_hosts", stderr: HOP_REFUSED },
  { label: 'ssh found no key for the name it looked up', stderr: NO_KEY_KNOWN },
  { label: 'a remote text that IS the line', stderr: `${VERIFICATION}\n` },
  { label: 'a remote text that ENDS with the line', stderr: `profile: sourcing extras\nfetch failed\n${VERIFICATION}\n` },
  { label: 'the line with no line end', stderr: VERIFICATION },
  { label: 'the line "Add correct host key in" names the pin file, and no Offending line does', stderr: offending(`Add correct host key in ${PIN_FILE} to get rid of this message.`) },
  { label: 'the Offending line names the FOLDER of the pin file', stderr: offending(`Offending ED25519 key in ${FOLDER}:1`) },
  { label: 'the Offending line names a file whose name only STARTS with the pin file', stderr: offending(`Offending ED25519 key in ${PIN_FILE}.old:1`) },
  { label: 'the Offending line names a file whose name only ENDS with the pin file', stderr: offending(`Offending ED25519 key in /mnt/copy${PIN_FILE}:1`) },
  { label: 'the Offending line is cut before the end of the name', stderr: offending(`Offending ED25519 key in ${PIN_FILE.slice(0, -4)}:1`) },
  { label: 'the Offending line has no line number', stderr: offending(`Offending ED25519 key in ${PIN_FILE}`) },
  { label: 'the Offending line stands inside a longer line', stderr: offending(`remote: Offending ED25519 key in ${PIN_FILE}:1`) },
  { label: 'the Offending line has more text behind the line number', stderr: offending(`Offending ED25519 key in ${PIN_FILE}:1 (or so)`) },
  { label: 'the line about a key for an IP address', stderr: offending(`Offending key for IP in ${PIN_FILE}:1`) },
];

for (const row of NO_EVIDENCE) {
  test(`S2: the verification line with no evidence, ${row.label}: sentence D in both forms, never sentence C`, () => {
    const hostKeyTold = exported<Told>('hostKeyTold');

    assert.deepEqual(hostKeyTold(testPin(PIN_FILE), row.stderr, 'box'), TOLD_D);
  });
}

test('S3: a pinned call whose stderr holds no verification line is told nothing: a host that is down, a refused login, no answer, no text, words inside another line', () => {
  const hostKeyTold = exported<Told>('hostKeyTold');

  for (const stderr of [HOST_DOWN, LOGIN_REFUSED, NO_ANSWER, NO_BANNER, '', printed(`note: ${VERIFICATION} earlier`), printed('Host key verification failed')]) {
    assert.equal(hostKeyTold(testPin(PIN_FILE), stderr, 'box'), undefined, stderr);
  }
});

test('S3b: the Offending line of this call WITHOUT the verification line is told nothing: both lines are needed', () => {
  const hostKeyTold = exported<Told>('hostKeyTold');

  assert.equal(hostKeyTold(testPin(PIN_FILE), printed(`Offending ED25519 key in ${PIN_FILE}:1`), 'box'), undefined);
});

test('S4: an unpinned call is told nothing, whatever its ssh printed', () => {
  const hostKeyTold = exported<Told>('hostKeyTold');

  for (const stderr of [refusedKey(PIN_FILE), HOP_REFUSED, NO_KEY_KNOWN, `${VERIFICATION}\n`]) {
    assert.equal(hostKeyTold(undefined, stderr, 'box'), undefined, stderr);
  }
});

test('S5: sentence D, word for word, and sentence C as E1 wrote it', () => {
  const unnamedHostKeySentence = exported<(name: string) => string>('unnamedHostKeySentence');
  const refusedHostKeySentence = exported<(name: string) => string>('refusedHostKeySentence');

  assert.equal(unnamedHostKeySentence('box'), SENTENCE_D);
  assert.equal(refusedHostKeySentence('box'), SENTENCE_C);
});

test('S6: sentence D never tells the person to replace, trust or forget a saved key, and names no host as the one that changed', () => {
  const unnamedHostKeySentence = exported<(name: string) => string>('unnamedHostKeySentence');
  const sentence = unnamedHostKeySentence('box');

  assert.match(sentence, /Do not replace a saved key because of this message\./);
  assert.doesNotMatch(sentence, /did not present|was rebuilt|Trust and connect|[Ff]orget|is not open/);
});

/* --- part 2: the two roads --- */

const HOST_KEY = { algorithm: 'ssh-ed25519', base64: 'AAAAC3NzaC1lZDI1NTE5AAAAIKNOWNKEY' };
const PIN = hostKeyPin.formatHostKey(HOST_KEY);
const PROBE_OK = 'creds=-\narch=x86_64\nos=Linux\nget=/usr/bin/curl\n';
const NOT_READ = 'its mode could not be read';

const yes = (_message: string, rest: readonly unknown[]): string | undefined => rest.find((one): one is string => typeof one === 'string');

/** A real storage folder of one test: owned, and removed when this file's tests end. */
const storage = (what: string): string => ownedDir(scope, what);

/** A pinned entry with a password login, in a real storage folder: no key file, so every known-hosts file of the folder is a pin file. */
const pinned = (dir: string, parts: Parts = {}): Parts => ({ storageDir: dir, hostKey: PIN, realForget: true, clicks: [passwordLogin(), passwordLogin()], checks: [passwordLogin()], ...parts });

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

/** The pin file that the argv of a run names, read back from the argv: the file of THIS call. */
function pinFileOf(argv: readonly string[]): string {
  const named = knownHostsOf(argv);
  assert.ok(named !== undefined && named.text !== undefined, 'the run of a pinned entry names no pin file that is on the disk');
  return named.file;
}

/** The pin file of another call of the same entry: the same folder, another uuid. */
const otherCallOf = (argv: readonly string[]): string => pinFileOf(argv).replace(/[0-9a-f-]{36}$/, '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d');

test('X0: the fixtures of part 2 are what they say: the pin file of a run is a file of one call, and "another call" is another file of its folder', async () => {
  const dir = storage('x0');
  const seen: string[][] = [];
  const w = world(pinned(dir, { run: (_index, argv) => { seen.push([pinFileOf(argv), otherCallOf(argv)]); return ran(PROBE_OK); } }));
  await click(w, 'installRemoteCli');

  assert.equal(seen.length, 1);
  assert.match(seen[0][0], /known_hosts-e1-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.notEqual(seen[0][1], seen[0][0]);
  assert.equal(seen[0][1].slice(0, -36), seen[0][0].slice(0, -36));
});

for (const folder of ['Application Support', "it's here"]) {
  test(`X1: the install shows sentence C when ssh names the pin file of the probe, in a storage folder named "${folder}"`, async () => {
    const dir = `${storage('x1')}/${folder}`;
    fs.mkdirSync(dir, { recursive: true });
    const w = world(pinned(dir, { answer: yes, run: (_index, argv) => ran('', 255, refusedKey(asSshPrints(pinFileOf(argv)))) }));
    await click(w, 'installRemoteCli');

    assert.deepEqual(w.errors, [SENTENCE_C], 'X1: a refused host key with the evidence of the call was not told with sentence C');
    assert.deepEqual(w.warnings, []);
    assert.equal(w.runs.length, 1, 'X1: the install went on after a refused host key');
  });
}

const INSTALL_D: readonly { label: string; stderr: (argv: readonly string[]) => string }[] = [
  { label: "a hop of the person's own config was refused", stderr: () => HOP_REFUSED },
  { label: 'ssh names the pin file of ANOTHER call', stderr: (argv) => refusedKey(asSshPrints(otherCallOf(argv))) },
  { label: 'ssh found no key for the name it looked up', stderr: () => NO_KEY_KNOWN },
  { label: 'the remote side wrote the line', stderr: () => `${VERIFICATION}\n` },
];

for (const row of INSTALL_D) {
  test(`X2: the install shows sentence D, and not sentence C, when ${row.label}`, async () => {
    const dir = storage('x2');
    const w = world(pinned(dir, { answer: yes, run: (_index, argv) => ran('', 255, row.stderr(argv)) }));
    await click(w, 'installRemoteCli');

    assert.deepEqual(w.errors, [SENTENCE_D], 'X2: a verification line that does not name the pin file of the call was not told with sentence D');
    assert.deepEqual(w.warnings, [], `X2: it was told as something else too: ${w.warnings.join(' | ')}`);
    assert.equal(w.runs.length, 1, 'X2: the install went on');
    assert.deepEqual(w.asked, [], 'X2: the install asked its question');
    assert.deepEqual(pinFiles(dir), [], 'X2: the install left its pin file');
  });
}

test('X3: the socket check shows ONE error message, "could not be checked" and sentence D, when the remote side wrote the line; the tunnel is up and stays', async (t) => {
  const dir = storage('x3');
  const w = await bridged(t, pinned(dir, { run: () => ran('', 255, `${VERIFICATION}\n`) }));

  assert.equal(w.runs.length, 2, `the check did not run twice (the sweep, the mode check): ${w.runs.length}`);
  assert.deepEqual(w.errors, [TOLD_D.bridge], 'X3: the socket check did not show ONE error message with the opening "could not be checked" and sentence D');
  assert.deepEqual(w.logs.filter((line) => line === TOLD_D.bridge), [TOLD_D.bridge], 'X3: the message of the check is not in the log once');
  assert.equal(w.logs.some((line) => line.includes(NOT_READ)), false, 'X3: the check also logged a socket that is there');
  assert.equal(w.bridges.isOpen(KEY), true, 'X3: the check closed a bridge whose tunnel is up');
  assert.equal(pinFiles(dir).length, 1, 'X3: the check left its pin file, or deleted the pin file of the bridge');
});

test('X4: the socket check shows the same message when a hop was refused and the tunnel has ended', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const dir = storage('x4');
  const w = world(pinned(dir, { run: () => ran('', 255, HOP_REFUSED) }));
  await click(w, 'openRemoteBridge');
  await settled();
  w.children[0].end(255); // the ssh of the bridge met the same hop; it has no stdio, so it says nothing
  await settled();
  t.mock.timers.tick(1500);
  await settled();

  assert.deepEqual(w.errors, [TOLD_D.bridge], 'X4: the socket check did not show ONE error message with the opening "could not be checked" and sentence D');
  assert.equal(w.bridges.isOpen(KEY), false);
  assert.deepEqual(pinFiles(dir), [], 'X4: a pin file stays after the bridge and its check have ended');
});

test('X5: the socket check shows "is not open" and sentence C when ssh names the pin file of the mode check, and not the file of the bridge', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const dir = storage('x5');
  const w = world(pinned(dir, { run: (_index, argv) => ran('', 255, refusedKey(asSshPrints(pinFileOf(argv)))) }));
  await click(w, 'openRemoteBridge');
  await settled();
  w.children[0].end(255);
  await settled();
  t.mock.timers.tick(1500);
  await settled();

  assert.deepEqual(w.errors, [TOLD_C.bridge], 'X5: a refused host key with the evidence of the check was not told with "is not open" and sentence C');
  assert.notEqual(w.runs[1].knownHosts?.file, knownHostsOf(w.bridgeArgvs[0])?.file, 'X5: the check read the pin file of the bridge');
});

test('X6: the socket check shows sentence D when ssh names the pin file of the BRIDGE and not the file of the check', async (t) => {
  const dir = storage('x6');
  const ofBridge: string[] = [];
  const spawn: Parts['spawn'] = (_command, argv) => { ofBridge.push(pinFileOf(argv)); return { exited: new Promise<number | null>(() => {}), kill: (): void => undefined }; };
  const w = await bridged(t, pinned(dir, { spawn, run: () => ran('', 255, refusedKey(asSshPrints(ofBridge[0]))) }));

  assert.deepEqual(w.errors, [TOLD_D.bridge], 'X6: the evidence of another call was read as the evidence of the check');
});

/** Runs of an UNPINNED entry whose stderr holds the verification line: the sentences of before, on both roads. */
const UNPINNED: readonly { label: string; stderr: string }[] = [
  { label: 'the 15 lines', stderr: refusedKey(PIN_FILE) },
  { label: 'the lines of a hop', stderr: HOP_REFUSED },
  { label: 'the line alone', stderr: `${VERIFICATION}\n` },
];

for (const row of UNPINNED) {
  test(`X7 (guard): the install on an UNPINNED entry whose ssh printed ${row.label} shows the sentence of before, and neither sentence C nor D`, async () => {
    const w = world(pinned(storage('x7'), { hostKey: undefined, run: () => ran('', 255, row.stderr) }));
    await click(w, 'installRemoteCli');

    assert.deepEqual(w.errors, [], `X7: an unpinned entry was told about a saved host key: ${w.errors.join(' | ')}`);
    assert.equal(w.warnings.length, 1, `the install did not show one warning: ${w.warnings.join(' | ')}`);
    assert.match(w.warnings[0], /did not answer the probe/);
  });

  test(`X7 (guard): the socket check on an UNPINNED entry whose ssh printed ${row.label} shows no message and logs the mode as not read`, async (t) => {
    const w = await bridged(t, pinned(storage('x7'), { hostKey: undefined, run: () => ran('', 255, row.stderr) }));

    assert.deepEqual(w.errors, [], `X7: an unpinned entry was told about a saved host key: ${w.errors.join(' | ')}`);
    assert.ok(w.logs.some((line) => line.includes(NOT_READ)), `the unreadable mode was not logged: ${w.logs.join(' | ')}`);
  });
}

test('X8 (guard): the SECOND run of the install keeps the sentence of before, also when ssh names the pin file of the call', async () => {
  const w = world(pinned(storage('x8'), { answer: yes, run: (index, argv) => (index === 0 ? ran(PROBE_OK) : ran('', 255, refusedKey(asSshPrints(pinFileOf(argv))))) }));
  await click(w, 'installRemoteCli');

  assert.equal(w.runs.length, 2);
  assert.deepEqual(w.errors, ['Could not install on "box": the installer produced no result and exited 255.']);
});
