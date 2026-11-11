/**
 * The disk half of the agent-models installer's copy: the leftovers of a killed run (`reconcile`) and the rename swap
 * (`swap`, `carryOutCopy`), plus the mods folder check. Every decision they act on is made in
 * `agent-models-decide.mjs`; `agent-models-install.mjs` sequences the whole step.
 *
 * Imports only `node:` builtins, `./user-guard-install.mjs` and its `agent-models-*.mjs` siblings, because a consumer runs
 * it from its verbatim copy in `.claude/hooks/lib/` with nothing installed beside it.
 */
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { serialise, writeAtomic } from './user-guard-install.mjs';
import {
  ASIDE_TAG, LEFTOVER_MIN_AGE_MS, MOD_FILES, PLUGIN_JSON, REPLACED_TAG, STAGING_TAG, codeOf, currentUid, leftoverStamp,
  compareVersions, parseJsonObject, parseVersion, replacedStamp, sha256, versionText,
} from './agent-models-decide.mjs';
import { lstatOrNull } from './agent-models-read.mjs';

// ---------------------------------------------------------------------------------------------------------------------
// the leftovers of a killed run
// ---------------------------------------------------------------------------------------------------------------------

/** The default `remove` seam of `reconcile` and `ensureAgentModels`: a folder or a file, recursive, never silent about a failure. */
export const defaultRemove = p => fs.rmSync(p, { recursive: true, force: false });

export const rmQuiet = p => {
  try {
    fs.rmSync(p, { recursive: true, force: true });
  } catch {
    // a cleanup that failed is not a failure of the swap: what stays is a leftover, and reconcile owns leftovers
  }
};

const isOtherUsers = (stat, uid) => {
  const me = uid();
  return me !== undefined && stat.uid !== me;
};

/**
 * What `dir` holds, in three kinds: `{ absent: true }` (no regular `.claude-plugin/plugin.json`: engine junk or nothing),
 * `{ unreadable: true }` (the file is there and reading it failed: EIO, EMFILE, EACCES; whether it is a mod is not known),
 * or `{ version }` (the MAJOR.MINOR.PATCH in it, or null when the content is not a version). The one reader of that file.
 */
export function readModPresence(dir) {
  const file = path.join(dir, PLUGIN_JSON);
  try {
    if (!lstatOrNull(file)?.isFile()) return { absent: true };
  } catch (e) {
    return e.code === 'ENOTDIR' ? { absent: true } : { unreadable: true };
  }
  try {
    const value = parseJsonObject(fs.readFileSync(file));
    return { version: value === null ? null : parseVersion(value.version) };
  } catch {
    return { unreadable: true };
  }
}

/** The MAJOR.MINOR.PATCH version in the regular `.claude-plugin/plugin.json` of `dir`, or null: not a mod (engine junk, no file, no version) or not readable now. */
export const modVersionIn = dir => readModPresence(dir).version ?? null;

/** True when `dir` holds a mod (see `modVersionIn`), not engine junk. */
export const hasModVersion = dir => modVersionIn(dir) !== null;

/** Deletes `p` by `remove` (a link is unlinked, never followed). ENOENT is a success: it is gone. Returns the failing error or null. */
function removeLeftover(p, stat, remove) {
  try {
    if (stat.isSymbolicLink()) fs.unlinkSync(p);
    else remove(p);
  } catch (e) {
    return e.code === 'ENOENT' ? null : e;
  }
  return null;
}

const removalRefusal = (p, e) => `leftover ${p} could not be removed (${codeOf(e)}); remove it by hand`;

/** Sorts the tagged names in `mods` into what is removed now (links, files) and the directories still to judge. */
function classifyLeftovers(t, names, { uid, now, remove }) {
  const out = { directories: [], removed: [], skipped: [], refused: null };
  for (const name of names.filter(n => n.startsWith(STAGING_TAG) || n.startsWith(ASIDE_TAG))) {
    const p = path.join(t.mods, name);
    const stat = lstatOrNull(p);
    if (stat === null) continue;
    if (isOtherUsers(stat, uid)) out.skipped.push(p);
    else if (stat.isDirectory()) {
      // The name carries the swap's own clock; only a name that carries none (an older release's) falls back to the mtime,
      // which a rename keeps from the ORIGINAL folder and so says nothing about when the swap began.
      const at = leftoverStamp(name) ?? stat.mtimeMs;
      out.directories.push({ p, name, at, young: at >= now - LEFTOVER_MIN_AGE_MS });
    } else {
      const failed = removeLeftover(p, stat, remove);
      if (failed) return { ...out, refused: removalRefusal(p, failed) };
      out.removed.push(p);
    }
  }
  return out;
}

/** The newest OLD aside that still holds a mod (by its clock, then by name): a dead run's swap, to be put back. */
const newestRestorable = directories => directories
  .filter(d => d.name.startsWith(ASIDE_TAG) && !d.young && hasModVersion(d.p))
  .sort((a, b) => a.at - b.at || a.name.localeCompare(b.name))
  .at(-1);

/** Puts `aside` at the target. ENOENT: gone, nothing to do. ENOTEMPTY/EEXIST: a target appeared, the aside is left. */
function restoreAside(aside, t, rename) {
  try {
    rename(aside.p, t.target);
    return { restored: aside.p };
  } catch (e) {
    if (e.code === 'ENOENT') return {};
    if (e.code === 'ENOTEMPTY' || e.code === 'EEXIST') return { skipped: aside.p };
    return { refused: `leftover ${aside.p} could not be renamed back (${codeOf(e)}); remove it by hand` };
  }
}

/**
 * The leftovers step: restore a dead swap's aside, remove old leftovers, keep young ones (another session's swap in
 * flight). A young aside or staging is never deleted and never restored, whether or not a target exists. A crashed swap
 * leaves the mod missing for at most `LEFTOVER_MIN_AGE_MS` (10 min); the start after that restores it. Accepted: the
 * alternative rolls back a live session's upgrade. `replaced-` folders and the reported file are not tagged leftovers and
 * are never named here. `rename` and `remove` are test seams. Never throws.
 */
export function reconcile(t, { now = Date.now(), uid = currentUid, rename = fs.renameSync, remove = defaultRemove } = {}) {
  const result = { restored: null, removed: [], skipped: [], refused: null };
  try {
    const found = classifyLeftovers(t, fs.readdirSync(t.mods), { uid, now, remove });
    result.removed.push(...found.removed);
    result.skipped.push(...found.skipped);
    if (found.refused) return { ...result, refused: found.refused };
    let rest = found.directories;
    const aside = lstatOrNull(t.target) === null ? newestRestorable(rest) : undefined;
    if (aside) {
      const outcome = restoreAside(aside, t, rename);
      if (outcome.refused) return { ...result, refused: outcome.refused };
      result.restored = outcome.restored ?? null;
      if (outcome.skipped) result.skipped.push(outcome.skipped);
      rest = rest.filter(d => d !== aside);
    }
    for (const d of rest) {
      if (d.young) {
        result.skipped.push(d.p); // age only SELECTS: a young one is another session's swap in flight
        continue;
      }
      const failed = removeLeftover(d.p, { isSymbolicLink: () => false }, remove);
      if (failed) return { ...result, refused: removalRefusal(d.p, failed) };
      result.removed.push(d.p);
    }
    return result;
  } catch (e) {
    return e.code === 'ENOENT' ? result : { ...result, refused: `leftovers in ${t.mods} could not be listed (${codeOf(e)})` };
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// the swap
// ---------------------------------------------------------------------------------------------------------------------

function stage(staging, files) {
  fs.mkdirSync(staging);
  for (const rel of MOD_FILES) {
    const file = path.join(staging, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, files.get(rel));
  }
}

export function manifestBytes(src, source, now, by) {
  return serialise({
    version: versionText(src.version),
    source: path.resolve(source),
    sha256: Object.fromEntries(MOD_FILES.map(rel => [rel, sha256(src.files.get(rel))])),
    installedAt: now().toISOString(),
    by,
  });
}

/** Written LAST. A failure is tolerated: the next start finds an equal copy with a missing or stale manifest and repairs it. */
function writeManifestQuietly(t, bytes) {
  try {
    writeAtomic(t.manifest, bytes);
  } catch {
    // see above
  }
}

/** After a successful swap that kept the user's copy: at most one `replaced-` folder stays at rest. Own uid only; failures ignored (the extra stays, no line). */
function pruneReplaced(t, keepName, { uid, remove }) {
  let names;
  try {
    names = fs.readdirSync(t.mods);
  } catch {
    return;
  }
  for (const name of names.filter(n => n.startsWith(REPLACED_TAG) && n !== keepName)) {
    const p = path.join(t.mods, name);
    try {
      const stat = lstatOrNull(p);
      if (stat !== null && !isOtherUsers(stat, uid)) removeLeftover(p, stat, remove); // ENOENT is success; any other failure leaves the extra
    } catch {
      // the extra stays until the next upgrade that keeps a copy; growth is bounded to one at rest (two during a swap)
    }
  }
}

/** What `versionOf` answers for a plugin.json that cannot be read. */
const UNREADABLE = [0, 0, 0];

const freshAside = (t, now) => path.join(t.mods, `${ASIDE_TAG}${now().getTime()}-${process.pid}-${randomBytes(4).toString('hex')}`);

/** The rename into place cannot go on: put the old folder back (F3b), or just drop our staging when there was none. */
function rollBack({ t, staging, aside, upgrade, rename }, error) {
  const into = `could not rename ${staging} into place (${codeOf(error)})`;
  if (!upgrade) {
    rmQuiet(staging);
    return { refusal: into };
  }
  try {
    rename(aside, t.target);
  } catch (back) {
    return { refusal: `${into} AND could not rename ${aside} back to ${t.target} (${codeOf(back)}); nothing else was touched — rename it back by hand` };
  }
  rmQuiet(staging);
  return { refusal: `${into}; ${aside} was renamed back` };
}

/**
 * The old folder went aside and holds a NEWER mod than ours (another session installed it a moment ago, the cadence
 * consultation), or one whose version cannot be read (`held` is null; it may be that newer copy). It goes back to the target
 * and our staging is dropped, the same outcome as a lost race (F3a); a start never replaces a newer copy. When it cannot go
 * back, the refusal names where it is and tells the person to rename it back by hand. That is the limit: until they do, a
 * later start finds no target and installs this repository's older copy, and may then delete the newer aside as a leftover;
 * no marker guards against that (the line is the whole warning).
 */
function putBack({ t, staging, aside, held, src, rename }) {
  try {
    rename(aside, t.target);
  } catch (e) {
    rmQuiet(staging);
    const what = held === null ? 'holds a version that could not be read' : `holds version ${versionText(held)}, newer than this repository's ${versionText(src.version)}`;
    return { refusal: `${aside} ${what}, and could not be renamed back to ${t.target} (${codeOf(e)}); rename it back by hand` };
  }
  rmQuiet(staging);
  return { copy: 'lost' };
}

/**
 * The rename into place failed. A complete mod is there (somebody else won, F3a), or something that is not a mod is (the
 * engine writes `.claude-plugin/types/` into a plugin path it has loaded: no plugin.json at all): that goes to a fresh aside
 * and the rename is retried ONCE. A plugin.json that cannot be read at that moment counts as a complete mod that won. Or
 * nothing is, and the old one must go back (F3b). The old aside or replaced folder is never deleted while the target is not
 * a complete mod. Returns `{ retried: true }` when the retry put our copy in place.
 */
function renameInFailed(ctx) {
  const { t, staging, aside, keep, rename, now, error } = ctx;
  if (lstatOrNull(t.target) === null) return rollBack(ctx, error);
  // Only a target with NO plugin.json is engine junk. A plugin.json that is there and cannot be read now may be the whole copy
  // that won: it is judged like one, and the folder is never moved.
  const held = readModPresence(t.target);
  if (held.unreadable || (held.version ?? null) !== null) {
    rmQuiet(staging);
    if (!keep) rmQuiet(aside); // the user's kept copy is not ours to delete
    return { copy: 'lost' };
  }
  try {
    rename(t.target, freshAside(t, now));
    rename(staging, t.target);
    return { retried: true };
  } catch (retry) {
    return rollBack(ctx, retry);
  }
}

/**
 * `seen` is the target's version as the decision read it. S1 stage, S2 aside (a newer copy found there, or one whose version cannot be read, is put back, W3), S3 in, S4 drop the aside, S5 manifest. At no instant does the target hold a half-copied mod. The names
 * carry the clock of the swap's start (`now()`), which is what reconcile judges their age by. With `keep` the old folder goes
 * to `replaced-<stamp>` instead of an aside and S4 does not delete it.
 */
function swap({ t, src, seen, upgrade, keep, rename, remove, now, uid, manifest }) {
  const started = now();
  const suffix = `${started.getTime()}-${process.pid}-${randomBytes(4).toString('hex')}`;
  const staging = path.join(t.mods, STAGING_TAG + suffix);
  const replaced = keep ? REPLACED_TAG + replacedStamp(started) : null;
  const aside = path.join(t.mods, replaced ?? ASIDE_TAG + suffix);
  try {
    stage(staging, src.files);
  } catch (e) {
    rmQuiet(staging);
    return { refusal: `could not stage the copy in ${staging} (${codeOf(e)})` };
  }
  if (upgrade) {
    try {
      rename(t.target, aside);
    } catch (e) {
      rmQuiet(staging);
      return { refusal: `could not rename ${t.target} aside to ${aside} (${codeOf(e)})` };
    }
    const held = modVersionIn(aside);
    // Go on only when the aside's version is known and not newer, or was already unreadable when the decision was made (`seen`
    // is 0.0.0: a broken copy is what an upgrade is for). A version that WAS readable and cannot be read now (EMFILE, EIO, a file
    // another start is still writing) may be a newer copy: it goes back, never gets deleted on a guess.
    const changedToUnreadable = held === null && compareVersions(seen, UNREADABLE) > 0;
    if (changedToUnreadable || (held !== null && compareVersions(held, src.version) > 0)) return putBack({ t, staging, aside, held, src, rename });
  }
  try {
    rename(staging, t.target);
  } catch (error) {
    const failed = renameInFailed({ t, staging, aside, upgrade, keep, rename, now, error });
    if (!failed.retried) return failed;
  }
  if (upgrade && !keep) rmQuiet(aside);
  if (keep) pruneReplaced(t, replaced, { uid, remove });
  writeManifestQuietly(t, manifest);
  return { copy: upgrade ? 'upgrade' : 'install', ...(keep ? { replaced } : {}) };
}

export function carryOutCopy({ t, src, seen, decision, rename, remove, now, uid, manifest }) {
  const args = { t, src, seen, rename, remove, now, uid, manifest };
  switch (decision.action) {
    case 'install': return swap({ ...args, upgrade: false, keep: false });
    case 'upgrade': return swap({ ...args, upgrade: true, keep: decision.keep === true });
    case 'manifest':
      writeManifestQuietly(t, manifest);
      return { copy: 'manifest' };
    default: return { copy: decision.action };
  }
}

/** The mods folder: made when absent (never through a symlink); a symlink or a non-directory is a reason to refuse. */
export function modsProblem(t) {
  let stat;
  try {
    stat = lstatOrNull(t.mods);
  } catch (e) {
    return `${t.mods} could not be read (${e.code})`;
  }
  if (stat === null) {
    try {
      fs.mkdirSync(t.mods, { recursive: true });
      return '';
    } catch (e) {
      return `${t.mods} could not be created (${e.code})`;
    }
  }
  if (stat.isSymbolicLink()) return `${t.mods} is a symlink`;
  return stat.isDirectory() ? '' : `${t.mods} is not a directory`;
}

// ---------------------------------------------------------------------------------------------------------------------
// the said-once record
// ---------------------------------------------------------------------------------------------------------------------

/** The key stored in the reported file, or null (no file, unreadable, not ours). */
export function readReportedKey(file) {
  try {
    const value = parseJsonObject(fs.readFileSync(file));
    return typeof value?.key === 'string' ? value.key : null;
  } catch {
    return null;
  }
}

/** Writes `{ key, at }` atomically. A failure is tolerated: the line then repeats at the next start (never a throw, never a leftover). */
export function writeReported(file, key, now) {
  try {
    writeAtomic(file, serialise({ key, at: now().toISOString() }));
  } catch {
    // said again next start: a line that repeats is better than a session that does not start
  }
}
