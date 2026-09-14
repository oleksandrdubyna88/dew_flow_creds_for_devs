import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';

/**
 * The lock file names its own project, and that name must not be a stale one.
 *
 * <p>`npm ci` checks the lock's DEPENDENCIES against the manifest and says nothing about the
 * project's own `version` field, so a release that bumps `package.json` and leaves the lock alone
 * installs perfectly and is wrong in a way no tool reports. It drifted here for fourteen releases:
 * the lock said 0.98.0 while the extension shipped as 1.7.0, and every release commit in that span
 * touched `package.json` and `CHANGELOG.md` and nothing else.</p>
 *
 * <p>What it costs is small and real. The lock is what a reader, an auditor or a supply-chain
 * scanner opens to ask "which version is this dependency set for", and for fourteen releases the
 * honest answer and the written one differed. This test is the forcing function the release
 * process did not have: bump both, or the suite is red.</p>
 */

const root = path.join(__dirname, '..', '..');
const read = (name: string): Record<string, unknown> =>
  JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));

test('the lock file agrees with the manifest about what this project is', () => {
  const manifest = read('package.json');
  const lock = read('package-lock.json') as {
    name: string;
    version: string;
    packages: Record<string, { name?: string; version?: string }>;
  };

  assert.equal(
    lock.version,
    manifest.version,
    'package-lock.json states a different version from package.json — a release bumped one and ' +
      'not the other, which npm never complains about and every reader of the lock believes',
  );
  assert.equal(
    lock.packages['']?.version,
    manifest.version,
    'the lock\'s root package entry states a different version from package.json — there are TWO ' +
      'version fields in a lockfileVersion 3 file, and fixing only the top one leaves the drift',
  );
  assert.equal(lock.name, manifest.name, 'the lock names a different project from the manifest');
});
