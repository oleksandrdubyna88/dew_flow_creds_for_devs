import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { lockToOwner, materializedKeysDir, safeFileComponent } from '../materializedKeys';

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

/**
 * `safeFileComponent` — the reason a vault id cannot become a path.
 *
 * <p>Four places build a file name out of vault data: the materialized private key, the VPN
 * config, the per-entity `known_hosts`, and the script body. A share cannot reach any of them —
 * `shareInbox` gives every accepted entry a fresh local id, on purpose — but IMPORT and RESTORE
 * write an envelope's nodes with their own ids, so a crafted backup someone is talked into
 * importing puts an arbitrary id into the tree.</p>
 *
 * <p>The prefix each caller adds (`known_hosts-`, `script-`) defeats the obvious `../` and
 * nothing else: `x/../../../../evil` still resolves clean out of the directory, because the
 * prefixed segment is popped by the `..` that follows it.</p>
 */

/** A single backslash, spelled once — a path separator on Windows. */
const BS = String.fromCharCode(92);


test('an ordinary uuid is returned unchanged', () => {
  // The normal case must not be rewritten: the file name is how the purge and the wipe find
  // the file again.
  const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

  assert.equal(safeFileComponent(id), id);
});

test('a separator cannot survive into the name', () => {
  for (const hostile of ['x/../../../../evil', '..' + BS + '..' + BS + 'evil', 'a/b', 'a' + BS + 'b']) {
    const safe = safeFileComponent(hostile);
    assert.ok(!safe.includes('/'), `${hostile} -> ${safe}`);
    assert.ok(!safe.includes(BS), `${hostile} -> ${safe}`);
  }
});

test('the result always stays inside the directory it is joined to', () => {
  // The property that actually matters, asserted the way the callers use it.
  const base = path.join(os.tmpdir(), 'creds-base');
  for (const hostile of ['x/../../../../evil', '../../evil', '..', '.', '...', '/etc/passwd']) {
    const joined = path.join(base, safeFileComponent(hostile));
    assert.ok(path.resolve(joined).startsWith(path.resolve(base)), `${hostile} -> ${joined}`);
  }
});

test('two different ids never collapse onto one name', () => {
  // The worse bug the sanitiser could introduce: two entities sharing a key file means a
  // connection authenticating with the wrong credential, and it looks like a working feature.
  const names = ['a/b', 'a_b', 'a' + BS + 'b', 'a:b', 'a..b', '../b', 'b'].map(safeFileComponent);

  assert.equal(new Set(names).size, names.length, names.join(' | '));
});

test('a name that had to be rewritten carries a digest of the original', () => {
  // That is what keeps the collision above impossible rather than merely unlikely.
  const safe = safeFileComponent('x/../../../../evil');

  assert.match(safe, /-[0-9a-f]{8}$/);
});

test('an empty id still yields a usable name', () => {
  const safe = safeFileComponent('');

  assert.ok(safe.length > 0);
  assert.ok(!safe.includes('/') && !safe.includes(BS));
});

test('a very long id is truncated, but still unique', () => {
  // A path component over the OS limit fails the write, which would break the feature for a
  // legitimate-but-odd id rather than protecting anything.
  const first = safeFileComponent('x/'.repeat(400) + 'a');
  const second = safeFileComponent('x/'.repeat(400) + 'b');

  assert.ok(first.length < 100, String(first.length));
  assert.notEqual(first, second);
});
