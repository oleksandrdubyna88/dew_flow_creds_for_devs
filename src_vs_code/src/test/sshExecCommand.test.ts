import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_REMOTE_COMMAND_CHARS,
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
