#!/usr/bin/env node
/**
 * The Claude host adapter: put a repository's instructions into a session at its start.
 *
 * <p>Copied verbatim into each consumer as `.claude/hooks/load-instructions.mjs` and wired by
 * `settings/settings.json`. `tools/adapter-check.mjs` fails when a copy has drifted from this file,
 * for the same reason `pin-check.mjs` exists: a reference nothing compares is a reference that
 * quietly stops being one.</p>
 *
 * <p><b>Why a hook and not the obvious thing.</b> `ENTRY.md` is one loading procedure for two hosts,
 * and `tools/lib/rule-cli.mjs` enforces the single source by refusing a `CLAUDE.md` that is anything
 * but `@AGENTS.md` and refusing a non-empty `.claude/rules`. Those two are precisely the doors
 * Claude Code loads project instructions through on its own, with no imports and no procedure. Shut
 * them and a session starts holding an instruction to go and read the rules rather than the rules —
 * measured in `dew_flow_connect_other_ais`, 561 bytes where ~10.5 KB used to arrive by itself.</p>
 *
 * <p>That is a change of KIND, not of size: enforcement moved from the host to the model's own
 * diligence, and `ENTRY.md` step 8 requires the procedure again after every compaction. Codex is
 * unaffected — it was always going to follow AGENTS' imperative instructions. This restores for
 * Claude what Claude used to get for free, without weakening the single-source rule by one byte.</p>
 *
 * <p><b>What it deliberately does NOT do.</b> It does not replace the procedure. `--task inspect`
 * selects what applies to EVERY task; anything chosen by which files are being changed still needs
 * `explain`/`read` for the real task, and the notice below says so — a session start cannot know
 * what the session will touch.</p>
 *
 * <p>It never fails a session. A missing submodule or resolver is reported as INCOMPLETE, in
 * `ENTRY.md`'s own words, with the commands that fix it, and the exit code stays 0: a hook that
 * fails on a fresh clone is a hook somebody deletes, and then nobody notices the rules are gone.</p>
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** The repository root, resolved the way `ENTRY.md` step 1 resolves it. */
function repoRoot() {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8', timeout: 30_000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

/**
 * The resolver, in a consumer or in the conventions repository itself.
 *
 * <p>`ENTRY.md` step 3 draws exactly this distinction, and the self-hosted case is not hypothetical:
 * this repository runs the hook on itself, which is the only test of the mechanism that cannot pass
 * while the mechanism is broken.</p>
 */
function resolverIn(root) {
  const mounted = path.join(root, '.agents/conventions/tools/rules.mjs');
  const selfHosted = path.join(root, 'tools/rules.mjs');

  if (fs.existsSync(mounted)) {
    return mounted;
  }

  return fs.existsSync(selfHosted) && fs.existsSync(path.join(root, 'ENTRY.md')) ? selfHosted : '';
}

function incomplete(reason) {
  process.stdout.write(
    'Instruction loading is INCOMPLETE — the shared resolver could not run.\n\n'
    + `${reason}\n\n`
    + 'Restore it inside the authorized task:\n'
    + '  git submodule update --init .agents/conventions\n'
    + '  npm ci --ignore-scripts --prefix .agents/conventions\n\n'
    + 'Until then, read .agents/PROJECT.md and .agents/conventions/ENTRY.md directly, and treat\n'
    + 'edits to affected files as blocked rather than defaulting to your own conventions.\n',
  );
}

try {
  const root = repoRoot();
  const resolver = resolverIn(root);
  if (resolver === '') {
    incomplete(`No resolver under ${root} — the conventions submodule is not checked out.`);
    process.exit(0);
  }

  // `inspect` is the neutral task: what comes back is what applies to every task, which is the only
  // selection a session start can honestly make.
  const emitted = execFileSync(process.execPath, [resolver, 'read', '--repo', root, '--task', 'inspect'], {
    encoding: 'utf8', timeout: 120_000, maxBuffer: 8 * 1024 * 1024, windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  process.stdout.write(
    'Project instructions for this repository, loaded at session start by '
    + '.claude/hooks/load-instructions.mjs from the pinned canonical source.\n\n'
    + 'These are the rules that apply to EVERY task. Rules selected by which files you change are\n'
    + 'not here: before editing, follow the entry procedure and run\n'
    + '  node <resolver> explain --repo <root> --task <task> --file <path>\n'
    + 'then read what it selects. Re-run it after a compaction or when the scope changes.\n\n'
    + emitted,
  );
} catch (error) {
  incomplete(String(error?.stderr || error?.message || error).trim());
}
