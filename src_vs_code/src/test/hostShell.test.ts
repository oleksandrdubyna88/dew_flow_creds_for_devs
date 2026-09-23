import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { asOsName, entryShell, hostShell, newEntryOs, osLabel, osOf, pinnedShellRefusal, quoteFor, readerFamily, shellFamily } from '../hostShell';

/**
 * Which shell parses a composed line (issue #103). The defect was a line for one shell typed into
 * another, so every answer here is about the pairing — platform to shell, shell to quoting — and
 * the quoting is also proved against the REAL shells where this machine has them.
 */

test('the OS of a platform: Windows, macOS, and everything else is Linux', () => {
  assert.equal(osOf('win32'), 'windows');
  assert.equal(osOf('darwin'), 'macos');
  assert.equal(osOf('linux'), 'linux');
  assert.equal(osOf('freebsd'), 'linux');
});

test('an OS read from vault data is one of the three, or nothing — never a guess', () => {
  assert.equal(asOsName('macos'), 'macos');
  assert.equal(asOsName('solaris'), undefined, 'a value a newer build wrote is not an OS this one knows');
  assert.equal(asOsName(3), undefined);
  assert.equal(osLabel('windows'), 'Windows');
  assert.equal(osLabel('solaris'), 'solaris', 'an unknown value is shown as stored, not hidden');
});

test('the pinned shell is the platform NATIVE one, never the default profile', () => {
  assert.deepEqual(hostShell('win32', () => false), { shellPath: 'powershell.exe', family: 'powershell' });
  assert.deepEqual(hostShell('linux', (p) => p === '/bin/bash'), { shellPath: '/bin/bash', family: 'posix' });
  assert.deepEqual(hostShell('darwin', () => false), { shellPath: '/bin/sh', family: 'posix' });
});

test('the one shell-family detector still answers what both old copies answered', () => {
  assert.equal(shellFamily('win32', undefined), 'powershell');
  assert.equal(shellFamily('win32', 'C:\\Windows\\System32\\cmd.exe'), 'cmd');
  assert.equal(shellFamily('win32', 'C:\\Program Files\\PowerShell\\7\\pwsh.exe'), 'powershell');
  // The #103 default profile: a Windows host whose terminal is WSL — a POSIX shell.
  assert.equal(shellFamily('win32', 'C:\\Windows\\System32\\wsl.exe'), 'posix');
  assert.equal(shellFamily('linux', '/usr/bin/zsh'), 'posix');
});

const NASTY = `C:\\Users\\o'brien\\my "vpn" $HOME \`id\` %PATH%.ovpn`;

test('PowerShell quoting: single quotes are literal, an apostrophe is doubled', () => {
  assert.equal(quoteFor('powershell', "a'b $x"), "'a''b $x'");
});

test('POSIX quoting: single quotes are literal, an apostrophe closes, escapes and reopens', () => {
  assert.equal(quoteFor('posix', "a'b $x"), `'a'"'"'b $x'`);
});

test('cmd quoting is a plain double-quoted word — only ever used for a Windows path', () => {
  assert.equal(quoteFor('cmd', 'C:\\a b\\c.ovpn'), '"C:\\a b\\c.ovpn"');
});

function has(program: string, args: string[]): boolean {
  try {
    execFileSync(program, args, { stdio: 'ignore', timeout: 20_000 });
    return true;
  } catch {
    return false;
  }
}

test('POSIX quoting survives a REAL bash unchanged', { skip: !has('bash', ['-c', 'true']) }, () => {
  const echoed = execFileSync('bash', ['-c', `printf %s ${quoteFor('posix', NASTY)}`], { encoding: 'utf8' });
  assert.equal(echoed, NASTY);
});

test(
  'PowerShell quoting survives a REAL Windows PowerShell unchanged',
  { skip: process.platform !== 'win32' || !has('powershell.exe', ['-NoProfile', '-Command', 'exit 0']) },
  () => {
    const echoed = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-Command', `[Console]::Out.Write(${quoteFor('powershell', NASTY)})`],
      { encoding: 'utf8' },
    );
    assert.equal(echoed, NASTY);
  },
);

test('a local window and a WSL window may run a composed line; another computer may not', () => {
  assert.equal(pinnedShellRefusal(undefined), undefined);
  assert.equal(pinnedShellRefusal(''), undefined);
  assert.equal(pinnedShellRefusal('wsl'), undefined);
  for (const remote of ['ssh-remote', 'dev-container', 'attached-container', 'codespaces']) {
    assert.match(pinnedShellRefusal(remote) ?? '', new RegExp(`another computer \\(${remote}\\)`));
  }
});

// ---------- entryShell: which shell reads a Terminal entry's OWN line (issue #103) ----------

const local = (platform: NodeJS.Platform, defaultShell?: string) => ({ platform, remoteName: undefined, defaultShell });

test('no OS recorded: the default profile, exactly as before — whatever the window', () => {
  assert.deepEqual(entryShell('e', undefined, local('win32', 'C:/Windows/System32/wsl.exe')), { kind: 'default' });
  assert.deepEqual(entryShell('e', '', { platform: 'win32', remoteName: 'ssh-remote', defaultShell: '/bin/bash' }), { kind: 'default' });
});

test('the #103 case: a Windows entry with a WSL-bash default profile gets the native shell pinned', () => {
  assert.deepEqual(entryShell('e', 'windows', local('win32', 'C:/Windows/System32/wsl.exe')), { kind: 'pinned' });
  assert.deepEqual(entryShell('e', 'windows', local('win32', 'C:/Program Files/Git/bin/bash.exe')), { kind: 'pinned' });
});

test('a default profile of the RIGHT system is kept — pwsh 7, cmd, zsh with its aliases', () => {
  assert.deepEqual(entryShell('e', 'windows', local('win32', 'C:/Program Files/PowerShell/7/pwsh.exe')), { kind: 'default' });
  assert.deepEqual(entryShell('e', 'windows', local('win32', 'C:/Windows/System32/cmd.exe')), { kind: 'default' });
  assert.deepEqual(entryShell('e', 'macos', local('darwin', '/bin/zsh')), { kind: 'default' });
  assert.deepEqual(entryShell('e', 'linux', local('linux', '/usr/bin/fish')), { kind: 'default' });
});

test('a WSL window: its terminal is Linux, and Windows lines still reach Windows through interop', () => {
  const wsl = { platform: 'win32' as NodeJS.Platform, remoteName: 'wsl', defaultShell: '/bin/bash' };
  assert.deepEqual(entryShell('e', 'linux', wsl), { kind: 'default' });
  assert.deepEqual(entryShell('e', 'windows', wsl), { kind: 'pinned' });
  const mac = entryShell('mac thing', 'macos', wsl);
  assert.equal(mac.kind, 'refused');
  assert.match(mac.kind === 'refused' ? mac.reason : '', /written for macOS, and this terminal runs Linux/);
});

test('another computer\'s window: the default profile — that OS is not ours to know', () => {
  const remote = { platform: 'win32' as NodeJS.Platform, remoteName: 'ssh-remote', defaultShell: '/bin/bash' };
  assert.deepEqual(entryShell('e', 'windows', remote), { kind: 'default' });
  assert.deepEqual(entryShell('e', 'linux', remote), { kind: 'default' });
});

test('an entry for another system is refused locally, naming both and the way back to "not set"', () => {
  const choice = entryShell('deploy', 'macos', local('win32'));
  assert.equal(choice.kind, 'refused');
  assert.match(choice.kind === 'refused' ? choice.reason : '', /"deploy" is written for macOS, and this terminal runs Windows.*"not set"/);
});

test('{config} is quoted for the shell that READS the line: pinned or the default profile', () => {
  const pinned = hostShell('win32', () => false);
  const wslDefault = local('win32', 'C:/Windows/System32/wsl.exe');
  assert.equal(readerFamily({ kind: 'pinned' }, pinned, wslDefault), 'powershell');
  assert.equal(readerFamily({ kind: 'default' }, pinned, wslDefault), 'posix');
  assert.equal(readerFamily({ kind: 'default' }, pinned, local('win32', 'cmd.exe')), 'cmd');
});

test('a NEW entry starts on the OS of the window\'s terminal — none in another computer\'s window', () => {
  assert.equal(newEntryOs(undefined, 'win32'), 'windows');
  assert.equal(newEntryOs('wsl', 'win32'), 'linux');
  assert.equal(newEntryOs('ssh-remote', 'win32'), undefined);
});

test('pwsh 7 is pinned when this Windows has it — a person\'s && works there, not in 5.1', () => {
  assert.equal(hostShell('win32', () => false, true).shellPath, 'pwsh.exe');
  assert.equal(hostShell('win32', () => false).shellPath, 'powershell.exe');
});
