import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { BRIDGED_ENV_EXTRA, BRIDGED_ENV_WINDOWS, bridgedSshEnv } from '../bridgedSshEnv';

/** The environment of a bridged child (E1.6 spec §S6.3, N1-N6): an allow-list, built new. */

const forty = (): NodeJS.ProcessEnv => ({
  ...Object.fromEntries(Array.from({ length: 36 }, (_, i) => [`NAME_${i}`, `value-${i}`])),
  PATH: '/usr/bin',
  HOME: '/home/me',
  SSH_AUTH_SOCK: '/tmp/agent.sock',
  TEMP: '/tmp',
});

test('N1: on linux, a source with forty names gives exactly PATH and HOME', () => {
  const env = bridgedSshEnv(forty(), 'linux');

  assert.deepEqual(Object.keys(env).sort(), ['HOME', 'PATH']);
  assert.deepEqual(env, { PATH: '/usr/bin', HOME: '/home/me' });
});

test('N2: on win32, Path and SystemRoot are found in any letter case and written under the list\'s spelling, with the source\'s values', () => {
  const source: NodeJS.ProcessEnv = {
    Path: 'C:\\Windows', SystemRoot: 'C:\\Windows', UserProfile: 'C:\\Users\\me', HOMEDRIVE: 'C:', homepath: '\\Users\\me', Temp: 'C:\\t', tmp: 'C:\\t2', ComSpec: 'C:\\Windows\\cmd.exe',
    HOME: '/ignored', SSH_AUTH_SOCK: 'x',
  };

  const env = bridgedSshEnv(source, 'win32');

  assert.deepEqual(Object.keys(env).sort(), [...BRIDGED_ENV_WINDOWS].sort());
  assert.deepEqual(env, {
    PATH: 'C:\\Windows', SYSTEMROOT: 'C:\\Windows', USERPROFILE: 'C:\\Users\\me', HOMEDRIVE: 'C:', HOMEPATH: '\\Users\\me', TEMP: 'C:\\t', TMP: 'C:\\t2', COMSPEC: 'C:\\Windows\\cmd.exe',
  });
});

test('N3: the four askpass names are there when given as extra, and not when they are not', () => {
  const extra = { SSH_ASKPASS: '/s/askpass.sh', SSH_ASKPASS_REQUIRE: 'force', CREDS_SSH_PASSWORD: 'pw', DISPLAY: ':0' };

  assert.deepEqual(bridgedSshEnv(forty(), 'linux', extra), { PATH: '/usr/bin', HOME: '/home/me', ...extra });
  assert.deepEqual(Object.keys(bridgedSshEnv(forty(), 'linux')), ['PATH', 'HOME']);
  assert.deepEqual([...BRIDGED_ENV_EXTRA].slice(0, 4), Object.keys(extra));
});

test('N4: an agent socket, a reference, a probe secret and the database client\'s own variables are not taken from the source', () => {
  const source: NodeJS.ProcessEnv = {
    PATH: '/usr/bin', HOME: '/h', SSH_AUTH_SOCK: 's', CREDS_REF_X: 'r', BRIDGE_TEST_SECRET: 'x', PGOPTIONS: '-c x', PGSERVICE: 's', PGPASSFILE: '/p', MYSQL_HOME: '/m',
    PGPASSWORD: 'from the shell', MYSQL_PWD: 'from the shell',
  };

  const env = bridgedSshEnv(source, 'linux');

  for (const name of ['SSH_AUTH_SOCK', 'CREDS_REF_X', 'BRIDGE_TEST_SECRET', 'PGOPTIONS', 'PGSERVICE', 'PGPASSFILE', 'MYSQL_HOME', 'PGPASSWORD', 'MYSQL_PWD']) {
    assert.ok(!(name in env), `${name} is not a key of the answer`);
  }
});

test('N5: an extra name that is not on the list throws, naming the key and no value; nothing is answered', () => {
  assert.throws(() => bridgedSshEnv(forty(), 'linux', { LD_PRELOAD: 'secret-value' }), (error: Error) => error.message.includes('LD_PRELOAD') && !error.message.includes('secret-value'));
});

test('N6: a source with no HOME gives no HOME key, and the source is not changed', () => {
  const source: NodeJS.ProcessEnv = { PATH: '/usr/bin' };
  const before = JSON.stringify(source);

  const env = bridgedSshEnv(source, 'linux');

  assert.deepEqual(Object.keys(env), ['PATH']);
  assert.ok(!('HOME' in env));
  assert.equal(JSON.stringify(source), before);
  assert.notEqual(env, source);
});
