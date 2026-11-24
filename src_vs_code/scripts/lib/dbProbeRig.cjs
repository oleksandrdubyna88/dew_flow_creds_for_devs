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
const os = require('node:os');
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
// As the product builds it (and as `dbProbe.bridgedEnv` does): on Windows from the whole environment, whose system names the bridged list keeps (SYSTEMROOT, PROGRAMDATA, ...); elsewhere PATH and the rig's HOME.
const bridgedEnv = (product, home, extra = {}) => (process.platform === 'win32'
  ? product.bridgedSshEnv(process.env, 'win32', extra)
  : product.bridgedSshEnv({ PATH: process.env.PATH, HOME: home }, process.platform, extra));

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

/**
 * Where each client family's own words put its version: never "the first dotted number of the line" (the first run read `8.4` from the install path of Oracle's client on Windows, and
 * `15.1`, the client protocol number, for MariaDB 10.x; and neither `sqlcmd` has the number on its first line).
 */
const VERSION_WORDS = {
  psql: /\(PostgreSQL\)\s+(\d+(?:\.\d+)*)/, // NOSONAR: a version line of one client
  oracle: /\bVer\s+(\d+(?:\.\d+)+)/, // `mysql  Ver 8.4.13 for Win64`
  mariadb: /\bDistrib\s+(\d+(?:\.\d+)+)|\bfrom\s+(\d+(?:\.\d+)+)-MariaDB/, // `Ver 15.1 Distrib 10.6.23-MariaDB` and `from 11.8.6-MariaDB, client 15.2`
  'go-sqlcmd': /^[ \t]*Version:[ \t]*v?(\d+(?:\.\d+)+)/m, // `Version: v1.10.0`, on the third line of `-?`
  'odbc-sqlcmd': /^[ \t]*Version[ \t]+v?(\d+(?:\.\d+)+)/m, // `Version 18.6.1.1 Linux`, on the second line of `-?`
};

/** The version a client says, read where its family puts it: `{ number, line }` (the line it was read from), or `undefined` when the words hold none. `text` is all that the client printed. */
function versionOfClient(family, text) {
  const pattern = VERSION_WORDS[family];
  const found = pattern === undefined ? null : pattern.exec(text);
  if (found === null) {
    return undefined;
  }
  const at = text.lastIndexOf('\n', found.index) + 1;
  const end = text.indexOf('\n', found.index);
  return { number: found[1] ?? found[2], line: text.slice(at, end < 0 ? text.length : end).trim(), after: text.slice(found.index + found[0].length, end < 0 ? text.length : end).trim() };
}

/** What a version line holds after the version itself (N16): the package, the system, the distribution's words. `family` says where the version is; with none the whole first line is the tag. */
function buildTagOf(line, family) {
  const read = family === undefined ? undefined : versionOfClient(family, line);
  if (read !== undefined) {
    return read.after;
  }
  const found = family === undefined ? /\d+(?:\.\d+)+/.exec(line) : null; // NOSONAR: a version line of one client
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

/**
 * A listener on the loopback that holds every connection it gets and never answers: `state.connections` counts them; `state.first` is the first bytes of the first one;
 * `state.addresses` are the local addresses the clients connected TO (on `0.0.0.0` every `127.x.y.z` reaches it, which tells a host a wrapper chose from the one a string named).
 */
async function holdingListener(bindHost = '127.0.0.1') {
  const state = { connections: 0, first: undefined, addresses: [] };
  const open = new Set();
  const server = net.createServer((socket) => {
    state.connections += 1;
    state.addresses.push(socket.localAddress);
    open.add(socket);
    socket.on('error', () => undefined);
    socket.once('close', () => open.delete(socket));
    // `state.first` gathers the bytes of the first connection (up to 64 KiB): a start-up message can arrive in more than one chunk, and a reader of a field needs all of it.
    socket.on('data', (chunk) => {
      state.firstOwner ??= socket;
      if (state.firstOwner === socket && (state.first?.length ?? 0) < 65_536) {
        state.first = state.first === undefined ? chunk : Buffer.concat([state.first, chunk]);
      }
    });
  });
  await new Promise((resolve) => server.listen(0, bindHost, resolve));
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

/**
 * The runner image a job ran on, in words: GitHub's own names for it (`ImageOS`, `ImageVersion`), the system's name for itself and the kernel. A hosted label such as `ubuntu-latest` moves between
 * two jobs of one run while an image is rolled out (the third run: psql 18.6 and ODBC 18.6 in one job, 18.7 and 18.7 in another), so a row is judged per build and each job says which image it was.
 */
function runnerImage() {
  const parts = [`ImageOS=${process.env.ImageOS ?? 'unset'}`, `ImageVersion=${process.env.ImageVersion ?? 'unset'}`];
  if (!IS_WINDOWS && fs.existsSync('/etc/os-release')) {
    parts.push(`system ${/^PRETTY_NAME="?([^"\n]*)"?/m.exec(fs.readFileSync('/etc/os-release', 'utf8'))?.[1] ?? 'unnamed'}`);
  }
  parts.push(`kernel ${os.release()}`);
  return parts.join('; ');
}

/**
 * Where a client keeps its plugins by the layout of its install (the Windows builds, whose client does not name the folder in its words: `... The specified module could not be found`): MySQL's
 * installer puts `lib\plugin` beside `bin`, a MariaDB layout `lib\mariadb\plugin`, and a portable one `plugin` beside the program. `{ folder, looked }`: the first that exists, and every place tried.
 */
function installPluginFolder(exe) {
  const bin = path.dirname(exe);
  const looked = [path.join(bin, '..', 'lib', 'plugin'), path.join(bin, '..', 'lib', 'mariadb', 'plugin'), path.join(bin, '..', 'plugin'), path.join(bin, 'plugin')].map((place) => path.normalize(place));
  return { folder: looked.find((place) => fs.existsSync(place) && fs.statSync(place).isDirectory()), looked };
}

/** R3: a leg writes anything system-wide only on a CI runner whose step says so. */
const mayWriteSystem = () => process.env.CI === 'true' && process.env.BRIDGED_DB_SYSTEM_RIG === '1';

module.exports = {
  IS_WINDOWS, OUT, check, loadProduct, bridgedEnv, runSync, oneLine, firstLine, buildTagOf, versionOfClient, resolveProgram, describeFile,
  pause, holdingListener, reachedRun, noteLeg, unmeasured, stop, announce, finish, mayWriteSystem, runnerImage, installPluginFolder,
};
