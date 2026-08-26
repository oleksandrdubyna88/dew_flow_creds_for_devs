import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  actionFor,
  assetNameFor,
  binaryNameFor,
  choicesFor,
  compareVersions,
  entryPathIn,
  ridFor,
  versionFromTag,
} from '../credsInstall';

/**
 * What the *Install `creds`…* menu offers.
 *
 * <p>The decisions live apart from the download because each of them is a different sentence to
 * a person — "install 0.1.0", "update 0.1.0 → 0.2.0", "0.1.0 is installed", "there is no build
 * for macOS" — and getting one wrong is a menu that lies rather than a download that fails.</p>
 *
 * <p>The names must match the release workflow EXACTLY: it packages `creds-$VERSION-$RID` with
 * the binary inside a directory of the same name. A guessed name here does not fail loudly; it
 * 404s, and the person is told the release is missing when it is the name that is.</p>
 */

test('this machine gets the build the release actually carries', () => {
  assert.equal(ridFor('win32', 'x64'), 'win-x64');
  assert.equal(ridFor('win32', 'arm64'), 'win-arm64');
  assert.equal(ridFor('linux', 'x64'), 'linux-x64');
  assert.equal(ridFor('linux', 'arm64'), 'linux-arm64');
});

test('macOS has NO build, and says so rather than guessing a near one', () => {
  // The release workflow has no `osx-*` job. Guessing would download something that cannot
  // execute, and reporting a download failure would send someone hunting a network problem.
  assert.equal(ridFor('darwin', 'arm64'), undefined);
  assert.equal(ridFor('darwin', 'x64'), undefined);
});

test('an architecture the matrix does not build is refused, not approximated', () => {
  assert.equal(ridFor('linux', 'ia32'), undefined);
  assert.equal(ridFor('linux', 'ppc64'), undefined);
  assert.equal(ridFor('freebsd', 'x64'), undefined);
});

test('the asset name matches what the workflow packages, extension included', () => {
  // `NAME="creds-$VERSION-$RID"`, then `.zip` on Windows and `.tar.gz` elsewhere.
  assert.equal(assetNameFor('linux-x64', '0.1.0'), 'creds-0.1.0-linux-x64.tar.gz');
  assert.equal(assetNameFor('win-arm64', '1.2.3'), 'creds-1.2.3-win-arm64.zip');
});

test('the binary sits inside a directory of the same name — that is how it is packaged', () => {
  assert.equal(entryPathIn('linux-x64', '0.1.0'), 'creds-0.1.0-linux-x64/creds');
  assert.equal(entryPathIn('win-x64', '0.1.0'), 'creds-0.1.0-win-x64/creds.exe');
});

test('the installed file keeps the platform’s own name', () => {
  assert.equal(binaryNameFor('win-x64'), 'creds.exe');
  assert.equal(binaryNameFor('linux-arm64'), 'creds');
});

test('a cli tag yields its version, and any other tag yields nothing', () => {
  // The repository tags three products; picking the newest release blindly would offer the
  // server's version as a `creds` update.
  assert.equal(versionFromTag('cli-v0.1.0'), '0.1.0');
  assert.equal(versionFromTag('extension-v0.57.1'), undefined);
  assert.equal(versionFromTag('server-v0.2.3'), undefined);
  assert.equal(versionFromTag('cli-v'), undefined);
});

test('versions compare as NUMBERS — 0.10.0 is newer than 0.9.0', () => {
  // As strings it is not, and the mistake surfaces exactly once, on the tenth minor release,
  // as an "update" that is a downgrade.
  assert.equal(compareVersions('0.10.0', '0.9.0'), 1);
  assert.equal(compareVersions('0.9.0', '0.10.0'), -1);
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
  assert.equal(compareVersions('0.1', '0.1.0'), 0, 'a missing segment is zero');
});

const PRESENT = (version: string): { version: string; present: boolean } => ({ version, present: true });

test('nothing installed and a release available offers an install', () => {
  const action = actionFor('linux-x64', 'linux', '0.1.0', undefined);

  assert.deepEqual(action, { kind: 'install', version: '0.1.0' });
  assert.deepEqual(choicesFor(action), ['Install creds 0.1.0']);
});

test('an older copy offers an UPDATE, naming both versions', () => {
  const action = actionFor('linux-x64', 'linux', '0.2.0', PRESENT('0.1.0'));

  assert.deepEqual(action, { kind: 'update', from: '0.1.0', to: '0.2.0' });
  assert.deepEqual(choicesFor(action), ['Update to 0.2.0', 'Remove creds']);
});

test('the current version offers removal, never a pointless update', () => {
  const action = actionFor('linux-x64', 'linux', '0.1.0', PRESENT('0.1.0'));

  assert.deepEqual(action, { kind: 'installed', version: '0.1.0' });
  assert.deepEqual(choicesFor(action), ['Copy the path', 'Remove creds']);
});

test('a copy NEWER than the release is left alone — never silently downgraded', () => {
  // A person may have built from source. Offering "update" to an older number would replace
  // their binary with a worse one and call it an upgrade.
  const action = actionFor('linux-x64', 'linux', '0.1.0', PRESENT('0.2.0'));

  assert.equal(action.kind, 'installed');
});

test('a record whose FILE is gone offers a reinstall, not a false "installed"', () => {
  // Somebody cleared the storage folder, or a sync tool did. Saying "0.1.0 is installed" here
  // would be a menu that lies, and the next `creds` call would fail with no path.
  const action = actionFor('linux-x64', 'linux', '0.2.0', { version: '0.1.0', present: false });

  assert.deepEqual(action, { kind: 'reinstall', version: '0.2.0' });
  assert.deepEqual(choicesFor(action), ['Install creds 0.2.0 again', 'Forget it']);
});

test('a missing file with no release still offers to reinstall what was recorded', () => {
  const action = actionFor('linux-x64', 'linux', undefined, { version: '0.1.0', present: false });

  assert.deepEqual(action, { kind: 'reinstall', version: '0.1.0' });
});

test('macOS is told there is no build, and is offered nothing to click', () => {
  const action = actionFor(undefined, 'darwin', '0.1.0', undefined);

  assert.deepEqual(action, { kind: 'unsupported', platform: 'darwin' });
  assert.deepEqual(choicesFor(action), [], 'a menu with no working option is worse than a sentence');
});

test('no reachable release, nothing installed — that is a state of its own', () => {
  // Offline, or before the first release was cut. Distinct from "unsupported", because the
  // answer is "try later" rather than "never".
  const action = actionFor('linux-x64', 'linux', undefined, undefined);

  assert.equal(action.kind, 'unavailable');
  assert.deepEqual(choicesFor(action), []);
});

test('an installed copy survives an unreachable release', () => {
  // Being offline must not make a working install look absent.
  const action = actionFor('linux-x64', 'linux', undefined, PRESENT('0.1.0'));

  assert.deepEqual(action, { kind: 'installed', version: '0.1.0' });
});
