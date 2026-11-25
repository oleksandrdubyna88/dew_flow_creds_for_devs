'use strict';
// Row M11 of G1 (E3.S9; `todo/PLAN_person_roads_pin_host_key.md`, `## Epics`, E3; `todo/PLAN_person_roads_pin_host_key_E3_S9_spec.md` §1.3, §3.1, §3.2): the pinned roads against a client older than 8.5, which has no
// `KnownHostsCommand` and asks nothing more than E1's words and E2's two pairs. It runs through `itestOffRig.cjs m11` only (never in section 10, never in CI), with the unpacked OpenSSH 8.4p1 of probe P3 as
// the client of its older legs and the rig's own client as that of the two newer legs of the equals-sign pair. This file holds (a) the client alone, (b) the runs of M1, M2 (b) the mismatch and M7's shapes on the older
// client, the helpers every M11 leg shares (the client's version and parser, M11.p; the version in the counterpart's log, M11.v), and the list of the legs. The twin of (c) and the equals-sign pair are in
// `itestRowM11Bare.cjs`, (c) and (d) in `itestRowM11Never.cjs`. Each leg reads the version of ITS client and takes the expectation of that version's parser (decision 19): never one from an outcome.
// A proving run of this file passes no row: its numbers are "seen when it was built".
const { execFile } = require('node:child_process');
const path = require('node:path');
const rig = require('./itestRowRig.cjs');
const rec = require('./lib/rowRecord.cjs');
const ok = require('./lib/otherKeyRecord.cjs');
const off = require('./lib/offRigRecord.cjs');
const pr = require('./lib/pathRecord.cjs');
const { checkedPinOf } = require('./itestSshd.cjs');
const shared = require('./itestRowOtherKey.cjs');
const paths = require('./itestRowPaths.cjs');
const m1 = require('./itestRowM1.cjs');
const m2 = require('./itestRowM2.cjs');
const m7 = require('./itestRowM7.cjs');
const m8 = require('./itestRowM8.cjs');

const { me } = rig;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** One program, bounded, exe + argv: `{ code, stdout, stderr }`. Never rejects. */
function ask(program, args, timeoutMs = 10_000) {
  return new Promise((resolve) => {
    // The program is the leg's own client (an unpacked package or the rig's): a CI rig, not a product call.
    const child = execFile(program, args, { timeout: timeoutMs, encoding: 'utf8' }, (error, stdout, stderr) => { // NOSONAR: a CI rig
      resolve({ code: error ? (typeof error.code === 'number' ? error.code : null) : 0, stdout: String(stdout), stderr: String(stderr) });
    });
    child.stdin?.end();
  });
}

/**
 * M11.p (§1.3), the first check of every leg that starts a client: the leg's own client (`leg.real`, by its path) printed a version that the product reads (`versionTokenOf`), and the lib reads its
 * parser as the one this leg is written for. A version that cannot be read, or another parser, is a named FAIL and the leg goes on (Q9). Answers `{ line, word, token, parser }` for the leg's evidence.
 */
async function clientCheck(ctx, expected) {
  const leg = ctx.rig;
  const said = await ask(leg.real, ['-V']);
  const line = `${said.stdout}${said.stderr}`.split(/\r?\n/).find((one) => one.startsWith('OpenSSH_')) ?? null;
  const token = said.code === 0 ? ctx.product.versionTokenOf(said.stderr) : undefined;
  const parser = off.parserOf(token?.version);
  ctx.check(`${leg.label}: this leg's client printed a version for -V that the product reads, and its parser is ${expected}, the parser this leg is written for (M11.p)`, parser === expected, JSON.stringify({ code: said.code, said: `${said.stdout}${said.stderr}`.trim(), token, parser }));
  ctx.info(`${leg.label}: the client ${leg.real} printed ${JSON.stringify(line)}; its parser is ${parser}`);
  return { line, word: line === null ? null : line.split(/[\s,]+/)[0], token: token ?? null, parser };
}

/**
 * M11.v (L5): the log of each counterpart of the leg (at `DEBUG1`) names the client's version as the remote software version of at least one connection after the mark. A leg that ran no counterpart, or whose
 * version was not read, fails: the check could not otherwise tell the older client from the newer one.
 */
function versionLogCheck(ctx, client) {
  const leg = ctx.rig;
  const servers = leg.servers ?? [];
  const from = leg.roads === undefined ? {} : rig.markOf(leg.roads).logs;
  const missing = servers.filter((server) => client.word === null || !off.versionSeen(server.sshd.stderr.slice(from[server.name] ?? 0), client.word)).map((server) => server.name);
  ctx.check(`${leg.label}: the log of each counterpart names remote software version ${client.word} for at least one connection after the mark (M11.v)`, servers.length > 0 && client.word !== null && missing.length === 0, JSON.stringify({ servers: servers.map((server) => server.name), missing }));
}

/**
 * A leg of M11 on the client of `parser`: its expectation is the lib's constant for that parser (`ctx.expect`, D7), its counterparts log at `DEBUG1` (`debug`), M11.p heads it, the leg runs with every check
 * of its own, and M11.v follows. The leg's evidence carries the client's version and parser (the rig's `evidence` adds `leg.evidenceExtra`).
 */
function withParser(parser, run, { debug = true } = {}) {
  return async (ctx) => {
    ctx.expect = off.EXPECT[parser];
    if (debug) {
      ctx.rig.logLevel = 'DEBUG1';
    }
    const client = await clientCheck(ctx, parser);
    ctx.rig.evidenceExtra = { client: { version: client.line, parser: client.parser, expected: parser } };
    await run(ctx);
    if (debug) {
      versionLogCheck(ctx, client);
    }
  };
}

/** The evidence of a leg that has no roads (the client alone, M13-like): ONE `evidence <json>` line with the four counts of decision 15 and the client. */
function evidenceAlone(ctx, fields) {
  return paths.evidenceNone(ctx.rig, { ...(ctx.rig.evidenceExtra ?? {}), ...fields });
}

/** The four counts of a client-alone leg (decision 15): `runs` starts of the client, `connectionStarts`, and the counterpart's log after `from` (authentication attempts, accepted logins with their session). */
function countsAlone(server, from, runs, connectionStarts) {
  const log = rec.logCounts(server.sshd.stderr.slice(from), me);
  return { starts: runs, connectionStarts, connections: log.connections, authAttempts: log.authAttempts, accepted: log.accepted };
}

// ---- (a): the client alone -----------------------------------------------------------------------------------------------------------

const A_LEGS = { 'm11-a-unknown': { unknown: true }, 'm11-a-ignored': { unknown: false } };

/** One login of the leg's own client with the product's words for it, pinned to K1, to K2's port. */
function pinnedRun(ctx, words, port) {
  return rig.viaReal(ctx.rig, [...words, '-i', ctx.rig.userKey, '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes', '-p', String(port), `${me}@127.0.0.1`, 'true']);
}

/** The witness (M11.a1w, M11.aw): the same client with E1's literal words of a file of K2's line, under the leg's config as it now is; accepted by K2. Answers `{ run, ok }`. */
async function witness(ctx, id, words, server, text) {
  const run = await shared.login(ctx, server, words);
  const good = run.code === 0 && run.after.accepted === run.before.accepted + 1;
  ctx.check(`${ctx.rig.label}: ${text} ended with 0 and K2 logged one more accepted login (${id})`, good, JSON.stringify({ code: run.code, stderr: run.stderr, before: run.before, after: run.after }));
  return { argv: run.argv, code: run.code, stdout: run.stdout, stderr: run.stderr };
}

/** M11 (a): `m11-a-unknown` (a `KnownHostsCommand` line and no `IgnoreUnknown`: the client ends before it connects) and `m11-a-ignored` (the config's own `IgnoreUnknown` for it: the login is refused by the pin). */
async function aLeg(ctx, spec) {
  const { check, info, product } = ctx;
  const leg = ctx.rig;
  const label = leg.label;
  const k2 = await rig.counterpart(check, leg, 'k2', leg.k2);
  if (k2 === undefined) {
    return;
  }
  const { command, records } = m8.writeCommand(leg, k2.port);
  rig.handConfig(leg, { lines: spec.unknown ? [`KnownHostsCommand ${command}`] : ['IgnoreUnknown KnownHostsCommand', `KnownHostsCommand ${command}`] });
  const pinFile = shared.writePin(leg, 'pin-k1', k2.port, leg.k1);
  const words = product.hostKeyWords(await checkedPinOf(leg.out, pinFile));
  check(`${label}: the product's words for this client hold no KnownHostsCommand pair (M11.a0)`, words.length > 0 && !words.some((word) => /^knownhostscommand/i.test(word)), JSON.stringify(words));
  const from = k2.sshd.stderr.length;
  const run = await pinnedRun(ctx, words, k2.port);
  await sleep(shared.SETTLE_MS);
  const log = rec.logCounts(k2.sshd.stderr.slice(from), me);
  const said = { code: run.code, stdout: run.stdout, stderr: run.stderr };
  let proof;
  if (spec.unknown) {
    check(`${label}: without IgnoreUnknown the client ended with 255 and a stderr line that holds "Bad configuration option" and "knownhostscommand" (M11.a1)`, run.code === 255 && /Bad configuration option/i.test(run.stderr) && /knownhostscommand/i.test(run.stderr), JSON.stringify(said));
    check(`${label}: K2 logged 0 connections after the mark: the client ended before it connected (M11.a1c)`, log.connections === 0, JSON.stringify({ connections: log.connections }));
    rig.handConfig(leg, {});
    proof = await witness(ctx, 'M11.a1w', ok.e1WordsFor(shared.writePin(leg, 'witness-k2', k2.port, leg.k2)), k2, 'the witness, the same client with E1\'s literal words of a file of K2\'s line and the config without the KnownHostsCommand line,');
  } else {
    check(`${label}: with the config's own IgnoreUnknown the client ended with 255 and the verification line as a whole line (M11.a2)`, run.code === 255 && ok.hasLine(run.stderr), JSON.stringify(said));
    check(`${label}: K2 logged 0 accepted logins and 0 authentication attempts after the mark (M11.a2c)`, log.accepted.length === 0 && log.authAttempts === 0, JSON.stringify({ accepted: log.accepted, attempts: log.authAttempts }));
    proof = await witness(ctx, 'M11.aw', ok.e1WordsFor(shared.writePin(leg, 'witness-k2', k2.port, leg.k2)), k2, 'the witness (E1\'s literal words of a file of K2\'s line, the same config)');
  }
  info(`${label}: M11.ak: the recording command was started ${ok.khcStarts(shared.khcRecords(records)).length} times (expected 0: this client does not know the option)`);
  await rig.endCounterpart(check, leg, k2, 'K2');
  evidenceAlone(ctx, { ...countsAlone(k2, from, 1, 1), part: 'a', unknown: spec.unknown, run: said, witness: proof, words });
}

// ---- (b): the runs of M1, M2 (b) the mismatch and M7's shapes on the older client -------------------------------------------------------

/** M11.q and M11.w (§3.2): the question once for each pinned call, ended before its call's first run; no KnownHostsCommand pair, the other five. `calls` is the count that the leg's scenario has. */
function olderChecks(ctx, roads, counts, calls, parser = 'older') {
  const leg = ctx.rig;
  const made = rig.callsOf(leg, roads, ctx.product);
  const asked = parser === 'older' ? calls : 1;
  ctx.check(`${leg.label}: ${parser === 'older' ? 'one question ssh -V before the connections of each pinned call' : 'one question ssh -V in all, before the first connection'}: ${calls} calls, ${asked} questions, each ended before its call's first run (M11.q)`, made.length === calls && counts.question.length === asked && off.questionsOk(parser, made, counts.question), JSON.stringify({ calls: made.map((call) => call.from), questions: counts.question }));
  const starts = shared.connectionStarts(leg, roads);
  const wrong = starts.filter((start) => !off.wordsOk(parser, start.argv)).map((start) => ctx.product.argv.sourceWordsOf(start.argv));
  ctx.check(`${leg.label}: each connection start holds ${parser === 'older' ? 'no KnownHostsCommand pair, and ' : ''}StrictHostKeyChecking=yes, one path as both known-hosts files, VerifyHostKeyDNS=no and LogLevel=ERROR${parser === 'older' ? '' : ', KnownHostsCommand=none'}, each once (M11.w)`, starts.length > 0 && wrong.length === 0, JSON.stringify({ starts: starts.length, wrong }));
}

/** The fields of the evidence that every leg of M7 shares (§1.7 of its spec). */
const fieldsOf = (leg, spec, rule) => ({ shape: spec.shape, folder: path.relative(leg.dir, leg.storage), word: spec.word, rule });

/** `m11-m1`: M1's runs and every one of its checks on the older client; M1.8 to M1.10 take `EXPECT.older`. */
async function legM1(ctx) {
  const { check } = ctx;
  const leg = ctx.rig;
  const given = m1.standing(ctx);
  const k1 = await rig.counterpart(check, leg, 'k1', leg.k1, { extra: given.stand.extra });
  if (k1 === undefined) {
    return;
  }
  const roads = rig.openRoads(leg, k1.port, { credential: 'named', answer: rig.installAnswer(leg) });
  await m1.m1Runs(ctx, { label: leg.label, roads, k1, given });
  await rig.endCounterpart(check, leg, k1, 'K1');
  rig.evidence(leg, roads, [k1], { c20Ms: roads.questions[0]?.ms ?? null });
}

/** `m11-m2-mismatch-global`: M2 (b)'s mismatch with every M2 check, then M11.q and M11.w (3 calls). */
async function legMismatch(ctx) {
  const spec = ok.OTHER_KEY_LEGS.find((one) => one.name === 'm2-mismatch-global');
  await m2.mismatch(ctx, spec, async (_ctx, roads, counts) => {
    olderChecks(ctx, roads, counts, 3);
    return {};
  });
}

/**
 * `m11-m7-<shape>-<run>`: M7's leg of that shape and run on the older client, with ALL of its own checks (M7.w, M7.c1 to M7.c3 in the mismatch) and M11's (M11.q and M11.w: 3 calls in the mismatch, 1 in the switch; the
 * runs of M1 have M1.8 to M1.10 on `EXPECT.older`). The three runs are M7's own, written here because M7 keeps its own `more` closure.
 */
async function legM7(ctx, spec) {
  const { check } = ctx;
  const leg = ctx.rig;
  const rule = m7.begin(ctx, spec);
  if (rule === undefined) {
    return;
  }
  if (spec.run === 'm1') {
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
    return;
  }
  const global = ok.OTHER_KEY_LEGS.find((one) => one.name === `m2-${spec.run}-global`);
  const more = async (_ctx, roads, counts) => {
    paths.wordCheck(ctx, leg.label, roads, spec);
    if (spec.run === 'mismatch') {
      paths.sentenceCChecks(ctx, leg.label, roads, spec);
    }
    olderChecks(ctx, roads, counts, spec.run === 'mismatch' ? 3 : 1);
    return fieldsOf(leg, spec, rule);
  };
  await (spec.run === 'mismatch' ? m2.mismatch : m2.switchLeg)(ctx, global, more);
}

module.exports = { clientCheck, versionLogCheck, withParser, evidenceAlone, countsAlone, olderChecks, ask, sleep }; // the helpers first: the two files below take them from this one

const olderLeg = (run, options) => withParser('older', run, options);
const legs = {
  'm11-a-unknown': olderLeg((ctx) => aLeg(ctx, A_LEGS['m11-a-unknown']), { debug: false }),
  'm11-a-ignored': olderLeg((ctx) => aLeg(ctx, A_LEGS['m11-a-ignored'])),
  'm11-m1': olderLeg(legM1),
  'm11-m2-mismatch-global': olderLeg(legMismatch),
};
for (const spec of off.M11_LEGS.filter((one) => one.name.startsWith('m11-m7-'))) {
  const m7Spec = pr.M7_LEGS.find((one) => `m11-${one.name}` === spec.name);
  legs[spec.name] = olderLeg((ctx) => legM7(ctx, m7Spec));
}

Object.assign(legs, require('./itestRowM11Bare.cjs').legs, require('./itestRowM11Never.cjs').legs);
module.exports.legs = legs;

/**
 * M11: every leg of the table that `only` names (all of them with none; `--legs` is for the hand checks, and a run that gives it is no proving run), each in a leg process of its own. `top.older` and `top.newer` are the
 * two clients (the entry makes them); a leg of (c) or (d) gets the program that the parent writes for it, the two newer legs of the equals-sign pair the rig's own client, every other leg the older one.
 */
async function rowM11(check, top, only) {
  for (const spec of off.M11_LEGS.filter((one) => only === undefined || only.includes(one.name))) {
    const never = require('./itestRowM11Never.cjs');
    const real = spec.part === 'c' || spec.part === 'd' ? never.writeProgram(top, never.CASES[spec.name]) : spec.parser === 'newer' ? top.newer : top.older;
    await rig.runLeg(check, top, 'M11', spec.name, `M11 ${spec.name}`, { real });
  }
}

module.exports.rowM11 = rowM11;
