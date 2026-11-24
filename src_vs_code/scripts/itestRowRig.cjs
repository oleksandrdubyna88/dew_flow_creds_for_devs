'use strict';
// THE common rig of the real-road rows of E3 (G1, E3.S4; `todo/PLAN_person_roads_pin_host_key_E3_S4_spec.md`; decisions 15 and 16 of
// `todo/PLAN_person_roads_pin_host_key.md`, its setup built ONCE). Every row-story drives the three roads through this file: the install, the
// bridge and the bridge's socket check, the registered commands of the product, with the real runner, the real bridge spawner, the real pin
// writer, the real asker of the client and the real `resolveExecAuth`. ONLY the `vscode` module is a stand-in there (the lead's answer A1):
// the observers and the gate below call the real runner and pass its answer on, and the vault is data that the world's host answers.
//
// A leg runs in a child Node process of its own (the leg process, §1.2): the real resolve hands `ssh` the PROCESS's environment, so a process
// whose environment is the leg's (the shim first on PATH, `HOME` its own folder) makes every `ssh` of the roads go through the shim and the
// handed client config (F9, F22). Section 10 starts the legs one after another (`runLeg`), reads each leg's lines (`ok`, `FAIL`, `info`,
// `evidence`) and counts every check a leg prints as its own. The rules that count live in `lib/rowRecord.cjs`; the leg-side parts are below.
//
// `runLeg`, `rowsTop` and `legRig` run in section 10's process; everything else runs in the leg process. A row file calls only what this
// file exports, and never starts a counterpart, a world or a server itself. It names no stand-in of the resolve or of the asker.
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { launch, checkedPinOf, setChildTemp, endChild } = require('./itestSshd.cjs');
const { startServingSshd, stopListener, endServer, alive, startOf, descendantsOfListener } = require('./itestServing.cjs');
const { within, runClient, tool, settledAfter } = require('./itestNoSharing.cjs');
const sec = require('./itestPinnedRoads.cjs');
const standIn = require('./itestProbeInstall.cjs');
const harnessScope = require('./lib/harnessScope.cjs');
const rec = require('./lib/rowRecord.cjs');

const me = os.userInfo().username;
/** The limit of one leg process (s 1.2): then SIGTERM to its pid, SIGKILL 10 s later, each only while its start time is the recorded one. */
const LEG_LIMIT_MS = 300_000;
const oneLine = (text) => String(text).replaceAll(/\r?\n/g, ' | ');

// ---------------------------------------------------------------- section 10's process: the legs ---------------------------------------

/** Once per section: the stored key of the rows, and the run's password. Answers `top`, a new object; `undefined` when the key could not be made. */
async function rowsTop(check, base) {
  const storedKey = path.join(base.dir, 'stored_key');
  const failed = await tool('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', storedKey]);
  check('the rows\' stored key was generated', failed === undefined, failed);
  return failed === undefined ? { ...base, storedKey, password: `not-a-password-${crypto.randomUUID()}` } : undefined;
}

/** The rig of one leg, in `<top.dir>/<name>/`: its own shim, records, storage, home, handed client config and `authorized_keys`. */
function legRig(top, name, row, label) {
  const dir = path.join(top.dir, name);
  fs.mkdirSync(dir);
  const rig = { ...sec.rigOf(top.scope, dir, top.out, top.product), k1: top.k1, k2: top.k2, userKey: top.userKey, storedKey: top.storedKey, pin: top.pin, password: top.password, name, row, label, home: path.join(dir, 'home') };
  fs.mkdirSync(rig.home);
  fs.writeFileSync(rig.clientConfig, rec.handedClientConfig(dir));
  fs.writeFileSync(rig.authorizedKeys, `${[rig.userKey, rig.storedKey].map((key) => fs.readFileSync(`${key}.pub`, 'utf8').trim()).join('\n')}\n`);
  rig.real = sec.installShim(rig);
  if (rig.real === undefined) {
    throw new Error('the shim of the leg found no real ssh outside its own folder');
  }
  return rig;
}

/** What the leg process needs of its parent, in `given.json` (mode 0600: it holds the run's password, which is never printed). */
function writeGiven(rig) {
  const { dir, out, row, name, label, k1, k2, userKey, storedKey, pin, password, real } = rig;
  fs.writeFileSync(path.join(dir, 'given.json'), JSON.stringify({ record: 1, dir, out, row, name, label, k1, k2, userKey, storedKey, pin, password, real }), { mode: 0o600 });
}

/** The lines of a leg process's output, read as they come: a check goes to section 10's `check`, anything else is printed as it is. */
function relayOf(check, stream) {
  let rest = '';
  let checks = 0;
  const line = (text) => {
    const read = rec.legLine(text);
    if (read.kind === 'check') {
      checks += 1;
      check(read.name, read.ok, read.detail);
    } else {
      console.log(read.text);
    }
  };
  stream.on('data', (chunk) => {
    const lines = `${rest}${chunk}`.split('\n');
    rest = lines.pop();
    lines.forEach(line);
  });
  return { flush: () => { if (rest !== '') { line(rest); } rest = ''; }, checks: () => checks };
}

/** Ends a leg process that passed its limit, by its pid and only while its start time is the recorded one: SIGTERM, then SIGKILL 10 s later. */
async function endLeg(identity) {
  const signal = (name) => {
    try {
      if (alive(identity)) {
        process.kill(identity.pid, name);
      }
    } catch {
      // it ended between the look and the signal
    }
  };
  signal('SIGTERM');
  if (!(await within(10_000, () => !alive(identity)))) {
    signal('SIGKILL');
    await within(5_000, () => !alive(identity));
  }
}

/** The sockets that a leg's evidence names are removed by their exact paths (a SIGKILL of the leg process cannot strand one). */
function removeSocketsOf(rig) {
  try {
    const evidence = JSON.parse(fs.readFileSync(path.join(rig.dir, 'evidence.json'), 'utf8'));
    (evidence.sockets ?? []).forEach((one) => sec.removeSocket(one.path));
  } catch {
    // no evidence: the leg process never got that far
  }
}

/** One leg, in its own process (s 1.2). `label` heads each check of the leg. */
async function runLeg(check, top, row, name, label = `${row} ${name}`) {
  const rig = legRig(top, name, row, label);
  writeGiven(rig);
  const result = launch(top.scope, process.execPath, [__filename, '--leg', rig.dir], { env: { ...rig.env, HOME: rig.home } });
  const identity = { pid: result.child.pid, start: startOf(result.child.pid) };
  const relay = relayOf(check, result.child.stdout);
  const code = await settledAfter(result.done, LEG_LIMIT_MS);
  if (code === undefined) {
    await endLeg(identity);
  }
  await settledAfter(result.closed, 2_000);
  relay.flush();
  check(`${label}: the leg process ended with 0 within ${LEG_LIMIT_MS / 1000} s, and printed at least one check`, code === 0 && relay.checks() > 0, JSON.stringify({ code: code ?? 'limit', checks: relay.checks(), stderr: result.stderr.trim().split('\n').slice(-6).join(' | ') }));
  removeSocketsOf(rig);
}

// ---------------------------------------------------------------- the leg process ------------------------------------------------------

/** A counterpart's command line of its own: what the leg asked of the serving launcher, with the lines that turn password logins on last (F5). */
async function counterpart(check, leg, name, hostKey, { port, extra = [], passwords = false } = {}) {
  const lines = passwords ? [...extra, ...rec.PASSWORD_LINES] : extra;
  const server = await startServingSshd(leg, name, hostKey, port, lines);
  check(`${leg.label}: ${name} listens: one sshd -D -e at 127.0.0.1, on a port of its own`, server.failure === undefined, server.failure);
  if (server.failure !== undefined) {
    await endChild(server.sshd);
    return undefined;
  }
  Object.assign(server, { name, key: hostKey === leg.k1 ? 'K1' : 'K2', extra: lines, taken: { list: [], error: undefined } });
  // At once, before anything can fail: what it forked is listed first (the scope runs its callbacks in reverse order of registration), then the end.
  leg.scope.after(async () => endServer(server, sec.recordedStarts(leg), await listed(server)));
  return server;
}

/** What a counterpart forked: the list kept when its listener was stopped alone, joined with a fresh one. */
async function listed(server) {
  const fresh = await descendantsOfListener(server);
  return { list: [...server.taken.list, ...fresh.list], error: server.taken.error ?? fresh.error };
}

/** A counterpart and everything it forked, ended; with the check that they are gone. */
async function endCounterpart(check, leg, server, name) {
  const taken = await listed(server);
  const { list, error } = await endServer(server, sec.recordedStarts(leg), taken);
  check(`${leg.label}: ${name} and every process it forked are gone`, server.sshd.exited && error === undefined && !list.some(alive), error ?? JSON.stringify(list.filter(alive)));
}

/** The credential's vault (s 1.3): the only thing that chooses the entry's credential; everything after it is the product's. */
function vaultOf(leg, credential) {
  const vaults = {
    stored: () => ({ privateKey: fs.readFileSync(leg.storedKey, 'utf8') }),
    named: () => ({ keyPath: leg.userKey }),
    password: () => ({ password: leg.password }),
  };
  if (vaults[credential] === undefined) {
    throw new Error(`unknown credential ${JSON.stringify(credential)}; legal: ${Object.keys(vaults).join(', ')}`);
  }
  return vaults[credential]();
}

/** The observer of `./sshExecRunner` (the request that `pinClient` writes): the real runner, its answer unchanged; each `-V` run is timed (C20). */
function observed(runner, questions) {
  return async (argv, options) => {
    if (!rec.isQuestion(argv)) {
      return runner.runSshExec(argv, options);
    }
    const startedAt = performance.now();
    const done = (exitCode) => questions.push({ startedAt, ms: performance.now() - startedAt, exitCode });
    return runner.runSshExec(argv, options).then((outcome) => (done(outcome.exitCode), outcome), (error) => (done(null), Promise.reject(error)));
  };
}

/**
 * The gate (s 1.8): at the FIRST run of each call (a run that names a pin file not seen before) it takes a sample of the folder, which is the call's
 * arrival; with `hold` it then keeps that run from the real runner until the leg releases that pin file. It changes no argv, no environment and no
 * outcome, and a held run cannot time out: the runner's limit starts inside the real runner.
 */
function makeGate(product, sampler, hold) {
  const waiting = new Map();
  const seen = new Set();
  const arrivals = [];
  const wrap = (runner) => ({
    ...runner,
    runSshExec: async (argv, options) => {
      const pin = sec.pinOf(product, argv);
      if (pin !== undefined && !seen.has(pin)) {
        seen.add(pin);
        arrivals.push({ pin, at: sampler.take('call').t });
        if (hold) {
          await new Promise((resolve) => waiting.set(pin, resolve));
        }
      }
      return runner.runSshExec(argv, options);
    },
  });
  const release = (pin) => {
    const resolve = waiting.get(pin);
    waiting.delete(pin);
    resolve?.();
    return resolve !== undefined;
  };
  return { wrap, arrivals, held: () => [...waiting.keys()], waitHeld: (count, ms) => within(ms, () => waiting.size >= count), release, releaseAll: () => [...waiting.keys()].forEach(release) };
}

/** What `<storage>/keys/<pid>/` holds: each name with its SHA-256 and text (in memory only: a stored key is there while a call lives). A file that went away meanwhile is not listed. */
function readFolder(dir) {
  const files = {};
  for (const name of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    try {
      const text = fs.readFileSync(path.join(dir, name), 'utf8');
      files[name] = { sha256: crypto.createHash('sha256').update(text).digest('hex'), text };
    } catch {
      // deleted between the listing and the read
    }
  }
  return files;
}

/** The sampler (s 1.8): the folder of the leg process's calls every 50 ms, and at each named point. */
function makeSampler(leg) {
  const dir = leg.product.materializedKeysDir(leg.storage);
  const samples = [];
  const take = (point) => {
    const sample = { t: performance.now(), point, files: readFolder(dir) };
    samples.push(sample);
    return sample;
  };
  const timer = setInterval(() => take(undefined), 50);
  leg.scope.after(() => clearInterval(timer));
  return { dir, take, samples: () => samples };
}

/** Wraps the product's bridge spawner: records each bridge's argv, spawn and end times and exit code; the child itself is the product's, so `kill` works. */
function recordingSpawner(leg, spawner, bridges, sampler) {
  return (command, argv, env) => {
    const entry = { argv: [...argv], remote: sec.remoteOf(argv), spawnedAt: sampler.take('spawn').t, exitedAt: null, exitCode: null };
    bridges.push(entry);
    if (entry.remote !== undefined) {
      leg.scope.after(() => sec.removeSocket(entry.remote)); // at the spawn, before anything can fail
    }
    const child = spawner(command, argv, env);
    void child.exited.then((code) => Object.assign(entry, { exitedAt: performance.now(), exitCode: code }));
    return child;
  };
}

/**
 * A NEW world of the three roads for the leg (so the asker is cold): the real resolve over the vault, the real asker, the observer of the `-V`
 * runs, the recording spawner, the gate when asked. Answers `roads`: `w` (the world), `outcomes`, `bridges`, `questions`, `gate`, `sampler`, `marks`.
 */
function openRoads(leg, port, { credential, answer, gate = false }) {
  const { product } = leg;
  const questions = [];
  const bridges = [];
  const reported = [];
  const sampler = makeSampler(leg);
  const gateOf = makeGate(product, sampler, gate);
  const spawner = recordingSpawner(leg, product.spawner.bridgeSpawner({ report: (error) => reported.push(String(error)) }), bridges, sampler);
  const opened = sec.openLeg(leg, port, {
    realResolve: true,
    vault: vaultOf(leg, credential),
    realClient: true,
    mocks: { './sshExecRunner': { ...product.runner, runSshExec: observed(product.runner, questions) } },
    runnerOf: gateOf.wrap,
    spawn: spawner,
    ...(answer === undefined ? {} : { answer }),
  });
  leg.scope.after(() => gateOf.releaseAll());
  leg.scope.after(() => opened.w.bridges.dispose());
  leg.roads = { w: opened.w, outcomes: opened.outcomes, bridges, questions, reported, gate: gateOf, sampler, marks: [], credential, state: 'cold', port };
  return leg.roads;
}

/**
 * The `answer` of the install's question: the button that `confirmationFor` names for the probe's answer, for that message only; any other
 * question is dismissed. `held` makes it answer only when the leg calls `answer.release()` (the switch).
 */
function installAnswer(leg, { held = false } = {}) {
  const { product } = leg;
  let release = () => {};
  const gate = held ? new Promise((resolve) => { release = resolve; }) : Promise.resolve();
  const answer = async (message) => {
    const probe = sec.runOf(leg.roads, product.probeCommand());
    const ask = product.confirmationFor(product.interpretProbe(probe?.outcome?.stdout ?? ''), product.world.ROW.node.name);
    if (message !== ask.message) {
      return undefined;
    }
    await gate;
    return ask.action;
  };
  answer.release = () => release();
  return answer;
}

/** One registered command, as a click, bounded: `{ ended, error }` (what `finishes` answers). */
const press = (leg, roads, command, ms) => sec.finishes(leg.product.world.click(roads.w, command), ms);

/** One registered command, started and not waited for: `{ settled, endedAt, error }` fill in as it ends; `settled` is a function. */
function pressNow(leg, roads, command) {
  const click = { startedAt: performance.now(), endedAt: null, error: undefined, settled: () => click.endedAt !== null };
  void leg.product.world.click(roads.w, command).then(() => undefined, (error) => { click.error = String(error?.stack ?? error); }).then(() => { click.endedAt = performance.now(); });
  return click;
}

/** The leg's mark: what the leg's counts start after (s 1.7). */
function mark(leg, roads, servers = []) {
  const one = {
    t: performance.now(), starts: new Set(sec.recordedStarts(leg).map((start) => start.file)), questions: roads.questions.length, outcomes: roads.outcomes.length,
    bridges: roads.bridges.length, said: roads.w.said.length, logs: Object.fromEntries(servers.map((server) => [server.name, server.sshd.stderr.length])),
  };
  roads.marks.push(one);
  return one;
}

const markOf = (roads) => roads.marks.at(-1) ?? { t: 0, starts: new Set(), questions: 0, outcomes: 0, bridges: 0, said: 0, logs: {} };

/** Warm (s 1.7): ONE pinned call to K1 in the same world (its question dismissed), then the mark. Check: it started one question and its probe ran. */
async function warm(check, leg, roads, servers = []) {
  const click = await press(leg, roads, 'installRemoteCli', 30_000);
  const questions = sec.recordedStarts(leg).filter((start) => rec.isQuestion(start.argv));
  const probe = sec.runOf(roads, leg.product.probeCommand());
  check(`${leg.label}: warm: the warming call started ONE question ssh -V and its probe ran`, click.ended && questions.length === 1 && probe?.outcome !== undefined, JSON.stringify({ click, questions: questions.length, probe: probe?.outcome?.exitCode }));
  roads.state = 'warm';
  // The counterparts' logs arrive through a pipe, a moment after the login: the mark waits for each login of the warming call to be in them.
  const logins = sec.recordedStarts(leg).filter((start) => rec.isConnectionStart(start.argv)).length;
  await Promise.all(servers.map((server) => within(3_000, () => rec.logCounts(server.sshd.stderr, me).accepted.length >= logins)));
  await new Promise((resolve) => setTimeout(resolve, 200));
  return mark(leg, roads, servers);
}

/** The kind of a start or a run: `kindOf`, and `mode` for the mode check of any bridge of the leg. */
function kindOfRun(product, argv, remotes) {
  const kind = rec.kindOf(argv, { probe: product.probeCommand(), install: product.installCommand(), sweep: product.sweepCommand(me) });
  return kind === 'other' && remotes.some((remote) => product.modeCheckCommand({ path: remote }) === argv.at(-1)) ? 'mode' : kind;
}

/** The four counts after the mark (s 1.6), per road and per counterpart, with the runs and the bridges' exits. */
function countsOf(leg, roads, servers) {
  const { product } = leg;
  const from = markOf(roads);
  const remotes = roads.bridges.map((one) => one.remote).filter((remote) => remote !== undefined);
  const list = sec.recordedStarts(leg).filter((start) => !from.starts.has(start.file)).map((start) => {
    const kind = kindOfRun(product, start.argv, remotes);
    return { pid: start.pid, start: start.start, kind, road: rec.roadOf(kind) ?? null, whole: start.whole, connection: rec.isConnectionStart(start.argv) };
  });
  const roadCounts = (road) => ({ starts: list.filter((one) => one.road === road).length, connectionStarts: list.filter((one) => one.road === road && one.connection).length });
  return {
    starts: { total: list.length, questions: list.filter((one) => one.kind === 'question').length, connectionStarts: list.filter((one) => one.connection).length, byRoad: { install: roadCounts('install'), bridge: roadCounts('bridge'), check: roadCounts('check') }, list },
    question: roads.questions.slice(from.questions),
    runs: roads.outcomes.slice(from.outcomes).map((one) => {
      const kind = kindOfRun(product, one.argv, remotes);
      return { road: rec.roadOf(kind) ?? null, kind, exitCode: one.outcome?.exitCode ?? null, timedOut: one.outcome?.timedOut ?? null, stderr: one.outcome?.stderr ?? one.error ?? null };
    }),
    bridges: roads.bridges.slice(from.bridges).map((one) => ({ remote: one.remote ?? null, spawnedAt: one.spawnedAt, exitedAt: one.exitedAt, exitCode: one.exitCode })),
    counterparts: servers.map((server) => ({ name: server.name, key: server.key, port: server.port, extra: server.extra, ...rec.logCounts(server.sshd.stderr.slice(from.logs[server.name] ?? 0), me) })),
  };
}

/** The switch (the parent's *the switch*), while the install's question is held open: `from` is ended (`whole`, or `listener` alone), and a new counterpart takes its port. */
async function theSwitch(check, leg, from, { name, hostKey, extra = [], passwords = false, stop }) {
  let stopped;
  if (stop === 'listener') {
    const result = await stopListener(from);
    from.taken = result.taken;
    stopped = result.stopped;
  } else {
    await endCounterpart(check, leg, from, from.name);
    stopped = from.sshd.exited;
  }
  const to = await counterpart(check, leg, name, hostKey, { port: from.port, extra, passwords });
  check(`${leg.label}: the switch: ${from.name} stopped (${stop}) and ${name} listens at its port`, stopped && to !== undefined, JSON.stringify({ stopped, port: from.port }));
  return to;
}

/** A pin file in the leg's folder that holds the host key's line for `[127.0.0.1]:<port>`, and the CHECKED pin of it (a near copy of `pinFor`: `itestFeasibility.cjs` runs its `main` when loaded). */
async function pinFileOf(leg, name, port, keyFile) {
  const { parseHostKey, knownHostsLine } = leg.product;
  const folder = path.join(leg.dir, 'pins');
  fs.mkdirSync(folder, { recursive: true });
  const file = path.join(folder, `known_hosts-${name}`);
  fs.writeFileSync(file, knownHostsLine('127.0.0.1', port, parseHostKey(fs.readFileSync(`${keyFile}.pub`, 'utf8'))));
  return await checkedPinOf(leg.out, file);
}

/** The control client (the parent's setup): the REAL client by its path, never the shim, with E1's words of a checked pin; answers `{ argv, code, stdout, stderr }`. */
async function controlClient(leg, { port, pin, words, command = 'true' }) {
  const { product } = leg;
  const used = words ?? rec.e1Words(product.hostKeyWords(pin), product.argv.withoutSources, product.argv.HOST_KEY_OPTIONS);
  const argv = [...used, '-i', leg.userKey, '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes', '-p', String(port), `${me}@127.0.0.1`, command];
  return { argv, ...(await runClient(leg, leg.clientConfig, argv, leg.env, leg.real)) };
}

/** The calls of the leg (s 1.8): one per DISTINCT pin file of the runs' and the bridges' argvs, with its road, key file, `from` and `to` (`to` is `null` while it lives). */
function callsOf(leg, roads, product) {
  const keys = product.materializedKeysDir(leg.storage);
  const remotes = roads.bridges.map((one) => one.remote).filter((remote) => remote !== undefined);
  const arrived = new Map(roads.gate.arrivals.map((one) => [one.pin, one.at]));
  const items = [
    ...roads.outcomes.map((one) => ({ argv: one.argv, from: one.startedAt, to: one.endedAt, road: rec.roadOf(kindOfRun(product, one.argv, remotes)) })),
    ...roads.bridges.map((one) => ({ argv: one.argv, from: one.spawnedAt, to: one.exitedAt, road: 'bridge' })),
  ].map((one) => ({ ...one, pin: sec.pinOf(product, one.argv) })).filter((one) => one.pin !== undefined);
  const calls = new Map();
  for (const one of items) {
    const key = one.argv.includes('-i') ? one.argv[one.argv.indexOf('-i') + 1] : undefined;
    const kept = calls.get(one.pin) ?? { pin: one.pin, keyFile: undefined, road: one.road, from: arrived.get(one.pin) ?? one.from, to: one.to, runs: 0 };
    calls.set(one.pin, { ...kept, keyFile: key?.startsWith(`${keys}${path.sep}`) ? key : kept.keyFile, from: Math.min(kept.from, one.from), to: one.to === null || kept.to === null ? null : Math.max(kept.to, one.to), runs: kept.runs + 1 });
  }
  return [...calls.values()].sort((a, b) => a.from - b.from);
}

const inLife = (call, sample) => sample.t >= call.from && (call.to === null || sample.t <= call.to);
const nameOf = (file) => path.basename(file);
/** The files a call owns: its pin file, and its key file when it wrote one. */
const ownedBy = (call) => [call.pin, call.keyFile].filter((file) => file !== undefined);
/** The names of a call's files that a sample does NOT hold. */
const missingIn = (sample, call) => ownedBy(call).map(nameOf).filter((name) => sample.files[name] === undefined);
/** Whether a sample holds any file of the call. */
const holdsAny = (sample, call) => ownedBy(call).some((file) => sample.files[nameOf(file)] !== undefined);
/** The files of a call that a sample holds with other bytes than `expected` names (the pin file: the saved key's line; the key file: the stored key). */
const otherBytes = (sample, call, expected) => [[call.pin, expected.pinLine], [call.keyFile, expected.keyText]]
  .filter(([file, text]) => file !== undefined && text !== undefined && sample.files[nameOf(file)] !== undefined && !sample.files[nameOf(file)].text.includes(text)).map(([file]) => nameOf(file));

/** At each named point: the calls that had ended have no file, and every other call has its files with their bytes. Answers what is wrong. */
function pointsWrong(samples, calls, expected) {
  return (expected.points ?? []).flatMap(({ point, ended }) => {
    const sample = samples.find((one) => one.point === point);
    if (sample === undefined) {
      return [`${point}: no sample`];
    }
    const done = calls.filter((call) => call.to !== null && call.to < sample.t);
    const live = calls.filter((call) => call.from <= sample.t && !done.includes(call));
    return [
      ...(done.length < ended ? [`${point}: ${done.length} calls had ended, ${ended} expected`] : []),
      ...done.filter((call) => holdsAny(sample, call)).map((call) => `${point}: the ended call ${nameOf(call.pin)} still has a file`),
      ...live.filter((call) => missingIn(sample, call).length > 0 || otherBytes(sample, call, expected).length > 0).map((call) => `${point}: the live call ${nameOf(call.pin)} lacks a file or its bytes`),
    ];
  });
}

/**
 * The file checks of M6 over the samples (s 7.3): M6.4 each call's own files are there with the SAME bytes while it lives (the pin file holds
 * `expected.pinLine`, a key file `expected.keyText`; no two calls share a file); M6.5 a sample within 5 s after its end holds neither file, and no
 * later sample holds them; M6.6 at each named point the calls that ended have no file and the others have theirs; M6.7 `expected.knownHosts`
 * (`{ name, sha256 }`: the file that was in the folder before) has its bytes in every sample.
 */
function callFilesHold(check, label, leg, roads, calls, expected) {
  const samples = roads.sampler.samples();
  const wrong = calls.flatMap((call) => {
    const living = samples.filter((sample) => inLife(call, sample));
    const hashes = new Set(living.map((sample) => sample.files[nameOf(call.pin)]?.sha256));
    const bad = living.filter((sample) => missingIn(sample, call).length + otherBytes(sample, call, expected).length > 0).length;
    return living.length === 0 || hashes.size !== 1 || bad > 0 ? [{ call: nameOf(call.pin), samples: living.length, differentBytes: hashes.size, samplesWithAFaultyFile: bad }] : [];
  });
  const keyFiles = calls.map((call) => call.keyFile).filter((file) => file !== undefined);
  check(`${label}: each call's own files are there with their bytes while it lives: the pin file holds the saved key's line, a stored key's file its key, and no two calls share a file (M6.4)`, wrong.length === 0 && new Set(keyFiles).size === keyFiles.length, JSON.stringify(wrong));
  const ended = calls.filter((call) => call.to !== null);
  const firstGone = (call) => samples.find((sample) => sample.t > call.to && !holdsAny(sample, call));
  const slow = ended.filter((call) => firstGone(call) === undefined || firstGone(call).t > call.to + 5_000).map((call) => nameOf(call.pin));
  const stayed = ended.filter((call) => firstGone(call) !== undefined && samples.some((sample) => sample.t > firstGone(call).t && holdsAny(sample, call))).map((call) => nameOf(call.pin));
  check(`${label}: at each call's end its own files are gone: a sample within 5 s after the end holds neither file, and no later sample holds them (M6.5)`, ended.length === calls.length && slow.length === 0 && stayed.length === 0, JSON.stringify({ calls: calls.length, ended: ended.length, notGoneWithin5s: slow, comeBack: stayed }));
  const wrongPoints = pointsWrong(samples, calls, expected);
  check(`${label}: at each point where a call ended, its own files are gone and every other call's files are there with their bytes (M6.6)`, wrongPoints.length === 0, JSON.stringify(wrongPoints));
  const kept = expected.knownHosts;
  const changed = samples.filter((sample) => sample.files[kept.name]?.sha256 !== kept.sha256).length;
  check(`${label}: ${kept.name} has its bytes in every sample (M6.7)`, samples.length > 0 && changed === 0, JSON.stringify({ samples: samples.length, different: changed }));
}

/** What `ss -lx` lists as listening now (the product's own liveness test of a bridge socket, `sweepCommand`), or `null` when `ss` could not be run. */
function listeningNow() {
  // The PATH lookup of `ss` is on purpose, as `ps` of the end of a server: the machine's own.
  return new Promise((resolve) => execFile('ss', ['-lx'], { timeout: 5_000 }, (error, stdout) => resolve(error ? null : String(stdout)))); // NOSONAR: a CI rig
}

/**
 * After the last end (5 s): none of these calls' files in the folder, no client of the leg alive; what else the folder holds is listed (M6.9, M6.10).
 * With `sockets` (a row whose criterion asks it: M6.11) also: no bridge's socket is left. Every leg that opened a bridge also records, as info only and
 * judging nothing, (a) whether each bridge's socket FILE exists after the last end and (b) whether anything listens on it (`ss -lx`).
 */
async function nothingLeft(check, label, leg, roads, calls, { sockets: judged = false } = {}) {
  const names = calls.flatMap((call) => [call.pin, call.keyFile]).filter((file) => file !== undefined).map(nameOf);
  const dir = roads.sampler.dir;
  const left = () => Object.keys(readFolder(dir)).filter((name) => names.includes(name));
  const gone = await within(5_000, () => left().length === 0);
  roads.sampler.take('after the last end'); // a sample after the last end, so M6.5 has one to read
  check(`${label}: after the last end: 0 files of these calls in keys/<pid>/ (5 s)`, gone, JSON.stringify(left()));
  Object.entries(readFolder(dir)).forEach(([name, file]) => console.log(`info  ${label}: the folder also holds ${name} (sha256 ${file.sha256}), which no call owns`));
  const clients = sec.recordedStarts(leg);
  const living = await within(5_000, () => !clients.some(alive)).then((none) => (none ? [] : clients.filter(alive).map((one) => one.pid)));
  check(`${label}: after the last end: 0 client processes alive, by the recorded pids and start times (${clients.length} recorded)`, clients.length > 0 && living.length === 0, JSON.stringify(living));
  const sockets = roads.bridges.map((one) => one.remote).filter((remote) => remote !== undefined);
  if (judged) {
    const stranded = await within(5_000, () => !sockets.some(sec.isSocket)).then((none) => (none ? [] : sockets.filter(sec.isSocket)));
    check(`${label}: after the last end: no forwarded socket is left (${sockets.length} bridge sockets named) (M6.11)`, stranded.length === 0, JSON.stringify(stranded));
  }
  const listening = sockets.length === 0 ? '' : await listeningNow();
  sockets.forEach((remote) => console.log(`info  ${label}: bridge socket ${path.basename(remote)} after the last end: (a) the file ${sec.isSocket(remote) ? 'exists' : 'is gone'}; (b) ${listening === null ? 'ss -lx could not be run' : listening.includes(remote) ? 'something listens on it' : 'nothing listens on it'}`));
}

/** No message and no log line after the mark holds a sentence of §3.5 (read from the product's functions). */
function noSentence(check, label, leg, roads) {
  const { product } = leg;
  const sentences = rec.sentencesOf(product, product.world.ROW.node.name);
  const shown = roads.w.said.slice(markOf(roads).said).filter((one) => rec.saysASentence(one.text, sentences));
  check(`${label}: no message and no log line holds a sentence of §3.5 (${sentences.length} sentences: A, B, C, D, E for every kind, F)`, shown.length === 0, JSON.stringify(shown));
}

/** The leg's evidence: ONE `evidence <json>` line and `evidence.json` in the leg's folder. No environment, no password, no key text; a value not read is `null`. */
function evidence(leg, roads, servers, fields = {}) {
  const calls = callsOf(leg, roads, leg.product);
  const last = roads.sampler.samples().at(-1);
  const record = {
    record: 1, row: leg.row, leg: leg.name, state: roads.state, credential: roads.credential, pid: process.pid, ...countsOf(leg, roads, servers), said: roads.w.said,
    calls: calls.map((call) => ({ pin: call.pin, keyFile: call.keyFile ?? null, road: call.road ?? null, from: call.from, to: call.to, samples: roads.sampler.samples().filter((sample) => inLife(call, sample)).length })),
    keysFolder: last === undefined ? null : Object.fromEntries(Object.entries(last.files).map(([name, file]) => [name, file.sha256])),
    sockets: roads.bridges.filter((one) => one.remote !== undefined).map((one) => ({ path: one.remote, left: sec.isSocket(one.remote) })),
    ...fields,
  };
  fs.writeFileSync(path.join(leg.dir, 'evidence.json'), `${JSON.stringify(record)}\n`);
  console.log(`evidence ${JSON.stringify(record)}`);
  return record;
}

// ---------------------------------------------------------------- the entry of a leg process -------------------------------------------

/** The files of the rows by their names: loaded when a leg of that row runs (the row files load this one). */
const ROW_FILES = { M1: () => require('./itestRowM1.cjs'), M6: () => require('./itestRowM6.cjs'), rig: () => require('./itestRigProof.cjs') };

/** The rig of the leg, rebuilt in the leg process from `given.json` (the parent made the folder). */
function legFromGiven(given, scope) {
  const { dir } = given;
  return {
    ...given, scope, env: { ...process.env }, shimDir: path.join(dir, 'shim'), product: sec.productOf(given.out), records: path.join(dir, 'records'), storage: path.join(dir, 'storage'),
    clientConfig: path.join(dir, 'client_config'), authorizedKeys: path.join(dir, 'authorized_keys'), home: path.join(dir, 'home'),
  };
}

/** One leg, in this process: its environment is checked first (BR14), then the leg of the row runs with a `ctx`. Answers the exit code: 0 unless the leg threw. */
async function legMain(folder) {
  const given = JSON.parse(fs.readFileSync(path.join(folder, 'given.json'), 'utf8'));
  const section = harnessScope.sectionScope();
  const leg = legFromGiven(given, section);
  setChildTemp(leg.dir);
  const check = (name, ok, detail) => console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || detail === undefined ? '' : ` — ${oneLine(detail)}`}`);
  try {
    const here = process.env.PATH?.startsWith(`${leg.shimDir}${path.delimiter}`) === true && process.env.HOME === leg.home;
    check(`${leg.label}: the leg process: PATH starts with the leg's shim folder, and HOME is the leg's home folder`, here, JSON.stringify({ path: process.env.PATH?.split(path.delimiter)[0], home: process.env.HOME }));
    if (!here) {
      return 1;
    }
    await ROW_FILES[given.row]().legs[given.name]({ check, info: (text) => console.log(`info  ${text}`), rig: leg, product: leg.product, real: leg.real, password: leg.password });
    return 0;
  } catch (error) {
    check(`${leg.label}: the leg ran to its end`, false, String(error?.stack ?? error));
    return 1;
  } finally {
    await section.close();
  }
}

module.exports = {
  runLeg, rowsTop, legRig, counterpart, endCounterpart, openRoads, installAnswer, press, pressNow, warm, mark, markOf, countsOf, theSwitch, pinFileOf, controlClient, callsOf, callFilesHold, nothingLeft, noSentence, evidence,
  // what a row reads of section 10's helpers and of the stand-in of the install, so a row imports this file and no other of E3.S4
  sec, standIn, me, readFolder, within, tool, alive,
};

// The entry of a leg process: AFTER the exports, because the row file that the leg loads requires this file, and would get an empty object while this one is still loading.
if (require.main === module) {
  if (process.argv[2] === '--leg' && process.argv[3] !== undefined) {
    harnessScope.run(() => legMain(process.argv[3]));
  } else {
    console.error('usage: node itestRowRig.cjs --leg <the leg folder>');
    process.exitCode = 2;
  }
}
