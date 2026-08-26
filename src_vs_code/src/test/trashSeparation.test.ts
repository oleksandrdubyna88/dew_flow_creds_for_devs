import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';

/**
 * The line the trash must not cross.
 *
 * <p>`deleteNodeRecursive` is the one real deletion — tombstone, every SecretStorage key, the
 * revision history — and three shipped features depend on it staying that way. Their promise, in
 * `research/PLAN_ephemeral_secrets.md`, is a real delete when the time comes, "never a flag that
 * leaves the secret in place". Route any of them through the trash and an entry that promised to
 * destroy itself instead moves to a folder and keeps working, while the UI still says it is
 * gone.</p>
 *
 * <p>This is a scan rather than a behavioural test on purpose. The defect is not a wrong answer
 * from one function; it is a call site somewhere choosing the wrong verb, and the only thing that
 * catches that in a file nobody is currently looking at is a check that reads every file.</p>
 */

const SRC = path.join(__dirname, '..', '..', 'src');

/**
 * The self-destruction machinery. None of it may route through the trash — each exists to make
 * a secret stop existing, and the trash is the opposite of that.
 */
const PERMANENT_ONLY = ['burnOnUse.ts', 'entityExpiry.ts', 'ephemeralSweeper.ts'];

/**
 * The two that actually delete. `entityExpiry.ts` is deliberately absent: it is arithmetic —
 * "has this expired, how long is left" — and the sweeper is what acts on its answer. This
 * distinction was found by the check itself, which failed on a list that assumed all three
 * deleted, and it is written down here so the next reader does not restore the wrong list.
 */
const MUST_STILL_DELETE = ['burnOnUse.ts', 'ephemeralSweeper.ts'];

/**
 * The file with its comments removed.
 *
 * <p>Stripping them is not tidiness — it is the difference between a check that reads code and
 * one that reads prose. `trash.ts` explains at length why it is NOT part of
 * `deleteNodeRecursive`, and a scan over the raw text failed on that explanation. Worse, the
 * mirror of it would PASS a file whose only mention of the permanent path was in a comment.</p>
 */
function read(file: string): string {
  return fs
    .readFileSync(path.join(SRC, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

test('burning, expiry and the sweeper never route through the trash', () => {
  for (const file of PERMANENT_ONLY) {
    const source = read(file);
    assert.ok(
      !source.includes('moveToTrash'),
      `${file} mentions moveToTrash — an entry that promised to destroy itself would instead be moved and keep working`,
    );
  }
});

test('each of them still reaches the permanent path', () => {
  // The other half of the same guarantee: not routing through the trash is worth nothing if the
  // call was dropped entirely.
  for (const file of MUST_STILL_DELETE) {
    assert.ok(
      read(file).includes('deleteNodeRecursive'),
      `${file} no longer names deleteNodeRecursive — does it still delete anything?`,
    );
  }
});

test('the trash is a move, and never a delete in disguise', () => {
  const trash = read('trash.ts');
  assert.ok(
    !trash.includes('deleteNodeRecursive'),
    'trash.ts must not delete: it decides what is in the trash, and the caller decides what happens to it',
  );
});

test('only the places that should may move things to the trash', () => {
  // A short allow-list rather than a blanket permission: a new caller is a decision somebody
  // should make deliberately, and adding it here is how they say so.
  const allowed = new Set(['storageManager.ts', 'extension.ts']);
  const offenders = fs
    .readdirSync(SRC)
    .filter((name) => name.endsWith('.ts'))
    .filter((name) => !allowed.has(name))
    .filter((name) => read(name).includes('storage.moveToTrash'));

  assert.deepEqual(
    offenders,
    [],
    'a new caller of moveToTrash appeared — if that is intended, add it to the allow-list with a reason',
  );
});
