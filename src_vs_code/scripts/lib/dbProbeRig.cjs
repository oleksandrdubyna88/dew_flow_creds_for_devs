'use strict';
// The shared part of the database probe harnesses of E1.7 (the spec `todo/PLAN_remote_bridge_scoped_E1_S7_spec.md` §S7.3, rules R1-R6): the product's
// own launch and environment, one client run under the bridged environment, the files a program word is, and the ledger every probe ends with.
//
// A probe is a RECORD. It prints what the client did, each beside its positive control, and it fails only for the rig's own faults (a missing tool, a
// listener the client never reached). `record (<leg>)` lines are the result. `UNMEASURED <leg>: <what was missing>` says that a positive control could
// not be produced (R4): it is not a pass, and it is counted in the ledger the harness ends with. A line that starts `STOP (<leg>)` says that an answer
// went against the spec's decision (R6).
//
// Nothing here logs the text of a password, and nothing is named for one: a credential of a rig is made at run time and is handed to a child by its
// environment, and a log line holds a fixed phrase (R5).
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawnSync } = require('node:child_process');
const { launch, endChild } = require('../itestSshd.cjs');
const { check, failureCount } = require('./psqlCheck.cjs');

const OUT = path.join(__dirname, '..', '..', 'out');
const IS_WINDOWS = process.platform === 'win32';

/** The product's own launch builder, bridged environment and absent-file path, from `out/`. */
function loadProduct() {
  return {
    ...require(path.join(OUT, 'dbCliLauncher.js')),
    ...require(path.join(OUT, 'bridgedSshEnv.js')),
    ...require(path.join(OUT, 'materializedKeys.js')),
  };
}

/** The environment a bridged client gets (rule R2): `PATH` and `HOME` (the seven names on Windows) and the names the launch adds, never the harness's own. */
const bridgedEnv = (product, home, extra = {}) => product.bridgedSshEnv({ PATH: process.env.PATH, HOME: home }, process.platform, extra);

/** One client, run to its end under `env`, bounded. The answer is what the client printed; a client that could not start is a code that says so. */
function runSync(exe, args, env, timeoutMs = 20_000) {
  const answer = spawnSync(exe, args, { env, encoding: 'utf8', timeout: timeoutMs, windowsHide: true }); // NOSONAR: an absolute path chosen by the rig, with an argument list and no shell
  const code = answer.error === undefined ? answer.status : `spawn error ${answer.error.code ?? answer.error.message}`;
  return { code, stdout: answer.stdout ?? '', stderr: answer.stderr ?? '', text: `${answer.stdout ?? ''}${answer.stderr ?? ''}` };
}

/** Text on one line, clipped: for the record lines. */
const oneLine = (text, limit = 200) => text.trim().replaceAll(/\s*\r?\n\s*/g, ' | ').slice(0, limit); // NOSONAR: a client's own words, clipped

/** The first non-empty line of `text`. */
const firstLine = (text) => text.split(/\r?\n/).find((line) => line.trim() !== '')?.trim() ?? '';

/** What a version line holds after the version itself (N16): the package, the system, the distribution's words. */
function buildTagOf(line) {
  const found = /\d+(?:\.\d+)+/.exec(line); // NOSONAR: a version line of one client
  return found === null ? line : line.slice(found.index + found[0].length).trim();
}

/** The first file a bare program word is on `searchPath`, or `undefined`: only an absolute folder counts, and on Windows an `.exe` or `.cmd` of that name. */
function resolveProgram(word, searchPath = process.env.PATH ?? '') {
  const names = IS_WINDOWS ? [`${word}.exe`, `${word}.cmd`, word] : [word];
  for (const folder of searchPath.split(path.delimiter)) {
    if (!path.isAbsolute(folder)) {
      continue;
    }
    for (const name of names) {
      const file = path.join(folder, name);
      if (fs.existsSync(file) && fs.statSync(file).isFile()) {
        return file;
      }
    }
  }
  return undefined;
}

/** What a file is, in words: its real path, whether it is a script (its first two bytes), its size. */
function describeFile(file) {
  const real = fs.realpathSync(file);
  const head = Buffer.alloc(2);
  const handle = fs.openSync(real, 'r');
  try {
    fs.readSync(handle, head, 0, 2, 0);
  } finally {
    fs.closeSync(handle);
  }
  return { real, script: head.toString('latin1') === '#!', bytes: fs.statSync(real).size };
}

/** Waits `ms`. */
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A listener on the loopback that holds every connection it gets and never answers: `state.connections` counts them; `state.first` is the first bytes of the first one. */
async function holdingListener() {
  const state = { connections: 0, first: undefined };
  const open = new Set();
  const server = net.createServer((socket) => {
    state.connections += 1;
    open.add(socket);
    socket.on('error', () => undefined);
    socket.once('close', () => open.delete(socket));
    socket.once('data', (chunk) => {
      state.first ??= chunk;
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const close = () => {
    for (const socket of open) {
      socket.destroy();
    }
    return new Promise((resolve) => server.close(resolve));
  };
  return { state, port: server.address().port, close };
}

/**
 * One client run against a listener that holds its connection: did it get as far as connecting (it read every flag), and what did it say? The client is ended by the
 * rig as soon as it has connected, or after ten seconds. `argsFor(port)` is the client's arguments.
 */
async function reachedRun(scope, exe, argsFor, env) {
  const listener = await holdingListener();
  const child = launch(scope, exe, argsFor(listener.port), { env });
  try {
    for (let waited = 0; waited < 10_000 && listener.state.connections === 0 && !child.exited; waited += 100) {
      await pause(100);
    }
    await pause(100);
    const reached = listener.state.connections > 0;
    return { reached, code: child.exited ? child.child.exitCode : 'still running (ended by the rig)', said: oneLine(child.stderr + child.stdout, 200) };
  } finally {
    await endChild(child);
    await listener.close();
  }
}

/** The ledger of R4: each leg, whether its positive control was shown, and what the client did. */
const ledger = [];

/** Notes a leg in the ledger. */
function noteLeg(leg, controlShown, did) {
  ledger.push({ leg, controlShown, did });
}

/** A leg whose positive control could not be produced (R4). */
function unmeasured(leg, missing) {
  console.log(`UNMEASURED ${leg}: ${missing}`);
  noteLeg(leg, false, 'unmeasured');
}

/** A line that says an answer went against the spec's decision (R6). */
function stop(leg, why) {
  console.log(`STOP (${leg}): ${why}`);
}

/** R1: what a probe ran, before it prints anything about a client. */
function announce(name, exe, versionLine) {
  console.log(`record (R1) ${name}: ${exe}: ${versionLine ?? 'no version answer'}; node ${process.version}; ${process.platform}/${process.arch}`);
}

/** The ledger as a table, then the pass line. Returns the harness's exit code. */
function finish(harnessName) {
  console.log('\nlegs (R4): leg | control | what the client did');
  for (const entry of ledger) {
    console.log(`  ${entry.leg} | ${entry.controlShown ? 'control shown' : 'control NOT shown'} | ${entry.did}`);
  }
  const failures = failureCount();
  console.log(failures === 0 ? `\nall ${harnessName} checks passed` : `\n${failures} check(s) failed`);
  return failures === 0 ? 0 : 1;
}

/** R3: a leg writes anything system-wide only on a CI runner whose step says so. */
const mayWriteSystem = () => process.env.CI === 'true' && process.env.BRIDGED_DB_SYSTEM_RIG === '1';

module.exports = {
  IS_WINDOWS, OUT, check, loadProduct, bridgedEnv, runSync, oneLine, firstLine, buildTagOf, resolveProgram, describeFile,
  pause, holdingListener, reachedRun, noteLeg, unmeasured, stop, announce, finish, mayWriteSystem,
};
