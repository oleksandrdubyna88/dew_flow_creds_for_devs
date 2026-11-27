'use strict';
// Row M11 of G1 (E3.S9; `research/PLAN_person_roads_pin_host_key_E3_S9_spec.md` §3.3): the two cases where the BARE word of a pin file's path is read by the parser of the client. The expectation of each is a constant of
// `lib/offRigRecord.cjs` by the client's parser (`BARE`), never M7's expectation with a switch, and never taken from what the client did. Six legs, each its own process, world, counterpart, folder and client:
//   the twin of (c) on the older client (`m11-c-twin-k1`, `m11-c-twin-k2`): the storage folder `x'y'z`; the twin (the path with the apostrophes taken out) holds K2's line, the pin file K1's. An older client keeps the
//     apostrophes of a bare word, so it reads the intended file: K1 ACCEPTS the witness and K2 refuses the control. This shows the ABSENCE of the hole on that parser, not a repair that closes it.
//   the equals-sign pair (`m11-eq-older-k1`, `m11-eq-older-k2` on the older client; `m11-eq-newer-k1`, `m11-eq-newer-k2` on the rig's): the storage folder `data=prod`; the twin `<leg>/st/data` is the first name of the
//     split of the bare path at the sign, a FILE that holds K2's line. An older client splits the bare path into two names (K2 ACCEPTS the control, through the twin); a newer one reads it whole (no collision).
// Only `ssh -G` was measured for the equals-sign pair (E3.S3, P3.4 and P3.5): a login of it that does not come out as the row says is no harness fault to repair, and the leg is not made weaker (decision 18).
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const rig = require('./itestRowRig.cjs');
const rec = require('./lib/rowRecord.cjs');
const ok = require('./lib/otherKeyRecord.cjs');
const off = require('./lib/offRigRecord.cjs');
const pr = require('./lib/pathRecord.cjs');
const shared = require('./itestRowOtherKey.cjs');
const paths = require('./itestRowPaths.cjs');
const m1 = require('./itestRowM1.cjs');
const m7 = require('./itestRowM7.cjs');
const m11 = require('./itestRowM11.cjs');

const TWIN_SPEC = { shape: 'c', folder: "x'y'z", word: 'quoted' };
const EQ_SPEC = { shape: 'eq', folder: 'data=prod', word: 'quoted' };
const lineOf = (server, key) => ok.knownHostsLineOf(server.port, fs.readFileSync(`${key}.pub`, 'utf8'));
const read = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null);
const bareOptions = (file) => ['-o', `UserKnownHostsFile=${file}`, '-o', `GlobalKnownHostsFile=${file}`];
const quotedOptions = (file) => ['-o', `UserKnownHostsFile="${file}"`, '-o', `GlobalKnownHostsFile="${file}"`];
const recordOf = (run) => ({ argv: run.argv, code: run.code, stdout: run.stdout, stderr: run.stderr });
const acceptedOnce = (run) => run.code === 0 && run.after.accepted === run.before.accepted + 1 && run.session === 'command';

/** What the leg's own client resolves (`ssh -G`, no login) for the words: the last `-F` of the argv overrides the handed config (S7's deviation 1). */
async function resolved(ctx, words) {
  const said = await rig.viaReal(ctx.rig, ['-G', '-F', '/dev/null', ...words, '-p', '1', '127.0.0.1']);
  return { said, lists: off.resolvedOf(said.stdout) };
}

/** The complete pathname that the product makes for the leg's storage folder and a made uuid, and the product's rule asked with it. */
function pathnameOf(ctx) {
  const file = ctx.product.knownHostsPath(ctx.rig.storage, 'e1', crypto.randomUUID());
  return { file, refusal: ctx.product.pinPathRefusal(file) ?? null };
}

/** The twin legs' `-G` checks (M11.tG1, M11.tG2): the bare word of (c) and the same word in double quotes, in both lists, as this parser reads them (`BARE`). */
async function twinDashG(ctx, parser, file) {
  const leg = ctx.rig;
  const itself = off.BARE[parser].pair === 'itself';
  const bare = await resolved(ctx, bareOptions(file));
  ctx.check(`${leg.label}: ssh -G of this client, the bare word of (c) as both known-hosts options: it resolves to ${itself ? 'itself in both lists, the apostrophes kept' : 'the path without the apostrophes in both lists'} (M11.tG1)`, bare.said.code === 0 && off.oneIntended(bare.lists, itself ? file : pr.resolvedBare(file)), JSON.stringify({ code: bare.said.code, lists: bare.lists, stderr: bare.said.stderr }));
  const quoted = await resolved(ctx, quotedOptions(file));
  ctx.check(`${leg.label}: the same word in double quotes resolves to itself in both lists (M11.tG2)`, quoted.said.code === 0 && off.oneIntended(quoted.lists, file), JSON.stringify({ code: quoted.said.code, lists: quoted.lists, stderr: quoted.said.stderr }));
  return { bare: bare.lists, quoted: quoted.lists };
}

/** M11.tc: the control's own file holds K1's line and its twin K2's, as the leg wrote them before the control started. */
function twinHeld(ctx, controlled, server, id) {
  const held = { file: read(controlled.file), twin: read(controlled.twin) };
  ctx.check(`${ctx.rig.label}: the control's twin held K2's line and its own file K1's line before the control started (${id})`, held.file === lineOf(server, ctx.rig.k1) && held.twin === lineOf(server, ctx.rig.k2), JSON.stringify(held));
}

/** The K1 legs' common check (M11.t1, M11.e1): K1 logged exactly 5 accepted logins, one per run: 4 with a command session and 1 with none; the 4 runs of the runner ended with 0. */
function fiveAccepted(ctx, roads, k1log, id) {
  const sessions = k1log.accepted.map((one) => one.session).sort().join(',');
  ctx.check(`${ctx.rig.label}: K1 logged exactly 5 accepted logins, one per run: 4 with a command session and 1 with none; the 4 runs of the runner ended with 0 (${id})`, k1log.accepted.length === 5 && sessions === 'command,command,command,command,none' && roads.outcomes.length === 4 && roads.outcomes.every((one) => one.outcome?.exitCode === 0), JSON.stringify({ accepted: k1log.accepted, runs: roads.outcomes.map((one) => one.outcome?.exitCode) }));
}

/** `m11-c-twin-k1`: K1 answers; the roads of M1 read the pin file (5 accepted logins); the witness, E1's words with the path bare, is ACCEPTED by K1: this parser kept the apostrophes and read the intended file. */
async function twinK1(ctx) {
  const { check, info } = ctx;
  const leg = ctx.rig;
  const label = leg.label;
  paths.storageAt(ctx, TWIN_SPEC.folder);
  const dash = await twinDashG(ctx, 'older', pathnameOf(ctx).file);
  const given = m1.standing(ctx);
  const k1 = await rig.counterpart(check, leg, 'k1', leg.k1, { extra: given.stand.extra });
  if (k1 === undefined) {
    return;
  }
  const writer = paths.twinWriter(ctx, k1.port, leg.k2);
  const roads = rig.openRoads(leg, k1.port, { credential: 'named', answer: rig.installAnswer(leg), onPin: writer.onPin });
  m7.coldCheck(ctx, roads);
  info(`${label}: the roads' drive: ${JSON.stringify(await m1.driveFive(ctx, roads))}`);
  const k1log = await m1.acceptedOf(k1, 5);
  const twins = m7.twinsCheck(ctx, label, roads, writer, k1.port);
  paths.wordCheck(ctx, label, roads, TWIN_SPEC);
  m11.olderChecks(ctx, roads, rig.countsOf(leg, roads, [k1]), 3);
  fiveAccepted(ctx, roads, k1log, 'M11.t1');
  const witness = await paths.controlBare(ctx, k1, TWIN_SPEC.folder);
  check(`${label}: the witness, the control client with E1's words (the path bare), ended with 0 (M11.t2)`, paths.bareWordsOk(witness) && witness.run.code === 0, JSON.stringify(recordOf(witness.run)));
  check(`${label}: K1 logged one more accepted login with a command session for the witness: on this parser the bare word read the intended file (M11.t2c)`, acceptedOnce(witness.run), JSON.stringify({ before: witness.run.before, after: witness.run.after, session: witness.run.session }));
  twinHeld(ctx, witness, k1, 'M11.tc');
  shared.stderrFilesCheck(ctx, label);
  await rig.nothingLeft(check, label, leg, roads, rig.callsOf(leg, roads, ctx.product));
  await rig.endCounterpart(check, leg, k1, 'K1');
  rig.evidence(leg, roads, [k1], { shape: 'c', folder: path.relative(leg.dir, leg.storage), twins, dash, witness: recordOf(witness.run) });
}

/** `m11-c-twin-k2`: K2 answers; the four runs that start are refused (the pin file holds K1's line), K2 logs nothing; the control, E1's words with the path bare, is REFUSED too: the twin held K2's line and the client did not read it. */
async function twinK2(ctx) {
  const { check, info } = ctx;
  const leg = ctx.rig;
  const label = leg.label;
  paths.storageAt(ctx, TWIN_SPEC.folder);
  const dash = await twinDashG(ctx, 'older', pathnameOf(ctx).file);
  const given = shared.standing(ctx);
  const k2 = await rig.counterpart(check, leg, 'k2', leg.k2, { extra: given.stand.extra });
  if (k2 === undefined) {
    return;
  }
  const writer = paths.twinWriter(ctx, k2.port, leg.k2);
  const roads = rig.openRoads(leg, k2.port, { credential: 'named', answer: rig.installAnswer(leg), onPin: writer.onPin });
  rig.mark(leg, roads, [k2]);
  m7.coldCheck(ctx, roads);
  info(`${label}: cold: the roads' clicks: ${JSON.stringify(await shared.driveRefusedRoads(ctx, roads))}`);
  await shared.logsArrived(roads, [k2], shared.connectionStarts(leg, roads).length);
  const counts = rig.countsOf(leg, roads, [k2]);
  const bridgeStderr = shared.refusedChecks(ctx, label, counts, 'M11.t3');
  paths.k2Counts(ctx, label, counts, 'M11.t4');
  const twins = m7.twinsCheck(ctx, label, roads, writer, k2.port);
  paths.wordCheck(ctx, label, roads, TWIN_SPEC);
  m11.olderChecks(ctx, roads, counts, 3);
  shared.standInGuard(ctx, label, given, roads, 'M11.tg');
  const control = await paths.controlBare(ctx, k2, TWIN_SPEC.folder);
  const run = control.run;
  check(`${label}: the control, the control client with E1's words (the path bare), ended with 255 and the verification line (M11.t5)`, paths.bareWordsOk(control) && run.code === 255 && ok.hasLine(run.stderr), JSON.stringify(recordOf(run)));
  check(`${label}: K2 logged 0 authentication attempts and 0 accepted logins for the control: the twin held K2's line, and the client did not read it (M11.t5c)`, run.after.authAttempts === run.before.authAttempts && run.after.accepted === run.before.accepted, JSON.stringify({ before: run.before, after: run.after }));
  twinHeld(ctx, control, k2, 'M11.tc');
  shared.stderrFilesCheck(ctx, label);
  await roads.w.bridges.dispose();
  await rig.nothingLeft(check, label, leg, roads, rig.callsOf(leg, roads, ctx.product));
  await rig.endCounterpart(check, leg, k2, 'K2');
  rig.evidence(leg, roads, [k2], { ...counts, shape: 'c', folder: path.relative(leg.dir, leg.storage), twins, dash, control: recordOf(run), bridgeStderr });
}

/** Whether a bare control's argv is exactly the words, and neither known-hosts value holds a double quote (the equals-sign control's own reading; the apostrophes of `bareWordsOk` are not here). */
const eqWordsOk = (controlled) => JSON.stringify(shared.wordsOf(controlled.run.argv)) === JSON.stringify(controlled.words) && controlled.words.every((word) => !word.includes('"'));

/** M11.e2: no error message and no log line after the mark holds a sentence of §3.5 (the roads read the intended file: nothing was refused). */
function noError(ctx, label, roads) {
  const from = rig.markOf(roads).said;
  const sentences = rec.sentencesOf(ctx.product, ctx.product.world.ROW.node.name);
  const shown = roads.w.said.slice(from).filter((one) => one.kind === 'error' || rec.saysASentence(one.text, sentences));
  ctx.check(`${label}: no error message after the mark and no sentence of §3.5 (M11.e2)`, shown.length === 0, JSON.stringify(shown));
}

/** The leg's `-G` checks (M11.eG1, M11.eG2) of the equals-sign pair: the bare path is split into two names (older) or read whole (newer); in double quotes it is whole on both. */
async function eqDashG(ctx, parser, file, twin, second) {
  const label = ctx.rig.label;
  const bare = await resolved(ctx, bareOptions(file));
  const split = off.BARE[parser].equals === 'split';
  const twoNames = (list) => list.length === 2 && list[0] === twin && list[1] === second;
  ctx.check(`${label}: ssh -G of this client, the bare path as both options: ${split ? "two names in both lists, and the first is the twin's path" : 'itself, whole, in both lists'} (M11.eG1)`, bare.said.code === 0 && (split ? twoNames(bare.lists.user) && twoNames(bare.lists.global) : off.oneIntended(bare.lists, file)), JSON.stringify({ code: bare.said.code, lists: bare.lists, stderr: bare.said.stderr }));
  const quoted = await resolved(ctx, quotedOptions(file));
  ctx.check(`${label}: the path in double quotes resolves to itself, whole, in both lists (M11.eG2)`, quoted.said.code === 0 && off.oneIntended(quoted.lists, file), JSON.stringify({ code: quoted.said.code, lists: quoted.lists, stderr: quoted.said.stderr }));
  return { bare: bare.lists, quoted: quoted.lists };
}

/** The control of the equals-sign pair against `server`, after the counts: E1's words with the path BARE; its twin is the leg's own file `<leg>/st/data` (D20). */
const controlEq = (ctx, server) => paths.controlBare(ctx, server, EQ_SPEC.folder, { twinOf: off.twinOfEquals });

/** M11.eT: the roads open, and the clock taken just before they do says the twin was written first and still holds K2's line. Answers `{ roads, openedAt }`. */
function openAfterTwin(ctx, server, twin) {
  const leg = ctx.rig;
  const openedAt = performance.now();
  const roads = rig.openRoads(leg, server.port, { credential: 'named', answer: rig.installAnswer(leg) });
  ctx.check(`${leg.label}: the twin ${path.relative(leg.dir, twin.file)} holds K2's line, written before the world opened (M11.eT)`, read(twin.file) === twin.line && twin.at < openedAt, JSON.stringify({ twin: read(twin.file), twinAt: twin.at, openedAt }));
  return { roads, openedAt };
}

/** The K1 legs of the pair: the roads read the pin file; on the newer client the bare words against K1 end with 0 (M11.e7). */
async function eqRoadsK1(ctx, parser, server, twin, fields) {
  const { check, info } = ctx;
  const leg = ctx.rig;
  const label = leg.label;
  const { roads, openedAt } = openAfterTwin(ctx, server, twin);
  m7.coldCheck(ctx, roads);
  info(`${label}: the roads' drive: ${JSON.stringify(await m1.driveFive(ctx, roads))}`);
  fiveAccepted(ctx, roads, await m1.acceptedOf(server, 5), 'M11.e1');
  paths.wordCheck(ctx, label, roads, EQ_SPEC);
  noError(ctx, label, roads);
  m11.olderChecks(ctx, roads, rig.countsOf(leg, roads, [server]), 3, parser);
  let control;
  if (parser === 'newer') {
    control = await controlEq(ctx, server);
    check(`${label}: the same bare words against K1 ended with 0, and K1 logged one more accepted login with a command session: the client found the intended file (M11.e7)`, eqWordsOk(control) && control.run.code === 0 && acceptedOnce(control.run), JSON.stringify({ ...recordOf(control.run), before: control.run.before, after: control.run.after }));
  }
  shared.stderrFilesCheck(ctx, label);
  await rig.nothingLeft(check, label, leg, roads, rig.callsOf(leg, roads, ctx.product));
  await rig.endCounterpart(check, leg, server, 'K1');
  rig.evidence(leg, roads, [server], { ...fields, openedAt, control: control === undefined ? null : recordOf(control.run) });
}

/** The K2 legs of the pair: the roads are refused; the control with E1's bare words is ACCEPTED (older: it read the twin) or REFUSED (newer: no collision). */
async function eqRoadsK2(ctx, parser, server, given, twin, fields) {
  const { check, info } = ctx;
  const leg = ctx.rig;
  const label = leg.label;
  const { roads, openedAt } = openAfterTwin(ctx, server, twin);
  rig.mark(leg, roads, [server]);
  m7.coldCheck(ctx, roads);
  info(`${label}: cold: the roads' clicks: ${JSON.stringify(await shared.driveRefusedRoads(ctx, roads))}`);
  await shared.logsArrived(roads, [server], shared.connectionStarts(leg, roads).length);
  const counts = rig.countsOf(leg, roads, [server]);
  const bridgeStderr = shared.refusedChecks(ctx, label, counts, 'M11.e3');
  paths.k2Counts(ctx, label, counts, 'M11.e4');
  paths.wordCheck(ctx, label, roads, EQ_SPEC);
  m11.olderChecks(ctx, roads, counts, 3, parser);
  shared.standInGuard(ctx, label, given, roads, 'M11.eg');
  const control = await controlEq(ctx, server);
  const run = control.run;
  if (parser === 'older') {
    check(`${label}: K2: the control client with E1's words (the path BARE) ended with 0 (M11.e5)`, eqWordsOk(control) && run.code === 0, JSON.stringify(recordOf(run)));
    check(`${label}: K2 logged one more accepted login with a command session for the control: it read the twin (M11.e5c)`, acceptedOnce(run), JSON.stringify({ before: run.before, after: run.after, session: run.session }));
    const [, ctlSecond] = off.splitAtEquals(control.file);
    const named = path.resolve(process.cwd(), ctlSecond);
    check(`${label}: the second name of the split of the control's own path, read from the control's working folder, names no file, so the twin is the only file that the control could read (M11.e5r)`, !fs.existsSync(named) && twin.file === off.twinOfEquals(control.file), JSON.stringify({ second: ctlSecond, named, exists: fs.existsSync(named) }));
  } else {
    check(`${label}: the control with E1's bare words ended with 255 and the verification line (M11.e6)`, eqWordsOk(control) && run.code === 255 && ok.hasLine(run.stderr), JSON.stringify(recordOf(run)));
    check(`${label}: K2 logged 0 authentication attempts and 0 accepted logins for the control (M11.e6c)`, run.after.authAttempts === run.before.authAttempts && run.after.accepted === run.before.accepted, JSON.stringify({ before: run.before, after: run.after }));
  }
  shared.stderrFilesCheck(ctx, label);
  await roads.w.bridges.dispose();
  await rig.nothingLeft(check, label, leg, roads, rig.callsOf(leg, roads, ctx.product));
  await rig.endCounterpart(check, leg, server, 'K2');
  rig.evidence(leg, roads, [server], { ...counts, ...fields, openedAt, control: recordOf(run), bridgeStderr });
}

/** One leg of the equals-sign pair: M11.e0, the twin written once before the world opens (M11.eT), `-G`, then the K1 or K2 roads. */
async function eqLeg(ctx, spec) {
  const { check, product } = ctx;
  const leg = ctx.rig;
  const label = leg.label;
  const parser = spec.parser;
  const isK1 = spec.name.endsWith('-k1');
  paths.storageAt(ctx, EQ_SPEC.folder);
  const { file, refusal } = pathnameOf(ctx);
  const checked = product.checkedPin(file, { kind: parser === 'older' ? 'older' : 'knows', token: 'OpenSSH_test' });
  check(`${label}: the leg's own folder holds no equals sign; the product's rule answers no refusal for the complete pathname of the storage folder, and checkedPin's word for it is the path in double quotes (M11.e0)`, !leg.dir.includes('=') && refusal === null && checked.ok === true && checked.pin.word === `"${file}"`, JSON.stringify({ dir: leg.dir, refusal, checked }));
  const given = isK1 ? m1.standing(ctx) : shared.standing(ctx);
  const server = await rig.counterpart(check, leg, isK1 ? 'k1' : 'k2', isK1 ? leg.k1 : leg.k2, { extra: given.stand.extra });
  if (server === undefined) {
    return;
  }
  const [first, second] = off.splitAtEquals(file);
  const line = lineOf(server, leg.k2);
  fs.writeFileSync(first, line, { mode: 0o600 });
  const twin = { file: first, line, at: performance.now() };
  const dash = await eqDashG(ctx, parser, file, first, second);
  const fields = { shape: 'eq', folder: path.relative(leg.dir, leg.storage), twin: path.relative(leg.dir, first), twinAt: twin.at, dash, collision: off.collisionOf(parser, 'equals') };
  await (isK1 ? eqRoadsK1(ctx, parser, server, twin, fields) : eqRoadsK2(ctx, parser, server, given, twin, fields));
}

const eqSpec = (name) => off.M11_LEGS.find((one) => one.name === name);
const legs = {
  'm11-c-twin-k1': m11.withParser('older', twinK1),
  'm11-c-twin-k2': m11.withParser('older', twinK2),
  ...Object.fromEntries(['m11-eq-older-k1', 'm11-eq-older-k2', 'm11-eq-newer-k1', 'm11-eq-newer-k2'].map((name) => [name, m11.withParser(eqSpec(name).parser, (ctx) => eqLeg(ctx, eqSpec(name)))])),
};

module.exports = { legs };
