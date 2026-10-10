import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  VERSION_FLAG_SINCE,
  WINDOWS_BINARY_VARIABLE,
  canJudge,
  notRecordedMessage,
  staleInstallMessage,
  staleVerdict,
  versionArgv,
} from '../wslMcpInstall';

/**
 * Plan §5.8 / E4.S2 — a stale WSL install says so.
 *
 * <p>The verdict reads what `creds-mcp --version` printed inside a distribution (E2, §5.2.5): this
 * build's line, and a second line for the Windows half the bridge would start — a version, or one
 * of three fixed words. Both halves are judged, because the motivating case was a config whose
 * Windows half was a manual install: a current Linux binary in front of it would still have
 * withheld every fix.</p>
 */

const LINUX = '/home/dev/.local/bin/creds-mcp';
const WINDOWS = '/mnt/c/Users/dev/AppData/creds-mcp.exe';
const answered = (stdout: string, code: number | null = 0) => ({ kind: 'exited' as const, code, stdout });
const both = (linux: string, windows: string): string =>
  `creds-mcp ${linux}\nwindows half: ${windows} (${WINDOWS})\n`;

test('both halves at the expected version are current, and the verdict names what it read', () => {
  const verdict = staleVerdict(answered(both('0.10.0', 'creds-mcp 0.10.0')), '0.10.0');

  assert.deepEqual(verdict, {
    kind: 'current',
    linux: '0.10.0',
    windows: 'creds-mcp 0.10.0',
    windowsPath: WINDOWS,
    behind: [],
  });
});

test('a half NEWER than expected is still current — only older is stale', () => {
  assert.equal(staleVerdict(answered(both('0.11.2', 'creds-mcp 0.10.1')), '0.10.0').kind, 'current');
});

test('versions compare as numbers, so 0.10.0 is not older than 0.9.9', () => {
  assert.equal(staleVerdict(answered(both('0.10.0', 'creds-mcp 0.10.0')), '0.9.9').kind, 'current');
});

test('an older Linux half is older, and says which half is behind', () => {
  const verdict = staleVerdict(answered(both('0.10.0', 'creds-mcp 0.12.0')), '0.12.0');

  assert.equal(verdict.kind, 'older');
  assert.deepEqual(verdict.kind === 'older' && verdict.behind, ['linux']);
});

test('an older WINDOWS half is older even when the Linux half is current', () => {
  // The owner's case (§4): the config's Windows half was a manual install, so no fix and no
  // `--caller` reached it however new the Linux binary in front of it was.
  const verdict = staleVerdict(answered(both('0.12.0', 'creds-mcp 0.10.0')), '0.12.0');

  assert.equal(verdict.kind, 'older');
  assert.deepEqual(verdict.kind === 'older' && verdict.behind, ['windows']);
  assert.equal(verdict.kind === 'older' && verdict.windowsPath, WINDOWS);
});

test('each of E2\'s three words for a Windows half that gave no version reads as older', () => {
  for (const word of ['older than --version, or no answer', 'answered without a version', 'not started']) {
    const verdict = staleVerdict(answered(both('0.12.0', word)), '0.12.0');

    assert.equal(verdict.kind, 'older', `"${word}" was read as current`);
    assert.equal(verdict.kind === 'older' && verdict.windows, word, 'the word is shown to the person as said');
  }
});

test('a Linux half with no --version (a usage error, a non-zero exit) is older', () => {
  // Every release before mcp 0.10.0 answers `--version` with "unknown argument" and a non-zero exit.
  const verdict = staleVerdict(answered('', 2), '0.10.0');

  assert.equal(verdict.kind, 'older');
  assert.equal(verdict.kind === 'older' && verdict.linux, '', 'no version is reported as none, not invented');
  assert.deepEqual(verdict.kind === 'older' && verdict.behind, ['linux', 'windows']);
});

test('a clean exit that printed no version line is older too, not current', () => {
  assert.equal(staleVerdict(answered('something else entirely\n'), '0.10.0').kind, 'older');
});

test('a Linux half that reports itself but no Windows half line is older on the Windows side', () => {
  const verdict = staleVerdict(answered('creds-mcp 0.12.0\n'), '0.12.0');

  assert.equal(verdict.kind, 'older');
  assert.deepEqual(verdict.kind === 'older' && verdict.behind, ['windows']);
});

test('a probe that TIMED OUT is unknown — a busy distribution is not evidence of an old binary', () => {
  assert.deepEqual(staleVerdict({ kind: 'timeout' }, '0.10.0'), { kind: 'unknown' });
});

test('a Windows path with parentheses in it is read whole', () => {
  const path = '/mnt/c/Program Files (x86)/creds/creds-mcp.exe';
  const verdict = staleVerdict(answered(`creds-mcp 0.12.0\nwindows half: creds-mcp 0.12.0 (${path})\n`), '0.12.0');

  assert.equal(verdict.kind === 'current' && verdict.windowsPath, path);
});

test('CRLF line endings do not hide the version', () => {
  const verdict = staleVerdict(answered(both('0.12.0', 'creds-mcp 0.12.0').replace(/\n/g, '\r\n')), '0.12.0');

  assert.equal(verdict.kind, 'current');
});

// --- what can be judged at all -------------------------------------------------------------------

test('below the first release with --version nothing can be judged — a current install of it has none', () => {
  // Flagging it would offer Update in a loop: the update installs the same release, which still has
  // no `--version`.
  assert.equal(VERSION_FLAG_SINCE, '0.10.0');
  assert.equal(canJudge('0.9.1'), false);
  assert.equal(canJudge(''), false, 'no Windows install recorded → nothing to compare with');
  assert.equal(canJudge('0.10.0'), true);
  assert.equal(canJudge('1.0.0'), true);
});

// --- the probe itself ---------------------------------------------------------------------------

test('the probe replays the copied block exactly — the Linux binary, with the Windows one in env', () => {
  // Without the variable the Linux half would resolve some OTHER Windows half than the one the
  // client's config names, and report on that.
  assert.deepEqual(versionArgv('Ubuntu', { linuxBinary: LINUX, windowsBinary: WINDOWS }), [
    '-d', 'Ubuntu', '-e', 'env', `${WINDOWS_BINARY_VARIABLE}=${WINDOWS}`, LINUX, '--version',
  ]);
});

test('the probe runs no shell: a quote or a space in a path is an argument, not a command', () => {
  const quoted = "/home/o'brien/.local/bin/creds-mcp";
  const argv = versionArgv('', { linuxBinary: quoted, windowsBinary: '/mnt/c/Users/A B/creds-mcp.exe' });

  assert.deepEqual(argv, ['-e', 'env', `${WINDOWS_BINARY_VARIABLE}=/mnt/c/Users/A B/creds-mcp.exe`, quoted, '--version']);
  assert.equal(argv.some((word) => /^(ba)?sh$/.test(word) || word === '-lc' || word === '-c'), false);
});

test('a path the probe cannot pass safely is refused, never quoted', () => {
  // `env` reads a word with `=` as an assignment, so such a path would never be run as the binary;
  // a relative one would be resolved through PATH, which is exactly the binary we must not ask.
  const refused = [
    { linuxBinary: '/home/a=b/creds-mcp', windowsBinary: WINDOWS },
    { linuxBinary: 'creds-mcp', windowsBinary: WINDOWS },
    { linuxBinary: '', windowsBinary: WINDOWS },
    { linuxBinary: LINUX, windowsBinary: '' },
    { linuxBinary: LINUX, windowsBinary: 'C:\\creds-mcp.exe' },
    { linuxBinary: `${LINUX}\n--help`, windowsBinary: WINDOWS },
  ];
  for (const install of refused) {
    assert.deepEqual(versionArgv('Ubuntu', install), [], `accepted ${JSON.stringify(install)}`);
  }
});

// --- what the person reads ----------------------------------------------------------------------

test('the stale message names the distribution, both versions, both paths and the remedy', () => {
  const verdict = staleVerdict(answered(both('0.10.0', 'creds-mcp 0.10.0')), '0.12.0');
  assert.equal(verdict.kind, 'older');
  const text = staleInstallMessage('Ubuntu', LINUX, '0.12.0', verdict.kind === 'older' ? verdict : never());

  for (const part of ['Ubuntu', '0.12.0', '0.10.0', LINUX, WINDOWS, 'Update', 'clipboard']) {
    assert.ok(text.includes(part), `the message leaves out ${part}: ${text}`);
  }
});

test('the stale message says "no --version" rather than an empty version', () => {
  const verdict = staleVerdict(answered('', 2), '0.12.0');
  const text = staleInstallMessage('Ubuntu', LINUX, '0.12.0', verdict.kind === 'older' ? verdict : never());

  assert.ok(text.includes('no --version'), text);
});

test('the message claims only the copied block, never the client\'s config', () => {
  // Plan round finding 1: copying a block does not prove the client uses it.
  const verdict = staleVerdict(answered(both('0.10.0', 'creds-mcp 0.10.0')), '0.12.0');
  const text = staleInstallMessage('Ubuntu', LINUX, '0.12.0', verdict.kind === 'older' ? verdict : never());

  assert.ok(text.includes('last copied'), text);
});

test('an install this extension did not record is said to be not recorded, with Update as the remedy', () => {
  const text = notRecordedMessage('Ubuntu');

  for (const part of ['Ubuntu', 'not recorded', 'Update']) {
    assert.ok(text.includes(part), `the message leaves out ${part}: ${text}`);
  }
});

function never(): never {
  throw new Error('unreachable verdict');
}
