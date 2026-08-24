import assert from 'node:assert/strict';
import { test } from 'node:test';
import { askpassEnv, askpassScript } from '../sshAskpass';

/**
 * Password login without retyping: ssh will not read a password from stdin — it asks
 * the TTY, or, told via SSH_ASKPASS, it asks a program. The program echoes an env
 * variable, so the password itself is never in a file, never on a command line, and
 * never in terminal scrollback.
 */

test('the script echoes the VARIABLE, never a password', () => {
  for (const platform of ['win32', 'linux'] as const) {
    const s = askpassScript(platform);
    assert.equal(s.content.includes('CREDS_SSH_PASSWORD'), true);
    // No placeholder to substitute: the same static script serves every entity, so a
    // brace anywhere would mean somebody started templating a value into it.
    assert.equal(s.content.includes('{'), false);
  }
});

test('windows gets a .bat, posix an executable sh script', () => {
  assert.equal(askpassScript('win32').name.endsWith('.bat'), true);
  assert.equal(askpassScript('linux').name.endsWith('.sh'), true);
  assert.match(askpassScript('linux').content, /^#!\/bin\/sh/);
  // cmd's echo needs the noise switched off or the prompt line becomes the "password".
  assert.match(askpassScript('win32').content, /@echo off/);
});

test('the env forces askpass even though a TTY is present', () => {
  const env = askpassEnv('/x/askpass.sh', 'hunter2', 'linux');

  assert.equal(env.SSH_ASKPASS, '/x/askpass.sh');
  // Without force, ssh prefers the TTY it has inside a terminal and never calls us.
  assert.equal(env.SSH_ASKPASS_REQUIRE, 'force');
  assert.equal(env.CREDS_SSH_PASSWORD, 'hunter2');
});

test('DISPLAY is set on posix for older ssh, and left alone on windows', () => {
  assert.equal(askpassEnv('/x/a.sh', 'p', 'linux').DISPLAY, ':0');
  assert.equal('DISPLAY' in askpassEnv('C:\\x\\a.bat', 'p', 'win32'), false);
});
