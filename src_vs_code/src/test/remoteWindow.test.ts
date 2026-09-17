import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WindowSide, terminalPlatform, windowSide } from '../remoteWindow';

// Written from a report: Connect SSH works in a Windows window and fails in a WSL one with
// `Identity file c:\Users\…\keys\23284\<guid>.key not accessible`. The extension is
// extensionKind: ["ui"], so it runs on Windows while the terminal runs in the distribution, and
// nothing on the connect path had ever asked which was which.

const wsl = (
  authorities: readonly string[],
  configured: readonly string[] = [],
  serving: readonly string[] = [],
): WindowSide => windowSide('wsl', authorities, configured, serving);

test('a local window is local, and its terminal keeps the host platform', () => {
  assert.deepEqual(windowSide(undefined, []), { kind: 'local' });
  assert.equal(terminalPlatform({ kind: 'local' }, 'win32'), 'win32');
  assert.equal(terminalPlatform({ kind: 'local' }, 'darwin'), 'darwin');
});

test('an empty remoteName is local too, because that is what a blank setting looks like', () => {
  assert.deepEqual(windowSide('', []), { kind: 'local' });
});

test('a WSL window names its distribution by the CONFIGURED spelling, matched case-insensitively', () => {
  // The trap this test exists for, measured: VS Code records the authority lower-cased
  // (`wsl+ubuntu`, every occurrence under %APPDATA%\Code) while `wsl -l -q` answers `Ubuntu`.
  // `WslRelayManager.socketPathFor` is an exact-key Map.get, so the authority's spelling would
  // never find the relay and the window would be told the relay is not running.
  assert.deepEqual(wsl(['wsl+ubuntu'], ['Ubuntu']), { kind: 'wsl', distro: 'Ubuntu' });
});

test('the spelling a relay is SERVING under wins over the configured one', () => {
  // serving is the map the socket is looked up in; configured is only what will be keyed later.
  assert.deepEqual(wsl(['wsl+ubuntu'], ['UBUNTU'], ['Ubuntu']), { kind: 'wsl', distro: 'Ubuntu' });
});

test('an unknown distribution keeps the authority spelling rather than inventing one', () => {
  assert.deepEqual(wsl(['wsl+debian'], ['Ubuntu']), { kind: 'wsl', distro: 'debian' });
});

test('several folders in ONE distribution are still one distribution', () => {
  assert.deepEqual(wsl(['wsl+ubuntu', 'wsl+Ubuntu'], ['Ubuntu']), { kind: 'wsl', distro: 'Ubuntu' });
});

test('folders in two distributions refuse as ambiguous rather than guessing a socket', () => {
  // Connecting through an arbitrary one of them would point SSH_AUTH_SOCK at a socket that does
  // not serve this key — a wrong answer that looks like a working one.
  assert.deepEqual(wsl(['wsl+ubuntu', 'wsl+debian']), {
    kind: 'wsl',
    distro: '',
    problem: 'ambiguous',
  });
});

test('a window with no folder falls back to the single distribution that is known', () => {
  // A single file, or an empty window: no authority exists, and one configured distribution is an
  // unambiguous answer rather than a guess.
  assert.deepEqual(wsl([], ['Ubuntu']), { kind: 'wsl', distro: 'Ubuntu' });
  assert.deepEqual(wsl([], [], ['Ubuntu-26.04']), { kind: 'wsl', distro: 'Ubuntu-26.04' });
});

test('a window with no folder takes the ONE running relay over several configured ones', () => {
  // Found by the code round: somebody with two distributions configured and a relay started in the
  // one they work in was refused and sent to a picker, while the socket they wanted was the only
  // one that existed. A running relay is the least ambiguous fact there is.
  assert.deepEqual(wsl([], ['Ubuntu', 'Debian'], ['Debian']), { kind: 'wsl', distro: 'Debian' });
});

test('the no-folder fallback keeps the SERVING spelling too, not just the folder path', () => {
  // The same exact-key Map.get trap as above, on the rung that had been left out of it: `distinct`
  // keeps the first spelling seen, which is the configured one.
  assert.deepEqual(wsl([], ['UBUNTU'], ['Ubuntu']), { kind: 'wsl', distro: 'Ubuntu' });
});

test('a window with no folder and SEVERAL known distributions is unknown, not a guess', () => {
  assert.deepEqual(wsl([], ['Ubuntu', 'Ubuntu-26.04']), {
    kind: 'wsl',
    distro: '',
    problem: 'unknown',
  });
});

test('a window with no folder and nothing known takes the default sentinel', () => {
  // '' is WslRelayManager's own "whatever WSL calls default", and the route refuses on the relay
  // before the name is ever used.
  assert.deepEqual(wsl([]), { kind: 'wsl', distro: '' });
});

test('a non-WSL authority never contributes a distribution name', () => {
  assert.deepEqual(wsl(['ssh-remote+box', 'file']), { kind: 'wsl', distro: '' });
});

test('every other remote kind is "other" and carries the name, so the message can say it', () => {
  for (const name of ['ssh-remote', 'dev-container', 'attached-container', 'codespaces']) {
    assert.deepEqual(windowSide(name, []), { kind: 'other', remoteName: name });
  }
});

test('a remote window NEVER composes for win32, whatever the extension host is', () => {
  // This is the whole defect in one assertion: the quoting branch and the program word are both
  // chosen from a platform, and the host's answer is wrong for the terminal.
  assert.equal(terminalPlatform({ kind: 'wsl', distro: 'Ubuntu' }, 'win32'), 'linux');
});

test('a window we cannot name a shell for gets NO platform, so nothing can be composed for it', () => {
  // The refusal is carried by the type rather than by a caller remembering to refuse first. A
  // Remote-SSH host can be Windows, and a WSL window whose distribution could not be resolved has
  // no shell to name either — answering 'linux' for those was correct only by coincidence.
  assert.equal(terminalPlatform({ kind: 'other', remoteName: 'ssh-remote' }, 'win32'), undefined);
  assert.equal(terminalPlatform({ kind: 'other', remoteName: 'dev-container' }, 'win32'), undefined);
  assert.equal(
    terminalPlatform({ kind: 'wsl', distro: '', problem: 'ambiguous' }, 'win32'),
    undefined,
  );
  assert.equal(terminalPlatform({ kind: 'wsl', distro: '', problem: 'unknown' }, 'win32'), undefined);
});
