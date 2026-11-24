'use strict';
// Row M8 of G1 (E3.S6; `todo/PLAN_person_roads_pin_host_key.md`, `## Epics`, E3; `todo/PLAN_person_roads_pin_host_key_E3_S6_spec.md` §4): the entry is pinned to K1, K2 answers at its address, and the leg's handed
// config names a `KnownHostsCommand` that prints K2's line (and records each of its starts), with `VerifyHostKeyDNS no`. THE CONTROL FIRST: the control client with E1's words (a file of K1's line as both
// known-hosts files, no `KnownHostsCommand=none`) is accepted by K2 and the command's record holds at least one start, so the source is there and would be taken. Then the three roads, which say
// `KnownHostsCommand=none`: each of the four runs that start ends with 255 and the verification line, the command's record holds 0 starts for them, and K2 logs 0 accepted logins and 0 authentication attempts.
// One leg, `m8`. A proving run of this file passes no row: its numbers are "seen when it was built".
const fs = require('node:fs');
const path = require('node:path');
const rig = require('./itestRowRig.cjs');
const rec = require('./lib/rowRecord.cjs');
const ok = require('./lib/otherKeyRecord.cjs');
const shared = require('./itestRowOtherKey.cjs');

const SPEC = ok.OTHER_KEY_LEGS.find((one) => one.row === 'M8');

/** The recording command (§4.1) in `<leg>/khc/`: the line file (K2's line for `port`), the records folder and the command at mode 0700. Answers `{ command, records }`. */
function writeCommand(leg, port) {
  const dir = path.join(leg.dir, 'khc');
  const records = path.join(dir, 'records');
  fs.mkdirSync(records, { recursive: true });
  const lineFile = path.join(dir, 'line');
  fs.writeFileSync(lineFile, ok.knownHostsLineOf(port, fs.readFileSync(`${leg.k2}.pub`, 'utf8')), { mode: 0o600 });
  const command = path.join(dir, 'known_hosts_command');
  fs.writeFileSync(command, ok.khcScript(records, lineFile), { mode: 0o700 });
  fs.chmodSync(command, 0o700);
  return { command, records };
}

/** M8.0: under the leg's handed config the real client resolves the command to the leg's own file, and no DNS source is on. */
async function whichCheck(ctx, command, port) {
  const files = await shared.whichFiles(ctx, port);
  ctx.check(`${ctx.rig.label}: the leg's config names the recording command and no DNS source: ssh -G resolves knownhostscommand ${path.relative(ctx.rig.dir, command)} and verifyhostkeydns false (M8.0)`, files.code === 0 && files.command === command && files.dns === 'false', JSON.stringify(files));
}

/** M8.c, the control first (before the mark): E1's words of a file of K1's line, accepted by K2, and the command's record holds at least one start. Answers `{ record, starts }`. */
async function controlFirst(ctx, k2, records) {
  const leg = ctx.rig;
  const words = ok.e1WordsFor(shared.writePin(leg, 'control-k1', k2.port, leg.k1));
  const run = await shared.login(ctx, k2, words);
  const starts = ok.khcStarts(shared.khcRecords(records));
  const accepted = run.code === 0 && run.after.accepted === run.before.accepted + 1 && run.session === 'command';
  const record = { argv: run.argv, code: run.code, stdout: run.stdout, stderr: run.stderr };
  ctx.check(`${leg.label}: the control client with E1's words (a file of K1's line for K2's port as both known-hosts files) was accepted by K2: exit 0, K2 logged one accepted login with a command session, and the command's record holds at least one start (M8.c)`, JSON.stringify(shared.wordsOf(run.argv)) === JSON.stringify(words) && accepted && starts.length >= 1, JSON.stringify({ ...record, before: run.before, after: run.after, session: run.session, starts: starts.length }));
  ctx.info(`${leg.label}: the command was started ${starts.length} time(s) by the control; parent pids ${JSON.stringify(starts.map((one) => one.ppid))}`);
  return { record, starts };
}

async function m8(ctx) {
  const { check, info } = ctx;
  const leg = ctx.rig;
  const label = leg.label;
  const given = shared.standing(ctx);
  const k2 = await rig.counterpart(check, leg, 'k2', leg.k2, { extra: given.stand.extra });
  if (k2 === undefined) {
    return;
  }
  const { command, records } = writeCommand(leg, k2.port);
  const config = rig.handConfig(leg, shared.optionsOf(leg, SPEC, { path: command }));
  await whichCheck(ctx, command, k2.port);
  const control = await controlFirst(ctx, k2, records);
  const roads = rig.openRoads(leg, k2.port, { credential: 'named', answer: rig.installAnswer(leg) });
  rig.mark(leg, roads, [k2]);
  const beforeMark = shared.khcRecords(records).length;
  info(`${label}: cold: the roads' clicks: ${JSON.stringify(await shared.driveRefusedRoads(ctx, roads))}`);
  await shared.logsArrived(roads, [k2], shared.connectionStarts(leg, roads).length);
  const counts = rig.countsOf(leg, roads, [k2]);
  const bridgeStderr = shared.refusedChecks(ctx, label, counts, 'M8', { noInstall: false });
  const starts = shared.connectionStarts(leg, roads);
  const sloppy = starts.filter((start) => JSON.stringify(ctx.product.argv.valuesOf(start.argv, 'KnownHostsCommand')) !== JSON.stringify(['none'])).map((start) => ctx.product.argv.valuesOf(start.argv, 'KnownHostsCommand'));
  check(`${label}: each recorded argv of a connection start holds KnownHostsCommand=none, once (M8.2)`, starts.length > 0 && sloppy.length === 0, JSON.stringify({ starts: starts.length, sloppy }));
  const afterMark = shared.khcRecords(records);
  check(`${label}: the command's record holds 0 starts after the mark: none for the roads' runs (M8.3)`, afterMark.length === beforeMark, JSON.stringify({ beforeMark, afterMark: afterMark.length, starts: ok.khcStarts(afterMark.slice(beforeMark)) }));
  const log = counts.counterparts[0];
  check(`${label}: K2 logged a connection for each connection start, 0 accepted logins and 0 authentication attempts after the mark (M8.4)`, counts.starts.connectionStarts > 0 && log.connections >= counts.starts.connectionStarts && log.accepted.length === 0 && log.authAttempts === 0 && !log.lines.some((line) => rec.AUTH_ATTEMPT.test(line)), JSON.stringify({ connectionStarts: counts.starts.connectionStarts, connections: log.connections, accepted: log.accepted, attempts: log.authAttempts }));
  shared.standInGuard(ctx, label, given, roads, 'M8.5');
  shared.stderrFilesCheck(ctx, label);
  await roads.w.bridges.dispose();
  await rig.nothingLeft(check, label, leg, roads, rig.callsOf(leg, roads, ctx.product));
  await rig.endCounterpart(check, leg, k2, 'K2');
  const source = { command: path.relative(leg.dir, command), sha256: shared.sha256(command), records: { beforeMark, afterMark: afterMark.length }, ppids: control.starts.map((one) => one.ppid) };
  rig.evidence(leg, roads, [k2], { ...counts, ...shared.commonEvidence(SPEC, config, counts, {}), source, bridgeStderr, control: control.record, socket: null, installShown: null, switchMark: null });
}

const legs = { m8 };

/** M8: its one leg, in a leg process of its own. */
async function rowM8(check, top) {
  await rig.runLeg(check, top, 'M8', SPEC.name);
}

module.exports = { rowM8, legs, writeCommand };
