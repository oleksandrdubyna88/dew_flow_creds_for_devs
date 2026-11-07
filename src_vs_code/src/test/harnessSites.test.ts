// The scenario harnesses make their scratch through the leftovers wrapper (`scripts/lib/leftovers.cjs`) and the shared exit module
// (`scripts/lib/harnessScope.cjs`), or not at all (E2.2.S2, S3). A harness that calls `os.tmpdir()` or `mkdtemp` itself makes a folder
// nothing names, claims or removes when the process is killed. Every script under the two scripts folders is read, by its syntax tree.
//
// A scan that matches nothing passes forever (testing.md), so the prohibition has companions: the discovery must find the known
// harness files and more than ten files. The planted-call cases of the scan itself are in `leftoversSites.test.ts`.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { discoverSources, rawTempSites } from './tempSiteScan';

// `out/test` and `src/test` are both two folders below `src_vs_code`; the server is next to it.
const SCRIPT_FOLDERS = [
  path.resolve(__dirname, '..', '..', 'scripts'),
  path.resolve(__dirname, '..', '..', '..', 'src_minimalapi_server', 'scripts'),
];
const SCRIPT_EXTENSIONS = ['.cjs', '.mjs', '.js'];

/** What the temp-call scan does NOT read, each with its reason. */
const EXCLUDED = new Map<string, string>([['lib/leftovers.cjs', 'the wrapper: the one place that names the temp root and the short socket root']]);

/** `folder/file:line` of every raw temp call in the scripts. */
function sites(): string[] {
  const found = SCRIPT_FOLDERS.flatMap((folder) =>
    discoverSources(folder, EXCLUDED, SCRIPT_EXTENSIONS).flatMap((file) =>
      rawTempSites(fs.readFileSync(path.join(folder, file), 'utf8'), file).map((line) => `${path.basename(path.dirname(folder))}/${path.basename(folder)}/${file}:${line}`),
    ),
  );
  return [...new Set(found)];
}

test('[S2.1] no harness script makes a temp path of its own: every script under the two scripts folders is scanned', () => {
  assert.deepEqual(sites(), []);
});

test('the discovery reads the scripts folders: the known harnesses are in it, more than ten files, and each exclusion is real and has a reason', () => {
  const found = SCRIPT_FOLDERS.flatMap((folder) => discoverSources(folder, EXCLUDED, SCRIPT_EXTENSIONS).map((file) => path.basename(file)));

  for (const known of ['agent-broker-itest.cjs', 'creds-cli-itest.cjs', 'creds-mcp-itest.cjs', 'ssh-agent-itest.cjs', 'tree-perf-bench.cjs', 'backup-archive-itest.cjs', 'run-itests.mjs']) {
    assert.ok(found.includes(known), `${known} is not discovered`);
  }
  assert.ok(found.length > 10, `the discovery found only ${found.length} files`);
  assert.equal(found.includes('leftovers.cjs'), false, 'the wrapper is excluded');
  for (const [entry, reason] of EXCLUDED) {
    assert.ok(reason.split(/\s+/).length >= 3, `the exclusion of ${entry} needs a reason`);
    assert.ok(fs.existsSync(path.join(SCRIPT_FOLDERS[0], entry)), `the exclusion ${entry} names nothing: remove it`);
  }
});

/** Every file under `folder`, as an absolute path (the legacy-name search reads text, so it reads shell and Python files too). */
function allFiles(folder: string): string[] {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? allFiles(path.join(folder, entry.name)) : [path.join(folder, entry.name)]));
}

test('[S3.1] no harness script names a folder in a legacy form: `ait` and `sshd` without the owner segment are never collected', () => {
  // testsToDelete-exempt: legacy-name — this test's needles: it searches for the legacy forms, and spelled whole the file would find itself
  const needles = ['testsTo' + 'Delete-ait-', 'testsTo' + 'Delete-sshd-']; // spelled in two pieces: this file must not be the one it finds
  const files = SCRIPT_FOLDERS.flatMap(allFiles);
  const legacy = files.filter((file) => needles.some((needle) => fs.readFileSync(file, 'utf8').includes(needle))).map((file) => path.basename(file));

  assert.ok(files.length > 10, `the search reads only ${files.length} files`);
  assert.deepEqual(legacy, []);
});
