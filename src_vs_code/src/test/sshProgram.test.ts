import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  NO_AGENT_TO_FORWARD,
  agentForwardEnv,
  builtInOpenSsh,
  openSshProgram,
} from '../sshProgram';

const present = (): boolean => true;
const absent = (): boolean => false;

test('off Windows the bare name is kept, so the person PATH decides', () => {
  assert.equal(openSshProgram('ssh', true, 'linux', present), 'ssh');
  assert.equal(openSshProgram('ssh', true, 'darwin', present), 'ssh');
});

test('on Windows without agent forwarding nothing is substituted', () => {
  // The measured hazard is reaching OUR agent. A connection that does not want the agent has
  // no reason to be moved off the client the person's own config was written against.
  assert.equal(openSshProgram('ssh', false, 'win32', present), 'ssh');
});

test('on Windows a forwarding connection gets the built-in client', () => {
  assert.equal(
    openSshProgram('ssh', true, 'win32', present),
    'C:/Windows/System32/OpenSSH/ssh.exe',
  );
});

test('a Windows install without the built-in falls back rather than failing to spawn', () => {
  // Forwarding nothing is bad. Not connecting at all is worse.
  assert.equal(openSshProgram('ssh', true, 'win32', absent), 'ssh');
});

test('every tool resolves under the same directory', () => {
  assert.equal(builtInOpenSsh('ssh-add'), 'C:/Windows/System32/OpenSSH/ssh-add.exe');
  assert.equal(builtInOpenSsh('ssh-keygen'), 'C:/Windows/System32/OpenSSH/ssh-keygen.exe');
});

test('without agent forwarding the environment is passed through untouched', () => {
  const base = { PATH: '/usr/bin' };
  const result = agentForwardEnv(base, false, '/run/agent.sock');
  assert.equal(result.env, base);
  assert.equal(result.warning, undefined);
});

test('a forwarding connection carries SSH_AUTH_SOCK into the child', () => {
  // The whole defect this module exists for: the variable was published to TERMINALS, and a
  // child spawned by the extension host never saw it.
  const base: NodeJS.ProcessEnv = { PATH: '/usr/bin' };
  const result = agentForwardEnv(base, true, '/run/agent.sock');
  assert.equal(result.env.SSH_AUTH_SOCK, '/run/agent.sock');
  assert.equal(result.env.PATH, '/usr/bin');
  assert.equal(base.SSH_AUTH_SOCK, undefined, 'the caller env is not mutated');
});

test('forwarding asked for with no agent running says so instead of going quiet', () => {
  const result = agentForwardEnv({}, true, undefined);
  assert.equal(result.warning, NO_AGENT_TO_FORWARD);
  assert.equal(result.env.SSH_AUTH_SOCK, undefined);
});

test('an empty socket path counts as no agent', () => {
  assert.equal(agentForwardEnv({}, true, '').warning, NO_AGENT_TO_FORWARD);
});
