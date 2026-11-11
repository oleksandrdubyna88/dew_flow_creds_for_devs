/**
 * The installer core of the agent-models mod: copy the mod's `MOD_FILES` files (seven) from a checkout into
 * `~/.claude/mods/agent-models` by a rename swap, record what was copied, and register that folder in
 * `env.CLAUDE_CODE_PLUGIN_DIRS` of `~/.claude/settings.json`. `ensureAgentModels` is the only sequencing of the parts;
 * the decisions (`decideCopy`, `decideRegistration`) are pure functions over values read first, and live in
 * `agent-models-decide.mjs`; the reads are in `agent-models-read.mjs`; the swap and the leftovers step are in
 * `agent-models-swap.mjs`. This module registers the folder, composes the line and re-exports what the old single module exported.
 *
 * Imports only `node:` builtins, `./user-guard-install.mjs` and its `agent-models-*.mjs` siblings, because a consumer runs
 * it from its verbatim copy in `.claude/hooks/lib/` with nothing installed beside it. It reads no environment variable and
 * decides no skip: the caller (the session self-install) decides whether to run it and passes the running user's home.
 *
 * In short: nothing is locked; two sessions are serialised by an exclusive staging name, the atomicity of `rename`, the
 * "somebody else won" branch (F3a) and the re-read of settings.json. The target is judged by `lstat` BEFORE anything that
 * follows links, and a symlinked, foreign-owned or non-directory target is refused, never renamed or deleted through.
 * Every refusal, like an edited or newer copy, is said once per line (`saidRefusal`, `saidOnce`): the reported file keeps one key, and a run that ends with no refusal removes it, so a bad state entered again is said again.
 */
import fs from 'node:fs';
import path from 'node:path';

import {
  backupOnce, commitSettings, isHardLinkFailure, parseSettings, readOrNull, serialise, settingsFileOf, writableReason,
} from './user-guard-install.mjs';
import {
  ASIDE_TAG, PLUGIN_DIRS_KEY, RELEASED_MOD, REPLACED_TAG, REPORTED_FILE, STAGING_TAG, codeOf, currentUid, decideCopy, decideRegistration, modTargets, reportKey, sha256, versionText,
} from './agent-models-decide.mjs';
import { readSource, readTarget } from './agent-models-read.mjs';
import {
  carryOutCopy, defaultRemove, manifestBytes, modsProblem, readReportedKey, reconcile, rmQuiet, writeReported,
} from './agent-models-swap.mjs';

// The names the module exported before it was split stay importable from here (the guard and the tests import them).
export {
  ASIDE_TAG, INTRODUCED, LEFTOVER_MIN_AGE_MS, MANIFEST_FILE, MOD_FILES, MOD_NAME, OPTOUT_FILE, PLUGIN_DIRS_KEY, REPLACED_TAG, REPORTED_FILE,
  STAGING_TAG, compareVersions, decideCopy, decideRegistration, leftoverStamp, manifestMatches, modTargets, parseVersion, reportKey,
  replacedStamp, versionOf, withPluginDir,
} from './agent-models-decide.mjs';
export { readSource, readTarget, reconcile };

const SHOWN_TARGET = '~/.claude/mods/agent-models';
const SHOWN_SETTINGS = '~/.claude/settings.json';
const SHOWN_OPTOUT = '~/.claude/mods/agent-models.optout';
const SETTINGS_CHANGED = 'settings.json changed while registering the agent-models mod; nothing written to it';
const REGISTERED_SUFFIX = `; registered in ${SHOWN_SETTINGS} (${PLUGIN_DIRS_KEY})`;
const RETRY_TAIL = '; the next session start registers it';
const HAND_TAIL = '; fix it by hand — nothing changes until then';
const SYMLINK_ONCE = ` (said once; create ${SHOWN_OPTOUT} to turn this step off)`;
const carriedText = n => `; carried over ${n} ${n === 1 ? 'entry' : 'entries'} of this session's ${PLUGIN_DIRS_KEY}, because the settings value replaces the shell's`;

// ---------------------------------------------------------------------------------------------------------------------
// the registration
// ---------------------------------------------------------------------------------------------------------------------

/** A refused registration. `retry` is typed: true only for a reason a later session start can clear. */
const refusedRegistration = (reason, retry) => ({ registration: 'refuse', reason, retry });

/** The file changed under us: fine when what is there now lists the folder, a refusal otherwise. */
function settledOrChanged(now, target, home) {
  return decideRegistration(parseSettings(now), target, home).action === 'none' ? { registration: 'settled' } : refusedRegistration(SETTINGS_CHANGED, true);
}

/** Why the write must not start, as a refused registration; null when it may. */
function blocked(t, original, target) {
  if (target.refusal) return refusedRegistration(target.reason, false);
  if (target.dangling) return refusedRegistration(`${t.settings} is a link to ${target.file}, which does not exist`, true);
  const file = original === null ? '' : writableReason(target.file);
  if (file) return refusedRegistration(`${t.settings} ${file}`, false);
  const folder = path.dirname(target.file);
  const reason = writableReason(folder);
  return reason ? refusedRegistration(`${folder} ${reason}`, false) : null;
}

function registerIn({ t, home, beforeWrite, inheritedPluginDirs, original, target }) {
  const decision = decideRegistration(parseSettings(original), t.target, home, inheritedPluginDirs);
  if (decision.action === 'none') return { registration: 'none' };
  if (decision.action === 'refuse') return refusedRegistration(decision.reason, decision.retry);
  const refusal = blocked(t, original, target);
  if (refusal) return refusal;
  // A backup only when a write follows, and none of a file that did not exist; a retry adds no file (backupOnce).
  const prepare = () => { if (original !== null) backupOnce(target.file, original, fs.statSync(target.file).mode & 0o777); };
  // replace: false — a settings.json this step creates never takes the place of one that appeared after the re-check.
  const done = commitSettings({ settingsPath: t.settings, original, target, data: serialise(decision.next), beforeWrite, prepare, replace: false });
  return done.written ? { registration: 'append', carried: decision.carried } : settledOrChanged(done.now, t.target, home);
}

/** Registers the target in settings.json, creating a missing file. Never throws. */
function register(args) {
  const { settings } = args.t;
  let original;
  let target;
  try {
    original = readOrNull(settings);
    target = settingsFileOf(settings);
  } catch (e) {
    return refusedRegistration(`${settings} could not be read (${codeOf(e)})`, false);
  }
  try {
    return registerIn({ ...args, original, target });
  } catch (e) {
    // A filesystem that cannot make the hard link the creation needs is not cleared by a later start: by hand, not a retry.
    if (isHardLinkFailure(e)) return refusedRegistration(`${settings} could not be created (${codeOf(e)}): this filesystem cannot make the hard link the creation needs`, false);
    return refusedRegistration(`${settings} could not be written (${codeOf(e)})`, true);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// the whole step
// ---------------------------------------------------------------------------------------------------------------------

const outcome = (action, line, copy, registration, rec) => ({ action, line, copy, registration, reconcile: rec });
const emptyReconcile = () => ({ restored: null, removed: [], skipped: [], refused: null });
const notInstalled = (reason, rec = emptyReconcile()) => outcome('refused', `agent-models mod NOT installed into ${SHOWN_TARGET}: ${reason}`, 'refuse', 'none', rec);

const reportedFile = t => path.join(t.mods, REPORTED_FILE);

/**
 * Says `line` once per target state: when the stored key equals `key` the line is '' and the outcome is flagged `repeated`,
 * otherwise the key is stored and the line stands. A reported file that cannot be written is tolerated: the line then
 * repeats at the next start, which is a nuisance and never a failure.
 */
function saidOnce(t, key, line, now) {
  if (readReportedKey(reportedFile(t)) === key) return { line: '', repeated: true };
  writeReported(reportedFile(t), key, now);
  return { line };
}

const withRepeated = (result, said) => ({ ...result, line: said.line, ...(said.repeated ? { repeated: true } : {}) });

const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A swap names its staging and aside folders with the swap's clock, pid and a random part, and a kept copy's `replaced-`
 * folder with the clock's stamp (`replacedStamp`); the same refusal at the next start must still be the same line. Built from
 * the tag constants, so a tag that is renamed cannot leave this behind.
 */
const SWAP_NAME = new RegExp(
  `(${escapeRegex(STAGING_TAG)}|${escapeRegex(ASIDE_TAG)})\\d+-\\d+-[0-9a-f]+|(${escapeRegex(REPLACED_TAG)})\\d+T\\d+Z`, 'g',
);
const swapNameKey = (match, swapTag, replacedTag) => `${swapTag ?? replacedTag}*`;

/**
 * A refused outcome, said once: the key is `line:` and the digest of its line (the random part of a swap's leftover names
 * left out), so a new reason, version or digest is a new line and the same one is silent. It needs the mods folder, where the
 * reported file lives; when that folder cannot be made or is not a folder, nothing can be recorded and the line stands at
 * every start. A refusal that is not recorded is never hidden.
 */
function saidRefusal(t, refused, now) {
  if (modsProblem(t)) return refused;
  return withRepeated(refused, saidOnce(t, `line:${sha256(refused.line.replace(SWAP_NAME, swapNameKey))}`, refused.line, now));
}

function copyLine(copy, replaced, version, installed) {
  const shown = versionText(version);
  switch (copy) {
    case 'upgrade': {
      const kept = replaced === undefined ? '' : `; the copy that differed from its install record was kept as ~/.claude/mods/${replaced}`;
      return [`agent-models mod upgraded in ${SHOWN_TARGET} (version ${versionText(installed)} → ${shown}${kept}) — loads from the next session`, 'upgraded'];
    }
    case 'edited': return [`agent-models mod in ${SHOWN_TARGET} is version ${shown} but its files differ from this repository's and from its install record — left as it is (said once); delete the folder to reinstall, or create ${SHOWN_OPTOUT} to turn this step off`, 'edited'];
    case 'newer': return [`agent-models mod in ${SHOWN_TARGET} is version ${versionText(installed)}, newer than this repository's ${shown} — left as it is (said once; create ${SHOWN_OPTOUT} to turn this step off)`, 'newer'];
    default: return [`agent-models mod ${shown} installed into ${SHOWN_TARGET} and registered in ${SHOWN_SETTINGS} (${PLUGIN_DIRS_KEY}) — loads from the next session`, 'installed'];
  }
}

const registeredOutcome = (copy, registration, carried, rec) => outcome(
  'registered', `agent-models mod registered in ${SHOWN_SETTINGS} (${PLUGIN_DIRS_KEY}) — loads from the next session${carried}`, copy, registration, rec,
);

/**
 * A copy that went through and a registration that did not refuse. Precedence: installed, upgraded, edited, newer, registered,
 * none. `edited` and `newer` are said once per state (`say`); a repeat that still had to register the folder says the
 * registration, because a change to settings.json is never silent.
 */
function composeDone({ copy, registration, carried, replaced, src, target, rec, say }) {
  const appended = registration === 'append';
  const carriedLine = appended && carried > 0 ? carriedText(carried) : '';
  if (['install', 'upgrade', 'edited', 'newer'].includes(copy)) {
    const [line, action] = copyLine(copy, replaced, src.version, target.version);
    const full = (copy !== 'install' && appended ? line + REGISTERED_SUFFIX : line) + carriedLine;
    if (copy !== 'edited' && copy !== 'newer') return outcome(action, full, copy, registration, rec);
    const said = say(copy, full);
    if (said.repeated && appended) return registeredOutcome(copy, registration, carriedLine, rec);
    return withRepeated(outcome(action, said.line, copy, registration, rec), said);
  }
  if (appended) return registeredOutcome(copy, registration, carriedLine, rec);
  return outcome('none', '', copy, registration, rec);
}

function composeRefusedRegistration({ copy, reason, retry, src, target, rec }) {
  const tail = retry ? RETRY_TAIL : HAND_TAIL;
  if (copy === 'lost') {
    return outcome('refused', `agent-models mod: another session installed it at the same moment, but it is NOT registered in ${SHOWN_SETTINGS}: ${reason}${tail}`, copy, 'refuse', rec);
  }
  const shown = copy === 'newer' ? versionText(target.version) : versionText(src.version);
  return outcome('refused', `agent-models mod ${shown} installed into ${SHOWN_TARGET} but NOT registered in ${SHOWN_SETTINGS}: ${reason}${tail}`, copy, 'refuse', rec);
}

/** The refusal of a symlinked target is the developer's own deliberate layout: told once per link and repository version. */
const symlinkRefusal = ({ t, src, target, decision, rec, now }) => {
  const refused = notInstalled(decision.reason + SYMLINK_ONCE, rec);
  return withRepeated(refused, saidOnce(t, reportKey('refuse', target, src.version), refused.line, now));
};

/** The copies and registrations that are no refusal and no said-once state (`edited`, `newer`, `other-checkout` and `lost` are not): a run made of these forgets the record. */
const CLEAN_COPIES = new Set(['none', 'install', 'upgrade', 'manifest']);
const CLEAN_REGISTRATIONS = new Set(['none', 'append']);

function run({ home, source, by, now, beforeWrite, rename, remove, uid, inheritedPluginDirs, released }) {
  const t = modTargets(home);
  const src = readSource(source, { released });
  // A source that is not the released mod says so once, and the flag lets the caller add what only it knows (the layout).
  if (src.error) return { ...saidRefusal(t, notInstalled(src.error), now), ...(src.unreleased ? { unreleased: true } : {}) };
  const problem = modsProblem(t);
  if (problem) return notInstalled(problem);
  const rec = reconcile(t, { now: now().getTime(), uid, rename, remove });
  if (rec.refused) return saidRefusal(t, notInstalled(rec.refused, rec), now);
  const target = readTarget(t, { uid });
  const decision = decideCopy(src, target);
  if (decision.action === 'refuse') {
    return target.kind === 'symlink' ? symlinkRefusal({ t, src, target, decision, rec, now }) : saidRefusal(t, notInstalled(decision.reason, rec), now);
  }
  const copied = carryOutCopy({ t, src, seen: target.version, decision, rename, remove, now, uid, manifest: manifestBytes(src, source, now, by) });
  if (copied.refusal) return saidRefusal(t, notInstalled(copied.refusal, rec), now);
  if (copied.copy === 'install' || copied.copy === 'upgrade') rmQuiet(reportedFile(t)); // a new copy is new information: what was said about the old one is forgotten
  const registered = register({ t, home, beforeWrite, inheritedPluginDirs });
  if (registered.registration === 'refuse') {
    return saidRefusal(t, composeRefusedRegistration({ copy: copied.copy, reason: registered.reason, retry: registered.retry, src, target, rec }), now);
  }
  // A start that ends with no refusal leaves no bad state to repeat: "said once" is once each time a bad state is entered.
  if (CLEAN_COPIES.has(copied.copy) && CLEAN_REGISTRATIONS.has(registered.registration)) rmQuiet(reportedFile(t));
  const say = (action, line) => saidOnce(t, reportKey(action, target, src.version), line, now);
  return composeDone({ copy: copied.copy, registration: registered.registration, carried: registered.carried ?? 0, replaced: copied.replaced, src, target, rec, say });
}

/** A throw nobody expected, told once when the mods folder can hold the record, and as it stands otherwise. Never throws. */
function unexpected(home, now, e) {
  const refused = notInstalled(`unexpected ${e?.code ?? e?.name}: ${e?.message}`);
  try {
    return saidRefusal(modTargets(home), refused, now);
  } catch {
    return refused;
  }
}

/**
 * The whole step. Never throws; every failure is a `refused` result with a reason.
 *   home    the RUNNING user's home; never another account's
 *   source  the mod folder the caller found (in a consumer: .agents/conventions/mods/agent-models)
 *   by      provenance written into the manifest
 *   now     clock for the manifest, for the names of the swap's leftovers and for reconcile's age
 *   inheritedPluginDirs  the session's own CLAUDE_CODE_PLUGIN_DIRS, passed by the caller (this module reads no environment
 *                        variable): a first registration into an empty settings value carries it, because that value replaces the shell's
 *   released  the identity a source must have; a test passes its fixture's own, production passes nothing
 *   beforeWrite  test seam: runs before the final re-read of settings.json
 *   rename       test seam: the function used for the swap's and the restore's renames ONLY (never the settings write's)
 *   remove       test seam: the function that deletes a leftover folder or file (default: recursive rmSync, ENOENT is success)
 *   uid          test seam: the caller's uid
 */
export function ensureAgentModels({
  home, source, by = 'self-install', now = () => new Date(), beforeWrite = () => {}, rename = fs.renameSync, remove = defaultRemove,
  uid = currentUid, inheritedPluginDirs, released = RELEASED_MOD,
}) {
  try {
    return run({ home, source, by, now, beforeWrite, rename, remove, uid, inheritedPluginDirs, released });
  } catch (e) {
    return unexpected(home, now, e);
  }
}
