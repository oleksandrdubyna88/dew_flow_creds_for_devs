'use strict';
// The feasibility probes of G1 (E3.S3, `todo/PLAN_person_roads_pin_host_key_E3_S3_spec.md`; decision 18 of
// `todo/PLAN_person_roads_pin_host_key.md`): before any row of E3 is built, each instrument that is not known to work is asked, through the
// committed instrument of E3.S2 (`lib/sshdRun.cjs`, `itestServing.cjs`, `itestIdentities.cjs`), from a tree with no modified tracked file,
// whether it can show what its rows need. A probe is NOT a row: it measures no pass criterion, and what it sees is "seen when it was probed".
//
//   node --import ./scripts/lower-priority.mjs scripts/itestFeasibility.cjs <probe>...
//
// The probes: `windows-client` (P5), `never-answers` (P7), `forced-zero` (P6), `jump-config` (P4), `install-stand-in` (P1), `older-client` (P3; it needs
// `CREDS_ITEST_OLD_SSH_DEBS`, the folder of its two packages), `resolver` (P2; the host part starts a `wslc` container, and `--inside` is the part that runs
// in it). An unknown name ends at once with exit 2 and names the legal ones. Each probe prints its checks (`ok`, `FAIL`; `info` is recorded and decides nothing), its record
// of identities, and ONE last line: `probe <name>: worked`, or `probe <name>: FAILED — <its first failed check>`. The exit code is 0 when every
// probe that ran printed `worked`, and 1 otherwise. One section scope and one owned folder per probe (`ownedDir` under `shortSocketRoot()`).
//
// What this file gives each probe (its `ctx`): the checks, an `execFile` with a time limit, one counterpart started by the serving launcher
// and its end, the pin words of a counterpart, the two records of identities, and the small readers of an `sshd` log. Linux only.
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { setChildTemp, endChild, checkedPinOf } = require('./itestSshd.cjs');
const { startServingSshd, endServer, alive, descendantsOfListener } = require('./itestServing.cjs');
const { recordIdentities, identitiesOf } = require('./itestIdentities.cjs');
const { recordedStarts } = require('./itestPinnedRoads.cjs');
const { ownedDir, shortSocketRoot } = require('./lib/leftovers.cjs');
const harnessScope = require('./lib/harnessScope.cjs');
const { probeWindowsClient } = require('./itestProbeWindows.cjs');
const { probeNeverAnswers } = require('./itestProbeNeverAnswers.cjs');
const { probeForcedZero } = require('./itestProbeForced.cjs');
const { probeJumpConfig } = require('./itestProbeJump.cjs');
const { probeInstallStandIn } = require('./itestProbeInstall.cjs');
const { probeOlderClient } = require('./itestProbeOlderClient.cjs');
const { probeResolver } = require('./itestProbeResolver.cjs');

const OUT = path.join(__dirname, '..', 'out');
const me = os.userInfo().username;
const HEX40 = /^[0-9a-f]{40}$/;

/** The probes by their names on the command line: the five of batch A in the brief's order, then `older-client` (P3) and `resolver` (P2; with `--inside` it is the part that runs in
// the container, started by the host part). */
const PROBES = {
  'windows-client': probeWindowsClient,
  'never-answers': probeNeverAnswers,
  'forced-zero': probeForcedZero,
  'jump-config': probeJumpConfig,
  'install-stand-in': probeInstallStandIn,
  'older-client': probeOlderClient,
  resolver: probeResolver,
};

/** The SHA-256 of a file's bytes, or `null` (absent is not zero, and not the empty text). */
function sha256Of(file) {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  } catch {
    return null;
  }
}

/** The check of one probe: it prints as `ssh-agent-itest.cjs` does, and keeps the name of the FIRST one that failed. */
function checkOf(state) {
  return (name, ok, detail) => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || detail === undefined ? '' : ` — ${detail}`}`);
    if (!ok) {
      state.failed ??= name;
    }
  };
}

/**
 * One program with `args`, bounded: `{ code, signal, timedOut, stdout, stderr }`; `code` is `null` when the program was ended by a signal.
 * Its stdin is closed at once. Never rejects. `execFile` and no shell: the argv stays separate arguments.
 */
function run(program, args, { env = process.env, timeoutMs = 20_000 } = {}) {
  return new Promise((resolve) => {
    // The program is the probe's own choice (a shim, an unpacked client, the owner's Windows ssh.exe): a CI rig, not a product call.
    const child = execFile(program, args, { env, timeout: timeoutMs, encoding: 'utf8' }, (error, stdout, stderr) => { // NOSONAR: a CI rig
      resolve({
        code: error ? (typeof error.code === 'number' ? error.code : null) : 0,
        signal: error?.signal ?? null,
        timedOut: error?.killed === true && error?.signal !== null,
        stdout: String(stdout),
        stderr: `${stderr}${error && typeof error.code !== 'number' && error.code !== undefined ? `\n${String(error)}` : ''}`,
      });
    });
    child.stdin?.end();
  });
}

/** The ssh argv of a login of the rig: the words, the user key, no prompt, the port, the destination and the command. */
const clientArgv = (rig, words, port, command) => [
  ...words, '-i', rig.userKey, '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes', '-p', String(port), `${me}@127.0.0.1`, command,
];

/** The clients the shim recorded, as `{ pid, start }`: what `endServer` ends by pid and start time while they still run. */
const clientsOf = (rig) => recordedStarts(rig).map((one) => ({ pid: one.pid, start: one.start }));

/** How many times `text` holds `pattern` (a source, no flags). */
const countOf = (text, pattern) => (text.match(new RegExp(pattern, 'g')) ?? []).length;
/** The accepted logins of this run's user in an `sshd` log. */
const acceptedIn = (log) => countOf(log, `Accepted publickey for ${me.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)} from 127\\.0\\.0\\.1`);
/** The connections an `sshd` log shows (a VERBOSE line: `Connection from 127.0.0.1 port N on 127.0.0.1 port <its port>`). */
const connectionsIn = (log, port) => countOf(log, `Connection from 127\\.0\\.0\\.1 port \\d+ on 127\\.0\\.0\\.1 port ${port}`);
/** Lets the output of an `sshd` reach its pipe: a log is read a moment after the client ended. */
const settle = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One counterpart: `startServingSshd` (the instrument of E3.S2; `extra` is the only way a probe adds a line), its end registered with the probe's
 * scope at once (what it forked is listed FIRST, then `endServer`), and the check that it listens. `undefined` when it did not start.
 */
async function serve(ctx, rig, name, hostKey, extra = []) {
  const server = await startServingSshd(rig, name, hostKey, undefined, extra);
  ctx.check(`${name} listens: one sshd -D -e at 127.0.0.1, on a port of its own`, server.failure === undefined, server.failure);
  if (server.failure !== undefined) {
    await endChild(server.sshd);
    return undefined;
  }
  ctx.section.after(async () => {
    const taken = await descendantsOfListener(server);
    await endServer(server, clientsOf(rig), taken);
  });
  return server;
}

/** The end of a counterpart, by `endServer`, with the check that it and everything it forked are gone. */
async function stopServing(ctx, rig, server, name) {
  const taken = await descendantsOfListener(server);
  const { list, error } = await endServer(server, clientsOf(rig), taken);
  ctx.check(`${name} and every process it forked are gone`, server.sshd.exited && error === undefined && !list.some(alive), error ?? JSON.stringify(list.filter(alive)));
}

/** The pin of a counterpart for the words of a login: a file holding the host key's line for `[127.0.0.1]:<port>`, then the CHECKED pin of it. */
async function pinFor(rig, name, port, keyFile) {
  const { parseHostKey, knownHostsLine } = rig.product;
  const folder = path.join(rig.dir, 'pins');
  fs.mkdirSync(folder, { recursive: true });
  const file = path.join(folder, `known_hosts-${name}`);
  fs.writeFileSync(file, knownHostsLine('127.0.0.1', port, parseHostKey(fs.readFileSync(`${keyFile}.pub`, 'utf8'))));
  return checkedPinOf(OUT, file);
}

/** One entry of `probe.executables`: a value that could not be read is `null`. */
const executableOf = (role, file, version = null) => ({ role, path: file ?? null, version, sha256: file === undefined ? null : sha256Of(file) });

/** The probe's own record is whole: every executable and every config has its SHA-256. */
function wholeProbe(check, probe) {
  const ok = probe.executables.every((one) => typeof one.sha256 === 'string' && typeof one.path === 'string') && probe.configs.every((one) => typeof one.sha256 === 'string');
  check('the probe\'s own record is whole: every executable it names has its path and SHA-256, and every config its SHA-256', ok, JSON.stringify(probe));
}

/** The two checks of the record that need `git`: the image of P2 has none, so inside its container they are answered on the host and shown as `info`. */
const NEEDS_GIT = ['the run is a run of its commit', 'the record names the commit'];

/** `ctx.check`, or inside the container of P2 (`--inside`) the same with R1 and R2 turned into `info` lines (the host part answers them from the same commit). */
function insideAware(ctx) {
  return ctx.flags.includes('--inside')
    ? (name, ok, detail) => (NEEDS_GIT.some((start) => name.startsWith(start)) ? ctx.info(`${name}: answered on the host, the image has no git (here: ${ok ? 'ok' : 'not answerable'})`) : ctx.check(name, ok, detail))
    : ctx.check;
}

/** A probe that started a counterpart: R1 to R6 of E3.S2, then the probe's own part, written beside it and printed as `probe-record`. */
async function recordWithListener(ctx, rig, real, probe) {
  const record = await recordIdentities(insideAware(ctx), rig, real);
  fs.writeFileSync(path.join(rig.dir, 'identities.json'), `${JSON.stringify({ ...record, probe }, null, 2)}\n`);
  console.log(`probe-record ${JSON.stringify(probe)}`);
  wholeProbe(ctx.check, probe);
}

/** A probe with no counterpart: the record of identities with the probe's part, written and printed as `identities <json>`; R1 and R2 only (R3 to R6 need a listener). */
async function recordWithoutListener(ctx, rig, real, probe) {
  const record = { ...(await identitiesOf(rig, real)), probe };
  fs.writeFileSync(path.join(rig.dir, 'identities.json'), `${JSON.stringify(record, null, 2)}\n`);
  console.log(`identities ${JSON.stringify(record)}`);
  ctx.check('the run is a run of its commit: git status --porcelain --untracked-files=no answered, and it is empty', record.trackedChanges === '', JSON.stringify(record.trackedChanges));
  ctx.check('the record names the commit and the pin of the shared rules (git rev-parse HEAD and HEAD:.agents/conventions)', HEX40.test(record.commit ?? '') && HEX40.test(record.conventions ?? ''), JSON.stringify([record.commit, record.conventions]));
  wholeProbe(ctx.check, probe);
}

/** Runs one probe in a section of its own and says its last line. Answers whether it worked. */
async function runProbe(name, flags) {
  const section = harnessScope.sectionScope();
  const dir = ownedDir(section, 'probe', { parent: shortSocketRoot() });
  setChildTemp(dir);
  const state = { failed: undefined };
  const check = checkOf(state);
  const ctx = {
    name, flags, out: OUT, section, dir, check, info: (text) => console.log(`info  ${text}`), run, pinFor, clientArgv, executableOf, sha256Of,
    accepted: acceptedIn, connections: connectionsIn, settle,
    serve: (...given) => serve(ctx, ...given),
    stopServing: (...given) => stopServing(ctx, ...given),
    recordWithListener: (...given) => recordWithListener(ctx, ...given),
    recordWithoutListener: (...given) => recordWithoutListener(ctx, ...given),
  };
  console.log(`--- probe ${name}`);
  try {
    await PROBES[name](ctx);
  } catch (error) {
    check('the probe ran to its end without an uncaught error', false, String(error?.stack ?? error));
  } finally {
    await section.close();
  }
  check('the probe\'s owned folder is gone after its scope closed', !fs.existsSync(dir), dir);
  console.log(state.failed === undefined ? `probe ${name}: worked` : `probe ${name}: FAILED — ${state.failed}`);
  return state.failed === undefined;
}

/** The flags of the command line: only `--inside`, only with `resolver` alone (the container's own start of P2 runs it). */
const FLAGS = ['--inside'];

async function main() {
  const given = process.argv.slice(2);
  const flags = given.filter((word) => word.startsWith('--'));
  const names = given.filter((word) => !word.startsWith('--'));
  const badFlag = flags.find((flag) => !FLAGS.includes(flag)) ?? (flags.length > 0 && names.join() !== 'resolver' ? '--inside with another probe than resolver' : undefined);
  if (badFlag !== undefined) {
    console.error(`itestFeasibility: ${badFlag} is not allowed; the one flag is ${FLAGS.join(', ')}, and only with the probe resolver alone`);
    return 2;
  }
  const unknown = names.filter((name) => !Object.hasOwn(PROBES, name));
  if (names.length === 0 || unknown.length > 0) {
    console.error(`itestFeasibility: ${names.length === 0 ? 'no probe named' : `unknown probe ${unknown.join(', ')}`}; the probes are: ${Object.keys(PROBES).join(', ')}`);
    return 2;
  }
  if (process.platform !== 'linux') {
    console.error('itestFeasibility: Linux only (the end of a server reads /proc)');
    return 2;
  }
  const worked = [];
  for (const name of names) {
    worked.push(await runProbe(name, flags));
  }
  return worked.every(Boolean) ? 0 : 1;
}

harnessScope.run(main);
