'use strict';
// One program, bounded, for the CommonJS probes: exe + argv, a time limit, and a timeout that ends the program's WHOLE process tree (G1 E3.S10, the coai
// code gate). It is the shared launcher of the conventions mount (`tools/lib/proc.mjs` `run`: a process group of its own, a tree kill, a typed outcome),
// loaded with `import()` because this file is CommonJS; the answer has the shape the probes already read.
//
// Why not `execFile` with `timeout`: that signals only the direct child (`.agents/PROJECT.md`, "a timed-out child process is a killed child process"). A
// program that started a helper (an `ssh` that forked a control master, a shim that ran a client) left the helper running past the limit.
//
// A harness that ends (a signal, an error nobody caught) ends the programs it still waits for: the first call registers that in the harness's scope.
const harnessScope = require('./harnessScope.cjs');

const MIB = 1024 * 1024;
/** The most output of one program that is kept; one more byte ends the tree (`proc.mjs` `maxOutputBytes`). */
const DEFAULT_MAX_OUTPUT_BYTES = 8 * MIB;
/** The default limit of one program. */
const DEFAULT_TIMEOUT_MS = 20_000;

/** The programs that still run: each one's abort ends its tree. */
const running = new Set();
let registered = false;

/** The one registration in the harness's scope: its close aborts every program that still runs, which ends each tree. */
function endRunningWithScope() {
  if (registered) return;
  registered = true;
  harnessScope.scope.after(() => {
    for (const control of running) control.abort();
  });
}

let launcher;
/** The mount's `run`, loaded once. Throws (so a caller sees it) when the mount is absent. */
function launcherOf() {
  launcher ??= import('../../../.agents/conventions/tools/lib/proc.mjs').then((module) => module.run);
  return launcher;
}

/**
 * One program with `args`, bounded: `{ code, signal, timedOut, stdout, stderr }`. `code` is `null` when the program was ended by a signal, by the limit,
 * by the output bound or never started. Its stdin is closed. Never rejects once the launcher is loaded. No shell: the argv stays separate arguments.
 * `timeoutMs` is the limit, after which the program and every process it started in its group are killed.
 */
async function boundedRun(program, args, { env = process.env, timeoutMs = DEFAULT_TIMEOUT_MS, maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES } = {}) {
  const run = await launcherOf();
  endRunningWithScope();
  const control = new AbortController();
  running.add(control);
  try {
    const said = await run(program, args, { env, timeoutMs, maxOutputBytes, signal: control.signal });
    const ended = said.signal !== null || said.timedOut || said.overflow || said.cancelled || said.spawnFailed;
    const notes = [
      said.spawnFailed ? `Error: spawn ${program} ${said.spawnError}` : '',
      said.overflow ? `Error: the output passed ${maxOutputBytes} bytes; the whole tree was ended` : '',
    ].filter((note) => note !== '');
    return {
      code: ended ? null : said.code,
      signal: said.signal ?? (said.timedOut || said.overflow || said.cancelled ? 'SIGKILL' : null),
      timedOut: said.timedOut,
      stdout: said.out,
      stderr: notes.length === 0 ? said.err : `${said.err}\n${notes.join('\n')}`,
    };
  } finally {
    running.delete(control);
  }
}

module.exports = { boundedRun, DEFAULT_TIMEOUT_MS };
