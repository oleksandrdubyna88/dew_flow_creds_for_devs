'use strict';
// Row M12 of G1 (E3.S7; `todo/PLAN_person_roads_pin_host_key.md`, `## Epics`, E3; `todo/PLAN_person_roads_pin_host_key_E3_S7_spec.md` §3): a path that cannot be written for `ssh` as one file starts nothing, for every
// refused kind. `m12-rule` (first): the run reads the kinds from the product (`PIN_PATH_KINDS`) and fails when one of them is neither a leg (a)-(f) nor (g) or (h); (g) and (h) are asked of the rule and of the client
// alone, and no road is driven for them. Then (a)-(f), each on the install and on the bridge (a leg per road, as E3.S5: one road per refused leg), cold, the entry pinned to K1 and the counterpart K1, so only the
// refusal can stop the call: 0 starts of the client of ANY kind (the question `ssh -V` included), 0 connections in the counterpart's log, no file written into the storage folder, no bridged row, sentence E with the
// kind of that path and no path in it. The storage folder of a leg holds the characters of its kind. `devNullScan` reads every recorded argv of the section for `/dev/null` as a known-hosts file.
// A proving run of this file passes no row: its numbers are "seen when it was built".
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const rig = require('./itestRowRig.cjs');
const pr = require('./lib/pathRecord.cjs');
const shared = require('./itestRowOtherKey.cjs');
const refused = require('./itestRowRefused.cjs');
const paths = require('./itestRowPaths.cjs');

const { sec, me } = rig;
const PREFIXES = { install: 'Cannot reach "box": ', bridge: 'Cannot bridge to "box": ' };

/** What `ssh -G` says of the two known-hosts options for `word` as both, with no config (`-F /dev/null`; the handed config comes first and the last `-F` wins), `-p 1` and nothing to connect to. */
async function resolvedBy(ctx, word) {
  const argv = ['-G', '-F', '/dev/null', '-p', '1', '-o', `UserKnownHostsFile=${word}`, '-o', `GlobalKnownHostsFile=${word}`, `${me}@127.0.0.1`];
  const said = await rig.viaReal(ctx.rig, argv);
  const value = (key) => said.stdout.split('\n').find((line) => line.startsWith(`${key} `))?.slice(key.length + 1) ?? null;
  return { argv, code: said.code, stderr: said.stderr, user: value('userknownhostsfile'), global: value('globalknownhostsfile') };
}

/** `m12-rule`: the coverage (M12.cov), then (g) and (h): the rule's refusal and the client alone as the control. No road is driven, and the result says so. */
async function ruleLeg(ctx) {
  const { check, info, product } = ctx;
  const leg = ctx.rig;
  const label = leg.label;
  const kinds = Object.keys(product.PIN_PATH_KINDS);
  const covered = pr.coverage(kinds, pr.M12_LEGS);
  check(`${label}: coverage: every kind of the product's PIN_PATH_KINDS is a leg of this row ((a)-(f) on the roads, (g) and (h) alone), and every leg's kind is a kind of the product: ${kinds.length} kinds (M12.cov)`, covered.ok, JSON.stringify({ kinds, covered }));
  const uuid = crypto.randomUUID();
  const asked = pr.M12_LEGS[0].cases.map((one) => ({ letter: one.letter, kind: one.kind, pathname: one.pathname(leg.dir, uuid) })).map((one) => ({ ...one, answer: product.pinPathRefusal(one.pathname) ?? null }));
  const shown = { g: `<leg>/rule/known_hosts-e1-<uuid>${'\\'}`, h: '~/known_hosts-e1-<uuid>' };
  asked.forEach((one) => check(`${label}: (${one.letter}): the product's rule refuses ${shown[one.letter]} with ${one.kind} (M12.${one.letter})`, one.answer === one.kind, JSON.stringify(one)));
  const [g, h] = [asked[0].pathname, asked[1].pathname];
  const gc = await resolvedBy(ctx, `"${g}"`);
  check(`${label}: (g), the control, the client alone: ssh -G -F /dev/null with the pathname in double quotes as both known-hosts options ends with 255 and says invalid quotes (M12.gc)`, gc.code === 255 && gc.stderr.includes('invalid quotes'), JSON.stringify(gc));
  const hc = await resolvedBy(ctx, h);
  const tilde = `~/known_hosts-e1-${uuid}`;
  check(`${label}: (h), the control, the client alone: ssh -G -F /dev/null with ~/known_hosts-e1-<uuid> as both options resolves userknownhostsfile to a path that does not start with ~ and globalknownhostsfile to ~/known_hosts-e1-<uuid>: not the one pathname (M12.hc)`, hc.code === 0 && hc.user !== null && !hc.user.startsWith('~') && hc.user.endsWith(`/known_hosts-e1-${uuid}`) && hc.global === tilde, JSON.stringify(paths.homeAsTilde(hc)));
  info(`${label}: (g), (h): no road is driven for them: the rule and the client alone`);
  paths.evidenceNone(leg, { rule: asked.map((one) => ({ ...one, pathname: shown[one.letter] })), coverage: { kinds, ...covered }, gc: { argv: gc.argv, code: gc.code, stderr: gc.stderr }, hc: { argv: hc.argv, code: hc.code, user: hc.user, global: hc.global }, drove: false });
}

/** The checks of the counts of a road leg: M12.0 (cold, before the click) is made by the caller; M12.1 to M12.4. */
function countChecks(ctx, label, roads, counts, spec, before) {
  const { check, product } = ctx;
  const log = counts.counterparts[0];
  const bridge = spec.road === 'bridge' ? '; the socket check has no start: it is never reached' : '';
  check(`${label}: 0 starts of the client of any kind after the mark, the question ssh -V included; the observer timed 0 runs of ssh -V${bridge} (M12.1)`, counts.starts.total === 0 && counts.question.length === 0 && counts.runs.length === 0 && counts.starts.byRoad.check.starts === 0, JSON.stringify({ starts: counts.starts.list, timed: counts.question.length, runs: counts.runs.length }));
  check(`${label}: K1 logged 0 connections and 0 authentication attempts after the mark (M12.2)`, log.connections === 0 && log.authAttempts === 0 && log.accepted.length === 0, JSON.stringify({ connections: log.connections, attempts: log.authAttempts, accepted: log.accepted }));
  const after = paths.storageUnchanged(ctx, label, roads, before, 'M12.3');
  check(`${label}: no bridged row: the bridge manager holds no open bridge of the entry, and the bridge spawner was called 0 times (M12.4)`, roads.w.bridges.isOpen(product.world.KEY) === false && roads.bridges.length === 0, JSON.stringify({ open: roads.w.bridges.isOpen(product.world.KEY), spawned: roads.bridges.length }));
  return after;
}

/** `m12-<k>-<road>`: one refused kind on one road (§1.6): the rule's question, the listing, K1, a cold world, ONE click, the counts and the checks, the liveness control, the listing after, the end. */
async function roadLeg(ctx, spec) {
  const { check } = ctx;
  const leg = ctx.rig;
  const label = leg.label;
  paths.storageAt(ctx, spec.folder);
  const rule = paths.ruleOf(ctx);
  check(`${label}: the product's rule, asked with the complete pathname of the leg's folder (<storage>/keys/<pid>/known_hosts-e1-<uuid>), answers ${spec.kind}; the leg's folder alone answers no refusal (M12.k)`, rule.answer === spec.kind && rule.legFolderAnswer === null, JSON.stringify(rule));
  const before = pr.listingOf(leg.storage);
  const given = shared.standing(ctx);
  const k1 = await rig.counterpart(check, leg, 'k1', leg.k1, { extra: given.stand.extra });
  if (k1 === undefined) {
    return;
  }
  const roads = rig.openRoads(leg, k1.port, { credential: 'named', answer: refused.dismissAll });
  rig.mark(leg, roads, [k1]);
  check(`${label}: cold: 0 runs of ssh -V and 0 starts of the client before the click (M12.0)`, roads.questions.length === 0 && sec.recordedStarts(leg).length === 0, JSON.stringify({ questions: roads.questions.length }));
  const click = await refused.driveRefused(leg, roads, spec.road);
  check(`${label}: the click ended within 30 s (M12.7)`, click.ended, JSON.stringify(click));
  const counts = rig.countsOf(leg, roads, [k1]);
  const after = countChecks(ctx, label, roads, counts, spec, before);
  paths.sentenceE(ctx, label, roads, spec, PREFIXES[spec.road]);
  const alive = await refused.liveness(check, label, leg, k1);
  await rig.endCounterpart(check, leg, k1, 'K1');
  rig.evidence(leg, roads, [k1], { ...counts, letter: spec.letter, kind: spec.kind, road: spec.road, folder: path.relative(leg.dir, leg.storage), rule, listing: { before, after }, liveness: alive, drove: true });
}

const legs = Object.fromEntries(pr.M12_LEGS.map((spec) => [spec.name, spec.road === null ? ruleLeg : (ctx) => roadLeg(ctx, spec)]));

/** M12: `m12-rule` first, then each road leg of the table, each in a leg process of its own. */
async function rowM12(check, top) {
  for (const spec of pr.M12_LEGS) {
    await rig.runLeg(check, top, 'M12', spec.name);
  }
}

/**
 * M12.z, the last sentence of the row's last column: no recorded argv of the section's run names `/dev/null` as a known-hosts file. Reads every `<pid>.argv` of every `records` folder at depth 1 and 2 of
 * the section's folder (its own and every leg's); `n` must be above 0 (a scan that read nothing could not fail). E3.S10 runs the same function (`devNullIn`) over the whole run of E3.
 */
function devNullScan(check, top) {
  const own = fs.readdirSync(top.dir, { withFileTypes: true }).filter((one) => one.isDirectory()).map((one) => path.join(top.dir, one.name));
  const folders = [top.dir, ...own].map((dir) => path.join(dir, 'records')).filter((dir) => fs.existsSync(dir));
  const hits = folders.flatMap((folder) => sec.recordedStarts({ records: folder }).flatMap((start) => pr.devNullIn(start.argv).map((one) => ({ folder: path.relative(top.dir, folder), pid: start.pid, option: one.option }))));
  const argvs = folders.reduce((sum, folder) => sum + sec.recordedStarts({ records: folder }).length, 0);
  check(`M12 scan: no recorded argv of this run names /dev/null as a known-hosts file: ${argvs} argvs read in ${folders.length} records folders (M12.z)`, argvs > 0 && hits.length === 0, JSON.stringify(hits));
}

module.exports = { rowM12, legs, devNullScan };
