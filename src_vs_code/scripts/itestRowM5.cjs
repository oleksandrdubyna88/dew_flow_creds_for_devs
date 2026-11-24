'use strict';
// Row M5 of G1 (E3.S8; `todo/PLAN_person_roads_pin_host_key.md`, `## Epics`, E3; `todo/PLAN_person_roads_pin_host_key_E3_S8_spec.md` section 2): what the person is told when a pinned call meets a host key that is not the saved one, as the
// call saw it. Eleven legs, each its own leg process, world, key copy and counterpart(s), each cold: (a) K2 answers, (e) as (a) under a quiet handed config, (f) a jump host whose key the jump file refuses, (g) K1 accepts the logins
// and the remote side writes the verification line and ends with 255, (h) the same and then runs the asked command to 0, and (b) a stopped counterpart, (c) a refused login, (d) a listener that never answers, each also on an UNPINNED entry.
// What the person was shown is read from the world's `said`, and compared with the product's functions AND with the words pinned in `lib/toldRecord.cjs`. The comparisons across legs (the unpinned twins, the control of (h)) run in
// section 10's process, from each leg's `evidence.json`. A proving run of this file passes no row: its numbers are "seen when it was built".
const fs = require('node:fs');
const path = require('node:path');
const rig = require('./itestRowRig.cjs');
const rec = require('./lib/rowRecord.cjs');
const ok = require('./lib/otherKeyRecord.cjs');
const pr = require('./lib/pathRecord.cjs');
const told = require('./lib/toldRecord.cjs');
const shared = require('./itestRowOtherKey.cjs');
const refused = require('./itestRowRefused.cjs');
const t = require('./itestRowTold.cjs');

const { sec, me, within } = rig;
const MODE = 'mode';

/** The leg's world over the entry at `port`, unpinned for a twin, with the mark and the cold check (M5.x0c). */
function openWorld(ctx, spec, port, servers) {
  const leg = ctx.rig;
  const roads = rig.openRoads(leg, port, { credential: 'named', answer: refused.dismissAll });
  if (!spec.pinned) {
    roads.w.replaceHostKey(undefined);
  }
  rig.mark(leg, roads, servers);
  ctx.check(`${leg.label}: cold: 0 runs of ssh -V and 0 starts of the client before the first click (M5.${spec.letter}0c)`, roads.questions.length === 0 && sec.recordedStarts(leg).length === 0, JSON.stringify({ questions: roads.questions.length }));
  return roads;
}

/** The leg's drive, then the counts after the logs of `waiting` have arrived. Answers `{ drive, counts, screen }`. */
async function driven(ctx, roads, servers, waiting, { bridgeEnds }, settle = async () => undefined) {
  const leg = ctx.rig;
  const drive = await t.driveTold(ctx, roads, { bridgeEnds });
  ctx.info(`${leg.label}: the drive: ${JSON.stringify({ install: drive.install, bridge: drive.bridge, bridgeEnded: drive.bridgeEnded, modeRan: drive.modeRan, asked: drive.asked })}`);
  await shared.logsArrived(roads, waiting, shared.connectionStarts(leg, roads).length);
  await settle();
  const counts = rig.countsOf(leg, roads, servers);
  const screen = t.screenOf(ctx, roads, drive.bridgeAt);
  ctx.info(`${leg.label}: the order of the messages: ${t.orderLine(screen)}`);
  return { drive, counts, screen };
}

/** The fields of the evidence that every leg shares (section 1.7). */
async function fieldsOf(ctx, spec, roads, run, more) {
  const { drive, counts, screen } = run;
  return {
    case: spec.letter, pinned: spec.pinned, shown: screen.shown, logs: screen.logs, told: screen.all, toldParts: { install: screen.install, bridge: screen.bridge }, order: screen.order,
    runs: t.runsRecord(counts), bridge: await t.bridgeRecord(ctx, roads), times: drive.times, c7: screen.logs, ...more,
  };
}

/** "No install run" of the counts. */
const installRuns = (counts) => counts.starts.list.filter((one) => one.kind === 'install').length;

/** The control of (e) (M5.ec): E1's words (literal, a file of K1's line for K2's port) under the same config end with 255 and an empty stderr. */
async function quietControl(ctx, label, k2) {
  const leg = ctx.rig;
  const words = ok.e1WordsFor(shared.writePin(leg, 'control-k1', k2.port, leg.k1));
  const run = await shared.login(ctx, k2, words);
  const record = { argv: run.argv, code: run.code, stdout: run.stdout, stderr: run.stderr };
  ctx.check(`${label}: the control: E1's words (literal, a file of K1's line for K2's port) under the same config ended with 255 and an empty stderr, and its words before -i are exactly those words (M5.ec)`, run.code === 255 && run.stderr === '' && JSON.stringify(shared.wordsOf(run.argv)) === JSON.stringify(words), JSON.stringify(record));
  return record;
}

/** (a) and (e) (section 2.1): K2 answers at the entry's address; the roads are refused and the person is told sentence C. */
async function refusedKey(ctx, spec) {
  const { check } = ctx;
  const leg = ctx.rig;
  const label = leg.label;
  const id = spec.letter;
  const k2 = await rig.counterpart(check, leg, 'k2', leg.k2);
  if (k2 === undefined) {
    return;
  }
  let config = null;
  if (spec.quiet) {
    config = rig.handConfig(leg, { lines: ['LogLevel QUIET'] });
    const said = await t.resolvedBy(ctx, ['-p', String(k2.port), `${me}@127.0.0.1`]);
    // `ssh -G` prints the level of `LogLevel QUIET` as SILENT, OpenSSH's own first name of that level (measured 2026-11-24, 10.2p1).
    check(`${label}: ssh -G under the leg's config, with no word of a call, resolves loglevel QUIET (printed by ssh as ${said.value('loglevel')}) (M5.e0)`, said.code === 0 && /^(QUIET|SILENT)$/.test(said.value('loglevel') ?? ''), JSON.stringify({ code: said.code, loglevel: said.value('loglevel') }));
  }
  const roads = openWorld(ctx, spec, k2.port, [k2]);
  const run = await driven(ctx, roads, [k2], [k2], { bridgeEnds: true });
  const { drive, counts, screen } = run;
  const bridgeStderr = shared.bridgeStderrOf(leg, counts);
  const judged = ok.refusedRoads(counts, bridgeStderr);
  check(`${label}: the four runs that start each ended with 255 and the verification line: the probe, the bridge (its line from its own stderr file), the sweep and the mode check; no install run (M5.${id}1)`, judged.ok && installRuns(counts) === 0, JSON.stringify({ judged, installs: installRuns(counts) }));
  t.toldOnce(ctx, label, screen, 'c', 'the install showed sentence C once: one message equals the product\'s sentence C and holds its pinned words; no message holds D\'s words; no message holds "did not answer the probe"', `M5.${id}2`);
  t.noBridgedRow(ctx, label, roads, drive, `M5.${id}3`);
  t.bridgeForm(ctx, label, screen, 'c', 'exactly one error message is "The bridge to "box" is not open: " and the product\'s sentence C, with C\'s pinned words; no message holds "could not be checked: "', `M5.${id}4`);
  t.offendingCheck(ctx, label, roads, `M5.${id}5`);
  t.bridgeOpenCheck(ctx, label, screen, 'c', `M5.${id}6`);
  t.reachedNotAuthenticated(ctx, label, counts, 0, counts.starts.connectionStarts, `M5.${id}7`, 'K2');
  const control = spec.quiet ? await quietControl(ctx, label, k2) : null;
  const fields = await fieldsOf(ctx, spec, roads, run, { config, bridgeStderr, control });
  await t.leave(ctx, roads, [k2], fields, undefined);
}

/** `ssh -G` of (f): the jump config routes the destination through `jump`, and `jump` is checked by the jump file, strictly (M5.f0). */
async function routeCheck(ctx, label, d, jump) {
  const viaJump = await t.resolvedBy(ctx, ['-p', String(d.port), `${me}@127.0.0.1`]);
  const hop = await t.resolvedBy(ctx, ['jump']);
  const found = { code: [viaJump.code, hop.code], proxyjump: viaJump.value('proxyjump'), userknownhostsfile: hop.value('userknownhostsfile'), stricthostkeychecking: hop.value('stricthostkeychecking') };
  ctx.check(`${label}: under the leg's config ssh -G resolves proxyjump jump for ${me}@127.0.0.1, and for jump: userknownhostsfile ${path.basename(jump.jumpFile)} and stricthostkeychecking true (M5.f0)`, found.code[0] === 0 && found.code[1] === 0 && found.proxyjump === 'jump' && found.userknownhostsfile === jump.jumpFile && found.stricthostkeychecking === 'true', JSON.stringify(found));
}

/** M5.f7: no stderr holds a line with the pin file of its call (the probe's, the sweep's and the mode check's, and the bridge's own file), as written and as ssh prints it; the probe's stderr holds the `Offending` line of the jump file. */
function noPinLines(ctx, label, roads, counts, jumpFile) {
  const { product } = ctx;
  const leg = ctx.rig;
  const remote = roads.bridges[0]?.remote;
  const runs = [['probe', product.probeCommand()], ['sweep', product.sweepCommand(me)], [MODE, remote === undefined ? undefined : product.modeCheckCommand({ path: remote })]].map(([kind, command]) => [kind, t.runWith(roads, command)]);
  const lines = runs.map(([kind, run]) => ({ kind, file: run === undefined ? null : t.pinFileOf(product, run.argv), stderr: run?.outcome?.stderr ?? null }));
  const bridge = { kind: 'bridge', file: t.pinFileOf(product, roads.bridges[0]?.argv ?? []), stderr: shared.bridgeStderrOf(leg, counts) };
  const held = [...lines, bridge].map((one) => ({ kind: one.kind, read: one.file !== null && one.stderr !== null, lines: one.file === null || one.stderr === null ? [] : told.pinLines(one.stderr, one.file) }));
  const probe = lines[0].stderr;
  ctx.check(`${label}: no stderr holds a line with the pin file of its call: the probe's, the sweep's and the mode check's and the bridge's, the file as written and as ssh prints it; and the probe's stderr holds the Offending line of the jump file (M5.f7)`, held.every((one) => one.read && one.lines.length === 0) && probe !== null && pr.offendingNames(probe, jumpFile), JSON.stringify({ held, jumpOffending: probe !== null && pr.offendingNames(probe, jumpFile) }));
}

/** M5.fw: with J's own line in the jump file, the control client through the same config ends with 0, and D and J each log one more accepted login. */
async function routeWitness(ctx, label, d, j, jump, kj) {
  const leg = ctx.rig;
  fs.writeFileSync(jump.jumpFile, ok.knownHostsLineOf(j.port, fs.readFileSync(`${kj}.pub`, 'utf8')), { mode: 0o600 });
  const words = ok.e1WordsFor(shared.writePin(leg, 'control-d', d.port, leg.k1));
  const jBefore = rec.logCounts(j.sshd.stderr, me).accepted.length;
  const run = await shared.login(ctx, d, words);
  await within(5_000, () => rec.logCounts(j.sshd.stderr, me).accepted.length > jBefore);
  const jAfter = rec.logCounts(j.sshd.stderr, me).accepted.length;
  const record = { argv: run.argv, code: run.code, stdout: run.stdout, stderr: run.stderr };
  ctx.check(`${label}: the route witness: with J's own line in the jump file, the control client (E1's literal words of a file of K1's line for D's port) through the same config ended with 0, and D and J each logged one more accepted login (M5.fw)`, run.code === 0 && run.after.accepted === run.before.accepted + 1 && jAfter === jBefore + 1, JSON.stringify({ ...record, d: [run.before.accepted, run.after.accepted], j: [jBefore, jAfter] }));
  return { ...record, dAccepted: [run.before.accepted, run.after.accepted], jAccepted: [jBefore, jAfter] };
}

/** (f) (section 2.2): D is K1, J is a second counterpart with a key of its own; the jump file refuses J's key, so the nested client is refused and the outer ends with 255. */
async function hop(ctx, spec) {
  const { check } = ctx;
  const leg = ctx.rig;
  const label = leg.label;
  const kj = path.join(leg.dir, 'kj_key');
  const failed = await rig.tool('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', kj]);
  check(`${label}: the jump host's own key KJ was generated`, failed === undefined, failed);
  const j = failed === undefined ? await rig.counterpart(check, leg, 'j', kj) : undefined;
  const d = j === undefined ? undefined : await rig.counterpart(check, leg, 'd', leg.k1);
  if (d === undefined) {
    return;
  }
  const jump = t.writeJump(leg, j.port);
  await routeCheck(ctx, label, d, jump);
  const roads = openWorld(ctx, spec, d.port, [j, d]);
  const run = await driven(ctx, roads, [j, d], [j], { bridgeEnds: true });
  const { drive, counts, screen } = run;
  const bridgeStderr = shared.bridgeStderrOf(leg, counts);
  const judged = ok.refusedRoads(counts, bridgeStderr);
  check(`${label}: each run that starts ended with 255: exactly four connection starts (the probe, the bridge, the sweep, the mode check), each runner run and the bridge with 255; no install run (M5.f1)`, judged.ok && installRuns(counts) === 0, JSON.stringify({ judged, installs: installRuns(counts) }));
  const [jlog, dlog] = counts.counterparts;
  check(`${label}: the destination D logged 0 connections after the mark, and J logged a connection for each connection start and 0 authentication attempts (M5.f2)`, dlog.connections === 0 && dlog.accepted.length === 0 && dlog.authAttempts === 0 && counts.starts.connectionStarts > 0 && jlog.connections >= counts.starts.connectionStarts && jlog.authAttempts === 0 && jlog.accepted.length === 0, JSON.stringify({ starts: counts.starts.connectionStarts, d: { connections: dlog.connections, attempts: dlog.authAttempts }, j: { connections: jlog.connections, attempts: jlog.authAttempts, accepted: jlog.accepted } }));
  t.toldNever(ctx, label, screen, 'c', 'sentence C was shown 0 times: no message and no log line equals or holds the product\'s sentence C, C\'s pinned words or "is not open: "', 'M5.f3');
  t.toldOnce(ctx, label, screen, 'd', 'the install showed sentence D once: one message equals the product\'s sentence D and holds D\'s pinned words, and none holds C\'s', 'M5.f4');
  t.bridgeForm(ctx, label, screen, 'd', 'exactly one error message is "The bridge to "box" could not be checked: " and the product\'s sentence D, with D\'s pinned words', 'M5.f5');
  t.noBridgedRow(ctx, label, roads, drive, 'M5.f6');
  noPinLines(ctx, label, roads, counts, jump.jumpFile);
  const witness = await routeWitness(ctx, label, d, j, jump, kj);
  const fields = await fieldsOf(ctx, spec, roads, run, { bridgeStderr, jump: { port: j.port, jumpFileSha256: t.sha256Of(fs.readFileSync(jump.jumpFile, 'utf8')), refusedFileSha256: jump.sha256 }, witness });
  await t.leave(ctx, roads, [j, d], fields, undefined);
}

/** M5.g0 and M5.h0: the counterpart's config holds `ForceCommand <script>`, and the script on the disk is the lib's text. Answers the forced record of the evidence. */
function forcedCheck(ctx, label, k1, forced, kind, id, words) {
  const config = fs.readFileSync(path.join(ctx.rig.dir, k1.name, 'sshd_config'), 'utf8');
  const onDisk = fs.readFileSync(forced.file, 'utf8');
  const line = /^printf '%s\\n' '(.*)' >&2$/m.exec(onDisk)?.[1] ?? null;
  ctx.check(`${label}: ${words}: K1's config holds ForceCommand <leg>/forced/${kind}.sh, and the script's SHA-256 is that of the lib's text (${id})`, config.split('\n').includes(`ForceCommand ${forced.file}`) && t.sha256Of(onDisk) === forced.sha256 && onDisk === told.forcedScript(kind), JSON.stringify({ sha256: forced.sha256 }));
  return { script: kind, sha256: forced.sha256, line };
}

/** M5.g1 and M5.h1: K1 logged the logins as accepted: exactly four after the mark, one per connection start, three with a session and one with none; no install run. */
function acceptedCheck(ctx, label, counts, id) {
  const log = counts.counterparts[0];
  const sessions = log.accepted.filter((one) => one.session !== 'none').length;
  ctx.check(`${label}: K1 logged the logins as accepted: exactly 4 accepted logins after the mark, one per connection start (the probe, the bridge, the sweep, the mode check), 3 with a session and 1 with none; no install run (${id})`, log.accepted.length === 4 && counts.starts.connectionStarts === 4 && sessions === 3 && installRuns(counts) === 0, JSON.stringify({ accepted: log.accepted, starts: counts.starts.connectionStarts, installs: installRuns(counts) }));
}

/** M5.h4: the install reached its question, the one `confirmationFor` builds from the probe's answer; the probe was read and nothing blocks; no install run started (dismissed). */
function questionCheck(ctx, label, roads, drive, counts) {
  const { product } = ctx;
  const probe = sec.runOf(roads, product.probeCommand());
  const facts = product.interpretProbe(probe?.outcome?.stdout ?? '');
  const blocker = product.blockerFor(facts);
  const ask = product.confirmationFor(facts, product.world.ROW.node.name);
  const asked = roads.w.asked.slice(rig.markOf(roads).asked, rig.markOf(roads).asked + drive.asked);
  ctx.check(`${label}: the install reached its question: exactly one question was asked before the bridge's click, and it is the one that confirmationFor builds from the probe's answer; interpretProbe read an answer and blockerFor found nothing; no install run started (M5.h4)`, drive.asked === 1 && asked.length === 1 && asked[0].message === ask.message && facts.answered === true && blocker.length === 0 && installRuns(counts) === 0, JSON.stringify({ asked: asked.map((one) => one.message), answered: facts.answered, blocker }));
}

/** M5.h5: the socket check showed no error message, and the mode check's stdout, read by `interpretSocketProbe`, is a mode, owner only. */
function socketModeCheck(ctx, label, roads, screen) {
  const { product } = ctx;
  const remote = roads.bridges[0]?.remote;
  const mode = t.runWith(roads, remote === undefined ? undefined : product.modeCheckCommand({ path: remote }));
  const read = product.interpretSocketProbe(mode?.outcome?.stdout ?? '');
  const errors = screen.shown.filter((one, at) => one.kind === 'error' && screen.order[at].at >= screen.bridgeAt);
  ctx.check(`${label}: the socket check showed no error message, and the mode check's stdout, read by interpretSocketProbe, is a mode, owner only (M5.h5)`, errors.length === 0 && read.kind === MODE && product.isOwnerOnlyMode(read.mode), JSON.stringify({ errors, read, stdout: mode?.outcome?.stdout ?? null }));
}

/** (g) and (h) (sections 2.3 and 2.4): K1 logs the logins as accepted, the remote side writes the verification line, and ends with 255 (`fail`) or runs the asked command to 0 (`zero`). */
async function forced(ctx, spec) {
  const { check } = ctx;
  const leg = ctx.rig;
  const label = leg.label;
  const id = spec.letter;
  const given = shared.standing(ctx);
  const script = t.writeForced(leg, spec.script);
  const k1 = await rig.counterpart(check, leg, 'k1', leg.k1, { extra: [...script.extra, ...given.stand.extra] });
  if (k1 === undefined) {
    return;
  }
  const record = forcedCheck(ctx, label, k1, script, spec.script, `M5.${id}0`, id === 'g' ? 'the sshd\'s forced command' : 'a forced command that writes the line and hands over to the original command');
  const roads = openWorld(ctx, spec, k1.port, [k1]);
  const run = await driven(ctx, roads, [k1], [k1], { bridgeEnds: false }, () => shared.acceptedAfter(k1, 3));
  const { drive, counts, screen } = run;
  acceptedCheck(ctx, label, counts, `M5.${id}1`);
  if (id === 'g') {
    t.endedWith255(ctx, label, counts);
    t.toldNever(ctx, label, screen, 'c', 'sentence C was shown 0 times: no message and no log line equals or holds the product\'s sentence C, C\'s pinned words or "is not open: "', 'M5.g3');
    t.toldOnce(ctx, label, screen, 'd', 'the install showed sentence D once: one message equals the product\'s sentence D and holds D\'s pinned words, and none holds C\'s', 'M5.g4');
    t.bridgeForm(ctx, label, screen, 'd', 'exactly one error message is "The bridge to "box" could not be checked: " and the product\'s sentence D, with D\'s pinned words', 'M5.g5');
  } else {
    t.endedWith0(ctx, label, counts);
    t.toldNever(ctx, label, screen, 'both', 'the install road showed sentence C 0 times and sentence D 0 times: no message equals or holds either, their pinned words, or a bridge prefix', 'M5.h3i', 'install');
    t.toldNever(ctx, label, screen, 'both', 'the bridge road and its socket check showed sentence C 0 times and sentence D 0 times, in a message or a log line', 'M5.h3b', 'bridge');
    questionCheck(ctx, label, roads, drive, counts);
    socketModeCheck(ctx, label, roads, screen);
  }
  const stays = await t.bridgeStays(ctx, label, roads, `M5.${id}6`);
  const fields = await fieldsOf(ctx, spec, roads, run, { forced: record, stays });
  await t.bridgeCloses(ctx, label, roads, `M5.${id}7`);
  shared.standInGuard(ctx, label, given, roads, `M5.${id}8`);
  await t.leave(ctx, roads, [k1], fields, undefined);
}

/** The case of (b), (c) or (d): the counterpart, the port the entry points at, and M5.x0. Answers `{ port, servers, silent }`, or `undefined` when the counterpart did not listen. */
async function caseOf(ctx, spec) {
  const { check } = ctx;
  const leg = ctx.rig;
  const label = leg.label;
  const id = spec.letter;
  if (spec.target === 'silent') {
    const silent = await t.silentListener(leg);
    check(`${label}: the silent listener listens at 127.0.0.1:<port> (M5.${id}0)`, silent.listening(), JSON.stringify({ port: silent.port }));
    return { port: silent.port, servers: [], silent };
  }
  if (spec.target === 'refusedLogin') {
    // The stored key's `.pub` alone: the key that the call offers (the person's key copy) is no longer there.
    fs.writeFileSync(leg.authorizedKeys, `${fs.readFileSync(`${leg.storedKey}.pub`, 'utf8').trim()}\n`);
  }
  const k1 = await rig.counterpart(check, leg, 'k1', leg.k1);
  if (k1 === undefined) {
    return undefined;
  }
  if (spec.target === 'stopped') {
    await rig.endCounterpart(check, leg, k1, 'K1');
    k1.endedEarly = true;
    check(`${label}: before the first click nothing listens at the port: a connection to 127.0.0.1:<port> is refused (M5.${id}0)`, await t.refusedPort(k1.port), JSON.stringify({ port: k1.port }));
  } else {
    const offered = fs.readFileSync(`${leg.userKey}.pub`, 'utf8').trim().split(/\s+/)[1];
    const text = fs.readFileSync(leg.authorizedKeys, 'utf8');
    check(`${label}: K1's authorized_keys holds no key that the call offers (the person's key copy) and holds the stored key (M5.${id}0)`, !text.includes(offered) && text.includes(fs.readFileSync(`${leg.storedKey}.pub`, 'utf8').trim().split(/\s+/)[1]), JSON.stringify({ lines: text.trim().split('\n').length }));
  }
  return { port: k1.port, servers: [k1], silent: undefined };
}

/** M5.b4, M5.c4, M5.d4: what the case is, in the counts. Answers `{ silent }` for the evidence. */
function caseCounts(ctx, spec, label, counts, silent) {
  const id = `M5.${spec.letter}4`;
  const runs = Object.values(t.runsByKind(counts));
  const bridge = counts.bridges[0];
  const wanted = counts.starts.connectionStarts;
  const log = counts.counterparts[0];
  if (spec.target === 'stopped') {
    ctx.check(`${label}: each connection start's run ended with 255 (the bridge too), and nothing answered (${id})`, runs.every((one) => one?.exitCode === 255) && bridge?.exitCode === 255 && wanted === 4 && log.connections === 0, JSON.stringify({ codes: runs.map((one) => one?.exitCode ?? null), bridge: bridge?.exitCode ?? null, starts: wanted, connections: log.connections }));
  } else if (spec.target === 'refusedLogin') {
    ctx.check(`${label}: K1 logged an authentication attempt for each connection start and 0 accepted logins: the key check passed and the login was refused (${id})`, wanted === 4 && log.attemptPorts.length === wanted && log.accepted.length === 0, JSON.stringify({ starts: wanted, attemptPorts: log.attemptPorts, accepted: log.accepted }));
  } else {
    const seen = silent.snapshot();
    runs.forEach((one) => ctx.info(`${label}: a run of ${one?.kind}: exit ${one?.exitCode}, timedOut ${one?.timedOut}, ended by ${one?.timedOut ? 'the runner\'s limit' : 'the client itself'}, stderr: ${JSON.stringify(String(one?.stderr ?? '').trim().split('\n').slice(-2))}`));
    ctx.check(`${label}: the silent listener accepted a connection for each connection start and wrote 0 bytes; each run ended with 255 or by the runner's limit (${id})`, wanted === 4 && seen.accepted >= wanted && seen.bytesOut === 0 && runs.every((one) => one !== undefined && (one.exitCode === 255 || one.timedOut === true)), JSON.stringify({ starts: wanted, ...seen }));
  }
}

/** (b), (c), (d) (section 2.6): no key check is made, or the login is refused; sentences C and D are shown 0 times on both roads, and what was shown is recorded word for word. */
async function notReached(ctx, spec) {
  const leg = ctx.rig;
  const label = leg.label;
  const made = await caseOf(ctx, spec);
  if (made === undefined) {
    return;
  }
  const roads = openWorld(ctx, spec, made.port, made.servers);
  const run = await driven(ctx, roads, made.servers, made.servers.filter((one) => one.endedEarly !== true), { bridgeEnds: true });
  const { counts, screen } = run;
  t.argvCheck(ctx, spec, label);
  t.toldNever(ctx, label, screen, 'both', 'sentences C and D were shown 0 times on both roads: no message and no log line equals or holds either, their pinned words, or a bridge prefix', `M5.${spec.letter}2`);
  ctx.check(`${label}: what was shown is recorded word for word: at least one message after the mark, each in the evidence with its kind and text, in order (M5.${spec.letter}3)`, screen.shown.length >= 1, JSON.stringify(screen.shown));
  caseCounts(ctx, spec, label, counts, made.silent);
  ctx.info(`${label}: the log lines of the socket check, as seen (C7): ${JSON.stringify(screen.logs)}`);
  const fields = await fieldsOf(ctx, spec, roads, run, { silent: made.silent === undefined ? null : { ...made.silent.snapshot(), port: made.silent.port } });
  await t.leave(ctx, roads, made.servers, fields, made.silent);
}

const RUNNERS = { k2: refusedKey, hop, forced, stopped: notReached, refusedLogin: notReached, silent: notReached };
const legs = Object.fromEntries(told.M5_LEGS.map((spec) => [spec.name, (ctx) => RUNNERS[spec.target](ctx, spec)]));

/** One leg's evidence file (written by the leg process), or `null` when it is not there or does not parse. */
function evidenceOf(top, name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(top.dir, name, 'evidence.json'), 'utf8'));
  } catch {
    return null;
  }
}

/** M5: the eleven legs in the table's order, each in a leg process of its own; then the three comparisons of a pinned leg with its unpinned twin (M5.b9, M5.c9, M5.d9) and the control of (h) (M5.hc). */
async function rowM5(check, top) {
  for (const spec of told.M5_LEGS) {
    await rig.runLeg(check, top, 'M5', spec.name);
  }
  for (const letter of ['b', 'c', 'd']) {
    const pinned = evidenceOf(top, `m5-${letter}`);
    const unpinned = evidenceOf(top, `m5-${letter}-unpinned`);
    const same = told.sameShown(pinned?.shown, unpinned?.shown);
    const missing = [pinned === null ? `m5-${letter}/evidence.json` : null, unpinned === null ? `m5-${letter}-unpinned/evidence.json` : null].filter((one) => one !== null);
    check(`M5 m5-${letter}: what the pinned leg showed is the same text that the unpinned leg showed: the same messages, kinds and order (M5.${letter}9)`, same.ok && pinned.pinned === true && unpinned.pinned === false, JSON.stringify({ missing, diff: same.diff }));
  }
  const g = evidenceOf(top, 'm5-g');
  const h = evidenceOf(top, 'm5-h');
  const judged = told.controlOfH(g, h);
  check('M5 m5-h: the control of (h) is (g) of the same run: (g)\'s probe and mode check ended with 255, (h)\'s with 0; the forced line of both is the same text; (g) showed sentence D on the install and in the bridge\'s form, (h) showed neither (M5.hc)', judged.ok, JSON.stringify({ problems: judged.problems, missing: [g === null ? 'm5-g/evidence.json' : null, h === null ? 'm5-h/evidence.json' : null].filter((one) => one !== null) }));
}

module.exports = { rowM5, legs };
