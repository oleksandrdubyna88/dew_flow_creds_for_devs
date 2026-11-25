import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { after, test } from 'node:test';
import { cleanupScope, ownedDir } from '../../scripts/lib/leftovers.cjs';
import { pinClientSentence } from '../hostKeyPin';
import { pinClientOf } from '../pinClient';
import * as pinnedArgv from './pinnedArgv';

/**
 * G1, E3.S9 (`todo/PLAN_person_roads_pin_host_key_E3_S9_spec.md`, §7): the pure rules of the rows that run off the rig (M10, M11, M13), in
 * `scripts/lib/offRigRecord.cjs`, and the three changes that E3.S9 makes to the rig's own lib (`DEBUG1` in the serving config, the counts of a
 * `DEBUG1` log, the host of a known-hosts line). TX1 to TX13. The libs are read at run time (`createRequire`), so this file compiles before they
 * exist. It is the rig's own test, not a test of the parent's section 5.
 */

const SCRIPTS = path.join(__dirname, '..', '..', 'scripts');
const OFF = path.join(SCRIPTS, 'lib', 'offRigRecord.cjs');
const scope = cleanupScope();
after(() => scope.close());

type Obj = Record<string, unknown>;
const require_ = createRequire(__filename);

/** A lib of the scripts, loaded at run time: a missing file is the failure of the test that asks for it. */
function lib(file: string): Obj {
  const full = path.join(SCRIPTS, 'lib', file);
  assert.ok(fs.existsSync(full), `${full} does not exist`);
  return require_(full) as Obj;
}

/** A function of the off-rig lib. */
function fn<T>(name: string): T {
  assert.ok(fs.existsSync(OFF), `${OFF} does not exist`);
  const value = (require_(OFF) as Obj)[name];
  assert.equal(typeof value, 'function', `${name} is not a function of scripts/lib/offRigRecord.cjs`);
  return value as T;
}

/** A value (not a function) of the off-rig lib. */
function value<T>(name: string): T {
  assert.ok(fs.existsSync(OFF), `${OFF} does not exist`);
  const found = (require_(OFF) as Obj)[name];
  assert.notEqual(found, undefined, `${name} is not exported by scripts/lib/offRigRecord.cjs`);
  return found as T;
}

interface Leg {
  readonly name: string;
  readonly parser: string | null;
}
type Question = { readonly startedAt: number; readonly ms: number };
type Call = { readonly from: number };
type Said = { readonly kind: string; readonly text: string; readonly at: number };

const M7 = (lib('pathRecord.cjs').M7_LEGS ?? []) as readonly { name: string; run: string }[];

/* TX1 */
test('TX1 the legs: M10 has one, M11 has the 29 of the story in their order, each with its parser; M13 has three cases', () => {
  assert.deepEqual(value<readonly string[]>('M10_LEGS'), ['m10']);
  const b = ['m11-m1', 'm11-m2-mismatch-global', ...M7.filter((one) => !one.run.startsWith('collision')).map((one) => `m11-${one.name}`)];
  assert.equal(b.length, 17, 'M1, M2 (b) the mismatch, and the 15 shape legs of M7');
  const names = [
    'm11-a-unknown', 'm11-a-ignored', ...b, 'm11-c-twin-k1', 'm11-c-twin-k2', 'm11-eq-older-k1', 'm11-eq-older-k2', 'm11-eq-newer-k1', 'm11-eq-newer-k2',
    'm11-c-install', 'm11-c-bridge', 'm11-d-install', 'm11-d-bridge',
  ];
  const legs = value<readonly Leg[]>('M11_LEGS');
  assert.equal(legs.length, 29);
  assert.deepEqual(legs.map((one) => one.name), names);
  assert.equal(new Set(names).size, 29);
  assert.ok(!names.some((name) => name.includes('collision')), 'no collision leg of M7 is an M11 leg');
  const parserOf = (name: string): string | null => (/^m11-[cd]-(install|bridge)$/.test(name) ? null : name.startsWith('m11-eq-newer') ? 'newer' : 'older');
  assert.deepEqual(legs.map((one) => one.parser), names.map(parserOf));
  const cases = value<readonly { letter: string; joiner: string }[]>('M13_CASES');
  assert.deepEqual(cases.map((one) => [one.letter, one.joiner]), [['a', ' '], ['b', "'"], ['c', " o'"]]);
});

/* TX2 */
test('TX2 questionsOk: an older client is asked once per pinned call, before its first run; a newer one once', () => {
  const questionsOk = fn<(parser: string, calls: readonly Call[], questions: readonly Question[]) => boolean>('questionsOk');
  const calls = [{ from: 100 }, { from: 300 }, { from: 500 }];
  const each = [{ startedAt: 10, ms: 20 }, { startedAt: 210, ms: 20 }, { startedAt: 410, ms: 20 }];
  assert.equal(questionsOk('older', calls, each), true);
  assert.equal(questionsOk('older', calls, [each[0]]), false, 'one question and three calls');
  assert.equal(questionsOk('older', [calls[0]], [each[0], { startedAt: 30, ms: 10 }]), false, 'two questions before one call');
  assert.equal(questionsOk('older', calls, [each[0], each[1], { startedAt: 490, ms: 20 }]), false, 'a question that ended after its call\'s first run');
  assert.equal(questionsOk('older', [], []), false, 'an empty list');
  assert.equal(questionsOk('older', calls, [...each, { startedAt: 600, ms: 5 }]), false, 'a question after the last call');
  assert.equal(questionsOk('newer', calls, [each[0]]), true);
  assert.equal(questionsOk('newer', calls, each), false, 'three questions for a client that is kept');
  assert.equal(questionsOk('newer', calls, []), false);
});

/* TX3 */
test('TX3 wordsOk: five pairs for an older client, six for a newer one', () => {
  const wordsOk = fn<(parser: string, argv: readonly string[]) => boolean>('wordsOk');
  const five = ['-o', 'StrictHostKeyChecking=yes', '-o', 'UserKnownHostsFile=/k/f', '-o', 'GlobalKnownHostsFile=/k/f', '-o', 'VerifyHostKeyDNS=no', '-o', 'LogLevel=ERROR'];
  const tail = ['-i', '/k/key', '--', 'user@host', 'true'];
  const six = [...five, '-o', 'KnownHostsCommand=none'];
  assert.equal(wordsOk('older', [...five, ...tail]), true);
  assert.equal(wordsOk('older', [...six, ...tail]), false, 'KnownHostsCommand=none');
  assert.equal(wordsOk('older', [...five.slice(0, 8), ...tail]), false, 'no LogLevel=ERROR');
  assert.equal(wordsOk('older', [...five, '-o', 'VerifyHostKeyDNS=no', ...tail]), false, 'VerifyHostKeyDNS=no twice');
  assert.equal(wordsOk('older', [...five.slice(0, 5), '-o', 'GlobalKnownHostsFile=/k/g', ...five.slice(6), ...tail]), false, 'two known-hosts paths');
  assert.equal(wordsOk('older', ['-o', 'StrictHostKeyChecking=yes', '-o', 'UserKnownHostsFile="/k/a b"', '-o', 'GlobalKnownHostsFile="/k/a b"', ...five.slice(6), ...tail]), true, 'a path in double quotes is one path');
  assert.equal(wordsOk('newer', [...six, ...tail]), true);
  assert.equal(wordsOk('newer', [...five, ...tail]), false, 'no KnownHostsCommand=none');
});

/* TX4 */
const RECORD_LINE = String.raw`{ printf '%s\0' "$$" "$(cut -d' ' -f22 /proc/$$/stat)" "$#"; printf '%s\0' "$@"; } > '/r/x'/"$$".argv || exit 97`;
const HARD_PASSTHROUGH = "/a b/it's/ssh";
const QUOTED_EXEC = String.raw`exec '/a b/it'\''s/ssh' "$@"`;

/** Both programs record as the shim does and exec their passthrough, shell-quoted, for any other argv. */
function sameShape(text: string): void {
  assert.ok(text.startsWith('#!/bin/sh\n'));
  assert.ok(text.split('\n').includes(RECORD_LINE), 'the record line is the shim\'s');
  assert.ok(text.split('\n').some((line) => line.trim() === QUOTED_EXEC), 'the other branch execs the passthrough, shell-quoted');
}

/** The real program: -V alone (after the shim's -F <config>) records and answers; another argv is passed on. */
function runsAsSaid(answersAtOnce: (records: string, passthrough: string) => string, literal: string): void {
  const dir = ownedDir(scope, 'tx4');
  const records = path.join(dir, 'records');
  const other = path.join(dir, 'other');
  fs.mkdirSync(records);
  fs.writeFileSync(other, '#!/bin/sh\necho "passed: $*" >&2\nexit 7\n', { mode: 0o700 });
  const program = path.join(dir, 'ssh');
  fs.writeFileSync(program, answersAtOnce(records, other), { mode: 0o700 });
  const asked = spawnSync('sh', [program, '-F', '/c', '-V'], { encoding: 'utf8', timeout: 10_000 }); // NOSONAR: the program under test
  assert.equal(asked.status, 0);
  assert.equal(asked.stderr.trim(), literal);
  const passed = spawnSync('sh', [program, '-F', '/c', '-o', 'x', '--', 'u@h', 'true'], { encoding: 'utf8', timeout: 10_000 }); // NOSONAR: the program under test
  assert.equal(passed.status, 7);
  assert.equal(passed.stderr.trim(), 'passed: -F /c -o x -- u@h true');
  assert.equal(fs.readdirSync(records).filter((name) => name.endsWith('.argv')).length, 2, 'each start left one record');
}

test('TX4 the two programs: they record their start as the shim does, answer -V or never, and pass the rest on', () => {
  const answersAtOnce = fn<(records: string, passthrough: string) => string>('answersAtOnce');
  const neverAnswers = fn<(records: string, passthrough: string) => string>('neverAnswers');
  const literal = value<string>('NOT_A_VERSION');
  assert.equal(literal, 'not a version: OpenSSH_10.2p1');
  const once = answersAtOnce('/r/x', HARD_PASSTHROUGH);
  const never = neverAnswers('/r/x', HARD_PASSTHROUGH);
  sameShape(once);
  sameShape(never);
  assert.ok(once.includes(literal) && once.includes('exit 0') && !once.includes('sleep'));
  assert.ok(never.includes('exec sleep infinity') && !never.includes(literal));
  // the product reads the answer of (c) as a version that cannot be read, with the exit code 0 (sentence F says it)
  assert.deepEqual(pinClientOf(0, `${literal}\n`), { kind: 'unreadable', exitCode: 0 });
  runsAsSaid(answersAtOnce, literal);
});

/* TX5 */
test('TX5 sentence F: its pinned words, its two forms, and toldF', () => {
  const words = value<string>('F_WORDS');
  const how = value<{ none: string; code: (code: number) => string }>('F_HOW');
  assert.ok(pinClientSentence('box', null).includes(words) && pinClientSentence('box', 0).includes(words));
  assert.ok(pinClientSentence('box', null).includes(`(${how.none})`));
  assert.ok(pinClientSentence('box', 0).includes(`(${how.code(0)})`));
  assert.equal(how.none, 'it did not start, or did not end in time');
  const toldF = fn<(said: readonly Said[], from: number, prefix: string, sentence: string) => number>('toldF');
  const prefix = 'Cannot reach "box": ';
  const sentence = pinClientSentence('box', 0);
  const said: Said[] = [
    { kind: 'error', text: `${prefix}${sentence}`, at: 1 },
    { kind: 'log', text: `${prefix}${sentence}`, at: 2 },
    { kind: 'warning', text: `${prefix}${sentence}`, at: 3 },
    { kind: 'error', text: `Cannot bridge to "box": ${sentence}`, at: 4 },
    { kind: 'error', text: `${prefix}${sentence}`, at: 5 },
  ];
  assert.equal(toldF(said, 0, prefix, sentence), 2);
  assert.equal(toldF(said, 1, prefix, sentence), 1, 'only from the index on');
  assert.equal(toldF(said, 0, prefix, pinClientSentence('box', null)), 0, 'another form of the sentence');
});

/* TX6 */
test('TX6 timesOk: each time between 10 s and 15 s from the command, the program gone no later than 5 s after sentence F', () => {
  const timesOk = fn<(times: { t0: number; tF: number | null; tGone: number | null }) => { window: boolean; gone: boolean; ok: boolean }>('timesOk');
  assert.equal(timesOk({ t0: 0, tF: 10_000, tGone: 10_040 }).ok, true);
  assert.equal(timesOk({ t0: 5, tF: 10_005, tGone: 10_045 }).ok, true);
  assert.equal(timesOk({ t0: 0, tF: 9_990, tGone: 10_040 }).window, false);
  assert.equal(timesOk({ t0: 0, tF: 15_010, tGone: 15_020 }).window, false);
  assert.equal(timesOk({ t0: 0, tF: 10_000, tGone: 15_010 }).gone, false);
  assert.equal(timesOk({ t0: 0, tF: 12_000, tGone: 11_990 }).gone, true, 'gone before F');
  for (const nulled of [{ t0: 0, tF: null, tGone: 10_040 }, { t0: 0, tF: 10_000, tGone: null }]) {
    assert.equal(timesOk(nulled).ok, false);
  }
});

/* TX7 */
test('TX7 the reader of -G, the control of K7, the UNC words, and the version in an sshd log', () => {
  const resolvedOf = fn<(stdout: string) => { user: readonly string[]; global: readonly string[] }>('resolvedOf');
  const out = 'host x\r\nuserknownhostsfile /k/data prod/keys/f\r\nglobalknownhostsfile /k/data prod/keys/f\r\nloglevel ERROR\r\n';
  assert.deepEqual(resolvedOf(out), { user: ['/k/data', 'prod/keys/f'], global: ['/k/data', 'prod/keys/f'] });
  assert.deepEqual(resolvedOf('userknownhostsfile /k/f\n'), { user: ['/k/f'], global: [] });
  const oneIntended = fn<(resolved: { user: readonly string[]; global: readonly string[] }, file: string) => boolean>('oneIntended');
  assert.equal(oneIntended({ user: ['/k/f'], global: ['/k/f'] }, '/k/f'), true);
  assert.equal(oneIntended({ user: ['/k/f', 'x'], global: ['/k/f'] }, '/k/f'), false);
  assert.equal(oneIntended({ user: ['/k/g'], global: ['/k/f'] }, '/k/f'), false);
  assert.equal(oneIntended({ user: [], global: [] }, '/k/f'), false);
  const k7Twin = fn<(user: string) => string>('k7Twin');
  assert.equal(k7Twin('pin probe'), 'pin ~probe');
  assert.equal(k7Twin("pin o'probe"), "pin ~o'probe");
  assert.throws(() => k7Twin('nospace'));
  const unc = value<{ storage: string; resolved: string }>('UNC_WORDS');
  assert.equal(unc.storage, String.raw`\\server.example\share\creds`);
  assert.equal(unc.resolved, String.raw`\server.example\share\creds`);
  const versionSeen = fn<(log: string, version: string) => boolean>('versionSeen');
  const line = 'debug1: Remote protocol version 2.0, remote software version OpenSSH_8.4p1 Debian-5+deb11u3';
  assert.equal(versionSeen(line, 'OpenSSH_8.4p1'), true);
  assert.equal(versionSeen('debug1: Remote protocol version 2.0, remote software version OpenSSH_10.2', 'OpenSSH_8.4p1'), false);
  assert.equal(versionSeen('debug1: Remote protocol version 2.0, remote software version OpenSSH_8.4p10', 'OpenSSH_8.4p1'), false, 'another version that starts alike');
  assert.equal(versionSeen('OpenSSH_8.4p1 is only named', 'OpenSSH_8.4p1'), false);
});

/* TX8 */
test('TX8 logCounts reads the same lines of a DEBUG1 log as of a VERBOSE one', () => {
  const logCounts = lib('rowRecord.cjs').logCounts as (log: string, user: string) => Obj;
  const verbose = [
    'Connection from 127.0.0.1 port 41000 on 127.0.0.1 port 40022 rdomain ""',
    'Accepted publickey for someone from 127.0.0.1 port 41000 ssh2: ED25519 SHA256:abc',
    'Starting session: command for someone from 127.0.0.1 port 41000 id 0',
  ];
  const noisy = [
    verbose[0],
    'debug1: Remote protocol version 2.0, remote software version OpenSSH_8.4p1 Debian-5',
    'debug1: Failed to authenticate with the key: authenticating user someone',
    'debug2: Failed publickey for someone',
    'debug3: Postponed publickey for someone from 127.0.0.1 port 41000',
    verbose[1],
    'debug1: Starting session: command for someone from 127.0.0.1 port 41999 id 7',
    verbose[2],
  ];
  assert.deepEqual(logCounts(`${noisy.join('\n')}\n`, 'someone'), logCounts(`${verbose.join('\n')}\n`, 'someone'));
  assert.equal((logCounts(`${noisy[2]}\n`, 'someone') as { authAttempts: number }).authAttempts, 0, 'a debug1 line is not an attempt');
  assert.equal((logCounts('Failed publickey for someone from 127.0.0.1 port 5 ssh2\n', 'someone') as { authAttempts: number }).authAttempts, 1, 'a line without the prefix still counts');
});

/* TX9 */
test('TX9 servingConfig: no option is the text of before; DEBUG1 changes the one LogLevel line; anything else throws', () => {
  const servingConfig = lib('sshdRun.cjs').servingConfig as (run: unknown, parts: Obj) => string;
  const run = { lines: ['SshdSessionPath /x/s', 'Subsystem none'] };
  const parts = { port: 40022, hostKey: '/k/host', authorizedKeys: '/k/auth', pidFile: '/k/pid', penalties: true, extra: ['ForceCommand true'] };
  const before = [
    'ListenAddress 127.0.0.1:40022', 'HostKey /k/host', 'AuthorizedKeysFile /k/auth', 'PidFile /k/pid', 'UsePAM no', 'StrictModes no', 'PasswordAuthentication no', 'KbdInteractiveAuthentication no',
    // `Connection from …` is a VERBOSE line: it is how K2's log shows that leg 2 reached it (T37). `Accepted publickey` is there at any level.
    'LogLevel VERBOSE',
    'PerSourcePenalties no', 'SshdSessionPath /x/s', 'Subsystem none', 'ForceCommand true', '',
  ];
  assert.equal(servingConfig(run, parts), before.join('\n'));
  assert.equal(servingConfig(run, { ...parts, logLevel: 'VERBOSE' }), before.join('\n'));
  const debug = servingConfig(run, { ...parts, logLevel: 'DEBUG1' });
  assert.equal(debug, before.map((line) => (line === 'LogLevel VERBOSE' ? 'LogLevel DEBUG1' : line)).join('\n'));
  assert.equal(debug.split('\n').filter((line) => line.startsWith('LogLevel')).length, 1);
  assert.throws(() => servingConfig(run, { ...parts, logLevel: 'TRACE' }), /logLevel/i);
});

/* TX10 */
test('TX10 knownHostsLineOf: for 127.0.0.1 as before, for another host with its name', () => {
  const knownHostsLineOf = lib('otherKeyRecord.cjs').knownHostsLineOf as (port: number, pub: string, host?: string) => string;
  const pub = 'ssh-ed25519 AAAAC3Nza comment\n';
  assert.equal(knownHostsLineOf(40022, pub), '[127.0.0.1]:40022 ssh-ed25519 AAAAC3Nza\n');
  assert.equal(knownHostsLineOf(40022, pub, '127.0.0.1'), '[127.0.0.1]:40022 ssh-ed25519 AAAAC3Nza\n');
  assert.equal(knownHostsLineOf(40022, pub, 'k2.e3-probe.test'), '[k2.e3-probe.test]:40022 ssh-ed25519 AAAAC3Nza\n');
});

/* TX11 */
test('TX11 parserOf: the boundary is 8.7, and it is the same in the tests of test 34 (one boundary in two places)', () => {
  const parserOf = fn<(version: readonly number[] | undefined) => string | null>('parserOf');
  assert.equal(parserOf([8, 4]), 'older');
  assert.equal(parserOf([8, 6]), 'older');
  assert.equal(parserOf([8, 7]), 'newer');
  assert.equal(parserOf([10, 2]), 'newer');
  assert.equal(parserOf(undefined), null);
  assert.deepEqual([...value<readonly number[]>('PARSER_SINCE')], [8, 7]);
  const since = (pinnedArgv as unknown as Record<string, unknown>).TOKENISER_SINCE;
  assert.deepEqual([...(since as readonly number[])], [...value<readonly number[]>('PARSER_SINCE')], 'TOKENISER_SINCE of pinnedArgv.ts');
});

/* TX12 */
test('TX12 BARE is the table of the story by parser, and no function of the lib takes an outcome to choose a parser', () => {
  const bare = value<{ older: Obj; newer: Obj }>('BARE');
  assert.deepEqual(bare, { older: { pair: 'itself', equals: 'split' }, newer: { pair: 'stripped', equals: 'itself' } });
  assert.ok(Object.isFrozen(bare) && Object.isFrozen(bare.older) && Object.isFrozen(bare.newer));
  const collisionOf = fn<(parser: string, kind: string) => boolean>('collisionOf');
  const cells = [['older', 'pair'], ['older', 'equals'], ['newer', 'pair'], ['newer', 'equals']] as const;
  assert.deepEqual(cells.map(([parser, kind]) => collisionOf(parser, kind)), [false, true, true, false]);
  const exported = Object.keys(require_(OFF) as Obj).sort();
  assert.deepEqual(exported, [
    'BARE', 'EXPECT', 'F_HOW', 'F_WORDS', 'M10_LEGS', 'M11_LEGS', 'M13_CASES', 'NOT_A_VERSION', 'PARSER_SINCE', 'UNC_WORDS', 'answersAtOnce', 'collisionOf', 'k7Twin', 'neverAnswers',
    'oneIntended', 'parserOf', 'questionsOk', 'resolvedOf', 'splitAtEquals', 'timesOk', 'toldF', 'twinOfEquals', 'versionSeen', 'wordsOk',
  ], 'the exports: none of them reads an outcome to choose a parser');
  const expect = value<{ older: Obj; newer: Obj }>('EXPECT');
  assert.deepEqual(expect.older, { parser: 'older', starts: 8, questions: 3 });
  assert.deepEqual(expect.newer, { parser: 'newer', starts: 6, questions: 1 });
});

/* TX13 */
test('TX13 splitAtEquals and the twin of the equals-sign legs; resolvedBare answers as before', () => {
  const split = fn<(file: string) => readonly string[]>('splitAtEquals');
  assert.deepEqual(split('/a/b/data=prod/keys/k'), ['/a/b/data', 'prod/keys/k']);
  for (const bad of ['/a/b/data', '/a/b=c/d=e', '/a/b c=d/k', '/a/b\td=e/k']) {
    assert.throws(() => split(bad), Error, bad);
  }
  assert.equal(fn<(file: string) => string>('twinOfEquals')('/a/b/data=prod/control/known_hosts-control'), '/a/b/data');
  const resolvedBare = lib('pathRecord.cjs').resolvedBare as (file: string) => string;
  assert.equal(resolvedBare("/a/x'y'z/kh"), '/a/xyz/kh');
});
