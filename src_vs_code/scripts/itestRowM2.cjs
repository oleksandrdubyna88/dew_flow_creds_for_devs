'use strict';
// Row M2 of G1 (E3.S6; `todo/PLAN_person_roads_pin_host_key.md`, `## Epics`, E3; `todo/PLAN_person_roads_pin_host_key_E3_S6_spec.md` §2): the entry is pinned to K1 and the host at its address presents K2,
// which a known-hosts file lists: (a) the file that the client reads as the person's own, (b) the file that it reads as the system-wide one. Both files are the leg's own, named by the handed config
// (the client's `~` is in the person's real home, so (a) is the user-file SLOT: the owner's answer A1). Four legs, each its own process, world and counterpart(s):
//   `m2-mismatch-user`, `m2-mismatch-global`: K2 answers from the start; the three roads are refused (four runs start, no install run);
//   `m2-switch-user`, `m2-switch-global`: K1 answers the probe, the install's question is held, K1 is ended whole and K2 takes its port; the install run is refused.
// Then, against K2 and after the counts: in (b) the control (the two pairs of before E1, no `GlobalKnownHostsFile`: accepted by K2), in (a) a witness of the leg's own (no known-hosts word: the file of (a) is
// read and trusts K2). A proving run of this file passes no row: its numbers are "seen when it was built".
const path = require('node:path');
const rig = require('./itestRowRig.cjs');
const rec = require('./lib/rowRecord.cjs');
const ok = require('./lib/otherKeyRecord.cjs');
const shared = require('./itestRowOtherKey.cjs');

const { within, me } = rig;
const SPECS = Object.fromEntries(ok.OTHER_KEY_LEGS.filter((one) => one.row === 'M2').map((one) => [one.name, one]));
const SOCKET_WORDS = '0 forwards: the bridge\'s remote socket was never made: after the bridge\'s ssh ended its path does not exist and nothing listens on it (ss -lx)';

/** M2.0: under the leg's handed config the real client (`ssh -G`, no word of a call) resolves the two known-hosts files to the leg's own paths of §1.2, and neither is outside the leg's folder or `/dev/null`. */
async function whichCheck(ctx, spec, source, port) {
  const leg = ctx.rig;
  const files = await shared.whichFiles(ctx, port);
  const expected = { user: spec.source === 'user' ? source.path : '/dev/null', global: spec.source === 'global' ? source.path : '/dev/null' };
  const own = (value) => value === '/dev/null' || (typeof value === 'string' && value.startsWith(`${leg.dir}${path.sep}`));
  const role = spec.source === 'user' ? 'as the person\'s known-hosts file (a)' : 'as the system-wide known-hosts file (b)';
  ctx.check(`${leg.label}: the client reads ${path.relative(leg.dir, source.path)} ${role} (M2.0)`, files.code === 0 && files.user === expected.user && files.global === expected.global && own(files.user) && own(files.global), JSON.stringify({ files, expected }));
  return files;
}

/** The source of the leg, its handed config and M2.0, before the first click. Answers the evidence's `source` and the config's SHA-256. */
async function prepare(ctx, spec, port) {
  const leg = ctx.rig;
  const made = shared.writeSource(leg, spec, port);
  const config = rig.handConfig(leg, shared.optionsOf(leg, spec, made));
  const files = await whichCheck(ctx, spec, made, port);
  return { config, source: { role: made.role, path: path.relative(leg.dir, made.path), sha256: made.sha256, resolved: files[spec.source] } };
}

/**
 * After the counts, against K2 at `port`: in (b) the control with the two pairs of before E1 (M2.6), in (a) the witness with no known-hosts word (M2.7). Each is accepted by K2: exit 0 and ONE more accepted
 * login with a command session. Its words are literal (`lib/otherKeyRecord.cjs`); its pin file is written by the lib. Answers `{ kind, record }` for the evidence.
 */
async function controlOrWitness(ctx, spec, server, port) {
  const leg = ctx.rig;
  const label = leg.label;
  const control = spec.source === 'global';
  const words = control ? ok.beforeE1WordsFor(shared.writePin(leg, 'control-k1', port, leg.k1)) : [...ok.STRICT_ONLY];
  const run = await shared.login(ctx, server, words);
  const argvOk = JSON.stringify(shared.wordsOf(run.argv)) === JSON.stringify(words) && !run.argv.some((word) => /GlobalKnownHostsFile/i.test(word)) && (control || !run.argv.some((word) => /KnownHostsFile/i.test(word)));
  const accepted = run.code === 0 && run.after.accepted === run.before.accepted + 1 && run.session === 'command';
  const record = { argv: run.argv, code: run.code, stdout: run.stdout, stderr: run.stderr };
  if (control) {
    ctx.check(`${label}: the control client with the two pairs of before E1 (StrictHostKeyChecking=yes, UserKnownHostsFile=<a file of K1's line>, no GlobalKnownHostsFile) was accepted by K2: exit 0, and K2 logged one more accepted login, with a command session (M2.6)`, argvOk && accepted, JSON.stringify({ ...record, before: run.before, after: run.after, session: run.session }));
  } else {
    ctx.check(`${label}: the witness: the real client with StrictHostKeyChecking=yes and no known-hosts word was accepted by K2: exit 0, and K2 logged one more accepted login: the file of (a) is read and trusts K2 (M2.7)`, argvOk && accepted, JSON.stringify({ ...record, before: run.before, after: run.after, session: run.session }));
  }
  return { kind: control ? 'control' : 'witness', record };
}

/** The leaving checks, then the evidence: a bridge that a defect left open is closed first, so its files and its process do not redden checks that are not about it. */
async function leave(ctx, spec, given, roads, servers, counts, extra) {
  const leg = ctx.rig;
  shared.stderrFilesCheck(ctx, leg.label);
  await roads.w.bridges.dispose();
  await rig.nothingLeft(ctx.check, leg.label, leg, roads, rig.callsOf(leg, roads, ctx.product));
  await rig.endCounterpart(ctx.check, leg, servers.at(-1), servers.at(-1).name.toUpperCase());
  rig.evidence(leg, roads, servers, { ...counts, ...shared.commonEvidence(spec, extra.config, counts, {}), source: extra.source, bridgeStderr: extra.bridgeStderr ?? null, socket: extra.socket ?? null, [extra.kind]: extra.record, installShown: extra.shown ?? null, switchMark: extra.switchMark ?? null, ...extra.more });
}

/** M2.3: K2 logged a connection for each connection start, 0 accepted logins and 0 authentication attempts, and no line of the log is one that only a client past the key check causes. */
function k2Counts(ctx, label, counts, log) {
  const wanted = counts.starts.connectionStarts;
  ctx.check(`${label}: K2 logged a connection for each connection start, 0 accepted logins and 0 authentication attempts (M2.3)`, wanted > 0 && log.connections >= wanted && log.accepted.length === 0 && log.authAttempts === 0 && !log.lines.some((line) => rec.AUTH_ATTEMPT.test(line)), JSON.stringify({ connectionStarts: wanted, connections: log.connections, accepted: log.accepted, attempts: log.authAttempts }));
}

/**
 * The mismatch (§2.2): K2 answers at the entry's address from the start; the three roads are refused. E3.S7 (D4): `more(ctx, roads, counts, servers)` is called after M2.5 and before the control;
 * the fields it answers join the evidence. With none, the leg is as it was.
 */
async function mismatch(ctx, spec, more) {
  const { check, info } = ctx;
  const leg = ctx.rig;
  const label = leg.label;
  const given = shared.standing(ctx);
  const k2 = await rig.counterpart(check, leg, 'k2', leg.k2, { extra: given.stand.extra });
  if (k2 === undefined) {
    return;
  }
  const made = await prepare(ctx, spec, k2.port);
  const roads = rig.openRoads(leg, k2.port, { credential: 'named', answer: rig.installAnswer(leg) });
  rig.mark(leg, roads, [k2]);
  info(`${label}: cold: the roads' clicks: ${JSON.stringify(await shared.driveRefusedRoads(ctx, roads))}`);
  await shared.logsArrived(roads, [k2], shared.connectionStarts(leg, roads).length);
  const counts = rig.countsOf(leg, roads, [k2]);
  const bridgeStderr = shared.refusedChecks(ctx, label, counts, 'M2');
  k2Counts(ctx, label, counts, counts.counterparts[0]);
  const socket = await shared.socketChecks(ctx, label, roads, 'M2.4', SOCKET_WORDS);
  shared.standInGuard(ctx, label, given, roads, 'M2.5');
  const moreFields = more === undefined ? {} : await more(ctx, roads, counts, [k2]);
  const control = await controlOrWitness(ctx, spec, k2, k2.port);
  await leave(ctx, spec, given, roads, [k2], counts, { ...made, ...control, bridgeStderr, socket, more: moreFields });
}

/** The switch (§2.3): K1 answers the probe, the install's question is held, K1 is ended whole and K2 takes its port; the install run is refused. E3.S7 (D4): `more` is called after M2.s6, as in `mismatch`. */
async function switchLeg(ctx, spec, more) {
  const { check, info } = ctx;
  const leg = ctx.rig;
  const label = leg.label;
  const given = shared.standing(ctx);
  const k1 = await rig.counterpart(check, leg, 'k1', leg.k1, { extra: given.stand.extra });
  if (k1 === undefined) {
    return;
  }
  const made = await prepare(ctx, spec, k1.port);
  const answer = rig.installAnswer(leg, { held: true });
  const roads = rig.openRoads(leg, k1.port, { credential: 'named', answer });
  rig.mark(leg, roads, [k1]);
  const run = await shared.driveSwitch(ctx, spec, roads, answer, k1, given.stand.extra);
  const { k2 } = run;
  if (k2 === undefined) {
    return;
  }
  await shared.acceptedAfter(k1, 0);
  await within(3_000, () => rec.logCounts(k2.sshd.stderr, me).connections >= 1);
  const counts = rig.countsOf(leg, roads, [k1, k2]);
  const [k1log, k2log] = counts.counterparts;
  check(`${label}: K1 logged the probe as accepted: exactly one accepted login, with a command session (M2.s2)`, k1log.accepted.length === 1 && k1log.accepted[0].session === 'command', JSON.stringify(k1log.accepted));
  const installs = counts.runs.filter((one) => one.kind === 'install');
  const started = counts.starts.list.filter((one) => one.kind === 'install').length;
  check(`${label}: after the switch the install run started once and ended with exit code 255 and the verification line, and K2 logged a connection for it (M2.s3)`, run.ended && started === 1 && installs.length === 1 && installs[0].exitCode === 255 && ok.hasLine(installs[0].stderr) && k2log.connections >= 1, JSON.stringify({ ended: run.ended, started, installs, connections: k2log.connections }));
  check(`${label}: K2 logged 0 accepted logins and 0 authentication attempts (M2.s4)`, k2log.accepted.length === 0 && k2log.authAttempts === 0, JSON.stringify({ accepted: k2log.accepted, attempts: k2log.authAttempts }));
  shared.standInGuard(ctx, label, given, roads, 'M2.s5', 'the stand-in\'s marker was not written');
  check(`${label}: the install's click ended within 60 s after the answer, and what it showed was recorded word for word (M2.s6)`, run.ended && run.shown.length >= 1, JSON.stringify(run.shown));
  info(`${label}: what the install showed after the answer: ${JSON.stringify(run.shown)}`);
  const moreFields = more === undefined ? {} : await more(ctx, roads, counts, [k1, k2]);
  const control = await controlOrWitness(ctx, spec, k2, k1.port);
  await leave(ctx, spec, given, roads, [k1, k2], counts, { ...made, ...control, shown: run.shown, switchMark: run.switchMark, more: moreFields });
}

const legs = Object.fromEntries(Object.values(SPECS).map((spec) => [spec.name, (ctx) => (spec.scenario === 'mismatch' ? mismatch(ctx, spec) : switchLeg(ctx, spec))]));

/** M2: every `m2-*` leg of the table, in its order, each in a leg process of its own. */
async function rowM2(check, top) {
  for (const spec of Object.values(SPECS)) {
    await rig.runLeg(check, top, 'M2', spec.name);
  }
}

module.exports = { rowM2, legs, mismatch, switchLeg };
