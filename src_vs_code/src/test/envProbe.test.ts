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
