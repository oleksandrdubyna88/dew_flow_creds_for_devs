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
 * the `--force` command). It also refuses when git reports uncommitted changes to the project copy.</p>
 *
 * <p><b>Effort.</b> Independently of the guard, every session start converges the existing
 * `~/.claude/settings.json` so `effortLevel` and `modelSettings.<model>.effortLevel` are all `high`
 * (`ensureEffort`; one line when it changed something). Only `SUBAGENT_MODEL_GUARD=off` and the conventions
 * repository itself skip it; the `subagent-model.optout` marker deliberately does not (high everywhere).</p>
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { applyEffort, guardVersion, install, isRegistered, registrationValid, repairRegistration, targets } from './lib/user-guard-install.mjs';

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

/** True when git reports uncommitted changes to the file; false when git is unavailable or it is not a repository. */
function hasUncommittedChanges(file) {
  try {
    const out = execFileSync('git', ['-C', path.dirname(file), 'status', '--porcelain', '--', file], {
      encoding: 'utf8', timeout: 2000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.trim() !== '';
  } catch {
    return false;
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

/** Install or upgrade the user-level guard when needed; returns what happened and the line to show. */
export function ensureUserGuard({ home, source, env }) {
  const t = targets(home);
  if (optedOut(env) || fs.existsSync(t.optout) || !fs.existsSync(source)) return skipped();
  if (isReferenceRepository(source)) return skipped('subagent-model guard self-install skipped: this is the conventions repository itself');
  const to = versionOf(source);
  const step = plan(t, to);
  if (step.action === 'none') return { action: 'none', line: '' };
  if (step.action === 'newer') return { action: 'newer', line: newerLine(step.from, to) };
  if (step.action === 'repair-registration') return repairOnly(home, step.from, to);
  if (hasUncommittedChanges(source)) return { action: 'refused', line: refusal('the project copy of the hook has uncommitted changes') };
  const { code, lines } = install({ home, source, by: 'self-install' });
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

const SPEAKING = new Set(['installed', 'upgraded', 'refused', 'newer', 'repaired', 'converged']);

async function main() {
  try {
    const cwd = payloadCwd(await readStdin());
    const project = process.env.CLAUDE_PROJECT_DIR || cwd;
    if (!project) return;
    const source = path.join(project, '.claude', 'hooks', 'subagent-model.mjs');
    const args = { home: os.homedir(), source, env: process.env };
    // Guard first: on a fresh machine it creates settings.json, which effort then converges in the same session.
    const lines = [guardStep(ensureUserGuard, args), guardStep(ensureEffort, args)].filter(Boolean);
    if (lines.length) process.stdout.write(`${JSON.stringify({ systemMessage: lines.join('\n') })}\n`);
  } catch {
    // Fail open: a self-install must never cost a session its start.
  }
}

/** The line a step wants shown, or '' for a silent step or one that threw (the other step still runs). */
function guardStep(step, args) {
  try {
    const { action, line } = step(args);
    return SPEAKING.has(action) ? line : '';
  } catch {
    return '';
  }
}

if (process.argv[1]?.endsWith('ensure-user-guard.mjs')) {
  await main();
  process.exit(0);
}
