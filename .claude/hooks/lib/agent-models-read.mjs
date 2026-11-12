/**
 * The reads of the agent-models installer: the source folder and the target folder, ONCE each, into the values the pure
 * decisions (`agent-models-decide.mjs`) work on. Neither function throws; a problem is a field of the result.
 *
 * Imports only `node:` builtins, `./user-guard-install.mjs` and `./agent-models-decide.mjs`, because a consumer runs it
 * from its verbatim copy in `.claude/hooks/lib/` with nothing installed beside it.
 */
import fs from 'node:fs';
import path from 'node:path';

import { lstatOrNull, readOrNull } from './user-guard-install.mjs';
import { MOD_FILES, PLUGIN_JSON, RELEASED_MOD, codeOf, currentUid, parseJsonObject, parseVersion, releasedModRefusal, versionOf } from './agent-models-decide.mjs';

export { lstatOrNull };

/** `{ bytes }` of a regular file (a symlink is not one), or `{ problem }` in the words of a refusal. */
function readRegular(file) {
  let stat;
  try {
    stat = lstatOrNull(file);
  } catch (e) {
    return { problem: `could not be read (${codeOf(e)})` };
  }
  if (stat === null) return { problem: 'is missing' };
  if (!stat.isFile()) return { problem: 'is not a regular file' };
  try {
    return { bytes: fs.readFileSync(file) };
  } catch (e) {
    return { problem: `could not be read (${codeOf(e)})` };
  }
}

function sourceVersion(file, bytes) {
  let value;
  try {
    value = parseJsonObject(bytes);
  } catch (e) {
    return { error: `source plugin.json ${file} does not parse (${e.message})` };
  }
  if (value === null) return { error: `source plugin.json ${file} is not a JSON object` };
  const version = parseVersion(value.version);
  return version ? { version } : { error: `source plugin.json ${file} has no MAJOR.MINOR.PATCH version (got ${JSON.stringify(value.version)})` };
}

function readSourceFiles(source, released) {
  const files = new Map();
  let version = null;
  for (const rel of MOD_FILES) {
    const file = path.join(source, rel);
    const read = readRegular(file);
    if (read.problem) return { error: `source file ${file} ${read.problem}` };
    files.set(rel, read.bytes);
    if (rel === PLUGIN_JSON) {
      const parsed = sourceVersion(file, read.bytes);
      if (parsed.error) return parsed;
      version = parsed.version;
    }
  }
  const held = { version, files };
  // The release check runs on THESE buffers, the only ones returned: one read per file, so nothing can change a file
  // between the check and the copy. The lstat in readRegular is a courtesy for an honest mistake, not a protection:
  // a file swapped in after it is read through, and its bytes are then checked like any others.
  const refusal = releasedModRefusal(held, released);
  return refusal ? { error: `source ${source} ${refusal}`, unreleased: true } : held;
}

/**
 * Reads the source folder ONCE and returns its bytes only when they are the released mod. Never throws, whatever
 * `source` is. `released` is a test seam (a fixture tree's own identity); production passes nothing.
 */
export function readSource(source, options) {
  try {
    const released = options?.released === undefined ? RELEASED_MOD : options.released;
    if (!fs.statSync(source, { throwIfNoEntry: false })?.isDirectory()) return { error: `source ${source} is not a directory` };
    return readSourceFiles(source, released);
  } catch (e) {
    return { error: `source ${source} could not be read (${codeOf(e)})` };
  }
}

/** The bytes of a regular file, null when it is absent or not a regular file. Any other failure (EACCES, EIO …) THROWS: the caller names the file. */
function regularBytesOrNull(file) {
  try {
    return lstatOrNull(file)?.isFile() ? fs.readFileSync(file) : null;
  } catch (e) {
    if (e.code === 'ENOTDIR') return null; // a path component of it is not a folder: it is not there
    throw e;
  }
}

const linkTextOf = file => {
  try {
    return fs.readlinkSync(file);
  } catch {
    return '';
  }
};

function readManifest(file) {
  try {
    const bytes = readOrNull(file);
    return bytes === null ? null : parseJsonObject(bytes);
  } catch {
    return null;
  }
}

/**
 * Reads the target ONCE: the kind first (by `lstat`, before anything follows a link), then the `MOD_FILES` files and the manifest.
 * A file that cannot be read (anything but absent) makes the target `unreadable`, naming THAT file. Never throws.
 */
export function readTarget(t, { uid = currentUid } = {}) {
  const at = { path: t.target };
  let stat;
  try {
    stat = lstatOrNull(t.target);
  } catch (e) {
    return { kind: 'unreadable', ...at, code: e.code };
  }
  if (stat === null) return { kind: 'missing', ...at };
  if (stat.isSymbolicLink()) return { kind: 'symlink', ...at, link: linkTextOf(t.target) };
  if (!stat.isDirectory()) return { kind: 'other', ...at };
  const me = uid();
  if (me !== undefined && stat.uid !== me) return { kind: 'foreign', ...at, uid: stat.uid };
  const files = new Map();
  for (const rel of MOD_FILES) {
    try {
      files.set(rel, regularBytesOrNull(path.join(t.target, rel)));
    } catch (e) {
      return { kind: 'unreadable', path: path.join(t.target, rel), code: e.code };
    }
  }
  return { kind: 'dir', ...at, version: versionOf(files.get(PLUGIN_JSON)), files, manifest: readManifest(t.manifest) };
}

