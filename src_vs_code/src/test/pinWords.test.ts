import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { TestContext, test } from 'node:test';
import { ownedFile } from '../../scripts/lib/leftovers.cjs';
import { unsafeBridgedFileValue } from '../bridgedSshConfig';
import * as hostKeyPin from '../hostKeyPin';
import { buildBridgeArgv } from '../sshBridge';
import { SshExecAuth, buildSshExecArgv } from '../sshExecCommand';
import type { EntityMetadata } from '../types';
import { discoverSources } from './tempSiteScan';
import { fakePath } from './fakePaths';
import { PIN_SOURCE_OPTIONS, hostKeyWordsOf, sourceWordsOf, testPin, valuesOf, withoutGlobal, withoutSources } from './pinnedArgv';

/**
 * G1, E2.S2: the complete words of one pinned call, and the rule of the path that stands before them (the plan's §3.10, §3.11, §3.12
 * part 1; its tests 17, 18, 20, 21 and 23). The three file options of E1 are `hostKeyWords.test.ts`.
 *
 * <p>Part 1 says what is SENT. Part 2 asks the PATH's `ssh -G` what a client resolves from it: `-G` connects to nothing, and that a
 * host with another key is then refused is not shown by any test here (the plan's E3). Part 3 is the rule of the path. Part 4 is the
 * scan that stays.</p>
 *
 * <p>The new exports are read through the module object, and a pin goes through `testPin`, so this file compiles before they exist:
 * a missing export is a failed assertion.</p>
 */

const PIN = fakePath('keys/4242/known_hosts-e1-0b6f3c1e');
const KEY = fakePath('k.key');
const HOST: EntityMetadata = { id: 'e1', name: 'build box', host: 'build.example.com', user: 'dev', isSshEnabled: true };
/** The destination word of `HOST`, and a jump host: put together here, so no line of this file reads as an address of a person. */
const TARGET = [HOST.user, HOST.host].join('@');
const JUMP = ['hop', 'jump.example.com'].join('@');
const BUSY: EntityMetadata = { ...HOST, port: 2222, agentForward: true, portForwards: [{ kind: 'local', bindPort: 8080, host: 'localhost', hostPort: 80 }] };

type Client = 'knows' | 'older';
type Argv = string[];

const exec = (pin: string | undefined, client: Client, auth: SshExecAuth, entity: EntityMetadata, options: Record<string, unknown>): Argv =>
  buildSshExecArgv(entity, KEY, 'id', auth, { ...options, knownHostsFile: testPin(pin, client) }) ?? [];

const run = (pin: string | undefined, client: Client): Argv => exec(pin, client, 'key', HOST, {});

const tunnel = (pin: string | undefined, client: Client, auth: SshExecAuth = 'key', extra: readonly string[] = []): Argv =>
  buildBridgeArgv(HOST, { port: 51234, remote: { path: '/tmp/creds-dev-abc.sock' }, auth, extra, keyPath: KEY, knownHostsFile: testPin(pin, client) }, () => true) ?? [];

/** Every kind of argv that carries the words of a pinned call off a bridge. */
const everyKind = (pin: string | undefined, client: Client): readonly (readonly [string, Argv])[] => [
  ['the tunnel of a bridge, a key', tunnel(pin, client)],
  ['the tunnel of a bridge, a password', tunnel(pin, client, 'askpass')],
  ['a run off a bridge, a key', run(pin, client)],
  ['a run off a bridge, a password', exec(pin, client, 'askpass', HOST, {})],
  ['a run off a bridge: a jump host, no pty, the agent taken away, a forward, a port', exec(pin, client, 'key', BUSY, { jump: JUMP, noTty: true, ownAgent: false })],
];

const FILES = (word: string): string[] => ['-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${word}`, '-o', `GlobalKnownHostsFile=${word}`];
const KNOWS_WORDS = (word: string): string[] => [...FILES(word), '-o', 'VerifyHostKeyDNS=no', '-o', 'KnownHostsCommand=none', '-o', 'LogLevel=ERROR'];
const OLDER_WORDS = (word: string): string[] => [...FILES(word), '-o', 'VerifyHostKeyDNS=no', '-o', 'LogLevel=ERROR'];
const UNPINNED = ['-o', 'StrictHostKeyChecking=accept-new'];

/** An export of `hostKeyPin.ts`, read through the module object: its absence is a failed assertion, not a compile error. */
function exported<T>(name: string): T {
  const found = (hostKeyPin as Record<string, unknown>)[name];
  assert.notEqual(found, undefined, `hostKeyPin.ts exports no ${name}`);
  return found as T;
}

/* --- part 1: what is sent (test 17) --- */

test('W1: for a client that knows the option, a pinned argv says the six pairs side by side, in this order, and no other word names one of the six options', () => {
  for (const [name, argv] of everyKind(PIN, 'knows')) {
    const at = argv.indexOf('StrictHostKeyChecking=yes') - 1;
    assert.deepEqual(argv.slice(at, at + 12), KNOWS_WORDS(PIN), `${name}: the six pairs do not stand side by side`);
    assert.deepEqual([...hostKeyWordsOf(argv), ...sourceWordsOf(argv)], KNOWS_WORDS(PIN), name);
  }
});

test('W2: for a client below 8.5 the same without the KnownHostsCommand pair: no word of the argv names that option', () => {
  for (const [name, argv] of everyKind(PIN, 'older')) {
    const at = argv.indexOf('StrictHostKeyChecking=yes') - 1;
    assert.deepEqual(argv.slice(at, at + 10), OLDER_WORDS(PIN), `${name}: the five pairs do not stand side by side`);
    assert.deepEqual(valuesOf(argv, 'KnownHostsCommand'), [], `${name}: an older client ends at this word`);
    assert.deepEqual(valuesOf(argv, 'VerifyHostKeyDNS'), ['no'], name);
    assert.deepEqual(valuesOf(argv, 'LogLevel'), ['ERROR'], name);
  }
});

test('W3: an unpinned argv is today\'s, byte for byte: accept-new, and no word of the three new options', () => {
  for (const [name, argv] of everyKind(undefined, 'knows')) {
    assert.deepEqual(hostKeyWordsOf(argv), UNPINNED, name);
    assert.deepEqual(sourceWordsOf(argv), [], name);
  }
  assert.deepEqual(run(undefined, 'knows'), ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=10', '-o', 'ControlPath=none', '-o', 'ControlMaster=no', '-i', KEY, '--', TARGET, 'id']);
  assert.deepEqual(tunnel(undefined, 'knows'), [
    '-o', 'BatchMode=yes', '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=3', '-o', 'ExitOnForwardFailure=yes', '-o', 'ConnectTimeout=10',
    '-o', 'ControlPath=none', '-o', 'ControlMaster=no', '-o', 'StrictHostKeyChecking=accept-new', '-N', '-R', '/tmp/creds-dev-abc.sock:127.0.0.1:51234', '-i', KEY, '--', TARGET,
  ]);
});

test('W4: a pinned argv with the three new pairs and the third file option taken out is the argv of before G1, so nothing else moved', () => {
  for (const client of ['knows', 'older'] as const) {
    assert.deepEqual(withoutSources(withoutGlobal(run(PIN, client))), [
      '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${PIN}`, '-o', 'ConnectTimeout=10',
      '-o', 'ControlPath=none', '-o', 'ControlMaster=no', '-i', KEY, '--', TARGET, 'id',
    ]);
  }
});

/** What a caller could put into `extra` to turn the three back on. `ssh` takes the FIRST value of an option, and the builder's stand first. */
const HOSTILE_EXTRA = ['-o', 'VerifyHostKeyDNS=yes', '-o', 'KnownHostsCommand=/bin/echo x', '-o', 'LogLevel=QUIET'];

test('W5: the new pairs stand before every word that the entry or a caller adds, and a caller\'s own words for the three options come second', () => {
  const later = ['-J', '-A', '-L', '-N', '-R', '-i', '-p', '--'];
  for (const [name, argv] of everyKind(PIN, 'knows')) {
    const last = argv.lastIndexOf('LogLevel=ERROR');
    const first = Math.min(...later.map((word) => argv.indexOf(word)).filter((at) => at >= 0));
    assert.ok(last >= 0 && last < first, `${name}: a word of the entry stands before the last pair`);
  }
  const hostile = tunnel(PIN, 'knows', 'key', HOSTILE_EXTRA);
  assert.deepEqual(valuesOf(hostile, 'VerifyHostKeyDNS'), ['no', 'yes']);
  assert.deepEqual(valuesOf(hostile, 'KnownHostsCommand'), ['none', '/bin/echo x']);
  assert.deepEqual(valuesOf(hostile, 'LogLevel'), ['ERROR', 'QUIET']);
});

test('W6: one function writes them, and both builders say exactly what it answers for each client', () => {
  const hostKeyWords = exported<(pin: unknown) => string[]>('hostKeyWords');
  assert.deepEqual(hostKeyWords(undefined), UNPINNED);
  assert.deepEqual(hostKeyWords(testPin(PIN, 'knows')), KNOWS_WORDS(PIN));
  assert.deepEqual(hostKeyWords(testPin(PIN, 'older')), OLDER_WORDS(PIN));
  for (const client of ['knows', 'older'] as const) {
    for (const [name, argv] of everyKind(PIN, client)) {
      assert.deepEqual([...hostKeyWordsOf(argv), ...sourceWordsOf(argv)], hostKeyWords(testPin(PIN, client)), `${name}, ${client}`);
    }
  }
  assert.deepEqual([...PIN_SOURCE_OPTIONS], ['VerifyHostKeyDNS', 'KnownHostsCommand', 'LogLevel']);
});

/* --- part 2: what the real client resolves (tests 18 and 21) --- */

const ssh = (args: readonly string[]) => spawnSync('ssh', [...args], { encoding: 'utf8', timeout: 15_000 }); // NOSONAR: the PATH's ssh is the subject
const HAS_SSH = ssh(['-V']).error === undefined;
/** Skipped only where there is no `ssh` and no CI: under `CI=true` a missing client fails. */
const NEEDS_SSH = { skip: HAS_SSH || process.env.CI === 'true' ? false : 'no ssh on the PATH' };

/** A config that turns on the two other sources of host keys, and silences the client. */
const OTHER_SOURCES_CONFIG = 'Host *\n  KnownHostsCommand /bin/echo x\n  VerifyHostKeyDNS yes\n  LogLevel QUIET\n';

/** What `ssh -G` answers for `argv` under a config file of this test that holds `config`. */
function asked(t: TestContext, config: string, argv: readonly string[]): ReturnType<typeof ssh> {
  const file = ownedFile(t, 'pw', 'ssh_config');
  fs.writeFileSync(file, config);
  return ssh(['-G', '-F', file, ...argv]);
}

/** The lines `ssh -G` prints for the three options, sorted; an option the client has turned off prints no line. */
function sources(t: TestContext, argv: readonly string[]): string[] {
  const answer = asked(t, OTHER_SOURCES_CONFIG, argv);
  assert.equal(answer.status, 0, `ssh -G did not resolve the argv: ${answer.error ?? answer.stderr}`);
  return answer.stdout.split(/\r?\n/).filter((line) => /^(verifyhostkeydns|knownhostscommand|loglevel) /.test(line)).sort();
}

test('G1: under a config that says KnownHostsCommand, VerifyHostKeyDNS yes and LogLevel QUIET, the real ssh resolves every pinned argv to none of them', NEEDS_SSH, (t) => {
  for (const [name, argv] of [...everyKind(PIN, 'knows'), ['the tunnel with a caller\'s hostile extra', tunnel(PIN, 'knows', 'key', HOSTILE_EXTRA)] as const]) {
    assert.deepEqual(sources(t, argv), ['loglevel ERROR', 'verifyhostkeydns false'], name);
  }
});

test('G2: the control: the same config with an UNPINNED argv keeps all three on, so the test above can show the fault', NEEDS_SSH, (t) => {
  const kept = sources(t, run(undefined, 'knows'));
  assert.equal(kept.includes('knownhostscommand /bin/echo x'), true, kept.join(' | '));
  assert.equal(kept.includes('verifyhostkeydns true'), true, kept.join(' | '));
  assert.equal(kept.some((line) => line === 'loglevel ERROR'), false, kept.join(' | '));
});

test('G3: the words of an OLDER client leave a config\'s KnownHostsCommand on in a client that knows the option: so the answer about the client decides', NEEDS_SSH, (t) => {
  assert.deepEqual(sources(t, run(PIN, 'older')), ['knownhostscommand /bin/echo x', 'loglevel ERROR', 'verifyhostkeydns false']);
});

/** The two lists `ssh -G` resolves for `argv`, under no config: the files of the person's list, and of the system-wide one. */
function lists(t: TestContext, argv: readonly string[]): { user: string | undefined; system: string | undefined; stderr: string } {
  const answer = asked(t, '', argv);
  const of = (name: string): string | undefined => answer.stdout.split(/\r?\n/).find((line) => line.startsWith(`${name} `))?.slice(name.length + 1);
  return { user: of('userknownhostsfile'), system: of('globalknownhostsfile'), stderr: answer.stderr };
}

/* --- part 3: the rule of the path (tests 20 and 21) --- */

type Kind = string;
/** One row of the rule: a path, and what the rule answers for it: the word, or the refused kind. */
type Row = readonly [what: string, file: string, answer: { word: string } | { kind: Kind }];

const bare = (file: string): { word: string } => ({ word: file });
const quoted = (file: string): { word: string } => ({ word: `"${file}"` });
const refused = (kind: Kind): { kind: Kind } => ({ kind });

const ROWS: readonly Row[] = [
  ['a plain POSIX path', '/home/me/.config/Code/keys/42/known_hosts-e1-0b6f', bare('/home/me/.config/Code/keys/42/known_hosts-e1-0b6f')],
  ['a plain Windows path: single backslashes, a drive letter', 'C:\\Users\\me\\AppData\\keys\\42\\known_hosts-e1', bare('C:\\Users\\me\\AppData\\keys\\42\\known_hosts-e1')],
  ['characters that ssh keeps in a bare word', '/tmp/a#b=c,d;e&f(g)[h]{i}~j$k/kh', bare('/tmp/a#b=c,d;e&f(g)[h]{i}~j$k/kh')],
  ['a space (macOS: Application Support)', '/Users/me/Library/Application Support/Code/keys/42/kh', quoted('/Users/me/Library/Application Support/Code/keys/42/kh')],
  ['a space on Windows', 'C:\\Users\\me\\App Data\\keys\\42\\kh', quoted('C:\\Users\\me\\App Data\\keys\\42\\kh')],
  ['a pair of apostrophes (row a: bare, ssh reads ANOTHER path)', "/tmp/creds-a'b'/kh", quoted("/tmp/creds-a'b'/kh")],
  ['one apostrophe (row c: bare, invalid quotes)', "/tmp/creds-a'b/kh", quoted("/tmp/creds-a'b/kh")],
  ['a space and an apostrophe together (row k)', "/tmp/it's here/kh", quoted("/tmp/it's here/kh")],
  ['a space and then a hash', '/tmp/q #r/kh', quoted('/tmp/q #r/kh')],
  ['a no-break space', '/tmp/nb\u00a0sp/kh', quoted('/tmp/nb\u00a0sp/kh')],
  ['a double quote (row e)', '/tmp/a"b/kh', refused('quote')],
  ['two double quotes around a space', '/tmp/a"b c"d/kh', refused('quote')],
  ['two backslashes in a row: a network path (row f)', '\\\\srv\\share\\keys\\kh', refused('doubleBackslash')],
  ['two backslashes inside a path', 'C:\\keys\\\\42\\kh', refused('doubleBackslash')],
  ['a backslash before an apostrophe', "/tmp/a\\'b/kh", refused('backslashApostrophe')],
  ['a backslash at the end', 'C:\\keys\\', refused('lastBackslash')],
  ['a percent sign: %h (row g)', '/tmp/creds-%h-x/kh', refused('percent')],
  ['a percent sign: %% (row h)', '/tmp/creds-%%h-x/kh', refused('percent')],
  ['a percent sign: %Z (row j)', '/tmp/creds-%Z-x/kh', refused('percent')],
  ['the characters ${ (row i)', '/tmp/creds-${HOME}-x/kh', refused('variable')],
  ['a tilde at the start', '~/keys/kh', refused('tilde')],
  ['a tab', '/tmp/a\tb/kh', refused('control')],
  ['a line feed', '/tmp/a\nb/kh', refused('control')],
  ['a carriage return', '/tmp/a\rb/kh', refused('control')],
  ['DEL', '/tmp/a\u007fb/kh', refused('control')],
  ['a NUL', '/tmp/a\u0000b/kh', refused('control')],
  ['a control character wins over a double quote: the first kind in the order of the rule', '/tmp/a\t"b/kh', refused('control')],
];

type Check = { ok: true; pin: { file: string; word: string; knowsKnownHostsCommand: boolean } } | { ok: false; kind: Kind };
const READ = { knows: { kind: 'knows', token: 'OpenSSH_10.2' }, older: { kind: 'older', token: 'OpenSSH_8.4' } } as const;

test('P1: the rule of the path, row by row: as it is, in double quotes, or refused with its kind; the refusing half answers the same kind', () => {
  const checkedPin = exported<(file: string, client: unknown) => Check>('checkedPin');
  const pinPathRefusal = exported<(file: string) => Kind | undefined>('pinPathRefusal');
  for (const [what, file, answer] of ROWS) {
    const checked = checkedPin(file, READ.knows);
    if ('word' in answer) {
      assert.deepEqual(checked, { ok: true, pin: { file, word: answer.word, knowsKnownHostsCommand: true } }, what);
      assert.equal(pinPathRefusal(file), undefined, what);
    } else {
      assert.deepEqual(checked, { ok: false, kind: answer.kind }, what);
      assert.equal(pinPathRefusal(file), answer.kind, what);
    }
  }
});

test('P2: both words carry the same spelling, the file of the value is the path as it was given, and the client\'s answer is the value\'s', () => {
  const checkedPin = exported<(file: string, client: unknown) => Check>('checkedPin');
  const hostKeyWords = exported<(pin: unknown) => string[]>('hostKeyWords');
  for (const [what, file, answer] of ROWS.filter((row) => 'word' in row[2])) {
    const word = (answer as { word: string }).word;
    for (const client of ['knows', 'older'] as const) {
      const checked = checkedPin(file, READ[client]);
      assert.ok(checked.ok, what);
      assert.equal(checked.pin.file, file, what);
      assert.equal(checked.pin.knowsKnownHostsCommand, client === 'knows', what);
      assert.deepEqual(hostKeyWords(checked.pin), client === 'knows' ? KNOWS_WORDS(word) : OLDER_WORDS(word), what);
    }
  }
});

test('P3: every kind has its words for sentence E, and the kinds are these eight, in the order the rule asks them', () => {
  const kinds = exported<Record<string, string>>('PIN_PATH_KINDS');
  assert.deepEqual(kinds, {
    control: 'a control character',
    quote: 'a double quote',
    doubleBackslash: 'two backslashes in a row (a network path)',
    backslashApostrophe: 'a backslash before an apostrophe',
    lastBackslash: 'a backslash at its end',
    percent: 'a percent sign',
    variable: 'the characters ${',
    tilde: 'a tilde at its start',
  });
  const met = new Set(ROWS.flatMap(([, , answer]) => ('kind' in answer ? [answer.kind] : [])));
  assert.deepEqual([...met].sort(), Object.keys(kinds).sort(), 'a kind has no row in ROWS, or a row names a kind that is none');
});

test('P4: every path that the rule of the bridged file refuses, this rule refuses too (it may refuse more, never less)', () => {
  const pinPathRefusal = exported<(file: string) => Kind | undefined>('pinPathRefusal');
  const bridgedRefuses = ROWS.map(([, file]) => file).filter((file) => unsafeBridgedFileValue(file));
  assert.ok(bridgedRefuses.length >= 10, `the bridged rule refuses ${bridgedRefuses.length} of the rows: the comparison has lost its subject`);
  for (const file of bridgedRefuses) {
    assert.notEqual(pinPathRefusal(file), undefined, JSON.stringify(file));
  }
});

test('P5: sentences E and F, word for word: no path, no part of the program\'s output but the exit code', () => {
  const pinPathSentence = exported<(name: string, kind: Kind) => string>('pinPathSentence');
  const pinClientSentence = exported<(name: string, exitCode: number | null) => string>('pinClientSentence');
  assert.equal(
    pinPathSentence('box', 'percent'),
    'The saved host key of "box" cannot be handed to ssh, so nothing was sent to that host. The folder where this editor keeps the files of CredsForDevs has a path with a percent sign, and ssh does not read a file under such a path as the one file it is. This is about this computer, not about the host or the saved key.',
  );
  assert.equal(
    pinClientSentence('box', 255),
    'CredsForDevs could not read the version of the ssh program on this computer (exit code 255), so it did not start a connection that has to check the saved host key of "box". Nothing was sent to that host. The reason is the ssh program here, not the host.',
  );
  assert.equal(
    pinClientSentence('box', null),
    'CredsForDevs could not read the version of the ssh program on this computer (it did not start, or did not end in time), so it did not start a connection that has to check the saved host key of "box". Nothing was sent to that host. The reason is the ssh program here, not the host.',
  );
  assert.match(pinClientSentence('box', 0), /\(exit code 0\)/);
});

test('G4: every path that the rule writes, the real ssh resolves to exactly that path in BOTH lists', NEEDS_SSH, (t) => {
  // The rows a POSIX client can be asked: a Windows path is a relative name to it, and it is written as it is all the same.
  for (const [what, file] of ROWS.filter((row) => 'word' in row[2])) {
    const resolved = lists(t, run(file, 'knows'));
    assert.deepEqual({ user: resolved.user, system: resolved.system }, { user: file, system: file }, `${what}: ${resolved.stderr}`);
  }
});

/** Whether the real client reads `word`, as both options, as the one file `file` in BOTH lists. */
function readAsOne(t: TestContext, word: string, file: string): boolean {
  const resolved = lists(t, ['-o', `UserKnownHostsFile=${word}`, '-o', `GlobalKnownHostsFile=${word}`, '--', TARGET]);
  return resolved.user === file && resolved.system === file;
}

test('G5: the control: the bare pair of apostrophes resolves ANOTHER path, and no refused row is read as the one file in BOTH spellings', NEEDS_SSH, (t) => {
  const pair = "/tmp/creds-a'b'/kh";
  assert.equal(readAsOne(t, pair, pair), false, 'the pair of apostrophes, bare, was read as itself: G4 could not show the fault');
  assert.equal(readAsOne(t, pair, '/tmp/creds-ab/kh'), true, 'the pair of apostrophes, bare, is read as the path without them');
  // A control character is refused as the rule of the bridged file refuses it (P4), whatever this client reads: a tab splits a bare word and is kept
  // in double quotes, and DEL is kept in both (measured 2026-11-18, OpenSSH 10.2p1). Every other kind is refused because of what was measured.
  for (const [what, file] of ROWS.filter((row) => 'kind' in row[2] && row[2].kind !== 'control')) {
    const both = readAsOne(t, file, file) && readAsOne(t, `"${file}"`, file);
    assert.equal(both, false, `${what}: ssh reads it as the one file bare AND in double quotes, so the rule refuses a path that it could always write`);
  }
});

/* --- part 4: the scan that stays (test 23) --- */

const SRC = path.resolve(__dirname, '..', '..', 'src');
const SOURCES = discoverSources(SRC, new Map([['test', 'the tests are not shipped']]));
const read = (file: string): string => fs.readFileSync(path.join(SRC, file), 'utf8');

test('S1: no shipped file names /dev/null, NUL or "none" as a known-hosts file on a command line: a pin file has no stand-in', () => {
  const standIn = /KnownHostsFile=(?:\/dev\/null|NUL\b|none\b)|NO_KEY_FILE/;
  assert.deepEqual(SOURCES.filter((file) => standIn.test(read(file))), []);
  // The scan is alive: it finds the stand-in in the text that E1 shipped.
  assert.equal(standIn.test("const NO_KEY_FILE = '/dev/null';"), true);
  assert.equal(standIn.test('`UserKnownHostsFile=/dev/null`'), true);
});

test('S2: a checked pin is made in one place: no shipped file casts to CheckedPin but checkedPin itself, and the brand is not exported', () => {
  const cast = /\bas\s+(?:unknown\s+as\s+)?CheckedPin\b/;
  assert.deepEqual(SOURCES.filter((file) => cast.test(read(file))), ['hostKeyPin.ts']);
  const pinFile = read('hostKeyPin.ts');
  assert.equal((pinFile.match(new RegExp(cast.source, 'g')) ?? []).length, 1, 'hostKeyPin.ts casts to CheckedPin in more than one place');
  assert.match(pinFile, /^declare const checkedPinBrand: unique symbol;$/m);
  assert.equal(/export\s+(?:declare\s+)?const\s+checkedPinBrand/.test(pinFile), false);
});

test('S3: the three new options are spelled in hostKeyPin.ts and in no other shipped file', () => {
  const spelled = /\b(?:VerifyHostKeyDNS|KnownHostsCommand|LogLevel)=/;
  assert.deepEqual(SOURCES.filter((file) => spelled.test(read(file))), ['hostKeyPin.ts']);
});
