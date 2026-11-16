// Record legs of the bridged `psql` client (E1.6, the spec §S6.14 Y0, probes PD2 and PD3; parent §4.11 rows 7 and 9):
//
//   npm run compile && node scripts/bridged-psql-itest.cjs        (`npm run itest:bridged-psql`)
//
// The bridged launcher gives `psql` `HOME`, so libpq may read the PERSON's own files under it: `.pgpass` for a password, `.postgresql/postgresql.crt`
// and `.key` for a client certificate. Whether it does, and whether a variable that names a path that never exists closes the file, are facts of the
// client, so this asks a real `psql` against a fake server (as `bridged-mysql-itest.cjs` does for `mysql`). These are RECORD legs: they assert nothing
// about the build and print what the client did, in a form that goes into the spec's As-built. The only failures are the rig's own: no `psql`, a fake
// server the client never reached (so an empty answer would prove nothing), a folder or file the rig could not make.
//
//   PD2  a fake server answers a start-up message with a request for a clear-text password, records the password message and closes; `psql -w` runs
//        under a rig home whose `.pgpass` holds a MARKER for that host and port, with no `PGPASSWORD`: once with no `PGPASSFILE`, once with it at a
//        path that does not exist. Expected by the parent: the file is used with no variable, and the variable closes it.
//
// `psql` is named by an absolute path (`BRIDGED_PSQL`, default `/usr/bin/psql`); the harness prints its `--version`. With `CI=true` a missing one
// FAILS; off CI it is a printed skip. POSIX only.
const fs = require('fs');
const path = require('path');
const net = require('node:net');
const { execFileSync } = require('node:child_process');
const harnessScope = require('./lib/harnessScope.cjs');
const { launch, endChild } = require('./itestSshd.cjs');
const { ownedDir } = require('./lib/leftovers.cjs');

const BOUND_MS = 20_000;
const PD2_PASSWORD_MARKER = 'pd2-marker-password';
const SSL_REQUEST = 80877103;
const GSSENC_REQUEST = 80877104;

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

/** One backend message: the type byte, the length (which counts itself), the body. */
function withLength(type, body) {
  const head = Buffer.alloc(5);
  head.write(type, 0, 'latin1');
  head.writeInt32BE(body.length + 4, 1);
  return Buffer.concat([head, body]);
}

/** `AuthenticationCleartextPassword`: type R, the code 3. */
const CLEAR_TEXT_REQUEST = withLength('R', Buffer.from([0, 0, 0, 3]));
/** A FATAL error that ends the attempt: severity, SQLSTATE and text, as libpq reads them. */
const FATAL = withLength('E', Buffer.from('SFATAL\0C28P01\0Mthe fake server records and refuses\0\0'));

/**
 * The fake server: a first message with no type byte (length, code). An `SSLRequest` and a `GSSENCRequest` are answered `N` (this server has
 * neither); any other is the start-up message, answered with the clear-text request; the next message is the password, `p`, length and a
 * NUL-ended text. `state` records what arrived: the start-ups, the requests refused, the password text.
 */
function fakeServer() {
  const state = { startups: 0, refused: 0, password: undefined };
  const server = net.createServer((socket) => {
    let pending = Buffer.alloc(0);
    let phase = 'first';
    socket.on('error', () => undefined);
    socket.on('data', (chunk) => {
      if (phase === 'done') {
        return; // the client's Terminate, after the refusal: nothing to read
      }
      pending = Buffer.concat([pending, chunk]);
      for (let at = nextMessage(pending, phase); at !== undefined; at = nextMessage(pending, phase)) {
        pending = pending.subarray(at.size);
        phase = step(socket, phase, at, state);
      }
    });
  });
  return { server, state };
}

/** The next whole message of `buffer`: `first` has no type byte, `password` has one. `undefined` when it has not all arrived. */
function nextMessage(buffer, phase) {
  const skip = phase === 'password' ? 1 : 0;
  if (buffer.length < skip + 4) {
    return undefined;
  }
  const length = Math.max(buffer.readInt32BE(skip), 4); // a length below its own four bytes is garbage: it is read as an empty body, never as no progress
  return buffer.length < skip + length ? undefined : { body: buffer.subarray(skip + 4, skip + length), size: skip + length };
}

/** One message of the client; the next phase. */
function step(socket, phase, incoming, state) {
  if (phase === 'password') {
    state.password = incoming.body.toString('utf8').replace(/\0$/, '');
    socket.end(FATAL);
    return 'done';
  }
  const code = incoming.body.length >= 4 ? incoming.body.readInt32BE(0) : 0;
  if (code === SSL_REQUEST || code === GSSENC_REQUEST) {
    state.refused += 1;
    socket.write('N');
    return 'first';
  }
  state.startups += 1;
  socket.write(CLEAR_TEXT_REQUEST);
  return 'password';
}

const versionOf = (exe) => {
  try {
    return execFileSync(exe, ['--version'], { encoding: 'utf8' }).trim(); // NOSONAR: an absolute path chosen by the rig
  } catch {
    return undefined;
  }
};

/** Resolves `true` when `promise` resolves first, `false` after `ms`; the timer does not outlive the race. */
async function endedWithin(promise, ms) {
  let timer;
  const bound = new Promise((resolve) => {
    timer = setTimeout(resolve, ms, false);
  });
  try {
    return await Promise.race([promise.then(() => true), bound]);
  } finally {
    clearTimeout(timer);
  }
}

/** One `psql` against one fake server; what the server saw and what the client said. `prepare(port)` writes the files the run needs. */
async function psqlRun(scope, exe, { env, prepare }) {
  const { server, state } = fakeServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  prepare(port);
  const args = ['-w', '-X', '-h', '127.0.0.1', '-p', String(port), '-U', 'pdprobe', '-d', 'pdprobe', '-c', 'select 1'];
  const client = launch(scope, exe, args, { env: { PGCONNECT_TIMEOUT: '10', PGSSLMODE: 'disable', PGGSSENCMODE: 'disable', ...env } });
  try {
    const ended = await endedWithin(client.done, BOUND_MS);
    await endedWithin(client.closed, 2000);
    return { state, port, ended, code: client.child.exitCode, stderr: client.stderr.trim().slice(0, 200) };
  } finally {
    await endChild(client);
    await new Promise((resolve) => server.close(resolve));
  }
}

/** The rig's own failure, if there is one: the client must have reached the fake server, or an empty answer proves nothing. */
const reached = (name, run) => check(`${name}: the client reached the fake server and ended in time`, run.ended && run.state.startups >= 1, JSON.stringify({ ...run.state, ended: run.ended, code: run.code, stderr: run.stderr }));

/** PD2: the person's `.pgpass`, with no `PGPASSFILE` and with one that names a path that does not exist. */
async function legPD2(scope, exe, dir) {
  const home = path.join(dir, 'pd2 home');
  const absent = path.join(dir, 'pd2-pgpass-that-never-exists');
  fs.mkdirSync(home, { recursive: true });
  for (const withVariable of [false, true]) {
    const label = withVariable ? 'with PGPASSFILE at a path that does not exist' : 'with no PGPASSFILE';
    const run = await psqlRun(scope, exe, {
      env: { PATH: process.env.PATH, HOME: home, ...(withVariable ? { PGPASSFILE: absent } : {}) },
      prepare: (port) => fs.writeFileSync(path.join(home, '.pgpass'), `127.0.0.1:${port}:*:pdprobe:${PD2_PASSWORD_MARKER}\n`, { mode: 0o600 }),
    });
    reached(`(PD2) psql ${label}`, run);
    const sent = run.state.password;
    console.log(`record (PD2) psql, ${label}: exit ${run.code}; a password message ${sent === undefined ? 'was NOT sent' : 'was sent'}; the marker from .pgpass ${sent === PD2_PASSWORD_MARKER ? 'STANDS' : 'does not stand'} in it; psql said ${JSON.stringify(run.stderr)}`);
  }
  check('(PD2) the path given as PGPASSFILE does not exist', !fs.existsSync(absent), absent);
}

async function main(scope) {
  if (process.platform === 'win32') {
    console.log('skip  the bridged psql harness — Linux only');
    return 0;
  }
  const exe = process.env.BRIDGED_PSQL ?? '/usr/bin/psql';
  const version = fs.existsSync(exe) ? versionOf(exe) : undefined;
  console.log(`psql: ${exe}: ${version ?? 'not found'}`);
  if (version === undefined) {
    check('the psql client is installed', process.env.CI !== 'true', `${exe} is missing (the postgresql-client package) — a skipped leg on the runner proves nothing`);
  } else {
    const dir = ownedDir(scope, 'bridged-psql');
    await legPD2(scope, exe, dir);
  }
  console.log(failures === 0 ? '\nall bridged psql checks passed' : `\n${failures} check(s) failed`);
  return failures === 0 ? 0 : 1;
}

harnessScope.run(main);
