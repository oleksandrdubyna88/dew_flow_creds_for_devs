import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EntityMetadata } from '../types';
import {
  bridgeId,
  buildBridgeArgv,
  describeWideSocket,
  isOwnerOnlyMode,
  modeCheckCommand,
  remoteInstructions,
  remoteSocketPath,
  safeUserComponent,
  sweepCommand,
} from '../sshBridge';

/**
 * The `ssh -R` bridge that makes the broker reachable from a Remote-SSH host.
 *
 * <p>Every flag here has a failure behind it, and the ones about the socket are security
 * properties rather than tidiness: the forwarded socket is an opening into the broker on
 * somebody's laptop, and on a shared build host the file permissions are the only thing
 * standing between it and the other people logged in.</p>
 */

const HOST: EntityMetadata = {
  id: 'e1',
  name: 'build box',
  host: 'build.example.com',
  user: 'dev',
  isSshEnabled: true,
} as EntityMetadata;

const SAFE = (): boolean => true;

function argv(overrides: Partial<Parameters<typeof buildBridgeArgv>[1]> = {}): string[] {
  const built = buildBridgeArgv(
    HOST,
    { port: 51234, remote: { path: '/tmp/creds-dev-abc.sock' }, ...overrides },
    SAFE,
  );
  assert.ok(built !== undefined, 'expected an argv');
  return built;
}

test('the forward goes to the loopback PORT, not to a local socket', () => {
  // The obvious `-R remote.sock:local.sock` cannot work from Windows, where our local endpoint
  // is a named pipe and OpenSSH has no way to forward to one. Forwarding to the port is
  // accepted everywhere, so there is one form rather than two and a Windows path that would
  // be the untested half.
  const a = argv();

  const i = a.indexOf('-R');
  assert.notEqual(i, -1);
  assert.equal(a[i + 1], '/tmp/creds-dev-abc.sock:127.0.0.1:51234');
});

test('the connection carries no command and opens no shell', () => {
  // `-N`: this connection exists only to hold the forward open. A shell would be a second
  // thing to go wrong and a second thing to notice on the remote's process list.
  assert.ok(argv().includes('-N'));
});

test('the two options that did nothing are gone', () => {
  // Measured against a real OpenSSH 9.6 sshd, not reasoned from a man page. For a `-R` forward
  // the socket is created by SSHD, so the server's copies of these govern and the client's are
  // ignored: asking for StreamLocalBindMask=0000 still produced `srw-------`, and a stale
  // socket still refused the next bind despite StreamLocalBindUnlink=yes. Sending them made a
  // reader believe in a protection that was not there, which is worse than not sending them.
  const a = argv();

  assert.equal(a.some((x) => x.startsWith('StreamLocalBindMask')), false);
  assert.equal(a.some((x) => x.startsWith('StreamLocalBindUnlink')), false);
});

test('a dropped session cannot block the next bridge — because the PATH is unique', () => {
  // The protection is real; it was just never the flag. sshd refuses to bind over an existing
  // socket by default, so a fixed path would have worked once per host and then failed forever.
  assert.notEqual(remoteSocketPath('dev', 'aaa'), remoteSocketPath('dev', 'bbb'));
});

test('a forward that cannot be established fails the connection instead of succeeding quietly', () => {
  // Without ExitOnForwardFailure, ssh connects, the -R silently does not bind, and the remote
  // gets "connection refused" from a bridge everyone believes is up.
  assert.ok(argv().includes('ExitOnForwardFailure=yes'));
});

test('the connection is kept alive, or a NAT drops it and nobody is told', () => {
  const a = argv();
  assert.ok(a.includes('ServerAliveInterval=30'));
  assert.ok(a.includes('ServerAliveCountMax=3'));
});

test('option parsing ends before the target, so a hostile host cannot become a flag', () => {
  // The same refusal sshExecCommand.ts documents: `-oProxyCommand=` runs a LOCAL command
  // before any authentication, and `shell: false` does not help because the injection is in
  // ssh's own parser.
  const a = argv();
  const end = a.indexOf('--');

  assert.notEqual(end, -1);
  assert.equal(a[end + 1], 'dev@build.example.com');
  assert.equal(end, a.length - 2, 'nothing follows the target');
});

test('an unsafe target is refused rather than escaped', () => {
  assert.equal(
    buildBridgeArgv(HOST, { port: 51234, remote: { path: '/tmp/x.sock' } }, () => false),
    undefined,
  );
});

test('an entity with no host produces no argv', () => {
  assert.equal(
    buildBridgeArgv(
      { ...HOST, host: '' } as EntityMetadata,
      { port: 1, remote: { path: '/tmp/x.sock' } },
      SAFE,
    ),
    undefined,
  );
});

test('a port that cannot be a listening broker is refused', () => {
  // A bridge to port 0 forwards to nothing and reports itself as up.
  for (const port of [0, -1, 65536, 1.5, Number.NaN]) {
    assert.equal(
      buildBridgeArgv(HOST, { port, remote: { path: '/tmp/x.sock' } }, SAFE),
      undefined,
      String(port),
    );
  }
});

test('a pinned host key is enforced when one exists, and accept-new only when none does', () => {
  const pinned = argv({ knownHostsFile: '/keys/known_hosts' });
  assert.ok(pinned.includes('StrictHostKeyChecking=yes'));
  assert.ok(pinned.includes('UserKnownHostsFile=/keys/known_hosts'));

  assert.ok(argv().includes('StrictHostKeyChecking=accept-new'));
});

test('a non-default port and a key path are passed through', () => {
  const built = buildBridgeArgv(
    { ...HOST, port: 2222 } as EntityMetadata,
    { port: 51234, remote: { path: '/tmp/x.sock' }, keyPath: '/keys/id_ed25519' },
    SAFE,
  );

  const a = built ?? [];
  assert.deepEqual(a.slice(-6), ['-i', '/keys/id_ed25519', '-p', '2222', '--', 'dev@build.example.com']);
});

test('port 22 is not spelled out, because ssh already knows it', () => {
  assert.equal(argv().includes('-p'), false);
});

/* --- the remote path --- */

test('the remote socket is per user and per window', () => {
  // A fixed name on a shared build host is one another user can create first, so our bind
  // either fails or — with StreamLocalBindUnlink — replaces theirs.
  assert.notEqual(remoteSocketPath('dev', 'aaa'), remoteSocketPath('dev', 'bbb'));
  assert.notEqual(remoteSocketPath('dev', 'aaa'), remoteSocketPath('ci', 'aaa'));
});

test('a user name that could escape the path is stripped, never interpolated raw', () => {
  const path = remoteSocketPath('../../etc/cron.d/evil', 'abc');

  assert.equal(path.includes('..'), false, path);
  assert.equal(path.includes('/etc/'), false, path);
  assert.match(path, /^\/tmp\/creds-[A-Za-z0-9._-]+-abc\.sock$/);
});

test('an empty or fully stripped user still yields a usable path', () => {
  assert.match(remoteSocketPath('', 'abc'), /^\/tmp\/creds-user-abc\.sock$/);
  assert.match(remoteSocketPath('///', 'abc'), /^\/tmp\/creds-user-abc\.sock$/);
});

test('the bridge id is short, lowercase and alphanumeric', () => {
  const id = bridgeId(() => 'AB-cd_EF/12+34==xyz');

  assert.match(id, /^[a-z0-9]+$/);
  assert.ok(id.length <= 12);
});

test('the remote instructions name a socket and never a secret', () => {
  const text = remoteInstructions({ path: '/tmp/creds-dev-abc.sock' });

  assert.match(text, /CREDS_BROKER_SOCKET=\/tmp\/creds-dev-abc\.sock/);
  for (const forbidden of ['token', 'secret', 'password']) {
    assert.equal(new RegExp(forbidden, 'i').test(text.split('\n')[0]), false, forbidden);
  }
  // And it says the thing a person needs to believe to use it safely.
  assert.match(text, /never arrives here/i);
});

/* --- observing what we cannot set --- */

test('the mode check asks about the socket we actually created', () => {
  const cmd = modeCheckCommand({ path: '/tmp/creds-dev-abc.sock' });

  assert.match(cmd, /stat -c %a \/tmp\/creds-dev-abc\.sock/);
});

test('a host without stat answers "unknown" rather than an empty string', () => {
  // An empty answer would read as mode "" and be reported as a wide socket, which is a false
  // alarm on a host that is perfectly fine.
  assert.match(modeCheckCommand({ path: '/tmp/x.sock' }), /\|\| echo unknown/);
});

test('only 600 counts as owner-only', () => {
  assert.equal(isOwnerOnlyMode('600'), true);
  assert.equal(isOwnerOnlyMode('0600'), true);
  assert.equal(isOwnerOnlyMode(' 600\n'), true, 'stat output carries a newline');

  for (const wide of ['666', '660', '644', '700', '755', 'unknown', '']) {
    assert.equal(isOwnerOnlyMode(wide), false, wide);
  }
});

test('a wide socket is reported as a fact about that host, not as our failure', () => {
  // The bridge works; what changed is who else can reach it. A message that read as a bug in
  // this extension would send somebody looking in the wrong place.
  const text = describeWideSocket('666', { path: '/tmp/creds-dev-abc.sock' });

  assert.match(text, /666/);
  assert.match(text, /StreamLocalBindMask/);
  assert.match(text, /cannot be set from this end/i);
  assert.match(text, /anyone else logged in/i);
});

/* --- the sweep: removing dead sockets without touching a live one --- */

test('the sweep does nothing at all when ss is missing', () => {
  // The critical property, and the one worth stating first. Without `ss` the liveness test
  // answers "not listening" for EVERY socket, so an unguarded sweep would delete every live
  // bridge on the host. A little litter is the safe failure; that is not.
  const cmd = sweepCommand('dev');

  assert.match(cmd, /^command -v ss >\/dev\/null 2>&1 \|\| exit 0;/);
});

test('a socket something is listening on is kept', () => {
  // Another window's bridge is a file of exactly the same shape. Removing it would break a
  // tunnel somebody is using, with nothing to explain why.
  const cmd = sweepCommand('dev');

  assert.match(cmd, /ss -lx .* \|\| rm -f "\$f"/);
  assert.match(cmd, /grep -qF "\$f"/, 'matched as a fixed string, not a pattern');
});

test('the sweep is scoped to this user\'s own sockets', () => {
  assert.match(sweepCommand('dev'), /\/tmp\/creds-dev-\*\.sock/);
  assert.equal(sweepCommand('dev').includes('/tmp/creds-*'), false, 'never every user');
});

test('a crafted user name cannot escape into the shell command', () => {
  // The glob is interpolated into a command that runs on the remote host, so this is the one
  // thing between a name arriving from a synced vault and that shell.
  const cmd = sweepCommand('dev; rm -rf /; echo ');

  // The dash survives, and should: it is in the allowed set and cannot be read as a flag
  // inside a path. What must not survive is the separator and the space that would end the
  // glob and start a new command.
  assert.equal(cmd.includes('rm -rf /'), false, cmd);
  assert.equal(/creds-[^*]*[; ]/.test(cmd), false, 'no separator or space reached the glob');
  assert.match(cmd, /\/tmp\/creds-devrm-rfecho-\*\.sock/);
});

test('the sanitiser is shared with the path builder, so the two cannot drift', () => {
  // The sweep's glob has to match what the path builder produced, or it sweeps nothing and the
  // litter grows anyway — silently, since a sweep that finds nothing looks exactly like a
  // sweep that had nothing to do.
  const user = 'first.last';
  const path = remoteSocketPath(user, 'abc');
  const glob = sweepCommand(user);

  assert.match(path, new RegExp(`/tmp/creds-${safeUserComponent(user)}-abc\.sock$`));
  assert.ok(glob.includes(`/tmp/creds-${safeUserComponent(user)}-*.sock`));
});

test('an empty user still produces a scoped glob, never a bare wildcard', () => {
  const cmd = sweepCommand('');

  assert.match(cmd, /\/tmp\/creds-user-\*\.sock/);
  assert.equal(/creds-\*\.sock/.test(cmd), false);
});
