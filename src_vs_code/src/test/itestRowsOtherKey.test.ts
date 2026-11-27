import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { after, test } from 'node:test';
import { cleanupScope, ownedDir } from '../../scripts/lib/leftovers.cjs';
import { checkedPin, hostKeyWords, knownHostsLine, parseHostKey } from '../hostKeyPin';
import { NO_CONNECTION_SHARING } from '../sshExecCommand';

/**
 * G1, E3.S6 (`research/PLAN_person_roads_pin_host_key_E3_S6_spec.md`, §7): M2, M3 and M8 on the rig of E3.S4. OT1 holds the table of the seven legs, OT2 the handed config
 * of a leg (the other source goes IN PLACE of `/dev/null`), OT3 the words of the controls and the witnesses, OT4 the sessions of a log, OT5 the judge of the
 * four refused runs, OT6 the shim's file for an IGNORED stderr, OT7 the recording command of M8 and OT8 the line of a known-hosts file.
 *
 * <p>The libs and the scripts are read at run time (`createRequire`), so this file compiles before they exist. The product's functions are the real ones.</p>
 */

const SCRIPTS = path.join(__dirname, '..', '..', 'scripts');
const LIB = path.join(SCRIPTS, 'lib', 'otherKeyRecord.cjs');
const ROW_LIB = path.join(SCRIPTS, 'lib', 'rowRecord.cjs');
const PINNED = path.join(SCRIPTS, 'itestPinnedRoads.cjs');

const scope = cleanupScope();
after(() => scope.close());

/** An export of a script, checked at run time: the file exists and the name is there. */
function exportOf<T>(file: string, name: string, kind: 'function' | 'object' = 'function'): T {
  assert.ok(fs.existsSync(file), `${file} does not exist`);
  const value: unknown = createRequire(__filename)(file)[name];
  assert.equal(typeof value, kind, `${name} is not a ${kind} of ${path.relative(SCRIPTS, file)}`);
  return value as T;
}
const other = <T>(name: string, kind: 'function' | 'object' = 'function'): T => exportOf<T>(LIB, name, kind);

type Argv = readonly string[];
interface Leg {
  readonly name: string;
  readonly row: string;
  readonly scenario: string;
  readonly source: string;
  readonly pinnedTo: string;
  readonly roads: string;
  readonly stop: string | null;
}
interface Session {
  readonly kind: string;
  readonly port: number;
  readonly id: number;
}
interface Start {
  readonly pid: number;
  readonly kind: string;
  readonly connection: boolean;
}
interface Run {
  readonly kind: string;
  readonly exitCode: number | null;
  readonly stderr: string | null;
}
interface Counts {
  starts: { list: Start[] };
  runs: Run[];
  bridges: { exitCode: number | null }[];
}
interface Judged {
  readonly ok: boolean;
  readonly detail?: string;
}

const LINE = 'Host key verification failed.';

test('OT1: the table of the seven legs: four of M2, two of M3, one of M8, each once, with the pin, the source and the stop of its row', () => {
  const legs = other<readonly Leg[]>('OTHER_KEY_LEGS', 'object');
  const names = ['m2-mismatch-user', 'm2-mismatch-global', 'm2-switch-user', 'm2-switch-global', 'm3-mismatch', 'm3-switch', 'm8'];
  assert.deepEqual([...legs.map((one) => one.name)].sort(), [...names].sort());
  assert.equal(new Set(legs.map((one) => one.name)).size, 7, 'each name once');
  const byRow = (row: string): Leg[] => legs.filter((one) => one.row === row);
  assert.equal(byRow('M2').length, 4);
  assert.equal(byRow('M3').length, 2);
  assert.equal(byRow('M8').length, 1);
  for (const scenario of ['mismatch', 'switch']) {
    assert.deepEqual(byRow('M2').filter((one) => one.scenario === scenario).map((one) => one.source).sort(), ['global', 'user'], `M2 ${scenario}: each of user and global once`);
  }
  assert.deepEqual(legs.filter((one) => one.pinnedTo === 'K2').map((one) => one.name), ['m3-mismatch']);
  assert.deepEqual(byRow('M3').map((one) => one.source), ['master', 'master']);
  assert.equal(byRow('M8')[0].source, 'command');
  assert.deepEqual(legs.filter((one) => one.scenario === 'switch').map((one) => `${one.name}:${one.stop}`).sort(), ['m2-switch-global:whole', 'm2-switch-user:whole', 'm3-switch:listener']);
  assert.deepEqual(legs.filter((one) => one.scenario === 'switch').map((one) => one.roads), ['install', 'install', 'install']);
  assert.ok(Object.isFrozen(legs), 'the table is frozen');
});

/** What `ssh -G` printed for a config file, or `undefined` when there is no `ssh` here. */
function resolvedUnder(config: string): string[] | undefined {
  const answer = spawnSync('ssh', ['-G', '-F', config, '-p', '1', 'x'], { encoding: 'utf8', timeout: 15_000 }); // NOSONAR: the PATH's ssh is the subject
  return answer.error === undefined && answer.status === 0 ? answer.stdout.split('\n') : undefined;
}
const hasSsh = resolvedUnder('/dev/null') !== undefined;
type Handed = (dir: string, options?: { userKnownHosts?: string; globalKnownHosts?: string; lines?: readonly string[] }) => string;
const handed = (): Handed => createRequire(__filename)(ROW_LIB).handedClientConfig as Handed;
const count = (text: string, needle: string): number => text.split(needle).length - 1;

test('OT2: the handed config is still the five lines with no options; each other source goes IN PLACE of /dev/null, and the added lines stand inside the block after the five', () => {
  const handedClientConfig = handed();
  const five = 'Host *\n  UserKnownHostsFile /dev/null\n  GlobalKnownHostsFile /dev/null\n  IdentityFile /o/leg/no-default-identity\n  IdentityAgent none\n';
  assert.equal(handedClientConfig('/o/leg'), five);

  const user = handedClientConfig('/o/leg', { userKnownHosts: '/o/leg/hm/.ssh/known_hosts' });
  assert.equal(count(user, 'UserKnownHostsFile'), 1, 'ONE UserKnownHostsFile line');
  assert.ok(user.includes('\n  UserKnownHostsFile /o/leg/hm/.ssh/known_hosts\n'), 'with that value');
  assert.ok(user.includes('\n  GlobalKnownHostsFile /dev/null\n'), 'the other file stays /dev/null');
  assert.ok(!user.includes('UserKnownHostsFile /dev/null'), 'the first value wins, so /dev/null must not be there');

  const global = handedClientConfig('/o/leg', { globalKnownHosts: '/o/leg/known_hosts_global' });
  assert.equal(count(global, 'GlobalKnownHostsFile'), 1);
  assert.ok(global.includes('\n  GlobalKnownHostsFile /o/leg/known_hosts_global\n'));
  assert.ok(global.includes('\n  UserKnownHostsFile /dev/null\n'));

  const lines = handedClientConfig('/o/leg', { lines: ['ControlMaster auto', 'ControlPath /o/leg/cm'] });
  assert.ok(lines.startsWith(five.slice(0, five.length - 1)), 'the five lines first');
  assert.ok(lines.endsWith('\n  IdentityAgent none\n  ControlMaster auto\n  ControlPath /o/leg/cm\n'), 'the lines follow the five, inside the block');
  assert.equal(count(lines, 'Host '), 1, 'one block');
});

test('OT2b: the real client resolves each row of the table of the leg configs as the options say', { skip: !hasSsh }, () => {
  const handedClientConfig = handed();
  const rows: { what: string; options: Parameters<Handed>[1]; expected: string[] }[] = [
    { what: 'user', options: { userKnownHosts: '/o/leg/hm/.ssh/known_hosts' }, expected: ['userknownhostsfile /o/leg/hm/.ssh/known_hosts', 'globalknownhostsfile /dev/null'] },
    { what: 'global', options: { globalKnownHosts: '/o/leg/known_hosts_global' }, expected: ['userknownhostsfile /dev/null', 'globalknownhostsfile /o/leg/known_hosts_global'] },
    { what: 'master', options: { lines: ['ControlMaster auto', 'ControlPath /o/leg/cm', 'ControlPersist 120'] }, expected: ['userknownhostsfile /dev/null', 'globalknownhostsfile /dev/null', 'controlmaster auto', 'controlpath /o/leg/cm', 'controlpersist 120'] },
    { what: 'command', options: { lines: ['KnownHostsCommand /o/leg/khc/known_hosts_command', 'VerifyHostKeyDNS no'] }, expected: ['userknownhostsfile /dev/null', 'knownhostscommand /o/leg/khc/known_hosts_command', 'verifyhostkeydns false'] },
  ];
  for (const row of rows) {
    const dir = ownedDir(scope, `ot2b-${row.what}`);
    const file = path.join(dir, 'client_config');
    fs.writeFileSync(file, handedClientConfig('/o/leg', row.options));
    const lines = resolvedUnder(file) ?? [];
    for (const line of row.expected) {
      assert.ok(lines.includes(line), `${row.what}: ssh -G says "${line}": ${lines.filter((one) => /known|control|verify/.test(one)).join(' | ')}`);
    }
  }
});

test('OT3: the words of the controls and the witnesses are literal, and none is read from hostKeyWords', () => {
  const e1WordsFor = other<(file: string) => string[]>('e1WordsFor');
  const beforeE1WordsFor = other<(file: string) => string[]>('beforeE1WordsFor');
  const strictOnly = other<string[]>('STRICT_ONLY', 'object');
  const withFile = other<(words: Argv, file: string) => string[]>('withFile');
  const sharingWordsOf = other<(argv: Argv) => string[]>('sharingWordsOf');
  const g2 = other<string[]>('G2_WORDS', 'object');

  assert.deepEqual(e1WordsFor('/o/k'), ['-o', 'StrictHostKeyChecking=yes', '-o', 'UserKnownHostsFile=/o/k', '-o', 'GlobalKnownHostsFile=/o/k']);
  assert.deepEqual(beforeE1WordsFor('/o/k'), ['-o', 'StrictHostKeyChecking=yes', '-o', 'UserKnownHostsFile=/o/k']);
  assert.deepEqual(strictOnly, ['-o', 'StrictHostKeyChecking=yes']);
  assert.deepEqual(g2, ['ControlPath=none', 'ControlMaster=no'], 'G2\'s two options, literally');

  const checked = checkedPin('/o/keys/known_hosts-e1-x', { kind: 'knows', token: 'OpenSSH_10.2' });
  assert.ok(checked.ok, 'the fixture pin is checked');
  const words = hostKeyWords(checked.pin);
  assert.equal(words.length, 12, 'E1 and E2: six pairs');
  const moved = withFile(words, '/o/pins/k1');
  assert.equal(moved.length, 12);
  assert.deepEqual(moved.filter((word) => word.includes('KnownHostsFile=')), ['UserKnownHostsFile=/o/pins/k1', 'GlobalKnownHostsFile=/o/pins/k1']);
  assert.deepEqual(moved.filter((word) => !word.includes('KnownHostsFile=')), words.filter((word) => !word.includes('KnownHostsFile=')), 'every other word is the road\'s own');
  assert.deepEqual(withFile(['-o', 'StrictHostKeyChecking=yes', '-o', 'UserKnownHostsFile=/o/k'], '/o/pins/k1'), ['-o', 'StrictHostKeyChecking=yes', '-o', 'UserKnownHostsFile=/o/pins/k1'], 'the option that is there is replaced; a missing one is no exception');
  assert.deepEqual(withFile(['-oGlobalKnownHostsFile=/o/k', '-o', 'LogLevel=ERROR'], '/o/pins/k1'), ['-oGlobalKnownHostsFile=/o/pins/k1', '-o', 'LogLevel=ERROR'], 'the one-word spelling too');
  assert.throws(() => withFile(['-o', 'StrictHostKeyChecking=yes'], '/o/pins/k1'), /no UserKnownHostsFile/);

  assert.deepEqual(sharingWordsOf(NO_CONNECTION_SHARING), g2, 'the product\'s G2 options are the two words');
  assert.deepEqual(sharingWordsOf(words), [], 'the twelve words hold none');
  assert.deepEqual(sharingWordsOf(['-oControlPath=x', '-o', 'ControlMaster=auto', '-o', 'LogLevel=ERROR']), ['ControlPath=x', 'ControlMaster=auto']);
  assert.throws(() => e1WordsFor('/o/a file'), /white space|quote/);
  assert.throws(() => beforeE1WordsFor("/o/it's"), /white space|quote/);
});

/** The log lines of a command session (S4.F6): `port` is the client's. */
const session = (kind: string, port: number, id: number, user = 'someone'): string => `Starting session: ${kind} for ${user} from 127.0.0.1 port ${port} id ${id}`;

test('OT4: the sessions of a log are read apart from the accepted logins', () => {
  const sessionsOf = other<(log: string, user: string) => Session[]>('sessionsOf');
  const login = [
    'Connection from 127.0.0.1 port 41001 on 127.0.0.1 port 40022 rdomain ""',
    'Accepted publickey for someone from 127.0.0.1 port 41001 ssh2: ED25519 SHA256:abcdef',
    'User child is on pid 4711',
    session('command', 41001, 0),
    'Received disconnect from 127.0.0.1 port 41001:11: disconnected by user',
  ];
  assert.deepEqual(sessionsOf(`${login.join('\n')}\n`, 'someone'), [{ kind: 'command', port: 41001, id: 0 }]);
  const through = `${[...login, session('command', 41001, 1)].join('\n')}\n`;
  assert.deepEqual(sessionsOf(through, 'someone'), [{ kind: 'command', port: 41001, id: 0 }, { kind: 'command', port: 41001, id: 1 }], 'a session through a master adds no accepted line and is still counted');
  assert.deepEqual(sessionsOf(`${[session('forced-command', 41002, 0), session('subsystem', 41003, 0), session('shell', 41004, 0)].join('\n')}\n`, 'someone').map((one) => one.kind), ['forced-command', 'subsystem', 'shell']);
  assert.deepEqual(sessionsOf(`${session('command', 41005, 0, 'other')}\n`, 'someone'), [], 'another user\'s session is none of ours');
  assert.deepEqual(sessionsOf('Connection from 127.0.0.1 port 41006 on 127.0.0.1 port 40022 rdomain ""\n', 'someone'), []);
});

const kinds = ['probe', 'bridge', 'sweep', 'mode'];
/** The counts of four refused connection starts, each well-formed, with `change` applied. */
function refusedCounts(change: (counts: Counts) => void = () => undefined): Counts {
  const counts: Counts = {
    starts: { list: kinds.map((kind, at) => ({ pid: 100 + at, kind, connection: true })) },
    runs: ['probe', 'sweep', 'mode'].map((kind, at) => ({ kind, exitCode: 255, stderr: `${LINE}${at === 1 ? '\r' : ''}\n` })),
    bridges: [{ exitCode: 255 }],
  };
  change(counts);
  return counts;
}

test('OT5: the judge of the four refused runs reads the kinds, the exit codes, the lines and the bridge\'s own stderr; a value not read is a failure', () => {
  const refusedRoads = other<(counts: Counts, bridgeStderr: string | null) => Judged>('refusedRoads');
  assert.equal(refusedRoads(refusedCounts(), `${LINE}\n`).ok, true, 'four starts of the four kinds, each 255 with the line');
  assert.equal(refusedRoads(refusedCounts(), `${LINE}\r\n`).ok, true, 'a line that ends with CR LF is the line');
  const red = (what: string, judged: Judged): void => assert.equal(judged.ok, false, `${what} must turn it red`);
  red('a run with 0', refusedRoads(refusedCounts((counts) => { counts.runs[0] = { ...counts.runs[0], exitCode: 0 }; }), `${LINE}\n`));
  red('a run with 255 and no line', refusedRoads(refusedCounts((counts) => { counts.runs[2] = { ...counts.runs[2], stderr: 'Permission denied\n' }; }), `${LINE}\n`));
  red('the line inside a longer line', refusedRoads(refusedCounts((counts) => { counts.runs[1] = { ...counts.runs[1], stderr: `x ${LINE} y\n` }; }), `${LINE}\n`));
  red('a bridge stderr that was not read (null)', refusedRoads(refusedCounts(), null));
  red('a bridge stderr with no line', refusedRoads(refusedCounts(), 'ssh: connect failed\n'));
  red('a bridge that ended with 0', refusedRoads(refusedCounts((counts) => { counts.bridges[0] = { exitCode: 0 }; }), `${LINE}\n`));
  red('an install start in place of the mode check', refusedRoads(refusedCounts((counts) => { counts.starts.list[3] = { pid: 103, kind: 'install', connection: true }; }), `${LINE}\n`));
  red('three connection starts', refusedRoads(refusedCounts((counts) => { counts.starts.list.pop(); }), `${LINE}\n`));
  red('five connection starts', refusedRoads(refusedCounts((counts) => { counts.starts.list.push({ pid: 104, kind: 'probe', connection: true }); }), `${LINE}\n`));
  assert.equal(refusedRoads(refusedCounts((counts) => { counts.starts.list.push({ pid: 105, kind: 'question', connection: false }); }), `${LINE}\n`).ok, true, 'the question ssh -V is no connection start');
});

const SH = '/bin/sh';
/** A real `ssh`-like client for the shim: a script that writes the verification line on its stderr and ends with 255. */
function standInClient(dir: string): string {
  const file = path.join(dir, 'real-ssh');
  fs.writeFileSync(file, `#!/bin/sh\nprintf '%s\\n' '${LINE}' >&2\nexit 255\n`, { mode: 0o700 });
  return file;
}

interface Ended {
  readonly pid: number;
  readonly code: number | null;
  readonly piped: string;
}
/** The shim started with the given `stdio` of its stderr; resolves with its pid, its exit code and what the pipe got. */
function started(shim: string, stderr: 'ignore' | 'pipe'): Promise<Ended> {
  return new Promise((resolve, reject) => {
    const child = spawn(shim, ['-p', '1', '--', 'someone@127.0.0.1', 'true'], { stdio: ['ignore', 'ignore', stderr], env: { PATH: process.env.PATH } });
    let piped = '';
    child.stderr?.on('data', (chunk: Buffer) => { piped += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => resolve({ pid: child.pid ?? -1, code, piped }));
  });
}

test('OT6: the shim sends an IGNORED stderr to a file of the run and leaves a stderr that the product reads alone', async () => {
  const installShim = exportOf<(rig: object, real: string) => string | undefined>(PINNED, 'installShim');
  const dir = ownedDir(scope, 'ot6');
  const rig = { shimDir: path.join(dir, 'shim'), records: path.join(dir, 'records'), clientConfig: path.join(dir, 'client_config') };
  fs.mkdirSync(rig.shimDir);
  fs.mkdirSync(rig.records);
  fs.writeFileSync(rig.clientConfig, 'Host *\n');
  const real = standInClient(dir);
  const wrapped = installShim(rig, real);
  assert.ok(fs.existsSync(SH));
  const shim = path.join(rig.shimDir, 'ssh');

  const ignored = await started(shim, 'ignore');
  assert.equal(ignored.code, 255, 'the exit code is the client\'s');
  assert.ok(fs.existsSync(path.join(rig.records, `${ignored.pid}.argv`)), 'the start is recorded as before');
  const argv = fs.readFileSync(path.join(rig.records, `${ignored.pid}.argv`), 'utf8').split('\0').slice(0, -1);
  assert.deepEqual(argv.slice(3), ['-p', '1', '--', 'someone@127.0.0.1', 'true'], 'the argv is as before');
  const file = path.join(rig.records, `${ignored.pid}.stderr`);
  assert.ok(fs.existsSync(file), `no ${ignored.pid}.stderr file`);
  assert.equal(fs.readFileSync(file, 'utf8'), `${LINE}\n`);

  const piped = await started(shim, 'pipe');
  assert.equal(piped.code, 255);
  assert.equal(piped.piped, `${LINE}\n`, 'the pipe gets the line');
  assert.ok(fs.existsSync(path.join(rig.records, `${piped.pid}.argv`)));
  assert.ok(!fs.existsSync(path.join(rig.records, `${piped.pid}.stderr`)), 'a stderr that the product reads is never taken');
  assert.equal(wrapped, real, 'the shim wraps the client that it was given');
});

interface KhcStart {
  readonly pid: number;
  readonly ppid: number;
  readonly start: string;
  readonly argc: number;
  readonly argv: string[];
}

/** One start of the command with no argument: it ends with 0 and prints the line file's text. */
function startOnce(command: string, lineFile: string): void {
  const done = spawnSync(command, [], { encoding: 'utf8', timeout: 10_000 }); // NOSONAR: the script under test
  assert.equal(done.status, 0, done.stderr);
  assert.equal(done.stdout, fs.readFileSync(lineFile, 'utf8'));
}

/** A record of the command, read: a pid, a parent pid, a start time, argc 0 and no word. */
function assertStart(one: KhcStart): void {
  assert.ok(Number.isInteger(one.pid) && one.pid > 0, 'a pid');
  assert.ok(Number.isInteger(one.ppid) && one.ppid > 0, 'a parent pid');
  assert.ok(/^\d+$/.test(one.start), 'a start time');
  assert.equal(one.argc, 0);
  assert.deepEqual(one.argv, []);
}

test('OT7: the recording command prints the line file\'s text and leaves one record per start, which khcStarts reads', () => {
  const khcScript = other<(records: string, lineFile: string) => string>('khcScript');
  const khcStarts = other<(texts: readonly string[]) => KhcStart[]>('khcStarts');
  const dir = ownedDir(scope, 'ot7');
  const records = path.join(dir, 'records');
  fs.mkdirSync(records);
  const lineFile = path.join(dir, 'line');
  fs.writeFileSync(lineFile, '[127.0.0.1]:2222 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOnlyAThrowawayKeyForTheTestOnly\n');
  const command = path.join(dir, 'known_hosts_command');
  fs.writeFileSync(command, khcScript(records, lineFile), { mode: 0o700 });

  startOnce(command, lineFile);
  startOnce(command, lineFile);
  const files = fs.readdirSync(records).filter((name) => name.endsWith('.start'));
  assert.equal(files.length, 2, 'one record per start');
  const starts = khcStarts(files.map((name) => fs.readFileSync(path.join(records, name), 'utf8')));
  assert.equal(starts.length, 2);
  starts.forEach(assertStart);
  assert.notEqual(starts[0].pid, starts[1].pid);
});

test('OT8: the line of a known-hosts file is the first two fields of a .pub under the address, and it is the line the product forms', () => {
  const knownHostsLineOf = other<(port: number, pub: string) => string>('knownHostsLineOf');
  const body = 'AAAAC3NzaC1lZDI1NTE5AAAAIOnlyAThrowawayKeyForTheTestOnly0123456789ab';
  assert.equal(knownHostsLineOf(2222, `ssh-ed25519 ${body} comment`), `[127.0.0.1]:2222 ssh-ed25519 ${body}\n`);
  const key = parseHostKey(`ssh-ed25519 ${body} comment`);
  assert.ok(key, 'the product reads the test key');
  assert.equal(knownHostsLineOf(2222, `ssh-ed25519 ${body} comment`), knownHostsLine('127.0.0.1', 2222, key), 'the product pins the format; the lib does not read it');
  assert.throws(() => knownHostsLineOf(2222, 'ssh-ed25519'), /fields/);
});
