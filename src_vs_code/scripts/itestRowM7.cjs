'use strict';
// Row M7 of G1 (E3.S7; `todo/PLAN_person_roads_pin_host_key.md`, `## Epics`, E3; `todo/PLAN_person_roads_pin_host_key_E3_S7_spec.md` §2): the pin file is read as the one intended file where its path needs double
// quotes. The storage folder of a leg is `<leg>/st/<name>`, its name holding (a) a space, (b) one apostrophe, (c) a pair of apostrophes, (d) a space and an apostrophe, (e) a backslash as the folder's last
// character; for each the runs of M1 and of M2 (b), both legs (`m1Runs`, `mismatch`, `switchLeg`, with M7's own checks inside them), and for (c) the collision: a file at the path that the bare word would
// resolve to (the apostrophes taken out) holds K2's line, the pin file holds K1's; once the counterpart is K1, once K2. The twin is written by the leg when the call's pin file is known, before its client starts
// (the rig's `onPin`, the lead's answer A3). 17 legs, each its own process, world and counterpart(s). A proving run of this file passes no row: its numbers are "seen when it was built".
const fs = require('node:fs');
const path = require('node:path');
const rig = require('./itestRowRig.cjs');
const m1 = require('./itestRowM1.cjs');
const m2 = require('./itestRowM2.cjs');
const ok = require('./lib/otherKeyRecord.cjs');
const pr = require('./lib/pathRecord.cjs');
const shared = require('./itestRowOtherKey.cjs');
const paths = require('./itestRowPaths.cjs');

const { sec } = rig;

/** The fields of the evidence that every leg of M7 shares (§1.7). */
const fieldsOf = (leg, spec, rule) => ({ shape: spec.shape, folder: path.relative(leg.dir, leg.storage), word: spec.word, rule });

/**
 * The storage folder of the leg, then the product's rule asked with the complete pathname (M7.e0, for (e): "Before (e) drives a road, the run asks the product's rule for the complete pathname of its folder and
 * gets no refusal"). A refusal fails the leg and NO road is driven: the leg prints its evidence with `drove: false` and `undefined` is answered. Else answers the rule's answer.
 */
function begin(ctx, spec) {
  const leg = ctx.rig;
  paths.storageAt(ctx, spec.folder);
  const rule = paths.ruleOf(ctx);
  if (spec.shape === 'e') {
    ctx.check(`${leg.label}: the product's rule, asked with the complete pathname of the folder (<storage>/keys/<pid>/known_hosts-e1-<uuid>), answers no refusal (M7.e0)`, rule.answer === null, JSON.stringify(rule));
    if (rule.answer !== null) {
      paths.evidenceNone(leg, { ...fieldsOf(leg, spec, rule), drove: false });
      return undefined;
    }
  }
  return rule;
}

/** `-m1`: M1's runs and every one of its checks on the leg's storage folder, and M7.w. */
async function legM1(ctx, spec) {
  const { check } = ctx;
  const leg = ctx.rig;
  const rule = begin(ctx, spec);
  if (rule === undefined) {
    return;
  }
  const given = m1.standing(ctx);
  const k1 = await rig.counterpart(check, leg, 'k1', leg.k1, { extra: given.stand.extra });
  if (k1 === undefined) {
    return;
  }
  const roads = rig.openRoads(leg, k1.port, { credential: 'named', answer: rig.installAnswer(leg) });
  await m1.m1Runs(ctx, { label: leg.label, roads, k1, given });
  paths.wordCheck(ctx, leg.label, roads, spec);
  await rig.endCounterpart(check, leg, k1, 'K1');
  rig.evidence(leg, roads, [k1], { ...fieldsOf(leg, spec, rule), c20Ms: roads.questions[0]?.ms ?? null });
}

/** `-m2-mismatch`, `-m2-switch`: M2 (b)'s leg of that name with every M2 check, and M7's checks inside it (D4's `more`): M7.w, and in the mismatch leg M7.c1 to M7.c3. */
async function legM2(ctx, spec) {
  const leg = ctx.rig;
  const rule = begin(ctx, spec);
  if (rule === undefined) {
    return;
  }
  const global = ok.OTHER_KEY_LEGS.find((one) => one.name === `m2-${spec.run}-global`);
  const more = async (_ctx, roads) => {
    paths.wordCheck(ctx, leg.label, roads, spec);
    if (spec.run === 'mismatch') {
      paths.sentenceCChecks(ctx, leg.label, roads, spec);
    }
    return fieldsOf(leg, spec, rule);
  };
  await (spec.run === 'mismatch' ? m2.mismatch : m2.switchLeg)(ctx, global, more);
}

/** The first start of each pin file: the earliest `startedAt` of a run that names it, or the `spawnedAt` of the bridge that does. `null` when none was found. */
function firstStartOf(ctx, roads, pin) {
  const times = [
    ...roads.outcomes.filter((one) => sec.pinOf(ctx.product, one.argv) === pin).map((one) => one.startedAt),
    ...roads.bridges.filter((one) => sec.pinOf(ctx.product, one.argv) === pin).map((one) => one.spawnedAt),
  ];
  return times.length === 0 ? null : Math.min(...times);
}

/** M7.x0: each pin file of the leg got its twin (the apostrophes taken out, K2's line) BEFORE its first run started: 3 pin files, 3 twins. A twin written after the client started is red. */
function twinsCheck(ctx, label, roads, writer, port) {
  const leg = ctx.rig;
  const line = ok.knownHostsLineOf(port, fs.readFileSync(`${leg.k2}.pub`, 'utf8'));
  const pins = rig.callsOf(leg, roads, ctx.product).map((call) => call.pin);
  const twins = writer.twins.map((one) => ({ pin: path.relative(leg.dir, one.pin), twin: path.relative(leg.dir, one.twin), at: one.at, firstRunAt: firstStartOf(ctx, roads, one.pin), line: fs.existsSync(one.twin) && fs.readFileSync(one.twin, 'utf8') === line }));
  const good = twins.length === 3 && pins.length === 3 && pins.every((pin) => writer.twins.some((one) => one.pin === pin)) && twins.every((one) => one.firstRunAt !== null && one.at < one.firstRunAt && one.line);
  ctx.check(`${label}: each pin file of the leg got its twin (the apostrophes taken out, K2's line) before its first run started: 3 pin files, 3 twins (M7.x0)`, good, JSON.stringify({ pins: pins.length, twins }));
  return twins;
}

/** M7.c0: cold, as M1.2 and M12.0: 0 runs of `ssh -V` and 0 starts of the client before the first click. */
function coldCheck(ctx, roads) {
  ctx.check(`${ctx.rig.label}: cold: 0 runs of ssh -V and 0 starts of the client before the first click (M7.c0)`, roads.questions.length === 0 && sec.recordedStarts(ctx.rig).length === 0, JSON.stringify({ questions: roads.questions.length }));
}

/** The check of a control or a witness that runs the bare words by the real client: its record for the evidence. */
const recordOf = (controlled) => ({ argv: controlled.run.argv, code: controlled.run.code, stdout: controlled.run.stdout, stderr: controlled.run.stderr });

/** `m7-c-collision-k1`: K1 answers; the roads of M1 (the install to its end, the bridge, its check, close) read the pin file, not the twin: 5 accepted logins. The witness: the bare words read the twin and K1 refuses. */
async function collisionK1(ctx, spec) {
  const { check, info } = ctx;
  const leg = ctx.rig;
  const label = leg.label;
  const rule = begin(ctx, spec);
  const given = m1.standing(ctx);
  const k1 = await rig.counterpart(check, leg, 'k1', leg.k1, { extra: given.stand.extra });
  if (k1 === undefined) {
    return;
  }
  const writer = paths.twinWriter(ctx, k1.port, leg.k2);
  const roads = rig.openRoads(leg, k1.port, { credential: 'named', answer: rig.installAnswer(leg), onPin: writer.onPin });
  coldCheck(ctx, roads);
  info(`${label}: the roads' drive: ${JSON.stringify(await m1.driveFive(ctx, roads))}`);
  const k1log = await m1.acceptedOf(k1, 5);
  const twins = twinsCheck(ctx, label, roads, writer, k1.port);
  paths.wordCheck(ctx, label, roads, spec);
  const sessions = k1log.accepted.map((one) => one.session).sort().join(',');
  check(`${label}: K1 logged exactly 5 accepted logins, one per run: 4 with a command session and 1 with none; the 4 runs of the runner ended with 0 (M7.x1)`, k1log.accepted.length === 5 && sessions === 'command,command,command,command,none' && roads.outcomes.length === 4 && roads.outcomes.every((one) => one.outcome?.exitCode === 0), JSON.stringify({ accepted: k1log.accepted, runs: roads.outcomes.map((one) => one.outcome?.exitCode) }));
  const witness = await paths.controlBare(ctx, k1, spec.folder);
  const run = witness.run;
  check(`${label}: the witness: E1's words with the path bare, against K1, ended with 255 and the verification line, and K1 logged no new accepted login: the bare word reads the twin (M7.x2)`, paths.bareWordsOk(witness) && run.code === 255 && ok.hasLine(run.stderr) && run.after.accepted === run.before.accepted, JSON.stringify({ ...recordOf(witness), before: run.before, after: run.after }));
  await rig.nothingLeft(check, label, leg, roads, rig.callsOf(leg, roads, ctx.product));
  await rig.endCounterpart(check, leg, k1, 'K1');
  rig.evidence(leg, roads, [k1], { ...fieldsOf(leg, spec, rule), twins, witness: recordOf(witness) });
}

/** `m7-c-collision-k2`: K2 answers; the four runs that start are refused (the pin file holds K1's line), K2 logs nothing. The control: the bare words read the twin and K2 ACCEPTS them. */
async function collisionK2(ctx, spec) {
  const { check, info } = ctx;
  const leg = ctx.rig;
  const label = leg.label;
  const rule = begin(ctx, spec);
  const given = shared.standing(ctx);
  const k2 = await rig.counterpart(check, leg, 'k2', leg.k2, { extra: given.stand.extra });
  if (k2 === undefined) {
    return;
  }
  const writer = paths.twinWriter(ctx, k2.port, leg.k2);
  const roads = rig.openRoads(leg, k2.port, { credential: 'named', answer: rig.installAnswer(leg), onPin: writer.onPin });
  rig.mark(leg, roads, [k2]);
  coldCheck(ctx, roads);
  info(`${label}: cold: the roads' clicks: ${JSON.stringify(await shared.driveRefusedRoads(ctx, roads))}`);
  await shared.logsArrived(roads, [k2], shared.connectionStarts(leg, roads).length);
  const counts = rig.countsOf(leg, roads, [k2]);
  const bridgeStderr = shared.refusedChecks(ctx, label, counts, 'M7.y1');
  paths.k2Counts(ctx, label, counts, 'M7.y2');
  const twins = twinsCheck(ctx, label, roads, writer, k2.port);
  paths.wordCheck(ctx, label, roads, spec);
  shared.standInGuard(ctx, label, given, roads, 'M7.y4');
  const control = await paths.controlBare(ctx, k2, spec.folder);
  const run = control.run;
  const accepted = run.code === 0 && run.after.accepted === run.before.accepted + 1 && run.session === 'command';
  check(`${label}: the control client with E1's words (the path bare: <leg>/st/x'y'z/control/known_hosts-control, K1's line; its twin K2's) was accepted by K2: exit 0, and K2 logged one more accepted login with a command session: it read the other file (M7.y3)`, paths.bareWordsOk(control) && accepted, JSON.stringify({ ...recordOf(control), before: run.before, after: run.after, session: run.session }));
  shared.stderrFilesCheck(ctx, label);
  await roads.w.bridges.dispose();
  await rig.nothingLeft(check, label, leg, roads, rig.callsOf(leg, roads, ctx.product));
  await rig.endCounterpart(check, leg, k2, 'K2');
  rig.evidence(leg, roads, [k2], { ...counts, ...fieldsOf(leg, spec, rule), twins, control: recordOf(control), bridgeStderr });
}

const RUNS = { m1: legM1, mismatch: legM2, switch: legM2, 'collision-k1': collisionK1, 'collision-k2': collisionK2 };
const legs = Object.fromEntries(pr.M7_LEGS.map((spec) => [spec.name, (ctx) => RUNS[spec.run](ctx, spec)]));

/** M7: every leg of the table, in its order, each in a leg process of its own. */
async function rowM7(check, top) {
  for (const spec of pr.M7_LEGS) {
    await rig.runLeg(check, top, 'M7', spec.name);
  }
}

module.exports = { rowM7, legs, begin, coldCheck, twinsCheck, recordOf };
