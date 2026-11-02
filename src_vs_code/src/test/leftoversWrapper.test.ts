// The Node wrapper over the mounted test-leftovers reference (`scripts/lib/leftovers.cjs`). What is tested here
// is the BINDING and the additions: the token and the row, the names, the claim beside the folder, the unwind,
// `ownedFile`, `writeStub`, `shortSocketRoot`, the export list, and the refusal when the mount is missing. The
// reference's own behaviour (its several hundred tests) runs in `dew_flow_conventions`, not here.
//
// Every scenario that counts entries uses a PRIVATE parent made with `ownedDir`: many test files write the
// temp root at the same time, so a count of the shared root is a count of somebody else's folders.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import type { Owner, Scope } from '../../scripts/lib/leftovers.cjs';
import {
  REPO_ROW,
  REPO_TOKEN,
  cleanupScope,
  formatOwner,
  ownedDir,
  ownedFile,
  ownedName,
  readOwner,
  runRecord,
  shortSocketRoot,
  tempRoot,
  thisOwnerToken,
  writeStub,
} from '../../scripts/lib/leftovers.cjs';

// `out/test` and `src/test` are both two folders below `src_vs_code`, which is one below the repository root.
const SRC_VS_CODE = path.resolve(__dirname, '..', '..');
const REPO_ROOT = path.resolve(SRC_VS_CODE, '..');
const WRAPPER = path.join(SRC_VS_CODE, 'scripts', 'lib', 'leftovers.cjs');
const DETAIL = path.join(REPO_ROOT, '.claude', 'rules', 'shared', 'common', 'test-leftovers-detail.md');
const TYPES = path.join(SRC_VS_CODE, 'scripts', 'lib', 'leftovers.d.cts');

/** A private parent: scenarios that list a folder make it here, so a sibling test's folders never count. */
function privateParent(scope: Scope): string {
  return ownedDir(scope, 'wrap');
}

function asOwner(read: ReturnType<typeof readOwner>): Owner {
  assert.ok(read !== null && !('unreadable' in read), `the claim must be readable, got ${JSON.stringify(read)}`);
  return read;
}

test('the wrapper binds the token and the row of this repository', () => {
  assert.equal(REPO_TOKEN, 'creds');
  const name = ownedName('download');

  assert.match(name, /^testsToDelete-[uw][0-9]{1,10}-creds-download-[A-Za-z0-9]{6}$/);
  assert.equal(name.split('-')[1], thisOwnerToken());
});

test('the row is the repository cell of the creds row of the mounted detail, read back from the file', () => {
  const detail = fs.readFileSync(DETAIL, 'utf8');
  const row = detail.split(/\r?\n/).find((line) => line.startsWith('| `creds` |'));
  assert.ok(row !== undefined, 'the mounted detail has a creds row');
  const cells = row.split('|').map((cell) => cell.trim());

  assert.equal(REPO_ROW, cells[3]);
});

test('a thousand names are distinct', () => {
  const names = new Set(Array.from({ length: 1000 }, () => ownedName('distinct')));
  assert.equal(names.size, 1000);
});

test('a bad what makes nothing and leaves the parent as it was', (t) => {
  const parent = privateParent(t);
  // The room for `what` is what is left of 63 characters under THIS owner: the reference budgets the owner first.
  const room = 63 - `testsToDelete-${thisOwnerToken()}-creds-`.length - 1 - 6;
  const bad = ['', 'a/b', 'a\\b', '-x', 'a\u0001b', 'x'.repeat(room + 1)];

  for (const what of bad) {
    assert.throws(() => ownedDir(t, what, { parent }), TypeError, `what ${JSON.stringify(what)} must be refused`);
  }
  assert.deepEqual(fs.readdirSync(parent), []);
  // One positive, so the refusals above are about `what` and not about a parent that cannot be written.
  const fitting = ownedDir(t, 'x'.repeat(room), { parent });
  assert.ok(fs.statSync(fitting).isDirectory());
});

test('the claim sits beside the folder, never inside it', (t) => {
  const parent = privateParent(t);
  const dir = ownedDir(t, 'claim', { parent });

  assert.deepEqual(fs.readdirSync(dir), []);
  assert.ok(fs.existsSync(`${dir}.owner`));
  const owner = asOwner(readOwner(dir, 'folder'));
  assert.equal(owner.owner, thisOwnerToken());
  // The claim holds the RUN's record when a runner exported one, this process's own otherwise.
  assert.equal(formatOwner(owner), formatOwner(runRecord()));
});

test('a test that fails still removes its folder and its claim', async () => {
  const fixture = [
    "const { test } = require('node:test');",
    "const fs = require('node:fs');",
    `const { ownedDir } = require(${JSON.stringify(WRAPPER)});`,
    "test('the failing body', (t) => {",
    "  const dir = ownedDir(t, 'unwind', { parent: process.env.WRAPPER_TEST_PARENT });",
    "  fs.writeFileSync(process.env.WRAPPER_TEST_PATH, dir);",
    "  throw new Error('the failing body');",
    '});',
  ].join('\n');
  const scope = cleanupScope();
  const root = ownedDir(scope, 'unw');
  const file = path.join(root, 'fixture.test.cjs');
  const where = path.join(root, 'made-path.txt');
  fs.writeFileSync(file, fixture);
  const parent = path.join(root, 'parent');
  fs.mkdirSync(parent);
  try {
    // NODE_TEST_CONTEXT is how node tells a test process it is a child of a runner; a nested `node --test` that inherits
    // it reports to that parent and exits 0 whatever happened.
    const run = spawnSync(process.execPath, ['--test', file], {
      encoding: 'utf8',
      timeout: 120_000,
      killSignal: 'SIGKILL',
      env: { ...process.env, NODE_TEST_CONTEXT: undefined, WRAPPER_TEST_PARENT: parent, WRAPPER_TEST_PATH: where, TESTSTODELETE_RUN: '' },
    });

    assert.notEqual(run.status, 0, 'the fixture test must fail, or this proves nothing about a failing body');
    const dir = fs.readFileSync(where, 'utf8');
    assert.ok(dir.startsWith(parent), 'the fixture made its folder in the private parent');
    assert.equal(fs.existsSync(dir), false, 'the folder is gone');
    assert.equal(fs.existsSync(`${dir}.owner`), false, 'its claim is gone');
  } finally {
    await scope.close();
  }
});

test('ownedFile is a path inside an owned folder of the right name; the file is not made', (t) => {
  const parent = privateParent(t);
  const file = ownedFile(t, 'one', 'note.txt');

  assert.equal(path.basename(file), 'note.txt');
  assert.match(path.basename(path.dirname(file)), /^testsToDelete-[uw][0-9]{1,10}-creds-one-[A-Za-z0-9]{6}$/);
  assert.ok(fs.statSync(path.dirname(file)).isDirectory());
  assert.equal(fs.existsSync(file), false);
  assert.ok(fs.existsSync(parent));
});

test('writeStub writes the text into an owned folder; two stubs of two scopes are two files', async () => {
  const first = cleanupScope();
  const second = cleanupScope();
  const a = writeStub(first, 'stub', 'module.exports = 1;\n');
  const b = writeStub(second, 'stub', 'module.exports = 2;\n');
  try {
    assert.notEqual(a, b);
    assert.equal(fs.readFileSync(a, 'utf8'), 'module.exports = 1;\n');
    assert.equal(fs.readFileSync(b, 'utf8'), 'module.exports = 2;\n');
    assert.match(path.basename(path.dirname(a)), /^testsToDelete-[uw][0-9]{1,10}-creds-stub-[A-Za-z0-9]{6}$/);
  } finally {
    await first.close();
  }
  assert.equal(fs.existsSync(path.dirname(a)), false, 'closing the scope removes the folder');
  assert.equal(fs.existsSync(`${path.dirname(a)}.owner`), false, 'and its claim');
  assert.ok(fs.existsSync(b), 'the other scope is untouched');
  await second.close();
  assert.equal(fs.existsSync(path.dirname(b)), false);
});

test('shortSocketRoot is /tmp on Linux and macOS and the temp root on Windows', () => {
  assert.equal(shortSocketRoot(), process.platform === 'win32' ? tempRoot() : '/tmp');
});

test('the types say what the module exports, in both directions', () => {
  const declared = [...fs.readFileSync(TYPES, 'utf8').matchAll(/^export (?:const|function) (\w+)/gm)].map((m) => m[1]);
  const exported = Object.keys(require(WRAPPER));

  assert.ok(declared.length > 0, 'the scan found the declarations');
  assert.deepEqual([...declared].sort(), [...exported].sort());
});

test('with the mount missing the wrapper refuses and names the command that restores it', (t) => {
  // A copy of the wrapper in a tree that has no `.claude/rules/shared` beside it: the refusal is the loader's.
  const root = ownedDir(t, 'nomount');
  const lib = path.join(root, 'src_vs_code', 'scripts', 'lib');
  fs.mkdirSync(lib, { recursive: true });
  fs.copyFileSync(WRAPPER, path.join(lib, 'leftovers.cjs'));

  const run = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(path.join(lib, 'leftovers.cjs'))})`], { encoding: 'utf8', timeout: 60_000, killSignal: 'SIGKILL' });

  assert.notEqual(run.status, 0, 'a missing mount is a refusal, not a silent pass');
  assert.match(run.stderr, /git submodule update --init \.claude\/rules\/shared/);
});
