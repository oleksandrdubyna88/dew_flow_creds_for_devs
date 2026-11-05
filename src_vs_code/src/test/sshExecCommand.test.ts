import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BRIDGED_SSH_OPTIONS,
  MAX_REMOTE_COMMAND_CHARS,
  type SshExecOptions,
  buildSshExecArgv,
  validateRemoteCommand,
} from '../sshExecCommand';
import { EntityMetadata } from '../types';

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
  const argv = buildSshExecArgv(entity(), '/tmp/k.key', 'true', 'key') ?? [];

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

  const keyed = buildSshExecArgv(entity({ port: 2222 }), '/tmp/k.key', 'true') ?? [];
  assert.equal(keyed[keyed.indexOf('-i') + 1], '/tmp/k.key');
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
  const argv = argvWith(everything, { jump: 'hop@jump.corp.com', bridged: true }, 'key', '/tmp/k.key');
  const joined = argv.join(' ');
  for (const forbidden of ['-A', '-L', '-R', '-D']) {
    assert.ok(!argv.includes(forbidden), `${forbidden} is not sent on a bridge: ${joined}`);
  }
  assert.ok(!argv.some((arg) => arg.startsWith('8080') || arg.includes('intranet.example')), `no forward leaks in another spelling: ${joined}`);
  const at = sixAt(argv);
  assert.notEqual(at, -1, `the six options stand together, in order: ${joined}`);
  assert.ok(argv.indexOf('-J') !== -1 && argv.indexOf('-J') < at, 'the jump the composer made comes first');
  assert.equal(argv[argv.indexOf('-J') + 1], 'hop@jump.corp.com', 'and stays: -J is not a forwarding');
  assert.ok(at + SIX.length <= argv.indexOf('-i'), 'then the key');
  assert.ok(argv.indexOf('-i') < argv.indexOf('--'), 'and the destination last');
});

test('F1: off a bridge the same entry is byte for byte today\'s — -J -A -L … -R … and none of the six options', () => {
  const argv = argvWith(everything, { jump: 'hop@jump.corp.com' });
  assert.deepEqual(argv.slice(argv.indexOf('-J'), argv.indexOf('--')), ['-J', 'hop@jump.corp.com', '-A', '-L', '8080:db:5432', '-R', '9000:intranet.example:443']);
  for (const word of ['ForwardAgent=no', 'ControlPath=none', 'ControlMaster=no', 'ClearAllForwardings=yes', 'ForwardX11=no', 'Tunnel=no']) {
    assert.ok(!argv.includes(word), `${word} is not sent off a bridge: ${argv.join(' ')}`);
  }
});

test('F1: the six options ride both authentication branches of a bridged call', () => {
  for (const auth of ['key', 'askpass'] as const) {
    assert.notEqual(sixAt(argvWith(entity(), { bridged: true }, auth)), -1, auth);
  }
});

test('F2: { bridged: false } and {} send none of the six, and an entry that forwards keeps its own -A', () => {
  for (const options of [{ jump: 'hop@jump.corp.com', bridged: false }, {}]) {
    const argv = argvWith(entity({ agentForward: true }), options);
    assert.deepEqual(SIX.filter((arg) => arg !== '-o' && argv.includes(arg)), [], `nothing of the six: ${argv.join(' ')}`);
    assert.ok(argv.includes('-A'), 'control: the entry\'s own flag still gives -A');
  }
});
