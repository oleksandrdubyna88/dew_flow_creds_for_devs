import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { after, test, TestContext } from 'node:test';
import { cleanupScope, ownedDir, ownedFile } from '../../scripts/lib/leftovers.cjs';
import { formatHostKey, knownHostsLine, parseHostKey } from '../hostKeyPin';
import { materializedKeysDir } from '../materializedKeys';
import type { ExecAuth } from '../sshExecAuth';
import { KEY, Parts, World, click, knownHostsOf, ownKeyFile, passwordLogin, pinFiles, ran, settled, world, writtenKey } from './personRoadsWorld';
import { loadWithVscode } from './vscodeStub';

/**
 * G1, E1.S2: the saved host key of one call on the three roads of the person. A pin that is there and can be used is written to a
 * file of that call alone and deleted with the call, whether or not a key file was written; a pin that is there and cannot be
 * used, and a pin file that cannot be written, start no `ssh`; an entry with no pin runs as before. That each `ssh` is handed the
 * file is `personRoadsHostKey.test.ts` (E1.S3).
 *
 * <p>`materializeKnownHosts` and `forgetMaterializedKey` are the real ones (`realForget`), in a real storage folder that this file
 * owns, so every pin file here is a real file. The one exception is Q7a to Q7c, which stand in for `./hostKeyTrust` to make the
 * write fail.</p>
 */

const scope = cleanupScope();
after(() => scope.close());

const HOST_KEY = { algorithm: 'ssh-ed25519', base64: 'AAAAC3NzaC1lZDI1NTE5AAAAIKNOWNKEY' };
const PIN = formatHostKey(HOST_KEY);
const PIN_LINE = knownHostsLine('box.example', undefined, HOST_KEY);
const NOT_A_KEY = 'not a host key';
const BAD_HOST = '-oProxyCommand=evil';
/** The name of a pin file of one call: the entry's id and a uuid. `known_hosts-e1`, the name of the agent's exec, does not match. */
const CALL_PIN = /^known_hosts-e1-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const PROBE_OK = 'creds=-\narch=x86_64\nos=Linux\nget=/usr/bin/curl\n';
const INSTALLED = 'creds-install: installed /home/dev/.local/bin/creds\n';

const KEY_FORM =
  'The saved host key of "box" cannot be used, so nothing was sent to that host. Get the host\'s key fingerprint from the person who runs the server. Then use Connect SSH on this entry, and go on only if it shows that fingerprint: Trust and connect saves the key.';
const PASSWORD_FORM =
  'The saved host key of "box" cannot be used, so nothing was sent to that host. Do not use Connect SSH to save it again: this entry signs in with a password, and when Connect SSH cannot read the host\'s key first, it sends the password without checking the host. There is no safe repair for such an entry yet; the bridge and the install stay refused for it.';
const WRITE_FAILED = 'Could not write the saved host key of "box" to disk: ';
const DISK_FULL = 'ENOSPC: no space left on device';

const yes = (_message: string, rest: readonly unknown[]): string | undefined => rest.find((one): one is string => typeof one === 'string');

/** A real storage folder of one test: owned, and removed when this file's tests end. */
const storage = (what: string): string => ownedDir(scope, what);

/** A real file that stands for a key file of one call, or for a key file of the person: outside the storage folder. */
function keyFile(what: string): string {
  const file = ownedFile(scope, what, 'call.key');
  fs.writeFileSync(file, 'not a key', { mode: 0o600 });
  return file;
}

/** The pin files of calls that are on the disk now, with their text. */
function callPins(dir: string): { name: string; text: string }[] {
  return pinFiles(dir)
    .filter((name) => CALL_PIN.test(name))
    .map((name) => ({ name, text: fs.readFileSync(path.join(materializedKeysDir(dir), name), 'utf8') }));
}

/** A promise the test settles. */
function held<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

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

test('Q0: the fixtures are what the real functions say: the pin parses and forms a line, the other text does not parse, the other host forms no line', () => {
  assert.deepEqual(parseHostKey(PIN), HOST_KEY);
  assert.equal(PIN_LINE, `box.example ${PIN}\n`);
  assert.equal(parseHostKey(NOT_A_KEY), undefined);
  assert.equal(knownHostsLine(BAD_HOST, undefined, HOST_KEY), undefined);
});

test('QW: the world reads the known-hosts file that an argv names, bare and in double quotes, and none when the argv names none', () => {
  const file = ownedFile(scope, 'qw', 'known hosts');
  fs.writeFileSync(file, 'a line\n');

  assert.deepEqual(knownHostsOf(['-o', `UserKnownHostsFile=${file}`, 'dev@box']), { file, text: 'a line\n' });
  assert.deepEqual(knownHostsOf(['-o', `UserKnownHostsFile="${file}"`, 'dev@box']), { file, text: 'a line\n' });
  assert.deepEqual(knownHostsOf(['-o', `UserKnownHostsFile=${file}.gone`]), { file: `${file}.gone`, text: undefined });
  assert.equal(knownHostsOf(['-o', 'StrictHostKeyChecking=accept-new', 'dev@box']), undefined);
});

for (const [label, hostKey] of [['no saved host key', undefined], ['an empty saved host key', ''], ['a saved host key of white space', ' \n\t ']] as const) {
  test(`Q1: an entry with ${label} runs as before: accept-new in all five runs, no known-hosts file, nothing written`, async (t) => {
    const dir = storage('q1');
    const seen: string[][] = [];
    const answers = ['', '600', PROBE_OK, INSTALLED];
    const run = (index: number): ReturnType<typeof ran> => (seen.push(pinFiles(dir)), ran(answers[index]));
    const w = await bridged(t, { storageDir: dir, hostKey, clicks: [passwordLogin(), passwordLogin()], checks: [passwordLogin()], answer: yes, run });
    await click(w, 'installRemoteCli');

    const argvs = [...w.bridgeArgvs, ...w.runs.map((one) => one.argv)];
    assert.equal(argvs.length, 5, `the five runs did not all start (the bridge, the sweep, the mode check, the probe, the install): ${argvs.length}`);
    for (const argv of argvs) {
      assert.ok(argv.includes('StrictHostKeyChecking=accept-new'), `Q1: an unpinned run does not carry accept-new: ${argv.join(' ')}`);
      assert.equal(argv.find((word) => /KnownHostsFile=/.test(word)), undefined, 'Q1: an unpinned run names a known-hosts file');
    }
    assert.deepEqual(w.runs.map((one) => one.knownHosts), [undefined, undefined, undefined, undefined]);
    assert.deepEqual(seen, [[], [], [], []], 'Q1: a pin file was on the disk during a run of an unpinned entry');
    assert.deepEqual(w.errors, [], `Q1: an unpinned entry was refused: ${w.errors.join(' | ')}`);
    assert.equal(fs.existsSync(path.join(dir, 'keys')), false, 'Q1: an unpinned entry wrote into the key folder');
  });
}

/** The three logins of an entry whose pin can be used: what the resolve answers, and the file that must stay or go. */
const LOGINS: readonly { label: string; make(): { credential: ExecAuth; written?: string; own?: string } }[] = [
  { label: 'a password', make: () => ({ credential: passwordLogin() }) },
  {
    label: "the person's own key file",
    make: () => {
      const own = keyFile('own');
      return { credential: ownKeyFile(own), own };
    },
  },
  {
    label: 'a stored key',
    make: () => {
      const written = keyFile('written');
      return { credential: writtenKey(written), written };
    },
  },
];

for (const login of LOGINS) {
  test(`Q5: the install of a pinned entry with ${login.label} writes ONE pin file, keeps it for both runs and the question, and deletes it`, async () => {
    const dir = storage('q5');
    const { credential, written, own } = login.make();
    const seen: { name: string; text: string }[][] = [];
    const keyThere: boolean[] = [];
    const look = (): void => {
      seen.push(callPins(dir));
      keyThere.push(written === undefined || fs.existsSync(written));
    };
    const w = world({
      storageDir: dir,
      hostKey: PIN,
      realForget: true,
      clicks: [credential],
      answer: (message, rest) => (look(), yes(message, rest)),
      run: (index) => (look(), ran(index === 0 ? PROBE_OK : INSTALLED)),
    });
    await click(w, 'installRemoteCli');

    assert.equal(w.runs.length, 2, `the probe and the install did not both run: ${w.errors.join(' | ')}`);
    assert.deepEqual(seen.map((one) => one.length), [1, 1, 1], 'Q5: the pin file of the call was not on the disk at the probe, at the question and at the install run');
    assert.match(seen[0][0].name, CALL_PIN);
    assert.deepEqual(seen, [seen[0], seen[0], seen[0]], 'Q5: the two runs and the question did not see one and the same pin file');
    assert.equal(seen[0][0].text, PIN_LINE, 'Q5: the pin file does not hold the line of the entry');
    assert.deepEqual(keyThere, [true, true, true], 'Q5: the key file of the call was deleted before a run that reads it');
    assert.deepEqual(pinFiles(dir), [], 'Q5: the install left its pin file');
    assert.equal(written === undefined ? false : fs.existsSync(written), false, 'Q5: the install left its key file');
    assert.equal(own === undefined ? 'not a key' : fs.readFileSync(own, 'utf8'), 'not a key', "Q5: the person's own key file was touched");
  });
}

test('Q5b: the bridge of a pinned password entry keeps its pin file while its ssh runs, also after Close, and deletes it when the ssh has ended', async () => {
  const dir = storage('q5b');
  const w = world({ storageDir: dir, hostKey: PIN, realForget: true, clicks: [passwordLogin()] });
  await click(w, 'openRemoteBridge');
  await settled();

  assert.equal(w.children.length, 1, `no bridge was started: ${w.errors.join(' | ')}`);
  const open = callPins(dir);
  assert.equal(open.length, 1, 'Q5b: the pin file of the bridge is not on the disk while its ssh runs');
  assert.equal(open[0].text, PIN_LINE);

  await click(w, 'closeRemoteBridge');
  await settled();
  assert.deepEqual(callPins(dir), open, 'Q5b: Close deleted the pin file of an ssh that has not ended');

  w.children[0].end(null);
  await settled();
  assert.deepEqual(pinFiles(dir), [], 'Q5b: the bridge ended and its pin file stays');
});

/** The two pins that are there and cannot be used. */
const UNUSABLE: readonly { label: string; parts: Parts }[] = [
  { label: 'a saved host key that does not parse', parts: { hostKey: NOT_A_KEY } },
  { label: 'a saved host key on a host that cannot form a known_hosts line', parts: { hostKey: PIN, host: BAD_HOST } },
];

/** The three logins, and the form of sentence A that each must be shown. */
const FORMS: readonly { label: string; form: string; make(): { credential: ExecAuth; written?: string; own?: string } }[] = [
  { ...LOGINS[2], form: KEY_FORM },
  { ...LOGINS[1], form: KEY_FORM },
  { ...LOGINS[0], form: PASSWORD_FORM },
];

const ROADS = [
  { command: 'installRemoteCli', opening: 'Cannot reach "box": ' },
  { command: 'openRemoteBridge', opening: 'Cannot bridge to "box": ' },
] as const;

for (const road of ROADS) {
  for (const pin of UNUSABLE) {
    for (const login of FORMS) {
      test(`Q6: ${road.command} with ${login.label} and ${pin.label} starts no ssh and shows sentence A in the form of that login`, async () => {
        const dir = storage('q6');
        const { credential, written, own } = login.make();
        const w = world({ storageDir: dir, realForget: true, clicks: [credential], ...pin.parts });
        await click(w, road.command);
        await settled();

        assert.deepEqual(w.errors, [`${road.opening}${login.form}`], 'Q6: the refusal of the unusable pin was not shown, or not in the form of the login');
        assert.equal(w.runs.length, 0, 'Q6: an ssh run started on an entry whose saved host key cannot be used');
        assert.equal(w.children.length, 0, 'Q6: a bridge was started on an entry whose saved host key cannot be used');
        assert.equal(w.bridges.isOpen(KEY), false);
        assert.equal(w.infos.some((text) => text.includes('Bridge open to')), false, 'Q6: the bridge was announced as open');
        assert.equal(written === undefined ? false : fs.existsSync(written), false, 'Q6: the refused call left its key file');
        assert.equal(own === undefined ? 'not a key' : fs.readFileSync(own, 'utf8'), 'not a key', "Q6: the person's own key file was touched");
        assert.deepEqual(pinFiles(dir), [], 'Q6: the refused call left a file in the key folder');
      });
    }
  }
}

/** `./hostKeyTrust` with a `materializeKnownHosts` that throws on the calls the test names (1-based) and is the real one on the others. */
function failingTrust(failOn: readonly number[]): Record<string, unknown> {
  const real = loadWithVscode<typeof import('../hostKeyTrust')>('../hostKeyTrust', {});
  let calls = 0;
  return {
    ...real,
    materializeKnownHosts: (...args: Parameters<typeof real.materializeKnownHosts>): string | undefined => {
      calls += 1;
      if (failOn.includes(calls)) {
        throw new Error(DISK_FULL);
      }
      return real.materializeKnownHosts(...args);
    },
  };
}

for (const road of ROADS) {
  test(`Q7a: ${road.command}: a pin file that cannot be written starts no ssh, shows sentence B, and the key file of the call is deleted`, async () => {
    const dir = storage('q7a');
    const written = keyFile('written');
    const w = world({ storageDir: dir, hostKey: PIN, realForget: true, clicks: [writtenKey(written)], mocks: { './hostKeyTrust': failingTrust([1]) } });
    await click(w, road.command);
    await settled();

    assert.deepEqual(w.errors, [`${road.opening}${WRITE_FAILED}${DISK_FULL}`], 'Q7a: the failed write of the pin file was not shown');
    assert.equal(w.runs.length, 0, 'Q7a: an ssh run started after the pin file could not be written');
    assert.equal(w.children.length, 0, 'Q7a: a bridge was started after the pin file could not be written');
    assert.equal(fs.existsSync(written), false, 'Q7a: the key file of the call stays after the pin file could not be written');
  });
}

test('Q7b: a REAL folder that cannot be written: the install starts no ssh, shows sentence B with the error of the disk, and deletes its key file', async () => {
  const dir = storage('q7b');
  fs.writeFileSync(path.join(dir, 'keys'), 'a file where the key folder would be');
  const written = keyFile('written');
  const w = world({ storageDir: dir, hostKey: PIN, realForget: true, clicks: [writtenKey(written)] });
  await click(w, 'installRemoteCli');

  assert.equal(w.errors.length, 1, `Q7b: the failed write of the pin file was not shown once: ${w.errors.join(' | ')}`);
  assert.match(w.errors[0], /^Cannot reach "box": Could not write the saved host key of "box" to disk: \S/);
  assert.equal(w.runs.length, 0, 'Q7b: an ssh run started after the pin file could not be written');
  assert.equal(fs.existsSync(written), false, 'Q7b: the key file of the call stays after the pin file could not be written');
  assert.equal(fs.readFileSync(path.join(dir, 'keys'), 'utf8'), 'a file where the key folder would be');
});

test('Q7c: the socket check whose pin file cannot be written runs no ssh, says so in the log, deletes its key file, and leaves the bridge and its pin file', async (t) => {
  const dir = storage('q7c');
  const written = keyFile('written');
  const parts: Parts = { storageDir: dir, hostKey: PIN, realForget: true, clicks: [passwordLogin()], checks: [writtenKey(written)] };
  const w = await bridged(t, { ...parts, mocks: { './hostKeyTrust': failingTrust([2]) } });

  assert.equal(w.children.length, 1, `no bridge was started: ${w.errors.join(' | ')}`);
  assert.equal(w.runs.length, 0, 'Q7c: the socket check ran an ssh after its pin file could not be written');
  assert.deepEqual(
    w.logs.filter((line) => line.startsWith('socket check did not run')),
    [`socket check did not run: ${WRITE_FAILED}${DISK_FULL}`],
    'Q7c: the socket check that did not run is not in the log',
  );
  assert.deepEqual(w.errors, [], 'Q7c: the socket check showed a message of its own for a pin file that could not be written');
  assert.equal(fs.existsSync(written), false, 'Q7c: the socket check left its key file');
  assert.equal(w.bridges.isOpen(KEY), true);
  assert.equal(callPins(dir).length, 1, 'Q7c: the pin file of the bridge is not on the disk while its ssh runs');
});

/** The file that the agent's exec and a Connect terminal use, `known_hosts-e1`, as an earlier call of theirs left it. */
function olderPin(dir: string): string {
  const file = path.join(materializedKeysDir(dir), 'known_hosts-e1');
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, 'the pin of another road\n', { mode: 0o600 });
  return file;
}

test('Q8a: two installs of one pinned entry that overlap hold two pin files; each end deletes only its own, and known_hosts-e1 stays', async () => {
  const dir = storage('q8a');
  const older = olderPin(dir);
  const questions = [held<string | undefined>(), held<string | undefined>()];
  let asked = 0;
  const w = world({ storageDir: dir, hostKey: PIN, realForget: true, clicks: [passwordLogin(), passwordLogin()], run: () => ran(PROBE_OK), answer: () => questions[asked++].promise });

  const first = click(w, 'installRemoteCli');
  await settled();
  const one = callPins(dir);
  const second = click(w, 'installRemoteCli');
  await settled();
  const two = callPins(dir);

  assert.equal(one.length, 1, 'Q8a: the first install holds no pin file at its question');
  assert.equal(two.length, 2, 'Q8a: two installs that overlap do not hold two distinct pin files');
  assert.ok(two.some((file) => file.name === one[0].name));

  questions[0].resolve(undefined);
  await first;
  assert.deepEqual(callPins(dir), two.filter((file) => file.name !== one[0].name), 'Q8a: the end of the first install did not delete exactly its own pin file');

  questions[1].resolve(undefined);
  await second;
  assert.deepEqual(callPins(dir), [], 'Q8a: the second install left its pin file');
  assert.equal(fs.readFileSync(older, 'utf8'), 'the pin of another road\n', 'Q8a: known_hosts-e1 was touched');
  assert.equal(w.runs.length, 2);
});

test('Q8b: a bridge and its socket check hold two pin files; the check deletes only its own, and the bridge its own when its ssh has ended', async (t) => {
  const dir = storage('q8b');
  const older = olderPin(dir);
  const seen: { name: string; text: string }[][] = [];
  const run = (): ReturnType<typeof ran> => (seen.push(callPins(dir)), ran('600'));
  const w = await bridged(t, { storageDir: dir, hostKey: PIN, realForget: true, clicks: [passwordLogin()], checks: [passwordLogin()], run });

  assert.equal(w.runs.length, 2, `the check did not run twice (the sweep, the mode check): ${w.runs.length}`);
  assert.deepEqual(seen.map((one) => one.length), [2, 2], 'Q8b: the bridge and its socket check do not hold two distinct pin files during the check');
  assert.deepEqual(seen[1], seen[0], 'Q8b: the two runs of the check did not see the same two files');

  const left = callPins(dir);
  assert.equal(left.length, 1, 'Q8b: the end of the check did not leave exactly the pin file of the bridge');
  assert.ok(seen[0].some((file) => file.name === left[0].name && file.text === left[0].text), 'Q8b: the file that stays is not one of the two');

  w.children[0].end(0);
  await settled();
  assert.deepEqual(callPins(dir), [], 'Q8b: the bridge ended and its pin file stays');
  assert.equal(fs.readFileSync(older, 'utf8'), 'the pin of another road\n', 'Q8b: known_hosts-e1 was touched');
});

test('QS: on the three roads the answer of the resolve has no name: each resolveExecAuth( of agentCommands.ts is the first argument of a guard that is given writePersonPin', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'commands', 'agentCommands.ts'), 'utf8');
  const resolves = source.match(/\bresolveExecAuth\s*\(/g) ?? [];
  const guarded = source.match(/\bwithWrittenKey(?:UntilExit)?\(await resolveExecAuth\([^\n]*?\), \(auth\) => writePersonPin\(storageDir, (?:entity|details), auth\), /g) ?? [];

  assert.equal(resolves.length, 3, `the scan does not find the three resolves of the three roads: ${resolves.length}`);
  assert.equal(guarded.length, 3, 'QS: a road keeps the answer of the resolve under a name, or hands its guard another pin writer');
});
