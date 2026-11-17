import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { BRIDGED_ENV_BLANKED_WINDOWS, BRIDGED_ENV_EXTRA, BRIDGED_ENV_RUNTIME_ADDED_WINDOWS, BRIDGED_ENV_WINDOWS, bridgedSshEnv } from '../bridgedSshEnv';

/** The environment ASKED FOR a bridged child (E1.6 spec §S6.3, §S6.14 Y1, N1-N6a): an allow-list, built new. What a child RECEIVES is a second fact, observed by (b) 4 and PW1. */

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

test('N2: on win32, the seven are found in any letter case and written under the list\'s spelling with the source\'s values, and the three blanked names are each "", whatever the source holds (Q14)', () => {
  const source: NodeJS.ProcessEnv = {
    Path: 'C:\\Windows', SystemRoot: 'C:\\Windows', UserProfile: 'C:\\Users\\me', HOMEDRIVE: 'C:', homepath: '\\Users\\me', Temp: 'C:\\t', ProgramData: 'C:\\ProgramData',
    UserName: 'me', USERDOMAIN: 'CORP', logonserver: '\\\\DC1',
    TMP: 'C:\\t2', ComSpec: 'C:\\Windows\\cmd.exe', SYSTEMDRIVE: 'C:', WINDIR: 'C:\\Windows', HOME: '/ignored', SSH_AUTH_SOCK: 'x',
  };

  const env = bridgedSshEnv(source, 'win32');

  assert.deepEqual(Object.keys(env).sort(), [...BRIDGED_ENV_WINDOWS, ...BRIDGED_ENV_BLANKED_WINDOWS].sort());
  assert.deepEqual(env, {
    PATH: 'C:\\Windows', SYSTEMROOT: 'C:\\Windows', USERPROFILE: 'C:\\Users\\me', HOMEDRIVE: 'C:', HOMEPATH: '\\Users\\me', TEMP: 'C:\\t', PROGRAMDATA: 'C:\\ProgramData',
    USERNAME: '', USERDOMAIN: '', LOGONSERVER: '',
  });
});

test('N6a: a win32 source with no SYSTEMDRIVE gives no such key (the runtime adds it), a source whose USERNAME is set gives USERNAME "", and on linux the three are never asked for', () => {
  const noDrive = bridgedSshEnv({ PATH: 'C:\\Windows', USERNAME: 'me', SYSTEMROOT: 'C:\\Windows' }, 'win32');
  const bare = bridgedSshEnv({}, 'win32');
  const posix = bridgedSshEnv({ PATH: '/usr/bin', HOME: '/h', USERNAME: 'me', USERDOMAIN: 'D', LOGONSERVER: 'S' }, 'linux');

  for (const added of ['SYSTEMDRIVE', 'WINDIR']) {
    assert.ok(!(added in noDrive), `${added} is left to the runtime: this module copies none of it`);
  }
  assert.equal(noDrive.USERNAME, '');
  assert.deepEqual(Object.keys(bare).sort(), [...BRIDGED_ENV_BLANKED_WINDOWS].sort(), 'with an empty source the three are still asked for, as ""');
  assert.deepEqual(Object.keys(posix).sort(), ['HOME', 'PATH']);
});

test('N2a: the lists are what Y1 says: seven asked for, three blanked among the runtime\'s eleven, and the database names are the only extras after the four of askpass', () => {
  assert.deepEqual([...BRIDGED_ENV_WINDOWS], ['PATH', 'SYSTEMROOT', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'TEMP', 'PROGRAMDATA']);
  assert.deepEqual([...BRIDGED_ENV_BLANKED_WINDOWS], ['USERNAME', 'USERDOMAIN', 'LOGONSERVER']);
  assert.deepEqual([...BRIDGED_ENV_RUNTIME_ADDED_WINDOWS].sort(), ['HOMEDRIVE', 'HOMEPATH', 'LOGONSERVER', 'PATH', 'SYSTEMDRIVE', 'SYSTEMROOT', 'TEMP', 'USERDOMAIN', 'USERNAME', 'USERPROFILE', 'WINDIR']);
  for (const name of BRIDGED_ENV_BLANKED_WINDOWS) {
    assert.ok((BRIDGED_ENV_RUNTIME_ADDED_WINDOWS as readonly string[]).includes(name), `${name} is one the runtime would fill, which is why it is asked for as ""`);
  }
  assert.deepEqual([...BRIDGED_ENV_EXTRA].slice(4), ['PGPASSWORD', 'MYSQL_PWD', 'SQLCMDPASSWORD', 'SQLCMDUSER', 'MYSQL_TEST_LOGIN_FILE', 'PGPASSFILE', 'PGSSLCERT', 'PGSSLKEY']);
});

test('N3a: the four client-file names are taken as extras (asked for as paths that never exist), and not from the source', () => {
  const extra = { MYSQL_TEST_LOGIN_FILE: '/k/absent-a', PGPASSFILE: '/k/absent-b', PGSSLCERT: '/k/absent-c', PGSSLKEY: '/k/absent-d' };

  assert.deepEqual(bridgedSshEnv({ PATH: '/usr/bin', ...Object.fromEntries(Object.keys(extra).map((name) => [name, '/the/persons'])) }, 'linux', extra), { PATH: '/usr/bin', ...extra });
  assert.deepEqual(Object.keys(bridgedSshEnv({ PGPASSFILE: '/the/persons' }, 'linux')), []);
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
