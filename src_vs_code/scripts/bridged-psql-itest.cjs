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
//   PD3  a fake server answers `SSLRequest` with `S`, completes TLS with a throwaway server certificate, REQUESTS a client certificate and records
//        whether one was offered; `psql` runs with `sslmode=require` under a rig home whose `.postgresql` holds a throwaway `postgresql.crt` and
//        `postgresql.key` (the marker: its subject is `CN=${PD3_MARKER_CN}`): once with no `PGSSLCERT` and `PGSSLKEY`, once with both at paths that do not exist.
//        Expected by the parent: the certificate is offered with no variable, and the variables close it. A marker offered WITH the variables too
//        stops the work and goes to the lead. Server and client certificates are made by `openssl` at run time, in the owned folder: nothing is committed.
//
// And leg (r) (§S6.14 Y6), the two cases as ASSERTIONS: the CONTROL (the first run of each: no variable) leaks the marker, and the PRODUCTION launch —
// the arguments of `buildDbQueryLaunch('postgres', …, { bridged: true, absentFile })` and the environment of `bridgedSshEnv`, under the same rig home —
// sends no password message that holds the marker (PD2) and offers no client certificate (PD3).
//
// `psql` is named by an absolute path (`BRIDGED_PSQL`, default `/usr/bin/psql`); the harness prints its `--version`. With `CI=true` a missing one
// FAILS; off CI it is a printed skip. POSIX only.
const fs = require('fs');
const path = require('path');
const net = require('node:net');
const tls = require('node:tls');
const { execFileSync } = require('node:child_process');
const harnessScope = require('./lib/harnessScope.cjs');
const { launch, endChild } = require('./itestSshd.cjs');
const { ownedDir } = require('./lib/leftovers.cjs');

const OUT = path.join(__dirname, '..', 'out');

const BOUND_MS = 20_000;
const PD2_PASSWORD_MARKER = 'pd2-marker-password';
const PD3_MARKER_CN = 'pd3-marker-client';
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
 *
 * With `tlsMaterial` (a throwaway `{ key, cert }`) an `SSLRequest` is answered `S` and the socket is handed to a TLS server that REQUESTS a client
 * certificate and accepts any (or none): `state.secured` counts the completed handshakes and `state.peer` holds what the client offered.
 */
function fakeServer(tlsMaterial) {
  const state = { startups: 0, refused: 0, password: undefined, sslRequests: 0, secured: 0, peer: undefined, tlsError: undefined };
  const tlsServer = tlsMaterial === undefined ? undefined : secureServer(tlsMaterial, state);
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
        phase = step(socket, phase, at, state, tlsServer);
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

/** What a client certificate says of itself: nothing offered is an empty object. */
const peerOf = (certificate) => ({ offered: Object.keys(certificate).length > 0, commonName: certificate.subject?.CN });

/** The TLS half of the fake server: a certificate is REQUESTED and none is verified, so what the client holds is only recorded. */
function secureServer(material, state) {
  const tlsServer = tls.createServer({ key: material.key, cert: material.cert, requestCert: true, rejectUnauthorized: false }, (secure) => {
    state.secured += 1;
    state.peer = { ...peerOf(secure.getPeerCertificate()), protocol: secure.getProtocol() };
    secure.on('error', () => undefined);
    secure.once('data', () => secure.end(FATAL));
  });
  tlsServer.on('tlsClientError', (error) => {
    state.tlsError = error.message;
  });
  return tlsServer;
}

/** One message of the client; the next phase. */
function step(socket, phase, incoming, state, tlsServer) {
  if (phase === 'password') {
    state.password = incoming.body.toString('utf8').replace(/\0$/, '');
    socket.end(FATAL);
    return 'done';
  }
  const code = incoming.body.length >= 4 ? incoming.body.readInt32BE(0) : 0;
  if (code === SSL_REQUEST && tlsServer !== undefined) {
    state.sslRequests += 1;
    socket.write('S');
    socket.removeAllListeners('data'); // the TLS server reads from here on
    tlsServer.emit('connection', socket);
    return 'upgraded';
  }
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
async function psqlRun(scope, exe, { env, prepare, tlsMaterial, build }) {
  const { server, state } = fakeServer(tlsMaterial);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  prepare(port);
  // The probe's own arguments and environment, or (`build`) the PRODUCTION launch's: its arguments, and its environment alone beside a connect timeout.
  const production = build === undefined ? undefined : build(port);
  const args = production?.args ?? ['-w', '-X', '-h', '127.0.0.1', '-p', String(port), '-U', 'pdprobe', '-d', 'pdprobe', '-c', 'select 1'];
  const given = production?.env ?? { PGSSLMODE: 'disable', PGGSSENCMODE: 'disable', ...env };
  // `detached`: a session of its own, so a psql that wants a password cannot reach the terminal this harness runs in.
  const client = launch(scope, exe, args, { env: { PGCONNECT_TIMEOUT: '10', ...given }, detached: true });
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
async function legPD2(scope, exe, dir, product) {
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
    if (!withVariable) {
      check('(r) PD2 control: with no PGPASSFILE the person\'s .pgpass is used and its marker is sent (this rig can make the bad thing happen)', sent === PD2_PASSWORD_MARKER, JSON.stringify({ sent, stderr: run.stderr }));
    }
    console.log(`record (PD2) psql, ${label}: exit ${run.code}; a password message ${sent === undefined ? 'was NOT sent' : 'was sent'}; the marker from .pgpass ${sent === PD2_PASSWORD_MARKER ? 'STANDS' : 'does not stand'} in it; psql said ${JSON.stringify(run.stderr)}`);
    if (withVariable && sent === PD2_PASSWORD_MARKER) {
      console.log('STOP (PD2): the marker was sent WITH PGPASSFILE set too — no remedy is built, and row 7 returns to the lead (parent §7, row PD2)');
    }
  }
  check('(PD2) the path given as PGPASSFILE does not exist', !fs.existsSync(absent), absent);
  await legR2(scope, exe, dir, home, product);
}

/** (r), PD2's case: the production launch, under the rig home whose `.pgpass` holds the marker for this host and port, sends no password message that holds it. */
async function legR2(scope, exe, dir, home, product) {
  const absentFile = product.materializedKeyPath(dir, 'no-client-file');
  const run = await psqlRun(scope, exe, {
    prepare: (port) => fs.writeFileSync(path.join(home, '.pgpass'), `127.0.0.1:${port}:*:pdprobe:${PD2_PASSWORD_MARKER}\n`, { mode: 0o600 }),
    build: (port) => productionLaunch(product, `postgresql://pdprobe@127.0.0.1:${port}/pdprobe`, home, absentFile),
  });
  reached('(r) PD2 production', run);
  const sent = run.state.password;
  console.log(`record (r) PD2 production: exit ${run.code}; a password message ${sent === undefined ? 'was NOT sent' : 'was sent'}; the marker ${sent === PD2_PASSWORD_MARKER ? 'STANDS' : 'does not stand'} in it`);
  check('(r) PD2 production: no password message holds the marker from the person\'s .pgpass', sent !== PD2_PASSWORD_MARKER, JSON.stringify({ sent, stderr: run.stderr }));
}

/** The arguments of the production launch of `psql` for `uri` and the environment a bridged client gets, under `home`. */
function productionLaunch(product, uri, home, absentFile) {
  const launchOf = product.buildDbQueryLaunch('postgres', uri, 'select 1', { bridged: true, absentFile });
  return { args: launchOf.args, env: product.bridgedSshEnv({ PATH: process.env.PATH, HOME: home }, 'linux', launchOf.env) };
}

/** A throwaway self-signed certificate and its key, made by `openssl` into `folder`: `{ key, cert }` as file names. */
function throwawayCertificate(folder, name, commonName) {
  const key = path.join(folder, `${name}.key`);
  const cert = path.join(folder, `${name}.crt`);
  // The PATH's openssl is the tool that makes the rig's own throwaway material.
  execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-days', '1', '-subj', `/CN=${commonName}`, '-keyout', key, '-out', cert], { stdio: 'pipe' }); // NOSONAR
  fs.chmodSync(key, 0o600);
  return { key, cert };
}

/** PD3: the person's client certificate, with no `PGSSLCERT` and `PGSSLKEY` and with both at paths that do not exist. */
async function legPD3(scope, exe, dir, product) {
  const home = path.join(dir, 'pd3 home');
  const material = path.join(dir, 'pd3 material');
  const absent = { cert: path.join(dir, 'pd3-client-cert-that-never-exists.crt'), key: path.join(dir, 'pd3-client-key-that-never-exists.key') };
  fs.mkdirSync(path.join(home, '.postgresql'), { recursive: true, mode: 0o700 });
  fs.mkdirSync(material, { recursive: true });
  const server = throwawayCertificate(material, 'server', 'localhost');
  const person = throwawayCertificate(material, 'person', PD3_MARKER_CN);
  fs.copyFileSync(person.cert, path.join(home, '.postgresql', 'postgresql.crt'));
  fs.copyFileSync(person.key, path.join(home, '.postgresql', 'postgresql.key'));
  fs.chmodSync(path.join(home, '.postgresql', 'postgresql.key'), 0o600);
  const tlsMaterial = { key: fs.readFileSync(server.key), cert: fs.readFileSync(server.cert) };
  for (const withVariables of [false, true]) {
    const label = withVariables ? 'with PGSSLCERT and PGSSLKEY at paths that do not exist' : 'with no PGSSLCERT and no PGSSLKEY';
    const run = await psqlRun(scope, exe, {
      env: { PATH: process.env.PATH, HOME: home, PGSSLMODE: 'require', ...(withVariables ? { PGSSLCERT: absent.cert, PGSSLKEY: absent.key } : {}) },
      prepare: () => undefined,
      tlsMaterial,
    });
    check(`(PD3) psql ${label}: the client reached the fake server, completed TLS and ended in time`, run.ended && run.state.secured >= 1, JSON.stringify({ ...run.state, ended: run.ended, code: run.code, stderr: run.stderr }));
    const peer = run.state.peer ?? { offered: false };
    if (!withVariables) {
      check('(r) PD3 control: with no PGSSLCERT and PGSSLKEY the person\'s client certificate is offered (this rig can make the bad thing happen)', peer.commonName === PD3_MARKER_CN, JSON.stringify(peer));
    }
    console.log(`record (PD3) psql, ${label}: exit ${run.code}; TLS ${run.state.secured >= 1 ? `completed (${peer.protocol})` : 'did NOT complete'}; a client certificate ${peer.offered ? 'was OFFERED' : 'was NOT offered'}; the marker (CN=${PD3_MARKER_CN}) ${peer.commonName === PD3_MARKER_CN ? 'STANDS' : 'does not stand'} in it (subject CN ${JSON.stringify(peer.commonName ?? null)}); psql said ${JSON.stringify(run.stderr)}`);
    if (withVariables && peer.commonName === PD3_MARKER_CN) {
      console.log('STOP (PD3): the marker was offered WITH PGSSLCERT and PGSSLKEY set too — no remedy is built, and row 9 returns to the lead (parent §7, row PD3)');
    }
  }
  check('(PD3) the paths given as PGSSLCERT and PGSSLKEY do not exist', !fs.existsSync(absent.cert) && !fs.existsSync(absent.key), JSON.stringify(absent));
  await legR3(scope, exe, dir, home, tlsMaterial, product);
}

/** (r), PD3's case: the production launch (`sslmode=require` in the stored URI), under the rig home with the marker certificate, offers no client certificate. */
async function legR3(scope, exe, dir, home, tlsMaterial, product) {
  const absentFile = product.materializedKeyPath(dir, 'no-client-file');
  const run = await psqlRun(scope, exe, {
    prepare: () => undefined,
    tlsMaterial,
    build: (port) => productionLaunch(product, `postgresql://pdprobe@127.0.0.1:${port}/pdprobe?sslmode=require`, home, absentFile),
  });
  check('(r) PD3 production: the client reached the fake server, completed TLS and ended in time', run.ended && run.state.secured >= 1, JSON.stringify({ ...run.state, ended: run.ended, code: run.code, stderr: run.stderr }));
  const peer = run.state.peer ?? { offered: false };
  console.log(`record (r) PD3 production: exit ${run.code}; a client certificate ${peer.offered ? 'was OFFERED' : 'was NOT offered'}; the marker ${peer.commonName === PD3_MARKER_CN ? 'STANDS' : 'does not stand'} in it`);
  check('(r) PD3 production: no client certificate is offered, the marker\'s included', !peer.offered && peer.commonName !== PD3_MARKER_CN, JSON.stringify(peer));
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
    const product = { ...require(path.join(OUT, 'dbCliLauncher.js')), ...require(path.join(OUT, 'bridgedSshEnv.js')), ...require(path.join(OUT, 'materializedKeys.js')) };
    await legPD2(scope, exe, dir, product);
    await legPD3(scope, exe, dir, product);
  }
  console.log(failures === 0 ? '\nall bridged psql checks passed' : `\n${failures} check(s) failed`);
  return failures === 0 ? 0 : 1;
}

harnessScope.run(main);
