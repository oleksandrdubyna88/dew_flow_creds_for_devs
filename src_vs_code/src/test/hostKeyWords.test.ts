import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { type TestContext, test } from 'node:test';
import { ownedFile } from '../../scripts/lib/leftovers.cjs';
import * as hostKeyPin from '../hostKeyPin';
import { bridgedConfigText } from '../bridgedSshConfig';
import { buildBridgeArgv } from '../sshBridge';
import { type SshExecAuth, type SshExecOptions, buildSshExecArgv } from '../sshExecCommand';
import { EntityMetadata } from '../types';
import { fakePath } from './fakePaths';
import { importedUses } from './funnelScan';
import { hostKeyWordsOf, lastHostKeyWordAt, sourceWordsOf, sshKnowsKnownHostsCommand, testPin, valuesOf, withoutGlobal, withoutSources } from './pinnedArgv';
import { discoverSources } from './tempSiteScan';

/**
 * G1, E1.S1 (`PLAN_person_roads_pin_host_key.md` §3.9 and §5, tests 13 and 14): the words of a pinned call come from one function.
 *
 * <p><b>Part 1 is what is SENT.</b> The tunnel of a bridge (`buildBridgeArgv`) and an exec call OFF a bridge (`buildSshExecArgv`) say
 * `StrictHostKeyChecking=yes` and the pin file as `UserKnownHostsFile` AND as `GlobalKnownHostsFile`; a path with white space is one
 * quoted word; a path with a double quote is not named at all. A BRIDGED exec call (E1.6, `bridgedSshConfig.ts`) is the other design: its
 * argv names no known-hosts file, and the pin is the destination block of its `-F` file, whose `Host *` block says `GlobalKnownHostsFile
 * none`. That closes P1 on that road already; the last tests of part 2 hold it, with the real client.</p>
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
const KEY = fakePath('k.key');
const CONFIG_FILE = fakePath('bridges/call-1.ssh_config');

const HOST: EntityMetadata = { id: 'e1', name: 'build box', host: 'build.example.com', user: 'dev', isSshEnabled: true };
/** An entry that adds every word the shared composer can add: `-A`, a forward, a port. */
const BUSY: EntityMetadata = { ...HOST, port: 2222, agentForward: true, portForwards: [{ kind: 'local', bindPort: 8080, host: 'localhost', hostPort: 80 }] };

/** What a caller could put into `extra` to switch the check off. `ssh` takes the FIRST value of an option, and the builder's stand first. */
const HOSTILE_EXTRA = ['-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null', '-o', 'GlobalKnownHostsFile=/dev/null'];

type Argv = string[] | undefined;

const run = (pin: string | undefined, auth: SshExecAuth, options: SshExecOptions = {}, entity: EntityMetadata = HOST): Argv =>
  buildSshExecArgv(entity, KEY, 'id', auth, { ...options, knownHostsFile: testPin(pin) });

const tunnel = (pin: string | undefined, auth: SshExecAuth, extra: readonly string[] = []): Argv =>
  buildBridgeArgv(HOST, { port: 51234, remote: { path: '/tmp/creds-dev-abc.sock' }, auth, extra, keyPath: KEY, knownHostsFile: testPin(pin) }, () => true);

/** Every kind of argv that carries G1's words, for one pin file (or none): the tunnel and the exec calls OFF a bridge. No kind has a caller's `extra`. */
const everyKind = (pin: string | undefined): readonly (readonly [string, Argv])[] => [
  ['the tunnel of a bridge, a key', tunnel(pin, 'key')],
  ['the tunnel of a bridge, a password', tunnel(pin, 'askpass')],
  ['a run off a bridge, a key', run(pin, 'key')],
  ['a run off a bridge, a password', run(pin, 'askpass')],
  ['a run off a bridge: a jump host, no pty, the agent taken away, a forward, a port', run(pin, 'key', { jump: 'hop@jump.example.com', noTty: true, ownAgent: false }, BUSY)],
];

/** A bridged exec call: its trust is in its `-F` file, not on the command line. `pinned` says the file holds the entry's pin. */
const bridgedRun = (isPinned: boolean, auth: SshExecAuth, entity: EntityMetadata = HOST): string[] => {
  const argv = buildSshExecArgv(entity, KEY, 'id', auth, { bridged: true, configFile: CONFIG_FILE, pinned: isPinned });
  assert.ok(argv !== undefined, 'expected a bridged argv');
  return argv;
};

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

/** The pairs that E2 adds for a client that knows `KnownHostsCommand` (the plan's §3.10, §3.12): the tests of them are `pinWords.test.ts`. */
const PIN_SOURCES = ['-o', 'VerifyHostKeyDNS=no', '-o', 'KnownHostsCommand=none', '-o', 'LogLevel=ERROR'];

/* --- part 1: what is sent --- */

test('G1: a pinned argv of the tunnel and of an exec call off a bridge names the pin file as BOTH known-hosts files, side by side, and no other host-key word', () => {
  for (const [name, argv] of argvs(PIN)) {
    const at = argv.indexOf('StrictHostKeyChecking=yes') - 1;
    assert.deepEqual(argv.slice(at, at + 6), pinned(PIN), `${name}: the three options do not stand side by side`);
    assert.deepEqual(hostKeyWordsOf(argv), pinned(PIN), name);
  }
});

test('G1: a pin file whose path holds white space is ONE quoted word, the same in both options', () => {
  for (const [name, argv] of argvs(SPACED)) {
    assert.deepEqual(hostKeyWordsOf(argv), pinned(`"${SPACED}"`), `${name}: ssh would read this path as two files`);
  }
});

test('G1: a caller\'s own host-key words in extra come too late: the builder\'s stand first, and ssh takes the first', () => {
  const argv = tunnel(PIN, 'key', HOSTILE_EXTRA) ?? [];
  assert.deepEqual(valuesOf(argv, 'StrictHostKeyChecking'), ['yes', 'no']);
  assert.deepEqual(valuesOf(argv, 'UserKnownHostsFile'), [PIN, '/dev/null']);
  assert.deepEqual(valuesOf(argv, 'GlobalKnownHostsFile'), [PIN, '/dev/null']);
});

/** The function, read through the module object: this file compiles before the function exists, so its absence is a failed assertion. */
function theFunction(): (pin: ReturnType<typeof testPin> | undefined) => string[] {
  const found = (hostKeyPin as Record<string, unknown>).hostKeyWords;
  assert.equal(typeof found, 'function', 'hostKeyPin.ts exports no hostKeyWords');
  return found as (pin: ReturnType<typeof testPin> | undefined) => string[];
}

test('G1: one function writes the words: its three answers', () => {
  const hostKeyWords = theFunction();
  assert.deepEqual(hostKeyWords(undefined), UNPINNED);
  assert.deepEqual(hostKeyWords(testPin(PIN)), [...pinned(PIN), ...PIN_SOURCES]);
  assert.deepEqual(hostKeyWords(testPin(SPACED)), [...pinned(`"${SPACED}"`), ...PIN_SOURCES]);
});

test('G1: and the tunnel and an exec call off a bridge say exactly what it answers', () => {
  const hostKeyWords = theFunction();
  for (const file of [undefined, PIN, SPACED]) {
    const words = hostKeyWords(testPin(file));
    for (const [name, argv] of argvs(file)) {
      const at = argv.indexOf(words[1]) - 1;
      assert.deepEqual(argv.slice(at, at + words.length), words, `${name}, ${String(file)}`);
      assert.deepEqual([...hostKeyWordsOf(argv), ...sourceWordsOf(argv)], words, `${name}, ${String(file)}: another word names one of the six options`);
    }
  }
});

test('an unpinned argv says accept-new and names no known-hosts file', () => {
  for (const [name, argv] of argvs(undefined)) {
    assert.deepEqual(hostKeyWordsOf(argv), UNPINNED, name);
  }
});

test('G1 and E1.6: a bridged exec argv names no known-hosts file: only the strictness, and its `-F` file is the trust source', () => {
  for (const [name, argv] of [['a key', bridgedRun(true, 'key')], ['a password, a busy entry', bridgedRun(true, 'askpass', BUSY)]] as const) {
    assert.deepEqual(hostKeyWordsOf(argv), ['-o', 'StrictHostKeyChecking=yes'], name);
    assert.deepEqual(valuesOf(argv, 'UserKnownHostsFile'), [], name);
    assert.deepEqual(valuesOf(argv, 'GlobalKnownHostsFile'), [], name);
    assert.equal(argv[argv.indexOf('-F') + 1], CONFIG_FILE, name);
  }
  assert.deepEqual(hostKeyWordsOf(bridgedRun(false, 'key')), ['-o', 'StrictHostKeyChecking=accept-new']);
  assert.deepEqual(hostKeyWordsOf(buildSshExecArgv(HOST, KEY, 'id', 'key', { bridged: true, configFile: CONFIG_FILE, pinned: true, knownHostsFile: testPin(PIN) }) ?? []), [], 'a known-hosts file on a bridged call is refused: no argv');
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

test('a pin file whose path holds no white space is the word of before G1, byte for byte: only the third option and E2\'s three pairs are new', () => {
  assert.deepEqual(withoutSources(withoutGlobal(run(PIN, 'key') ?? [])), RUN_BEFORE_G1);
  assert.deepEqual(withoutSources(withoutGlobal(tunnel(PIN, 'key') ?? [])), TUNNEL_BEFORE_G1);
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

const VERSION_ANSWER = ssh(['-V']);
const HAS_SSH = VERSION_ANSWER.error === undefined;

/** Locally a machine with no ssh skips, with the reason; where CI=true nothing skips, so a missing ssh fails. */
const NEEDS_SSH = { skip: HAS_SSH || process.env.CI === 'true' ? false : 'no ssh on the PATH' };

/** A pinned argv of a client that knows `KnownHostsCommand` carries that word: a real `ssh` older than 8.5 ends at it, so these tests skip there (as `NEEDS_SSH`, otherwise). */
const NEEDS_SSH_85 = { skip: NEEDS_SSH.skip === false && !sshKnowsKnownHostsCommand(VERSION_ANSWER.stderr) ? 'the local ssh is older than 8.5: it has no KnownHostsCommand' : NEEDS_SSH.skip };

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

test('G1: under a config that names other known-hosts files, the real ssh resolves every pinned argv to the pin file alone', NEEDS_SSH_85, (t) => {
  for (const [name, argv] of [...argvs(PIN), ['the tunnel with a caller\'s hostile extra', tunnel(PIN, 'key', HOSTILE_EXTRA) ?? []] as const]) {
    assert.deepEqual(resolved(t, argv), onlyFile(PIN), name);
  }
});

test('G1: the real ssh reads a pin file whose path holds white space as ONE file', NEEDS_SSH_85, (t) => {
  for (const [name, argv] of argvs(SPACE_THEN_TILDE)) {
    assert.deepEqual(resolved(t, argv), onlyFile(SPACE_THEN_TILDE), name);
  }
});

test('the control: the same path as a bare word is read as two files, so the test above can show the fault', NEEDS_SSH, (t) => {
  const bare = ['-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${SPACE_THEN_TILDE}`, '--', 'dev@build.example.com'];
  const answer = asked(t, '', bare);
  const user = answer.stdout.split(/\r?\n/).filter((line) => line.startsWith('userknownhostsfile '));
  // POSIX: two names, the second with its `~` expanded. Win32-OpenSSH 9.5: no line at all, `tilde_expand: No such user`.
  assert.notDeepEqual(user, [`userknownhostsfile ${SPACE_THEN_TILDE}`], `the bare word was read as one file: ${answer.stderr}`);
});

/* --- the bridged road, with the real client (E1.6's file) --- */

/** The file of a bridged call that is pinned (the destination block) or not (first contact): what the real writer makes, for the host of `HOST`. */
function bridgedFileText(pinnedFile: string | undefined): string {
  const made = bridgedConfigText({
    hops: [],
    destination: { host: HOST.host as string, ...(pinnedFile === undefined ? {} : { pinnedFile }) },
    noDefaultIdentity: fakePath('keys/no-default-identity'),
    firstContactFile: fakePath('bridges/known_hosts'),
    personKnownHosts: fakePath('home/.ssh/known_hosts'),
  });
  assert.ok(made.ok, 'the writer refused the input');
  return made.text;
}

/** What `ssh -G` prints about the check for a bridged argv: its own `-F` file is the one written by `bridgedConfigText`, under `text`. */
function resolvedBridged(t: TestContext, argv: readonly string[], text: string): string[] {
  const file = ownedFile(t, 'hkw', 'bridged_config');
  fs.writeFileSync(file, text);
  const own = argv.map((word) => (word === CONFIG_FILE ? file : word));
  const answer = ssh(['-G', ...own]);
  assert.equal(answer.status, 0, `ssh -G did not resolve the bridged argv: ${answer.error ?? answer.stderr}`);
  return answer.stdout.split(/\r?\n/).filter((line) => /^(stricthostkeychecking|userknownhostsfile|globalknownhostsfile) /.test(line)).sort();
}

test('E1.6 closes G1\'s P1 on the bridged road: a pinned bridged call resolves to the pin file alone and NO system-wide file', NEEDS_SSH, (t) => {
  const resolvedPinned = resolvedBridged(t, bridgedRun(true, 'key'), bridgedFileText(PIN));
  assert.deepEqual(resolvedPinned, ['globalknownhostsfile none', 'stricthostkeychecking true', `userknownhostsfile ${PIN}`]);
});

test('E1.6: a bridged call with no pin trusts first contact in its own file and the person\'s, and no system-wide file', NEEDS_SSH, (t) => {
  const resolvedFirst = resolvedBridged(t, bridgedRun(false, 'key'), bridgedFileText(undefined));
  assert.ok(resolvedFirst.includes('globalknownhostsfile none'), resolvedFirst.join(' | '));
  assert.ok(resolvedFirst.some((line) => line.startsWith('userknownhostsfile ') && line.includes('bridges/known_hosts') && line.includes('.ssh/known_hosts')), resolvedFirst.join(' | '));
  assert.ok(resolvedFirst.includes('stricthostkeychecking accept-new'), resolvedFirst.join(' | ')); // the argv's word (first contact) is taken before the file's
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

/**
 * The shipped files that name strict checking as `StrictHostKeyChecking=` with ANY value, also a template (`StrictHostKeyChecking=${…}`), each with the reason it is
 * no second writer of the words of a pinned call. Prose that quotes the option matches too, so a comment is listed with the code beside it.
 */
const STRICT_PLACES = new Map<string, string>([
  ['hostKeyPin.ts', 'hostKeyWords: the one writer of the six words'],
  ['sshCommand.ts', "the line of a Connect terminal, shell words per platform: the pin as the person's file only, until candidate C4 of the plan"],
  ['sshExecCommand.ts', 'execHostKeyWords: the one word of a BRIDGED exec (accept-new, or yes with a pin); the pin and GlobalKnownHostsFile none are in its -F file (E1.6)'],
  ['gitRemote.ts', 'GIT_SSH_COMMAND of a git remote: accept-new, no pin'],
  ['remoteLaunch.ts', 'a comment on the password branch without a pin: accept-new'],
  ['sshAskpass.ts', 'a comment on the askpass helper: accept-new'],
  ['sshSession.ts', 'a comment on the password branch without a pin: accept-new'],
]);
const STRICT_WORD = /StrictHostKeyChecking\s*=/;
/** The same words as the keyword tuples of an `ssh` config file: `['UserKnownHostsFile', …]`, `keyword('GlobalKnownHostsFile', …)`. */
const KEYWORD_TUPLE = /['"](?:User|Global)KnownHostsFile['"]|['"]StrictHostKeyChecking['"]/;

test('G1: the known-hosts options and strict checking are spelled in one function, and at the reviewed places of Connect\'s line, the bridged exec word and the bridge\'s -F file', () => {
  assert.ok(SOURCES.length > 100, `the discovery found only ${SOURCES.length} files`);
  // `Name=value` only: prose may name an option (`UserKnownHostsFile`). `sshCommand.ts` is the line of a Connect terminal, shell words
  // per platform: it says the pin as the person's file only, until candidate C4 of the plan gives it these words.
  assert.deepEqual(filesWith(/UserKnownHostsFile\s*=/), ['hostKeyPin.ts', 'sshCommand.ts'], HOW_TO_FIX);
  assert.deepEqual(filesWith(STRICT_WORD), [...STRICT_PLACES.keys()].sort(), HOW_TO_FIX);
  assert.deepEqual(filesWith(/GlobalKnownHostsFile\s*=/), ['hostKeyPin.ts'], HOW_TO_FIX);
  // The keyword tuples: only the -F file of a bridged exec (E1.6, `bridgedSshConfig.ts`) writes them, and its `Host *` block says `GlobalKnownHostsFile none`.
  assert.deepEqual(filesWith(KEYWORD_TUPLE), ['bridgedSshConfig.ts'], HOW_TO_FIX);
  // The scan still finds what it was widened for: a template with a value of its own, and a keyword tuple. A scan that matches nothing proves nothing.
  assert.match('-o StrictHostKeyChecking=${options.pinned === true ? "yes" : "accept-new"}', STRICT_WORD);
  assert.match("['UserKnownHostsFile', pinned]", KEYWORD_TUPLE);
  assert.ok(filesWith(STRICT_WORD).includes('sshExecCommand.ts'), 'the widened scan does not find the template of sshExecCommand.ts');
  assert.ok(filesWith(KEYWORD_TUPLE).includes('bridgedSshConfig.ts'), 'the widened scan does not find the keyword tuples of bridgedSshConfig.ts');
});

test('G1: and that function is called by the tunnel\'s builder and by the exec words off a bridge, and by nothing else', () => {
  // `execHostKeyWords` is called by `buildSshExecArgv` for every exec call; on a bridged call it answers #365's single word and never calls `hostKeyWords`.
  // Change 11.1, S1: the note's one-shot ssh takes the bridge's host-key words (buildNoteArgv).
  assert.deepEqual(usesOf('hostKeyWords', 'hostKeyPin'), ['sshBridge.ts#buildBridgeArgv', 'sshBridge.ts#buildNoteArgv', 'sshExecCommand.ts#execHostKeyWords'], HOW_TO_FIX);
});
