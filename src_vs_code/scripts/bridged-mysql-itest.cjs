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
// Oracle's client and MariaDB's are each named by an absolute path (`BRIDGED_MYSQL_ORACLE`, default `/usr/bin/mysql`; `BRIDGED_MYSQL_MARIADB`, default
// `/usr/bin/mariadb`); the harness prints each `--version`. With `CI=true` a missing one FAILS; off CI it is a printed skip. The pass rule is the one
// above; how the fake server speaks the protocol is the harness's own business. POSIX only.
const fs = require('fs');
const path = require('path');
const net = require('node:net');
const { execFileSync, spawnSync } = require('node:child_process');
const harnessScope = require('./lib/harnessScope.cjs');
const { launch, endChild } = require('./itestSshd.cjs');
const { ownedDir } = require('./lib/leftovers.cjs');

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

/** One MySQL packet: three bytes of length, the sequence number, the payload. */
const packet = (sequence, payload) => Buffer.concat([Buffer.from([payload.length & 0xff, (payload.length >> 8) & 0xff, (payload.length >> 16) & 0xff, sequence]), payload]);

const GREETING = Buffer.concat([
  Buffer.from([0x0a]), Buffer.from('8.0.99-fake\0'), Buffer.from([1, 0, 0, 0]), Buffer.from('abcdefgh'), Buffer.from([0]),
  Buffer.from([0x8d, 0xa2]), Buffer.from([0x21]), Buffer.from([0x02, 0x00]), Buffer.from([0x08, 0x00]), Buffer.from([21]), Buffer.alloc(10),
  Buffer.from('ijklmnopqrst\0'), Buffer.from('mysql_native_password\0'),
]);
const OK = Buffer.from([0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00]);

/**
 * A server that speaks just enough of the protocol: the greeting, an OK for any login, and for the first query a LOCAL INFILE request for
 * `markerPath`; it collects what the client sends back (the packets after the request, up to the empty one) in `received`.
 */
function fakeServer(markerPath) {
  const state = { received: [], requested: false };
  const open = new Set();
  const server = net.createServer((socket) => {
    open.add(socket);
    socket.once('close', () => open.delete(socket));
    let pending = Buffer.alloc(0);
    let phase = 'login';
    socket.on('error', () => undefined);
    socket.write(packet(0, GREETING));
    socket.on('data', (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      for (let at = parsePacket(pending); at !== undefined; at = parsePacket(pending)) {
        pending = pending.subarray(at.size);
        phase = step(socket, phase, at, markerPath, state);
      }
    });
  });
  /** Resolves when every connection of the client has been read to its end (or after `ms`): what the client sent is then all in `state`. */
  const drained = (ms) => {
    let timer;
    const bound = new Promise((resolve) => {
      timer = setTimeout(resolve, ms);
    });
    return Promise.race([Promise.all([...open].map((socket) => new Promise((resolve) => socket.once('close', resolve)))), bound]).finally(() => clearTimeout(timer));
  };
  return { server, state, drained };
}

function parsePacket(buffer) {
  if (buffer.length < 4) {
    return undefined;
  }
  const length = buffer[0] | (buffer[1] << 8) | (buffer[2] << 16);
  return buffer.length < 4 + length ? undefined : { sequence: buffer[3], payload: buffer.subarray(4, 4 + length), size: 4 + length };
}

/** One packet of the client; the next phase. */
function step(socket, phase, incoming, markerPath, state) {
  if (phase === 'login') {
    socket.write(packet(incoming.sequence + 1, OK));
    return 'command';
  }
  if (phase === 'command') {
    if (incoming.payload[0] !== 0x03) {
      return 'command';
    }
    if (state.requested) {
      // Only the FIRST query is answered with the request: Oracle's 8.4 client sends more than one COM_QUERY for `-e`, and a request on each
      // made the control receive the marker three times (CI, 2026-11-13). Every later query gets an OK.
      socket.write(packet(incoming.sequence + 1, OK));
      return 'command';
    }
    state.requested = true;
    socket.write(packet(incoming.sequence + 1, Buffer.concat([Buffer.from([0xfb]), Buffer.from(markerPath)])));
    return 'infile';
  }
  if (incoming.payload.length === 0) {
    socket.write(packet(incoming.sequence + 1, OK));
    return 'command';
  }
  state.received.push(incoming.payload);
  return 'infile';
}

const versionOf = (exe) => {
  try {
    return execFileSync(exe, ['--version'], { encoding: 'utf8' }).trim(); // NOSONAR: an absolute path chosen by the rig
  } catch {
    return undefined;
  }
};

/** Resolves with `promise`'s value, or with `value` after `ms`; the timer does not outlive the race. */
async function within(promise, ms, value) {
  let timer;
  const bound = new Promise((resolve) => {
    timer = setTimeout(resolve, ms, value);
  });
  try {
    return await Promise.race([promise, bound]);
  } finally {
    clearTimeout(timer);
  }
}

/** One real client against one fake server: the bytes of the marker that the server received. */
async function received(scope, exe, build, markerPath) {
  const { server, state, drained } = fakeServer(markerPath);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { args, env } = build(server.address().port);
  const client = launch(scope, exe, args, { env });
  try {
    // A client that hangs after the LOCAL INFILE request must FAIL the leg, not pass it with empty bytes: the timeout is reported.
    // The result is read only after the client's pipes have CLOSED (`closed`, which follows `done` and the last chunk of its output) and the server
    // has read each of its connections to the end: no fixed delay stands in for either.
    const ended = await within(client.closed.then(() => true), 20_000, false);
    await drained(2000);
    return { bytes: Buffer.concat(state.received).toString('utf8'), requested: state.requested, timedOut: !ended, stderr: client.stderr };
  } finally {
    await endChild(client);
    await new Promise((resolve) => server.close(resolve));
  }
}

async function legM(scope, dir, name, exe, product) {
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
  const productionBuild = (port) => {
    const launchOf = product.buildDbQueryLaunch('mysql', `mysql://u:pw@127.0.0.1:${port}/db`, 'select 1', { bridged: true, absentFile: product.materializedKeyPath(dir, 'no-client-file') });
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
function recordLoginFile(dir, clients, product) {
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
    assertLoginFileClosed(dir, clients, home, product);
  }
}

/**
 * (m), added (E1.6 §S6.14 Y6): PD1's case as an ASSERTION on the production launch. The environment is the one `buildDbQueryLaunch('mysql', …, { bridged:
 * true, absentFile })` and `bridgedSshEnv` hand a bridged client, with the rig home that holds the login file: the marker host stands in no output of
 * either client. The control, for Oracle's client (which reads the file, PD1), is the same run without `MYSQL_TEST_LOGIN_FILE`: the marker stands, so this
 * rig can make the bad thing happen. MariaDB's client reads no login file, so it has no control and its leg shows only that the launch does not change that.
 */
function assertLoginFileClosed(dir, clients, home, product) {
  const absentFile = product.materializedKeyPath(dir, 'no-client-file');
  const launchOf = product.buildDbQueryLaunch('mysql', 'mysql://u:pw@127.0.0.1:1/db', 'select 1', { bridged: true, absentFile });
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
  for (const [name, exe] of clients) {
    const version = fs.existsSync(exe) ? versionOf(exe) : undefined;
    console.log(`${name}: ${exe}: ${version ?? 'not found'}`);
    if (version === undefined) {
      check(`the ${name} client is installed`, process.env.CI !== 'true', `${exe} is missing — a skipped leg on the runner proves nothing`);
      continue;
    }
    check(`${exe} is the ${name} client`, name === 'mariadb' ? /MariaDB/i.test(version) : !/MariaDB/i.test(version), version);
    await legM(scope, dir, name, exe, product);
    present.push([name, exe]);
  }
  if (present.length === clients.length) {
    recordLoginFile(dir, present, product);
  } else {
    check('(PD1) both clients are present, so the record leg ran', process.env.CI !== 'true', 'a client is missing: PD1 asks each one');
  }
  console.log(failures === 0 ? '\nall bridged mysql checks passed' : `\n${failures} check(s) failed`);
  return failures === 0 ? 0 : 1;
}

harnessScope.run(main);
