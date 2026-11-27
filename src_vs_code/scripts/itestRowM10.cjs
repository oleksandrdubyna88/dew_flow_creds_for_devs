'use strict';
// Row M10 of G1 (E3.S9; `research/PLAN_person_roads_pin_host_key.md`, `## Epics`, E3; `research/PLAN_person_roads_pin_host_key_E3_S9_spec.md` §2): where the run owns the resolver, the counterpart has a NAME, and the resolver answers a SECURE
// SSHFP record of K2 for it and records each question. The entry is pinned to K1, the counterpart is K2, the handed config says `VerifyHostKeyDNS yes`, and no `KnownHostsCommand` is named. THE CONTROL FIRST: the control
// client with E1's words (exactly the three pairs of a file of K1's line for `[<name>]:<port>`, no `VerifyHostKeyDNS=no`, no `KnownHostsCommand=none`) is accepted by K2, and the resolver's record holds the SSHFP question: the
// source is there and would be taken. Then the three roads, which say `VerifyHostKeyDNS=no`: each of the four runs that start ends with 255 and the verification line, the resolver's record holds 0 SSHFP questions for them (and at
// least one A question: they did ask this resolver), and K2 logs 0 accepted logins and 0 authentication attempts. If the control is not accepted, the row is NOT passed: it showed no bypass. One leg, `m10`; it runs INSIDE the `wslc`
// container of probe P2 (`itestOffRig.cjs m10`), where the resolver, the counterpart and the client are all one container's. A proving run of this file passes no row: its numbers are "seen when it was built".
const fs = require('node:fs');
const path = require('node:path');
const rig = require('./itestRowRig.cjs');
const ok = require('./lib/otherKeyRecord.cjs');
const shared = require('./itestRowOtherKey.cjs');
const paths = require('./itestRowPaths.cjs');
const { NAME, CONTROL, questions, sshfpOf } = require('./itestProbeResolver.cjs');
const { ask } = require('./itestRowM11.cjs');

const { me } = rig;
const zoneFile = path.join(CONTROL, 'zone.json');
/** The questions the resolver was asked after its first `from` ones, of one `type` for the leg's name. */
const askedAfter = (from, type) => questions().slice(from).filter((one) => one.name === NAME && one.type === type);

/** The control's words (S3.L2): exactly E1's three pairs of a file of K1's line for `[<name>]:<port>`, literal; the file is written by the lib. */
function controlWords(leg, port) {
  const file = path.join(leg.dir, 'pins', 'known_hosts-name');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, ok.knownHostsLineOf(port, fs.readFileSync(`${leg.k1}.pub`, 'utf8'), NAME), { mode: 0o600 });
  return ok.e1WordsFor(file);
}

/** One control login to the NAME, and what the resolver was asked during it: `{ run, asked }`. */
async function controlLogin(ctx, k2, words) {
  const from = questions().length;
  const run = await shared.login(ctx, k2, words, 'true', { host: NAME });
  await shared.sleep(600);
  return { run, asked: questions().slice(from) };
}

/** M10.c and M10.cq, the control first (before the mark). */
async function controlFirst(ctx, k2, words) {
  const leg = ctx.rig;
  const { run, asked } = await controlLogin(ctx, k2, words);
  const six = words.length === 6 && !words.some((word) => /VerifyHostKeyDNS|KnownHostsCommand/i.test(word)) && JSON.stringify(shared.wordsOf(run.argv)) === JSON.stringify(words);
  const accepted = run.code === 0 && run.after.accepted === run.before.accepted + 1 && run.session === 'command';
  ctx.check(`${leg.label}: the control client with E1's words, exactly the three pairs of a file of K1's line for [${NAME}]:<port>, to ${me}@${NAME}, was accepted by K2: exit 0, one more accepted login with a command session (M10.c)`, six && accepted, JSON.stringify({ argv: run.argv, code: run.code, stderr: run.stderr, before: run.before, after: run.after, session: run.session }));
  ctx.check(`${leg.label}: the resolver recorded the SSHFP question for ${NAME} during the control (M10.cq)`, asked.some((one) => one.name === NAME && one.type === 'SSHFP' && one.answer === 'records'), JSON.stringify(asked));
  return { run, asked };
}

/** M10.0: the leg's config resolves `verifyhostkeydns yes` for the name and names no `knownhostscommand`; the name resolves through the run's resolver. */
async function configCheck(ctx, port) {
  const leg = ctx.rig;
  const said = await rig.viaReal(leg, ['-G', '-p', String(port), `${me}@${NAME}`]);
  const lines = said.stdout.split(/\r?\n/);
  const host = await ask('getent', ['hosts', NAME]);
  ctx.check(`${leg.label}: the leg's config resolves verifyhostkeydns yes for ${NAME} and names no knownhostscommand; getent hosts ${NAME} answers 127.0.0.1 and the resolver recorded that A question (M10.0)`,
    said.code === 0 && lines.includes('verifyhostkeydns true') && !lines.some((line) => line.startsWith('knownhostscommand')) && /^127\.0\.0\.1\s/.test(host.stdout) && questions().some((one) => one.name === NAME && one.type === 'A' && one.answer === 'records'), JSON.stringify({ code: said.code, dns: lines.filter((line) => /verifyhostkeydns|knownhostscommand/.test(line)), host: host.stdout, questions: questions() }));
}

async function m10(ctx) {
  const { check, info, product } = ctx;
  const leg = ctx.rig;
  const label = leg.label;
  const given = shared.standing(ctx);
  const k2 = await rig.counterpart(check, leg, 'k2', leg.k2, { extra: given.stand.extra });
  if (k2 === undefined) {
    return;
  }
  const { records, said } = await sshfpOf({ run: ask }, NAME, leg.k2);
  check(`${label}: ssh-keygen -r printed the two SSHFP records of K2 (Ed25519; SHA-1 and SHA-256)`, records.length === 2 && records.every((one) => one.algorithm === 4), JSON.stringify(said));
  const zone = (secure) => fs.writeFileSync(zoneFile, `${JSON.stringify({ name: NAME, a: '127.0.0.1', sshfp: records, secure })}\n`);
  zone(true);
  const config = rig.handConfig(leg, { lines: ['VerifyHostKeyDNS yes'] });
  await configCheck(ctx, k2.port);
  const words = controlWords(leg, k2.port);
  const control = await controlFirst(ctx, k2, words);
  const roads = rig.openRoads(leg, k2.port, { credential: 'named', answer: rig.installAnswer(leg) });
  roads.w.replaceHost(NAME);
  check(`${label}: cold: 0 runs of ssh -V and 0 starts of the client before the first click (M10.0c)`, roads.questions.length === 0 && rig.sec.recordedStarts(leg).length === 0, JSON.stringify({ questions: roads.questions.length }));
  rig.mark(leg, roads, [k2]);
  const before = questions().length;
  info(`${label}: the roads' clicks: ${JSON.stringify(await shared.driveRefusedRoads(ctx, roads))}`);
  await shared.logsArrived(roads, [k2], shared.connectionStarts(leg, roads).length);
  const counts = rig.countsOf(leg, roads, [k2]);
  const bridgeStderr = shared.refusedChecks(ctx, label, counts, 'M10.1');
  const starts = shared.connectionStarts(leg, roads);
  const wrong = starts.filter((start) => {
    const dest = start.argv[start.argv.indexOf('--') + 1] ?? '';
    return !(dest === NAME || dest.endsWith(`@${NAME}`)) || JSON.stringify(product.argv.valuesOf(start.argv, 'VerifyHostKeyDNS')) !== JSON.stringify(['no']);
  }).map((start) => ({ dest: start.argv[start.argv.indexOf('--') + 1], dns: product.argv.valuesOf(start.argv, 'VerifyHostKeyDNS') }));
  check(`${label}: each connection start names ${NAME} as its destination and holds VerifyHostKeyDNS=no, once (M10.2)`, starts.length > 0 && wrong.length === 0, JSON.stringify({ starts: starts.length, wrong }));
  const sshfp = askedAfter(before, 'SSHFP');
  const addresses = askedAfter(before, 'A');
  check(`${label}: the resolver's record holds 0 SSHFP questions after the mark (M10.3)`, sshfp.length === 0, JSON.stringify(sshfp));
  check(`${label}: the resolver's record holds at least one A question for ${NAME} after the mark: the roads asked this resolver (M10.3a)`, addresses.length >= 1, JSON.stringify({ a: addresses.length }));
  paths.k2Counts(ctx, label, counts, 'M10.4');
  shared.standInGuard(ctx, label, given, roads, 'M10.5');
  // S3.L3, a record that decides nothing: the same control with the AD bit off (the resolver then answers no secure record).
  zone(false);
  const noAd = await controlLogin(ctx, k2, words);
  info(`${label}: M10.ad: the control with the AD bit off ended with ${noAd.run.code}; stderr ${JSON.stringify(noAd.run.stderr.split(/\r?\n/).filter((line) => /DNS|fingerprint|Host key|identification|Offending/i.test(line)))}; the resolver was asked ${JSON.stringify(noAd.asked.map((one) => `${one.type} ${one.answer}`))}`);
  shared.stderrFilesCheck(ctx, label);
  await roads.w.bridges.dispose();
  await rig.nothingLeft(check, label, leg, roads, rig.callsOf(leg, roads, product));
  await rig.endCounterpart(check, leg, k2, 'K2');
  const asked = (list) => list.map((one) => `${one.type} ${one.answer}`);
  rig.evidence(leg, roads, [k2], { ...counts, bridgeStderr, config, resolver: { before: asked(questions().slice(0, before)), control: asked(control.asked), afterMark: asked(questions().slice(before)), ad: asked(noAd.asked), sshfpAfterMark: sshfp.length } });
}

const legs = { m10 };

module.exports = { legs };
