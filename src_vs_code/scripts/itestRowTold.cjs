'use strict';
// What the eleven legs of M5 share (G1, E3.S8; `todo/PLAN_person_roads_pin_host_key_E3_S8_spec.md` section 4): the forced scripts, the listener that never answers, the jump config, the drive of the roads, the
// reading of the screen, and the checks that several legs hold. What the person was told is compared with the product's functions (the sentences) AND with the words that only one sentence holds and the two
// openings of the bridge's message, pinned in `lib/toldRecord.cjs`: a product whose C and D were swapped is red although the shown text equals its own function's answer. A failed witness or control is a named
// FAIL and the leg goes on to its end; a value that was not read is `null`, never read as "nothing was shown". Like every row file this one starts no counterpart, no world and no process itself (the guards read it).
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const rig = require('./itestRowRig.cjs');
const rec = require('./lib/rowRecord.cjs');
const ok = require('./lib/otherKeyRecord.cjs');
const told = require('./lib/toldRecord.cjs');
const pr = require('./lib/pathRecord.cjs');
const shared = require('./itestRowOtherKey.cjs');

const MODE = 'mode';

const { sec, within, me } = rig;
const sha256Of = (text) => crypto.createHash('sha256').update(text).digest('hex');
const CUT = 4096;
const WORDS_OF = { c: told.C_WORDS, d: told.D_WORDS };
const OTHER = { c: 'd', d: 'c' };

/** `<leg>/forced/<kind>.sh` at mode 0700, from the lib's text. Answers `{ file, sha256, extra }`: the `extra` line of the serving launcher. */
function writeForced(leg, kind) {
  const folder = path.join(leg.dir, 'forced');
  fs.mkdirSync(folder, { recursive: true });
  const file = path.join(folder, `${kind}.sh`);
  const text = told.forcedScript(kind);
  fs.writeFileSync(file, text, { mode: 0o700 });
  return { file, sha256: sha256Of(text), extra: [`ForceCommand ${file}`] };
}

/**
 * (d) (section 1.3): a listener of the leg process on 127.0.0.1 that accepts and never sends a byte, and keeps each socket open. `snapshot()` reads the sockets' own counters (`bytesRead`, `bytesWritten`),
 * so a listener that wrote one line shows it. Its close (every socket destroyed, then the server) is registered with the leg's scope at once. Answers `{ port, connections, snapshot, listening, close }`.
 */
async function silentListener(leg) {
  const sockets = [];
  const connections = [];
  const server = net.createServer((socket) => {
    sockets.push(socket);
    connections.push({ at: performance.now(), remotePort: socket.remotePort });
    socket.on('error', () => undefined);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const close = async () => {
    sockets.forEach((socket) => socket.destroy());
    if (server.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
  };
  leg.scope.after(close);
  const snapshot = () => ({ accepted: connections.length, bytesIn: sockets.reduce((sum, one) => sum + one.bytesRead, 0), bytesOut: sockets.reduce((sum, one) => sum + one.bytesWritten, 0) });
  return { port: server.address().port, connections, snapshot, listening: () => server.listening && server.address()?.address === '127.0.0.1', close, sockets: () => sockets.length };
}

/** (f) (section 1.4): `<leg>/jump_known_hosts` (mode 0600) with K2's line for J's port, and the jump config in `leg.clientConfig`. Answers `{ jumpFile, config, sha256 }`. */
function writeJump(leg, jumpPort) {
  const jumpFile = path.join(leg.dir, 'jump_known_hosts');
  fs.writeFileSync(jumpFile, ok.knownHostsLineOf(jumpPort, fs.readFileSync(`${leg.k2}.pub`, 'utf8')), { mode: 0o600 });
  const config = told.jumpConfig(leg.dir, { jumpPort, user: me, identityFile: leg.userKey, jumpKnownHosts: jumpFile });
  fs.writeFileSync(leg.clientConfig, config);
  return { jumpFile, config, sha256: sha256Of(config) };
}

/** Whether a TCP connection to 127.0.0.1:`port` is refused (3 s). `false` for a connection that was made, and for anything else. */
function refusedPort(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const end = (value) => { socket.destroy(); resolve(value); };
    socket.setTimeout(3_000, () => end(false));
    socket.once('connect', () => end(false));
    socket.once('error', (error) => end(error.code === 'ECONNREFUSED'));
  });
}

/** What the real client resolves under the leg's config for `args` (`ssh -G`, no word of a call): `{ code, value(key) }`. */
async function resolvedBy(ctx, args) {
  const said = await rig.viaReal(ctx.rig, ['-G', ...args]);
  return { code: said.code, value: (key) => said.stdout.split('\n').find((line) => line.startsWith(`${key} `))?.slice(key.length + 1) ?? null };
}

/** The kind of a recorded run: the three commands, and `mode` for the mode check of the bridge's socket. */
function kindOfRun(product, argv, remote) {
  const kind = rec.kindOf(argv, { probe: product.probeCommand(), install: product.installCommand(), sweep: product.sweepCommand(me) });
  return kind === 'other' && remote !== undefined && product.modeCheckCommand({ path: remote }) === argv.at(-1) ? 'mode' : kind;
}

/**
 * The drive (section 1.5): the install, the bridge, the bridge's `ssh` ended (when `bridgeEnds`), the mode check's run done, then 2 s. Answers `{ install, bridge, bridgeAt, bridgeEnded, modeRan, asked, times }`: `asked` is
 * how many questions the world held when the install's click ended; `bridgeAt` the time (the clock of `said`) when the bridge's click started; `times` each run's start and end and the bridge's.
 */
async function driveTold(ctx, roads, { bridgeEnds }) {
  const leg = ctx.rig;
  const { product } = ctx;
  const from = rig.markOf(roads);
  const install = await rig.press(leg, roads, 'installRemoteCli', 45_000);
  const asked = roads.w.asked.length - from.asked;
  const bridgeAt = performance.now();
  const bridge = await rig.press(leg, roads, 'openRemoteBridge', 30_000);
  const bridgeEnded = bridgeEnds ? await within(20_000, () => roads.w.ended.includes(product.world.KEY) && !roads.w.bridges.isOpen(product.world.KEY)) : null;
  const remote = roads.bridges[0]?.remote;
  const modeRan = remote !== undefined && (await within(50_000, () => sec.runOf(roads, product.modeCheckCommand({ path: remote })) !== undefined));
  await shared.sleep(2_000);
  const runs = roads.outcomes.slice(from.outcomes).map((one) => ({ kind: kindOfRun(product, one.argv, remote), startedAt: one.startedAt, endedAt: one.endedAt, ms: one.endedAt - one.startedAt }));
  const bridges = roads.bridges.slice(from.bridges).map((one) => ({ spawnedAt: one.spawnedAt, exitedAt: one.exitedAt, ms: one.exitedAt === null ? null : one.exitedAt - one.spawnedAt }));
  return { install, bridge, bridgeAt, bridgeEnded, modeRan, asked, times: { runs, bridges } };
}

/** The told counts of the whole screen after the mark, of the messages before the bridge's click (the install's road) and after it (the bridge's road), with the shown messages, the log lines and the order. */
function screenOf(ctx, roads, bridgeAt) {
  const { product } = ctx;
  const name = product.world.ROW.node.name;
  const words = { c: product.refusedHostKeySentence(name), d: product.unnamedHostKeySentence(name) };
  const from = rig.markOf(roads).said;
  const items = roads.w.said.slice(from);
  const sockets = roads.bridges.map((one) => one.remote).filter((one) => one !== undefined);
  const early = (at) => bridgeAt === undefined || bridgeAt === null || at < bridgeAt;
  return {
    name, words, sockets, bridgeAt,
    all: told.toldOf(roads.w.said, from, words, name),
    install: told.toldOf(items.filter((one) => early(one.at)), 0, words, name),
    bridge: told.toldOf(items.filter((one) => !early(one.at)), 0, words, name),
    shown: told.shownOf(roads.w.said, from),
    logs: told.logsOf(roads.w.said, from, sockets),
    order: items.filter((one) => one.kind !== 'log').map((one) => ({ kind: one.kind, at: one.at })),
  };
}

/** One line for the leg's record: every message after the mark as `<kind> <the first 60 characters>`, in order. */
const orderLine = (screen) => screen.shown.map((one, at) => `${one.kind} ${one.text.slice(0, 60)} (${screen.order[at]?.at.toFixed(0)})`).join(' | ');

/** The count of `which` that a part of the screen holds as a thing to never show: the sentence's three counts, its pinned words and its opening. */
function neverCounts(part, which) {
  const holds = which === 'c' ? { words: part.holds.cWords, opening: part.holds.notOpen } : { words: part.holds.dWords, opening: part.holds.notChecked };
  return { ...part[which], words: holds.words, opening: holds.opening };
}

/** "Sentence `which` once" (M5.a2 and its kin): one message equals the product's sentence, the product's sentence holds the pinned words, nothing holds the OTHER sentence's words, and no message says "did not answer the probe". */
function toldOnce(ctx, label, screen, which, text, id) {
  const all = screen.all;
  const other = which === 'c' ? all.holds.dWords : all.holds.cWords;
  const silent = screen.shown.filter((one) => one.text.includes('did not answer the probe')).length;
  const found = { once: all[which].install, wordsHeld: screen.words[which].includes(WORDS_OF[which]), otherWords: other, didNotAnswer: silent };
  ctx.check(`${label}: ${text} (${id})`, found.once === 1 && found.wordsHeld && found.otherWords === 0 && silent === 0, JSON.stringify({ ...found, shown: screen.shown }));
}

/** "Sentence `which` 0 times" (`which` is `c`, `d` or `both`) over `part` of the screen (`all`, `install` or `bridge`): no message and no log line equals or holds the sentence, its pinned words or its opening. */
function toldNever(ctx, label, screen, which, text, id, part = 'all') {
  const found = (which === 'both' ? ['c', 'd'] : [which]).flatMap((one) => Object.entries(neverCounts(screen[part], one)).filter(([, count]) => count > 0).map(([kind, count]) => `${one}.${kind}=${count}`));
  ctx.check(`${label}: ${text} (${id})`, found.length === 0, JSON.stringify({ found, shown: screen.shown }));
}

/** "Exactly one error message is the bridge's form of `which`": the opening and the product's sentence, holding the pinned words, and no message of the other opening. */
function bridgeForm(ctx, label, screen, which, text, id) {
  const opening = which === 'c' ? told.NOT_OPEN(screen.name) : told.NOT_CHECKED(screen.name);
  const other = which === 'c' ? screen.all.holds.notChecked : screen.all.holds.notOpen;
  const errors = screen.shown.filter((one) => one.kind === 'error' && one.text.startsWith(`The bridge to "${screen.name}"`));
  const form = opening + screen.words[which];
  ctx.check(`${label}: ${text} (${id})`, screen.all[which].bridge === 1 && errors.length === 1 && errors[0].text === form && form.includes(WORDS_OF[which]) && other === 0, JSON.stringify({ errors, count: screen.all[which].bridge, otherOpening: other }));
}

/** M5.a3, M5.f6: no bridged row is left: the bridge's `ssh` ended by itself and the manager holds no open bridge of the entry. */
function noBridgedRow(ctx, label, roads, drive, id) {
  const key = ctx.product.world.KEY;
  ctx.check(`${label}: after Open Remote Bridge no bridged row is left: the bridge's ssh ended by itself and the manager holds no open bridge of the entry (${id})`, drive.bridgeEnded === true && roads.w.ended.includes(key) && !roads.w.bridges.isOpen(key), JSON.stringify({ ended: drive.bridgeEnded, byItself: roads.w.ended.includes(key), open: roads.w.bridges.isOpen(key) }));
}

/** The bridge's own start (the recorded one that has `-N`): `{ pid, start }`, or `undefined`. */
const bridgeStartOf = (leg) => sec.recordedStarts(leg).find((one) => one.argv.includes('-N'));

/** M5.g6, M5.h6: the bridged row stays: the manager holds the entry's bridge open, its `ssh` is alive by its recorded pid and start time, and its forwarded socket exists and something listens on it (`ss -lx`). Answers what was read. */
async function bridgeStays(ctx, label, roads, id) {
  const start = bridgeStartOf(ctx.rig);
  const remote = roads.bridges[0]?.remote;
  const listed = await rig.listeningNow();
  const state = { open: roads.w.bridges.isOpen(ctx.product.world.KEY), alive: start === undefined ? null : rig.alive({ pid: start.pid, start: start.start }), socket: remote === undefined ? null : sec.isSocket(remote), listening: listed === null || remote === undefined ? null : listed.includes(remote) };
  ctx.check(`${label}: the bridged row stays: after that message the manager holds the entry's bridge open, its ssh is alive by its recorded pid and start time, and its forwarded socket exists and something listens on it (ss -lx) (${id})`, state.open && state.alive === true && state.socket === true && state.listening === true, JSON.stringify(state));
  return state;
}

/** `Close Remote Bridge` ended the bridge's `ssh` within 5 s, by its recorded pid and start time (M5.g7, M5.h7). */
async function bridgeCloses(ctx, label, roads, id) {
  const start = bridgeStartOf(ctx.rig);
  const click = await rig.press(ctx.rig, roads, 'closeRemoteBridge', 10_000);
  const gone = start !== undefined && (await within(5_000, () => !rig.alive({ pid: start.pid, start: start.start })));
  ctx.check(`${label}: Close Remote Bridge ended the bridge's ssh within 5 s, by its recorded pid and start time (${id})`, click.ended && gone, JSON.stringify({ click, recorded: start !== undefined }));
}

/** The pin file that a recorded run's argv names (read with the product's `valuesOf` as the harness does, never the product's match), or `null`. */
const pinFileOf = (product, argv) => sec.pinOf(product, argv) ?? null;

/** The shown record of a leg's runs for the evidence: the kind, the exit code, `timedOut`, the stderr cut at 4 kB. */
const runsRecord = (counts) => counts.runs.map((one) => ({ kind: one.kind, exitCode: one.exitCode, timedOut: one.timedOut, stderr: typeof one.stderr === 'string' ? one.stderr.slice(0, CUT) : one.stderr }));

/** The bridge's state at the end of the drive, for the evidence: `{ exitCode, ended, open, alive, socket, listening }`; a value that was not read is `null`. */
async function bridgeRecord(ctx, roads) {
  const start = bridgeStartOf(ctx.rig);
  const entry = roads.bridges[0];
  const remote = entry?.remote;
  const listed = await rig.listeningNow();
  return {
    exitCode: entry?.exitCode ?? null, ended: roads.w.ended.includes(ctx.product.world.KEY), open: roads.w.bridges.isOpen(ctx.product.world.KEY),
    alive: start === undefined ? null : rig.alive({ pid: start.pid, start: start.start }), socket: remote === undefined ? null : sec.isSocket(remote), listening: listed === null || remote === undefined ? null : listed.includes(remote),
  };
}

/** The run of `command` that the roads recorded, and the pin file of its own call from its argv. */
const runWith = (roads, command) => (command === undefined ? undefined : sec.runOf(roads, command));

/** M5.a5, M5.e5: the stderr of the probe and of the mode check each holds the `Offending` line with the pin file of ITS call, read from its recorded argv and printed as ssh prints it. */
function offendingCheck(ctx, label, roads, id) {
  const { product } = ctx;
  const remote = roads.bridges[0]?.remote;
  const read = (run) => {
    const file = run === undefined ? null : pinFileOf(product, run.argv);
    return { file: file === null ? null : path.basename(file), whole: file !== null && pr.offendingNames(run.outcome?.stderr ?? '', file) };
  };
  const found = { probe: read(runWith(roads, product.probeCommand())), mode: read(runWith(roads, remote === undefined ? undefined : product.modeCheckCommand({ path: remote }))) };
  ctx.check(`${label}: the stderr of the probe and of the mode check each holds the Offending line of ssh with the pin file of its own call, as ssh prints it (${id})`, found.probe.whole && found.mode.whole && found.probe.file !== found.mode.file, JSON.stringify(found));
}

/** The bridge's info message `Bridge open to "box".` once after the bridge's click, beside the check's error (M5.a6). */
function bridgeOpenCheck(ctx, label, screen, which, id) {
  const opened = screen.shown.filter((one) => one.kind === 'info' && one.text.startsWith(`Bridge open to "${screen.name}".`)).length;
  ctx.check(`${label}: the screen showed "Bridge open to "${screen.name}"." once after the bridge's click, beside the check's error (${id})`, opened === 1 && screen.all[which].bridge === 1, JSON.stringify({ opened, errors: screen.all[which].bridge }));
}

/** The counterpart's log: a connection for each connection start, 0 accepted logins and 0 authentication attempts (M5.a7, M5.f2's J). */
function reachedNotAuthenticated(ctx, label, counts, at, wanted, id, who) {
  const log = counts.counterparts[at];
  ctx.check(`${label}: ${who} logged a connection for each connection start, 0 accepted logins and 0 authentication attempts (${id})`, wanted > 0 && log.connections >= wanted && log.accepted.length === 0 && log.authAttempts === 0 && !log.lines.some((line) => rec.AUTH_ATTEMPT.test(line)), JSON.stringify({ connectionStarts: wanted, connections: log.connections, accepted: log.accepted, attempts: log.authAttempts }));
}

/** The runs of the three kinds that a forced leg reads: `{ probe, sweep, mode }`, each the first run of its kind or `undefined`. */
const runsByKind = (counts) => Object.fromEntries(['probe', 'sweep', MODE].map((kind) => [kind, counts.runs.find((one) => one.kind === kind)]));

/** M5.g2: the probe, the sweep and the mode check each ended with 255, and the stderr of each holds the verification line as a whole line and no Offending line. */
function endedWith255(ctx, label, counts) {
  const runs = runsByKind(counts);
  const bad = Object.entries(runs).filter(([, run]) => run === undefined || run.exitCode !== 255 || !ok.hasLine(run.stderr) || /^Offending /m.test(run.stderr ?? '')).map(([kind, run]) => `${kind}: ${run?.exitCode ?? 'not read'}`);
  ctx.check(`${label}: the probe, the sweep and the mode check each ended with 255, and the stderr of each holds the verification line as a whole line and no Offending line (M5.g2)`, bad.length === 0, JSON.stringify({ bad, codes: Object.entries(runs).map(([kind, run]) => [kind, run?.exitCode ?? null]) }));
}

/** M5.h2: the probe and the mode check each ended with 0, and the stderr of each holds the verification line as a whole line. A missing line fails here, by name: the leg could not have failed without it. */
function endedWith0(ctx, label, counts) {
  const runs = runsByKind(counts);
  const bad = [['probe', runs.probe], [MODE, runs.mode]].filter(([, run]) => run === undefined || run.exitCode !== 0 || !ok.hasLine(run.stderr)).map(([kind, run]) => `${kind}: ${run === undefined ? 'not read' : `ended with ${run.exitCode}, ${ok.hasLine(run.stderr) ? 'the line is there' : 'NO verification line in its stderr'}`}`);
  ctx.check(`${label}: the probe and the mode check each ended with 0, and the stderr of each holds the verification line as a whole line (M5.h2)`, bad.length === 0, JSON.stringify({ bad }));
}

/** M5.x1: a pinned leg's connection starts each name ONE pin file and say StrictHostKeyChecking=yes; an unpinned leg's say accept-new and name no known-hosts file, and no start is `ssh -V`. */
function argvCheck(ctx, spec, label) {
  const { product } = ctx;
  const starts = sec.recordedStarts(ctx.rig);
  const connections = starts.filter((one) => rec.isConnectionStart(one.argv));
  const valuesOf = (argv, name) => product.argv.valuesOf(argv, name);
  if (spec.pinned) {
    const bad = connections.filter((one) => sec.pinOf(product, one.argv) === undefined || valuesOf(one.argv, 'StrictHostKeyChecking').join() !== 'yes').length;
    ctx.check(`${label}: every connection start names ONE pin file in both known-hosts options and says StrictHostKeyChecking=yes (M5.${spec.letter}1)`, connections.length > 0 && bad === 0, JSON.stringify({ connections: connections.length, bad }));
    return;
  }
  const bad = connections.filter((one) => valuesOf(one.argv, 'StrictHostKeyChecking').join() !== 'accept-new' || valuesOf(one.argv, 'UserKnownHostsFile').length + valuesOf(one.argv, 'GlobalKnownHostsFile').length > 0).length;
  const questions = starts.filter((one) => rec.isQuestion(one.argv)).length;
  ctx.check(`${label}: every connection start says StrictHostKeyChecking=accept-new and names no known-hosts file, and no start is ssh -V (M5.${spec.letter}1)`, connections.length > 0 && bad === 0 && questions === 0, JSON.stringify({ connections: connections.length, bad, questions }));
}

/**
 * The leaving checks (section 2.7), then the evidence: A2, the bridge closed if a defect left it open, the closed list, each counterpart that is still up ended, the silent listener closed and checked, and the
 * evidence line. `fields` are the leg's own; the rig adds its counts.
 */
async function leave(ctx, roads, servers, fields, silent) {
  const leg = ctx.rig;
  shared.stderrFilesCheck(ctx, leg.label);
  await roads.w.bridges.dispose();
  await rig.nothingLeft(ctx.check, leg.label, leg, roads, rig.callsOf(leg, roads, ctx.product));
  for (const server of servers.filter((one) => one.endedEarly !== true)) {
    await rig.endCounterpart(ctx.check, leg, server, server.name.toUpperCase());
  }
  if (silent !== undefined) {
    await silent.close();
    ctx.check(`${leg.label}: the silent listener is closed and holds no socket`, !silent.listening(), JSON.stringify({ listening: silent.listening(), sockets: silent.sockets() }));
  }
  return rig.evidence(leg, roads, servers, fields);
}

module.exports = {
  writeForced, silentListener, writeJump, refusedPort, resolvedBy, kindOfRun, driveTold, screenOf, orderLine, toldOnce, toldNever, bridgeForm, noBridgedRow, bridgeStays, bridgeCloses, pinFileOf, runsRecord, bridgeRecord, leave, sha256Of, WORDS_OF, runWith, offendingCheck, bridgeOpenCheck, reachedNotAuthenticated, runsByKind, endedWith255, endedWith0, argvCheck,
};
