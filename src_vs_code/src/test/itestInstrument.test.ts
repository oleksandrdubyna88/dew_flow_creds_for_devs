import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { after, test } from 'node:test';
import { cleanupScope, ownedDir } from '../../scripts/lib/leftovers.cjs';
import { discoverSources } from './tempSiteScan';

/**
 * G1, E3.S2: test 33 of `research/PLAN_person_roads_pin_host_key.md` §5, the launch instrument of the real `sshd` runs (decision 16).
 *
 * <p><b>What this holds.</b> Every script starts its `sshd` with the executable of ONE place, `scripts/lib/sshdRun.cjs`, and every sshd
 * config of the real runs is written there: the one-connection config of `startSshd` and the config of the serving launcher. The
 * executable and the extra config lines are parameters of the run (`CREDS_ITEST_SSHD`, `CREDS_ITEST_SSHD_CONFIG`). With none, the
 * executable is `/usr/sbin/sshd` and both texts are, byte for byte, what the two starters wrote before E3.S2, so a run without
 * parameters (CI) starts what it started before. What a parameter DOES to a real `sshd` is not a unit test's to show: the story's own run
 * on an unpacked `sshd`, from a tree with no modified tracked file, shows it.</p>
 *
 * <p>The scan reads every script under `scripts/` whole, not line by line. It cannot pass by matching nothing: it must find the one
 * default, the two starts and the two config writers, each in the file where it belongs.</p>
 */

const SCRIPTS = path.join(__dirname, '..', '..', 'scripts');
/** The instrument's one place: the executable of the run and the text of every sshd config of the real runs. */
const INSTRUMENT = 'lib/sshdRun.cjs';
/** The two files that START an sshd: `startSshd` (`sshd -d`) and the serving launcher (`sshd -D -e`). */
const STARTERS = ['itestServing.cjs', 'itestSshd.cjs'];
/** A script of ANOTHER plan that writes an sshd config of its own, with that plan as the reason. None does (read on 65a8cb3b). */
const OWN_CONFIGS = new Map<string, string>();

/** A string or template literal that names a program by a path that ends with `/sshd`. */
const SSHD_PATH = /(['"`])[^'"`\n]*\/sshd\1/g;
/** A start whose program has `sshd` in its name, in any case: `launch(<scope>, <program>,`, `spawn(`, `execFile(` and their Sync forms. */
const SSHD_START = /\b(?:launch\s*\(\s*[^,()]+,|spawn(?:Sync)?\s*\(|execFile(?:Sync)?\s*\()\s*[\w$.'"`/]*sshd[\w$.'"`/]*\s*,/gi;
/** The opening of an sshd config line that names the server's own address or files: only a writer of an sshd config holds one. */
const CONFIG_LINE = /(['"`])(?:ListenAddress|HostKey|AuthorizedKeysFile|PidFile) /g;
/** A definition of `SSHD` or of `RUN`, with its value. */
const DEFINITION = /\bconst\s+(?:SSHD|RUN)\s*=\s*[^;\n]+;/g;
/** A starter builds its text from the one place, with the run's lines: `oneConnectionConfig(RUN,` or `servingConfig(RUN,`. */
const TEXT_OF_THE_RUN = /\b(?:oneConnectionConfig|servingConfig)\(RUN,/g;

interface Place {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

/** Every match of `pattern` (global) in every script under `scripts/`, read whole. */
function places(pattern: RegExp): Place[] {
  return discoverSources(SCRIPTS, new Map(), ['.cjs', '.mjs', '.js']).flatMap((file) => {
    const text = fs.readFileSync(path.join(SCRIPTS, file), 'utf8');
    return [...text.matchAll(pattern)].map((found) => ({ file, line: text.slice(0, found.index).split('\n').length, text: found[0] }));
  });
}

const named = (list: Place[]): string[] => list.map((one) => `${one.file} ${one.text}`);

test('[33a] one place names the sshd: the default path stands once, in lib/sshdRun.cjs; no other script holds the path of an sshd', () => {
  const found = places(SSHD_PATH);
  assert.deepEqual(named(found), [`${INSTRUMENT} '/usr/sbin/sshd'`], JSON.stringify(found));
});

test('[33b] an sshd is started in the two starters only, once in each, with the SSHD of the one place', () => {
  const starts = places(SSHD_START);
  assert.deepEqual(starts.map((one) => one.file).sort(), STARTERS, JSON.stringify(starts));
  assert.ok(starts.every((one) => /,\s*SSHD\s*,$/.test(one.text)), JSON.stringify(starts));
  assert.deepEqual(named(places(DEFINITION)), ['itestSshd.cjs const RUN = sshdRunOf(process.env);', 'itestSshd.cjs const SSHD = RUN.executable;']);
});

test('[33c] every sshd config of the real runs is written in the one place, and both starters take their text and the run\'s lines from it', () => {
  const lines = places(CONFIG_LINE);
  const outside = lines.filter((one) => one.file !== INSTRUMENT && !OWN_CONFIGS.has(one.file));
  assert.deepEqual(outside.map((one) => `${one.file}:${one.line}: ${one.text}`), []);
  // Alive: the one place writes BOTH texts, so it holds two `ListenAddress` lines.
  assert.equal(lines.filter((one) => one.file === INSTRUMENT && one.text.includes('ListenAddress')).length, 2, JSON.stringify(lines));
  assert.deepEqual(places(TEXT_OF_THE_RUN).map((one) => one.file).sort(), STARTERS);
  for (const [file, reason] of OWN_CONFIGS) {
    assert.ok(fs.existsSync(path.join(SCRIPTS, file)), `the exception ${file} names no file: remove it`);
    assert.ok(reason.split(/\s+/).length >= 3, `the exception ${file} needs its plan as the reason`);
  }
});

/* --- the one place, by what it answers (it is loaded at run time, so this file compiles before it exists) --- */

/** What `sshdRunOf` of `scripts/lib/sshdRun.cjs` answers. Written here: the module is CommonJS with no `.d.cts`; `exported` checks each name. */
interface SshdRun {
  readonly executable: string;
  readonly configFile: string | undefined;
  readonly lines: readonly string[];
}
type RunOf = (env: Readonly<Record<string, string | undefined>>) => SshdRun;
type OneConnection = (run: SshdRun, given: { address: string; port: number; first?: string[]; hostKeyPath: string; authorizedKeys: string; pidFile: string; extra?: string[] }) => string;
type Serving = (run: SshdRun, given: { port: number; hostKey: string; authorizedKeys: string; pidFile: string; penalties: boolean; extra?: string[] }) => string;

const LIB = path.join(SCRIPTS, 'lib', 'sshdRun.cjs');

/** An export of the one place, checked at run time: the file exists and the name is a function. */
function exported<T>(name: string): T {
  assert.ok(fs.existsSync(LIB), `${LIB} does not exist`);
  const value: unknown = createRequire(__filename)(LIB)[name];
  assert.equal(typeof value, 'function', `${name} is not a function of ${INSTRUMENT}`);
  return value as T;
}

const scope = cleanupScope();
after(() => scope.close());

/** What `startSshd` wrote before E3.S2 (`scripts/itestSshd.cjs:102-117` on 65a8cb3b), for the values of `ONE`. */
const oneBefore = (first: string[], extra: string[]): string[] => [
  'ListenAddress 127.0.0.2:40022', ...first, 'HostKey /o/host_key', 'AuthorizedKeysFile /o/authorized_keys', 'PidFile /o/sshd.pid',
  'UsePAM no', 'StrictModes no', 'PasswordAuthentication no', 'KbdInteractiveAuthentication no', ...extra, '',
];
const ONE = { address: '127.0.0.2', port: 40022, hostKeyPath: '/o/host_key', authorizedKeys: '/o/authorized_keys', pidFile: '/o/sshd.pid' };
/** What `servingConfig` wrote before E3.S2 (`scripts/itestPinnedRoads.cjs:68-84` on 65a8cb3b), for the values of `SERVING`. */
const servingBefore = (penalties: boolean): string[] => [
  'ListenAddress 127.0.0.1:40023', 'HostKey /o/k1_key', 'AuthorizedKeysFile /o/authorized_keys', 'PidFile /o/k1/sshd.pid',
  'UsePAM no', 'StrictModes no', 'PasswordAuthentication no', 'KbdInteractiveAuthentication no', 'LogLevel VERBOSE', ...(penalties ? ['PerSourcePenalties no'] : []), '',
];
const SERVING = { port: 40023, hostKey: '/o/k1_key', authorizedKeys: '/o/authorized_keys', pidFile: '/o/k1/sshd.pid' };
const RSA = ['PubkeyAcceptedAlgorithms +ssh-rsa'];
const PASSWORDS = ['PasswordAuthentication yes', 'KbdInteractiveAuthentication no'];
const UNPACKED = ['SshdSessionPath /u/usr/lib/openssh/sshd-session', 'SshdAuthPath /u/usr/lib/openssh/sshd-auth'];

test('[33d] with no parameter the run is /usr/sbin/sshd with no extra line, and both texts are what the starters wrote before', () => {
  const runOf = exported<RunOf>('sshdRunOf');
  for (const env of [{}, { CREDS_ITEST_SSHD: '', CREDS_ITEST_SSHD_CONFIG: '' }]) {
    const run = runOf(env);
    assert.deepEqual({ ...run, lines: [...run.lines] }, { executable: '/usr/sbin/sshd', configFile: undefined, lines: [] });
    assert.ok(Object.isFrozen(run) && Object.isFrozen(run.lines), 'the run is never changed after it is read');
  }
  const run = runOf({});
  const one = exported<OneConnection>('oneConnectionConfig');
  assert.equal(one(run, ONE), oneBefore([], []).join('\n'));
  assert.equal(one(run, { ...ONE, first: PASSWORDS, extra: RSA }), oneBefore(PASSWORDS, RSA).join('\n'));
  const serving = exported<Serving>('servingConfig');
  assert.equal(serving(run, { ...SERVING, penalties: true }), servingBefore(true).join('\n'));
  assert.equal(serving(run, { ...SERVING, penalties: false }), servingBefore(false).join('\n'));
});

test('[33e] the lines of the run reach both texts, once each, after the starter\'s own lines and before the caller\'s', () => {
  const dir = ownedDir(scope, 'sshdrun');
  const file = path.join(dir, 'extra.conf');
  fs.writeFileSync(file, `# the unpacked sshd\n\n${UNPACKED.join('\n')}\n`);
  const run = exported<RunOf>('sshdRunOf')({ CREDS_ITEST_SSHD_CONFIG: file });
  assert.deepEqual([...run.lines], UNPACKED);
  assert.equal(run.configFile, file);
  const one = exported<OneConnection>('oneConnectionConfig')(run, { ...ONE, first: PASSWORDS, extra: RSA });
  assert.equal(one, oneBefore(PASSWORDS, [...UNPACKED, ...RSA]).join('\n'));
  const before = servingBefore(true);
  const serving = exported<Serving>('servingConfig')(run, { ...SERVING, penalties: true, extra: ['ForceCommand /o/forced'] });
  assert.equal(serving, [...before.slice(0, -1), ...UNPACKED, 'ForceCommand /o/forced', ''].join('\n'));
});

test('[33f] a parameter that cannot be used is refused, naming its variable, and an executable file is taken as it is named', () => {
  const runOf = exported<RunOf>('sshdRunOf');
  const dir = ownedDir(scope, 'sshdrun');
  const exe = path.join(dir, 'sshd-wrap.sh');
  fs.writeFileSync(exe, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  assert.equal(runOf({ CREDS_ITEST_SSHD: exe }).executable, exe);
  assert.throws(() => runOf({ CREDS_ITEST_SSHD: 'sshd-wrap.sh' }), /CREDS_ITEST_SSHD .*absolute/);
  assert.throws(() => runOf({ CREDS_ITEST_SSHD: path.join(dir, 'absent') }), /CREDS_ITEST_SSHD names .*absent/);
  assert.throws(() => runOf({ CREDS_ITEST_SSHD: dir }), /CREDS_ITEST_SSHD names /);
  assert.throws(() => runOf({ CREDS_ITEST_SSHD_CONFIG: 'extra.conf' }), /CREDS_ITEST_SSHD_CONFIG .*absolute/);
  assert.throws(() => runOf({ CREDS_ITEST_SSHD_CONFIG: path.join(dir, 'absent.conf') }), /CREDS_ITEST_SSHD_CONFIG names .*absent\.conf/);
  const match = path.join(dir, 'match.conf');
  fs.writeFileSync(match, `${UNPACKED[0]}\nMatch User someone\n  PermitTTY no\n`);
  assert.throws(() => runOf({ CREDS_ITEST_SSHD_CONFIG: match }), /CREDS_ITEST_SSHD_CONFIG: .*Match/);
});

test('[33g] a file that is not executable is refused as the sshd of a run', { skip: process.platform === 'win32' ? 'Windows has no execute bit' : false }, () => {
  const plain = path.join(ownedDir(scope, 'sshdrun'), 'not-executable');
  fs.writeFileSync(plain, '#!/bin/sh\n', { mode: 0o644 });
  const runOf = exported<RunOf>('sshdRunOf');
  assert.throws(() => runOf({ CREDS_ITEST_SSHD: plain }), /CREDS_ITEST_SSHD names .*not an executable file/);
});
