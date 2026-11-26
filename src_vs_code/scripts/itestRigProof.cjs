'use strict';
// The rig's own proof RP of G1 (E3.S4; `todo/PLAN_person_roads_pin_host_key_E3_S4_spec.md` §5). Not a row: it shows that the parts of the rig that no row of E3.S4
// uses work, before E3.S5 and E3.S6 use them. Each part is a leg of its own (`rig-…`), in its own leg process, with its evidence line and the real resolve.
// Its numbers are "seen when it was built".
//   RP1 `rig-warm`            cold, then warm in the same world, then another pin in the same window (`replaceHostKey`): the state is the leg's own;
//   RP2 `rig-switch-whole`    the install's question held; K1 ended whole and K2 takes its port: the install run is refused, K2 sees no authentication;
//   RP3 `rig-switch-listener` the same, with the listener of K1 stopped alone (E3.S2 left that unmeasured);
//   RP4 `rig-control`         the control client with E1's words: accepted by K1, refused by K2 with the pin of K1 for its port;
//   RP5 `rig-resolve`         the real resolve in the leg process, each credential once: the roads' ssh went through the shim.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const rig = require('./itestRowRig.cjs');
const rec = require('./lib/rowRecord.cjs');

const { sec, standIn, within, me } = rig;
const VERIFY_FAILED = sec.VERIFY_FAILED;
const LABEL = 'RP';

/** K2's pin: the text a saved host key has, of K2's public key. */
const pinOfK2 = (leg) => leg.product.formatHostKey(leg.product.parseHostKey(fs.readFileSync(`${leg.k2}.pub`, 'utf8')));

async function warmLeg(ctx) {
  const { check, product } = ctx;
  const leg = ctx.rig;
  const k1 = await rig.counterpart(check, leg, 'k1', leg.k1);
  if (k1 === undefined) {
    return;
  }
  const roads = rig.openRoads(leg, k1.port, { credential: 'named', gate: false });
  check(`${leg.label}: cold: a new world, 0 runs of ssh -V and 0 starts of the client before the first click`, roads.state === 'cold' && roads.questions.length === 0 && sec.recordedStarts(leg).length === 0, JSON.stringify({ questions: roads.questions.length }));
  await rig.warm(check, leg, roads, [k1]);
  const first = rig.countsOf(leg, roads, [k1]);
  check(`${leg.label}: the warming call is outside the counts: after the mark the leg has 0 starts, and the state is warm`, roads.state === 'warm' && first.starts.total === 0 && first.counterparts[0].connections === 0, JSON.stringify({ state: roads.state, starts: first.starts.total }));
  roads.w.replaceHostKey(pinOfK2(leg));
  const click = await rig.press(leg, roads, 'installRemoteCli', 30_000);
  const counts = rig.countsOf(leg, roads, [k1]);
  const sentence = product.refusedHostKeySentence(product.world.ROW.node.name);
  const shown = roads.w.said.slice(rig.markOf(roads).said).filter((one) => one.text.includes(sentence));
  check(`${leg.label}: the second call, after the pin was replaced: 0 questions, ONE connection start, ended with 255 and the verification line, sentence C shown once, K1 logged no accepted login after the mark`, click.ended && counts.starts.questions === 0 && counts.starts.connectionStarts === 1 && counts.runs.length === 1 && counts.runs[0].exitCode === 255 && counts.runs[0].stderr.includes(VERIFY_FAILED) && shown.length === 1 && counts.counterparts[0].accepted.length === 0, JSON.stringify({ click, starts: counts.starts.total, questions: counts.starts.questions, runs: counts.runs.map((run) => run.exitCode), shown: shown.length, accepted: counts.counterparts[0].accepted }));
  await rig.endCounterpart(check, leg, k1, 'K1');
  rig.evidence(leg, roads, [k1]);
}

/** RP2 and RP3: the switch while the install's question is held; `stop` is `whole` or `listener`. */
async function switchLeg(ctx, stop) {
  const { check, product } = ctx;
  const leg = ctx.rig;
  const stand = standIn.installStandIn(leg, crypto.randomUUID());
  const k1 = await rig.counterpart(check, leg, 'k1', leg.k1, { extra: stand.extra });
  if (k1 === undefined) {
    return;
  }
  const answer = rig.installAnswer(leg, { held: true });
  const roads = rig.openRoads(leg, k1.port, { credential: 'named', answer });
  const click = rig.pressNow(leg, roads, 'installRemoteCli');
  const asked = await within(30_000, () => roads.w.asked.length >= 1);
  check(`${leg.label}: the install reached its question, and it is held open`, asked && !click.settled(), JSON.stringify({ asked: roads.w.asked.length }));
  const k2 = await rig.theSwitch(check, leg, k1, { name: 'k2', hostKey: leg.k2, extra: stand.extra, stop });
  answer.release();
  const ended = await within(60_000, () => click.settled());
  const install = sec.runOf(roads, product.installCommand());
  const log = k2 === undefined ? undefined : rec.logCounts(k2.sshd.stderr, me);
  check(`${leg.label}: after the switch the install run started once and ended with 255 and "Host key verification failed.", K2 logged 0 authentication attempts, and the stand-in's marker was not written`, ended && roads.outcomes.filter((one) => one.argv.at(-1) === product.installCommand()).length === 1 && install?.outcome?.exitCode === 255 && install.outcome.stderr.includes(VERIFY_FAILED) && log?.authAttempts === 0 && !fs.existsSync(stand.marker), JSON.stringify({ ended, install: install?.outcome?.exitCode, attempts: log?.authAttempts, marker: fs.existsSync(stand.marker) }));
  if (k2 !== undefined) {
    await rig.endCounterpart(check, leg, k2, 'K2');
  }
  await rig.endCounterpart(check, leg, k1, 'K1');
  rig.evidence(leg, roads, [k1, ...(k2 === undefined ? [] : [k2])], { stop });
}

async function controlLeg(ctx) {
  const { check, product } = ctx;
  const leg = ctx.rig;
  const k1 = await rig.counterpart(check, leg, 'k1', leg.k1);
  const k2 = await rig.counterpart(check, leg, 'k2', leg.k2);
  if (k1 === undefined || k2 === undefined) {
    return;
  }
  const pin = await rig.pinFileOf(leg, 'k1', k1.port, leg.k1);
  const accepted = await rig.controlClient(leg, { port: k1.port, pin });
  const words = product.argv.hostKeyWordsOf(accepted.argv);
  const k1log = rec.logCounts(k1.sshd.stderr, me);
  check(`${leg.label}: the control client with E1's words (the three pairs) against K1 ended with 0, and K1 logged one accepted login`, accepted.code === 0 && words.length === 6 && k1log.accepted.length === 1, JSON.stringify({ code: accepted.code, words, accepted: k1log.accepted, stderr: accepted.stderr }));
  const pinAtK2 = await rig.pinFileOf(leg, 'k1-at-k2', k2.port, leg.k1);
  const refused = await rig.controlClient(leg, { port: k2.port, pin: pinAtK2 });
  const k2log = rec.logCounts(k2.sshd.stderr, me);
  check(`${leg.label}: against K2, with the pin of K1 for K2's port: exit 255 and "Host key verification failed.", K2 logged a connection and 0 authentication attempts`, refused.code === 255 && refused.stderr.includes(VERIFY_FAILED) && k2log.connections >= 1 && k2log.authAttempts === 0, JSON.stringify({ code: refused.code, stderr: refused.stderr, connections: k2log.connections, attempts: k2log.authAttempts }));
  await rig.endCounterpart(check, leg, k2, 'K2');
  await rig.endCounterpart(check, leg, k1, 'K1');
  // This leg opens no world: its record is the counts of its two counterparts.
  console.log(`evidence ${JSON.stringify({ record: 1, row: leg.row, leg: leg.name, pid: process.pid, accepted: { k1: k1log.accepted, k2: k2log.accepted }, attempts: { k1: k1log.authAttempts, k2: k2log.authAttempts }, control: [{ code: accepted.code }, { code: refused.code }], sockets: [] })}`);
  fs.writeFileSync(path.join(leg.dir, 'evidence.json'), `${JSON.stringify({ record: 1, sockets: [] })}\n`);
}

/** RP5: the real resolve in the leg process, each credential once, K1 taking passwords. */
async function resolveLeg(ctx) {
  const { check, product } = ctx;
  const leg = ctx.rig;
  const k1 = await rig.counterpart(check, leg, 'k1', leg.k1, { passwords: true });
  if (k1 === undefined) {
    return;
  }
  const worlds = [];
  for (const credential of ['stored', 'named', 'password']) {
    const roads = rig.openRoads(leg, k1.port, { credential, gate: false });
    rig.mark(leg, roads, [k1]);
    const click = await rig.press(leg, roads, 'installRemoteCli', 30_000);
    const counts = rig.countsOf(leg, roads, [k1]);
    const call = rig.callsOf(leg, roads, product)[0];
    const probe = roads.outcomes[0];
    const through = counts.starts.questions === 1 && counts.starts.byRoad.install.connectionStarts === 1;
    const state = { credential, click: click.ended, questions: counts.starts.questions, probe: probe?.outcome?.exitCode, key: call?.keyFile ?? null };
    if (credential === 'stored') {
      check(`${leg.label}: stored key: the roads' ssh went through the shim (the question and the probe recorded), the probe named a key file keys/<pid>/call-<uuid>.key of its own, and it is gone after the click`, click.ended && through && probe?.outcome?.exitCode === 0 && /call-.+\.key$/.test(call?.keyFile ?? '') && !fs.existsSync(call.keyFile), JSON.stringify(state));
    } else if (credential === 'named') {
      check(`${leg.label}: named key: the probe named -i <the person's key file> and the call wrote no file`, click.ended && through && probe?.outcome?.exitCode === 0 && probe.argv.includes(leg.userKey) && call?.keyFile === undefined && Object.keys(rig.readFolder(roads.sampler.dir)).length === 0, JSON.stringify(state));
    } else {
      const log = rec.logCounts(k1.sshd.stderr, me);
      check(`${leg.label}: password: the probe ended with 255, K1 logged Failed password (the counterpart cannot check one), and the folder holds the window's helper askpass.sh only`, click.ended && through && probe?.outcome?.exitCode === 255 && log.passwords.failed >= 1 && Object.keys(rig.readFolder(roads.sampler.dir)).join() === 'askpass.sh', JSON.stringify({ ...state, failed: log.passwords.failed, folder: Object.keys(rig.readFolder(roads.sampler.dir)) }));
    }
    worlds.push(roads);
  }
  await rig.endCounterpart(check, leg, k1, 'K1');
  rig.evidence(leg, worlds[2], [k1], { worlds: worlds.map((roads) => ({ credential: roads.credential, runs: roads.outcomes.length })) });
}

const legs = {
  'rig-warm': warmLeg,
  'rig-switch-whole': (ctx) => switchLeg(ctx, 'whole'),
  'rig-switch-listener': (ctx) => switchLeg(ctx, 'listener'),
  'rig-control': controlLeg,
  'rig-resolve': resolveLeg,
};

/** Section 10 runs every leg of the proof, one leg process after another. */
async function rigProof(check, top) {
  for (const name of Object.keys(legs)) {
    await rig.runLeg(check, top, 'rig', name, `${LABEL} ${name}`);
  }
}

module.exports = { legs, rigProof };
