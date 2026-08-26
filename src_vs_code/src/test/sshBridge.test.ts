import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EntityMetadata } from '../types';
import {
  bridgeId,
  buildBridgeArgv,
  remoteInstructions,
  remoteSocketPath,
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

test('a dropped session cannot block the next bridge', () => {
  // Without StreamLocalBindUnlink a socket left behind by a lost connection makes every
  // later bind fail, and the symptom — "the bridge will not start" — points nowhere useful.
  assert.ok(argv().includes('StreamLocalBindUnlink=yes'));
});

test('the socket is owner-only on the remote, because that is the boundary there', () => {
  // 0177 clears every bit but the owner's. On a shared host the other logins are exactly who
  // this keeps out; the grant token is the second line, not the first.
  assert.ok(argv().includes('StreamLocalBindMask=0177'));
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
