// Integration test of the bridged `mysql` client (E1.6, parent §4.11, leg (m); mandatory):
//
//   npm run compile && node scripts/bridged-mysql-itest.cjs        (`npm run itest:bridged-mysql`)
//
// `buildDbQueryLaunch(..., { bridged: true })` puts `--no-defaults` FIRST on `mysql`, because Oracle's `load-data-local-dir` in an option file survives
// `--local-infile=0` (the launcher's own comment calls it a known gap). A flag that is IN the argv is not a measured protection, so this asks real
// clients: a fake server completes the handshake and answers the query with a `LOCAL INFILE` request for a marker file, and the harness reads what
// the client sends back.
//
//   control   with `--local-infile=1` (the rig can make a client send a file at all), and, for Oracle's client, an option file that sets
//             `load-data-local-dir` with `--local-infile=0` and NO `--no-defaults`: the marker's bytes arrive;
//   production  the arguments of `buildDbQueryLaunch('mysql', …, { bridged: true, absentFile })` and the environment of `bridgedSshEnv`, with the SAME option
//             file in the rig home: the server receives none of the bytes, on each client.
//
// PM1 (the E1.6 spec §S6.15 Z0; parent §7's probe table) is a RECORD leg on each client present: whether `--protocol=TCP` makes `-h localhost` reach the
// fake server on TCP (and whether it is reached without the flag), the user name of a login with no `-u`, and whether the authentication answer is empty with
// and without `MYSQL_PWD`. Its lines start `record (PM1-x)`. A line that starts `STOP (PM1-` says what the parent's row sends back to the lead: a client that rejects the
// flag, or still takes the socket with it (PM1-a), or an authentication answer that does not follow `MYSQL_PWD` (PM1-d). A client that reaches the fake by TCP WITHOUT the flag (PM1-b)
// is no STOP: where the runner has no socket file there is no socket for it to take, so the socket control is `not shown`, a record, and the flag stays.
//
// (t) (§S6.15 Z5) is the same on the builder's own launch: `buildDbQueryLaunch('mysql', <an entry whose host is localhost and whose password is stored>, …, { bridged: true, absentFile })`
// and `bridgedSshEnv` reach the fake on TCP and send the entry's user and a non-empty authentication answer; the control without `--protocol=TCP` does not reach it on Oracle's
// client (PM1 saw its `ERROR 2002`), and is recorded as `not shown` on MariaDB's, which reached the fake by TCP anyway on the runner. The harness checks the answer's length and
// does not recompute it from the password.
//
// Oracle's client and MariaDB's are each named by an absolute path (`BRIDGED_MYSQL_ORACLE`, default `/usr/bin/mysql`; `BRIDGED_MYSQL_MARIADB`, default
// `/usr/bin/mariadb`); the harness prints each `--version`. With `CI=true` a missing one FAILS; off CI it is a printed skip. The pass rule is the one
// above; how the fake server speaks the protocol is the harness's own business. POSIX only.
const fs = require('fs');
const path = require('path');
const net = require('node:net');
const os = require('node:os');
const { execFileSync, spawnSync } = require('node:child_process');
const harnessScope = require('./lib/harnessScope.cjs');
const { launch, endChild } = require('./itestSshd.cjs');
const { ownedDir } = require('./lib/leftovers.cjs');
const { fakeServer, within } = require('./lib/mysqlFake.cjs');
const candidates = require('./lib/dbCandidates.cjs');

const OUT = path.join(__dirname, '..', 'out');
const MARKER_TEXT = 'the-bytes-of-the-marker-file\n';

let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'ok   ' : 'FAIL '} ${name}`);
  if (!ok) {
    failures += 1;
    if (detail !== undefined) {
      console.log(`       ${String(detail).split('\n').join('\n       ')}`);
    }
  }
}

/**
 * A production leg that was not measured: `UNMEASURED` is no check, so the run never ends as a pass while one stands. On CI it FAILS (the candidate table names the runner's builds, so a client the
 * real check refuses there is a defect, as a missing client is); off CI it is a printed skip, and the last line says the run did not pass.
 */
let unmeasuredLegs = 0;
function unmeasuredLeg(text) {
  console.log(`UNMEASURED ${text}`);
  unmeasuredLegs += 1;
  if (process.env.CI === 'true') {
    check(`${text.split(':')[0]} was measured (UNMEASURED is not a pass)`, false, 'on CI the candidate table names this runner\'s builds: a refusal here is a defect of the rig or the table');
  } else {
    console.log(`skip  ${text.split(':')[0]}: off CI an unmeasured leg is a printed skip, never a pass`);
  }
}

const versionOf = (exe) => {
  try {
    return execFileSync(exe, ['--version'], { encoding: 'utf8' }).trim(); // NOSONAR: an absolute path chosen by the rig
  } catch {
    return undefined;
  }
};

/** One real client against one fake server: the bytes of the marker that the server received. */
async function received(scope, exe, build, markerPath) {
  const { server, state, drained } = fakeServer(markerPath);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { args, env } = build(server.address().port);
  const client = launch(scope, exe, args, { env });
  try {
    // A client that hangs after the LOCAL INFILE request must FAIL the leg, not pass it with empty bytes: the timeout is reported.
    // The result is read only after the client's pipes have CLOSED (`closed`, which follows `done` and the last chunk of its output) and the server
    // has read each of its connections to the end: no fixed delay stands in for either. A connection still open after its bound (`drained` false)
    // is reported as a timeout too, so no (m) check passes on bytes that may be partial.
    const ended = await within(client.closed.then(() => true), 20_000, false);
    const read = await drained(2000);
    return { bytes: Buffer.concat(state.received).toString('utf8'), requested: state.requested, timedOut: !ended || !read, stderr: client.stderr };
  } finally {
    await endChild(client);
    await new Promise((resolve) => server.close(resolve));
  }
}

async function legM(scope, dir, name, exe, product, verdict) {
  const marker = path.join(dir, 'marker.txt');
  const home = path.join(dir, `${name} home`);
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(marker, MARKER_TEXT);
  // `load-data-local-dir` is Oracle's alone: MariaDB's client stops on it as an unknown variable (CI, 2026-11-13), so its file has `[client]` only.
  const oracleOnly = name === 'oracle' ? `[mysql]\nload-data-local-dir=${dir}\n` : '';
  fs.writeFileSync(path.join(home, '.my.cnf'), `[client]\nlocal-infile=1\n${oracleOnly}`);
  const base = { PATH: process.env.PATH, HOME: home, MYSQL_PWD: 'pw' };
  const connect = (port) => ['-h', '127.0.0.1', '-P', String(port), '-u', 'u'];
  const manual = (flag) => (port) => ({ args: [...connect(port), flag, '-e', 'select 1'], env: base });
  const control = await received(scope, exe, manual('--local-infile=1'), marker);
  check(`(m) ${name} control: with --local-infile=1 the server receives the marker's bytes`, !control.timedOut && control.bytes === MARKER_TEXT, JSON.stringify(control));
  if (name === 'oracle') {
    const gap = await received(scope, exe, manual('--local-infile=0'), marker);
    check('(m) oracle control: an option file with load-data-local-dir and --local-infile=0 but no --no-defaults still sends the bytes', !gap.timedOut && gap.bytes === MARKER_TEXT, JSON.stringify(gap));
  }
  if (verdict === undefined) {
    unmeasuredLeg(`(m) ${name}: the real client check refused this client under the candidate table (the finding is printed above), so the builder launches nothing`);
    return;
  }
  const productionBuild = (port) => {
    const launchOf = product.buildDbQueryLaunch('mysql', `mysql://u:pw@127.0.0.1:${port}/db`, 'select 1', { bridged: true, absentFile: product.materializedKeyPath(dir, 'no-client-file'), verdict });
    return { args: launchOf.args, env: product.bridgedSshEnv({ PATH: process.env.PATH, HOME: home, MYSQL_HOME: dir }, 'linux', launchOf.env) };
  };
  const production = await received(scope, exe, productionBuild, marker);
  check(`(m) ${name}: with the bridged arguments, the same option file and the allow-list environment, the server receives none of the bytes`, !production.timedOut && production.bytes === '' && production.requested, JSON.stringify(production));
}

// PD1 (the E1.6 spec §S6.14 Y0; parent §7's probe table): does `--no-defaults` still let a client read the person's `.mylogin.cnf`, and does
// `MYSQL_TEST_LOGIN_FILE` at a path that does not exist close it? A RECORD leg: it asserts nothing about the build and prints, for each client and for
// each of the two environments, whether the marker host of the login file stands in the output of `--no-defaults --verbose --help`. Expected by the
// parent: Oracle's client reads the file and the variable closes it; MariaDB's client reads none. An answer against that goes to the lead.
const PD1_MARKER_HOST = 'pd1-marker-host.invalid';

/** The one child of this leg: bounded, never through a shell; the answer is what it printed. */
function pd1Run(program, args, env) {
  const answer = spawnSync(program, args, { env, encoding: 'utf8', timeout: 20_000 }); // NOSONAR: an absolute path chosen by the rig
  return { code: answer.error === undefined ? answer.status : `spawn error ${answer.error.code ?? answer.error.message}`, stdout: answer.stdout ?? '', stderr: answer.stderr ?? '' };
}

/** The line of `text` that holds the marker, trimmed and clipped, or `none`. */
const pd1Line = (text) => (text.split(/\r?\n/).find((line) => line.includes(PD1_MARKER_HOST)) ?? 'none').trim().slice(0, 120);

/** One client under the rig home, with the variable or without it: the record line. */
function pd1Record(name, exe, home, absent, withVariable) {
  const env = { PATH: process.env.PATH, HOME: home, ...(withVariable ? { MYSQL_TEST_LOGIN_FILE: absent } : {}) };
  const answer = pd1Run(exe, ['--no-defaults', '--verbose', '--help'], env);
  const inOutput = answer.stdout.includes(PD1_MARKER_HOST) || answer.stderr.includes(PD1_MARKER_HOST);
  console.log(`record (PD1) ${name}, ${withVariable ? 'with MYSQL_TEST_LOGIN_FILE at a path that does not exist' : 'with no MYSQL_TEST_LOGIN_FILE'}: exit ${answer.code}; the marker host ${inOutput ? 'STANDS' : 'does not stand'} in the output (stdout ${answer.stdout.length} bytes, stderr ${answer.stderr.length} bytes); the line: ${pd1Line(answer.stdout + '\n' + answer.stderr)}`);
}

/** PD1: `mysql_config_editor` writes a login file under a rig home, then every client present is asked what it reads. A missing editor FAILS on CI and names the package. */
function recordLoginFile(dir, clients, product, verdicts) {
  const [, oracle] = clients[0];
  const editor = process.env.BRIDGED_MYSQL_CONFIG_EDITOR ?? path.join(path.dirname(oracle), 'mysql_config_editor');
  const home = path.join(dir, 'pd1 home');
  const absent = path.join(dir, 'pd1-login-file-that-never-exists');
  fs.mkdirSync(home, { recursive: true });
  if (!fs.existsSync(editor)) {
    check('(PD1) mysql_config_editor is installed', process.env.CI !== 'true', `${editor} is missing: it is in the Oracle client's package (mysql-client-core-8.0 on Ubuntu, installed by mysql-client) — the probe cannot write a login file without it`);
    return;
  }
  const written = pd1Run(editor, ['set', '--login-path=client', `--host=${PD1_MARKER_HOST}`], { PATH: process.env.PATH, HOME: home });
  const loginFile = path.join(home, '.mylogin.cnf');
  const wrote = fs.existsSync(loginFile);
  console.log(`record (PD1) mysql_config_editor: exit ${written.code}; ${wrote ? 'wrote' : 'did NOT write'} the login file under the rig home (${wrote ? fs.statSync(loginFile).size : 0} bytes); stderr ${JSON.stringify(written.stderr.trim().slice(0, 200))}`);
  check('(PD1) mysql_config_editor wrote the login file under the rig home', wrote, JSON.stringify(written));
  check('(PD1) the path given as MYSQL_TEST_LOGIN_FILE does not exist', !fs.existsSync(absent), absent);
  for (const [name, exe] of clients) {
    for (const withVariable of [false, true]) {
      pd1Record(name, exe, home, absent, withVariable);
    }
  }
  if (wrote) {
    assertLoginFileClosed(dir, clients, home, product, verdicts);
  }
}

/**
 * (m), added (E1.6 §S6.14 Y6): PD1's case as an ASSERTION on the production launch. The environment is the one `buildDbQueryLaunch('mysql', …, { bridged:
 * true, absentFile })` and `bridgedSshEnv` hand a bridged client, with the rig home that holds the login file: the marker host stands in no output of
 * either client. The control, for Oracle's client (which reads the file, PD1), is the same run without `MYSQL_TEST_LOGIN_FILE`: the marker stands, so this
 * rig can make the bad thing happen. MariaDB's client reads no login file, so it has no control and its leg shows only that the launch does not change that.
 */
function assertLoginFileClosed(dir, clients, home, product, verdicts) {
  const absentFile = product.materializedKeyPath(dir, 'no-client-file');
  // The environment of the production launch is the same for both clients; it is built under the verdict of the first client whose check answered.
  const verdict = clients.map(([name]) => verdicts.get(name)).find((one) => one !== undefined);
  if (verdict === undefined) {
    unmeasuredLeg('(m) the login file: the real client check refused every client under the candidate table, so the builder launches nothing');
    return;
  }
  const launchOf = product.buildDbQueryLaunch('mysql', 'mysql://u:pw@127.0.0.1:1/db', 'select 1', { bridged: true, absentFile, verdict });
  const production = product.bridgedSshEnv({ PATH: process.env.PATH, HOME: home }, 'linux', launchOf.env);
  const stands = (answer) => answer.stdout.includes(PD1_MARKER_HOST) || answer.stderr.includes(PD1_MARKER_HOST);
  check('(m) the production launch names MYSQL_TEST_LOGIN_FILE at a path that does not exist', production.MYSQL_TEST_LOGIN_FILE === absentFile && !fs.existsSync(absentFile), JSON.stringify(production.MYSQL_TEST_LOGIN_FILE));
  for (const [name, exe] of clients) {
    if (name === 'oracle') {
      const control = pd1Run(exe, ['--no-defaults', '--verbose', '--help'], { PATH: process.env.PATH, HOME: home });
      check('(m) oracle control: with --no-defaults and no MYSQL_TEST_LOGIN_FILE the login file is still read (the marker host stands in the output)', control.code === 0 && stands(control), JSON.stringify({ code: control.code, stderr: control.stderr.slice(0, 200) }));
    }
    const closed = pd1Run(exe, ['--no-defaults', '--verbose', '--help'], production);
    check(`(m) ${name}: under the production environment the marker host stands in no output of the client (${name === 'oracle' ? 'control above' : 'no control: this client reads no login file'})`, closed.code === 0 && !stands(closed), JSON.stringify({ code: closed.code, stderr: closed.stderr.slice(0, 200) }));
  }
}

// PM1 (the E1.6 spec §S6.15 Z0; parent §7's probe table): does `--protocol=TCP` make each client use TCP for `-h localhost`, and what does a login with no `-u` or
// no `MYSQL_PWD` send? RECORD legs on both clients against the fake server on TCP (it answers any login and any query with an OK, and records the user name and
// the LENGTH of the authentication answer, never the answer): the lines start `record (PM1-x)`, a line that starts `STOP (PM1-` says what the parent's row sends back
// to the lead (a client that rejects the flag or still takes the socket with it; an answer that does not follow `MYSQL_PWD`), and a check fails only for the rig's own faults (a
// client that never ended). A client that reaches the fake by TCP without the flag is a record: the socket control is not shown. The arguments are written by hand, as PM1 ran
// them before the builder wrote them (the builder's own are (t), below); the environment is `bridgedSshEnv`'s, with `MYSQL_TEST_LOGIN_FILE` at the absent path, and `MYSQL_PWD`
// only where the leg says so.
const PM1_PINS = ['--skip-named-commands', '--delimiter=;', '--local-infile=0'];
const PM1_PASSWORD = 'pm1-rig-password';

/** One real client against one fake server on TCP, listening on 127.0.0.1 and, when the host has it, on ::1 at the same port (`localhost` may resolve to either). */
async function pm1Run(scope, exe, build) {
  const { server, state } = fakeServer(undefined);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const v6 = net.createServer();
  v6.on('connection', (socket) => server.emit('connection', socket));
  const onV6 = await new Promise((resolve) => {
    v6.once('error', () => resolve(false));
    v6.listen(port, '::1', () => resolve(true));
  });
  const { args, env } = build(port);
  const client = launch(scope, exe, args, { env });
  try {
    const ended = await within(client.closed.then(() => true), 20_000, false);
    await within(new Promise((resolve) => setTimeout(resolve, 300)), 1000, undefined); // a login the server read is in `state` by now: the client has ended
    return { state, ended, onV6, code: client.child.exitCode, said: (client.stderr + client.stdout).trim().replaceAll(/\s*\n\s*/g, ' | ').slice(0, 300) };
  } finally {
    await endChild(client);
    await new Promise((resolve) => server.close(resolve));
    if (onV6) {
      await new Promise((resolve) => v6.close(resolve));
    }
  }
}

/** The user name of a login, in words: what it was given as, the account's own name, or the value. */
function userWords(user, given) {
  if (user === undefined) {
    return 'none read';
  }
  if (given !== undefined && user === given) {
    return `"${given}" (as given)`;
  }
  if (user === os.userInfo().username) {
    return 'the OS account\'s own name';
  }
  return JSON.stringify(user);
}

/** What the first login of a run said, in words. */
function loginWords(run, given) {
  const login = run.state.logins[0];
  if (login === undefined) {
    return 'the fake server was NOT reached';
  }
  const answer = login.authLength === undefined ? 'unread' : login.authLength === 0 ? 'EMPTY' : `NOT empty (${login.authLength} bytes)`;
  return `the fake server was reached (${run.state.logins.length} login(s)); user name: ${userWords(login.user, given)}; the authentication answer: ${answer}`;
}

/** One client, the arguments of one PM1 leg: the record line, and the run. */
async function pm1Leg(scope, name, exe, home, absentFile, product, id, label, { protocol, user, password }) {
  const run = await pm1Run(scope, exe, (port) => ({
    args: ['--no-defaults', ...(protocol ? ['--protocol=TCP'] : []), '-h', 'localhost', '-P', String(port), ...(user === undefined ? [] : ['-u', user]), ...PM1_PINS, '-e', 'select 1'],
    env: product.bridgedSshEnv({ PATH: process.env.PATH, HOME: home }, 'linux', { MYSQL_TEST_LOGIN_FILE: absentFile, ...(password ? { MYSQL_PWD: PM1_PASSWORD } : {}) }),
  }));
  check(`(${id}) ${name}: the client ended in time`, run.ended, JSON.stringify({ code: run.code, said: run.said.slice(0, 200) }));
  console.log(`record (${id}) ${name}, ${label}: exit ${run.code}; ${loginWords(run, user)}; the client said ${JSON.stringify(run.said)}${run.onV6 ? '' : ' (the fake server could not listen on ::1)'}`);
  return run;
}

/** PM1 on one client. */
async function legPM1(scope, dir, name, exe, product) {
  const home = path.join(dir, `pm1 ${name} home`);
  fs.mkdirSync(home, { recursive: true });
  const absentFile = product.materializedKeyPath(dir, 'no-client-file');
  const leg = (...rest) => pm1Leg(scope, name, exe, home, absentFile, product, ...rest);
  const a = await leg('PM1-a', '--no-defaults --protocol=TCP -h localhost -P <port> -u u, the pins, -e', { protocol: true, user: 'u', password: false });
  if (a.state.logins.length === 0) {
    console.log(`STOP (PM1-a, ${name}): the fake server was not reached with --protocol=TCP and -h localhost: this client rejects the flag, or the rig could not be reached — that client's row stays refused and goes to the lead (parent §7, row PM1)`);
  }
  const b = await leg('PM1-b', 'the same without --protocol=TCP (control: -h localhost alone)', { protocol: false, user: 'u', password: false });
  if (b.state.logins.length > 0) {
    console.log(`record (PM1-b, ${name}): the fake server WAS reached without --protocol=TCP — the socket control is NOT SHOWN on this client and runner (no socket file here for it to take); a record, not a STOP: the flag stays`);
  }
  await leg('PM1-c', 'PM1-a without -u', { protocol: true, user: undefined, password: false });
  const withPassword = await leg('PM1-d', 'PM1-a with MYSQL_PWD set', { protocol: true, user: 'u', password: true });
  const without = await leg('PM1-d', 'PM1-a with MYSQL_PWD unset', { protocol: true, user: 'u', password: false });
  const answer = (run) => run.state.logins[0]?.authLength;
  if (a.state.logins.length > 0 && (answer(withPassword) === 0 || answer(without) !== 0)) {
    console.log(`STOP (PM1-d, ${name}): the authentication answer was not empty without MYSQL_PWD, or was empty with it (parent §7, row PM1)`);
  }
}

// (t) (the E1.6 spec §S6.15 Z5): the builder's own launch for an entry whose host is `localhost`. ASSERTIONS, on each client present.
const T_USER = 'ttuser';

/** (t) on one client: the arguments and the environment the builder and `bridgedSshEnv` give a bridged client, for an entry that stores a user and a password. */
async function legT(scope, dir, name, exe, product, verdict) {
  if (verdict === undefined) {
    unmeasuredLeg(`(t) ${name}: the real client check refused this client under the candidate table (the finding is printed above), so the builder launches nothing`);
    return;
  }
  const home = path.join(dir, `t ${name} home`);
  fs.mkdirSync(home, { recursive: true });
  const absentFile = product.materializedKeyPath(dir, 'no-client-file');
  const built = (withoutFlag) => (port) => {
    const launchOf = product.buildDbQueryLaunch('mysql', `mysql://${T_USER}:${PM1_PASSWORD}@localhost:${port}/db`, 'select 1', { bridged: true, absentFile, verdict });
    if (launchOf === undefined) {
      throw new Error('buildDbQueryLaunch refused the entry of (t): it stores a user and a password and its host is localhost');
    }
    const args = withoutFlag ? launchOf.args.filter((arg) => arg !== '--protocol=TCP') : launchOf.args;
    return { args, env: product.bridgedSshEnv({ PATH: process.env.PATH, HOME: home }, 'linux', launchOf.env) };
  };
  const run = await pm1Run(scope, exe, built(false));
  check(`(t) ${name}: the client ended in time`, run.ended, JSON.stringify({ code: run.code, said: run.said.slice(0, 200) }));
  const login = run.state.logins[0];
  console.log(`record (t) ${name}, the builder's arguments for host localhost: exit ${run.code}; ${loginWords(run, T_USER)}`);
  check(`(t) ${name}: the builder's arguments for an entry whose host is localhost reach the fake server on TCP`, login !== undefined, JSON.stringify({ code: run.code, said: run.said.slice(0, 200) }));
  check(`(t) ${name}: the login names the entry's user and its authentication answer is not empty`, login?.user === T_USER && login.authLength > 0, JSON.stringify({ user: login?.user, authLength: login?.authLength }));
  const control = await pm1Run(scope, exe, built(true));
  console.log(`record (t) ${name} control, the same without --protocol=TCP: exit ${control.code}; ${loginWords(control, T_USER)}; the client said ${JSON.stringify(control.said)}`);
  if (name === 'oracle') {
    check('(t) oracle control: without --protocol=TCP the client takes the socket and never reaches the fake server (PM1 saw ERROR 2002)', control.ended && control.state.logins.length === 0, JSON.stringify({ code: control.code, said: control.said.slice(0, 200) }));
  } else {
    console.log(`record (t) ${name} control: the socket control is NOT SHOWN on this client and runner (${control.state.logins.length > 0 ? 'it reached the fake server by TCP without the flag' : 'it did not reach the fake server'}); recorded, not asserted`);
  }
}

/** PM1 and (t) on every client present. */
async function recordProtocol(scope, dir, clients, product, verdicts) {
  for (const [name, exe] of clients) {
    console.log(`record (PM1) ${name} --version: ${versionOf(exe)}`);
    await legPM1(scope, dir, name, exe, product);
    await legT(scope, dir, name, exe, product, verdicts.get(name));
  }
}


async function main(scope) {
  if (process.platform === 'win32') {
    console.log('skip  the bridged mysql harness — Linux only');
    return 0;
  }
  const dir = ownedDir(scope, 'bridged-mysql');
  const product = {
    ...require(path.join(OUT, 'dbCliLauncher.js')),
    ...require(path.join(OUT, 'bridgedSshEnv.js')),
    ...require(path.join(OUT, 'materializedKeys.js')),
  };
  const clients = [['oracle', process.env.BRIDGED_MYSQL_ORACLE ?? '/usr/bin/mysql'], ['mariadb', process.env.BRIDGED_MYSQL_MARIADB ?? '/usr/bin/mariadb']];
  const present = [];
  const verdicts = new Map();
  for (const [name, exe] of clients) {
    const version = fs.existsSync(exe) ? versionOf(exe) : undefined;
    console.log(`${name}: ${exe}: ${version ?? 'not found'}`);
    if (version === undefined) {
      check(`the ${name} client is installed`, process.env.CI !== 'true', `${exe} is missing — a skipped leg on the runner proves nothing`);
      continue;
    }
    check(`${exe} is the ${name} client`, name === 'mariadb' ? /MariaDB/i.test(version) : !/MariaDB/i.test(version), version);
    // The production launch of every leg below is built under the verdict of the REAL client check, asked of this very client under the candidate table (§S7.7, §S7.12).
    const under = await candidates.verdictFor({ family: name, exe, name }, { dir, home: dir });
    if (under.ok) {
      candidates.say(`(m), (t) and PD1 on ${name}`, under);
      verdicts.set(name, under.verdict);
    }
    await legM(scope, dir, name, exe, product, verdicts.get(name));
    present.push([name, exe]);
  }
  if (present.length === clients.length) {
    recordLoginFile(dir, present, product, verdicts);
  } else {
    check('(PD1) both clients are present, so the record leg ran', process.env.CI !== 'true', 'a client is missing: PD1 asks each one');
  }
  await recordProtocol(scope, dir, present, product, verdicts);
  if (failures > 0) {
    console.log(`\n${failures} check(s) failed`);
  } else {
    console.log(unmeasuredLegs === 0 ? '\nall bridged mysql checks passed' : `\nno check failed, but ${unmeasuredLegs} production leg(s) were NOT measured (above): this run is no pass of (m) and (t)`);
  }
  return failures === 0 ? 0 : 1;
}

harnessScope.run(main);
