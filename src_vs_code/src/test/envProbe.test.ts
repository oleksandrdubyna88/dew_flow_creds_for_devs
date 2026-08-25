import assert from 'node:assert/strict';
import { test } from 'node:test';
import { envProbeCommand } from '../envProbe';

/**
 * The line typed into a fresh terminal to PROVE the variable is really there. Which
 * spelling works is a property of the shell, not of the OS — a Windows box running
 * git-bash needs the POSIX form, and guessing wrong prints a literal "$env:NAME".
 */

/* --- masking: the button answers "is it set", never "what is it" --- */

test('the value itself never appears in the probe output, whatever the shell', () => {
  // The leak this closes: the old probe echoed NAME=value, so a bound private key
  // landed in terminal scrollback in full — visible on a shared screen, kept in the
  // terminal's own history.
  const shells = ['C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
                  'C:/Windows/System32/cmd.exe', '/bin/bash', undefined];
  for (const shell of shells) {
    const line = envProbeCommand(shell, 'MY_SECRET', 'win32');
    assert.equal(line.includes('MY_SECRET'), true, 'the NAME is still named');
    // No dereference-and-print of the bare variable anywhere in the line.
    assert.equal(/echo\s+"?MY_SECRET=/.test(line), false, shell ?? 'default');
  }
});

test('each shell reports SET or NOT SET in its own dialect', () => {
  const ps = envProbeCommand('C:/x/powershell.exe', 'A', 'win32');
  assert.match(ps, /\$env:A/);
  assert.match(ps, /NOT SET/);

  const cmd = envProbeCommand('C:/Windows/System32/cmd.exe', 'A', 'win32');
  assert.match(cmd, /if defined A/);
  assert.match(cmd, /NOT SET/);

  const sh = envProbeCommand('/bin/bash', 'A', 'linux');
  assert.match(sh, /\[ -n "\$A" \]/);
  assert.match(sh, /NOT SET/);
});

test('length is reported where the shell can do it cheaply', () => {
  // Length proves the value is neither empty nor truncated without revealing it.
  assert.match(envProbeCommand('C:/x/pwsh.exe', 'A', 'win32'), /Length/);
  assert.match(envProbeCommand('/bin/zsh', 'A', 'linux'), /\$\{#A\}/);
  // cmd has no cheap length primitive — presence only, and that asymmetry is deliberate.
  assert.equal(/len/i.test(envProbeCommand('C:/Windows/System32/cmd.exe', 'A', 'win32')), false);
});

test('a name that is not a legal env name is refused, never interpolated into a shell line', () => {
  // Bindings sync between machines; a name from an older or foreign client is data from
  // elsewhere, and this line goes straight into a terminal.
  const line = envProbeCommand('/bin/bash', 'A; rm -rf ~', 'linux');

  assert.equal(line.includes('rm -rf'), false);
  assert.match(line, /not a valid environment name/);
});
