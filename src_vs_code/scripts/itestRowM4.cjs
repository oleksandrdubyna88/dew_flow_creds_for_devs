'use strict';
// Row M4 of G1 (E3.S5; `todo/PLAN_person_roads_pin_host_key.md`, `## Epics`, E3; `todo/PLAN_person_roads_pin_host_key_E3_S5_spec.md` §1.5, §4): a saved host key of
// the entry that is absent, that cannot be used, or whose file cannot be written. Fifteen legs, each its own process, world and counterpart, each with the real
// resolve over a vault of its own credential:
//   (a) absent (nothing, an empty text, white space only): the five runs of M1 are unpinned, `accept-new`, no question, no pin file, and K1 logs 5 logins;
//   (b) a text that does not parse, (c) a parsed key on a host that cannot form a line, (d) a pin write that fails (the key folder at 0500): each on each road,
//       cold and warm, in `itestRowRefused.cjs`.
// Each check holds the words of M4's last column. A proving run of this file passes no row: its numbers are "seen when it was built".
const fs = require('node:fs');
const rig = require('./itestRowRig.cjs');
const rec = require('./lib/rowRecord.cjs');
const refused = require('./lib/refusedRecord.cjs');
const refusedLeg = require('./itestRowRefused.cjs');
const m1 = require('./itestRowM1.cjs');

const { sec, standIn } = rig;
const NOT_E2 = ['UserKnownHostsFile', 'GlobalKnownHostsFile'];
const E2_PAIRS = ['VerifyHostKeyDNS', 'KnownHostsCommand', 'LogLevel'];

/** A.2: the install ended with its run at 0 and the product's message for an installed `creds`; the bridge opened, its check ended with 0; *Close* ended the bridge. */
function ranChecks(ctx, label, roads, stand, drove) {
  const { check, product } = ctx;
  const w = roads.w;
  const install = sec.runOf(roads, product.installCommand());
  const outcome = install?.outcome === undefined ? undefined : product.interpretInstall(install.outcome.stdout, install.outcome.stderr, install.outcome.exitCode);
  const message = `\`creds\` is installed on "${product.world.ROW.node.name}" at ${stand.bin}/creds.`;
  const sweep = sec.runOf(roads, product.sweepCommand(rig.me));
  const mode = sec.runOf(roads, product.modeCheckCommand({ path: drove.opened.remote ?? '' }));
  const installed = drove.install.ended && install?.outcome?.exitCode === 0 && outcome?.kind === 'installed' && w.infos.includes(message);
  const bridged = drove.opened.click.ended && drove.opened.bound && drove.ran && sweep?.outcome?.exitCode === 0 && mode?.outcome?.exitCode === 0 && drove.closed.ended;
  check(`${label}: the five runs ran: the install ended with its run at 0 and the product's message for an installed creds; the bridge opened with its socket, the sweep and the mode check ended with 0; Close ended the bridge (A.2)`, installed && bridged,
    JSON.stringify({ install: install?.outcome?.exitCode, outcome, infos: w.infos, opened: drove.opened, ran: drove.ran, sweep: sweep?.outcome?.exitCode, mode: mode?.outcome?.exitCode, closed: drove.closed.ended }));
}

/** A.3 and A.4: the shim's 5 starts, all connection starts and none `-V`; each argv says `accept-new` and none of the pins' words. */
function startChecks(ctx, label, roads, counts) {
  const { check, product } = ctx;
  const leg = ctx.rig;
  const kinds = counts.starts.list.filter((one) => one.connection).map((one) => one.kind).sort();
  check(`${label}: the shim recorded exactly 5 starts, all 5 connection starts (the probe, the install run, the bridge, the sweep, the mode check), and 0 starts with -V: cold, an unpinned call is not asked (A.3)`,
    counts.starts.total === 5 && counts.starts.connectionStarts === 5 && counts.starts.questions === 0 && kinds.join(',') === 'bridge,install,mode,probe,sweep' && counts.question.length === 0, JSON.stringify({ total: counts.starts.total, kinds, questions: counts.starts.questions }));
  const connections = sec.recordedStarts(leg).filter((one) => rec.isConnectionStart(one.argv));
  const said = (one, name) => product.argv.valuesOf(one.argv, name);
  const wrong = connections.filter((one) => said(one, 'StrictHostKeyChecking').join() !== 'accept-new' || [...NOT_E2, ...E2_PAIRS].some((name) => said(one, name).length > 0));
  check(`${label}: each of the 5 argvs carries StrictHostKeyChecking=accept-new, no UserKnownHostsFile and no GlobalKnownHostsFile, and none of VerifyHostKeyDNS, KnownHostsCommand, LogLevel (A.4)`, connections.length === 5 && wrong.length === 0, JSON.stringify(wrong.map((one) => one.argv)));
}

/** A.5 and A.6: K1's 5 accepted logins (4 with a command, 1 with none); no pin file in any sample or listing, and no argv names a known-hosts file. */
async function logChecks(ctx, label, roads, k1) {
  const { check } = ctx;
  const leg = ctx.rig;
  const log = await m1.acceptedOf(k1, 5);
  const sessions = log.accepted.map((one) => one.session).sort().join(',');
  check(`${label}: K1 logged exactly 5 accepted logins (4 with a command, 1 with none), and 5 client ports reached authentication (A.5)`, log.accepted.length === 5 && sessions === 'command,command,command,command,none' && log.attemptConnections.length === 5, JSON.stringify({ accepted: log.accepted, ports: log.attemptPorts, connections: log.attemptConnections }));
  const pins = (names) => names.filter((name) => name.startsWith('known_hosts-'));
  const sampled = roads.sampler.samples().flatMap((sample) => pins(Object.keys(sample.files)));
  const listed = pins(Object.keys(rig.readFolder(roads.sampler.dir)));
  const named = sec.recordedStarts(leg).concat(roads.bridges).filter((one) => one.argv.some((word) => word.includes('known_hosts')));
  check(`${label}: 0 pin files written: no sample of keys/<pid>/ during the leg and no listing after it holds a known_hosts- name, and no argv names a known-hosts file (A.6)`, sampled.length === 0 && listed.length === 0 && named.length === 0, JSON.stringify({ sampled, listed, named: named.length }));
}

/** A.8: the stand-in's marker holds the nonce, and the install's two listings are the same before and after (the stand-in's own words, not M4's). */
function standInChecks(ctx, label, stand, nonce, listings) {
  const { check } = ctx;
  const marker = fs.existsSync(stand.marker) ? fs.readFileSync(stand.marker, 'utf8') : null;
  const after = standIn.listingOf();
  check(`${label}: the stand-in: its marker holds the run's nonce, and the listing of /usr/local/bin/creds and of every /tmp/creds-install.* is the same before and after (A.8, the setup: it keeps the install inside the owned folder)`, marker === `${nonce}\n` && JSON.stringify(listings) === JSON.stringify(after), JSON.stringify({ marker, before: listings, after }));
}

/** (a): the entry's `hostKey` is absent in the way the leg names; the five runs of M1, unpinned. */
async function absentLeg(ctx, spec) {
  const { check, product } = ctx;
  const leg = ctx.rig;
  const label = leg.label;
  const given = m1.standing(ctx);
  const k1 = await rig.counterpart(check, leg, 'k1', leg.k1, { extra: given.stand.extra });
  if (k1 === undefined) {
    return;
  }
  const listings = standIn.listingOf();
  const roads = rig.openRoads(leg, k1.port, { credential: 'named', answer: rig.installAnswer(leg) });
  roads.w.replaceHostKey(refused.ABSENT_TEXTS[spec.name]);
  rig.mark(leg, roads, [k1]);
  check(`${label}: cold: 0 runs of ssh -V and 0 starts of the client before the first click (A.1)`, roads.state === 'cold' && roads.questions.length === 0 && sec.recordedStarts(leg).length === 0, JSON.stringify({ questions: roads.questions.length }));
  const drove = await m1.driveFive(ctx, roads);
  ranChecks(ctx, label, roads, given.stand, drove);
  const counts = rig.countsOf(leg, roads, [k1]);
  startChecks(ctx, label, roads, counts);
  await logChecks(ctx, label, roads, k1);
  rig.noSentence(check, label, leg, roads);
  standInChecks(ctx, label, given.stand, given.nonce, listings);
  await rig.nothingLeft(check, label, leg, roads, rig.callsOf(leg, roads, product));
  await rig.endCounterpart(check, leg, k1, 'K1');
  rig.evidence(leg, roads, [k1], { case: spec.case, hostKey: refused.ABSENT_TEXTS[spec.name] ?? null });
}

const bySpec = Object.fromEntries(refused.M4_LEGS.map((spec) => [spec.name, spec]));
/** The leg of each name: (a) the five runs, every other the refused leg with its spec. */
const legs = Object.fromEntries(refused.M4_LEGS.map((spec) => [spec.name, (ctx) => (spec.case === 'a' ? absentLeg(ctx, bySpec[spec.name]) : refusedLeg.refusedLeg(ctx, bySpec[spec.name]))]));

/** M4: every leg of the table, in its order, each in a leg process of its own. */
async function rowM4(check, top) {
  for (const spec of refused.M4_LEGS) {
    await rig.runLeg(check, top, 'M4', spec.name);
  }
}

module.exports = { rowM4, legs };
