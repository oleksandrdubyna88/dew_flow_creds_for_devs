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

/** `file:line` of every line with a raw temp call, in the named files of this folder (a line with two calls is one site). */
function sitesIn(files: readonly string[]): string[] {
  const sites = files.flatMap((file) => rawTempSites(fs.readFileSync(path.join(TESTS, file), 'utf8'), file).map((line) => `${file}:${line}`));
  return [...new Set(sites)];
}

test('the plain unit folders make no temp path of their own', () => {
  assert.deepEqual(sitesIn(PLAIN_UNIT_FOLDERS), []);
});

test('the scan finds a raw temp call however it is spelled, and a call across lines', () => {
  const planted = [
    "const a = fs.mkdtempSync(path.join(os.tmpdir(), 'x'));",
    "const b = await fs.promises.mkdtemp(",
    "  path.join(tmpdir(), 'y'));",
  ].join('\n');

  assert.deepEqual(rawTempSites(planted), [1, 1, 2, 3]);
});

test('the scan does not mistake a word in a comment or a string for a call', () => {
  const prose = ["// os.tmpdir() is what the old code called", "const note = 'mkdtempSync(os.tmpdir())';", '/* tmpdir() */'].join('\n');

  assert.deepEqual(rawTempSites(prose), []);
});

test('every file the scan names exists and is read (a renamed file must not drop out of the scan)', () => {
  for (const file of PLAIN_UNIT_FOLDERS) {
    assert.ok(fs.statSync(path.join(TESTS, file)).size > 0, `${file} is not where the scan looks`);
  }
});
