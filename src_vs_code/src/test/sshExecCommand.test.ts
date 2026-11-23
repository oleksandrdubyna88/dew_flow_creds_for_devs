import assert from 'node:assert/strict';
import { testPin } from './pinnedArgv';
import { test } from 'node:test';
import * as execCommand from '../sshExecCommand';
import {
  BRIDGED_SSH_OPTIONS,
  MAX_REMOTE_COMMAND_CHARS,
  type SshExecOptions,
  buildSshExecArgv,
  validateRemoteCommand,
} from '../sshExecCommand';
import { EntityMetadata } from '../types';
import { KEY_FILE } from './fakePaths';
import { TWO, saysNoSharingBefore, sharingWords } from './noSharingArgv';

const entity = (over: Partial<EntityMetadata> = {}): EntityMetadata => ({
  id: 'e1',
  name: 'prod',
  host: 'example.com',
  user: 'deploy',
  isSshEnabled: true,
  ...over,
});

/**
 * The agent's command reaches ssh as ONE argv element and is parsed only by
 * the remote shell. These assertions are what keeps it that way.
 */

test('the remote command is the last element, verbatim and unquoted', () => {
  const argv = buildSshExecArgv(entity(), undefined, 'echo "hi there" | wc -c');

  assert.equal(argv?.at(-1), 'echo "hi there" | wc -c');
  assert.equal(argv?.at(-2), 'deploy@example.com');
});

test('key auth gets BatchMode, so an unattended call fails instead of hanging', () => {
  const argv = buildSshExecArgv(entity(), KEY_FILE, 'true', 'key') ?? [];

  assert.equal(argv.includes('BatchMode=yes'), true);
  assert.equal(argv.includes('StrictHostKeyChecking=accept-new'), true);
});

test('askpass auth does NOT get BatchMode — it would disable the password prompt', () => {
  // BatchMode has historically meant "never ask for a password" by zeroing
  // NumberOfPasswordPrompts, which is exactly the prompt askpass answers. The
  // password branch therefore takes the human path's options and adds a single
  // attempt, so a wrong stored password fails once instead of three times.
  const argv = buildSshExecArgv(entity(), undefined, 'true', 'askpass') ?? [];

  assert.equal(argv.includes('BatchMode=yes'), false);
  assert.equal(argv.includes('NumberOfPasswordPrompts=1'), true);
  assert.equal(argv.includes('StrictHostKeyChecking=accept-new'), true);
});

test('the default is the safe one: no password in play means BatchMode', () => {
  const argv = buildSshExecArgv(entity(), undefined, 'true') ?? [];
  assert.equal(argv.includes('BatchMode=yes'), true);
});

// eslint-disable-next-line complexity
test('-i appears only with a key path, -p only for a non-default port', () => {
  const plain = buildSshExecArgv(entity(), undefined, 'true') ?? [];
  assert.equal(plain.includes('-i'), false);
  assert.equal(plain.includes('-p'), false);

  const keyed = buildSshExecArgv(entity({ port: 2222 }), KEY_FILE, 'true') ?? [];
  assert.equal(keyed[keyed.indexOf('-i') + 1], KEY_FILE);
  assert.equal(keyed[keyed.indexOf('-p') + 1], '2222');

  // An empty key path is "no key", not `-i ""`.
  const empty = buildSshExecArgv(entity(), '', 'true') ?? [];
  assert.equal(empty.includes('-i'), false);

  // The default port is left out, exactly like the interactive builder.
  const defaultPort = buildSshExecArgv(entity({ port: 22 }), undefined, 'true') ?? [];
  assert.equal(defaultPort.includes('-p'), false);
});

test('a host-less entity produces no argv at all', () => {
  assert.equal(buildSshExecArgv(entity({ host: undefined }), undefined, 'true'), undefined);
});

test('a user-less entity targets the bare host', () => {
  const argv = buildSshExecArgv(entity({ user: undefined }), undefined, 'true') ?? [];
  assert.equal(argv.at(-2), 'example.com');
});

test('command validation refuses what must never reach spawn', () => {
  assert.deepEqual(validateRemoteCommand('ls -la'), { ok: true });
  assert.equal(validateRemoteCommand('').ok, false);
  assert.equal(validateRemoteCommand(42).ok, false);
  assert.equal(validateRemoteCommand(undefined).ok, false);
  assert.equal(validateRemoteCommand('ls\0-la').ok, false);
  assert.equal(validateRemoteCommand('x'.repeat(MAX_REMOTE_COMMAND_CHARS + 1)).ok, false);
  assert.equal(validateRemoteCommand('x'.repeat(MAX_REMOTE_COMMAND_CHARS)).ok, true);
});

test('the destination is preceded by -- so a dashed host cannot become an ssh option', () => {
  // Proven, not assumed: with the host as a bare positional, OpenSSH 10.3 ran
  // `-oProxyCommand=…` as a local command and it wrote its marker file.
  const argv = buildSshExecArgv(entity(), undefined, 'uname -a', 'askpass') ?? [];
  const dashDash = argv.indexOf('--');

  assert.notEqual(dashDash, -1, 'no -- means ssh parses the destination as options');
  assert.equal(argv[dashDash + 1], 'deploy@example.com');
  assert.equal(argv[dashDash + 2], 'uname -a');
});

test('a host that reads as an option is refused outright, whatever -- would do', () => {
  // Belt and braces: -- is honoured by current OpenSSH, but the entity carrying
  // such a host arrived from sync or a share and has no legitimate use.
  assert.equal(buildSshExecArgv(entity({ host: '-oProxyCommand=sh -c id' }), undefined, 'true', 'askpass'), undefined);
  assert.equal(buildSshExecArgv(entity({ host: 'a.com; id' }), undefined, 'true', 'askpass'), undefined);
  assert.equal(buildSshExecArgv(entity({ user: 'root; id' }), undefined, 'true', 'askpass'), undefined);
});

/* ---------------------------------------------------------------------------------------------------------------
 * Amendment 3, C.1-C.2 (F1, F2) — a bridged call is ONE fresh connection that forwards nothing
 * ------------------------------------------------------------------------------------------------------------- */

const argvWith = (e: EntityMetadata, options: SshExecOptions, auth: 'key' | 'askpass' = 'key', keyPath?: string): string[] => {
  const argv = buildSshExecArgv(e, keyPath, 'id', auth, options);
  assert.notEqual(argv, undefined);
  return argv as string[];
};

/** The six options of a bridged call, spelled out once more here on purpose: the constant is pinned to this, not to itself. */
const SIX = ['-o', 'ForwardAgent=no', '-o', 'ControlPath=none', '-o', 'ControlMaster=no', '-o', 'ClearAllForwardings=yes', '-o', 'ForwardX11=no', '-o', 'Tunnel=no'];

/** Where the six options stand together, in order, or -1. */
const sixAt = (argv: readonly string[]): number => argv.findIndex((_, i) => SIX.every((arg, k) => argv[i + k] === arg));

const everything = entity({
  agentForward: true,
  portForwards: [
    { kind: 'local', bindPort: 8080, host: 'db', hostPort: 5432 },
    { kind: 'remote', bindPort: 9000, host: 'intranet.example', hostPort: 443 },
  ],
});

test('C.1: BRIDGED_SSH_OPTIONS is the six options, in this order, and nothing else', () => {
  assert.deepEqual([...BRIDGED_SSH_OPTIONS], SIX);
});

test('F1: a bridged argv keeps the jump, forwards nothing, then the six options, then the key and the destination', () => {
  const argv = argvWith(everything, { jump: 'hop@jump.example.com', bridged: true, configFile: 'c.conf' }, 'key', KEY_FILE);
  const joined = argv.join(' ');
  for (const forbidden of ['-A', '-L', '-R', '-D']) {
    assert.ok(!argv.includes(forbidden), `${forbidden} is not sent on a bridge: ${joined}`);
  }
  assert.ok(!argv.some((arg) => arg.startsWith('8080') || arg.includes('intranet.example')), `no forward leaks in another spelling: ${joined}`);
  const at = sixAt(argv);
  assert.notEqual(at, -1, `the six options stand together, in order: ${joined}`);
  assert.ok(argv.indexOf('-J') !== -1 && argv.indexOf('-J') < at, 'the jump the composer made comes first');
  assert.equal(argv[argv.indexOf('-J') + 1], 'hop@jump.example.com', 'and stays: -J is not a forwarding');
  assert.ok(at + SIX.length <= argv.indexOf('-i'), 'then the key');
  assert.ok(argv.indexOf('-i') < argv.indexOf('--'), 'and the destination last');
});

test('F1: off a bridge the same entry keeps -J -A -L … -R …, then says the two no-sharing options, and none of the other four', () => {
  const argv = argvWith(everything, { jump: 'hop@jump.example.com' });
  assert.deepEqual(argv.slice(argv.indexOf('-J'), argv.indexOf('--')), ['-J', 'hop@jump.example.com', '-A', '-L', '8080:db:5432', '-R', '9000:intranet.example:443', ...TWO]);
  for (const word of ['ForwardAgent=no', 'ClearAllForwardings=yes', 'ForwardX11=no', 'Tunnel=no']) {
    assert.ok(!argv.includes(word), `${word} is not sent off a bridge: ${argv.join(' ')}`);
  }
});

test('F1: the six options ride both authentication branches of a bridged call', () => {
  for (const auth of ['key', 'askpass'] as const) {
    assert.notEqual(sixAt(argvWith(entity(), { bridged: true, configFile: 'c.conf' }, auth)), -1, auth);
  }
});

test('F2: { bridged: false } and {} send the two no-sharing options and none of the other four, and an entry that forwards keeps its own -A', () => {
  for (const options of [{ jump: 'hop@jump.example.com', bridged: false }, {}]) {
    const argv = argvWith(entity({ agentForward: true }), options);
    assert.deepEqual(SIX.filter((arg) => arg !== '-o' && argv.includes(arg)), ['ControlPath=none', 'ControlMaster=no'], `of the six, the two and only they: ${argv.join(' ')}`);
    assert.ok(argv.includes('-A'), 'control: the entry\'s own flag still gives -A');
  }
});

/* ---------------------------------------------------------------------------------------------------------------
 * The re-review of epoch 4 (T1, F1; parent D16, D17 (b)) — what E3's two roads ask of the builder. These say what is SENT:
 * whether `-T` or the missing `-A` does anything is a fact about the person's ssh, and hand check 3 observes it.
 * ------------------------------------------------------------------------------------------------------------- */

test('no_tty_is_said_first_and_only_when_the_caller_asks', () => {
  for (const auth of ['key', 'askpass'] as const) {
    const asked = argvWith(everything, { noTty: true, jump: 'hop@jump.example.com' }, auth, KEY_FILE);
    const plain = argvWith(everything, { jump: 'hop@jump.example.com' }, auth, KEY_FILE);
    assert.equal(asked[0], '-T', `${auth}: -T is the first word: ${asked.join(' ')}`);
    assert.equal(asked.filter((arg) => arg === '-T').length, 1, `${auth}: exactly one -T`);
    for (const forbidden of ['-t', '-tt', 'EscapeChar=none']) {
      assert.ok(!asked.includes(forbidden), `${auth}: ${forbidden} is not sent: ${asked.join(' ')}`);
    }
    assert.deepEqual(asked.slice(1), plain, `${auth}: the option adds one word and moves nothing`);
    for (const options of [{}, { noTty: false }]) {
      const quiet = argvWith(everything, options, auth, KEY_FILE);
      assert.ok(!quiet.includes('-T'), `${auth}: no -T unless asked: ${quiet.join(' ')}`);
      assert.equal(quiet[0], '-o', `${auth}: today's first word`);
    }
  }
});

test('a_forwarding_entry_with_no_agent_of_ours_gets_no_dash_a_and_forward_agent_no', () => {
  const pairs = (argv: readonly string[]): number => argv.filter((arg, i) => arg === '-o' && argv[i + 1] === 'ForwardAgent=no').length;
  const forwardsOne = entity({ agentForward: true, portForwards: [{ kind: 'local', bindPort: 8080, host: 'db', hostPort: 5432 }] });

  const none = argvWith(forwardsOne, { ownAgent: false });
  assert.ok(!none.includes('-A'), `no -A while our agent is not up: ${none.join(' ')}`);
  assert.equal(pairs(none), 1, `the pair -o ForwardAgent=no stands once: ${none.join(' ')}`);
  assert.deepEqual(none.slice(none.indexOf('-L'), none.indexOf('-L') + 2), ['-L', '8080:db:5432'], 'the forward is still there');

  const ours = argvWith(forwardsOne, { ownAgent: true });
  assert.ok(ours.includes('-A'), `our agent serves: -A: ${ours.join(' ')}`);
  assert.equal(pairs(ours), 0, 'and no ForwardAgent=no');

  const today = argvWith(forwardsOne, {});
  assert.ok(today.includes('-A'), 'no ownAgent: today\'s argv');
  assert.equal(pairs(today), 0);

  const quiet = argvWith(entity(), { ownAgent: false });
  assert.ok(!quiet.includes('-A') && pairs(quiet) === 0 && !quiet.includes('ForwardAgent=no'), `an entry that does not forward gets neither word: ${quiet.join(' ')}`);

  const bridged = argvWith(everything, { bridged: true, configFile: 'c.conf', ownAgent: false });
  assert.equal(sixAt(bridged) !== -1 && pairs(bridged) === 1, true, `a bridged call keeps its six options, and no second pair: ${bridged.join(' ')}`);
  assert.deepEqual(bridged, argvWith(everything, { bridged: true, configFile: 'c.conf' }), 'ownAgent changes nothing on a bridge');
});

/* ---------------------------------------------------------------------------------------------------------------
 * E1.6 B6 (A1-A9) — what a bridged argv says: the file, the pin in the file, the password words, the Host word, and the rules a value must pass
 * ------------------------------------------------------------------------------------------------------------- */

const BRIDGED = { bridged: true, configFile: 'c.conf' } as const;

test('A1: a bridged key call with a jump and a port has the words of B6, in order', () => {
  const argv = argvWith(entity({ port: 2222 }), { ...BRIDGED, jump: 'hop@jump.example.com' }, 'key', KEY_FILE);

  assert.deepEqual(argv, [
    '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=10',
    '-J', 'hop@jump.example.com', ...SIX, '-F', 'c.conf', '-i', KEY_FILE, '-p', '2222', '--', 'deploy@example.com', 'id',
  ]);
});

test('A2: a bridged call with no configFile is refused', () => {
  assert.equal(buildSshExecArgv(entity(), KEY_FILE, 'id', 'key', { bridged: true }), undefined);
  assert.equal(buildSshExecArgv(entity(), KEY_FILE, 'id', 'askpass', { bridged: true }), undefined);
});

test('A3: a pinned bridged call says StrictHostKeyChecking=yes, no word starts with UserKnownHostsFile=, and -i is there', () => {
  const argv = argvWith(entity(), { ...BRIDGED, pinned: true }, 'key', KEY_FILE);

  assert.ok(argv.includes('StrictHostKeyChecking=yes'), argv.join(' '));
  assert.ok(!argv.includes('StrictHostKeyChecking=accept-new'));
  assert.deepEqual(argv.filter((word) => word.startsWith('UserKnownHostsFile=')), []);
  assert.equal(argv[argv.indexOf('-i') + 1], KEY_FILE);
});

test('A4: a bridged call that is given a known-hosts file is refused', () => {
  assert.equal(buildSshExecArgv(entity(), KEY_FILE, 'id', 'key', { ...BRIDGED, knownHostsFile: testPin('/p/known_hosts') }), undefined);
});

test('A5: a bridged password call has the three password words after the six and before -F, and no word names PubkeyAuthentication', () => {
  const argv = argvWith(entity(), { ...BRIDGED, pinned: true }, 'askpass');

  assert.deepEqual(argv.slice(0, 2), ['-o', 'NumberOfPasswordPrompts=1']);
  const six = sixAt(argv);
  assert.deepEqual(argv.slice(six + SIX.length, six + SIX.length + 8), ['-o', 'BatchMode=no', '-o', 'PasswordAuthentication=yes', '-o', 'KbdInteractiveAuthentication=yes', '-F', 'c.conf']);
  assert.ok(!argv.some((word) => word.includes('PubkeyAuthentication')));
  assert.ok(!argvWith(entity(), BRIDGED, 'key').includes('PasswordAuthentication=yes'), 'a key call has none of them');
});

test('A6: off a bridge a configFile or a pinned flag changes nothing: today\'s argv', () => {
  const plain = argvWith(entity(), { jump: 'hop@jump.example.com', knownHostsFile: testPin('/p/known_hosts') }, 'key', KEY_FILE);

  assert.deepEqual(argvWith(entity(), { jump: 'hop@jump.example.com', knownHostsFile: testPin('/p/known_hosts'), configFile: 'c.conf', pinned: false }, 'key', KEY_FILE), plain);
  // G1 (§3.9) changes today's pinned off-bridge argv on purpose: the pin file is ALSO the system-wide known-hosts file, so no
  // `/etc/ssh/ssh_known_hosts` entry passes beside it. The six words are `hostKeyWords`'s; the test of that rule is `hostKeyWords.test.ts`.
  // E2 (§3.10, §3.12) adds three pairs behind them, for a client that knows `KnownHostsCommand`: the test of that rule is `pinWords.test.ts`.
  assert.deepEqual(plain.slice(0, 16), ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'UserKnownHostsFile=/p/known_hosts', '-o', 'GlobalKnownHostsFile=/p/known_hosts',
    '-o', 'VerifyHostKeyDNS=no', '-o', 'KnownHostsCommand=none', '-o', 'LogLevel=ERROR', '-o', 'ConnectTimeout=10']);
  assert.ok(!plain.includes('-F'));
});

test('A7: a bridged destination [::1] and ::1, with a user, are the word u@::1; off a bridge each is as typed', () => {
  for (const host of ['[::1]', '::1']) {
    const argv = argvWith(entity({ host, user: 'u' }), BRIDGED, 'key');
    assert.equal(argv.at(-2), 'u@::1', host);
  }
  assert.equal(argvWith(entity({ host: '[::1]', user: 'u' }), {}, 'key').at(-2), 'u@[::1]');
  assert.equal(argvWith(entity({ host: '::1', user: 'u' }), {}, 'key').at(-2), 'u@::1');
});

test('A8: a bridged destination user with $ or a backslash is refused, a plain one is not; off a bridge CORP\\alice runs as today', () => {
  const results = ['$BRIDGE_PROBE', 'CORP\\alice', 'alice', 'alice-name'].map((user) => buildSshExecArgv(entity({ user }), undefined, 'id', 'key', BRIDGED) !== undefined);

  assert.deepEqual(results, [false, false, true, true]);
  assert.equal(argvWith(entity({ user: 'CORP\\alice' }), {}, 'key').at(-2), 'CORP\\alice@example.com');
});

test('A9: a bridged key path with %, with ${ and a host with a port are refused', () => {
  assert.equal(buildSshExecArgv(entity(), '/k/%u/id', 'id', 'key', BRIDGED), undefined);
  assert.equal(buildSshExecArgv(entity(), '/k/${X}/id', 'id', 'key', BRIDGED), undefined);
  assert.equal(buildSshExecArgv(entity({ host: 'gw:2201' }), KEY_FILE, 'id', 'key', BRIDGED), undefined);
  assert.notEqual(buildSshExecArgv(entity(), '/k/~/id', 'id', 'key', BRIDGED), undefined, 'control: a plain path is an argv');
});

/* ---------------------------------------------------------------------------------------------------------------
 * G2 (`PLAN_bridge_no_connection_sharing.md` §4.3, §7.2) — every run shares no connection. These say what is SENT; what the
 * two options do is asked of a real ssh (`noConnectionSharing.test.ts`) and of a real sshd (section 9 of the SSH agent itest).
 * ------------------------------------------------------------------------------------------------------------- */

/** What a caller can say, one list per thing. `entry` is a plain entry, and one with `-A` and two forwards. */
const AXES = {
  auth: ['key', 'askpass'],
  bridged: [undefined, false, true],
  noTty: [undefined, true],
  ownAgent: [undefined, false, true],
  jump: [undefined, 'hop@jump.example.com'],
  entry: [entity(), everything],
  pin: [undefined, '/keys/known_hosts'],
  key: [undefined, KEY_FILE],
  port: [undefined, 2222],
} as const;

const SIZES = Object.values(AXES).map((list) => list.length);

/** How many argvs the lists make: every combination. */
const COMBINATIONS = SIZES.reduce((count, size) => count * size, 1);

/** Digit `i` of `n`, read as a number with one digit per list. */
const digit = (n: number, i: number): number => Math.floor(n / SIZES.slice(0, i).reduce((count, size) => count * size, 1)) % SIZES[i];

interface Run {
  readonly label: string;
  readonly argv: string[];
}

/** The argv of combination `n`, and a label that names it. */
function runOf(n: number): Run {
  const c = {
    auth: AXES.auth[digit(n, 0)],
    bridged: AXES.bridged[digit(n, 1)],
    noTty: AXES.noTty[digit(n, 2)],
    ownAgent: AXES.ownAgent[digit(n, 3)],
    jump: AXES.jump[digit(n, 4)],
    entry: AXES.entry[digit(n, 5)],
    pin: AXES.pin[digit(n, 6)],
    key: AXES.key[digit(n, 7)],
    port: AXES.port[digit(n, 8)],
  };
  // A bridged call (E1.6) names its per-call file and carries its pin in it, so it takes no known-hosts file: `pinned` says which check it asks for.
  const placed: SshExecOptions = c.bridged ? { configFile: 'c.conf', pinned: c.pin !== undefined } : { knownHostsFile: testPin(c.pin) };
  const options: SshExecOptions = { bridged: c.bridged, noTty: c.noTty, ownAgent: c.ownAgent, jump: c.jump, ...placed };
  const argv = buildSshExecArgv({ ...c.entry, port: c.port }, c.key, 'id', c.auth, options);
  assert.notEqual(argv, undefined);
  const label = JSON.stringify({ ...c, entry: c.entry === everything ? 'forwards' : 'plain' }, (_key, value: unknown) => value ?? null);
  return { label, argv: argv ?? [] };
}

const everyRun = (): Run[] => Array.from({ length: COMBINATIONS }, (_, n) => runOf(n));

test('G2: NO_CONNECTION_SHARING is the two options, in this order, and nothing else', () => {
  // Read through the module object, so this file compiles before the constant exists and the first failure is an assertion.
  const exported: Record<string, unknown> = { ...execCommand };
  assert.deepEqual(exported.NO_CONNECTION_SHARING, TWO);
});

test('G2: every run says ControlPath=none and ControlMaster=no exactly once, side by side, before -i, -p and --', () => {
  const runs = everyRun();
  assert.equal(runs.length, 1152, 'every combination of the nine lists');
  assert.equal(new Set(runs.map((run) => run.label)).size, runs.length, 'no combination twice');
  const offenders = runs.filter((run) => !saysNoSharingBefore(run.argv, ['-i', '-p', '--']));
  assert.deepEqual(
    offenders.slice(0, 1).map((run) => `${run.label}: ${run.argv.join(' ')}`),
    [],
    `${offenders.length} of ${runs.length} argvs do not say the two options once, before -i, -p and --`,
  );
});

test('G2: no other word of a run names connection sharing', () => {
  const offenders = everyRun().flatMap((run) => sharingWords(run.argv).map((word) => `${word} in ${run.label}`));
  assert.deepEqual(offenders.slice(0, 3), [], `${offenders.length} words name sharing beside the two options`);
});

test('G2: the scan for sharing words finds each spelling, and leaves the two options alone', () => {
  const planted = ['-o', 'controlmaster=auto', '-oControlPath=/x', '-o', 'ControlPersist=60', '-S', '/y', '-M', '-O', 'exit', ...TWO, '--', 'host', '-S'];
  assert.deepEqual(sharingWords(planted), ['controlmaster=auto', '-oControlPath=/x', 'ControlPersist=60', '-S', '-M', '-O']);
  assert.deepEqual(sharingWords(planted, [1, 2]), ['ControlPersist=60', '-S', '-M', '-O'], 'the indexes a caller owns are skipped');
  assert.equal(saysNoSharingBefore(planted, ['--']), true, 'control: the two options of the planted argv are found');
  assert.equal(saysNoSharingBefore([...TWO, ...planted], ['--']), false, 'twice is not once');
  assert.equal(saysNoSharingBefore(planted, ['-M']), false, 'after a word of `before` is not before it');
});

/**
 * The bridged argvs of E1.6 (the per-call `-F c.conf`, the pin in that file, no known-hosts option), as `main` at b84416aa
 * (extension 1.22.2) had them before G2 save for E1.6's own changes: G2 changes no bridged call, which already said the two options.
 */
const BRIDGED_KEY_BEFORE_G2 = [
  '-T', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10',
  '-J', 'hop@jump.example.com',
  '-o', 'ForwardAgent=no', '-o', 'ControlPath=none', '-o', 'ControlMaster=no', '-o', 'ClearAllForwardings=yes', '-o', 'ForwardX11=no', '-o', 'Tunnel=no',
  '-F', 'c.conf', '-i', KEY_FILE, '-p', '2222', '--', 'deploy@example.com', 'id',
];
const BRIDGED_ASKPASS_BEFORE_G2 = [
  '-o', 'NumberOfPasswordPrompts=1', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=10',
  '-o', 'ForwardAgent=no', '-o', 'ControlPath=none', '-o', 'ControlMaster=no', '-o', 'ClearAllForwardings=yes', '-o', 'ForwardX11=no', '-o', 'Tunnel=no',
  '-o', 'BatchMode=no', '-o', 'PasswordAuthentication=yes', '-o', 'KbdInteractiveAuthentication=yes', '-F', 'c.conf',
  '--', 'deploy@example.com', 'id',
];

test('G2: a bridged argv is byte for byte the one before G2', () => {
  const pinned = { jump: 'hop@jump.example.com', bridged: true, noTty: true, configFile: 'c.conf', pinned: true };
  assert.deepEqual(argvWith({ ...everything, port: 2222 }, pinned, 'key', KEY_FILE), BRIDGED_KEY_BEFORE_G2);
  assert.deepEqual(argvWith(entity(), { bridged: true, configFile: 'c.conf' }, 'askpass'), BRIDGED_ASKPASS_BEFORE_G2);
});
