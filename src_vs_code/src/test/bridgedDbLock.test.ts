import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { BRIDGED_DB_PROFILES, type DbProfileRow, type DbServedClient } from '../bridgedDbProfile';
import { assessFamily, judgeAll, ledgerOf, lockCheck, parseLine, report, shadowProblems } from '../../scripts/lib/dbAssert.cjs';
import { RECORD_ONLY, rulesFor } from '../../scripts/lib/dbAssertRules.cjs';
import { tableWith } from '../../scripts/lib/dbCandidates.cjs';
import { CONTAINER_HARNESS, HARNESS_OF, SERVED_JOBS, hasJobStep, lockProblems } from '../../scripts/lib/dbServedJobs.cjs';

/**
 * The CI lock and the assertion legs of the E1.7 spec (§S7.7 "The lock in CI", §S7.12, rule R4): DP20 (the candidate rows), DP21 (the lock: every served build is in a job's list with its legs, every entry
 * is a served build, every job is a step of the workflow that runs its family's harness), and what the assertion engine says of the lines the legs print (T81, T82). With no row served the lock passes
 * vacuously; these tests show with a table that serves one that it would not.
 */

const WORKFLOW = fs.readFileSync(path.join(__dirname, '..', '..', '..', '.github', 'workflows', 'ci-extension.yml'), 'utf8');

const PSQL_BUILD = { version: '18.7', tag: '(Ubuntu 18.7-1.pgdg26.04+2)', record: 'run 44543740467 at 0123abc' };
const SERVED_PSQL: readonly DbProfileRow[] = [{ client: 'psql', platform: 'linux', served: true, clients: [{ vendor: 'postgresql', builds: [PSQL_BUILD] }] }];
const ENTRY = { client: 'psql', platform: 'linux', vendor: 'postgresql', version: '18.7', tag: '(Ubuntu 18.7-1.pgdg26.04+2)' };
const legsOf = (client: string, vendor: string, platform?: string): string[] => rulesFor(client, vendor, vendor, platform).map((rule: { id: string }) => rule.id);
const STEP = (job: string, harness: string): string => `\n      - name: Assert the legs\n        env:\n          BRIDGED_DB_JOB: ${job}\n        run: node scripts/${harness}\n`;

test('DP21: the production table, the jobs\' list and the workflow agree: every served build stands in a job of the workflow with every leg of its vendor, and every entry of the list is a served build', () => {
  assert.deepEqual(BRIDGED_DB_PROFILES.filter((row) => row.served).map((row) => `${row.client}/${row.platform}`), ['sqlcmd/linux', 'sqlcmd/container'], 'the turned rows');
  assert.deepEqual(lockProblems({ rows: BRIDGED_DB_PROFILES, jobs: SERVED_JOBS, workflow: WORKFLOW, legsOf }), []);
  assert.deepEqual(Object.keys(SERVED_JOBS).sort(), ['bridged-db-container', 'bridged-ps1-linux-ubuntu-22.04', 'bridged-ps1-linux-ubuntu-24.04', 'bridged-ps1-linux-ubuntu-latest'], 'each Linux PS1 image\'s job finds its build, and the container job the image\'s');
  for (const harness of [...Object.values(HARNESS_OF), CONTAINER_HARNESS] as string[]) {
    assert.equal(fs.existsSync(path.join(__dirname, '..', '..', 'scripts', harness)), true, `${harness} is a file of scripts/`);
  }
});

const JOBS_OF_THE_WORKFLOW: ReadonlyArray<readonly [string, string]> = [
  ['database-clients-ubuntu-22.04', 'psql'], ['database-clients-ubuntu-24.04', 'mysql'], ['database-clients-ubuntu-latest', 'psql'], ['database-clients-ubuntu-latest', 'mysql'],
  ['bridged-ps1-linux-ubuntu-22.04', 'sqlcmd'], ['bridged-ps1-linux-ubuntu-24.04', 'sqlcmd'], ['bridged-ps1-linux-ubuntu-latest', 'sqlcmd'], ['bridged-ps1-windows', 'sqlcmd'],
];

test('DP21: the workflow runs each assertion harness in the jobs that will name their builds: the database-clients matrix (psql and mysql, on Linux) and both PS1 jobs (sqlcmd); nothing else runs one', () => {
  for (const [job, family] of JOBS_OF_THE_WORKFLOW) {
    assert.equal(hasJobStep(WORKFLOW, job, HARNESS_OF[family]), true, `${job} runs ${HARNESS_OF[family]}`);
  }
  assert.equal(hasJobStep(WORKFLOW, 'bridged-ps1-linux-ubuntu-24.04', HARNESS_OF.psql), false, 'and the PS1 jobs run only the sqlcmd one');
});

test('DP21: a served build stands in a job\'s list with the legs of its vendor, and the job is a step of the workflow that sets its name and runs the family\'s harness; each way it is not, the lock says so', () => {
  const legs = legsOf('psql', 'postgresql');
  const listed = { ...ENTRY, legs };
  const workflow = `${WORKFLOW}${STEP('db-ubuntu-latest', HARNESS_OF.psql)}`;
  assert.deepEqual(lockProblems({ rows: SERVED_PSQL, jobs: { 'db-ubuntu-latest': [listed] }, workflow, legsOf }), [], 'control: all of it agrees');

  const problems = (over: { rows?: readonly DbProfileRow[]; jobs?: Record<string, unknown[]>; workflow?: string }): string[] =>
    lockProblems({ rows: over.rows ?? SERVED_PSQL, jobs: over.jobs ?? { 'db-ubuntu-latest': [listed] }, workflow: over.workflow ?? workflow, legsOf });
  assert.match(problems({ jobs: {} }).join('\n'), /stands in no job's list/, 'a served build that no job lists');
  assert.match(problems({ rows: BRIDGED_DB_PROFILES }).join('\n'), /which no served row records/, 'an entry that no row serves');
  assert.match(problems({ jobs: { 'db-ubuntu-latest': [{ ...listed, version: '18.8' }] } }).join('\n'), /stands in no job's list[\s\S]*which no served row records/, 'another version than the row\'s');
  assert.match(problems({ jobs: { 'db-ubuntu-latest': [{ ...listed, legs: legs.slice(1) }] } }).join('\n'), /the list lacks the leg/, 'a leg skipped');
  assert.match(problems({ jobs: { 'db-ubuntu-latest': [{ ...listed, legs: [...legs, 'PK1-m1-control'] }] } }).join('\n'), /names the leg PK1-m1-control/, 'a leg that is no leg of its vendor');
  assert.match(problems({ workflow: WORKFLOW }).join('\n'), /is no step of the workflow/, 'a job that is no step');
  assert.match(problems({ workflow: `${WORKFLOW}${STEP('db-ubuntu-latest', HARNESS_OF.mysql)}` }).join('\n'), /runs scripts\/bridged-psql-assert-itest\.cjs/, 'a step that runs another family\'s harness');
});

test('DP20 (T82): a candidate row has the production row\'s shape and names a build the production table does not serve, and changes nothing of the production table', () => {
  const build = { version: '18.7', tag: '(Ubuntu 18.7-1.pgdg26.04+2)' };
  const candidate = tableWith(BRIDGED_DB_PROFILES, 'linux', 'psql', build);
  assert.equal(candidate.mode, 'CANDIDATE');
  const row = rowIn(candidate.rows, 'psql');
  assert.deepEqual(Object.keys(row).sort(), ['client', 'clients', 'platform', 'served'], 'the production row\'s fields');
  assert.deepEqual((row.clients as DbServedClient[])[0].builds[0], { ...build, record: 'candidate: this run' });
  assert.equal(rowIn(BRIDGED_DB_PROFILES, 'psql').served, false, 'the production table is not changed');
});

test('DP20 (T82): the ODBC candidate lists its driver; a build the production table serves is read from it alone; under CI a candidate for a served build fails', () => {
  const build = { version: '18.7', tag: '(Ubuntu 18.7-1.pgdg26.04+2)' };
  const odbc = tableWith(BRIDGED_DB_PROFILES, 'linux', 'odbc-sqlcmd', { version: '18.6.0001.1', tag: 'Linux', driver: '18.6.1.1' });
  assert.equal(odbc.mode, 'CANDIDATE', 'a build the production table does not serve');
  const odbcBuilds = (rowIn(odbc.rows, 'sqlcmd').clients as DbServedClient[])[0].builds;
  assert.deepEqual(odbcBuilds.at(-1), { version: '18.6.0001.1', tag: 'Linux', driver: '18.6.1.1', record: 'candidate: this run' }, 'put in after the served builds');
  assert.equal(odbcBuilds.length, 3, 'the two served builds stay');
  assert.equal(tableWith(BRIDGED_DB_PROFILES, 'linux', 'odbc-sqlcmd', { version: '18.7.0001.1', tag: 'Linux', driver: '18.7.1.1' }).mode, 'PRODUCTION', 'a served build is read from the production table alone');
  assert.equal(tableWith(BRIDGED_DB_PROFILES, 'linux', 'odbc-sqlcmd', { version: '18.7.0001.1', tag: 'Linux', driver: '18.6.1.1' }).mode, 'CANDIDATE', 'the same client over another driver is not the served build');

  const production = tableWith(SERVED_PSQL, 'linux', 'psql', build);
  assert.equal(production.mode, 'PRODUCTION');
  assert.equal(production.rows, SERVED_PSQL, 'the very table, handed in nothing');

  const ledger = ledgerOf(['CANDIDATE psql postgresql 18.7 "(Ubuntu 18.7-1.pgdg26.04+2)" linux  (psql: /usr/lib/postgresql/18/bin/psql)']);
  assert.match(shadowProblems(ledger, SERVED_PSQL, true).join('\n'), /which the production table serves/);
  assert.deepEqual(shadowProblems(ledger, SERVED_PSQL, false), [], 'off CI it is a printed fact, not a failure');
  assert.deepEqual(shadowProblems(ledger, BRIDGED_DB_PROFILES, true), [], 'a build the production table does not serve may be a candidate');
});

const rowIn = (rows: readonly DbProfileRow[], client: string): DbProfileRow => rows.find((one) => one.client === client && one.platform === 'linux') as DbProfileRow;

const TABLE = (mode: string): string => `${mode} psql postgresql 18.7 "(Ubuntu 18.7-1.pgdg26.04+2)" linux  (psql: /usr/lib/postgresql/18/bin/psql)`;
const ALL_PASS = [
  'record (U-enc-control): positive control: LEAKS', 'record (U-auth-control): positive control: LEAKS', 'record (U-cert-control): the marker certificate LEAKS',
  ...['U-enc-built', 'U-auth-built', 'U-enc-env', 'U-auth-env'].flatMap((leg) => [`record (${leg}): entry A: HELD`, `record (${leg}): entry B: HELD`]),
  'record (U-cert-built): HELD', 'record (U-cert-mode-only): HELD', 'record (U-verify-full): HELD', 'record (U-rc): NOT A LAUNCHER',
  "record (PE1-1/2) psql, server method scram-sha-256, the entry's user and password, under the whole profile: LOGGED IN; the server's log names: method=scram-sha-256",
  'record (PE1-1/2) psql, server method scram-sha-256, a wrong password, under the whole profile: REFUSED (exit 2): FATAL',
  "record (PE1-3) psql, server method md5, the entry's user and password, under the whole profile: LOGGED IN;", 'record (PE1-3) psql, server method md5, a wrong password, under the whole profile: REFUSED (exit 2)',
  "record (PE1-3) psql, server method password, the entry's user and password, under the whole profile: LOGGED IN;", 'record (PE1-3) psql, server method password, a wrong password, under the whole profile: REFUSED (exit 2)',
  'record (PE1-4) psql, server method trust, CONTROL: a wrong password with require_auth cut by hand: LOGGED IN', 'record (PE1-4) psql, server method trust, a wrong password, under the whole profile: REFUSED (exit 2)',
  'record (PP1-1) psql, the production launch for an entry on localhost: exit 0; the login is pe1, over TCP; it said ""',
  'record (PA1-i-version-choice): the wrapper followed a local-cluster file for both spawns (a rig that shows the control)',
];

const assess = (lines: string[]): ReturnType<typeof assessFamily> => assessFamily('psql', ledgerOf(lines));
const statusOf = (assessed: ReturnType<typeof assessFamily>, id: string): string => assessed.clients[0].results.find((result: { id: string }) => result.id === id)?.status as string;

test('T81 (R4): every leg of a served pair passes with its control shown; a leg whose control was not shown, or that did not run, FAILS a served pair and is only BLOCKING for a candidate; a false assertion fails both', () => {
  const served = assess([TABLE('PRODUCTION'), ...ALL_PASS]);
  assert.equal(served.failed, false, JSON.stringify(served.clients[0].failed));
  assert.equal(served.clients[0].results.every((result: { status: string }) => result.status === 'pass'), true);

  const withoutControl = ALL_PASS.filter((line) => !line.startsWith('record (U-enc-control)')).concat('UNMEASURED U-enc-control: no realm');
  const candidate = assess([TABLE('CANDIDATE'), ...withoutControl]);
  assert.equal(statusOf(candidate, 'PK1-p0'), 'not shown');
  assert.equal(statusOf(candidate, 'PK1-p2-enc'), 'not shown', 'what stands on that control is not judged');
  assert.equal(candidate.failed, false, 'a candidate is not failed by what was not shown');
  const printed: string[] = [];
  assert.equal(report('psql', candidate, [], (line: string) => printed.push(line)), 0);
  assert.match(printed.join('\n'), /BLOCKING psql PK1-p0: UNMEASURED U-enc-control: no realm/);
  assert.equal(assess([TABLE('PRODUCTION'), ...withoutControl]).failed, true, 'the same lines FAIL a pair that is served');
  assert.equal(assess([TABLE('PRODUCTION'), ...ALL_PASS.filter((line) => !line.startsWith('record (PP1-1)'))]).failed, true, 'a leg that did not run fails a served pair');

  const leaked = ALL_PASS.map((line) => (line.startsWith('record (U-enc-built): entry B') ? 'record (U-enc-built): entry B: IDENTITY OFFERED' : line));
  const bad = assess([TABLE('CANDIDATE'), ...leaked]);
  assert.equal(statusOf(bad, 'PK1-p2-enc'), 'FAIL', 'the control was shown and production offered the identity');
  assert.equal(bad.failed, true);
  const stopped = assess([TABLE('CANDIDATE'), ...ALL_PASS, 'STOP (PE1-4): the client logged in']);
  assert.equal(stopped.clients[0].results.find((result: { id: string }) => result.id === 'PE1-4')?.status, 'pass', 'a STOP of a leg that does not ask for it is a note');
  assert.equal(assess([TABLE('CANDIDATE'), ...ALL_PASS, 'FAIL (rig) the server did not start']).failed, true, 'a rig failure fails the run');
});

test('T81 (§S7.7): the lock of a job: a served build must be read by the real check under the production table, and each leg of its list must pass; with no name under CI a served family fails', () => {
  const legs = legsOf('psql', 'postgresql');
  const jobs = { 'db-ubuntu-latest': [{ ...ENTRY, legs }] };
  const ledger = ledgerOf([TABLE('PRODUCTION'), ...ALL_PASS]);
  const assessed = assessFamily('psql', ledger);
  const args = { family: 'psql', platform: 'linux', job: 'db-ubuntu-latest', ci: true, rows: SERVED_PSQL, jobs, assessed, ledger };
  assert.deepEqual(lockCheck(args), [], 'control: found, and every leg passed');

  assert.match(lockCheck({ ...args, ledger: ledgerOf(ALL_PASS), assessed: assessFamily('psql', ledgerOf(ALL_PASS)) }).join('\n'), /MISSING psql postgresql 18.7 .*no client on this image was read by the real check/, 'the client left the image');
  const other = ledgerOf([TABLE('PRODUCTION').replace('18.7', '18.8'), ...ALL_PASS]);
  assert.match(lockCheck({ ...args, ledger: other, assessed: assessFamily('psql', other) }).join('\n'), /MISSING .*no client on this image/, 'the client moved to another build');
  const skipped = ledgerOf([TABLE('PRODUCTION'), ...ALL_PASS.filter((line) => !line.startsWith('record (U-cert-mode-only)'))]);
  assert.match(lockCheck({ ...args, ledger: skipped, assessed: assessFamily('psql', skipped) }).join('\n'), /MISSING .*the leg PK1-p5-sslcertmode not run/, 'a leg that did not run');
  assert.match(lockCheck({ ...args, job: undefined }).join('\n'), /CI=true and no BRIDGED_DB_JOB/);
  assert.deepEqual(lockCheck({ ...args, job: undefined, ci: false }), [], 'off CI a harness with no job name is run by hand');
  assert.deepEqual(lockCheck({ ...args, job: undefined, rows: BRIDGED_DB_PROFILES }), [], 'and where the production table serves nothing the lock is vacuous');
});

test('the lines the legs print are read as records, UNMEASURED, STOP, the table the leg was handed, and a rig failure; nothing else is a leg', () => {
  assert.deepEqual(parseLine('record (PE1-4) psql, server method trust'), { kind: 'record', leg: 'PE1-4', text: 'psql, server method trust' });
  assert.deepEqual(parseLine('record (PK1-p0): positive control'), { kind: 'record', leg: 'PK1-p0', text: 'positive control' });
  assert.deepEqual(parseLine('UNMEASURED PE1 psql trust: no server'), { kind: 'unmeasured', leg: 'PE1 psql trust', text: 'no server' });
  assert.deepEqual(parseLine('STOP (PS1-1-go-sqlcmd): not a SQL login'), { kind: 'stop', leg: 'PS1-1-go-sqlcmd', text: 'not a SQL login' });
  assert.equal(parseLine('ok    (PQ2-a) the client reached the fake server')?.kind, undefined);
  assert.equal(parseLine('FAIL (r) rig')?.kind, 'rig');
  assert.deepEqual(parseLine('CANDIDATE sqlcmd odbc-sqlcmd 18.6.0001.1 "Linux" linux driver 18.6.1.1  (odbc-sqlcmd: /opt/mssql-tools18/bin/sqlcmd)'), { kind: 'table', mode: 'CANDIDATE', client: 'sqlcmd', vendor: 'odbc-sqlcmd', version: '18.6.0001.1', tag: 'Linux', platform: 'linux', driver: '18.6.1.1', name: 'odbc-sqlcmd' });
  assert.equal(judgeAll([], []).length, 0);
});

/* CI run 44561670901 (at 8ad910f1): the lines of a database-clients job with two Oracle builds and MariaDB's client, cut to what these tests read. */
const MYSQL_TABLE = (mode: string, vendor: string, version: string, tag: string, name: string): string => `${mode} mysql ${vendor} ${version} "${tag}" linux  (${name}: /usr/bin/${name})`;
const MYSQL_JOB = [
  MYSQL_TABLE('CANDIDATE', 'oracle', '8.4.13', 'for Linux on x86_64 (MySQL Community Server - GPL)', 'oracle'),
  MYSQL_TABLE('CANDIDATE', 'oracle', '8.4.13', '-0ubuntu0.26.04.2 for Linux on x86_64 ((Ubuntu))', 'oracle-distro'),
  MYSQL_TABLE('CANDIDATE', 'mariadb', '11.8.6', ', client 15.2 for debian-linux-gnu (x86_64) using  EditLine wrapper', 'mariadb'),
  'UNMEASURED PK1-m1-oracle-distro: this build cannot load authentication_kerberos_client',
  "record (PE1-6) mariadb on MySQL: under the profile (--plugin-dir=<the absent file>): the entry REFUSED (exit 1)",
  'STOP (PE1-6): mariadb on MySQL: the entry did not log in under the profile',
];

type Assessed = ReturnType<typeof assessFamily>;
const clientNamed = (assessed: Assessed, name: string): Assessed['clients'][number] => assessed.clients.filter((client: { name: string }) => client.name === name)[0];
const resultNamed = (assessed: Assessed, name: string, id: string): { id: string; status: string; why: string } => clientNamed(assessed, name).results.filter((result: { id: string }) => result.id === id)[0];

test('T83 (§S7.12): a pair the parent refused by a recorded STOP keeps record legs that assert nothing; a candidate that is not on that list still fails on a false assertion, and a served row is judged whatever the list says', () => {
  const assessed = assessFamily('mysql', ledgerOf(MYSQL_JOB));
  const mariadb = clientNamed(assessed, 'mariadb');
  assert.match(String(mariadb.recordOnly), /PE1-6/);
  assert.deepEqual([mariadb.failed.length, mariadb.blocking.length], [0, 0], 'a refused pair neither fails the job nor blocks a row');
  assert.equal(resultNamed(assessed, 'mariadb', 'PE1-6-mysql').status, 'FAIL', 'its legs are still judged and printed');
  const printed: string[] = [];
  report('mysql', { ...assessed, clients: [mariadb] }, [], (line: string) => printed.push(line));
  assert.match(printed.join('\n'), /RECORD ONLY mariadb: the legs below assert nothing/);
  assert.match(printed.join('\n'), /NOTE mariadb PE1-6-mysql \(the lead reads it against the recorded refusal\)/, 'what failed is still said');
  assert.deepEqual(RECORD_ONLY.map((pair: { vendor: string; platform: string }) => `${pair.vendor}/${pair.platform}`), ['mariadb/linux', 'go-sqlcmd/linux', 'go-sqlcmd/win32', 'oracle/win32']);
  const servedMariadb = assessFamily('mysql', ledgerOf(MYSQL_JOB.map((line) => (line.includes('(mariadb:') ? line.replace(/^CANDIDATE/, 'PRODUCTION') : line))));
  assert.equal(clientNamed(servedMariadb, 'mariadb').recordOnly, undefined, 'a served row is judged');
  assert.equal(servedMariadb.failed, true);
  const leaked = ALL_PASS.map((line) => (line.startsWith('record (U-enc-built): entry B') ? 'record (U-enc-built): entry B: IDENTITY OFFERED' : line));
  assert.equal(assess([TABLE('CANDIDATE'), ...leaked]).failed, true, 'psql is not on the list: a false assertion of its candidate fails the run (T57-T62 rest on this)');
});

test('T84: an UNMEASURED line that names one client is that client\'s: the distribution\'s build does not explain Oracle\'s own build', () => {
  const assessed = assessFamily('mysql', ledgerOf(MYSQL_JOB));
  const why = (name: string): string => resultNamed(assessed, name, 'PK1-m1-control').why;
  assert.match(String(why('oracle-distro')), /UNMEASURED PK1-m1-oracle-distro/);
  assert.doesNotMatch(String(why('oracle')), /oracle-distro/, 'Oracle\'s own build has no record of its own: not run, not the other build\'s reason');
  assert.match(resultNamed(assessFamily('psql', ledgerOf([TABLE('CANDIDATE'), 'UNMEASURED PE1 psql: no server'])), 'psql', 'PE1-1').why, /^UNMEASURED PE1 psql/, 'a group\'s line still explains the legs of the one client');
});

test('T85: PA1-i blocks every psql pair while its control is not shown (spec L10, the owner, 2026-11-24), and a job that read two psql builds passes neither on leg (u)\'s records, which name no build', () => {
  const withoutPa1i = ALL_PASS.filter((line) => !line.startsWith('record (PA1-i-version-choice)'));
  const candidate = assess([TABLE('CANDIDATE'), ...withoutPa1i]);
  assert.equal(statusOf(candidate, 'PA1-i-version-choice'), 'not shown');
  assert.match(candidate.clients[0].results.filter((result: { id: string }) => result.id === 'PA1-i-version-choice')[0].why, /spec L10/);
  assert.equal(candidate.clients[0].blocking.length, 1, 'it is the one blocking leg');
  assert.equal(assess([TABLE('PRODUCTION'), ...withoutPa1i]).failed, true, 'and a served psql pair fails on it');
  const launcher = 'CANDIDATE psql postgresql 17.12 "(Ubuntu 17.12-1.pgdg24.04+1)" linux  (psql-launcher: /usr/bin/psql)';
  const two = assess([TABLE('CANDIDATE'), launcher, ...ALL_PASS]);
  assert.equal(two.clients.length, 2);
  for (const client of two.clients) {
    assert.equal(client.results.filter((result: { id: string }) => result.id === 'one-build')[0].status, 'not shown', `${client.version}: its records are not tied to it`);
  }
  assert.equal(assess([TABLE('CANDIDATE'), ...ALL_PASS]).clients[0].results.some((result: { id: string }) => result.id === 'one-build'), false, 'one build in the job: its records are its own');
});

test('T86: a job name the list does not hold is MISSING for a family the production table serves on this system, and nothing for one it does not serve', () => {
  const assessed = assessFamily('sqlcmd', ledgerOf([]));
  const typo = lockCheck({ family: 'sqlcmd', platform: 'linux', job: 'bridged-ps1-linux-ubuntu-2204', ci: true, rows: BRIDGED_DB_PROFILES, assessed, ledger: [] });
  assert.match(typo.join('\n'), /MISSING sqlcmd odbc-sqlcmd[\s\S]*is not in the list of dbServedJobs\.cjs/);
  assert.equal(typo.length, 2, 'both served builds of the row');
  assert.deepEqual(lockCheck({ family: 'psql', platform: 'linux', job: 'database-clients-ubuntu-24.04', ci: true, rows: BRIDGED_DB_PROFILES, assessed: assessFamily('psql', ledgerOf([])), ledger: [] }), [], 'psql on Linux is not served: a job with no list is fine');
});

test('T87: PS1-4 of the ODBC client fails when the launch as built reached the server of the driver manager\'s data source file (a STOP), as PS1-3 does for go-sqlcmd\'s configuration file', () => {
  const name = 'odbc-sqlcmd';
  const lines = [
    `PRODUCTION sqlcmd odbc-sqlcmd 18.7.0001.1 "Linux" linux driver 18.7.1.1  (${name}: /opt/mssql-tools18/bin/sqlcmd)`,
    `record (PS1-4-control-${name}): positive control, -D with the DSN of the rig home's .odbc.ini: the client went to the file's server (1 connection(s) there)`,
    `record (PS1-4-${name}): the launch as built with .odbc.ini in the rig home: the file's server saw 0 connection(s); a SQL login`,
  ];
  const held = resultNamed(assessFamily('sqlcmd', ledgerOf(lines)), name, 'PS1-4');
  assert.equal(held.status, 'pass', 'no connection to the file\'s server: the leg holds');
  const stopped = resultNamed(assessFamily('sqlcmd', ledgerOf([...lines, `STOP (PS1-4-${name}): the driver manager's data source file was read although -S named the server`])), name, 'PS1-4');
  assert.equal(stopped.status, 'FAIL');
  assert.match(stopped.why, /^STOP \(PS1-4-odbc-sqlcmd\)/);
  const onlyStop = resultNamed(assessFamily('sqlcmd', ledgerOf([lines[0], lines[1], `STOP (PS1-4-${name}): the driver manager's data source file was read`])), name, 'PS1-4');
  assert.equal(onlyStop.status, 'FAIL', 'a leg that printed only its STOP fails; it is not "not run"');
});

test('T88 (DP21): the lock reads the driver of the ODBC client: the served version over another driver is MISSING; a job name with ${{ matrix.os }} names only the images of its own job\'s matrix', () => {
  const name = 'odbc-sqlcmd';
  const line = (driver: string): string => `PRODUCTION sqlcmd odbc-sqlcmd 18.7.0001.1 "Linux" linux driver ${driver}  (${name}: /opt/mssql-tools18/bin/sqlcmd)`;
  const otherDriver = ledgerOf([line('18.6.1.1')]);
  const args = { family: 'sqlcmd', platform: 'linux', job: 'bridged-ps1-linux-ubuntu-24.04', ci: true, rows: BRIDGED_DB_PROFILES, assessed: assessFamily('sqlcmd', otherDriver), ledger: otherDriver };
  assert.match(lockCheck(args).join('\n'), /MISSING sqlcmd odbc-sqlcmd 18\.7\.0001\.1 "Linux" on linux with the driver 18\.7\.1\.1: no client on this image was read by the real check/, 'the same client over another driver is not the served build');
  const servedDriver = ledgerOf([line('18.7.1.1')]);
  assert.doesNotMatch(lockCheck({ ...args, assessed: assessFamily('sqlcmd', servedDriver), ledger: servedDriver }).join('\n'), /no client on this image was read/, 'control: over the served driver the build is found (its legs are judged apart)');

  assert.equal(hasJobStep(WORKFLOW, 'bridged-ps1-linux-ubuntu-22.04', HARNESS_OF.sqlcmd), true);
  const without2204 = WORKFLOW.replace('os: [ubuntu-22.04, ubuntu-24.04, ubuntu-latest]', 'os: [ubuntu-24.04, ubuntu-latest]');
  assert.notEqual(without2204, WORKFLOW, 'the PS1 matrix line is where the test expects it');
  assert.equal(hasJobStep(without2204, 'bridged-ps1-linux-ubuntu-22.04', HARNESS_OF.sqlcmd), false, 'an image dropped from the matrix is no job');
  assert.match(lockProblems({ rows: BRIDGED_DB_PROFILES, jobs: SERVED_JOBS, workflow: without2204, legsOf }).join('\n'), /job bridged-ps1-linux-ubuntu-22\.04 is no step of the workflow/);
  assert.equal(hasJobStep(WORKFLOW, 'bridged-ps1-linux-windows-latest', HARNESS_OF.sqlcmd), false, 'an image of another job\'s matrix is no name of this one');
});

/* ---------------------------------------------------------------------------------------------------------------
 * The `container` platform (change 11.1, S3 part 2; consult ae318292): its own legs, its own harness, fail-closed
 * ------------------------------------------------------------------------------------------------------------- */

const CONTAINER_BUILD = { version: '18.7.0001.1', tag: 'Linux', driver: '18.7.1.1', record: 'run 1 at 0123abc' };
const SERVED_CONTAINER: readonly DbProfileRow[] = [{ client: 'sqlcmd', platform: 'container', served: true, clients: [{ vendor: 'odbc-sqlcmd', builds: [CONTAINER_BUILD] }] }];
const CONTAINER_ENTRY = { client: 'sqlcmd', platform: 'container', vendor: 'odbc-sqlcmd', version: '18.7.0001.1', tag: 'Linux', driver: '18.7.1.1' };
const CONTAINER_NAME = 'container-odbc-sqlcmd';

test('T89: the container row has legs of its own (the runner\'s identity unseen, the road\'s argv and env file), never the host\'s; a family with no container legs can never pass there', () => {
  const legs = legsOf('sqlcmd', 'odbc-sqlcmd', 'container');
  assert.deepEqual(legs, ['CI-0', 'CI-1', 'PS1-1', 'PE1-7', 'PS1-8', 'PS1-9-control', 'PS1-9', 'PS1-4-control', 'PS1-4', 'CI-argv', 'CI-envfile']);
  assert.notDeepEqual(legs, legsOf('sqlcmd', 'odbc-sqlcmd', 'linux'), 'not the Linux legs');
  assert.deepEqual(legsOf('sqlcmd', 'odbc-sqlcmd'), legsOf('sqlcmd', 'odbc-sqlcmd', 'linux'), 'a host platform keeps the legs it had');
  for (const [family, vendor] of [['psql', 'postgresql'], ['mysql', 'oracle'], ['sqlcmd', 'go-sqlcmd']]) {
    const [rule] = judgeAll(rulesFor(family, vendor, vendor, 'container'), []);
    assert.equal(rule.status, 'not shown', `${family} ${vendor} in a container is never shown`);
  }
});

test('T90 (DP21): a served container build must be listed with the container legs, by a job whose step runs the container harness; the host legs or the host sqlcmd harness are not enough', () => {
  const legs = legsOf('sqlcmd', 'odbc-sqlcmd', 'container');
  const listed = { ...CONTAINER_ENTRY, legs };
  const workflow = `${WORKFLOW}${STEP('db-container', CONTAINER_HARNESS)}`;
  const problems = (over: { jobs?: Record<string, unknown[]>; workflow?: string }): string[] =>
    lockProblems({ rows: SERVED_CONTAINER, jobs: over.jobs ?? { 'db-container': [listed] }, workflow: over.workflow ?? workflow, legsOf });
  assert.deepEqual(problems({}), [], 'control: all of it agrees');
  assert.match(problems({ jobs: { 'db-container': [{ ...listed, legs: legsOf('sqlcmd', 'odbc-sqlcmd', 'linux') }] } }).join('\n'), /the list lacks the leg CI-1/, 'the host legs');
  assert.match(problems({ workflow: `${WORKFLOW}${STEP('db-container', HARNESS_OF.sqlcmd)}` }).join('\n'), /runs scripts\/bridged-container-sqlcmd-itest\.cjs/, 'the host sqlcmd harness');
  assert.match(problems({ jobs: {} }).join('\n'), /stands in no job's list/, 'no job at all');
});

/** The lines of a container run whose legs all held, under `mode`. */
const containerLines = (mode: string, over: Record<string, string> = {}): string[] => [
  `${mode} sqlcmd odbc-sqlcmd 18.7.0001.1 "Linux" container driver 18.7.1.1  (${CONTAINER_NAME}: creds-db-sqlcmd:0123)`,
  ...Object.entries({
    'CI-0-control': 'positive control: a ticket', 'CI-1': 'ISOLATED: uid 65534', 'PS1-1': 'the launch as built', 'PE1-7': "logged in, auth_scheme SQL; a wrong password refused: the entry's user",
    'PS1-8': 'a SQL login for the name as written; no integrated attempt: user', 'PS1-9-control': 'without -x, by hand: SUBSTITUTED', 'PS1-9': 'as launched (-x): LITERAL',
    'PS1-4-control': 'positive control, -D', 'PS1-4': 'the launch as built', 'CI-argv': 'CLEAN: no argument', 'CI-envfile': 'REMOVED: while the tool ran', ...over,
  }).map(([leg, text]) => `record (${leg}-${CONTAINER_NAME}): ${text}`),
];

test('T91: the container ledger is judged by the container legs on the container platform: all held passes; a container that saw the runner FAILS; the lock of a job reads the container row, not process.platform', () => {
  const held = assessFamily('sqlcmd', ledgerOf(containerLines('PRODUCTION')));
  assert.equal(held.clients[0].platform, 'container');
  assert.deepEqual(held.clients[0].failed, [], 'every container leg passed');
  const seen = assessFamily('sqlcmd', ledgerOf([...containerLines('PRODUCTION', { 'CI-1': 'NOT ISOLATED: names ["GITHUB_TOKEN"]' }), `STOP (CI-1-${CONTAINER_NAME}): the query's container saw a name`]));
  assert.deepEqual(seen.clients[0].failed.map((one: { id: string }) => one.id), ['CI-1']);
  const lockOf = (platform: string, lines: string[]): string[] => {
    const ledger = ledgerOf(lines);
    return lockCheck({ family: 'sqlcmd', platform, job: 'db-container', ci: true, rows: SERVED_CONTAINER, jobs: { 'db-container': [{ ...CONTAINER_ENTRY, legs: legsOf('sqlcmd', 'odbc-sqlcmd', 'container') }] }, assessed: assessFamily('sqlcmd', ledger), ledger });
  };
  assert.deepEqual(lockOf('container', containerLines('PRODUCTION')), [], 'the container run satisfies the container lock');
  assert.match(lockOf('container', containerLines('PRODUCTION', { 'CI-envfile': 'NOT REMOVED' })).join('\n'), /MISSING .*the leg CI-envfile FAIL/, 'a leg that failed');
  assert.match(lockOf('container', containerLines('CANDIDATE')).join('\n'), /MISSING .*under the production table/, 'a candidate run is not the served build');
  assert.deepEqual(lockOf('linux', containerLines('PRODUCTION')), [], 'the Linux lock expects no container build');
});
