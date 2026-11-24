'use strict';
// Row M3 of G1 (E3.S6; `todo/PLAN_person_roads_pin_host_key.md`, `## Epics`, E3; `todo/PLAN_person_roads_pin_host_key_E3_S6_spec.md` §3): a call that rides a live master connection is carried past the key check
// ("with a master up, a call without G2's two options rides it, and neither its own `-i` key nor its own pinned host key is used", `sshExecCommand.ts`). The roads carry G2's two options (`ControlPath=none`,
// `ControlMaster=no`), so a master never carries them. Two legs, each its own process, world and counterpart(s), each with a master to K1 that the leg makes through its handed config:
//   `m3-mismatch`: the entry is pinned to K2, K1 answers; the three roads are refused, K1's log shows no new session, command or forward; a witness of the leg's own (the probe's words, pinned to K2, and no G2 option) RIDES the master;
//   `m3-switch`: the entry is pinned to K1, K1 answers the probe, the install's question is held, K1's LISTENER alone is ended (its master's session stays) and K2 takes its port; the install run is refused and the master is alive
//   directly before the answer and directly after the run; the control, AFTER the switch (the install run's words, its pin file replaced by a file of K1's line, no G2 option), ends with 0 THROUGH the master: the row is not passed otherwise.
// A proving run of this file passes no row: its numbers are "seen when it was built".
const crypto = require('node:crypto');
const path = require('node:path');
const rig = require('./itestRowRig.cjs');
const rec = require('./lib/rowRecord.cjs');
const ok = require('./lib/otherKeyRecord.cjs');
const shared = require('./itestRowOtherKey.cjs');
const refusedLeg = require('./itestRowRefused.cjs');

const { within, me } = rig;
const SPECS = Object.fromEntries(ok.OTHER_KEY_LEGS.filter((one) => one.row === 'M3').map((one) => [one.name, one]));
const SIX = ['StrictHostKeyChecking', 'UserKnownHostsFile', 'GlobalKnownHostsFile', 'VerifyHostKeyDNS', 'KnownHostsCommand', 'LogLevel'];

/** The master of the leg (§1.6): the handed config with the master's lines, then a master to K1 through it (M3.0). Answers `{ master, config }`; `master` is `undefined` when it did not come up. */
async function startMaster(ctx, spec, k1) {
  const leg = ctx.rig;
  const config = rig.handConfig(leg, shared.optionsOf(leg, spec));
  const master = await rig.masterOf(ctx.check, leg, k1.port, shared.writePin(leg, 'master-k1', k1.port, leg.k1));
  return { master, config };
}

/** The starts that do NOT carry G2's two options, each once; the values are the literal ones of the lib, never the product's. */
function g2Bad(starts) {
  const same = (list) => JSON.stringify([...list].sort()) === JSON.stringify([...ok.G2_WORDS].sort());
  return starts.filter((start) => !same(ok.sharingWordsOf(start.argv))).map((start) => ({ pid: start.pid, words: ok.sharingWordsOf(start.argv) }));
}

/**
 * A call that WOULD ride the master (the witness of `m3-mismatch`, the control of `m3-switch`): the real client by its path with the road's own recorded words (`argv`, the six options of E1 and E2) and the path of
 * the two known-hosts options replaced by `pinFile`, no G2 option, running `echo <nonce> "$PATH"` against `server`. Answers `{ run, nonce, error, argvOk, sixOk, sixCounts, printed, onStandInPath }`:
 * `argvOk` is "no G2 option", `sixOk` "the six options of E1 and E2, each once" (its own named check: a road that lost one is a defect of the road, not of this call). A call that could not be
 * made (the words name no known-hosts file) answers an `error` and a `run` with no code, so the leg's checks go red by name and the leg goes on to its end.
 */
async function ride(ctx, given, argv, pinFile, server) {
  const { product } = ctx;
  const nothing = { code: null, stdout: '', stderr: '', argv: [], before: { accepted: 0, connections: 0, sessions: 0 }, after: { accepted: 0, connections: 0, sessions: 0 } };
  try {
    const words = ok.withFile([...product.argv.hostKeyWordsOf(argv), ...product.argv.sourceWordsOf(argv)], pinFile);
    const nonce = crypto.randomUUID();
    const run = await shared.login(ctx, server, words, `echo ${nonce} "$PATH"`);
    const sixCounts = Object.fromEntries(SIX.map((name) => [name, product.argv.valuesOf(run.argv, name).length]));
    return { run, nonce, error: undefined, argvOk: ok.sharingWordsOf(run.argv).length === 0, sixOk: Object.values(sixCounts).every((n) => n === 1), sixCounts, printed: run.stdout.startsWith(`${nonce} `), onStandInPath: run.stdout.startsWith(`${nonce} ${given.stand.bin}:`) };
  } catch (error) {
    return { run: nothing, nonce: '', error: String(error?.message ?? error), argvOk: false, sixOk: false, sixCounts: null, printed: false, onStandInPath: false };
  }
}

/** The record of a ride for the evidence: its argv, code, output, and the error when it could not be made. */
const recordOf = (one) => ({ argv: one.run.argv, code: one.run.code, stdout: one.run.stdout, stderr: one.run.stderr, error: one.error ?? null });

/** What a ride adds to K1's log: exactly one new session of kind `command`, no new accepted login, no new connection. */
function rodeIt(run) {
  return run.after.sessions === run.before.sessions + 1 && run.after.accepted === run.before.accepted && run.after.connections === run.before.connections;
}

const probeArgvOf = (ctx, leg, roads) => shared.connectionStarts(leg, roads).find((start) => start.argv.at(-1) === ctx.product.probeCommand())?.argv ?? [];
const installArgvOf = (ctx, leg, roads) => shared.connectionStarts(leg, roads).find((start) => start.argv.at(-1) === ctx.product.installCommand())?.argv ?? [];

/** The leaving checks: bridges closed, nothing left, the master ended (first), the counterparts ended (the last one started first), then the evidence. */
async function leave(ctx, spec, roads, servers, counts, made) {
  const { check } = ctx;
  const leg = ctx.rig;
  shared.stderrFilesCheck(ctx, leg.label);
  await roads.w.bridges.dispose();
  await rig.nothingLeft(check, leg.label, leg, roads, rig.callsOf(leg, roads, ctx.product));
  if (made.master !== undefined) {
    await rig.endMaster(leg, made.master, check);
  }
  for (const server of [...servers].reverse()) {
    await rig.endCounterpart(check, leg, server, server.name.toUpperCase());
  }
  const source = { control: path.relative(leg.dir, path.join(leg.dir, 'cm')), persist: 120, master: { pid: made.master?.pid ?? null, checks: made.checks ?? [] } };
  rig.evidence(leg, roads, servers, { ...counts, ...shared.commonEvidence(spec, made.config, counts, {}), source, bridgeStderr: made.bridgeStderr ?? null, socket: made.socket ?? null, [made.kind ?? 'control']: made.record ?? null, installShown: made.shown ?? null, switchMark: made.switchMark ?? null });
}

/** The mismatch (§3.1): the entry is pinned to K2, K1 answers, a master to K1 is up; the three roads are refused and never ride the master. */
async function mismatch(ctx, spec) {
  const { check } = ctx;
  const leg = ctx.rig;
  const label = leg.label;
  const given = shared.standing(ctx);
  const k1 = await rig.counterpart(check, leg, 'k1', leg.k1, { extra: given.stand.extra });
  if (k1 === undefined) {
    return;
  }
  const made = await startMaster(ctx, spec, k1);
  if (made.master === undefined) {
    return void (await rig.endCounterpart(check, leg, k1, 'K1'));
  }
  const roads = rig.openRoads(leg, k1.port, { credential: 'named', answer: rig.installAnswer(leg) });
  roads.w.replaceHostKey(refusedLeg.keyText(ctx.product, `${leg.k2}.pub`));
  const mark = rig.mark(leg, roads, [k1]);
  ctx.info(`${label}: cold: the roads' clicks: ${JSON.stringify(await shared.driveRefusedRoads(ctx, roads))}`);
  await shared.logsArrived(roads, [k1], shared.connectionStarts(leg, roads).length);
  const counts = rig.countsOf(leg, roads, [k1]);
  const bridgeStderr = shared.refusedChecks(ctx, label, counts, 'M3');
  const sessions = ok.sessionsOf(k1.sshd.stderr.slice(mark.logs.k1), me);
  const log = counts.counterparts[0];
  check(`${label}: after the master was set up K1's log shows no new session or command: 0 Starting session lines and 0 accepted logins after the mark; and K1 logged a connection for each connection start, so no run rode the master (M3.3)`, sessions.length === 0 && log.accepted.length === 0 && log.connections >= counts.starts.connectionStarts && counts.starts.connectionStarts > 0, JSON.stringify({ sessions, accepted: log.accepted, connections: log.connections, connectionStarts: counts.starts.connectionStarts }));
  const socket = await shared.socketChecks(ctx, label, roads, 'M3.4', 'no new forward: the bridge\'s remote socket does not exist and nothing listens on it, read while the master is still up');
  const starts = shared.connectionStarts(leg, roads);
  const bad = g2Bad(starts);
  check(`${label}: each connection start carries G2's two options, ControlPath=none and ControlMaster=no, each once (M3.5)`, starts.length > 0 && bad.length === 0, JSON.stringify(bad));
  const alive = await rig.masterCheck(leg);
  check(`${label}: the master is still up after the last run: ssh -O check ends with 0 (M3.6)`, alive.code === 0, JSON.stringify(alive));
  const one = await ride(ctx, given, probeArgvOf(ctx, leg, roads), shared.writePin(leg, 'witness-k2', k1.port, leg.k2), k1);
  check(`${label}: the witness: the real client with the probe's own pin words (pinned to K2, its file replaced by a file of K2's line) and without G2's two options rode the master: exit 0, it printed the nonce, and K1's log shows one new session and no new connection (M3.7)`, one.run.code === 0 && one.printed && one.argvOk && rodeIt(one.run), one.error ?? JSON.stringify({ code: one.run.code, stdout: one.run.stdout, stderr: one.run.stderr, before: one.run.before, after: one.run.after, argvOk: one.argvOk }));
  check(`${label}: the witness's own argv holds the six options of E1 and E2, each once (M3.7a)`, one.error === undefined && one.sixOk, one.error ?? JSON.stringify(one.sixCounts));
  shared.standInGuard(ctx, label, given, roads, 'M3.8');
  check(`${label}: a session through the master gets the stand-in's PATH: the witness printed a PATH that starts with <standin>/bin (M3.8)`, one.onStandInPath, one.run.stdout);
  await leave(ctx, spec, roads, [k1], counts, { ...made, bridgeStderr, socket, kind: 'witness', record: recordOf(one), checks: [made.master.code, alive.code] });
}

/** The switch (§3.2): K1 answers the probe; the question is held; K1's listener alone is ended and K2 takes its port; the install run is refused; the control rides the master that survived. */
async function switchLeg(ctx, spec) {
  const { check, info } = ctx;
  const leg = ctx.rig;
  const label = leg.label;
  const given = shared.standing(ctx);
  const k1 = await rig.counterpart(check, leg, 'k1', leg.k1, { extra: given.stand.extra });
  if (k1 === undefined) {
    return;
  }
  const made = await startMaster(ctx, spec, k1);
  if (made.master === undefined) {
    return void (await rig.endCounterpart(check, leg, k1, 'K1'));
  }
  const answer = rig.installAnswer(leg, { held: true });
  const roads = rig.openRoads(leg, k1.port, { credential: 'named', answer });
  rig.mark(leg, roads, [k1]);
  let before;
  const run = await shared.driveSwitch(ctx, spec, roads, answer, k1, given.stand.extra, async () => { before = await rig.masterCheck(leg); });
  const after = await rig.masterCheck(leg);
  const { k2 } = run;
  if (k2 === undefined) {
    return void (await leave(ctx, spec, roads, [k1], rig.countsOf(leg, roads, [k1]), made));
  }
  await within(3_000, () => rec.logCounts(k2.sshd.stderr, me).connections >= 1);
  const counts = rig.countsOf(leg, roads, [k1, k2]);
  const k2log = counts.counterparts[1];
  check(`${label}: the master is alive directly before the question is answered: ssh -O check ends with 0 and names the master's pid (M3.s2)`, before?.code === 0 && before.pid === made.master.pid, JSON.stringify({ before, master: made.master.pid }));
  const installs = counts.runs.filter((one) => one.kind === 'install');
  const installStart = shared.connectionStarts(leg, roads).filter((start) => start.argv.at(-1) === ctx.product.installCommand());
  check(`${label}: the install run started once and ended with exit code 255 and the verification line; it carried G2's two options; K2 logged a connection for it (M3.s3)`, run.ended && installs.length === 1 && installs[0].exitCode === 255 && ok.hasLine(installs[0].stderr) && installStart.length === 1 && g2Bad(installStart).length === 0 && k2log.connections >= 1, JSON.stringify({ ended: run.ended, installs, starts: installStart.length, connections: k2log.connections }));
  check(`${label}: the master is alive directly after the install run has ended: ssh -O check ends with 0 and names the master's pid (M3.s4)`, after.code === 0 && after.pid === made.master.pid, JSON.stringify({ after, master: made.master.pid }));
  const sessions = ok.sessionsOf(k1.sshd.stderr.slice(run.switchMark.k1), me);
  const accepted = rec.logCounts(k1.sshd.stderr.slice(run.switchMark.k1), me).accepted;
  check(`${label}: between the switch and the end of that run K1's log shows no new session or command: 0 Starting session lines and 0 accepted logins between the switch mark and the click's end (M3.s5)`, sessions.length === 0 && accepted.length === 0, JSON.stringify({ sessions, accepted }));
  check(`${label}: K2 logged 0 accepted logins (M3.s6)`, k2log.accepted.length === 0, JSON.stringify(k2log.accepted));
  info(`${label}: K2's authentication attempts: ${k2log.authAttempts}`);
  const k2Before = rec.logCounts(k2.sshd.stderr, me).connections;
  const one = await ride(ctx, given, installArgvOf(ctx, leg, roads), shared.writePin(leg, 'control-k1', k1.port, leg.k1), k1);
  const k2After = rec.logCounts(k2.sshd.stderr, me).connections;
  const sessionKinds = ok.sessionsOf(k1.sshd.stderr, me).slice(one.run.before.sessions).map((session) => session.kind);
  check(`${label}: the control client with the same pin words (the install run's six pairs, its pin file replaced by a file of K1's line) and without G2's two options ended with 0 through the master that survived: it printed the nonce, K1's log shows one new command session and no new accepted login, and K2 logged no new connection (M3.s7)`, one.run.code === 0 && one.printed && one.argvOk && rodeIt(one.run) && sessionKinds.join() === 'command' && k2After === k2Before, one.error ?? JSON.stringify({ code: one.run.code, stdout: one.run.stdout, stderr: one.run.stderr, before: one.run.before, after: one.run.after, sessionKinds, k2Connections: [k2Before, k2After] }));
  check(`${label}: the control's own argv holds the six options of E1 and E2, each once (M3.s7a)`, one.error === undefined && one.sixOk, one.error ?? JSON.stringify(one.sixCounts));
  shared.standInGuard(ctx, label, given, roads, 'M3.s8');
  check(`${label}: the control's PATH, through the master, starts with <standin>/bin (M3.s8)`, one.onStandInPath, one.run.stdout);
  info(`${label}: the install run's argv: ${JSON.stringify(installArgvOf(ctx, leg, roads))}; the control's argv: ${JSON.stringify(one.run.argv)}`);
  await leave(ctx, spec, roads, [k1, k2], counts, { ...made, kind: 'control', record: recordOf(one), checks: [before?.code ?? null, after.code], shown: run.shown, switchMark: run.switchMark });
}

const legs = Object.fromEntries(Object.values(SPECS).map((spec) => [spec.name, (ctx) => (spec.scenario === 'mismatch' ? mismatch(ctx, spec) : switchLeg(ctx, spec))]));

/** M3: every `m3-*` leg of the table, in its order, each in a leg process of its own. */
async function rowM3(check, top) {
  for (const spec of Object.values(SPECS)) {
    await rig.runLeg(check, top, 'M3', spec.name);
  }
}

module.exports = { rowM3, legs };
