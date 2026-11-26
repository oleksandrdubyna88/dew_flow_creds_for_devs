import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { after, test } from 'node:test';
import { BRIDGED_DB_PROFILES, CONTAINER_SQLCMD_CANDIDATE } from '../bridgedDbProfile';

/** The production table with the container's candidate row turned (it is turned in the commit that adds its CI job). */
const WITH_CONTAINER = BRIDGED_DB_PROFILES.map((row) => (row.client === 'sqlcmd' && row.platform === 'container' ? CONTAINER_SQLCMD_CANDIDATE : row));
import { DRIVER_UNLOADABLE, ENV_FILES_DIR, SQLCMD_IN_IMAGE, buildArgv, containerVerdict, imageTagOf, probeArgv, queryArgv, sweepEnvFiles, writeEnvFile, wslcPath } from '../containerDb';
import { cleanupScope, ownedDir } from '../../scripts/lib/leftovers.cjs';

/** Change 11.1, the 72-hour slice, S3: the pieces of the container road, each alone. */

const scope = cleanupScope();
after(() => scope.close());

const PROBE_OK = 'Microsoft (R) SQL Server Command Line Tool\nVersion 18.7.0001.1 Linux\nCopyright (C) 2017 Microsoft Corporation. All rights reserved.\n/opt/microsoft/msodbcsql18/lib64/libmsodbcsql-18.7.so.1.1\nmissing 0\n';
const RUNTIME = { tool: 'C:\\Program Files\\WSL\\wslc.exe', image: 'creds-db-sqlcmd:0123456789abcdef' };

test('S3: the image is named after the recipe\'s bytes: the same recipe, the same tag; a changed one, another', () => {
  const recipe = fs.readFileSync(path.join(__dirname, '..', '..', 'containers', 'db-sqlcmd.Containerfile'), 'utf8');
  assert.equal(imageTagOf(recipe), imageTagOf(recipe));
  assert.match(imageTagOf(recipe), /^creds-db-sqlcmd:[0-9a-f]{16}$/);
  assert.notEqual(imageTagOf(recipe + '\n'), imageTagOf(recipe));
  assert.match(recipe, /msodbcsql18=18\.7\.1\.1-1 mssql-tools18=18\.7\.1\.1-1/, 'the recipe pins the measured build');
  assert.match(recipe, /^FROM ubuntu@sha256:[0-9a-f]{64}$/m, 'the base is pinned by digest');
  assert.match(recipe, /^USER 65534:65534$/m);
});

test('S3: wslc is looked for under ProgramFiles, and only answered when it is there', () => {
  assert.equal(wslcPath({ ProgramFiles: 'C:\\Program Files' }, () => true), 'C:\\Program Files\\WSL\\wslc.exe');
  assert.equal(wslcPath({ ProgramFiles: 'C:\\Program Files' }, () => false), undefined);
  assert.equal(wslcPath({}, () => true), undefined);
});

test('S3: the runs are held short, the probe has no network, the query names the env file and puts the client after the image', () => {
  const held = ['run', '--rm', '--pull', 'never', '--cap-drop', 'ALL', '--user', '65534:65534'];
  assert.deepEqual(probeArgv(RUNTIME).slice(0, 8), held);
  assert.deepEqual(probeArgv(RUNTIME).slice(8, 11), ['--network', 'none', RUNTIME.image]);
  const argv = queryArgv(RUNTIME, 'C:\\s\\db-env\\x.env', { exe: SQLCMD_IN_IMAGE, args: ['-S', 'h', '-Q', 'select 1'] });
  assert.deepEqual(argv.slice(0, 8), held);
  assert.deepEqual(argv.slice(8), ['--env-file', 'C:\\s\\db-env\\x.env', RUNTIME.image, SQLCMD_IN_IMAGE, '-S', 'h', '-Q', 'select 1']);
  assert.deepEqual(buildArgv(RUNTIME, '/ext/containers/db-sqlcmd.Containerfile'), ['build', '-t', RUNTIME.image, '-f', '/ext/containers/db-sqlcmd.Containerfile', '/ext/containers']);
});

test('S3: the probe of the measured image is served on the container row, with the client\'s path IN the image and the driver bound', () => {
  const verdict = containerVerdict(WITH_CONTAINER, 'sqlcmd', 0, PROBE_OK);
  assert.equal(verdict.ok, true, verdict.ok ? '' : verdict.sentence);
  if (verdict.ok) {
    assert.equal(verdict.vendor, 'odbc-sqlcmd');
    assert.equal(verdict.version, '18.7.0001.1');
    assert.equal(verdict.file.path, SQLCMD_IN_IMAGE);
    assert.equal(verdict.driver?.version, '18.7.1.1');
  }
});

test('S3: another build, no driver line, or no answer at all is not served', () => {
  assert.equal(containerVerdict(WITH_CONTAINER, 'sqlcmd', 0, PROBE_OK.replace('18.7.so.1.1', '18.7.so.2.1')).ok, false, 'another driver');
  assert.equal(containerVerdict(WITH_CONTAINER, 'sqlcmd', 0, PROBE_OK.replace('18.7.0001.1', '18.6.0001.1')).ok, false, 'another client');
  assert.equal(containerVerdict(WITH_CONTAINER, 'sqlcmd', 0, PROBE_OK.split('\n').slice(0, 3).join('\n')).ok, false, 'no driver line');
  assert.equal(containerVerdict(WITH_CONTAINER, 'sqlcmd', 127, '').ok, false, 'no client');
  assert.equal(containerVerdict(WITH_CONTAINER, 'psql', 0, 'psql (PostgreSQL) 16.4\n').ok, false, 'psql has no container row');
});

test('S3: the env file is owner-only in the storage folder, holds NAME=value lines as given, and goes on remove; a line break is refused before any file', () => {
  const storage = ownedDir(scope, 'envfile');
  const file = writeEnvFile(storage, { SQLCMDPASSWORD: 'p w=x;"\'$HOME', SQLCMDUSER: 'app' });
  assert.ok(!('refused' in file));
  if (!('refused' in file)) {
    assert.equal(path.dirname(file.path), path.join(storage, ENV_FILES_DIR));
    assert.equal(fs.readFileSync(file.path, 'utf8'), 'SQLCMDPASSWORD=p w=x;"\'$HOME\nSQLCMDUSER=app\n');
    if (process.platform !== 'win32') {
      assert.equal(fs.statSync(file.path).mode & 0o777, 0o600);
      assert.equal(fs.statSync(path.dirname(file.path)).mode & 0o777, 0o700);
    }
    file.remove();
    assert.equal(fs.existsSync(file.path), false);
  }
  const before = fs.readdirSync(path.join(storage, ENV_FILES_DIR)).length;
  assert.deepEqual(writeEnvFile(storage, { SQLCMDPASSWORD: 'a\nb' }), { refused: 'the value of SQLCMDPASSWORD cannot be handed to the container (a line break)' });
  assert.equal('refused' in writeEnvFile(storage, { 'not a name': 'x' }), true);
  assert.equal(fs.readdirSync(path.join(storage, ENV_FILES_DIR)).length, before, 'no file for a refusal');
});

test('S3: the activation sweep removes every env file a killed run left, and nothing else', () => {
  const storage = ownedDir(scope, 'sweep');
  const left = writeEnvFile(storage, { SQLCMDPASSWORD: 'left behind' });
  fs.writeFileSync(path.join(storage, ENV_FILES_DIR, 'keep.txt'), 'not an env file');
  assert.equal(sweepEnvFiles(storage), 1);
  assert.equal(!('refused' in left) && fs.existsSync(left.path), false);
  assert.deepEqual(fs.readdirSync(path.join(storage, ENV_FILES_DIR)), ['keep.txt']);
  assert.equal(sweepEnvFiles(ownedDir(scope, 'sweep-none')), 0, 'no folder: nothing to sweep');
});

test('S3: an image whose driver cannot be loaded (a library missing, as measured on the laptop) is not served, whatever its version line says', () => {
  const verdict = containerVerdict(WITH_CONTAINER, 'sqlcmd', 0, PROBE_OK.replace('missing 0', 'missing 1'));
  assert.deepEqual(verdict, { ok: false, sentence: DRIVER_UNLOADABLE });
  assert.equal(containerVerdict(WITH_CONTAINER, 'sqlcmd', 0, PROBE_OK.replace('missing 0\n', '')).ok, false, 'a probe that did not say is not served');
});
