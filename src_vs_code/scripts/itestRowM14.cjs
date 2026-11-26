'use strict';
// Row M14 of G1 (E3.S7; `todo/PLAN_person_roads_pin_host_key.md`, `## Epics`, E3; `todo/PLAN_person_roads_pin_host_key_E3_S7_spec.md` §4 and the lead's answers A1 and A2): the agent's pinned `ssh:exec` gets the same words and
// the same refusals as the three roads. "Its own call" is the action's own `run`, with the deps that production assembles (`sshDepsFor`), off a bridge, against the real `sshd` (`openExec` of the rig). Four legs, each its own
// process, world and counterpart: (a) K1: one accepted login and the six pairs of M1; (b) K2 and the handed config of M2 (b), (c) K2 and the handed config of M8: exit code 255 and the verification line, K2 logs
// nothing; (d) K1 and the storage folder of M12 (a): 0 starts of the client of any kind, the question `ssh -V` included, and the agent's answer names the place and the kind and holds no path. The expected values are
// literals of the spec or computed from what the leg made. A proving run of this file passes no row: its numbers are "seen when it was built".
const crypto = require('node:crypto');
const path = require('node:path');
const rig = require('./itestRowRig.cjs');
const m1 = require('./itestRowM1.cjs');
const m8 = require('./itestRowM8.cjs');
const ok = require('./lib/otherKeyRecord.cjs');
const pr = require('./lib/pathRecord.cjs');
const shared = require('./itestRowOtherKey.cjs');
const refused = require('./itestRowRefused.cjs');
const paths = require('./itestRowPaths.cjs');

const { sec } = rig;
const SPEC_B = ok.OTHER_KEY_LEGS.find((one) => one.name === 'm2-mismatch-global');
const SPEC_C = ok.OTHER_KEY_LEGS.find((one) => one.row === 'M8');
/** The place that sentence E names (the lead's answer A2): pinned here, with the kind's words, beside the product's whole sentence. */
const PLACE_WORDS = 'The folder where this editor keeps the files of CredsForDevs';

/** ONE `run` of the agent's exec (60 s): `{ ended, error, answer }`, the answer being `{ status, body }`. */
async function callOnce(roads, command) {
  const held = {};
  const done = await sec.finishes(roads.run(command).then((answer) => { held.answer = answer; }), 60_000);
  return { ...done, answer: held.answer };
}

/** The answer for the evidence: its status and body, the body's `stdout` and `stderr` cut at 2 kB. */
function answerRecord(answer) {
  const cut = (text) => (typeof text === 'string' ? text.slice(0, 2048) : text);
  return answer === undefined ? null : { status: answer.status, body: { ...answer.body, stdout: cut(answer.body?.stdout), stderr: cut(answer.body?.stderr) } };
}

/** M14.0: cold, 0 runs of `ssh -V` and 0 starts of the client before the call. */
function coldCheck(ctx, roads) {
  ctx.check(`${ctx.rig.label}: cold: 0 runs of ssh -V and 0 starts of the client before the call (M14.0)`, roads.questions.length === 0 && sec.recordedStarts(ctx.rig).length === 0, JSON.stringify({ questions: roads.questions.length }));
}

/** The leg's K1 or K2, the exec world pinned to K1, the mark and M14.0. Answers `{ server, roads }`, or `undefined` when the counterpart did not listen. */
async function opened(ctx, name, hostKey, prepare = async () => undefined) {
  const leg = ctx.rig;
  const server = await rig.counterpart(ctx.check, leg, name, hostKey);
  if (server === undefined) {
    return undefined;
  }
  const given = await prepare(server);
  const roads = rig.openExec(leg, server.port);
  rig.mark(leg, roads, [server]);
  coldCheck(ctx, roads);
  return { server, roads, given };
}

/** (b) and (c): the call was refused: exit code 255 and the verification line in the answer's body and in the run's recorded outcome, ONE connection start (M14.b1, M14.c1). */
function refusedCall(ctx, id, call, counts) {
  const body = call.answer?.body;
  const run = counts.runs[0];
  ctx.check(`${ctx.rig.label}: the call answered exit code 255, its run's stderr holds the verification line as a whole line, and it was ONE connection start (${id}.1)`, call.ended && call.answer?.status === 200 && body?.exitCode === 255 && ok.hasLine(body?.stderr) && counts.starts.connectionStarts === 1 && counts.runs.length === 1 && run.exitCode === 255 && ok.hasLine(run.stderr), JSON.stringify({ call, runs: counts.runs, connectionStarts: counts.starts.connectionStarts }));
}

/** (b) and (c): K2 logged a connection for the start, 0 accepted logins and 0 authentication attempts. */
function k2Quiet(ctx, id, counts) {
  const log = counts.counterparts[0];
  ctx.check(`${ctx.rig.label}: K2 logged a connection for the start, 0 accepted logins and 0 authentication attempts (${id}.2)`, counts.starts.connectionStarts === 1 && log.connections >= 1 && log.accepted.length === 0 && log.authAttempts === 0, JSON.stringify({ connections: log.connections, accepted: log.accepted, attempts: log.authAttempts }));
}

/** M14.a1 to M14.a4 (§4): the call worked, the shim recorded the question and ONE connection start, the argv holds the six pairs of M1 with the entry's own pin file, K1 logged ONE login with a command session. */
async function m14a(ctx) {
  const { check } = ctx;
  const leg = ctx.rig;
  const label = leg.label;
  const run = await opened(ctx, 'k1', leg.k1);
  if (run === undefined) {
    return;
  }
  const { server, roads } = run;
  const nonce = crypto.randomUUID();
  const call = await callOnce(roads, `printf %s ${nonce}`);
  await shared.logsArrived(roads, [server], 1);
  const counts = rig.countsOf(leg, roads, [server]);
  const body = call.answer?.body;
  check(`${label}: the agent's ssh:exec, through its own call off a bridge, answered status 200, exit code 0 and the nonce on stdout (M14.a1)`, call.ended && call.answer?.status === 200 && body?.exitCode === 0 && String(body?.stdout).trim() === nonce, JSON.stringify(answerRecord(call.answer)));
  const first = roads.outcomes[0];
  const questionEnd = counts.question.length === 1 ? counts.question[0].startedAt + counts.question[0].ms : null;
  check(`${label}: the shim recorded 2 starts, each whole: the question ssh -V, which ended before the connection started, and ONE connection start (M14.a2)`, counts.starts.total === 2 && counts.starts.list.every((one) => one.whole) && counts.starts.questions === 1 && counts.starts.connectionStarts === 1 && first !== undefined && questionEnd !== null && questionEnd <= first.startedAt, JSON.stringify({ starts: counts.starts.list, question: counts.question, runStartedAt: first?.startedAt }));
  const file = path.join(leg.storage, 'keys', String(process.pid), 'known_hosts-e1');
  const argv = shared.connectionStarts(leg, roads)[0]?.argv ?? [];
  const six = { StrictHostKeyChecking: ['yes'], UserKnownHostsFile: [file], GlobalKnownHostsFile: [file], VerifyHostKeyDNS: ['no'], KnownHostsCommand: ['none'], LogLevel: ['ERROR'] };
  const read = Object.fromEntries(Object.keys(six).map((name) => [name, ctx.product.argv.valuesOf(argv, name)]));
  check(`${label}: the recorded argv holds the six pairs of M1, each once: StrictHostKeyChecking=yes, UserKnownHostsFile and GlobalKnownHostsFile = <storage>/keys/<pid>/known_hosts-e1, VerifyHostKeyDNS=no, KnownHostsCommand=none, LogLevel=ERROR (M14.a3)`, argv.length > 0 && JSON.stringify(read) === JSON.stringify(six), JSON.stringify({ read, expected: six }));
  const log = await m1.acceptedOf(server, 1);
  check(`${label}: K1 logged exactly one accepted login, with a command session (M14.a4)`, log.accepted.length === 1 && log.accepted[0].session === 'command', JSON.stringify(log.accepted));
  await rig.endCounterpart(check, leg, server, 'K1');
  rig.evidence(leg, roads, [server], { ...counts, answer: answerRecord(call.answer), pin: path.relative(leg.dir, file), drove: true });
}

/** M14.b0: as M2.0 (b): under the leg's handed config the real client resolves the global known-hosts file to the leg's own file and the person's file to `/dev/null`. */
async function whichGlobal(ctx, port, source) {
  const files = await shared.whichFiles(ctx, port);
  ctx.check(`${ctx.rig.label}: the client reads ${path.relative(ctx.rig.dir, source.path)} as the system-wide known-hosts file (b) of the handed config of M2 (M14.b0)`, files.code === 0 && files.global === source.path && files.user === '/dev/null', JSON.stringify(files));
  return files;
}

/** `m14-b`: K2 answers, the handed config of M2 (b) trusts K2 in the system-wide file; the exec's call is refused. The witness (the two pairs of before E1, accepted by K2) comes after the counts. */
async function m14b(ctx) {
  const { check } = ctx;
  const leg = ctx.rig;
  const label = leg.label;
  let source;
  const run = await opened(ctx, 'k2', leg.k2, async (server) => {
    source = shared.writeSource(leg, SPEC_B, server.port);
    const config = rig.handConfig(leg, shared.optionsOf(leg, SPEC_B, source));
    await whichGlobal(ctx, server.port, source);
    return config;
  });
  if (run === undefined) {
    return;
  }
  const { server, roads } = run;
  const call = await callOnce(roads, `printf %s ${crypto.randomUUID()}`);
  await shared.logsArrived(roads, [server], 1);
  const counts = rig.countsOf(leg, roads, [server]);
  refusedCall(ctx, 'M14.b', call, counts);
  k2Quiet(ctx, 'M14.b', counts);
  const words = ok.beforeE1WordsFor(shared.writePin(leg, 'control-k1', server.port, leg.k1));
  const witness = await shared.login(ctx, server, words);
  const accepted = witness.code === 0 && witness.after.accepted === witness.before.accepted + 1 && witness.session === 'command';
  check(`${label}: the witness: the two pairs of before E1 (StrictHostKeyChecking=yes, UserKnownHostsFile=<a file of K1's line>, no GlobalKnownHostsFile) were accepted by K2: exit 0, and K2 logged one more accepted login with a command session (M14.bw)`, JSON.stringify(shared.wordsOf(witness.argv)) === JSON.stringify(words) && !witness.argv.some((word) => /GlobalKnownHostsFile/i.test(word)) && accepted, JSON.stringify({ argv: witness.argv, code: witness.code, stderr: witness.stderr, before: witness.before, after: witness.after }));
  await rig.endCounterpart(check, leg, server, 'K2');
  rig.evidence(leg, roads, [server], { ...counts, answer: answerRecord(call.answer), source: { path: path.relative(leg.dir, source.path), sha256: source.sha256 }, witness: { argv: witness.argv, code: witness.code, stdout: witness.stdout, stderr: witness.stderr }, drove: true });
}

/** `m14-c`: K2 answers, the handed config of M8 names a `KnownHostsCommand` that prints K2's line. The witness comes FIRST (E1's words of a file of K1's line, accepted by K2, the command started); then the exec's call is refused. */
async function m14c(ctx) {
  const { check } = ctx;
  const leg = ctx.rig;
  const label = leg.label;
  const held = {};
  const run = await opened(ctx, 'k2', leg.k2, async (server) => {
    held.command = m8.writeCommand(leg, server.port);
    const config = rig.handConfig(leg, shared.optionsOf(leg, SPEC_C, { path: held.command.command }));
    const files = await shared.whichFiles(ctx, server.port);
    check(`${label}: the leg's config names the recording command and no DNS source: ssh -G resolves knownhostscommand ${path.relative(leg.dir, held.command.command)} and verifyhostkeydns false (M14.c0)`, files.code === 0 && files.command === held.command.command && files.dns === 'false', JSON.stringify(files));
    const words = ok.e1WordsFor(shared.writePin(leg, 'control-k1', server.port, leg.k1));
    held.witness = await shared.login(ctx, server, words);
    held.starts = ok.khcStarts(shared.khcRecords(held.command.records));
    const accepted = held.witness.code === 0 && held.witness.after.accepted === held.witness.before.accepted + 1 && held.witness.session === 'command';
    check(`${label}: the witness first: E1's words (a file of K1's line for K2's port as both known-hosts files) were accepted by K2: exit 0, one accepted login with a command session, and the command's record holds at least one start (M14.cw)`, JSON.stringify(shared.wordsOf(held.witness.argv)) === JSON.stringify(words) && accepted && held.starts.length >= 1, JSON.stringify({ code: held.witness.code, stderr: held.witness.stderr, starts: held.starts.length }));
    return config;
  });
  if (run === undefined) {
    return;
  }
  const { server, roads } = run;
  const beforeMark = shared.khcRecords(held.command.records).length;
  const call = await callOnce(roads, `printf %s ${crypto.randomUUID()}`);
  await shared.logsArrived(roads, [server], 1);
  const counts = rig.countsOf(leg, roads, [server]);
  refusedCall(ctx, 'M14.c', call, counts);
  k2Quiet(ctx, 'M14.c', counts);
  const words = shared.connectionStarts(leg, roads).map((start) => ctx.product.argv.valuesOf(start.argv, 'KnownHostsCommand'));
  const afterMark = shared.khcRecords(held.command.records).length;
  check(`${label}: the argv holds KnownHostsCommand=none once, and the command's record holds 0 starts after the mark (M14.c3)`, words.length === 1 && JSON.stringify(words[0]) === JSON.stringify(['none']) && afterMark === beforeMark, JSON.stringify({ words, beforeMark, afterMark }));
  await rig.endCounterpart(check, leg, server, 'K2');
  rig.evidence(leg, roads, [server], { ...counts, answer: answerRecord(call.answer), source: { command: path.relative(leg.dir, held.command.command), records: { beforeMark, afterMark } }, witness: { argv: held.witness.argv, code: held.witness.code, stdout: held.witness.stdout, stderr: held.witness.stderr }, drove: true });
}

/** `m14-d`: K1 answers, the storage folder is M12 (a)'s (a double quote): the exec's own pin file `known_hosts-e1` has a path that the rule refuses, so nothing starts and the answer names the place and the kind and holds no path. */
async function m14d(ctx) {
  const { check, product } = ctx;
  const leg = ctx.rig;
  const label = leg.label;
  const folder = pr.M12_LEGS.find((one) => one.letter === 'a').folder;
  paths.storageAt(ctx, folder);
  const own = product.knownHostsPath(leg.storage, 'e1');
  check(`${label}: the product's rule, asked with <storage>/keys/<pid>/known_hosts-e1 (the exec's own file), answers quote (M14.d0)`, product.pinPathRefusal(own) === 'quote', JSON.stringify({ file: path.relative(leg.dir, own), answer: product.pinPathRefusal(own) ?? null }));
  const before = pr.listingOf(leg.storage);
  const run = await opened(ctx, 'k1', leg.k1);
  if (run === undefined) {
    return;
  }
  const { server, roads } = run;
  const call = await callOnce(roads, 'true');
  const counts = rig.countsOf(leg, roads, [server]);
  check(`${label}: 0 starts of the client of any kind after the mark, the question ssh -V included; the observer timed 0 runs (M14.d1)`, call.ended && counts.starts.total === 0 && counts.question.length === 0 && counts.runs.length === 0, JSON.stringify({ call, starts: counts.starts.list, timed: counts.question.length }));
  const error = call.answer?.body?.error;
  check(`${label}: the agent's answer is a refusal no_credential whose message is sentence E with a double quote and names the place: ${PLACE_WORDS} (M14.d2)`, error?.code === 'no_credential' && error.message === product.pinPathSentence('box', 'quote') && error.message.includes(PLACE_WORDS) && error.message.includes(pr.KIND_WORDS.quote), JSON.stringify(answerRecord(call.answer)));
  const shown = JSON.stringify(call.answer?.body ?? null);
  const found = pr.noPathIn(shown, [leg.storage, folder, JSON.stringify(folder).slice(1, -1), leg.dir]);
  check(`${label}: the agent's answer holds no path: neither the storage folder, nor its name, nor the leg's folder, nor a slash (M14.d3)`, call.answer !== undefined && found.ok, JSON.stringify(found));
  const after = paths.storageUnchanged(ctx, label, roads, before, 'M14.d4');
  const log = counts.counterparts[0];
  check(`${label}: K1 logged 0 connections and 0 authentication attempts after the mark (M14.d5)`, log.connections === 0 && log.authAttempts === 0 && log.accepted.length === 0, JSON.stringify({ connections: log.connections, attempts: log.authAttempts }));
  const alive = await refused.liveness(check, label, leg, server);
  await rig.endCounterpart(check, leg, server, 'K1');
  rig.evidence(leg, roads, [server], { ...counts, answer: answerRecord(call.answer), folder: path.relative(leg.dir, leg.storage), listing: { before, after }, liveness: alive, drove: true });
}

const legs = { 'm14-a': m14a, 'm14-b': m14b, 'm14-c': m14c, 'm14-d': m14d };

/** M14: its four legs, in order, each in a leg process of its own. */
async function rowM14(check, top) {
  for (const name of Object.keys(legs)) {
    await rig.runLeg(check, top, 'M14', name);
  }
}

module.exports = { rowM14, legs };
