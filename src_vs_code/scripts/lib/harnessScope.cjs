'use strict';
// The one exit module of every scenario harness (E2.2, plan change 7.1): it removes what the harness made on EVERY way out.
//
// A harness is a script, not a test file, so it has no test hook that closes its folders. The rule (common/test-leftovers.md, section 2)
// asks teardown on every exit path. Four facts of Node and of the helper make a plain `finally` too weak:
//
//   - `process.exit()` ends the process at once. A `finally` around code that calls it never runs;
//   - `cleanupScope().close()` is async. An un-awaited `close()` before `process.exit` removes one folder and leaves the rest;
//   - a signal ends the process at once unless a listener is registered for it;
//   - a listener added with `once` is gone after its first call, so a SECOND signal gets Node's default and ends the process in the
//     middle of the close.
//   - an error nobody caught (a throw or a rejection inside a timer or an event callback) ends the process at once. The module listens
//     for `uncaughtException` (an unhandled rejection arrives there too), writes the error, closes the scope and leaves with 1.
//
// So a harness hands its body to `run(main)` and never calls `process.exit` itself:
//
//   const harnessScope = require('./lib/harnessScope.cjs');
//   harnessScope.run(async (scope) => {
//     const stub = writeStub(scope, 'agent-stub', text);   // a folder is made INSIDE main, through the scope (rule section 2)
//     ...
//     return failures;                                      // the exit code; a number, or nothing for 0
//   });
//
// `run` calls `main(scope)`. A returned number is the exit code. A throw prints the error and is code 1. Then `finish(code)` closes the
// scope, waits for it, and only then calls `process.exit`. A signal calls `finish` too (code 128 + the signal's number). SIGKILL cannot
// be handled: the folder stays claimed, and the next sweep collects it (POSIX only, after 10 minutes; Windows only lists).
//
// This module makes no folder when it is loaded.
const os = require('node:os');
const { cleanupScope } = require('./leftovers.cjs');

/** The module's scope: every folder of the harness is registered here. */
const scope = cleanupScope();

/** Set by the first `finish`. A later call does nothing, and a signal that comes now is ignored. */
let finishing = false;

/** The one close of the scope: every caller of `closeOnce` and of `finish` waits for the same promise. */
let closed;

/** The signals that stop a harness. Handled with `process.on`, never `once`: the listeners stay until the process exits. */
const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'];

/**
 * Close the scope, wait for it, and leave with `code`. The first call does the work; any later call (a second signal, or the end of
 * `main` after a signal) returns at once, so the close is never started twice or cut short.
 */
async function finish(code) {
  if (finishing) return;
  finishing = true;
  await closeOnce();
  process.exit(code);
}

/**
 * Close the scope, at most once: a second call (a harness with its own exit, such as the WSL one, and a signal at the same moment)
 * gets the SAME promise, so it waits for the close that is running and never starts or cuts short another. Never rejects.
 */
function closeOnce() {
  closed ??= scope.close();
  return closed;
}

/**
 * A scope for one section of a harness (the `sshd` sections of `ssh-agent-itest.cjs`). Its close is registered in the module scope at
 * once, so a signal during the section closes it too. `close()` empties its list as it runs, so closing it a second time (the section's
 * own `finally` and then the module) does nothing.
 */
function sectionScope() {
  const section = cleanupScope();
  scope.after(() => section.close());
  return section;
}

function onSignal(name) {
  return () => {
    finish(128 + (os.constants.signals[name] ?? 0)).catch(() => process.exit(1));
  };
}

/** An error nobody caught (a throw or a rejection inside a callback) would end the process at once, with every folder left: write it, close, leave with 1. */
function onUncaught(error) {
  process.stderr.write(`${error?.stack ?? error}\n`);
  finish(1).catch(() => process.exit(1));
}

/** Listen for the three signals and for an uncaught error. `run` does it; a harness that has its own exit (the WSL one) calls it once at the start. */
function handleSignals() {
  for (const name of SIGNALS) process.on(name, onSignal(name));
  process.on('uncaughtException', onUncaught);
}

/**
 * The environment for a child process that may make temp paths: ours, with `TMPDIR`, `TEMP` and `TMP` set to `dir`, an owned folder of the
 * harness (rule section 2). Whatever the child makes then lands inside a folder the scope removes.
 */
function tempEnv(dir, env = process.env) {
  return { ...env, TMPDIR: dir, TEMP: dir, TMP: dir };
}

/** What `main` left as its exit code: a returned whole number, else 0. */
const codeOf = (returned) => (Number.isInteger(returned) ? returned : 0);

/** Run `main(scope)`, then `finish`. The body never calls `process.exit`: it returns its code. */
function run(main) {
  handleSignals();
  (async () => {
    let code;
    try {
      code = codeOf(await main(scope));
    } catch (error) {
      process.stderr.write(`${error?.stack ?? error}\n`);
      code = 1;
    }
    await finish(code);
  })();
}

module.exports = { scope, run, finish, closeOnce, handleSignals, sectionScope, tempEnv };
