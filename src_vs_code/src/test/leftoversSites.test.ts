// The unit tests make their scratch through the leftovers wrapper (`scripts/lib/leftovers.cjs`) or not at all. A test that
// calls `os.tmpdir()` or `mkdtemp` itself makes a folder nothing names, claims or removes on a failed assertion, and which
// the next run cannot tell from a stranger's — so each migrated file is scanned for a raw temp call, story by story.
//
// A scan that matches nothing passes forever (testing.md), so the prohibition has companions: the scan must find a planted
// raw call, must NOT find a word in a comment or a string, and must read every file it names.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { shortSocketRoot } from '../../scripts/lib/leftovers.cjs';
import { MAX_UNIX_SOCKET_PATH, socketPathFor } from '../brokerListeners';
import { agentSocketPath } from '../sshAgentServer';
import { rawTempSites } from './tempSiteScan';

// `out/test` and `src/test` are both two folders below `src_vs_code`.
const TESTS = path.resolve(__dirname, '..', '..', 'src', 'test');

/** E2.1.S3: the plain unit folders — every site that makes a folder and holds no socket. */
const PLAIN_UNIT_FOLDERS = [
  'archiveDownload.test.ts',
  'agentUseActions.test.ts',
  'arrivalPin.test.ts',
  'brokerAbandoned.test.ts',
  'brokerEndpointSweep.test.ts',
  'cliEndpoint.test.ts',
  'configSnippet.test.ts',
  'connectionOptions.test.ts',
  'crossWindowWrites.test.ts',
  'dependencyChain.test.ts',
  'diagnosticLog.test.ts',
  'gitTransport.test.ts',
  'gitTransportSerial.test.ts',
  'hostKeyPin.test.ts',
  'hostKeyTrust.test.ts',
  'hygieneScan.test.ts',
  'keyInstaller.test.ts',
  'materializedKeys.test.ts',
  'pinClickPaths.test.ts',
  'sshDefaultProbe.test.ts',
  'sshExecRunner.test.ts',
  'sshUseActions.test.ts',
  'wslMcpCheckHost.test.ts',
  'vpnGoneRequest.test.ts',
  'vpnWorld.ts',
];

/**
 * E2.1.S4: the tests that start a process or bind a Unix socket, and the two `*World.ts` helpers that make a storage folder. Their
 * folders are made under the SHORT socket root, because a socket path must stay under 103 bytes on macOS.
 */
const PROCESS_AND_SOCKET_SITES = [
  'brokerListeners.test.ts',
  'brokerOriginDoor.test.ts',
  'requestLife.test.ts',
  'sshAgentServer.test.ts',
  'sshAgentWorld.ts',
];

/** `file:line` of every line with a raw temp call, in the named files of this folder (a line with two calls is one site). */
function sitesIn(files: readonly string[]): string[] {
  const sites = files.flatMap((file) => rawTempSites(fs.readFileSync(path.join(TESTS, file), 'utf8'), file).map((line) => `${file}:${line}`));
  return [...new Set(sites)];
}

test('the plain unit folders make no temp path of their own', () => {
  assert.deepEqual(sitesIn(PLAIN_UNIT_FOLDERS), []);
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

test('the scan does not mistake a word in a comment or a string for a call', () => {
  const prose = [`// os.${TMP}() is what the old code called`, `const note = '${MK}Sync(os.${TMP}())';`, `/* ${TMP}() */`].join('\n');

  assert.deepEqual(rawTempSites(prose), []);
});

test('every file the scan names exists and is read (a renamed file must not drop out of the scan)', () => {
  for (const file of PLAIN_UNIT_FOLDERS) {
    assert.ok(fs.statSync(path.join(TESTS, file)).size > 0, `${file} is not where the scan looks`);
  }
});

test('the process and socket tests make no temp path of their own', () => {
  assert.deepEqual(sitesIn(PROCESS_AND_SOCKET_SITES), []);
});

test('no unit-test file names a folder in the legacy `agent` form: a name without the owner segment is never collected', () => {
  const needle = 'testsTo' + 'Delete-agent-'; // spelled in two pieces: this file must not be the one it finds
  const files = fs.readdirSync(TESTS).filter((name) => name.endsWith('.ts'));
  const legacy = files.filter((name) => fs.readFileSync(path.join(TESTS, name), 'utf8').includes(needle));

  assert.ok(files.length > 100, 'the scan reads the whole test folder');
  assert.deepEqual(legacy, []);
});

test('the longest socket path an owned folder under the short root can have fits the unix limit, with the longest owner and a ten-digit pid', () => {
  // The owner token `w` + 10 digits is the longest the grammar allows, `agent` the longest `what` a socket folder takes (5), the
  // id six characters. macOS caps a socket path at 103 bytes and its TMPDIR is about 49 characters, which is why the folder is
  // under `/tmp` and not under the temp root; this is asserted on every OS so a longer owner, id or pid is red on Linux too.
  const folder = path.join(shortSocketRoot(), 'testsToDelete-w4294967295-creds-agent-abcdef');
  const broker = socketPathFor(folder, 4294967295, 'linux');
  const agent = agentSocketPath(folder, 'linux', 4294967295);

  assert.ok(broker !== undefined, `the broker's socket path is refused as too long: ${folder}`);
  for (const socket of [broker, agent]) {
    assert.ok(Buffer.byteLength(socket) <= MAX_UNIX_SOCKET_PATH, `${socket} is ${Buffer.byteLength(socket)} bytes, the limit is ${MAX_UNIX_SOCKET_PATH}`);
  }
});
