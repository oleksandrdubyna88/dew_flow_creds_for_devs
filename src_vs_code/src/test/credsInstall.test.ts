import * as fs from 'node:fs';
import * as path from 'node:path';
import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { CREDS_RIDS,
  CREDS_CLI,
  CREDS_MCP,
  actionFor,
  assetNameFor,
  binaryNameFor,
  choicesFor,
  compareVersions,
  entryPathIn,
  ridFor,
  versionFromTag,
  digestIn,
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

test('a Mac gets its own build — node calls it darwin, .NET calls it osx', () => {
  // This test used to assert the opposite, correctly: there was no `osx-*` job. There is now,
  // for all three binaries, and the mapping is where a missing line had told a Mac there was no
  // build while the runtime had supported one all along.
  assert.equal(ridFor('darwin', 'arm64'), 'osx-arm64');
  assert.equal(ridFor('darwin', 'x64'), 'osx-x64');
});

test('every RID the release workflow builds is one the extension will install', () => {
  // Three matrices in one file, one list in another language. A build in the workflow the
  // extension does not know is a download nobody can start; one the extension knows and the
  // workflow does not build is a 404 at install time.
  const workflow = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', '.github', 'workflows', 'release.yml'),
    'utf8',
  );
  const built = new Set([...workflow.matchAll(/^\s+- rid:\s*(\S+)\s*$/gm)].map((m) => m[1]!));

  assert.deepEqual([...built].sort(), [...CREDS_RIDS].sort());
});

test('an architecture the matrix does not build is refused, not approximated', () => {
  assert.equal(ridFor('linux', 'ia32'), undefined);
  assert.equal(ridFor('linux', 'ppc64'), undefined);
  assert.equal(ridFor('freebsd', 'x64'), undefined);
});

test('the asset name matches what the workflow packages, extension included', () => {
  // `NAME="creds-$VERSION-$RID"`, then `.zip` on Windows and `.tar.gz` elsewhere.
  assert.equal(assetNameFor(CREDS_CLI, 'linux-x64', '0.1.0'), 'creds-0.1.0-linux-x64.tar.gz');
  assert.equal(assetNameFor(CREDS_CLI, 'win-arm64', '1.2.3'), 'creds-1.2.3-win-arm64.zip');
});

test('the binary sits inside a directory of the same name — that is how it is packaged', () => {
  assert.equal(entryPathIn(CREDS_CLI, 'linux-x64', '0.1.0'), 'creds-0.1.0-linux-x64/creds');
  assert.equal(entryPathIn(CREDS_CLI, 'win-x64', '0.1.0'), 'creds-0.1.0-win-x64/creds.exe');
});

test('the installed file keeps the platform’s own name', () => {
  assert.equal(binaryNameFor(CREDS_CLI, 'win-x64'), 'creds.exe');
  assert.equal(binaryNameFor(CREDS_CLI, 'linux-arm64'), 'creds');
});

test('a cli tag yields its version, and any other tag yields nothing', () => {
  // The repository tags three products; picking the newest release blindly would offer the
  // server's version as a `creds` update.
  assert.equal(versionFromTag(CREDS_CLI, 'cli-v0.1.0'), '0.1.0');
  assert.equal(versionFromTag(CREDS_CLI, 'extension-v0.57.1'), undefined);
  assert.equal(versionFromTag(CREDS_CLI, 'server-v0.2.3'), undefined);
  assert.equal(versionFromTag(CREDS_CLI, 'cli-v'), undefined);
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
  assert.deepEqual(choicesFor(CREDS_CLI, action), ['Install creds 0.1.0']);
});

test('an older copy offers an UPDATE, naming both versions', () => {
  const action = actionFor('linux-x64', 'linux', '0.2.0', PRESENT('0.1.0'));

  assert.deepEqual(action, { kind: 'update', from: '0.1.0', to: '0.2.0' });
  assert.deepEqual(choicesFor(CREDS_CLI, action), ['Update to 0.2.0', 'Remove creds']);
});

test('the current version offers removal, never a pointless update', () => {
  const action = actionFor('linux-x64', 'linux', '0.1.0', PRESENT('0.1.0'));

  assert.deepEqual(action, { kind: 'installed', version: '0.1.0' });
  assert.deepEqual(choicesFor(CREDS_CLI, action), ['Copy the path', 'Remove creds']);
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
  assert.deepEqual(choicesFor(CREDS_CLI, action), ['Install creds 0.2.0 again', 'Forget it']);
});

test('a missing file with no release still offers to reinstall what was recorded', () => {
  const action = actionFor('linux-x64', 'linux', undefined, { version: '0.1.0', present: false });

  assert.deepEqual(action, { kind: 'reinstall', version: '0.1.0' });
});

test('macOS is told there is no build, and is offered nothing to click', () => {
  const action = actionFor(undefined, 'darwin', '0.1.0', undefined);

  assert.deepEqual(action, { kind: 'unsupported', platform: 'darwin' });
  assert.deepEqual(choicesFor(CREDS_CLI, action), [], 'a menu with no working option is worse than a sentence');
});

test('no reachable release, nothing installed — that is a state of its own', () => {
  // Offline, or before the first release was cut. Distinct from "unsupported", because the
  // answer is "try later" rather than "never".
  const action = actionFor('linux-x64', 'linux', undefined, undefined);

  assert.equal(action.kind, 'unavailable');
  assert.deepEqual(choicesFor(CREDS_CLI, action), []);
});

test('an installed copy survives an unreachable release', () => {
  // Being offline must not make a working install look absent.
  const action = actionFor('linux-x64', 'linux', undefined, PRESENT('0.1.0'));

  assert.deepEqual(action, { kind: 'installed', version: '0.1.0' });
});

/**
 * Two binaries, one set of decisions.
 *
 * <p>Everything above is the same question for `creds` and for `creds-mcp` — which build this
 * machine takes, what the asset is called, whether what is on disk is older than what is
 * published — and the only differences are three strings. These pin the differences, because a
 * second copy of the module would have started identical and drifted at the first fix.</p>
 */

test('the MCP server takes its names from its own release, not from the CLI s', () => {
  assert.equal(assetNameFor(CREDS_MCP, 'linux-arm64', '0.1.0'), 'creds-mcp-0.1.0-linux-arm64.tar.gz');
  assert.equal(assetNameFor(CREDS_MCP, 'win-x64', '0.1.0'), 'creds-mcp-0.1.0-win-x64.zip');
  assert.equal(entryPathIn(CREDS_MCP, 'win-x64', '0.1.0'), 'creds-mcp-0.1.0-win-x64/creds-mcp.exe');
  assert.equal(binaryNameFor(CREDS_MCP, 'linux-x64'), 'creds-mcp');
  assert.equal(binaryNameFor(CREDS_MCP, 'win-arm64'), 'creds-mcp.exe');
});

test('each product reads only its OWN tag line', () => {
  // Four tag lines now. `mcp-v0.2.0` read as a creds release would offer an update whose asset
  // does not exist, and the person would be told the download failed.
  assert.equal(versionFromTag(CREDS_MCP, 'mcp-v0.1.0'), '0.1.0');
  assert.equal(versionFromTag(CREDS_MCP, 'cli-v0.1.0'), undefined);
  assert.equal(versionFromTag(CREDS_CLI, 'mcp-v0.1.0'), undefined);
  assert.equal(versionFromTag(CREDS_MCP, 'mcp-v'), undefined);
});

test('the menu calls each one by its own name', () => {
  const install = actionFor('linux-x64', 'linux', '0.1.0', undefined);

  assert.deepEqual(choicesFor(CREDS_MCP, install), ['Install the MCP server 0.1.0']);
  assert.deepEqual(choicesFor(CREDS_CLI, install), ['Install creds 0.1.0']);
});

/**
 * The checksum, and the asymmetry a security pass found on 2026-08-27.
 *
 * <p>`install.sh` has verified every download since it was written and refuses a mismatch. The
 * extension's own installer — the same binary, from the same release, for the same person — did
 * not check at all. Two ways in, one of them trusting whatever arrived.</p>
 *
 * <p>The parser is what is testable without a network, and it is the half that decides. An HTML
 * error page a proxy substituted, or a truncated file, must read as "no checksum published"
 * rather than as a checksum that does not match: the first proceeds with a warning, the second
 * refuses the install with a baffling message.</p>
 */
test('a sha256sum line yields its digest and nothing else', () => {
  const digest = 'a'.repeat(64);

  assert.equal(digestIn(`${digest}  creds-0.1.0-linux-x64.tar.gz\n`), digest);
  assert.equal(digestIn(`${digest.toUpperCase()} *creds.zip`), digest, 'case-folded, as hex is');
  assert.equal(digestIn(`  ${digest}\n`), digest);
});

test('anything that is not a digest reads as none published, not as a mismatch', () => {
  assert.equal(digestIn('<html><body>404 Not Found</body></html>'), undefined);
  assert.equal(digestIn(''), undefined);
  assert.equal(digestIn('a'.repeat(63)), undefined, 'a truncated file is not a checksum');
  assert.equal(digestIn('a'.repeat(65)), undefined);
  assert.equal(digestIn('zzzz' + 'a'.repeat(60)), undefined, 'not hex');
});
