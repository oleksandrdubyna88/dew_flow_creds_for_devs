'use strict';
// Row M11 (c) and (d) of G1 (E3.S9; `todo/PLAN_person_roads_pin_host_key_E3_S9_spec.md` §1.4, §3.4): the client that cannot say what it is. (c) answers `-V` at once with no version at the start of its stderr and the exit
// code 0 (the product reads `unreadable`, and sentence F says `exit code 0`); (d) never answers (the asker's limit of 10 s ends it, and sentence F says it did not start or did not end in time). In both the pinned call is
// refused before any connection: no pin file written, no connection start, 0 connections and 0 authentication attempts in the counterpart's log, no bridged row. Each leg drives ONE road (`install` or `bridge`), cold, in a
// world of its own; the parent writes the program of the leg before the leg process starts and hands it to the rig as the leg's real client (D1), so every `ssh` of the road goes shim -> program. The program records its
// start as the shim does and passes any argv but `-V` on to the older client (so a defect that went on to a connection would make a REAL one, which K1's log would show). The times of (d) are taken from the click.
// A proving run of this file passes no row: its numbers are "seen when it was built".
const fs = require('node:fs');
const path = require('node:path');
const rig = require('./itestRowRig.cjs');
const off = require('./lib/offRigRecord.cjs');
const shared = require('./itestRowOtherKey.cjs');

const { sec, alive, within } = rig;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const CASES = {
  'm11-c-install': { name: 'm11-c-install', part: 'c', road: 'install' }, 'm11-c-bridge': { name: 'm11-c-bridge', part: 'c', road: 'bridge' },
  'm11-d-install': { name: 'm11-d-install', part: 'd', road: 'install' }, 'm11-d-bridge': { name: 'm11-d-bridge', part: 'd', road: 'bridge' },
};
const COMMANDS = { install: 'installRemoteCli', bridge: 'openRemoteBridge' };
/** After the program is gone, the leg waits this long for a start or a connection that a defect would add. */
const SETTLE_MS = 2_000;

/**
 * The program of one leg, written by the PARENT before the leg process starts: `<top.dir>/programs/<leg>/ssh` (mode 0700), its records in `<top.dir>/programs/<leg>/records`, and the older client (`top.older`) as
 * its passthrough. Answers its path: the leg's real client.
 */
function writeProgram(top, spec) {
  const dir = path.join(top.dir, 'programs', spec.name);
  const records = path.join(dir, 'records');
  fs.mkdirSync(records, { recursive: true });
  const file = path.join(dir, 'ssh');
  fs.writeFileSync(file, (spec.part === 'c' ? off.answersAtOnce : off.neverAnswers)(records, top.older), { mode: 0o700 });
  return file;
}

/** The program's own record of its start, when it is there: `{ pid, start, argv, whole }`. */
const startOfProgram = (leg) => sec.recordedStarts({ records: path.join(path.dirname(leg.dir), 'programs', leg.name, 'records') })[0];

/** The first 50 ms poll at which `program` is not the process that was recorded (`performance.now()`), within `ms`; `null` when it is still alive. */
async function goneAt(program, ms) {
  const until = performance.now() + ms;
  while (performance.now() < until) {
    if (!alive(program)) {
      return performance.now();
    }
    await sleep(50);
  }
  return null;
}

/** The leg's checks M11.x1 to M11.x5 over the counts after the mark. */
function refusalChecks(ctx, spec, roads, counts, program, told) {
  const { check, product } = ctx;
  const leg = ctx.rig;
  const label = leg.label;
  const from = rig.markOf(roads);
  const list = counts.starts.list;
  check(`${label}: the record holds exactly ONE start, argv -V alone, and 0 connection starts (M11.x1)`, list.length === 1 && list[0].whole && list[0].kind === 'question' && counts.starts.connectionStarts === 0, JSON.stringify({ starts: list.length, kinds: list.map((one) => one.kind), connectionStarts: counts.starts.connectionStarts }));
  const own = program === undefined ? [] : [program];
  check(`${label}: the program recorded one start with the same pid as the shim (M11.x1p)`, own.length === 1 && own[0].whole && list.length === 1 && list[0].pid === own[0].pid, JSON.stringify({ shim: list.map((one) => one.pid), program: own.map((one) => one.pid) }));
  const k1 = counts.counterparts[0];
  check(`${label}: K1 logged 0 connections and 0 authentication attempts after the mark (M11.x2)`, k1.connections === 0 && k1.authAttempts === 0 && k1.accepted.length === 0, JSON.stringify({ connections: k1.connections, attempts: k1.authAttempts, accepted: k1.accepted }));
  const named = (file) => /^known_hosts-e1-/.test(file);
  const held = roads.sampler.samples().filter((sample) => sample.t >= told.t0 && Object.keys(sample.files).some(named));
  const after = Object.keys(rig.readFolder(roads.sampler.dir)).filter(named);
  check(`${label}: no sample of keys/<pid>/ from the click to the end held a known_hosts-e1-<uuid> file, and the folder holds none after (M11.x3)`, roads.sampler.samples().length > 0 && held.length === 0 && after.length === 0, JSON.stringify({ samples: roads.sampler.samples().length, held: held.length, after }));
  const errors = roads.w.said.slice(from.said).filter((one) => one.kind === 'error').map((one) => one.text);
  const how = spec.part === 'c' ? `(${off.F_HOW.code(0)})` : `(${off.F_HOW.none})`;
  check(`${label}: exactly one error message is the road's prefix and the product's sentence F for ${spec.part === 'c' ? 'exit code 0' : 'no exit code'}; it holds F's pinned words and ${how} (M11.x4)`, errors.length === 1 && told.count === 1 && errors[0].includes(off.F_WORDS) && errors[0].includes(how), JSON.stringify(errors));
  if (spec.road === 'install') {
    check(`${label}: no question was asked and no run started (M11.x5)`, roads.w.asked.length === from.asked && roads.outcomes.length === from.outcomes, JSON.stringify({ asked: roads.w.asked.length - from.asked, runs: roads.outcomes.length - from.outcomes }));
  } else {
    check(`${label}: no bridge was spawned, the manager holds no open bridge of the entry, and the socket check has no start of any kind (M11.x5)`, roads.bridges.length === from.bridges && !roads.w.bridges.isOpen(product.world.KEY) && list.every((one) => one.kind === 'question'), JSON.stringify({ bridges: roads.bridges.length - from.bridges, open: roads.w.bridges.isOpen(product.world.KEY), kinds: list.map((one) => one.kind) }));
  }
}

/** M11.c6 (c), M11.d6 and M11.d7 (d): the times from the click, and the program gone by its recorded pid and start time. */
function timeChecks(ctx, spec, times, program) {
  const { check } = ctx;
  const label = ctx.rig.label;
  const seconds = (ms) => (ms === null || ms === undefined ? null : Number(((ms - times.t0) / 1000).toFixed(2)));
  if (spec.part === 'c') {
    check(`${label}: the program is gone by its recorded pid and start time within 5 s of the click (M11.c6)`, program !== undefined && times.tGone !== null && times.tGone - times.t0 <= 5_000 && !alive(program), JSON.stringify({ toGone: seconds(times.tGone) }));
    return;
  }
  const judged = off.timesOk(times);
  check(`${label}: from the start of the command to sentence F: ${seconds(times.tF)} s, and to the end of the program: ${seconds(times.tGone)} s; each between 10 s and 15 s (M11.d6)`, judged.window, JSON.stringify(times));
  check(`${label}: the program is gone by its recorded pid and start time, never by name, no later than 5 s after sentence F (M11.d7)`, program !== undefined && judged.gone && !alive(program), JSON.stringify({ toF: seconds(times.tF), toGone: seconds(times.tGone) }));
}

/** One leg of (c) or (d): one road, cold, in a world of its own; K1 (pinned K1, `VERBOSE`) is there so that "0 connections in its log" can fail. */
async function neverLeg(ctx, spec) {
  const { check, info, product } = ctx;
  const leg = ctx.rig;
  const label = leg.label;
  leg.evidenceExtra = { client: { program: `a program of the leg that ${spec.part === 'c' ? 'answers -V at once with no version' : 'never answers -V'}`, part: spec.part, road: spec.road } };
  const name = product.world.ROW.node.name;
  const prefix = spec.road === 'install' ? `Cannot reach "${name}": ` : `Cannot bridge to "${name}": `;
  const sentence = product.pinClientSentence(name, spec.part === 'c' ? 0 : null);
  const k1 = await rig.counterpart(check, leg, 'k1', leg.k1);
  if (k1 === undefined) {
    return;
  }
  const roads = rig.openRoads(leg, k1.port, { credential: 'named', answer: async () => undefined });
  check(`${label}: cold: 0 runs of ssh -V and 0 starts before the click (M11.x0)`, roads.questions.length === 0 && sec.recordedStarts(leg).length === 0, JSON.stringify({ questions: roads.questions.length }));
  const mark = rig.mark(leg, roads, [k1]);
  const click = rig.pressNow(leg, roads, COMMANDS[spec.road]);
  const t0 = click.startedAt;
  await within(30_000, () => off.toldF(roads.w.said, mark.said, prefix, sentence) >= 1);
  const tF = roads.w.said.slice(mark.said).find((one) => one.kind === 'error' && one.text === `${prefix}${sentence}`)?.at ?? null;
  await within(30_000, () => startOfProgram(leg)?.whole === true);
  const program = startOfProgram(leg);
  const tGone = program === undefined ? null : await goneAt(program, 30_000);
  await sleep(SETTLE_MS);
  const counts = rig.countsOf(leg, roads, [k1]);
  const told = { t0, count: off.toldF(roads.w.said, mark.said, prefix, sentence) };
  refusalChecks(ctx, spec, roads, counts, program, told);
  timeChecks(ctx, spec, { t0, tF, tGone }, program);
  const shown = roads.w.said.filter((one) => one.at > t0 && (tF === null || one.at < tF));
  info(`${label}: shown while waiting: ${JSON.stringify(shown)}`);
  if (program !== undefined && alive(program)) {
    try {
      process.kill(program.pid, 'SIGKILL'); // the check that asked it gone has already failed; the leg leaves nothing (by pid, while the start time is the recorded one)
    } catch {
      // it ended between the look and the signal
    }
  }
  shared.stderrFilesCheck(ctx, label);
  await roads.w.bridges.dispose();
  await rig.nothingLeft(check, label, leg, roads, rig.callsOf(leg, roads, product));
  await rig.endCounterpart(check, leg, k1, 'K1');
  rig.evidence(leg, roads, [k1], { c20: { toSentenceMs: tF === null ? null : tF - t0, toGoneMs: tGone === null ? null : tGone - t0, shownWhileWaiting: shown }, part: spec.part, road: spec.road, program: program === undefined ? null : { pid: program.pid, start: program.start } });
}

const legs = Object.fromEntries(Object.values(CASES).map((spec) => [spec.name, (ctx) => neverLeg(ctx, spec)]));

module.exports = { legs, writeProgram, CASES };
