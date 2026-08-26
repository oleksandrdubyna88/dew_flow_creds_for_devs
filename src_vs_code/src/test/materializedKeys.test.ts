import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { lockToOwner, materializedKeysDir } from '../materializedKeys';

/**
 * Where a materialized private key is written, and how it is locked down (audit A3).
 *
 * <p>`materializedKeysDir` encodes a fixed defect. Key material used to live directly in
 * `keys/`, shared by every window of the same profile — so any window's activate or dispose
 * purged the WHOLE directory and deleted a live SSH session's key out from under a window
 * that had done nothing but open. The per-pid subdirectory is what makes one window's purge
 * unable to reach another's in-use file, so "the path contains this process's pid" is the
 * guarantee, not an implementation detail.</p>
 */

test('each window writes under its OWN pid, so one window cannot purge another', () => {
  const dir = materializedKeysDir('/profile/storage');

  assert.equal(dir, path.join('/profile/storage', 'keys', String(process.pid)));
});

test('the pid segment is the LAST one — a purge of it takes nothing else with it', () => {
  // If the pid sat higher in the path, deleting it would take a sibling window's keys too.
  const dir = materializedKeysDir('/profile/storage');

  assert.equal(path.basename(dir), String(process.pid));
  assert.equal(path.basename(path.dirname(dir)), 'keys');
});

test('two storage roots never collide, even within one process', () => {
  assert.notEqual(materializedKeysDir('/profile/a'), materializedKeysDir('/profile/b'));
});

test('locking a real file down does not throw and leaves it readable BY US', () => {
  // Best effort by design: this is a hardening step over an already-restricted profile
  // directory, so a refused ACL must be a weaker file and never a broken feature. What must
  // not happen is the opposite mistake — locking ourselves out of a key we just wrote.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'creds-acl-'));
  const file = path.join(dir, 'id_ed25519');
  fs.writeFileSync(file, 'PRIVATE KEY BYTES', 'utf8');

  try {
    assert.doesNotThrow(() => lockToOwner(file));
    assert.equal(fs.readFileSync(file, 'utf8'), 'PRIVATE KEY BYTES', 'still ours to read');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('locking a file that is not there is silent — a failed write must not mask itself', () => {
  assert.doesNotThrow(() => lockToOwner(path.join(os.tmpdir(), 'creds-no-such-file-xyz')));
});
