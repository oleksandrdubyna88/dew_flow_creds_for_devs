'use strict';
// Row M1 of G1 (E3.S4; `todo/PLAN_person_roads_pin_host_key.md`, `## Epics`, E3; `todo/PLAN_person_roads_pin_host_key_E3_S4_spec.md` §6): a pinned entry
// whose host presents the pinned key works on all three roads, to the end of the install. The leg `m1` is cold (a new world in a new process: the
// asker of the client has asked nothing), the entry is pinned to K1, signs in with a key that the person named by its path, and K1 answers with the
// install's stand-in (probe P1 of E3.S3). The roads run the product's real resolve (the rig, `itestRowRig.cjs`). Each check below holds the words of
// M1's last column; an exit code alone is never read as "passed". A proving run of this file passes no row: its numbers are "seen when it was built".
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const rig = require('./itestRowRig.cjs');
const rec = require('./lib/rowRecord.cjs');

const { sec, standIn, within, me } = rig;
const LABEL = 'M1';

/** The accepted logins K1 logged, read once its log holds `count` of them (the log arrives through a pipe, a moment after the login), or after 5 s. */
async function acceptedOf(server, count) {
  await within(5_000, () => rec.logCounts(server.sshd.stderr, me).accepted.length >= count);
  return rec.logCounts(server.sshd.stderr, me);
}

/** M1.3 to M1.4: *Install creds on host* to its end, through the stand-in. */
async function installToItsEnd(ctx, roads, stand) {
  const { check, product } = ctx;
  const leg = ctx.rig;
  const w = roads.w;
  const click = await rig.press(leg, roads, 'installRemoteCli', 200_000);
  const probe = sec.runOf(roads, product.probeCommand());
  const facts = product.interpretProbe(probe?.outcome?.stdout ?? '');
  const expected = product.confirmationFor(facts, product.world.ROW.node.name).message;
  const asked = w.asked.filter((one) => one.message === expected);
  check(`${LABEL}: Install creds on host ended within 200 s; the probe ended with 0 and no blocker; ONE question, the one confirmationFor builds, was asked and its button given (M1.3)`, click.ended && probe?.outcome?.exitCode === 0 && product.blockerFor(facts) === '' && asked.length === 1 && w.asked.length === 1, JSON.stringify({ click, probe: probe?.outcome?.exitCode, blocker: product.blockerFor(facts), asked: w.asked }));
  const install = sec.runOf(roads, product.installCommand());
  const outcome = install?.outcome === undefined ? undefined : product.interpretInstall(install.outcome.stdout, install.outcome.stderr, install.outcome.exitCode);
  const message = `\`creds\` is installed on "${product.world.ROW.node.name}" at ${path.join(stand.bin, 'creds')}.`;
  check(`${LABEL}: the install ran to its end through the stand-in: the install run ended with 0, interpretInstall answered installed with <standin>/bin/creds, and the world showed the product's message for it (M1.4)`, install?.outcome?.exitCode === 0 && outcome?.kind === 'installed' && outcome.path === path.join(stand.bin, 'creds') && w.infos.includes(message), JSON.stringify({ install: install?.outcome?.exitCode, outcome, infos: w.infos }));
  return install;
}

/** M1.5 to M1.7: *Open Remote Bridge…*, its socket check, *Close Remote Bridge*. Answers the bridge's recorded start. */
async function bridgeAndCheck(ctx, roads) {
  const { check, product } = ctx;
  const leg = ctx.rig;
  const w = roads.w;
  const click = await rig.press(leg, roads, 'openRemoteBridge', 30_000);
  const remote = w.bridges.remotePathFor(product.world.KEY);
  const bound = remote !== undefined && (await within(5_000, () => sec.isSocket(remote)));
  check(`${LABEL}: Open Remote Bridge… ended within 30 s, the bridge is open, and the forwarded socket exists while it is open (M1.5)`, click.ended && w.bridges.isOpen(product.world.KEY) && bound, JSON.stringify({ click, remote }));
  const mode = () => sec.runOf(roads, product.modeCheckCommand({ path: remote ?? '' }));
  const ran = await within(40_000, () => mode() !== undefined);
  const sweep = sec.runOf(roads, product.sweepCommand(me));
  const probe = product.interpretSocketProbe(mode()?.outcome?.stdout ?? '');
  check(`${LABEL}: the check ran within 40 s: the sweep and the mode check each ended with 0, and the check read the socket's mode: owner only (M1.6)`, ran && sweep?.outcome?.exitCode === 0 && mode()?.outcome?.exitCode === 0 && probe.kind === 'mode' && product.isOwnerOnlyMode(probe.mode), JSON.stringify({ sweep: sweep?.outcome?.exitCode, mode: mode()?.outcome?.stdout, probe }));
  const bridge = sec.recordedStarts(leg).find((one) => one.argv.includes('-N'));
  await rig.press(leg, roads, 'closeRemoteBridge', 5_000);
  const ended = bridge !== undefined && (await within(5_000, () => !rig.alive(bridge)));
  check(`${LABEL}: Close Remote Bridge ended the bridge's ssh within 5 s, by its recorded pid and start time (M1.7)`, ended, JSON.stringify(bridge?.pid));
}

/** M1.8 to M1.12: the record of starts, the pin words of each connection, the three pin paths, K1's log. */
async function recordChecks(ctx, roads, k1) {
  const { check, info, product } = ctx;
  const leg = ctx.rig;
  const counts = rig.countsOf(leg, roads, [k1]);
  const { list } = counts.starts;
  const kinds = list.filter((one) => one.connection).map((one) => one.kind).sort();
  check(`${LABEL}: the shim recorded 6 starts, each whole: ONE question ssh -V, and 5 connection starts: the probe, the install run, the bridge, the sweep, the mode check (M1.8)`, list.length === 6 && list.every((one) => one.whole) && counts.starts.questions === 1 && kinds.join(',') === 'bridge,install,mode,probe,sweep', JSON.stringify({ total: list.length, questions: counts.starts.questions, kinds }));
  const question = list.find((one) => one.kind === 'question');
  const firstConnection = Math.min(...list.filter((one) => one.connection).map((one) => Number(one.start)));
  check(`${LABEL}: the question started before the first connection start (the start times the shim recorded), and the observer timed exactly one run of it (M1.9)`, question !== undefined && Number(question.start) <= firstConnection && counts.question.length === 1, JSON.stringify({ question, firstConnection, timed: counts.question }));
  info(`${LABEL}: the question ssh -V took ${counts.question[0]?.ms.toFixed(1)} ms (C20, the wait of a normal run)`);
  const connections = sec.recordedStarts(leg).filter((one) => rec.isConnectionStart(one.argv));
  const sloppy = connections.filter((one) => sec.pinOf(product, one.argv) === undefined || sec.lacksNewPairs(product, one.argv) || product.argv.valuesOf(one.argv, 'StrictHostKeyChecking').length !== 1);
  check(`${LABEL}: each of the 5 connection argvs says StrictHostKeyChecking=yes, ONE path as both known-hosts files, VerifyHostKeyDNS=no, KnownHostsCommand=none and LogLevel=ERROR, each once (M1.10)`, connections.length === 5 && sloppy.length === 0, JSON.stringify(sloppy.map((one) => product.argv.sourceWordsOf(one.argv))));
  const remote = sec.remoteOf(connections.find((one) => one.argv.includes('-N'))?.argv ?? []) ?? '';
  const commands = { probe: product.probeCommand(), install: product.installCommand(), sweep: product.sweepCommand(me), mode: product.modeCheckCommand({ path: remote }) };
  const pinOf = (kind) => connections.filter((one) => rec.kindOf(one.argv, commands) === kind).map((one) => sec.pinOf(product, one.argv));
  const [probe, install, sweep, mode, bridge] = ['probe', 'install', 'sweep', 'mode', 'bridge'].map(pinOf);
  const folder = product.materializedKeysDir(leg.storage);
  const named = /^known_hosts-e1-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const paths = [probe[0], sweep[0], bridge[0]];
  check(`${LABEL}: the probe and the install run name one path, the sweep and the mode check one path, the bridge its own: 3 distinct paths, each known_hosts-e1-<uuid> in keys/<pid>/ (M1.11)`, probe[0] !== undefined && probe[0] === install[0] && sweep[0] === mode[0] && new Set(paths).size === 3 && paths.every((file) => file !== undefined && path.dirname(file) === folder && named.test(path.basename(file))), JSON.stringify({ probe, install, sweep, mode, bridge }));
  const k1log = await acceptedOf(k1, 5);
  const sessions = k1log.accepted.map((one) => one.session).sort();
  check(`${LABEL}: K1 logged exactly 5 accepted logins, one per run: 4 with a command session and 1 with none (the bridge); 5 client ports reached authentication; the 4 runs of the runner ended with 0 (M1.12)`, k1log.accepted.length === 5 && sessions.join(',') === 'command,command,command,command,none' && k1log.attemptPorts.length === 5 && k1log.authAttempts === 5 && roads.outcomes.length === 4 && roads.outcomes.every((one) => one.outcome?.exitCode === 0), JSON.stringify({ accepted: k1log.accepted, ports: k1log.attemptPorts, runs: roads.outcomes.map((one) => one.outcome?.exitCode) }));
  return k1log;
}

/** M1.14 to M1.18: the stand-in's four conditions, each by its own evidence. */
function standInChecks(ctx, roads, stand, nonce, k1log, listings) {
  const { check, product } = ctx;
  const marker = fs.existsSync(stand.marker) ? fs.readFileSync(stand.marker, 'utf8') : null;
  check(`${LABEL}: the stand-in's marker holds the run's nonce (M1.14)`, marker === `${nonce}\n`, JSON.stringify({ marker, nonce }));
  const install = sec.runOf(roads, product.installCommand());
  const commandSessions = k1log.accepted.filter((one) => one.session === 'command').length;
  check(`${LABEL}: condition (1): the install run passed the real authentication (one of the accepted logins with a command session: ${commandSessions}) and its command ran to its end (exit ${install?.outcome?.exitCode}) (M1.15)`, commandSessions === 4 && install?.outcome?.exitCode === 0, JSON.stringify({ commandSessions }));
  const env = fs.existsSync(stand.env) ? fs.readFileSync(stand.env, 'utf8').split('\n') : [];
  check(`${LABEL}: condition (2): the stand-in's env says PATH=<standin>/bin:..., and command -v curl and command -v sh answer the stand-ins (M1.16)`, env.some((line) => line.startsWith(`PATH=${stand.bin}:`)) && env.includes(`curl=${stand.files.curl}`) && env.includes(`sh=${stand.files.sh}`), JSON.stringify(env));
  const curl = standIn.startsIn(stand.records.curl);
  const sh = standIn.startsIn(stand.records.sh);
  check(`${LABEL}: condition (3): the stand-in curl recorded ONE start with -fsSL, INSTALLER_URL, -o, /tmp/creds-install.<n>.sh; the stand-in sh ONE start with that script (M1.17)`, standIn.exactly(curl, 1, standIn.curlArgv(product.INSTALLER_URL)) && standIn.exactly(sh, 1, standIn.shArgv) && curl[0].argv[3] === sh[0].argv[0], JSON.stringify({ curl, sh }));
  const ownSockets = roads.bridges.filter((one) => one.remote !== undefined).map((one) => path.basename(one.remote));
  const fresh = standIn.tmpNames().filter((name) => !listings.tmp.includes(name) && !ownSockets.includes(name));
  fresh.forEach((name) => ctx.info(`${LABEL}: a new name in /tmp: ${name}`));
  const after = standIn.listingOf();
  check(`${LABEL}: condition (4): the listing of /usr/local/bin/creds and of every /tmp/creds-install.* is the same before and after, and no new name in /tmp is creds-* or an owned name (the bridge's own socket is judged by its own check) (M1.18)`, JSON.stringify(listings.files) === JSON.stringify(after) && !fresh.some((name) => /^creds-/.test(name)), JSON.stringify({ before: listings.files, after, fresh }));
}

async function m1(ctx) {
  const { check, product } = ctx;
  const leg = ctx.rig;
  const nonce = crypto.randomUUID();
  const stand = standIn.installStandIn(leg, nonce);
  const k1 = await rig.counterpart(check, leg, 'k1', leg.k1, { extra: stand.extra });
  if (k1 === undefined) {
    return;
  }
  const listings = { files: standIn.listingOf(), tmp: standIn.tmpNames() };
  const roads = rig.openRoads(leg, k1.port, { credential: 'named', answer: rig.installAnswer(leg) });
  check(`${LABEL}: the leg is cold: a new world in a new process, 0 runs of ssh -V and 0 starts of the client before the first click (M1.2)`, roads.state === 'cold' && roads.questions.length === 0 && sec.recordedStarts(leg).length === 0, JSON.stringify({ state: roads.state, questions: roads.questions.length }));
  await installToItsEnd(ctx, roads, stand);
  await bridgeAndCheck(ctx, roads);
  const k1log = await recordChecks(ctx, roads, k1);
  rig.noSentence(check, LABEL, leg, roads);
  standInChecks(ctx, roads, stand, nonce, k1log, listings);
  await rig.nothingLeft(check, LABEL, leg, roads, rig.callsOf(leg, roads, product));
  await rig.endCounterpart(check, leg, k1, 'K1');
  rig.evidence(leg, roads, [k1], { c20Ms: roads.questions[0]?.ms ?? null });
}

module.exports = { legs: { m1 }, rowM1: (check, top) => rig.runLeg(check, top, 'M1', 'm1', LABEL) };
