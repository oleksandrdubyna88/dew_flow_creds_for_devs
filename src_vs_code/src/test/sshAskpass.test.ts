import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { askpassEnv, askpassScript } from '../sshAskpass';
import { cleanupScope, ownedDir } from '../../scripts/lib/leftovers.cjs';

/** Every folder this file makes is owned and claimed, and removed when the file's tests end. */
const scope = cleanupScope();
after(() => scope.close());

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

// ---- the password is DATA to the batch file, never text it parses (E1.S2 review, F1-sweep) -----------------------------------
//
// cmd expands `%VAR%` in a batch line BEFORE it parses the line, so `echo %CREDS_SSH_PASSWORD%` with a password of `a&calc`
// runs `calc` on this machine; a vault entry arriving by sync or share can carry such a password. Delayed expansion (`!VAR!`)
// substitutes the value AFTER the line is parsed, and `echo(` prints whatever follows, an empty value included.

test('the windows script reads the password by delayed expansion, never by percent expansion', () => {
  const content = askpassScript('win32').content;

  assert.equal(content.includes('%CREDS_SSH_PASSWORD%'), false, 'percent expansion puts the password into the parsed line');
  assert.match(content, /setlocal EnableDelayedExpansion/);
  assert.match(content, /^echo\(!CREDS_SSH_PASSWORD!$/m);
});

test(
  'a REAL cmd.exe prints a password full of cmd syntax unchanged and runs none of it',
  { skip: process.platform !== 'win32' },
  () => {
    const dir = ownedDir(scope, 'askpass');
    const script = path.join(dir, askpassScript('win32').name);
    fs.writeFileSync(script, askpassScript('win32').content.replace(/\n/g, '\r\n'));
    for (const password of ['a&echo PWNED&b', 'p"q%PATH%^r!s', '<x>|y', ' lead and trail ']) {
      const run = spawnSync('cmd.exe', ['/d', '/c', script], { env: { ...process.env, CREDS_SSH_PASSWORD: password }, encoding: 'utf8', timeout: 20_000 });
      assert.equal(run.stdout, `${password}\r\n`, JSON.stringify(password));
    }
  },
);
