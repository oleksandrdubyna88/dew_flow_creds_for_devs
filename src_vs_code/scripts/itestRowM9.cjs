'use strict';
// Row M9 of G1 (E3.S5; `todo/PLAN_person_roads_pin_host_key.md`, `## Epics`, E3; `todo/PLAN_person_roads_pin_host_key_E3_S5_spec.md` §1.6, §1.7, §4): a saved key that does not
// parse, on a key entry and on a password entry, and the repair that sentence A advises. Ten legs, each its own process, world and counterpart:
//   the eight legs `m9-key-*` and `m9-password-*`: each road, cold and warm, in `itestRowRefused.cjs` (the form of sentence A follows the login; a password entry gets no
//   repair and the counterpart's log shows no password attempt);
//   `m9-key-repair`: Connect's options (the product's `connectionOptions`, with the real scan of K1) and *Trust and connect* answered for K1's fingerprint ONLY, then the
//   runs of M1 in the same world, cold, on the entry that Connect wrote ("the repair of sentence A" is that repair by the person, as the key form advises it: no product change);
//   `m9-password-connect` (C1): Connect's options with the scan given no answer; recorded, nothing connects.
// Connect's options never go on to a connection. A proving run of this file passes no row: its numbers are "seen when it was built".
const fs = require('node:fs');
const path = require('node:path');
const rig = require('./itestRowRig.cjs');
const rec = require('./lib/rowRecord.cjs');
const refused = require('./lib/refusedRecord.cjs');
const refusedLeg = require('./itestRowRefused.cjs');
const m1 = require('./itestRowM1.cjs');

const { sec, within, me } = rig;
const TRUST = 'Trust and connect';
const SCAN_ROLE = 'ssh-keyscan, the scan of Connect\'s options';

/** The record of the program that Connect's scan starts (the identities read it, D5): its path as the runner finds it, on the leg's own `PATH`. */
function nameScan(ctx, label) {
  const leg = ctx.rig;
  const found = refusedLeg.toolOnPath(leg.env, 'ssh-keyscan');
  fs.writeFileSync(path.join(leg.dir, 'tool.json'), `${JSON.stringify({ role: SCAN_ROLE, path: found ?? null })}\n`);
  ctx.check(`${label}: ssh-keyscan, the program of Connect's scan, was found on the leg's PATH, and is named in tool.json`, found !== undefined, JSON.stringify(leg.env.PATH));
}

/** Connect's options, bounded: `{ ended, error, options }`. It never goes on to a connection. */
async function connectOptionsOf(w) {
  const result = { options: undefined };
  const done = await sec.finishes(w.connectOptions().then((options) => { result.options = options; }), 30_000);
  return { ...done, ...result };
}

/** The answer of the leg: *Trust and connect* ONLY to a question whose text holds K1's fingerprint; the install's question as the rig answers it; every other question dismissed. */
function answerOf(leg, fingerprint, seen) {
  const install = rig.installAnswer(leg);
  return (message, rest) => {
    seen.push({ message, buttons: rest.filter((one) => typeof one === 'string') });
    return message.includes(fingerprint) ? TRUST : install(message);
  };
}

/** R9.r1 to R9.r4 of Connect's repair: the one question, the one update, Connect's file, the client asked nothing. Answers Connect's file. */
function repairChecks(ctx, label, roads, seen, options, fingerprint) {
  const { check, product } = ctx;
  const leg = ctx.rig;
  const { w } = roads;
  const k1Text = refusedLeg.keyText(product, `${leg.k1}.pub`);
  check(`${label}: Connect showed ONE question, it holds K1's fingerprint, and its button is Trust and connect (R9.r1)`, seen.length === 1 && seen[0].message.includes(fingerprint) && seen[0].buttons.includes(TRUST), JSON.stringify(seen));
  check(`${label}: the storage got ONE update, its hostKey is K1's <algorithm> <base64> as K1's .pub holds it, and the world's snapshot holds it now (R9.r2)`, w.updates.length === 1 && w.updates[0].hostKey === k1Text && w.snapshot().hostKey === k1Text, JSON.stringify({ updates: w.updates.map((one) => one.hostKey), snapshot: w.snapshot().hostKey, k1: k1Text }));
  const file = options?.knownHostsFile;
  const line = product.knownHostsLine('127.0.0.1', roads.port, product.parseHostKey(k1Text));
  const text = file !== undefined && fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  check(`${label}: Connect's options named the file keys/<pid>/known_hosts-e1, holding K1's line for [127.0.0.1]:<port> (R9.r3)`, file !== undefined && path.basename(file) === 'known_hosts-e1' && path.dirname(file) === roads.sampler.dir && text === line, JSON.stringify({ file, text, line }));
  check(`${label}: Connect asked the client nothing: 0 runs of ssh -V and 0 starts of the client, so the world is still cold for M1 (R9.r4)`, roads.questions.length === 0 && sec.recordedStarts(leg).length === 0, JSON.stringify({ questions: roads.questions.length, starts: sec.recordedStarts(leg).length }));
  return file;
}

/** Connect's file is Connect's session's to delete (`sshSession.ts`); no session runs here, so the leg removes that one file by its exact path. */
function removeConnectFile(info, label, file) {
  if (file !== undefined && path.basename(file) === 'known_hosts-e1') {
    fs.rmSync(file, { force: true });
    info(`${label}: removed Connect's file ${path.basename(file)} by its exact path (Connect's session would delete it)`);
  }
}

/** `m9-key-repair`: the state of the key legs, Connect's repair, then the runs of M1 in the SAME world, cold, on the pin that Connect wrote. */
async function repairLeg(ctx) {
  const { check, info, product } = ctx;
  const leg = ctx.rig;
  const label = leg.label;
  const given = m1.standing(ctx);
  const k1 = await rig.counterpart(check, leg, 'k1', leg.k1, { extra: given.stand.extra });
  if (k1 === undefined) {
    return;
  }
  const fingerprint = product.hostKeyFingerprint(product.parseHostKey(fs.readFileSync(`${leg.k1}.pub`, 'utf8')));
  const seen = [];
  const roads = rig.openRoads(leg, k1.port, { credential: 'stored', answer: answerOf(leg, fingerprint, seen) });
  roads.w.replaceHostKey(refused.UNUSABLE_TEXT);
  rig.mark(leg, roads, [k1]);
  nameScan(ctx, label);
  const connect = await connectOptionsOf(roads.w);
  check(`${label}: Connect's options ended within 30 s`, connect.ended, JSON.stringify(connect.error));
  const file = repairChecks(ctx, label, roads, seen, connect.options, fingerprint);
  await within(3_000, () => rec.logCounts(k1.sshd.stderr, me).connections >= 1);
  await new Promise((resolve) => setTimeout(resolve, 500));
  const scan = rec.logCounts(k1.sshd.stderr, me);
  info(`${label}: Connect's scan: ${scan.connections} connections and ${scan.authAttempts} authentication attempts in K1's log`);
  removeConnectFile(info, label, file);
  rig.mark(leg, roads, [k1]);
  await m1.m1Runs(ctx, { label: `${label}: M1`, roads, k1, given });
  await rig.endCounterpart(check, leg, k1, 'K1');
  rig.evidence(leg, roads, [k1], { connect: { question: seen, updates: roads.w.updates.length, scan: { connections: scan.connections, authAttempts: scan.authAttempts } }, c20Ms: roads.questions[0]?.ms ?? null });
}

/** `m9-password-connect` (C1): K1 is ended before Connect, so the scan is given no answer; what Connect's options name for a password entry is recorded. Nothing connects. */
async function connectLeg(ctx) {
  const { check, info } = ctx;
  const leg = ctx.rig;
  const label = leg.label;
  const k1 = await rig.counterpart(check, leg, 'k1', leg.k1, { passwords: true });
  if (k1 === undefined) {
    return;
  }
  const roads = rig.openRoads(leg, k1.port, { credential: 'password', answer: refusedLeg.dismissAll });
  roads.w.replaceHostKey(refused.UNUSABLE_TEXT);
  await rig.endCounterpart(check, leg, k1, 'K1');
  rig.mark(leg, roads, []);
  nameScan(ctx, label);
  const connect = await connectOptionsOf(roads.w);
  const { options } = connect;
  const record = { answered: options === undefined ? 'stop' : 'go on', file: options?.knownHostsFile ?? null, pin: options?.pin ?? null, asked: roads.w.asked.length, updates: roads.w.updates.length };
  info(`${label}: C1: Connect's options answered ${record.answered}, named ${record.file ?? 'no pin file'}, saved ${record.pin ?? 'no pin'}, asked ${record.asked} questions`);
  check(`${label}: the record of C1 was taken: Connect's options answered within 30 s and each field of it is known`, connect.ended && Array.isArray(roads.w.asked) && Array.isArray(roads.w.updates), JSON.stringify({ connect: connect.error, record }));
  check(`${label}: nothing connected after Connect's options: the shim recorded 0 starts of the client`, sec.recordedStarts(leg).length === 0, JSON.stringify(sec.recordedStarts(leg).length));
  rig.evidence(leg, roads, [], { connect: record });
}

const bySpec = Object.fromEntries(refused.M9_LEGS.map((spec) => [spec.name, spec]));
const special = { 'm9-key-repair': repairLeg, 'm9-password-connect': connectLeg };
/** The leg of each name: the two Connect legs, and for every other the refused leg with its spec. */
const legs = Object.fromEntries(refused.M9_LEGS.map((spec) => [spec.name, special[spec.name] ?? ((ctx) => refusedLeg.refusedLeg(ctx, bySpec[spec.name]))]));

/** M9: every leg of the table, in its order, each in a leg process of its own. */
async function rowM9(check, top) {
  for (const spec of refused.M9_LEGS) {
    await rig.runLeg(check, top, 'M9', spec.name);
  }
}

module.exports = { rowM9, legs };
