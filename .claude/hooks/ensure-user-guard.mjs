#!/usr/bin/env node
/**
 * Self-install the user-level subagent-model guard from a session start.
 *
 * <p>Copied verbatim into each consumer as `.claude/hooks/ensure-user-guard.mjs` and (from the release
 * that wires it) run as a `SessionStart` hook. It puts the project's `subagent-model.mjs` into
 * `~/.claude` when that copy is missing or older, so a fresh machine needs no manual step. All the
 * safety (refusing unparsable or concurrently changed settings, atomic write, backup) is the installer
 * core in `lib/user-guard-install.mjs`, shared with `tools/install-user-hook.mjs`.</p>
 *
 * <p><b>Versions are read as TEXT.</b> `GUARD_VERSION` is found with a regex in the source and in the
 * installed copy; neither file is imported or executed. An equal or newer installed copy is never
 * touched (no downgrade, so two repositories on different releases cannot flip it back and forth); an
 * installed copy with no version counts as 0.</p>
 *
 * <p><b>It stays out of the way.</b> `SUBAGENT_MODEL_GUARD=off` (a measuring harness) and the
 * `subagent-model.optout` marker (written by `--uninstall`) both skip it. It never blocks the session:
 * any throw prints nothing, and the exit code is always 0. It speaks (one `systemMessage` line) only
 * when it installed, upgraded, refused, or found a NEWER installed copy (never downgraded; the line names
 * the `--force` command). It also refuses when git reports uncommitted changes to the project copy, when git cannot
 * say (not on PATH, a timeout — only "not a git repository" means nothing to compare), and when the installed copy was
 * changed since its install (the installer's manifest check). It copies only the RELEASED guard: a project copy whose
 * sha256 or version differs from `RELEASED_GUARD` (the pair baked into this release) is refused, because the guard in
 * ~/.claude runs for every repository (the owner's go, 2026-11-11).</p>
 *
 * <p><b>Effort.</b> Independently of the guard, every session start converges the existing
 * `~/.claude/settings.json` so `effortLevel` and `modelSettings.<model>.effortLevel` are all `high`
 * (`ensureEffort`; one line when it changed something). Only `SUBAGENT_MODEL_GUARD=off` and the conventions
 * repository itself skip it; the `subagent-model.optout` marker deliberately does not (high everywhere).</p>
 *
 * <p><b>Agent-models mod.</b> Third (`ensureAgentModelsMod`): the released mod at `<project>/.agents/conventions/mods/agent-models`
 * is copied into `~/.claude/mods` and registered in `settings.json` (created when missing; `lib/agent-models-install.mjs`).
 * Skipped, in order: `AGENT_MODELS_MOD=off`, win32, the conventions repository (decided on the project's own hook path, never on
 * the mod's folder), the `agent-models.optout` marker, a project without the mod; `SUBAGENT_MODEL_GUARD=off` does not skip it.
 * Every refusal is said once; a mod that is not the released one adds the advice to run `git submodule update`.
 * The step loads the mod's modules with a dynamic `import()` when it runs (the step is async), so a module that fails to load (missing,
 * a syntax error) skips that step in silence and never costs the guard or effort step; `main` runs each step inside `guardStep`.</p>
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { RELEASED_GUARD, applyEffort, guardVersion, install, isRegistered, registrationValid, repairRegistration, targets } from './lib/user-guard-install.mjs';

export { guardVersion };

const STDIN_LIMIT = 256 * 1024;
const STDIN_DEADLINE_MS = 2000;

const skipped = (line = '') => ({ action: 'skipped', line });

/**
 * True when the source's project root has the conventions repository's own layout. That checkout is where
 * guards are developed (work in progress, branches ahead of the release), so it never installs into the
 * user's home; only a consumer, which receives the hook through a released pin, does.
 */
function isReferenceRepository(source) {
  const root = path.resolve(path.dirname(source), '..', '..');
  return fs.existsSync(path.join(root, 'tools', 'rules.mjs')) && fs.existsSync(path.join(root, 'settings', 'hooks', 'subagent-model.mjs'));
}

const versionOf = file => guardVersion(fs.readFileSync(file, 'utf8'));

const optedOut = env => String(env.SUBAGENT_MODEL_GUARD ?? '').trim().toLowerCase() === 'off';

const refusal = reason =>
  `subagent-model guard NOT installed into ~/.claude: ${reason}; run node <conventions>/tools/install-user-hook.mjs by hand`;

/** Which action the two versions call for, or `none` when the installed copy is present and current. */
function plan(t, sourceVersion) {
  if (!fs.existsSync(t.hook)) return { action: 'installed', from: 0 };
  const from = versionOf(t.hook);
  // An equal version is only "current" when it is also registered and its manifest vouches for the bytes.
  if (from === sourceVersion) return isRegistered(t) ? { action: 'none', from } : { action: 'installed', from: 0 };
  if (from < sourceVersion) return { action: 'upgraded', from };
  // A newer copy is never replaced, but one nothing calls is still broken: only its registration is repaired.
  return { action: registrationValid(t) ? 'newer' : 'repair-registration', from };
}

const newerLine = (installed, source) =>
  `subagent-model guard in ~/.claude is version ${installed}, newer than this repository's ${source} — run node <conventions>/tools/install-user-hook.mjs --force to replace it`;

const repairedLine = (installed, source) =>
  `subagent-model guard version ${installed} in ~/.claude (newer than this repository's ${source}) was not registered — registration repaired`;

/**
 * Why the project copy must not be installed because of its git state; '' when it may be. Only "not a git repository"
 * means there is nothing to compare. Any other failure (no git on PATH, a timeout, another exit) refuses: reading it as
 * "no changes" let a possibly edited copy into ~/.claude (coai code gate, 2026-11-10). LC_ALL=C keeps git's message
 * in English, so the one accepted failure is recognised whatever the user's locale.
 */
function uncommittedRefusal(file) {
  // Absolute: a relative pathspec is read from the `-C` folder, so it named a file that is not there (code round).
  const absolute = path.resolve(file);
  try {
    const out = execFileSync('git', ['-C', path.dirname(absolute), 'status', '--porcelain', '--', absolute], {
      encoding: 'utf8', timeout: 2000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, LC_ALL: 'C' },
    });
    return out.trim() === '' ? '' : 'the project copy of the hook has uncommitted changes';
  } catch (error) {
    if (error?.status === 128 && /not a git repository/i.test(String(error.stderr ?? ''))) return '';
    return `git could not tell whether the project copy has uncommitted changes (${error?.code ?? `exit ${error?.status}`})`;
  }
}

const successLine = ({ action, from }, to) =>
  action === 'installed'
    ? `subagent-model guard installed into ~/.claude (version ${to})`
    : `subagent-model guard upgraded in ~/.claude (version ${from} → ${to})`;

/** Registration-only repair for a newer installed copy: bytes and manifest stay as they are. */
function repairOnly(home, installed, source) {
  const { code, lines } = repairRegistration({ home });
  return code === 0
    ? { action: 'repaired', line: repairedLine(installed, source) }
    : { action: 'refused', line: refusal(lines.at(-1) ?? 'unknown reason') };
}

/**
 * Install or upgrade the user-level guard when needed; returns what happened and the line to show. Only the released
 * guard is copied (`released`, the pair baked into this release; a parameter only so tests can name their own).
 */
export function ensureUserGuard({ home, source, env, released = RELEASED_GUARD }) {
  const t = targets(home);
  if (optedOut(env) || fs.existsSync(t.optout) || !fs.existsSync(source)) return skipped();
  if (isReferenceRepository(source)) return skipped('subagent-model guard self-install skipped: this is the conventions repository itself');
  // A project copy that cannot be read is a refusal line, never a throw (the plan round, 2026-11-11).
  let to;
  try {
    to = versionOf(source);
  } catch (error) {
    return { action: 'refused', line: refusal(`the project copy of the hook could not be read (${error?.code ?? 'error'})`) };
  }
  const step = plan(t, to);
  if (step.action === 'none') return { action: 'none', line: '' };
  if (step.action === 'newer') return { action: 'newer', line: newerLine(step.from, to) };
  if (step.action === 'repair-registration') return repairOnly(home, step.from, to);
  const dirty = uncommittedRefusal(source);
  if (dirty) return { action: 'refused', line: refusal(dirty) };
  // The release check is inside install, on the bytes it writes (one read).
  const { code, lines } = install({ home, source, by: 'self-install', released });
  if (code !== 0) return { action: 'refused', line: refusal(lines.at(-1) ?? 'unknown reason') };
  return { action: step.action, line: successLine(step, to) };
}

const effortLine = ({ problems }) => `effort set to high for every model (was: ${problems.join(', ')}) — takes effect from the next session; restart this one to run at high now`;

/** The outcome and line for what `applyEffort` reported. */
function effortOutcome({ code, lines, changed, problems }) {
  if (code !== 0) return { action: 'refused', line: `effort NOT converged: ${lines.at(-1) ?? 'unknown reason'}` };
  return changed ? { action: 'converged', line: effortLine({ problems }) } : { action: 'none', line: '' };
}

/**
 * Converge every effort to `high` in the user's existing settings.json (the rule: common/subagent-models.md
 * § Effort). Runs at EVERY session start, independent of the guard's version; says nothing when converged.
 * Skipped for a measuring harness (`SUBAGENT_MODEL_GUARD=off`) and for the conventions repository itself; a
 * missing file is not created. The `subagent-model.optout` marker does NOT skip it: effort is high everywhere.
 */
export function ensureEffort({ home, source, env }) {
  if (optedOut(env) || isReferenceRepository(source)) return skipped();
  return effortOutcome(applyEffort({ home }));
}

const modSwitchedOff = env => String(env.AGENT_MODELS_MOD ?? '').trim().toLowerCase() === 'off';

/**
 * The mod's installer, loaded only when the step runs (never as a static import: a load failure of any of its four modules, a
 * missing sibling or a syntax error, would end the whole hook before `main` and cost the guard and effort steps too). A load failure
 * is a silent skip of the mod step: the modules that could say it, or record it in the reported file, are the ones that did not load.
 */
async function loadInstaller() {
  try {
    return await import('./lib/agent-models-install.mjs');
  } catch {
    return null;
  }
}

const STALE_SUBMODULE_ADVICE = ' — the .agents/conventions submodule does not hold the pinned release; run git submodule update (said once)';

/**
 * Install or upgrade the agent-models mod in `~/.claude/mods` and register it in `settings.json` (what it copies and writes:
 * `lib/agent-models-install.mjs`). The mod is the project's pinned submodule. The "is this the conventions repository" test is
 * made on `source`, the project's `subagent-model.mjs` that the guard step uses, never on the mod's folder: a consumer's
 * `.agents/conventions` holds that repository's layout, so testing it would skip the step in every consumer. Skipped, each
 * writing nothing: `AGENT_MODELS_MOD=off`, win32, the reference repository, the `agent-models.optout` marker and a project
 * without the mod folder (the submodule is not initialised). `SUBAGENT_MODEL_GUARD=off` does NOT skip it. `platform` is a test seam.
 */
export async function ensureAgentModelsMod({ home, source, env, platform = process.platform }) {
  if (modSwitchedOff(env) || platform === 'win32' || isReferenceRepository(source)) return skipped();
  const installer = await loadInstaller();
  if (installer === null) return skipped();
  const { ensureAgentModels, modTargets } = installer;
  const mod = path.resolve(path.dirname(source), '..', '..', '.agents', 'conventions', 'mods', 'agent-models');
  if (fs.existsSync(modTargets(home).optout) || !fs.existsSync(mod)) return skipped();
  const result = ensureAgentModels({ home, source: mod, inheritedPluginDirs: env.CLAUDE_CODE_PLUGIN_DIRS });
  return result.unreleased && result.line ? { ...result, line: result.line + STALE_SUBMODULE_ADVICE } : result;
}

/** The raw stdin text, abandoned after a deadline when the caller never closes the pipe. */
async function readStdin() {
  let text = '';
  let timer;
  const read = (async () => {
    for await (const chunk of process.stdin) {
      text += chunk;
      if (text.length > STDIN_LIMIT) break;
    }
  })();
  await Promise.race([read, new Promise(resolve => { timer = setTimeout(resolve, STDIN_DEADLINE_MS); })]);
  clearTimeout(timer);
  return text;
}

/** The payload's `cwd`, or '' for anything that is not a JSON object carrying one. */
function payloadCwd(text) {
  try {
    const cwd = JSON.parse(text)?.cwd;
    return typeof cwd === 'string' ? cwd : '';
  } catch {
    return '';
  }
}

const SPEAKING = new Set(['installed', 'upgraded', 'refused', 'newer', 'repaired', 'converged', 'edited', 'registered']);

async function main() {
  try {
    const cwd = payloadCwd(await readStdin());
    const project = process.env.CLAUDE_PROJECT_DIR || cwd;
    if (!project) return;
    const source = path.join(project, '.claude', 'hooks', 'subagent-model.mjs');
    const args = { home: os.homedir(), source, env: process.env };
    // Guard first: on a fresh machine it creates settings.json, which effort then converges and the mod then registers itself in,
    // all in the same session.
    const lines = [await guardStep(ensureUserGuard, args), await guardStep(ensureEffort, args), await guardStep(ensureAgentModelsMod, args)].filter(Boolean);
    if (lines.length) process.stdout.write(`${JSON.stringify({ systemMessage: lines.join('\n') })}\n`);
  } catch {
    // Fail open: a self-install must never cost a session its start.
  }
}

/** The line a step wants shown, or '' for a silent step or one that threw (the other steps still run). */
async function guardStep(step, args) {
  try {
    const { action, line } = await step(args);
    return SPEAKING.has(action) ? line : '';
  } catch {
    return '';
  }
}

if (process.argv[1]?.endsWith('ensure-user-guard.mjs')) {
  await main();
  process.exit(0);
}
