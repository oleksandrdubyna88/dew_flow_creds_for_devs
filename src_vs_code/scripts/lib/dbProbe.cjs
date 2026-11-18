'use strict';
// The shared parts of the E1.7 probe harnesses (`bridged-pk1-itest.cjs`, `bridged-ps1-itest.cjs`; the E1.7 spec §S7.2-§S7.4): the way a leg says what it saw, the
// table every harness ends with, the rule that a system-wide write happens on a CI runner only (R3), and the run of one bounded client under the bridged environment (R2).
//
// A probe is a RECORD (R6). A `record (<leg>)` line says what the client did. An `UNMEASURED <leg>` line says that the positive control of the leg was not shown, and why
// (R4): it is never a pass and never a failure. `check` fails only for the rig's own faults: a tool that is missing (named), a server that did not start, a client that never
// reached its receiver. A line that starts `STOP (<leg>)` says that an answer went against the parent's decision for that pair; the run does not fail on it, the lead reads it.
//
// Nothing here prints a credential, a ticket or the text of an answer: a record holds numbers, names of identities and the fixed phrases of the leg. The throwaway words that a
// leg writes into an entry are made by `throwawayWord` at run time and are compared with an answer by the leg that made them, never printed.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const net = require('node:net');
const { launch, endChild } = require('../itestSshd.cjs');

const OUT = path.join(__dirname, '..', '..', 'out');

let failures = 0;
/** The pass or fail line of a rig check; a failure is counted. */
function check(name, ok, detail) {
  console.log(`${ok ? 'ok   ' : 'FAIL '} ${name}`);
  if (!ok) {
    failures += 1;
    if (detail !== undefined) {
      console.log(`       ${String(detail).split('\n').join('\n       ')}`);
    }
  }
}
const failureCount = () => failures;

/** The rows of the end table: `{ leg, control, saw }`. */
const rows = [];

/** One line of what a client did, and a row of the table. `control` is `shown` or `not shown`. */
function record(leg, control, text) {
  console.log(`record (${leg}): ${text}`);
  rows.push({ leg, control, saw: text.slice(0, 160) });
}

/** A leg whose positive control was not shown (R4): the line, and a row. */
function unmeasured(leg, why) {
  console.log(`UNMEASURED ${leg}: ${why}`);
  rows.push({ leg, control: 'not shown', saw: `unmeasured: ${why}`.slice(0, 160) });
}

/** An answer that went against the parent's decision for a pair (R6): a line the lead reads, not a failure. */
function stop(leg, text) {
  console.log(`STOP (${leg}): ${text}`);
  rows.push({ leg, control: 'shown', saw: `STOP: ${text}`.slice(0, 160) });
}

/** The table every harness ends with (R4): the leg, whether its control was shown, and what the client did. */
function printTable(title) {
  console.log(`\n${title}: ${rows.length} line(s), ${rows.filter((row) => row.control === 'not shown').length} unmeasured`);
  for (const row of rows) {
    console.log(`  ${row.control === 'shown' ? 'control shown    ' : 'control NOT shown'}  ${row.leg}: ${row.saw}`);
  }
}

/** Rule R3: a system-wide write (a KDC, `/etc/krb5.conf`, a database service, a file in the runner's profile) only on a CI runner whose step asks for it. */
const systemRig = () => process.env.CI === 'true' && process.env.BRIDGED_DB_SYSTEM_RIG === '1';

/** Rule R5: a word made at run time, which no committed file and no printed line holds. */
const throwawayWord = () => crypto.randomBytes(12).toString('hex');

/** The product's compiled modules the probes build their launches with. A missing `out/` is a rig fault named by the caller. */
const productOf = () => ({
  ...require(path.join(OUT, 'dbCliLauncher.js')),
  ...require(path.join(OUT, 'bridgedSshEnv.js')),
  ...require(path.join(OUT, 'materializedKeys.js')),
});

/**
 * The environment a bridged client gets (rule R2, G5): `bridgedSshEnv` over a source that holds `PATH` and `HOME` and nothing else off Windows, over the real environment on
 * Windows (its allow-list picks the seven names), with the launch's own names added. A name that is not in the allow-list is the builder's refusal, never worked around here.
 */
function bridgedEnv(product, home, launchEnv = {}) {
  if (process.platform === 'win32') {
    return product.bridgedSshEnv(process.env, 'win32', launchEnv);
  }
  return product.bridgedSshEnv({ PATH: process.env.PATH, HOME: home }, process.platform, launchEnv);
}

/** `true` when `promise` settles first, `false` after `ms`; the timer does not outlive the race. */
async function endedWithin(promise, ms) {
  let timer;
  const bound = new Promise((resolve) => {
    timer = setTimeout(resolve, ms, false);
  });
  try {
    return await Promise.race([promise.then(() => true), bound]);
  } finally {
    clearTimeout(timer);
  }
}

/** The client's own words, on one line and clipped. */
const oneLine = (text, limit = 220) => text.replaceAll(/\s*\n\s*/g, ' | ').trim().slice(0, limit);

/**
 * One bounded client run, in a session of its own off Windows (a client that wants a password cannot reach the terminal of this harness). The environment is exactly `env`.
 * `{ ended, code, stdout, stderr }`; a client that did not end in time is killed and says `ended: false`.
 */
async function runClient(scope, exe, args, env, { ms = 25_000 } = {}) {
  const client = launch(scope, exe, args, { env, detached: process.platform !== 'win32', windowsHide: true });
  try {
    const ended = await endedWithin(client.done, ms);
    await endedWithin(client.closed, 2000);
    return { ended, code: client.child.exitCode, stdout: client.stdout, stderr: client.stderr };
  } finally {
    await endChild(client);
  }
}

/** A tool, run to its end for the rig's own work (never for a probe): the answer, or the failure with the tool named. Bounded. */
function rigRun(program, args, options = {}) {
  const answer = spawnSync(program, args, { encoding: 'utf8', timeout: 120_000, windowsHide: true, ...options }); // NOSONAR: an absolute or PATH word chosen by the rig
  if (answer.error !== undefined || answer.status !== 0) {
    const why = answer.error === undefined ? `exit ${answer.status}: ${oneLine(`${answer.stdout ?? ''}\n${answer.stderr ?? ''}`, 300)}` : answer.error.message;
    throw new Error(`rig: ${program} ${args.slice(0, 2).join(' ')} failed — ${why}`);
  }
  return answer.stdout;
}

/** The first of `names` that is a file in one of `folders`, as a path, or `undefined`. */
function findFile(folders, names) {
  for (const folder of folders) {
    for (const name of names) {
      const candidate = path.join(folder, name);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return undefined;
}

/** The whole version line of a client, on the stream it came on, for rule R1. `undefined` when the client does not answer. */
function versionLine(exe, args = ['--version']) {
  try {
    return execFileSync(exe, args, { encoding: 'utf8', timeout: 20_000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim().split(/\r?\n/)[0]; // NOSONAR: a path chosen by the rig
  } catch (error) {
    const said = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim().split(/\r?\n/)[0];
    return said === '' ? undefined : said;
  }
}

/** A free loopback port: bind 0, read it, let go. Racy by nature, which a loopback rig accepts. */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/** Rule R1: what the run is, printed before the first leg. */
function printRun(what, lines) {
  console.log(`${what}: node ${process.version}, ${process.platform} ${process.arch}, CI=${process.env.CI === 'true'}, system rig ${systemRig() ? 'on' : 'off'}`);
  for (const line of lines) {
    console.log(`  ${line}`);
  }
}

/** Waits until `ready()` is true or `ms` pass; `true` when it became true. */
async function waitFor(ready, ms, step = 100) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await ready()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, step));
  }
  return ready();
}

module.exports = {
  check, failureCount, record, unmeasured, stop, printTable, systemRig, throwawayWord, productOf, bridgedEnv, endedWithin, oneLine, runClient, rigRun, findFile, versionLine,
  freePort, printRun, waitFor, rows,
};
