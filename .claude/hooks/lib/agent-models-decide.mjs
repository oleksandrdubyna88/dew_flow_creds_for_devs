/**
 * The pure half of the agent-models installer (`agent-models-install.mjs` sequences it): the constants, the version
 * arithmetic, the decisions over values somebody else read (`decideCopy`, `decideRegistration`). No file is read or
 * written here.
 *
 * Imports only `node:` builtins and `./user-guard-install.mjs` because a consumer runs it from its verbatim copy in
 * `.claude/hooks/lib/` (adapter-check demands that copy) with nothing installed beside it.
 */
import path from 'node:path';
import process from 'node:process';

import { isObject, normalise, sha256 } from './user-guard-install.mjs';

export const MOD_NAME = 'agent-models';
export const PLUGIN_DIRS_KEY = 'CLAUDE_CODE_PLUGIN_DIRS';
/** The seven files that are the mod: the ONLY list the copy reads. Frozen; the order is the copy order. */
export const MOD_FILES = Object.freeze([
  '.claude-plugin/plugin.json',
  'hooks/hooks.json',
  'hooks/register.tsx',
  'hooks/prompts.ts',
  'hooks/tasks.tsx',
  'hooks/limits.tsx',
  'types/index.d.ts',
]);
/** The release that first shipped a file of MOD_FILES; a copy of an older release has no such file. Frozen. */
export const INTRODUCED = Object.freeze({
  'hooks/tasks.tsx': Object.freeze([1, 3, 0]),
  'hooks/limits.tsx': Object.freeze([1, 3, 0]),
});

/**
 * The released mod: its version and the RAW sha256 of each `MOD_FILES` entry, from the SAME release as this file. A
 * consumer carries this file in `.claude/hooks/lib/` and the mod in its pinned submodule, both from one release, so
 * the pair matches. A folder that holds other bytes is not copied into ~/.claude, where it would run in every
 * session on the machine. A test fails when this differs from the newest row of `tools/agent-models-pins.json`, and
 * another when that row differs from `mods/agent-models`. Raw, never folded: the copy writes the held bytes as they
 * are, so the digest names exactly what is written (`.gitattributes` keeps the folder LF). This keeps an unreviewed
 * mod inside its repository; it is no sandbox: a repository with hostile hooks already runs code in its sessions.
 */
export const RELEASED_MOD = Object.freeze({
  version: '1.4.0',
  sha256: Object.freeze({
    '.claude-plugin/plugin.json': '5953668f9dc146986e11af4c59f7230d7a6c3cb00da14d57046301c2895e66c8',
    'hooks/hooks.json': 'd842d789476d67282d0f04b7e5fdc68a3d981ccec65dd79cfa2d11eed13fb828',
    'hooks/register.tsx': 'f27f45e9e35ba0bd4410aaebb6fc72fcff69f3e120eb85d0575ea6160747f649',
    'hooks/prompts.ts': '4de06f11b308b753d28f9171ef9727512badf8fc284b4935588d8ad0437f7a8d',
    'hooks/tasks.tsx': '52541431aad684757fac626a5c6d3231d7b633ff14d96efdc0d9dfbd0659e4cb',
    'hooks/limits.tsx': '77b6c214d56a25c15363231d8e8ec8c71d8bd574abd8aedef410b74e4d7b449b',
    'types/index.d.ts': '367b2f22db3d42f2ea596c378373e0d4e6a43fad18a48649dcb84eae72d086a5',
  }),
});
export const OPTOUT_FILE = 'agent-models.optout';
export const MANIFEST_FILE = 'agent-models.installed.json';
export const STAGING_TAG = 'agent-models.staging-';
export const ASIDE_TAG = 'agent-models.aside-';
export const REPLACED_TAG = 'agent-models.replaced-';
export const REPORTED_FILE = 'agent-models.reported.json';
export const LEFTOVER_MIN_AGE_MS = 10 * 60 * 1000;

export const PLUGIN_JSON = MOD_FILES[0];
export { sha256 };
export const codeOf = e => e?.code ?? e?.message;
export const currentUid = () => process.getuid?.();

/** Every path this module may name under `home`. Nothing else under `~/.claude/mods` is read, renamed or deleted. */
export function modTargets(home) {
  const claude = path.resolve(home, '.claude');
  const mods = path.join(claude, 'mods');
  return {
    mods,
    target: path.join(mods, MOD_NAME),
    manifest: path.join(mods, MANIFEST_FILE),
    optout: path.join(mods, OPTOUT_FILE),
    settings: path.join(claude, 'settings.json'),
  };
}


// ---------------------------------------------------------------------------------------------------------------------
// versions
// ---------------------------------------------------------------------------------------------------------------------

/** `[major, minor, patch]` for `MAJOR.MINOR.PATCH` (digits only); null for anything else. */
export function parseVersion(text) {
  const match = typeof text === 'string' ? /^(\d+)\.(\d+)\.(\d+)$/.exec(text) : null;
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/** -1, 0 or 1 by numeric comparison of the three parts. */
export function compareVersions(a, b) {
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
}

export const parseJsonObject = bytes => {
  const value = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
  return isObject(value) ? value : null;
};

/** The version of a plugin.json's bytes: parsed as JSON, never executed; 0.0.0 when it cannot be read. */
export function versionOf(pluginJsonBytes) {
  if (pluginJsonBytes === null) return [0, 0, 0];
  try {
    const value = parseJsonObject(pluginJsonBytes);
    return (value && parseVersion(value.version)) ?? [0, 0, 0];
  } catch {
    return [0, 0, 0];
  }
}

export const versionText = version => version.join('.');

const SHA256_HEX = /^[0-9a-f]{64}$/;
const isReleasedIdentity = released => isObject(released) && parseVersion(released.version) !== null
  && isObject(released.sha256) && Object.keys(released.sha256).length === MOD_FILES.length
  && MOD_FILES.every(rel => Object.hasOwn(released.sha256, rel) && SHA256_HEX.test(released.sha256[rel]));

/**
 * Why a source read (`{ version, files }`) is not the released mod; '' when it is. Pure. It names the first
 * `MOD_FILES` entry whose raw sha256 differs; for plugin.json with another version it names the versions.
 * `released` has no default here: a missing or malformed identity refuses, it never passes.
 */
export function releasedModRefusal(src, released) {
  if (!isReleasedIdentity(released)) return 'cannot be checked: there is no valid released identity';
  if (!Array.isArray(src?.version)) return 'has no version: the read of its plugin.json gave none';
  const not = `is not the released mod ${released.version}: `;
  const version = versionText(src.version);
  const otherVersion = `${PLUGIN_JSON} is version ${version}, released ${released.version}`;
  for (const rel of MOD_FILES) {
    const held = src.files.get(rel);
    const digest = Buffer.isBuffer(held) ? sha256(held) : 'none';
    if (digest === released.sha256[rel]) continue;
    if (rel === PLUGIN_JSON && version !== released.version) return not + otherVersion;
    return `${not}${rel} differs (sha256 ${digest.slice(0, 12)}, released ${released.sha256[rel].slice(0, 12)})`;
  }
  return version === released.version ? '' : not + otherVersion;
}

// ---------------------------------------------------------------------------------------------------------------------
// decisions (pure)
// ---------------------------------------------------------------------------------------------------------------------

/**
 * True when `manifest` vouches for exactly `files` at `version`: the same version; every key of its `sha256` is a member of
 * `MOD_FILES`; and for every member of `MOD_FILES` either the manifest names it and `files` holds those bytes, or the
 * manifest does not name it because `version` is older than the file's `INTRODUCED` release and the target does not hold
 * the file (a regular file there that the record does not name is not what the record vouched for).
 */
export function manifestMatches(manifest, files, version) {
  if (!isObject(manifest) || manifest.version !== versionText(version) || !isObject(manifest.sha256)) return false;
  if (!Object.keys(manifest.sha256).every(rel => MOD_FILES.includes(rel))) return false;
  return MOD_FILES.every(rel => {
    const held = files.get(rel);
    if (Object.hasOwn(manifest.sha256, rel)) return Buffer.isBuffer(held) && sha256(held) === manifest.sha256[rel];
    const introduced = INTRODUCED[rel];
    return introduced !== undefined && compareVersions(version, introduced) < 0 && !Buffer.isBuffer(held);
  });
}

/** sha256 over the installed files' sha256 in `MOD_FILES` order, `-` for a file that could not be read as bytes. */
export const digestOf = files => sha256(MOD_FILES.map(rel => (Buffer.isBuffer(files.get(rel)) ? sha256(files.get(rel)) : '-')).join('\n'));

/** What a said-once line is keyed on: action, target state, repository version. A symlink keys on its link text. */
export function reportKey(action, target, srcVersion) {
  const version = versionText(srcVersion);
  return target.kind === 'symlink' ? `symlink:${target.link}:${version}` : `${action}:${digestOf(target.files)}:${version}`;
}

const STAMPED_LEFTOVER = /^agent-models\.(?:staging|aside)-(\d+)-\d+-[0-9a-f]+$/;

/** The clock (ms) a swap wrote into its staging or aside name, or null for a name that carries none (a name of an older release). */
export function leftoverStamp(name) {
  const match = STAMPED_LEFTOVER.exec(name);
  return match ? Number(match[1]) : null;
}

/** UTC `YYYYMMDDTHHmmssSSSZ`, the stamp of a `replaced-` folder. */
export const replacedStamp = date => date.toISOString().replace(/[-:]/g, '').replace('.', '');

export const refuse = reason => ({ action: 'refuse', reason });
/** A registration refusal; `retry` is typed: true only when a later session start can clear the reason. */
const refuseRegistration = (reason, retry) => ({ action: 'refuse', reason, retry });
const bytesEqual = (src, target) => MOD_FILES.every(rel => Buffer.isBuffer(target.files.get(rel)) && target.files.get(rel).equals(src.files.get(rel)));

function decideForDirectory(src, target) {
  const order = compareVersions(target.version, src.version);
  const vouched = manifestMatches(target.manifest, target.files, target.version);
  // A copy that did not match its install record is kept (renamed to a `replaced-` folder) when it is upgraded.
  if (order < 0) return { action: 'upgrade', keep: !vouched };
  if (order > 0) return { action: 'newer' };
  // Equal version, other bytes: another checkout at this version installed it (its record vouches for it) or somebody edited it.
  if (!bytesEqual(src, target)) return { action: vouched ? 'other-checkout' : 'edited' };
  return { action: vouched ? 'none' : 'manifest' };
}

/** The copy decision over the two reads. */
export function decideCopy(src, target) {
  if (src.error !== undefined) return refuse(src.error);
  switch (target.kind) {
    case 'missing': return { action: 'install' };
    case 'symlink': return refuse(`${target.path} is a symlink; it is never renamed aside or deleted through`);
    case 'other': return refuse(`${target.path} is not a directory`);
    case 'foreign': return refuse(`${target.path} is owned by another user (uid ${target.uid})`);
    case 'unreadable': return refuse(`${target.path} could not be read (${target.code})`);
    default: return decideForDirectory(src, target);
  }
}

/** `settings` with the target appended to env.CLAUDE_CODE_PLUGIN_DIRS (`carried` entries first, only into an empty value). */
export function withPluginDir(settings, targetPath, carried = []) {
  const next = structuredClone(settings);
  const env = isObject(next.env) ? next.env : {};
  const current = typeof env[PLUGIN_DIRS_KEY] === 'string' ? env[PLUGIN_DIRS_KEY] : '';
  env[PLUGIN_DIRS_KEY] = current === '' ? [...carried, targetPath].join(path.delimiter) : current + path.delimiter + targetPath;
  next.env = env; // an existing env keeps its place; an absent one is appended last
  return next;
}

const expandHome = (entry, home) => (entry.startsWith('~/') || entry.startsWith('~\\') ? path.join(home, entry.slice(2)) : entry);

/**
 * The entries of the session's own CLAUDE_CODE_PLUGIN_DIRS to write before our target: empties, duplicates (first kept) and
 * our target dropped, every kept entry VERBATIM. A path that does not exist is kept: the engine skips it with a warning
 * (observed before this port; not re-measured in this repository), and dropping would lose a path that is only absent now (an unmounted share).
 */
export function inheritedEntries(inherited, targetPath, home) {
  if (typeof inherited !== 'string') return [];
  const seen = new Set([normalise(targetPath)]);
  const kept = [];
  for (const entry of inherited.split(path.delimiter)) {
    if (entry === '') continue;
    const key = normalise(expandHome(entry, home));
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(entry);
  }
  return kept;
}

const append = (settings, targetPath, home, inherited) => {
  const carried = inheritedEntries(inherited, targetPath, home);
  return { action: 'append', next: withPluginDir(settings, targetPath, carried), carried: carried.length };
};

/**
 * The registration decision over parsed settings (`{ settings }` or `{ error }`; a missing file is
 * `parseSettings(null)`, an empty object). `inherited` is the
 * session's own CLAUDE_CODE_PLUGIN_DIRS: the settings value REPLACES the shell's one (measured 2026-11-10, claude -p
 * 2.1.322), so a first registration into an empty value carries it over.
 */
export function decideRegistration(parsed, targetPath, home, inherited) {
  const file = modTargets(home).settings;
  if (parsed.error) return refuseRegistration(`${file} ${parsed.error}`, false);
  const { settings } = parsed;
  if (!Object.hasOwn(settings, 'env')) return append(settings, targetPath, home, inherited);
  if (!isObject(settings.env)) return refuseRegistration(`${file}: env is not an object`, false);
  const value = settings.env[PLUGIN_DIRS_KEY];
  if (value === undefined) return append(settings, targetPath, home, inherited);
  if (typeof value !== 'string') return refuseRegistration(`${file}: env.${PLUGIN_DIRS_KEY} is not a string`, false);
  const wanted = normalise(targetPath);
  const listed = value.split(path.delimiter).some(entry => entry !== '' && normalise(expandHome(entry, home)) === wanted);
  if (listed) return { action: 'none' };
  return append(settings, targetPath, home, value === '' ? inherited : undefined);
}
