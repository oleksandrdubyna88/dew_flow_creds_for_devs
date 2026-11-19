'use strict';
// The assertion engine of legs (u), (v) and (w) (E1.7 spec §S7.12, §S7.7, rule R4): it reads the lines the legs print, judges each expectation of `dbAssertRules.cjs` against them, applies the lock
// of `dbServedJobs.cjs`, and says what each pair rests on. It never builds a verdict, a launch or a table: the legs do, through the real client check and the real builder
// (`dbCandidates.cjs`), and print which table they were handed:
//
//   CANDIDATE <client> <vendor> <version> <tag> <platform> [driver <v>]  (<name>: <file>)   the production table with the one candidate row put in: the pair is not served yet
//   PRODUCTION <client> <vendor> <version> <tag> <platform> [driver <v>] (<name>: <file>)   the production table alone already serves this build
//
// A pair that is served (every line of its client is `PRODUCTION`) FAILS the run on any expectation that is not `pass`: a leg whose control was not shown (`UNMEASURED`), a leg that did not run, and a
// leg whose assertion is false. A candidate FAILS only on a false assertion with its control shown; what was not shown or did not run is printed `BLOCKING <leg>: <why>` and the run goes on, so a
// candidate's run says what stands between it and a row (R4). With `CI=true`, a candidate that names a build the production table serves cannot occur (the leg is then `PRODUCTION`), and a job
// that sets no name for a family whose pair the production table serves fails (the lock).
//
// Nothing here prints a credential: it reads what the legs printed, and prints their words back, clipped.
const path = require('node:path');
const { SERVED_JOBS, servedBuilds, keyOf, wordsOf } = require('./dbServedJobs.cjs');
const { rulesFor, legsOf } = require('./dbAssertRules.cjs');

const TABLE = /^(CANDIDATE|PRODUCTION) (\S+) (\S+) (\S+) ("(?:[^"\\]|\\.)*") (\S+)(?: driver (\S+))?\s+\(([^:]+): /;
const RECORD = /^record \(([^)]+)\):? ?(.*)$/;
const UNMEASURED = /^UNMEASURED (.+?): (.*)$/;
const STOP = /^STOP \(([^)]+)\): (.*)$/;
const RIG_FAILURE = /^FAIL /;

/** One printed line as an entry of the ledger, or `undefined` when it says nothing of a leg. */
function parseLine(line) {
  const table = TABLE.exec(line);
  if (table !== null) {
    return { kind: 'table', mode: table[1], client: table[2], vendor: table[3], version: table[4], tag: JSON.parse(table[5]), platform: table[6], driver: table[7], name: table[8] };
  }
  const found = [['record', RECORD], ['unmeasured', UNMEASURED], ['stop', STOP]].map(([kind, pattern]) => [kind, pattern.exec(line)]).find(([, match]) => match !== null);
  if (found !== undefined) {
    return { kind: found[0], leg: found[1][1], text: found[1][2] };
  }
  return RIG_FAILURE.test(line) ? { kind: 'rig', text: line } : undefined;
}

/** The ledger of a run: the entries of every line a leg printed. */
const ledgerOf = (lines) => lines.map(parseLine).filter((entry) => entry !== undefined);

/** Every console line the legs print, while `run` goes on, kept for the ledger and still printed. `lines` is what was seen. */
async function tapped(run) {
  const original = console.log;
  const lines = [];
  console.log = (...args) => {
    lines.push(...args.map(String).join(' ').split('\n'));
    original.apply(console, args);
  };
  try {
    return { result: await run(), lines };
  } finally {
    console.log = original;
  }
}

/** What one expectation says of a ledger: `{ id, status, why }`, where status is `pass`, `FAIL`, `not shown`, `not run` or `n/a`. */
function judge(rule, ledger, statusOf) {
  const legs = ledger.filter((entry) => entry.leg === rule.leg);
  const records = legs.filter((entry) => entry.kind === 'record');
  if (rule.na !== undefined && ledger.some((entry) => entry.kind === 'record' && entry.leg === rule.na && /not this client's plugin/.test(entry.text))) {
    return { id: rule.id, status: 'n/a', why: "not this client's road" };
  }
  if (rule.after !== undefined && statusOf(rule.after) !== 'pass' && statusOf(rule.after) !== 'n/a') {
    return { id: rule.id, status: 'not shown', why: `its positive control ${rule.after} is ${statusOf(rule.after)}` };
  }
  if (records.length < (rule.min ?? 1)) {
    const missing = ledger.find((entry) => entry.kind === 'unmeasured' && (entry.leg === rule.leg || rule.leg.startsWith(`${entry.leg}-`) || entry.leg.startsWith(rule.leg) || rule.u?.test(entry.leg) === true));
    return missing === undefined ? { id: rule.id, status: 'not run', why: `no record (${rule.leg}) was printed` } : { id: rule.id, status: 'not shown', why: `UNMEASURED ${missing.leg}: ${missing.text.slice(0, 140)}` };
  }
  if (rule.noStop === true && legs.some((entry) => entry.kind === 'stop')) {
    return { id: rule.id, status: 'FAIL', why: `STOP (${rule.leg}): ${legs.find((entry) => entry.kind === 'stop').text.slice(0, 160)}` };
  }
  const says = (entry) => rule.match.test(entry.text);
  const ok = rule.mode === 'all' ? records.every(says) : records.some(says);
  return ok ? { id: rule.id, status: 'pass', why: '' } : { id: rule.id, status: 'FAIL', why: `the record (${rule.leg}) does not say ${rule.match}: ${JSON.stringify(records.map((entry) => entry.text.slice(0, 120)))}` };
}

/** Every expectation of `rules` against `ledger`, in order; an expectation may name an earlier one as its control. */
function judgeAll(rules, ledger) {
  const results = new Map();
  const statusOf = (id) => results.get(id)?.status ?? 'not run';
  for (const rule of rules) {
    results.set(rule.id, judge(rule, ledger, statusOf));
  }
  return [...results.values()];
}

/** The clients a ledger saw, by the table lines: `{ client, vendor, version, tag, platform, driver, name, mode }`. */
const clientsOf = (ledger) => ledger.filter((entry) => entry.kind === 'table');

/**
 * The verdict of a run for one family: the results of every client's legs, which mode each client ran in, what is blocking, and whether the run fails. A client whose mode is `PRODUCTION` is a served pair:
 * every expectation must pass. A `CANDIDATE` fails only on `FAIL`.
 */
function assessFamily(family, ledger) {
  const seen = clientsOf(ledger).filter((entry) => entry.client === family);
  const unique = [...new Map(seen.map((entry) => [`${entry.vendor}|${entry.version}|${entry.tag}|${entry.driver ?? ''}`, entry])).values()];
  const clients = unique.map((client) => {
    const served = seen.filter((entry) => keyOf(entry) === keyOf(client)).every((entry) => entry.mode === 'PRODUCTION');
    const results = judgeAll(rulesFor(family, client.vendor, client.name), ledger);
    const failed = results.filter((result) => result.status === 'FAIL' || (served && result.status !== 'pass' && result.status !== 'n/a'));
    return { ...client, served, results, failed, blocking: results.filter((result) => result.status === 'not shown' || result.status === 'not run') };
  });
  const rig = ledger.filter((entry) => entry.kind === 'rig');
  return { clients, rig, failed: clients.some((client) => client.failed.length > 0) || rig.length > 0 };
}

/**
 * The CI lock of a job (§S7.7): for each build `SERVED_JOBS[job]` expects for this family on this platform, a client of the family read as that build under the production table (a `PRODUCTION` line), and
 * every leg of its list a `pass`. `MISSING <build>: <what>` for each that is not. With `CI=true` and no job name, a family whose pair the production table serves on this platform is a problem too.
 */
function lockCheck({ family, platform, job, ci, rows, jobs = SERVED_JOBS, assessed, ledger }) {
  const servedHere = servedBuilds(rows).filter((build) => build.client === family && build.platform === platform);
  if (job === undefined || job === '') {
    return ci && servedHere.length > 0 ? servedHere.map((build) => `MISSING ${wordsOf(build)}: this harness runs with CI=true and no BRIDGED_DB_JOB, and the production table serves it`) : [];
  }
  const expected = (jobs[job] ?? []).filter((build) => build.client === family && build.platform === platform);
  return expected.flatMap((build) => {
    const line = clientsOf(ledger).find((entry) => entry.mode === 'PRODUCTION' && entry.client === build.client && entry.vendor === build.vendor && entry.version === build.version && entry.tag === build.tag && entry.driver === build.driver);
    if (line === undefined) {
      return [`MISSING ${wordsOf(build)}: no client on this image was read by the real check as this build under the production table`];
    }
    const client = assessed.clients.find((one) => one.vendor === build.vendor && one.name === line.name);
    const byId = new Map((client?.results ?? []).map((result) => [result.id, result]));
    return build.legs.filter((leg) => byId.get(leg)?.status !== 'pass' && byId.get(leg)?.status !== 'n/a').map((leg) => `MISSING ${wordsOf(build)}: the leg ${leg} ${byId.get(leg)?.status ?? 'did not run'}${byId.get(leg)?.why ? ` (${byId.get(leg).why})` : ''}`);
  });
}

/**
 * T82: with `CI=true`, a leg that was handed a candidate table for a build the production table already serves is a problem: a served pair goes on passing under a table that was handed in, and the
 * production run ("PRODUCTION") is the one the merge waits for.
 */
function shadowProblems(ledger, rows, ci) {
  const served = new Set(servedBuilds(rows).map((build) => keyOf(build)));
  const shadows = clientsOf(ledger).filter((entry) => entry.mode === 'CANDIDATE' && served.has(keyOf(entry)));
  return ci ? shadows.map((entry) => `a candidate table names ${wordsOf(entry)}, which the production table serves`) : [];
}

/** Prints the assessment, and answers the exit code: 0, or 1 for a failed assertion, a rig failure, a served pair that is not wholly shown, or a lock problem. */
function report(family, assessed, lock, log = console.log) {
  for (const client of assessed.clients) {
    log(`\nassertions (${family}, ${client.name}: ${client.vendor} ${client.version} ${JSON.stringify(client.tag)}${client.driver === undefined ? '' : ` driver ${client.driver}`}), table: ${client.served ? 'PRODUCTION (a served pair)' : 'CANDIDATE (not served yet)'}`);
    for (const result of client.results) {
      log(`  ${result.status.padEnd(9)} ${result.id}${result.why === '' ? '' : `: ${result.why}`}`);
    }
    for (const blocked of client.blocking.filter(() => !client.served)) {
      log(`BLOCKING ${client.name} ${blocked.id}: ${blocked.why}`);
    }
  }
  if (assessed.clients.length === 0) {
    log(`BLOCKING ${family}: no client of this family was read by the real check on this runner (no CANDIDATE or PRODUCTION line was printed)`);
  }
  for (const problem of lock) {
    log(problem);
  }
  const code = assessed.failed || lock.length > 0 ? 1 : 0;
  log(code === 0 ? `\nall ${family} assertions held; ${assessed.clients.reduce((sum, client) => sum + client.blocking.length, 0)} blocking leg(s) before a row may turn` : '\nan assertion failed, a leg of a served pair is not wholly shown, or the lock found something missing');
  return code;
}

/**
 * The ending every assertion harness shares: the lines its legs printed, judged for `family`, the lock of this job applied to the PRODUCTION table (`out/bridgedDbProfile.js`), and the report. Answers the exit code.
 */
function conclude(family, lines) {
  const rows = require(path.join(__dirname, '..', '..', 'out', 'bridgedDbProfile.js')).BRIDGED_DB_PROFILES;
  const ledger = ledgerOf(lines);
  const assessed = assessFamily(family, ledger);
  const ci = process.env.CI === 'true';
  const lock = [...shadowProblems(ledger, rows, ci), ...lockCheck({ family, platform: process.platform, job: process.env.BRIDGED_DB_JOB, ci, rows, assessed, ledger })];
  return report(family, assessed, lock);
}

module.exports = { conclude, parseLine, ledgerOf, tapped, judge, judgeAll, assessFamily, lockCheck, shadowProblems, report, legsOf, keyOf };
