import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { type TestContext, test } from 'node:test';
import { ownedFile } from '../../scripts/lib/leftovers.cjs';
import * as hostKeyPin from '../hostKeyPin';
import { buildBridgeArgv } from '../sshBridge';
import { type SshExecAuth, type SshExecOptions, buildSshExecArgv } from '../sshExecCommand';
import { EntityMetadata } from '../types';
import { fakePath } from './fakePaths';
import { importedUses } from './funnelScan';
import { hostKeyWordsOf, lastHostKeyWordAt, valuesOf, withoutGlobal } from './pinnedArgv';
import { discoverSources } from './tempSiteScan';

/**
 * G1, E1.S1 (`PLAN_person_roads_pin_host_key.md` §3.9 and §5, tests 13 and 14): the words of a pinned call come from one function.
 *
 * <p><b>Part 1 is what is SENT.</b> Both argv builders say `StrictHostKeyChecking=yes` and the pin file as `UserKnownHostsFile` AND as
 * `GlobalKnownHostsFile`; a path with white space is one quoted word; a path with a double quote is not named at all.</p>
 *
 * <p><b>Part 2 asks the real client.</b> The PATH's `ssh -G` resolves each argv under a config that names other known-hosts files and
 * prints what is IN EFFECT. `-G` connects to nothing. It shows what one client resolves. That a host with another key is then
 * refused was measured by hand against a real `sshd` (the docblock of `hostKeyWords`); no test of this file shows it.</p>
 *
 * <p><b>Part 3 is the list of places</b> that write these words.</p>
 */

const PIN = fakePath('keys/4242/known_hosts-e1-0b6f3c1e');
/** As on macOS, where the editor's storage folder is under `Application Support`. */
const SPACED = fakePath('Application Support/Code/keys/4242/known_hosts-e1-0b6f3c1e');
const TABBED = fakePath('a\tb/known_hosts-e1');
const QUOTED_TWICE = fakePath('a"b c"d/known_hosts-e1');
const QUOTED_ONCE = fakePath('a"b/known_hosts-e1');
const KEY = fakePath('k.key');

const HOST: EntityMetadata = { id: 'e1', name: 'build box', host: 'build.example.com', user: 'dev', isSshEnabled: true };
/** An entry that adds every word the shared composer can add: `-A`, a forward, a port. */
const BUSY: EntityMetadata = { ...HOST, port: 2222, agentForward: true, portForwards: [{ kind: 'local', bindPort: 8080, host: 'localhost', hostPort: 80 }] };

/** What a caller could put into `extra` to switch the check off. `ssh` takes the FIRST value of an option, and the builder's stand first. */
const HOSTILE_EXTRA = ['-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null', '-o', 'GlobalKnownHostsFile=/dev/null'];

type Argv = string[] | undefined;

const run = (pin: string | undefined, auth: SshExecAuth, options: SshExecOptions = {}, entity: EntityMetadata = HOST): Argv =>
  buildSshExecArgv(entity, KEY, 'id', auth, { ...options, knownHostsFile: pin });

const tunnel = (pin: string | undefined, auth: SshExecAuth, extra: readonly string[] = []): Argv =>
  buildBridgeArgv(HOST, { port: 51234, remote: { path: '/tmp/creds-dev-abc.sock' }, auth, extra, keyPath: KEY, knownHostsFile: pin }, () => true);

/** Every kind of argv the extension starts an `ssh` with, for one pin file (or none). No kind has a caller's `extra`. */
const everyKind = (pin: string | undefined): readonly (readonly [string, Argv])[] => [
  ['the tunnel of a bridge, a key', tunnel(pin, 'key')],
  ['the tunnel of a bridge, a password', tunnel(pin, 'askpass')],
  ['a run off a bridge, a key', run(pin, 'key')],
  ['a run off a bridge, a password', run(pin, 'askpass')],
  ['a run off a bridge: a jump host, no pty, the agent taken away, a forward, a port', run(pin, 'key', { jump: 'hop@jump.example.com', noTty: true, ownAgent: false }, BUSY)],
  ['a bridged run, a key', run(pin, 'key', { bridged: true })],
  ['a bridged run, a password', run(pin, 'askpass', { bridged: true }, BUSY)],
];

/** The argv of each kind; a kind whose builder answered none fails here, by its name. */
function argvs(pin: string | undefined): (readonly [string, string[]])[] {
  return everyKind(pin).map(([name, argv]) => {
    assert.ok(argv !== undefined, `${name}: expected an argv`);
    return [name, argv] as const;
  });
}

/** The six words of a pinned call, for the word that names the file. */
const pinned = (file: string): string[] => ['-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${file}`, '-o', `GlobalKnownHostsFile=${file}`];

const UNPINNED = ['-o', 'StrictHostKeyChecking=accept-new'];

/** What stands in for a pin file that cannot be named: it holds no key, so `ssh` refuses every host. */
const NO_KEY_FILE = '/dev/null';

/* --- part 1: what is sent --- */

test('G1: a pinned argv of both builders names the pin file as BOTH known-hosts files, side by side, and no other host-key word', () => {
  for (const [name, argv] of argvs(PIN)) {
    const at = argv.indexOf('StrictHostKeyChecking=yes') - 1;
    assert.deepEqual(argv.slice(at, at + 6), pinned(PIN), `${name}: the three options do not stand side by side`);
    assert.deepEqual(hostKeyWordsOf(argv), pinned(PIN), name);
  }
});

test('G1: a pin file whose path holds white space is ONE quoted word, the same in both options', () => {
  for (const file of [SPACED, TABBED]) {
    for (const [name, argv] of argvs(file)) {
      assert.deepEqual(hostKeyWordsOf(argv), pinned(`"${file}"`), `${name}: ssh would read this path as two files`);
    }
  }
});

test('G1: a pin file whose path holds a double quote is not named at all: both options name a file that holds no key, and the check stays strict', () => {
  for (const file of [QUOTED_TWICE, QUOTED_ONCE]) {
    for (const [name, argv] of argvs(file)) {
      assert.deepEqual(hostKeyWordsOf(argv), pinned(NO_KEY_FILE), `${name}: ${file} reached ssh`);
    }
  }
});

test('G1: a caller\'s own host-key words in extra come too late: the builder\'s stand first, and ssh takes the first', () => {
  const argv = tunnel(PIN, 'key', HOSTILE_EXTRA) ?? [];
  assert.deepEqual(valuesOf(argv, 'StrictHostKeyChecking'), ['yes', 'no']);
  assert.deepEqual(valuesOf(argv, 'UserKnownHostsFile'), [PIN, '/dev/null']);
  assert.deepEqual(valuesOf(argv, 'GlobalKnownHostsFile'), [PIN, '/dev/null']);
});

/** The function, read through the module object: this file compiles before the function exists, so its absence is a failed assertion. */
function theFunction(): (pinFile: string | undefined) => string[] {
  const found = (hostKeyPin as Record<string, unknown>).hostKeyWords;
  assert.equal(typeof found, 'function', 'hostKeyPin.ts exports no hostKeyWords');
  return found as (pinFile: string | undefined) => string[];
}

test('G1: one function writes the words: its four answers', () => {
  const hostKeyWords = theFunction();
  assert.deepEqual(hostKeyWords(undefined), UNPINNED);
  assert.deepEqual(hostKeyWords(PIN), pinned(PIN));
  assert.deepEqual(hostKeyWords(SPACED), pinned(`"${SPACED}"`));
  assert.deepEqual(hostKeyWords(QUOTED_TWICE), pinned(NO_KEY_FILE));
});

test('G1: and both builders say exactly what it answers', () => {
  const hostKeyWords = theFunction();
  for (const file of [undefined, PIN, SPACED, QUOTED_TWICE]) {
    for (const [name, argv] of argvs(file)) {
      assert.deepEqual(hostKeyWordsOf(argv), hostKeyWords(file), `${name}, ${file ?? 'no pin'}`);
    }
  }
});

test('an unpinned argv says accept-new and names no known-hosts file', () => {
  for (const [name, argv] of argvs(undefined)) {
    assert.deepEqual(hostKeyWordsOf(argv), UNPINNED, name);
  }
});

/** Copied from the output of `main` at ca99cd91 (after G2, before G1), for the pin file `PIN`. */
const RUN_BEFORE_G1 = [
  '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${PIN}`, '-o', 'ConnectTimeout=10',
  '-o', 'ControlPath=none', '-o', 'ControlMaster=no', '-i', KEY, '--', 'dev@build.example.com', 'id',
];
const TUNNEL_BEFORE_G1 = [
  '-o', 'BatchMode=yes', '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=3', '-o', 'ExitOnForwardFailure=yes', '-o', 'ConnectTimeout=10',
  '-o', 'ControlPath=none', '-o', 'ControlMaster=no', '-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${PIN}`,
  '-N', '-R', '/tmp/creds-dev-abc.sock:127.0.0.1:51234', '-i', KEY, '--', 'dev@build.example.com',
];

test('a pin file whose path holds no white space is the word of before G1, byte for byte: only the third option is new', () => {
  assert.deepEqual(withoutGlobal(run(PIN, 'key') ?? []), RUN_BEFORE_G1);
  assert.deepEqual(withoutGlobal(tunnel(PIN, 'key') ?? []), TUNNEL_BEFORE_G1);
});

/** The words behind which a host-key option would come too late, or would be the entry's or a caller's. */
const LATER = ['-J', '-A', '-L', '-N', '-R', '-i', '-p', '--'];

test('the host-key words stand before every word that the entry or a caller adds', () => {
  for (const [name, argv] of argvs(PIN)) {
    const own = withoutGlobal(argv); // the third option stands beside the second: the first test of this file
    const later = Math.min(...LATER.map((word) => own.indexOf(word)).filter((at) => at !== -1));
    assert.ok(lastHostKeyWordAt(own) !== -1 && lastHostKeyWordAt(own) < later, `${name}: ${own.join(' ')}`);
  }
});

/* --- part 2: the real client --- */

const OTHER_USER_FILE = fakePath('other/user_known_hosts');
const OTHER_SYSTEM_FILE = fakePath('other/system_known_hosts');

/** A config that trusts other files and checks nothing: what the words of a pinned call have to win against. */
const OTHER_FILES_CONFIG = `Host *\n  StrictHostKeyChecking no\n  UserKnownHostsFile ${OTHER_USER_FILE}\n  GlobalKnownHostsFile ${OTHER_SYSTEM_FILE}\n`;

/** With a `~` after the space: `ssh` expands a `~` only at the start of a file name, so a path that was split in two shows it. */
const SPACE_THEN_TILDE = fakePath('a ~/known_hosts-e1');

// The PATH lookup is on purpose: the PATH's ssh is the client the extension starts, and it is the thing asked here.
const ssh = (args: readonly string[]) => spawnSync('ssh', [...args], { encoding: 'utf8', timeout: 15_000 }); // NOSONAR: the PATH's ssh is the subject

const HAS_SSH = ssh(['-V']).error === undefined;

/** Locally a machine with no ssh skips, with the reason; where CI=true nothing skips, so a missing ssh fails. */
const NEEDS_SSH = { skip: HAS_SSH || process.env.CI === 'true' ? false : 'no ssh on the PATH' };

/** What `ssh -G` answers for `argv` under a config file of this test that holds `config`. */
function asked(t: TestContext, config: string, argv: readonly string[]): ReturnType<typeof ssh> {
  const file = ownedFile(t, 'hkw', 'ssh_config');
  fs.writeFileSync(file, config);
  return ssh(['-G', '-F', file, ...argv]);
}

/** The three lines `ssh -G` prints about the host-key check for `argv`, under the config that names other files. */
function resolved(t: TestContext, argv: readonly string[]): string[] {
  const answer = asked(t, OTHER_FILES_CONFIG, argv);
  assert.equal(answer.status, 0, `ssh -G did not resolve the argv: ${answer.error ?? answer.stderr}`);
  return answer.stdout.split(/\r?\n/).filter((line) => /^(stricthostkeychecking|userknownhostsfile|globalknownhostsfile) /.test(line)).sort();
}

/** What `ssh -G` prints when the check is strict and `file` is the only known-hosts file of both lists. */
const onlyFile = (file: string): string[] => [`globalknownhostsfile ${file}`, 'stricthostkeychecking true', `userknownhostsfile ${file}`];

test('G1: under a config that names other known-hosts files, the real ssh resolves every pinned argv to the pin file alone', NEEDS_SSH, (t) => {
  for (const [name, argv] of [...argvs(PIN), ['the tunnel with a caller\'s hostile extra', tunnel(PIN, 'key', HOSTILE_EXTRA) ?? []] as const]) {
    assert.deepEqual(resolved(t, argv), onlyFile(PIN), name);
  }
});

test('G1: the real ssh reads a pin file whose path holds white space as ONE file', NEEDS_SSH, (t) => {
  for (const [name, argv] of argvs(SPACE_THEN_TILDE)) {
    assert.deepEqual(resolved(t, argv), onlyFile(SPACE_THEN_TILDE), name);
  }
});

test('G1: for a pin file whose path holds a double quote the real ssh resolves a strict check against the file that holds no key', NEEDS_SSH, (t) => {
  for (const [name, argv] of argvs(QUOTED_TWICE)) {
    assert.deepEqual(resolved(t, argv), onlyFile(NO_KEY_FILE), name);
  }
});

test('the control: the same path as a bare word is read as two files, so the test above can show the fault', NEEDS_SSH, (t) => {
  const bare = ['-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${SPACE_THEN_TILDE}`, '--', 'dev@build.example.com'];
  const answer = asked(t, '', bare);
  const user = answer.stdout.split(/\r?\n/).filter((line) => line.startsWith('userknownhostsfile '));
  // POSIX: two names, the second with its `~` expanded. Win32-OpenSSH 9.5: no line at all, `tilde_expand: No such user`.
  assert.notDeepEqual(user, [`userknownhostsfile ${SPACE_THEN_TILDE}`], `the bare word was read as one file: ${answer.stderr}`);
});

/* --- part 3: the places --- */

const SRC = path.resolve(__dirname, '..', '..', 'src');

/** Every shipped source file. The tests write such words of their own. */
const SOURCES = discoverSources(SRC, new Map([['test', 'the tests are not shipped: they write option words of their own']]));

const read = (file: string): string => fs.readFileSync(path.join(SRC, file), 'utf8');

/** Each file that holds a match of `pattern`, once, sorted. Comments are read too. */
const filesWith = (pattern: RegExp): string[] => SOURCES.filter((file) => pattern.test(read(file)));

/** `file#function` of every reference to `name` imported from the module `from`, sorted. */
const usesOf = (name: string, from: string): string[] =>
  SOURCES.flatMap((file) => importedUses(file, read(file), name, from).map((use) => `${file}#${use.within}`)).sort();

const HOW_TO_FIX =
  'a place that writes a known-hosts option, or strict checking, was added, moved or renamed. The words of a pinned call come from hostKeyWords (hostKeyPin.ts). Then edit this list in the same commit';

test('G1: the known-hosts options and strict checking are spelled in one function, and at the reviewed place of Connect\'s line', () => {
  assert.ok(SOURCES.length > 100, `the discovery found only ${SOURCES.length} files`);
  // `Name=value` only: prose may name an option (`UserKnownHostsFile`). `sshCommand.ts` is the line of a Connect terminal, shell words
  // per platform: it says the pin as the person's file only, until candidate C4 of the plan gives it these words.
  assert.deepEqual(filesWith(/UserKnownHostsFile\s*=/), ['hostKeyPin.ts', 'sshCommand.ts'], HOW_TO_FIX);
  assert.deepEqual(filesWith(/StrictHostKeyChecking\s*=\s*yes/), ['hostKeyPin.ts', 'sshCommand.ts'], HOW_TO_FIX);
  assert.deepEqual(filesWith(/GlobalKnownHostsFile\s*=/), ['hostKeyPin.ts'], HOW_TO_FIX);
});

test('G1: and that function is called by the two argv builders, and by nothing else', () => {
  assert.deepEqual(usesOf('hostKeyWords', 'hostKeyPin'), ['sshBridge.ts#buildBridgeArgv', 'sshExecCommand.ts#buildSshExecArgv'], HOW_TO_FIX);
});
