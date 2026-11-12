/**
 * The core of the user-level subagent-model guard installer: merge, remove, drift, atomic write,
 * backup, and the re-read-before-write refusal. Shared by `tools/install-user-hook.mjs` (the CLI) and
 * `settings/hooks/ensure-user-guard.mjs` (the SessionStart self-install), so there is ONE
 * implementation of the safety rules. Imports only `node:` builtins because it is copied verbatim into
 * consumers as `.claude/hooks/lib/user-guard-install.mjs`.
 *
 * See `tools/install-user-hook.mjs` for why the merge is a pure function and why it refuses first.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

export const MATCHER = 'Agent|Task';
export const OPTOUT_FILE = 'subagent-model.optout';
export const MANIFEST_FILE = 'subagent-model.installed.json';
const VERSION_PATTERN = /^export const GUARD_VERSION = (\d+);/m;

/** The `GUARD_VERSION` written in a hook's TEXT (never imported or run); 0 when unversioned. */
export function guardVersion(text) {
  const match = VERSION_PATTERN.exec(text);
  return match ? Number.parseInt(match[1], 10) : 0;
}

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const BACKUP_TAG = 'settings.json.bak-subagent-model-';

/**
 * The released guard: the `GUARD_VERSION` and the digest (`guardDigest`) of `settings/hooks/subagent-model.mjs` of
 * the SAME commit. Both files are vendored byte-identically from one release, so a consumer's pair always matches;
 * a guard edited and committed in some repository does not, and is not copied into ~/.claude, where it would run for
 * every repository on the machine (the owner's go, 2026-11-11). A conventions test fails when this pair does not
 * match the file, so no release can ship a stale one. This stops an unreviewed guard from leaving its repository; it
 * is no sandbox: a repository with hostile hooks already runs code in its own sessions.
 */
export const RELEASED_GUARD = Object.freeze({
  version: 3,
  sha256: '13e13d5f6df35f4a18e8b3098afd4a80dc9308f82f8d734f23ccb943538aef12',
});

/** The digest of a guard's text with CRLF folded to LF, so a checkout that converts line endings still matches. */
export const guardDigest = text => sha256(String(text).replaceAll('\r\n', '\n'));

/**
 * Why a guard's TEXT must not be copied into ~/.claude as the released guard; '' when it may be. A digest difference
 * names both digests; a version-only difference names both versions (the code round, 2026-11-11).
 */
export function releasedTextRefusal(text, released = RELEASED_GUARD) {
  const digest = guardDigest(text);
  const version = guardVersion(text);
  if (digest !== released.sha256) {
    return `the project copy is not the released guard (sha256 ${digest.slice(0, 12)}, released ${released.sha256.slice(0, 12)})`;
  }
  if (version !== released.version) {
    return `the project copy is not the released guard (version ${version}, released version ${released.version})`;
  }
  return '';
}

/** Where the hook and the settings live for a home. */
export function targets(home) {
  const dir = path.resolve(home, '.claude');
  return {
    dir,
    hook: path.join(dir, 'hooks', 'subagent-model.mjs'),
    optout: path.join(dir, 'hooks', OPTOUT_FILE),
    manifest: path.join(dir, 'hooks', MANIFEST_FILE),
    settings: path.join(dir, 'settings.json'),
  };
}

export const normalise = p => (process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p));

/** The entry this tool owns. */
export function entryFor(hookPath) {
  return { matcher: MATCHER, hooks: [{ type: 'command', command: 'node', args: [hookPath] }] };
}

export const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

const itemIsOurs = (item, hookPath) =>
  isObject(item) && Array.isArray(item.args) && typeof item.args[0] === 'string' &&
  normalise(item.args[0]) === normalise(hookPath);

const entryIsOurs = (entry, hookPath) =>
  isObject(entry) && Array.isArray(entry.hooks) && entry.hooks.some(item => itemIsOurs(item, hookPath));

const preToolUse = settings => (isObject(settings.hooks) && Array.isArray(settings.hooks.PreToolUse) ? settings.hooks.PreToolUse : []);

/** The PreToolUse entries that are ours, in order. */
export function findEntries(settings, hookPath) {
  return preToolUse(settings).filter(entry => entryIsOurs(entry, hookPath));
}

const allOurs = (entry, hookPath) => entryIsOurs(entry, hookPath) && entry.hooks.every(item => itemIsOurs(item, hookPath));

/** The entry without our handlers; null when nothing of it is left. Foreign handlers keep their group and matcher. */
function withoutOurs(entry, hookPath) {
  if (!entryIsOurs(entry, hookPath)) return entry;
  const hooks = entry.hooks.filter(item => !itemIsOurs(item, hookPath));
  return hooks.length ? { ...entry, hooks } : null;
}

/**
 * A copy of `settings` with exactly one handler of ours. Works on handlers, not groups: ours are removed
 * from every group (a group is dropped only when that empties it), and our entry goes back where the first
 * group holding ONLY our handler stood, or is appended when ours shared a group with someone else's.
 */
export function mergeEntry(settings, hookPath) {
  const next = structuredClone(settings);
  if (!isObject(next.hooks)) next.hooks = {};
  if (!Array.isArray(next.hooks.PreToolUse)) next.hooks.PreToolUse = [];
  const list = next.hooks.PreToolUse;
  const home = list.findIndex(e => allOurs(e, hookPath));
  const out = [];
  list.forEach((entry, i) => {
    if (i === home) out.push(entryFor(hookPath));
    else if (withoutOurs(entry, hookPath) !== null) out.push(withoutOurs(entry, hookPath));
  });
  if (home < 0) out.push(entryFor(hookPath));
  next.hooks.PreToolUse = out;
  return next;
}

/** A copy of `settings` without our hook items; emptied entries, `PreToolUse` and `hooks` are dropped. */
export function removeEntry(settings, hookPath) {
  const next = structuredClone(settings);
  if (!isObject(next.hooks) || !Array.isArray(next.hooks.PreToolUse)) return next;
  next.hooks.PreToolUse = next.hooks.PreToolUse.flatMap(entry => {
    if (!entryIsOurs(entry, hookPath)) return [entry];
    const hooks = entry.hooks.filter(item => !itemIsOurs(item, hookPath));
    return hooks.length ? [{ ...entry, hooks }] : [];
  });
  if (next.hooks.PreToolUse.length === 0) delete next.hooks.PreToolUse;
  if (Object.keys(next.hooks).length === 0) delete next.hooks;
  return next;
}

/**
 * Ownership is "a handler whose args[0] is our path" (used to find and remove what we added); a VALID
 * registration is stricter: exactly one such handler, in a PreToolUse group whose matcher is exactly
 * `MATCHER`, shaped exactly like `entryFor`. This returns one line per way the registration falls short;
 * empty means valid. `drift` and `registrationValid` both read it, so --check and the self-install can
 * never disagree about what a good registration is.
 */
export function registrationProblems(settings, hookPath) {
  const handlers = preToolUse(settings).filter(e => isObject(e) && Array.isArray(e.hooks))
    .flatMap(entry => entry.hooks.filter(item => itemIsOurs(item, hookPath)).map(item => ({ entry, item })));
  if (handlers.length === 0) return ['no PreToolUse entry for the hook in settings.json'];
  if (handlers.length > 1) return [`${handlers.length} PreToolUse entries for the hook (expected exactly one)`];
  const [{ entry, item }] = handlers;
  const out = [];
  if (entry.matcher !== MATCHER) out.push(`matcher is ${JSON.stringify(entry.matcher)}, expected "${MATCHER}"`);
  if (item.type !== 'command') out.push(`type is ${JSON.stringify(item.type)}, expected "command"`);
  if (item.command !== 'node') out.push(`command is ${JSON.stringify(item.command)}, expected "node"`);
  if (item.args.length !== 1) out.push(`args has ${item.args.length} items, expected only the hook path`);
  return out;
}

/** One line per way the installation differs from what `--install` writes; empty when clean. */
export function drift(settings, hookPath, installedBytes, sourceBytes) {
  const out = [];
  if (installedBytes === null) out.push(`hook file missing: ${hookPath}`);
  else if (!installedBytes.equals(sourceBytes)) out.push(`hook file differs from the source: ${hookPath}`);
  return [...out, ...registrationProblems(settings, hookPath)];
}

/**
 * Temp file + rename; the temp file never outlives a failed write, and `mode` (when given) is kept. The mode is SET
 * with chmod before the rename: a create mode is cut by the umask, so 0644 under umask 0077 became 0600 and other
 * users lost their read of settings.json (CodeRabbit on #148, 2026-11-10). With `replace: false` the name must be free:
 * the answer is `false`, and nothing is written, when it is taken (see `placeNew`); the default replaces it.
 */
export function writeAtomic(dest, data, mode, { replace = true } = {}) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(tmp, data, mode === undefined ? undefined : { mode });
    if (mode !== undefined) fs.chmodSync(tmp, mode);
    if (!replace) return placeNew(tmp, dest);
    fs.renameSync(tmp, dest);
    return true;
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

/**
 * A complete temp file gets a NEW name. A hard link fails with EEXIST when the name is taken (by a file, or by a link,
 * dangling or not), where a rename would replace it. Where the filesystem cannot make a hard link, nothing is
 * created: the error is thrown (marked, see `isHardLinkFailure`; its code is kept), and the caller makes it a refusal to fix by
 * hand, because no later start can make the link either (no look-then-rename: its gap could replace a file another writer just
 * created). Only the agent-models registration passes `replace: false`; the guard never does. False when the name is taken.
 */
function placeNew(tmp, dest) {
  try {
    fs.linkSync(tmp, dest);
    return true;
  } catch (e) {
    if (e.code === 'EEXIST') return false;
    throw Object.assign(new Error(e.message, { cause: e }), { code: e.code, hardLinkFailed: true });
  }
}

/** True for the error `placeNew` throws when the link cannot be made: a filesystem without hard links, which no later start changes. */
export const isHardLinkFailure = e => e?.hardLinkFailed === true;

export const readOrNull = file => (fs.existsSync(file) ? fs.readFileSync(file) : null);

export const sameBytes = (a, b) => (a === null || b === null ? a === b : a.equals(b));

/** Parsed settings from bytes, or an `error` phrase when they are not a JSON object. */
export function parseSettings(bytes) {
  if (bytes === null) return { settings: {} };
  try {
    const value = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
    return isObject(value) ? { settings: value } : { error: 'is not a JSON object' };
  } catch (e) {
    return { error: `does not parse (${e.message})` };
  }
}

const stamp = (now = new Date()) => now.toISOString().replace(/\.\d+Z$/, 'Z').replace(/[-:]/g, '');

function writeBackup(settingsPath, bytes, mode) {
  for (let n = 0; ; n += 1) {
    const file = path.join(path.dirname(settingsPath), `${BACKUP_TAG}${stamp()}${n ? `-${n}` : ''}`);
    try {
      fs.writeFileSync(file, bytes, { flag: 'wx', mode });
      return file;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
  }
}

const result = (code, lines) => ({ code, lines });
export const serialise = settings => `${JSON.stringify(settings, null, 2)}\n`;
const unparsable = (file, error) => result(1, [`${file} ${error}; nothing changed — fix or move the file and run again`]);

/** The refusal shared by install and uninstall when settings.json moved under us. */
const CHANGED = 'settings.json changed while installing; nothing written to it — run again';

/** An explicit `--install` withdraws the opt-out; the self-install never does. */
function dropOptout(t, clear) {
  if (!clear || !fs.existsSync(t.optout)) return [];
  fs.rmSync(t.optout);
  return [`removed the opt-out marker ${t.optout}`];
}

const OPTOUT_TEXT = 'subagent-model guard was removed on purpose (install-user-hook --uninstall); the session self-install stays off while this file exists. To undo: node <conventions>/tools/install-user-hook.mjs --install\n';

/**
 * Install the hook. `beforeWrite` is a test seam (runs after the merge is computed and the backup is
 * taken, before the final re-read) and is deliberately not reachable from the CLI.
 */
/**
 * Provenance of the installed copy: where it came from, which bytes, which version, who put it there — and `previous`,
 * the hash of the bytes it replaces (null on a first install), so an install cut short after this write and before the
 * hook copy is not taken for a local edit.
 */
function writeManifest(t, source, sourceBytes, by, replaced) {
  const manifest = { source: path.resolve(source), sha256: sha256(sourceBytes), previous: replaced === null ? null : sha256(replaced),
    version: guardVersion(sourceBytes.toString('utf8')), installedAt: new Date().toISOString(), by };
  writeAtomic(t.manifest, serialise(manifest));
}

/** True when settings.json holds a VALID registration of the hook (see `registrationProblems`). */
export function registrationValid(t) {
  const parsed = parseSettings(readOrNull(t.settings));
  return !parsed.error && registrationProblems(parsed.settings, t.hook).length === 0;
}

/** True when the registration is valid and the manifest vouches for the installed bytes. */
export function isRegistered(t) {
  const installed = readOrNull(t.hook);
  const manifest = readManifest(t);
  return registrationValid(t) && installed !== null && manifest !== null && manifest.sha256 === sha256(installed);
}

/**
 * Repair ONLY the registration in settings.json (backup, merge, re-read refusal, atomic write: the
 * installer's own safety); the installed hook bytes and their manifest are not touched. Used when the
 * installed copy is newer than the source and so must not be replaced.
 */
export function repairRegistration({ home, beforeWrite = () => {} }) {
  const t = targets(home);
  const original = readOrNull(t.settings);
  const parsed = parseSettings(original);
  if (parsed.error) return unparsable(t.settings, parsed.error);
  const target = settingsFileOf(t.settings);
  if (target.refusal) return result(1, [target.refusal]);
  const merged = serialise(mergeEntry(parsed.settings, t.hook));
  if (original !== null && original.equals(Buffer.from(merged))) return result(0, ['already registered']);
  const lines = original === null ? [] : [`backup ${writeBackup(t.settings, original, modeOf(t.settings))}`];
  const done = commitSettings({ settingsPath: t.settings, original, target, data: merged, beforeWrite });
  if (!done.written) return result(1, [...lines, CHANGED]);
  return result(0, [...lines, `wrote ${t.settings} (hooks.PreToolUse: ${MATCHER})`]);
}

function readManifest(t) {
  try {
    const value = JSON.parse(fs.readFileSync(t.manifest, 'utf8'));
    return isObject(value) ? value : null;
  } catch {
    return null;
  }
}

/** Refuses a downgrade unless forced; '' when the install may go ahead. */
function downgradeRefusal(t, sourceBytes, force) {
  const installed = readOrNull(t.hook);
  if (force || installed === null) return '';
  const from = guardVersion(installed.toString('utf8'));
  const to = guardVersion(sourceBytes.toString('utf8'));
  return from > to ? `installed guard is version ${from}, newer than the source's ${to}; nothing changed — pass --force to replace it` : '';
}

/**
 * Refuses to replace an installed copy changed since its install, unless forced; '' when the install may go ahead.
 * Changed means: a manifest exists, and the installed bytes match neither its hash nor the source. The second half
 * keeps an install cut short after the new hook (before its manifest) from reading as a local edit. Reading only the
 * version replaced a user's edited guard without a word (coai code gate, 2026-11-10). No manifest (an install from
 * before manifests existed) cannot be judged and goes ahead as before.
 */
function changedRefusal(t, sourceBytes, force) {
  const installed = readOrNull(t.hook);
  const manifest = readManifest(t);
  if (force || installed === null || manifest === null || installed.equals(sourceBytes)) return '';
  return [manifest.sha256, manifest.previous].includes(sha256(installed)) ? ''
    : `installed guard ${t.hook} was changed since it was installed (its sha256 differs from ${t.manifest}); nothing changed — pass --force to replace it`;
}

export function install({ home, source, beforeWrite = () => {}, clearOptout = false, force = false, by = 'cli', released = null }) {
  const t = targets(home);
  if (!fs.existsSync(source)) return result(1, [`source hook not found: ${source} — pass --source <file>`]);
  const original = readOrNull(t.settings);
  const parsed = parseSettings(original);
  if (parsed.error) return unparsable(t.settings, parsed.error);
  const target = settingsFileOf(t.settings);
  if (target.refusal) return result(1, [target.refusal]);
  const merged = mergeEntry(parsed.settings, t.hook);
  const sourceBytes = fs.readFileSync(source);
  // The release check runs on THESE bytes, the ones written below: one read, so nothing can swap the file between a
  // check and the copy (the code round, 2026-11-11). `released` is null only for an explicit --unreleased.
  const unreleased = released ? releasedTextRefusal(sourceBytes.toString('utf8'), released) : '';
  if (unreleased) return result(1, [unreleased]);
  const refusal = downgradeRefusal(t, sourceBytes, force) || changedRefusal(t, sourceBytes, force);
  if (refusal) return result(1, [refusal]);
  const upToDate = original !== null && original.equals(Buffer.from(serialise(merged))) && sameBytes(readOrNull(t.hook), sourceBytes) && isRegistered(t);
  if (upToDate) return result(0, [...dropOptout(t, clearOptout), 'already installed']);
  const lines = [...dropOptout(t, clearOptout)];
  if (original !== null) lines.push(`backup ${writeBackup(t.settings, original, modeOf(t.settings))}`);
  // Every refusal is above, so a refused install never writes the hook, the manifest or settings.json (the backup and
  // the opt-out removal above are older behaviour). Order: the manifest (naming the bytes it replaces), the hook, then
  // the registration. A stop after the manifest leaves the old bytes, which its `previous` vouches for; a stop after the
  // hook leaves an unregistered file the host never runs, which the next session start registers. The old order could
  // leave a registration of a missing script, run on every Agent call (2026-11-10).
  const prepare = () => { writeManifest(t, source, sourceBytes, by, readOrNull(t.hook)); writeAtomic(t.hook, sourceBytes); };
  const done = commitSettings({ settingsPath: t.settings, original, target, data: serialise(merged), beforeWrite, prepare });
  if (!done.written) return result(1, [...lines, CHANGED]);
  return result(0, [`wrote ${t.hook}`, ...lines, `wrote ${t.settings} (hooks.PreToolUse: ${MATCHER})`]);
}

/** Remove only what `install` added, and leave the opt-out marker so a session does not reinstall it. */
export function uninstall({ home, beforeWrite = () => {} }) {
  const t = targets(home);
  const original = readOrNull(t.settings);
  const parsed = parseSettings(original);
  if (parsed.error) return unparsable(t.settings, parsed.error);
  const present = findEntries(parsed.settings, t.hook).length > 0;
  const hookThere = fs.existsSync(t.hook);
  const markOptout = () => { writeAtomic(t.optout, OPTOUT_TEXT); return `wrote the opt-out marker ${t.optout}`; };
  if (!present && !hookThere && !fs.existsSync(t.manifest)) return result(0, ['not installed', markOptout()]);
  const lines = [];
  if (present) {
    // The target only matters when settings.json is written, which needs our entry in it. A loop reads as no file,
    // so it never gets here, and it does not stop the hook, manifest and marker steps below (CodeRabbit on #149).
    const target = settingsFileOf(t.settings);
    if (target.refusal) return result(1, [target.refusal]);
    lines.push(`backup ${writeBackup(t.settings, original, modeOf(t.settings))}`);
    const done = commitSettings({ settingsPath: t.settings, original, target, data: serialise(removeEntry(parsed.settings, t.hook)), beforeWrite });
    if (!done.written) return result(1, [CHANGED]);
    lines.push(`removed the hook entry from ${t.settings}`);
  }
  if (hookThere) {
    fs.rmSync(t.hook);
    lines.push(`deleted ${t.hook}`);
  }
  if (fs.existsSync(t.manifest)) {
    fs.rmSync(t.manifest);
    lines.push(`deleted ${t.manifest}`);
  }
  return result(0, [...lines, markOptout()]);
}

/** The one effort level every model runs at (the rule: common/subagent-models.md § Effort). */
export const EFFORT = 'high';
/** Models whose effort is always pinned, present in settings.json or not. */
export const EFFORT_MODELS = ['sonnet', 'opus', 'fable'];

const effortOf = value => (isObject(value) && typeof value.effortLevel === 'string' ? value.effortLevel : 'unset');

/** Model keys to pin: the three aliases, then any other `modelSettings` key already present. */
function effortKeys(settings) {
  const present = isObject(settings.modelSettings) ? Object.keys(settings.modelSettings) : [];
  return [...new Set([...EFFORT_MODELS, ...present])];
}

/** One phrase per setting that is not `EFFORT` (`effortLevel xhigh`, `sonnet unset`); empty when converged. */
export function effortProblems(settings) {
  const models = isObject(settings.modelSettings) ? settings.modelSettings : {};
  const top = effortOf(settings) === EFFORT ? [] : [`effortLevel ${effortOf(settings)}`];
  const each = effortKeys(settings).filter(key => effortOf(models[key]) !== EFFORT).map(key => `${key} ${effortOf(models[key])}`);
  return [...top, ...each];
}

const withEffort = value => (isObject(value) ? { ...value, effortLevel: EFFORT } : { effortLevel: EFFORT });

/** A copy of `settings` with every effort at `EFFORT`; every other key keeps its value and its place. */
export function convergeEffort(settings) {
  const next = structuredClone(settings);
  next.effortLevel = EFFORT;
  const models = isObject(next.modelSettings) ? next.modelSettings : {};
  for (const key of effortKeys(next)) models[key] = withEffort(models[key]);
  next.modelSettings = models;
  return next;
}

const noEffort = (res, problems = []) => ({ ...res, changed: false, problems });
const refuseEffort = message => noEffort(result(1, [message]));
const EFFORT_CHANGED = 'settings.json changed while converging effort; nothing written to it — it converges at the next session start';

/** The first reason `modelSettings` cannot be converged without replacing the user's data; '' when it can. */
function effortShapeProblem(settings) {
  const models = settings.modelSettings;
  if (models === undefined) return '';
  if (!isObject(models)) return 'modelSettings is not an object';
  const bad = Object.keys(models).find(key => !isObject(models[key]));
  return bad === undefined ? '' : `modelSettings.${bad} is not an object`;
}

/** Why settings.json cannot be converged (unparsable or an unexpected shape); '' when it can. */
function effortRefusal(file, parsed) {
  if (parsed.error) return `${file} ${parsed.error}; nothing changed — fix or move the file and run again`;
  const shape = effortShapeProblem(parsed.settings);
  return shape ? `${file}: ${shape}; nothing changed — fix it by hand` : '';
}

export function writableReason(file) {
  try {
    fs.accessSync(file, fs.constants.W_OK);
    return '';
  } catch (e) {
    return `is not writable (${e.code})`;
  }
}

/** The permission bits of an existing file (a symlink is followed); undefined when there is none. */
const modeOf = file => (fs.existsSync(file) ? fs.statSync(file).mode & 0o777 : undefined);

/**
 * settings.json written where it really lives — a symlink (stow, chezmoi) is followed, never replaced by a plain
 * file — and with its own mode (a 0600 file may hold tokens in `env`). `applyEffort` did both; install,
 * repairRegistration and uninstall did neither until 2026-11-10 (CodeRabbit on creds #328).
 */
function writeSettings(file, data, options) {
  return writeAtomic(file, data, modeOf(file), options);
}

/**
 * True when settings.json changed between the read and the write: its bytes, or WHICH file it is — a link pointed at
 * another file with the same bytes passed the byte check, and the write went to the old file (CodeRabbit on coai
 * #970, 2026-11-10).
 */
function changedUnderUs(settingsPath, original, target, now) {
  return !sameBytes(now, original) || settingsFileOf(settingsPath).file !== target.file;
}

/**
 * The one road a change of settings.json takes for the guard's three operations and the agent-models registration, once its
 * new text is known. install, repairRegistration, uninstall and the registration all end here, so none of them can drop a
 * step. The effort write (`writeConverged`) is NOT on this road: it writes by `writeAtomic` on its own, a recorded
 * follow-up. `original` and `target` are what the
 * caller read and resolved (`settingsFileOf`) BEFORE it computed `data`. In order: `beforeWrite` (a test seam); the
 * bytes are read again through the path and the target is resolved again, and a difference in either answers
 * `{ written: false, now }` with the bytes just read; `prepare` (what a caller does only when the write follows: the
 * guard copies its hook, the mod takes its backup); then the write at `target.file`, with the file's own mode when
 * there is one. `replace: false` is for a file that did not exist at the read: it is then created only while its
 * name is still free, and a name taken meanwhile is `{ written: false, now }` too. An existing file is always
 * replaced. The default, `true`, renames over the name in both cases.
 */
export function commitSettings({ settingsPath, original, target, data, beforeWrite = () => {}, prepare = () => {}, replace = true }) {
  beforeWrite();
  const now = readOrNull(settingsPath);
  if (changedUnderUs(settingsPath, original, target, now)) return { written: false, now };
  prepare();
  if (writeSettings(target.file, data, { replace: replace || original !== null })) return { written: true };
  return { written: false, now: readOrNull(settingsPath) };
}

/** How many links a settings path may pass through before it is called a loop (the kernel's own ELOOP limit). */
const MAX_LINKS = 40;

/**
 * The file a settings write goes to, found BEFORE anything is written: the real file when one exists; otherwise the
 * last target of a chain of links that ends in a missing file (one link or several — CodeRabbit on #148 and coai
 * #969, 2026-11-10: a single-level read replaced the middle link of a chain with a plain file); otherwise the path
 * itself. More than 40 links is a `refusal` (a result, like the installer's other refusals — the code round), so
 * the operation stops before its backup, manifest, hook or settings are touched; its `reason` is the refusal without its
 * advice. `dangling` marks a chain that ends in a missing file.
 */
export function settingsFileOf(settingsPath) {
  const existing = effortTarget(settingsPath);
  if (existing !== null) return { file: existing };
  const last = lastLinkTarget(settingsPath);
  if (last === TOO_MANY_LINKS) return linkRefusal(`${settingsPath} has more than ${MAX_LINKS} links (a loop, or a chain too long to open)`);
  if (last === MISSING_FOLDER) return linkRefusal(`${settingsPath} is a link whose target goes through a folder that does not exist and then ".."`);
  return last === null ? { file: settingsPath } : { file: last, dangling: true };
}

const linkRefusal = reason => ({ reason, refusal: `${reason}; nothing changed — point it at one file` });

/** What `lastLinkTarget` answers when the chain does not end within `MAX_LINKS`. */
const TOO_MANY_LINKS = Symbol('too many links');

/** What `physicalTarget` answers for a `..` after a missing folder: the kernel fails there, so nothing is written. */
const MISSING_FOLDER = Symbol('missing folder');

/**
 * The missing file a chain of links ends in, each hop read from its own folder; null when the path is no link;
 * `TOO_MANY_LINKS` past the limit; `MISSING_FOLDER` when a hop's target takes `..` after a folder that does not exist.
 * At most `MAX_LINKS` links are followed, as the kernel follows them.
 */
function lastLinkTarget(settingsPath) {
  let current = settingsPath;
  for (let hop = 0; hop <= MAX_LINKS; hop += 1) {
    const stat = lstatOrNull(current);
    if (stat === null || !stat.isSymbolicLink()) return hop === 0 ? null : current;
    // From the link's REAL folder: a textual `..` after a symlinked parent names the wrong folder (CodeRabbit on creds
    // #340, 2026-11-10). The link exists, so its folder does too.
    current = physicalTarget(fs.realpathSync(path.dirname(current)), fs.readlinkSync(current));
    if (current === MISSING_FOLDER) return MISSING_FOLDER;
  }
  return TOO_MANY_LINKS;
}

/**
 * Where a link's `target` points, from the link's real folder, the way the kernel walks it: one component at a time,
 * each folder made real before the next `..` is taken. `path.resolve` collapses `jump/..` as text, so with `jump` a
 * link to another folder it named a file beside the link instead of beside jump's real place (CodeRabbit on creds
 * #343, 2026-11-10). The root of an absolute target comes from `path.parse`, and `..` never goes above it. The last
 * component is joined and not made real: a link there is the next hop of `lastLinkTarget`. A folder that does not
 * exist is joined as text, since the write creates it; a `..` after one is `MISSING_FOLDER`: the kernel fails there,
 * and a lexical answer past it could name an existing file. Other errors (a loop, no permission) are thrown, as the
 * installer's other file operations throw them.
 */
function physicalTarget(realFolder, target) {
  const root = path.parse(target).root;
  const separators = process.platform === 'win32' ? /[\\/]+/ : /\/+/;
  const parts = target.slice(root.length).split(separators).filter(part => part !== '' && part !== '.');
  const leaf = parts.pop();
  let current = root === '' ? realFolder : fs.realpathSync(root);
  let missing = false;
  for (const part of [...parts, ...(leaf === '..' ? ['..'] : [])]) {
    if (part === '..') {
      if (missing) return MISSING_FOLDER;
      current = path.dirname(current);
      continue;
    }
    const next = path.join(current, part);
    const real = missing ? null : realOrNull(next);
    missing = real === null;
    current = real ?? next;
  }
  return leaf === undefined || leaf === '..' ? current : path.join(current, leaf);
}

/** The real path of `file`, or null when it or a folder above it does not exist. */
const realOrNull = file => {
  try {
    return fs.realpathSync(file);
  } catch (e) {
    if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return null;
    throw e;
  }
};

export const lstatOrNull = file => {
  try {
    return fs.lstatSync(file);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
};

/** Where to read and write: the symlink's target when settings.json is a link; null when there is no file. */
export function effortTarget(settingsPath) {
  return fs.existsSync(settingsPath) ? fs.realpathSync(settingsPath) : null;
}

/** A backup of `bytes`, unless the newest backup already holds exactly these bytes (a retry loop must not pile up files). */
export function backupOnce(file, bytes, mode) {
  const dir = path.dirname(file);
  const newest = fs.readdirSync(dir).filter(name => name.startsWith(BACKUP_TAG)).sort().at(-1);
  const newestPath = newest === undefined ? '' : path.join(dir, newest);
  return newestPath && sameBytes(readOrNull(newestPath), bytes) ? newestPath : writeBackup(file, bytes, mode);
}

function writeConverged(file, original, settings, problems) {
  try {
    const mode = fs.statSync(file).mode & 0o777;
    const backup = backupOnce(file, original, mode);
    writeAtomic(file, serialise(convergeEffort(settings)), mode);
    return { ...result(0, [`backup ${backup}`, `wrote ${file} (effort: ${EFFORT} for every model)`]), changed: true, problems };
  } catch (e) {
    return refuseEffort(`${file} could not be written (${e.code ?? e.message}); nothing changed`);
  }
}

/** The file changed under us: fine when whoever changed it converged effort too, a refusal otherwise. */
function settledOrChanged(now) {
  const again = parseSettings(now);
  return !again.error && effortProblems(again.settings).length === 0 ? noEffort(result(0, [])) : refuseEffort(EFFORT_CHANGED);
}

function commitEffort({ file, original, settings, problems, beforeWrite }) {
  const reason = writableReason(file);
  if (reason) return refuseEffort(`${file} ${reason}; nothing changed`);
  beforeWrite();
  const now = readOrNull(file);
  return sameBytes(now, original) ? writeConverged(file, original, settings, problems) : settledOrChanged(now);
}

/**
 * Converge the effort keys of an EXISTING settings.json (a missing file is not created; a symlink is
 * followed, never replaced). Same safety as the installer, and more: unparsable settings, a non-object
 * `modelSettings` or per-model value, or an unwritable file are refused untouched; the original mode is
 * kept; a failed write throws nothing and leaves no temp file; a concurrent session that converged first
 * is not an error. `changed` is false (nothing written) when everything is already `EFFORT`.
 */
export function applyEffort({ home, beforeWrite = () => {} }) {
  const t = targets(home);
  const file = effortTarget(t.settings);
  if (file === null) return noEffort(result(0, []));
  const original = fs.readFileSync(file);
  const parsed = parseSettings(original);
  const refusal = effortRefusal(t.settings, parsed);
  if (refusal) return refuseEffort(refusal);
  const problems = effortProblems(parsed.settings);
  if (problems.length === 0) return noEffort(result(0, []));
  return commitEffort({ file, original, settings: parsed.settings, problems, beforeWrite });
}

/** The `--check` line about effort; informational (it never changes the exit code). */
const effortLine = settings => {
  const shape = effortShapeProblem(settings);
  if (shape) return `effort: needs a manual repair — ${shape}; set it to {"effortLevel": "${EFFORT}"}`;
  const problems = effortProblems(settings);
  return problems.length ? `effort: ${problems.join(', ')} (the session self-install converges it to ${EFFORT})` : `effort: ${EFFORT} for every model`;
};

/** Exit 0 only when the installation is exactly what `install` would write; effort is reported, never gating. */
export function check({ home, source }) {
  const t = targets(home);
  if (!fs.existsSync(source)) return result(1, [`source hook not found: ${source} — pass --source <file>`]);
  const parsed = parseSettings(readOrNull(t.settings));
  if (parsed.error) return result(1, [`${t.settings} ${parsed.error}`]);
  const installed = readOrNull(t.hook);
  const lines = drift(parsed.settings, t.hook, installed, fs.readFileSync(source));
  const effort = effortLine(parsed.settings);
  const manifest = readManifest(t);
  if (manifest === null) return result(1, [...lines, 'provenance manifest missing or unreadable: ' + t.manifest, effort]);
  const shown = `provenance: ${JSON.stringify(manifest)}`;
  if (installed !== null && manifest.sha256 !== sha256(installed)) {
    // The bytes the manifest says it replaced: an install stopped after its manifest, before the hook — not an edit.
    lines.push(manifest.previous === sha256(installed)
      ? 'the last install was cut short after its manifest (the hook still holds the bytes it replaced) — run --install to finish it'
      : 'installed hook no longer matches the sha256 in its provenance manifest (edited after install)');
  }
  return lines.length ? result(1, [shown, ...lines, effort]) : result(0, ['installed and current', shown, effort]);
}

