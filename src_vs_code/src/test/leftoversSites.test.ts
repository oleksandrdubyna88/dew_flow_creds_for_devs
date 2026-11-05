// The unit tests make their scratch through the leftovers wrapper (`scripts/lib/leftovers.cjs`) or not at all. A test that
// calls `os.tmpdir()` or `mkdtemp` itself makes a folder nothing names, claims or removes on a failed assertion, and which
// the next run cannot tell from a stranger's — so every file under the test tree is scanned for a raw temp call.
//
// A scan that matches nothing passes forever (testing.md), so the prohibition has companions: the scan must find a planted
// raw call, must NOT find a word in a comment or a string, and must discover the whole tree (the known files are in it).
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { shortSocketRoot } from '../../scripts/lib/leftovers.cjs';
import { MAX_UNIX_SOCKET_PATH, socketPathFor } from '../brokerListeners';
import { agentSocketPath } from '../sshAgentServer';
import { discoverSources, rawTempSites } from './tempSiteScan';

// `out/test` and `src/test` are both two folders below `src_vs_code`.
const TESTS = path.resolve(__dirname, '..', '..', 'src', 'test');

/**
 * What the scan does NOT read, each with its reason. Everything else under the test tree is scanned by default: a new test file
 * is covered the day it is written, with no list to remember to extend [E2.1 code 11].
 */
const EXCLUDED = new Map<string, string>([
  ['tempSiteScan.ts', 'the scan itself: it names the calls it looks for'],
  ['fixtures', 'sample programs that typedFixtures.test.ts compiles to prove the type checker refuses them; not tests of this repository'],
]);

/** `file:line` of every line with a raw temp call, in the discovered files (a line with two calls is one site). */
function sites(): string[] {
  const found = discoverSources(TESTS, EXCLUDED).flatMap((file) => rawTempSites(fs.readFileSync(path.join(TESTS, file), 'utf8'), file).map((line) => `${file}:${line}`));
  return [...new Set(found)];
}

test('no test and no test helper makes a temp path of its own: every file under the test tree is scanned', () => {
  assert.deepEqual(sites(), []);
});

test('the discovery reads the whole test tree: the known files are in it, the excluded ones are not, each exclusion has a reason and is real', () => {
  const found = discoverSources(TESTS, EXCLUDED);

  for (const known of ['brokerListeners.test.ts', 'sshAgentServer.test.ts', 'vpnWorld.ts', 'sshAgentWorld.ts', 'leftoversSites.test.ts']) {
    assert.ok(found.includes(known), `${known} is not discovered`);
  }
  assert.ok(found.length > 400, `the discovery found only ${found.length} files`);
  assert.equal(found.some((file) => file === 'tempSiteScan.ts' || file.startsWith('fixtures/')), false);
  for (const [entry, reason] of EXCLUDED) {
    assert.ok(reason.split(/\s+/).length >= 3, `the exclusion of ${entry} needs a reason`);
    assert.ok(fs.existsSync(path.join(TESTS, entry)), `the exclusion ${entry} names nothing: remove it`);
  }
});

// The planted samples are assembled from pieces: this file is read by the repository's own guard, which reads text and would
// otherwise take the samples for sites.
const MK = 'mkdtemp';
const TMP = 'tmp' + 'dir';

test('the scan finds a raw temp call however it is spelled, and a call across lines', () => {
  const planted = [
    `const a = fs.${MK}Sync(path.join(os.${TMP}(), 'x'));`,
    `const b = await fs.promises.${MK}(`,
    `  path.join(${TMP}(), 'y'));`,
  ].join('\n');

  assert.deepEqual(rawTempSites(planted), [1, 1, 2, 3]);
});

test('the scan finds a raw temp call made through a local alias of a named import', () => {
  const planted = [
    `import { ${MK}Sync as make, ${TMP} } from 'node:fs';`,
    `import { ${TMP} as where } from 'node:os';`,
    `const a = make(path.join(where(), 'x'));`,
    `const b = ${TMP}();`,
  ].join('\n');

  assert.deepEqual(rawTempSites(planted), [3, 3, 4]);
});

test('an alias of anything else, and a property that merely has an alias\'s name, is not a temp call', () => {
  const other = [`import { readFileSync as make } from 'node:fs';`, `import { ${TMP} as where } from 'node:os';`, `make('x'); obj.where(); other.make();`].join('\n');

  assert.deepEqual(rawTempSites(other), []);
});

test('the scan does not mistake a word in a comment or a string for a call', () => {
  const prose = [`// os.${TMP}() is what the old code called`, `const note = '${MK}Sync(os.${TMP}())';`, `/* ${TMP}() */`].join('\n');

  assert.deepEqual(rawTempSites(prose), []);
});

test('no unit-test file names a folder in the legacy `agent` form: a name without the owner segment is never collected', () => {
  const needle = 'testsTo' + 'Delete-agent-'; // spelled in two pieces: this file must not be the one it finds
  const files = fs.readdirSync(TESTS).filter((name) => name.endsWith('.ts'));
  const legacy = files.filter((name) => fs.readFileSync(path.join(TESTS, name), 'utf8').includes(needle));

  assert.ok(files.length > 100, 'the scan reads the whole test folder');
  assert.deepEqual(legacy, []);
});

/** The short socket root of Linux and macOS (`shortSocketRoot()` there; asserted in leftoversWrapper.test.ts). */
const POSIX_SHORT_SOCKET_ROOT = '/tmp';

test('the longest socket path an owned folder under the short root can have fits the unix limit, with the longest owner and a ten-digit pid', () => {
  // The owner token `w` + 10 digits is the longest the grammar allows, `agent` the longest `what` a socket folder takes (5), the
  // id six characters. macOS caps a socket path at 103 bytes and its TMPDIR is about 49 characters, which is why the folder is
  // under `/tmp` and not under the temp root; this is asserted on every OS so a longer owner, id or pid is red on Linux too.
  // The limit is a UNIX one, so the root is the POSIX short root: `shortSocketRoot()` where it is `/tmp` (Linux, macOS), and
  // `/tmp` itself on Windows, whose short root is the temp root and whose sockets are named pipes with no such limit
  // ([E2.1 byhand 9]: on the Windows runner this test joined `C:\Users\<you>\AppData\Local\Temp` and was refused).
  const posixShortRoot = process.platform === 'win32' ? POSIX_SHORT_SOCKET_ROOT : shortSocketRoot();
  const folder = path.posix.join(posixShortRoot, 'testsToDelete-w4294967295-creds-agent-abcdef');
  const broker = socketPathFor(folder, 4294967295, 'linux');
  const agent = agentSocketPath(folder, 'linux', 4294967295);

  assert.ok(broker !== undefined, `the broker's socket path is refused as too long: ${folder}`);
  for (const socket of [broker, agent]) {
    assert.ok(Buffer.byteLength(socket) <= MAX_UNIX_SOCKET_PATH, `${socket} is ${Buffer.byteLength(socket)} bytes, the limit is ${MAX_UNIX_SOCKET_PATH}`);
  }
});
