'use strict';
// The Node WRAPPER over the mounted test-leftovers reference: `common/test-leftovers.md`, bound to this repository's
// token (the `creds` row of the `## Tokens` table of the mounted detail).
//
// Nothing of the reference is copied here. The mount (`.agents/conventions/tools/lib/owned.mjs`) is loaded, its
// functions are bound to the token ONCE with `ownedFor`, and re-exported as they are; a defect in the reference is
// fixed in `dew_flow_conventions` and taken by a pin bump, never patched here (decision 11 of the merged core). What
// this file adds is three things of this repository's own: `shortSocketRoot()`, `ownedFile()` and `writeStub()`.
//
// The reference is an ES module. A CommonJS file loads it with `require()`, which Node does unflagged from 22.12
// (measured 2026-11-02: Node 22.23.4 and 26.12.1 both load `owned.mjs` without a warning), so every caller of this
// module — a unit test, a harness, a runner — gets the helper synchronously and needs no `await` at the top.
//
// No mount, no helper, no test: a missing mount is a refusal naming the command that restores it, never a quiet
// fallback to some other way of making temp folders.
const fs = require('node:fs');
const path = require('node:path');

/** This repository's token — rule section 1, written ONCE in this file. */
const REPO_TOKEN = 'creds';
/** The `repository` column of this token's row of the mounted `## Tokens` table. */
const REPO_ROW = 'the developer-credentials server and extension';

// `scripts/lib` is three folders below the repository root.
const MOUNT = path.resolve(__dirname, '..', '..', '..', '.agents', 'conventions');
const LIB = path.join(MOUNT, 'tools', 'lib');

function loadReference() {
  if (!fs.existsSync(path.join(LIB, 'owned.mjs'))) {
    throw new Error(
      `leftovers: the shared rules are not mounted (${path.join(LIB, 'owned.mjs')} is missing) — run: git submodule update --init .agents/conventions`,
    );
  }
  return require(path.join(LIB, 'owned.mjs'));
}

const reference = loadReference();
const owned = reference.ownedFor({ token: REPO_TOKEN, row: REPO_ROW });

/**
 * The root a Unix socket's folder is made in. A socket path must stay under 103 bytes on macOS, whose temp root is about
 * 49 characters long: with the owner-form folder name inside it, a socket would not fit. Windows has no such limit
 * that matters here (named pipes), so it keeps the temp root.
 */
function shortSocketRoot() {
  // testsToDelete-exempt: raw-temp — a Unix socket path must stay under 103 bytes on macOS, whose TMPDIR is too long
  return process.platform === 'win32' ? owned.tempRoot() : '/tmp';
}

/**
 * A path inside an owned folder `what`: `<ownedDir(scope, what)>/<name>`. The folder is made; the file is not. `name` is ONE plain
 * path segment: a separator of either OS, `.`, `..` or an empty name would leave the owned folder, where nothing removes the file.
 */
function ownedFile(scope, what, name) {
  if (typeof name !== 'string' || name === '' || name === '.' || name === '..' || /[\\/\0]/.test(name)) {
    throw new TypeError(`ownedFile: the name must be one plain file name, with no separator and not '.', '..' or empty; got ${JSON.stringify(name)}`);
  }
  return path.join(owned.ownedDir(scope, what), name);
}

/** Write `text` as a file in an owned folder `what` (a harness's fake `vscode` module); returns the file's path. */
function writeStub(scope, what, text) {
  const file = ownedFile(scope, what, 'stub.js');
  fs.writeFileSync(file, text);
  return file;
}

module.exports = {
  REPO_TOKEN,
  REPO_ROW,
  REFERENCE_LIB: LIB,
  ownedName: owned.ownedName,
  ownedPattern: owned.ownedPattern,
  ownedDir: owned.ownedDir,
  cleanupScope: owned.cleanupScope,
  tempRoot: owned.tempRoot,
  removeQuietly: owned.removeQuietly,
  readOwner: owned.readOwner,
  ownerState: owned.ownerState,
  isMine: owned.isMine,
  processProbe: owned.processProbe,
  thisOwner: owned.thisOwner,
  thisOwnerToken: owned.thisOwnerToken,
  formatOwner: owned.formatOwner,
  runRecord: owned.runRecord,
  shortSocketRoot,
  ownedFile,
  writeStub,
};
