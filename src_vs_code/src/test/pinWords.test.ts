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
import { PIN_SOURCE_OPTIONS, hostKeyWordsOf, sourceWordsOf, sshKnowsKnownHostsCommand, sshParserOf, testPin, valuesOf, withoutGlobal, withoutSources } from './pinnedArgv';

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
 *
 * <p><b>Two parsers (test 34; E3.S9).</b> The real client reads a bare value of a config line with the parser of its version: a client before 8.7 keeps a pair of apostrophes and splits a bare value at an
 * equals sign; a client from 8.7 on takes the apostrophes out and reads the value whole. The `-G` tests (G1 to G6) take their expectation from the ONE parser that the local client's own `-V` names
 * (`PARSER`, boundary `TOKENISER_SINCE` of `pinnedArgv.ts`): a version that cannot be read is a failed test, never a choice by outcome (decision 19). `scripts/itestOffRig.cjs unit-older` runs this file
 * with the older client first on the PATH; CI runs it on the newer one.</p>
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
const VERSION_ANSWER = ssh(['-V']);
const HAS_SSH = VERSION_ANSWER.error === undefined;
/** Skipped only where there is no `ssh` and no CI: under `CI=true` a missing client fails. */
const NEEDS_SSH = { skip: HAS_SSH || process.env.CI === 'true' ? false : 'no ssh on the PATH' };
const KNOWS_COMMAND = sshKnowsKnownHostsCommand(VERSION_ANSWER.stderr);
/** The parser of the local client by its version (8.7 is the boundary): `undefined` when `ssh -V` cannot be read. */
const PARSER = sshParserOf(VERSION_ANSWER.stderr);

/** The parser, or a failure that says so: a `-G` test of this file has no expectation for a client that did not say what it is (decision 19), and it does not skip. */
function parserOrFail(): 'older' | 'newer' {
  assert.notEqual(PARSER, undefined, 'the version of this ssh cannot be read: no parser, no expectation');
  return PARSER as 'older' | 'newer';
}
/** Tests that give the real client a `KnownHostsCommand` (in the config or in the argv): skipped on a client older than 8.5, never failed; the argv tests (W1 to W6, P1 to P5) stay on. Where there is no client, or under `CI=true`, as `NEEDS_SSH`. */
const NEEDS_SSH_85 = { skip: NEEDS_SSH.skip === false && !KNOWS_COMMAND ? 'the local ssh is older than 8.5: it has no KnownHostsCommand' : NEEDS_SSH.skip };

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

test('G1: under a config that says KnownHostsCommand, VerifyHostKeyDNS yes and LogLevel QUIET, the real ssh resolves every pinned argv to none of them', NEEDS_SSH_85, (t) => {
  parserOrFail();
  for (const [name, argv] of [...everyKind(PIN, 'knows'), ['the tunnel with a caller\'s hostile extra', tunnel(PIN, 'knows', 'key', HOSTILE_EXTRA)] as const]) {
    assert.deepEqual(sources(t, argv), ['loglevel ERROR', 'verifyhostkeydns false'], name);
  }
});

test('G2: the control: the same config with an UNPINNED argv keeps all three on, so the test above can show the fault', NEEDS_SSH_85, (t) => {
  parserOrFail();
  const kept = sources(t, run(undefined, 'knows'));
  assert.equal(kept.includes('knownhostscommand /bin/echo x'), true, kept.join(' | '));
  assert.equal(kept.includes('verifyhostkeydns true'), true, kept.join(' | '));
  assert.equal(kept.some((line) => line === 'loglevel ERROR'), false, kept.join(' | '));
});

test('G3: the words of an OLDER client leave a config\'s KnownHostsCommand on in a client that knows the option: so the answer about the client decides', NEEDS_SSH_85, (t) => {
  parserOrFail();
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
  ['characters that ssh keeps in a bare word', '/tmp/a#b,c;d&e(f)[g]{h}~i$j/kh', bare('/tmp/a#b,c;d&e(f)[g]{h}~i$j/kh')],
  // A space is followed by a `~` in the rows that hold only a space: `ssh -G` joins the files with spaces, so a word that was split in two
  // shows (`ssh` expands a `~` only at the start of a file name), as in hostKeyWords.test.ts (SPACE_THEN_TILDE).
  ['a space (macOS: Application Support)', '/Users/me/Library/Application ~/Support/Code/keys/42/kh', quoted('/Users/me/Library/Application ~/Support/Code/keys/42/kh')],
  ['a space on Windows', 'C:\\Users\\me\\App ~/Data\\keys\\42\\kh', quoted('C:\\Users\\me\\App ~/Data\\keys\\42\\kh')],
  ['a pair of apostrophes (row a: bare, ssh reads ANOTHER path)', "/tmp/creds-a'b'/kh", quoted("/tmp/creds-a'b'/kh")],
  ['one apostrophe (row c: bare, invalid quotes)', "/tmp/creds-a'b/kh", quoted("/tmp/creds-a'b/kh")],
  ['a space and an apostrophe together (row k)', "/tmp/it's here/kh", quoted("/tmp/it's here/kh")],
  // OpenSSH 8.4 reads a known-hosts value with `strdelim`, which splits an unquoted value at `=`: two file names, not one. 10.2 reads it whole either way.
  ['an equals sign (OpenSSH 8.4 splits a bare value at it)', '/tmp/data=prod/keys/known_hosts-e1', quoted('/tmp/data=prod/keys/known_hosts-e1')],
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
    'The saved host key of "box" cannot be handed to ssh, so nothing was sent to that host. The folder where this editor keeps the files of CredsForDevs has a path with a percent sign, and ssh does not read a file under such a path as the one file it is. This is about this computer, not about the host or the saved key. To go on, move the storage (user data) folder of the editor to a path without it, or point the editor at another user-data folder.',
  );
  assert.equal(
    pinClientSentence('box', 255),
    'CredsForDevs could not read the version of the ssh program on this computer (exit code 255), so it did not start a connection that has to check the saved host key of "box". Nothing was sent to that host. The reason is the ssh program here, not the host. Check which ssh program is first on your PATH and that it prints its version when run with -V.',
  );
  assert.equal(
    pinClientSentence('box', null),
    'CredsForDevs could not read the version of the ssh program on this computer (it did not start, or did not end in time), so it did not start a connection that has to check the saved host key of "box". Nothing was sent to that host. The reason is the ssh program here, not the host. Check which ssh program is first on your PATH and that it prints its version when run with -V.',
  );
  assert.match(pinClientSentence('box', 0), /\(exit code 0\)/);
});

test('P6: the parser of a client by its version: below 8.7 older, from 8.7 on newer, and a version that cannot be read is no parser', () => {
  const line = (version: string): string => `${version} Debian-5, OpenSSL 1.1.1w  11 Sep 2023\n`;
  assert.equal(sshParserOf(line('OpenSSH_8.4p1')), 'older');
  assert.equal(sshParserOf(line('OpenSSH_8.6p1')), 'older');
  assert.equal(sshParserOf(line('OpenSSH_8.7p1')), 'newer');
  assert.equal(sshParserOf(line('OpenSSH_10.2p1')), 'newer');
  assert.equal(sshParserOf(''), undefined);
  assert.equal(sshParserOf(undefined), undefined);
  assert.equal(sshParserOf('not a version: OpenSSH_10.2p1\n'), undefined);
  assert.equal(sshParserOf('ssh says OpenSSH_for_Windows_9.5p2, LibreSSL 3.8.2\n'), undefined);
});

test('G4: every path that the rule writes, the real ssh resolves to exactly that path in BOTH lists', NEEDS_SSH, (t) => {
  parserOrFail();
  // The rows a POSIX client can be asked: a Windows path is a relative name to it, and it is written as it is all the same.
  for (const [what, file] of ROWS.filter((row) => 'word' in row[2])) {
    const resolved = lists(t, run(file, KNOWS_COMMAND ? 'knows' : 'older')); // the words differ only in the KnownHostsCommand pair, which a client below 8.5 does not take
    assert.deepEqual({ user: resolved.user, system: resolved.system }, { user: file, system: file }, `${what}: ${resolved.stderr}`);
  }
});

/** Whether the real client reads `word`, as both options, as the one file `file` in BOTH lists. */
function readAsOne(t: TestContext, word: string, file: string): boolean {
  const resolved = lists(t, ['-o', `UserKnownHostsFile=${word}`, '-o', `GlobalKnownHostsFile=${word}`, '--', TARGET]);
  return resolved.user === file && resolved.system === file;
}

test('G5: the control of this client\'s parser: what the bare pair of apostrophes and the bare equals-sign path resolve to', NEEDS_SSH, (t) => {
  const parser = parserOrFail();
  const pair = "/tmp/creds-a'b'/kh";
  const equals = '/tmp/data=prod/keys/known_hosts-e1';
  if (parser === 'newer') {
    assert.equal(readAsOne(t, pair, pair), false, 'the pair of apostrophes, bare, was read as itself: G4 could not show the fault');
    assert.equal(readAsOne(t, pair, '/tmp/creds-ab/kh'), true, 'the pair of apostrophes, bare, is read as the path without them');
    assert.equal(readAsOne(t, equals, equals), true, 'the bare equals-sign path is read as itself, whole, in both lists');
    return;
  }
  assert.equal(readAsOne(t, pair, pair), true, 'the pair of apostrophes, bare, is read as itself by a client before 8.7');
  assert.equal(readAsOne(t, pair, '/tmp/creds-ab/kh'), false, 'the pair of apostrophes, bare, was read as the path without them by a client before 8.7');
  assert.equal(readAsOne(t, equals, equals), false, 'the bare equals-sign path was read as itself by a client before 8.7: it splits at the sign');
  const resolved = lists(t, ['-o', `UserKnownHostsFile=${equals}`, '-o', `GlobalKnownHostsFile=${equals}`, '--', TARGET]);
  assert.deepEqual({ user: resolved.user?.split(' ')[0], system: resolved.system?.split(' ')[0] }, { user: '/tmp/data', system: '/tmp/data' }, `the first name of each list of the bare equals-sign path: ${resolved.stderr}`);
});

test('G6: the refused rows: no refused row is read as the one file in BOTH spellings (a newer client), or what the client resolves is recorded (an older one)', NEEDS_SSH, (t) => {
  const parser = parserOrFail();
  // A control character is refused as the rule of the bridged file refuses it (P4), whatever this client reads: a tab splits a bare word and is kept
  // in double quotes, and DEL is kept in both (measured 2026-11-18, OpenSSH 10.2p1). Every other kind is refused because of what was measured.
  for (const [what, file] of ROWS.filter((row) => 'kind' in row[2] && row[2].kind !== 'control')) {
    if (parser === 'newer') {
      const both = readAsOne(t, file, file) && readAsOne(t, `"${file}"`, file);
      assert.equal(both, false, `${what}: ssh reads it as the one file bare AND in double quotes, so the rule refuses a path that it could always write`);
    } else {
      // No expectation: the rule was measured on a newer client, and a client before 8.7 is recorded, not judged (the plan's re-review, its seventh place).
      const of = (word: string): string => JSON.stringify(lists(t, ['-o', `UserKnownHostsFile=${word}`, '-o', `GlobalKnownHostsFile=${word}`, '--', TARGET]));
      t.diagnostic(`${what}: bare ${of(file)}; in double quotes ${of(`"${file}"`)}`);
    }
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
