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
// PQ2 (the E1.6 spec §S6.15 Z0; parent §7's probe table) completes PQ1 on this client, through the REAL launch builder as it stands: legs a, b, c and e
// hand a stored URI whole (`buildDbQueryLaunch('postgres', <the URI>, …, { bridged: true, absentFile })` and `bridgedSshEnv`); legs d1-d4, g and h write the
// keyword string of the shape the spec's Z2 will write, by hand, since no builder writes it yet; leg f reads the CA files. Record legs: every
// line starts `record (PQ2-x)` and says what the client did; a line that starts `STOP (PQ2-` says an answer went against the parent's row.
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
/** Whether a password message held the marker. Read through a function: the state is filled by a socket callback, after the run. */
const holdsMarker = (sent) => typeof sent === 'string' && sent === PD2_PASSWORD_MARKER;
/** What a password message was, for the log: never its text (it is the marker, but a log line is not the place for a password). */
const described = (sent) => {
  if (sent === undefined) {
    return 'none';
  }
  return holdsMarker(sent) ? 'the marker' : 'another value';
};
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
  // `params` is the user and database of the last start-up message; `kinds` is what arrived, in order ('startup', then the type letter of each later message).
  const state = { startups: 0, refused: 0, password: undefined, sslRequests: 0, secured: 0, peer: undefined, tlsError: undefined, params: undefined, kinds: [] };
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
  return buffer.length < skip + length ? undefined : { body: buffer.subarray(skip + 4, skip + length), size: skip + length, type: skip === 1 ? buffer[0] : undefined };
}

/** The user and database a start-up message names (its body: a four-byte protocol code, then NUL-ended names and values). */
function startupParams(body) {
  const fields = body.subarray(4).toString('utf8').split('\0');
  const named = {};
  for (let at = 0; at + 1 < fields.length && fields[at] !== ''; at += 2) {
    if (fields[at] === 'user' || fields[at] === 'database') {
      named[fields[at]] = fields[at + 1];
    }
  }
  return named;
}

/** What a client certificate says of itself: nothing offered is an empty object. */
const peerOf = (certificate) => ({ offered: Object.keys(certificate).length > 0, commonName: certificate.subject?.CN });

/** The TLS half of the fake server: a certificate is REQUESTED and none is verified, so what the client holds is only recorded. */
function secureServer(material, state) {
  const tlsServer = tls.createServer({ key: material.key, cert: material.cert, requestCert: true, rejectUnauthorized: false }, (secure) => {
    state.secured += 1;
    state.peer = { ...peerOf(secure.getPeerCertificate()), protocol: secure.getProtocol() };
    secure.on('error', () => undefined);
    if (material.conversation === true) {
      secureConversation(secure, state);
    } else {
      secure.once('data', () => secure.end(FATAL));
    }
  });
  tlsServer.on('tlsClientError', (error) => {
    state.tlsError = error.message;
  });
  return tlsServer;
}

/** The conversation of `fakeServer` over an established TLS socket (PQ2): the start-up message, the clear-text request, the password message. */
function secureConversation(secure, state) {
  let pending = Buffer.alloc(0);
  let phase = 'first';
  secure.on('data', (chunk) => {
    if (phase === 'done') {
      return;
    }
    pending = Buffer.concat([pending, chunk]);
    for (let at = nextMessage(pending, phase); at !== undefined && phase !== 'done'; at = nextMessage(pending, phase)) {
      pending = pending.subarray(at.size);
      phase = step(secure, phase, at, state, undefined);
    }
  });
}

/** One message of the client; the next phase. */
function step(socket, phase, incoming, state, tlsServer) {
  if (phase === 'password') {
    // Only a password message ('p') is a password: a Terminate ('X') after a refused request is not.
    state.kinds.push(String.fromCharCode(incoming.type ?? 0));
    if (incoming.type === 0x70) {
      state.password = incoming.body.toString('utf8').replace(/\0$/, '');
    }
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
  state.kinds.push('startup');
  state.params = startupParams(incoming.body);
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
async function psqlRun(scope, exe, { env, prepare, tlsMaterial, build, second }) {
  const { server, state } = fakeServer(tlsMaterial);
  // `second` (PQ2-h): another plain fake server, so a client that is sent to a host the first run did not name shows itself.
  const other = second === true ? fakeServer(undefined) : undefined;
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  if (other !== undefined) {
    await new Promise((resolve) => other.server.listen(0, '127.0.0.1', resolve));
  }
  try {
    const port = server.address().port;
    const otherPort = other?.server.address().port;
    prepare(port, otherPort);
    // The probe's own arguments and environment, or (`build`) the PRODUCTION launch's: its arguments, and its environment alone beside a connect timeout.
    const production = build === undefined ? undefined : build(port, otherPort);
    const args = production?.args ?? ['-w', '-X', '-h', '127.0.0.1', '-p', String(port), '-U', 'pdprobe', '-d', 'pdprobe', '-c', 'select 1'];
    const given = production?.env ?? { PGSSLMODE: 'disable', PGGSSENCMODE: 'disable', ...env };
    // `detached`: a session of its own, so a psql that wants a password cannot reach the terminal this harness runs in.
    const client = launch(scope, exe, args, { env: { PGCONNECT_TIMEOUT: '10', ...given }, detached: true });
    try {
      const ended = await endedWithin(client.done, BOUND_MS);
      await endedWithin(client.closed, 2000);
      const said = client.stderr.trim();
      return { state, port, other: other?.state, otherPort, ended, code: client.child.exitCode, stderr: said.slice(0, 200), said };
    } finally {
      await endChild(client);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (other !== undefined) {
      await new Promise((resolve) => other.server.close(resolve));
    }
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
      check('(r) PD2 control: with no PGPASSFILE the person\'s .pgpass is used and its marker is sent (this rig can make the bad thing happen)', holdsMarker(sent), JSON.stringify({ sent: described(sent), stderr: run.stderr }));
    }
    console.log(`record (PD2) psql, ${label}: exit ${run.code}; a password message ${sent === undefined ? 'was NOT sent' : 'was sent'}; the marker from .pgpass ${holdsMarker(sent) ? 'STANDS' : 'does not stand'} in it; psql said ${JSON.stringify(run.stderr)}`);
    if (withVariable && holdsMarker(sent)) {
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
  console.log(`record (r) PD2 production: exit ${run.code}; a password message ${sent === undefined ? 'was NOT sent' : 'was sent'}; the marker ${holdsMarker(sent) ? 'STANDS' : 'does not stand'} in it`);
  check('(r) PD2 production: no password message holds the marker from the person\'s .pgpass', !holdsMarker(sent), JSON.stringify({ sent: described(sent), stderr: run.stderr }));
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

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// PQ2 (the E1.6 spec §S6.15 Z0; parent §7's probe table): PQ1 completed, through the REAL launch builder as it stands. RECORD legs: they assert nothing
// about the build, print what the client did, and fail only for the rig's own faults (no `psql`, `openssl` or builder answer, a client that never
// ended, a client that never reached a fake server where the leg cannot say anything without reaching it). A line that starts `STOP (PQ2-` says an
// answer went against what the parent expects of that leg: the work stops there and the line goes to the lead, with no code.

const PQ2_SERVICE_PASSWORD_MARKER = 'pq2-marker-service-password';
const PQ2_SERVICE_PASSFILE_MARKER = 'pq2-marker-service-passfile';
const PQ2_STORED_PASSWORD = 'pq2-stored-password';
const PQ2_SECOND_CN = 'pq2-second-client';
/** The values a password message may hold in these legs, with the words that name them: a log line names a value and never writes it. */
const PQ2_VALUES = [
  ['the .pgpass marker', PD2_PASSWORD_MARKER],
  ['the service-file password marker', PQ2_SERVICE_PASSWORD_MARKER],
  ['the service-file passfile marker', PQ2_SERVICE_PASSFILE_MARKER],
  ['the stored password', PQ2_STORED_PASSWORD],
];
/** What a password message was, in words: no message, a value of the table above, or another value. Never the text. */
function labelled(sent) {
  if (sent === undefined) {
    return 'no password message';
  }
  if (sent === '') {
    return 'an empty password';
  }
  for (const [label, value] of PQ2_VALUES) {
    if (sent === value) {
      return label;
    }
  }
  return 'another value';
}
const isMarker = (sent) => sent !== undefined && PQ2_VALUES.some(([label, value]) => label !== 'the stored password' && sent === value);

/** The client's message, on one line and clipped. */
const said = (run) => JSON.stringify(run.said.replaceAll(/\s*\n\s*/g, ' | ').slice(0, 400));
/** The numbers of a run, without any password. */
const shape = (run) => JSON.stringify({ startups: run.state.startups, sslRequests: run.state.sslRequests, secured: run.state.secured, tlsError: run.state.tlsError, kinds: run.state.kinds, ended: run.ended, code: run.code, said: run.said.slice(0, 200) });
const quote = (value) => `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
/** A libpq keyword string: `key='value'` for each pair, in order. */
const keywordString = (pairs) => pairs.map(([key, value]) => `${key}=${quote(value)}`).join(' ');

/** A CA made by `openssl` into `folder` (a path with no space): the key, the certificate and a config that `openssl ca` signs, revokes and lists with. */
function throwawayCa(folder) {
  fs.mkdirSync(path.join(folder, 'newcerts'), { recursive: true });
  fs.writeFileSync(path.join(folder, 'index.txt'), '');
  fs.writeFileSync(path.join(folder, 'serial'), '1000\n');
  fs.writeFileSync(path.join(folder, 'crlnumber'), '1000\n');
  const conf = path.join(folder, 'ca.cnf');
  fs.writeFileSync(conf, [
    '[req]', 'distinguished_name = dn', 'prompt = no', '[dn]', 'CN = pq2-marker-ca',
    '[ca]', 'default_ca = ca_default',
    '[ca_default]', `dir = ${folder}`, 'database = $dir/index.txt', 'new_certs_dir = $dir/newcerts', 'serial = $dir/serial', 'crlnumber = $dir/crlnumber',
    'certificate = $dir/ca.crt', 'private_key = $dir/ca.key', 'default_md = sha256', 'default_days = 2', 'default_crl_days = 2', 'policy = any', 'unique_subject = no',
    '[any]', 'commonName = supplied',
    '[ca_ext]', 'basicConstraints = critical,CA:TRUE', 'keyUsage = critical,keyCertSign,cRLSign', 'subjectKeyIdentifier = hash',
    '[server_ext]', 'basicConstraints = CA:FALSE', 'subjectAltName = IP:127.0.0.1,DNS:localhost', 'keyUsage = digitalSignature,keyEncipherment',
  ].join('\n') + '\n');
  const ca = { conf, key: path.join(folder, 'ca.key'), cert: path.join(folder, 'ca.crt'), crl: path.join(folder, 'root.crl') };
  const run = (...args) => execFileSync('openssl', args, { stdio: 'pipe' }); // NOSONAR: the PATH's openssl makes the rig's own throwaway material
  run('req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-days', '2', '-config', conf, '-extensions', 'ca_ext', '-keyout', ca.key, '-out', ca.cert);
  const server = { key: path.join(folder, 'server.key'), cert: path.join(folder, 'server.crt'), request: path.join(folder, 'server.csr') };
  run('req', '-new', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-subj', '/CN=localhost', '-keyout', server.key, '-out', server.request);
  run('ca', '-config', conf, '-batch', '-notext', '-in', server.request, '-out', server.cert, '-extensions', 'server_ext');
  return {
    ...ca,
    server,
    /** Revokes the server certificate and writes the list that says so, to `ca.crl`. */
    revoke: () => {
      run('ca', '-config', conf, '-revoke', server.cert);
      run('ca', '-config', conf, '-gencrl', '-out', ca.crl);
    },
  };
}

/**
 * The rig of PQ2: a home that holds every file the person's libpq could read (a `.pgpass`, a `.pg_service.conf` with three sections, the
 * marker client certificate of PD3 under `.postgresql`), a second throwaway client certificate that a URI or a service file can name, a TLS
 * server certificate signed by a CA, and the absent file of the production launch. `write(port)` writes what depends on the fake server's port.
 */
function pq2Rig(scope, dir, product) {
  const home = path.join(dir, 'pq2 home');
  const material = path.join(dir, 'pq2-material');
  fs.mkdirSync(path.join(home, '.postgresql'), { recursive: true, mode: 0o700 });
  fs.mkdirSync(material, { recursive: true });
  const person = throwawayCertificate(material, 'person', PD3_MARKER_CN);
  const second = throwawayCertificate(material, 'second', PQ2_SECOND_CN);
  const selfSigned = throwawayCertificate(material, 'self-signed-server', 'localhost');
  const ca = throwawayCa(path.join(dir, 'pq2-ca'));
  const marker = { cert: path.join(home, '.postgresql', 'postgresql.crt'), key: path.join(home, '.postgresql', 'postgresql.key') };
  fs.copyFileSync(person.cert, marker.cert);
  fs.copyFileSync(person.key, marker.key);
  fs.chmodSync(marker.key, 0o600);
  const tlsOf = (files) => ({ key: fs.readFileSync(files.key), cert: fs.readFileSync(files.cert) });
  const rig = {
    scope, dir, product, home, second, marker,
    pgpass: path.join(home, '.pgpass'),
    serviceFile: path.join(home, '.pg_service.conf'),
    servicePassfile: path.join(material, 'service.pgpass'),
    absentFile: product.materializedKeyPath(dir, 'no-client-file'),
    selfSignedTls: tlsOf(selfSigned),
    caTls: { ...tlsOf(ca.server), conversation: true },
    ca,
    exe: undefined,
    write(port) {
      fs.writeFileSync(rig.pgpass, `127.0.0.1:${port}:*:pdprobe:${PD2_PASSWORD_MARKER}\n`, { mode: 0o600 });
      fs.writeFileSync(rig.servicePassfile, `127.0.0.1:${port}:*:pdprobe:${PQ2_SERVICE_PASSFILE_MARKER}\n`, { mode: 0o600 });
      const section = (name, lines) => `[${name}]\n${lines.join('\n')}\n`;
      const target = ['host=127.0.0.1', `port=${port}`, 'user=pdprobe', 'dbname=pdprobe'];
      fs.writeFileSync(rig.serviceFile, [
        section('s1', [...target, `password=${PQ2_SERVICE_PASSWORD_MARKER}`]),
        section('s2', [...target, `passfile=${rig.servicePassfile}`]),
        section('s3', ['sslmode=require', `sslcert=${second.cert}`, `sslkey=${second.key}`]),
      ].join('\n'));
    },
  };
  return rig;
}

/** One `psql` of PQ2 against one fake server (`options`: `build(port, otherPort)`, `tlsMaterial`, `second`); the rig's files are written for its port first. */
function pq2Run(rig, options) {
  return psqlRun(rig.scope, rig.exe, { prepare: (port) => rig.write(port), ...options });
}

/** A production launch of the stored URI `uriOf(port)`: the builder's arguments, and its environment through `bridgedSshEnv`. A refusal is the rig's fault, named. */
function viaBuilder(rig, uriOf) {
  return (port) => {
    const uri = uriOf(port);
    const launchOf = rig.product.buildDbQueryLaunch('postgres', uri, 'select 1', { bridged: true, absentFile: rig.absentFile });
    if (launchOf === undefined) {
      throw new Error('buildDbQueryLaunch refused the URI of a leg that must hand it over whole (the spec says the builder does, before Z2)');
    }
    return { args: launchOf.args, env: rig.product.bridgedSshEnv({ PATH: process.env.PATH, HOME: rig.home }, 'linux', launchOf.env) };
  };
}

/** A hand-written launch: `-X`, `-c`, the query with its one leading space, `--`, `string`. The environment is the builder's (the entry's password in `PGPASSWORD` when given, and Y6's three paths) through `bridgedSshEnv`, then `over`. */
function byHand(rig, string, { password, over } = {}) {
  const stored = password === undefined ? 'postgresql://pdprobe@127.0.0.1:1/pdprobe' : `postgresql://pdprobe:${encodeURIComponent(password)}@127.0.0.1:1/pdprobe`;
  const closing = rig.product.buildDbQueryLaunch('postgres', stored, 'select 1', { bridged: true, absentFile: rig.absentFile }).env;
  return { args: ['-X', '-c', ' select 1', '--', string], env: { ...rig.product.bridgedSshEnv({ PATH: process.env.PATH, HOME: rig.home }, 'linux', closing), ...over } };
}

/** The rig's own faults: the client must have ended; and, where the leg says so, it must have reached the fake server (a TLS leg: completed the handshake). */
function pq2Check(id, run, reach) {
  check(`(${id}) the client ended in time`, run.ended, shape(run));
  if (reach === 'plain') {
    check(`(${id}) the client reached the fake server`, run.state.startups >= 1, shape(run));
  } else if (reach === 'tls') {
    check(`(${id}) the client reached the fake server and completed TLS`, run.state.secured >= 1, shape(run));
  }
}

/** The record of a password leg. */
function recordPassword(id, label, run) {
  const reached = run.state.startups >= 1;
  console.log(`record (${id}) ${label}: exit ${run.code}; the fake server ${reached ? 'was reached' : 'was NOT reached'}; the password message: ${labelled(run.state.password)}; psql said ${said(run)}`);
}

/** What a client certificate was, in words. */
function certificateWords(peer) {
  if (peer === undefined || !peer.offered) {
    return 'NOT offered';
  }
  const names = { [PD3_MARKER_CN]: 'the person\'s marker certificate', [PQ2_SECOND_CN]: 'the second certificate' };
  return `OFFERED (${names[peer.commonName] ?? 'another certificate'}, subject CN ${JSON.stringify(peer.commonName ?? null)})`;
}

/** The record of a certificate leg; `extra` is a clause that goes after the TLS words. */
function recordCertificate(id, label, run, extra = '') {
  const tlsWords = run.state.secured >= 1 ? `TLS completed (${run.state.peer?.protocol})` : `TLS NOT completed${run.state.tlsError === undefined ? '' : ` (server side: ${JSON.stringify(run.state.tlsError)})`}`;
  console.log(`record (${id}) ${label}: exit ${run.code}; ${tlsWords}; a client certificate: ${certificateWords(run.state.peer)};${extra} psql said ${said(run)}`);
}

const stop = (id, text) => console.log(`STOP (${id}): ${text} — the work stops here and the line goes to the lead (parent §7, rows PQ2)`);

/** PQ2-a, -b: a stored URI handed whole offers the certificate it names, or the one a service file names (TLS leg, `sslmode=require`). */
async function legPQ2ab(rig) {
  const named = (name) => encodeURIComponent(name);
  const cases = [
    ['PQ2-a', 'the URI names sslcert and sslkey (a second certificate), sslmode=require', (port) => `postgresql://pdprobe@127.0.0.1:${port}/pdprobe?sslmode=require&sslcert=${named(rig.second.cert)}&sslkey=${named(rig.second.key)}`],
    ['PQ2-b', 'the URI names service=s3 (the service file holds sslcert, sslkey and sslmode=require)', (port) => `postgresql://pdprobe@127.0.0.1:${port}/pdprobe?service=s3`],
  ];
  for (const [id, label, uriOf] of cases) {
    const run = await pq2Run(rig, { build: viaBuilder(rig, uriOf), tlsMaterial: rig.selfSignedTls });
    pq2Check(id, run, 'tls');
    recordCertificate(id, `the stored URI whole through buildDbQueryLaunch, ${label}`, run);
    if (run.state.peer?.commonName !== PQ2_SECOND_CN) {
      stop(id, 'the second certificate was NOT offered; the parent expects the URI and the service file to outrank Y6\'s variables');
    }
  }
}

/** PQ2-c: PQ1's three legs on this client, through the builder. */
async function legPQ2c(rig) {
  const cases = [
    ['PQ2-c1', '?passfile= naming the rig home\'s .pgpass', (port) => `postgresql://pdprobe@127.0.0.1:${port}/pdprobe?passfile=${encodeURIComponent(rig.pgpass)}`, 'the .pgpass marker'],
    ['PQ2-c2', '?service=s1 (a password in the section)', (port) => `postgresql://pdprobe@127.0.0.1:${port}/pdprobe?service=s1`, 'the service-file password marker'],
    ['PQ2-c3', '?service=s2 (a passfile in the section)', (port) => `postgresql://pdprobe@127.0.0.1:${port}/pdprobe?service=s2`, 'the service-file passfile marker'],
  ];
  for (const [id, label, uriOf, expected] of cases) {
    const run = await pq2Run(rig, { build: viaBuilder(rig, uriOf) });
    pq2Check(id, run, 'plain');
    recordPassword(id, `the stored URI whole through buildDbQueryLaunch, ${label}`, run);
    if (labelled(run.state.password) !== expected) {
      stop(id, `the password message was not ${expected}; the parent expects this URI to leak it`);
    }
  }
}

/** The environment of PQ2-d1 and d4: the three client files named by hand at the rig's marker files (the opposite of Y6). */
const markerEnv = (rig) => ({ PGPASSFILE: rig.pgpass, PGSSLCERT: rig.marker.cert, PGSSLKEY: rig.marker.key });

/** The shape Z2 will write, ending in the three keywords at the absent file. */
const zShape = (port, settings, tail) => keywordString([['host', '127.0.0.1'], ['port', String(port)], ['dbname', 'pdprobe'], ['user', 'pdprobe'], ...settings, ...tail]);
const absentThree = (rig) => [['passfile', rig.absentFile], ['sslcert', rig.absentFile], ['sslkey', rig.absentFile]];

/** PQ2-d1: the keywords at the absent file against an environment that names the person's marker files. */
async function legPQ2d1(rig) {
  const password = await pq2Run(rig, { build: (port) => byHand(rig, zShape(port, [['sslmode', 'disable']], absentThree(rig)), { over: markerEnv(rig) }) });
  pq2Check('PQ2-d1', password, 'plain');
  recordPassword('PQ2-d1', 'a keyword string ending in passfile, sslcert and sslkey at the absent file; PGPASSFILE, PGSSLCERT and PGSSLKEY at the rig\'s marker files (password leg)', password);
  if (isMarker(password.state.password)) {
    stop('PQ2-d1', 'the .pgpass marker was sent although the keyword names the absent file: a keyword loses to the environment');
  }
  const certificate = await pq2Run(rig, { tlsMaterial: rig.selfSignedTls, build: (port) => byHand(rig, zShape(port, [['sslmode', 'require']], absentThree(rig)), { over: markerEnv(rig) }) });
  pq2Check('PQ2-d1', certificate, 'tls');
  recordCertificate('PQ2-d1', 'the same string with sslmode=require and the same environment (certificate leg)', certificate);
  if (certificate.state.peer?.offered) {
    stop('PQ2-d1', 'a client certificate was offered although the keywords name the absent file: a keyword loses to the environment');
  }
}

/** PQ2-d2: a service file with a password is present, and no service is named anywhere. */
async function legPQ2d2(rig) {
  const run = await pq2Run(rig, { build: (port) => byHand(rig, zShape(port, [['sslmode', 'disable']], absentThree(rig))) });
  pq2Check('PQ2-d2', run, 'plain');
  check('(PQ2-d2) the rig home holds a .pg_service.conf', fs.existsSync(rig.serviceFile), rig.serviceFile);
  recordPassword('PQ2-d2', 'the same string under Y6\'s environment; the rig home\'s .pg_service.conf holds a section with a password (s1) and no service is named anywhere', run);
  if (isMarker(run.state.password)) {
    stop('PQ2-d2', 'a marker was sent with no service named: the client read the unnamed service file');
  }
}

/** PQ2-d3: `passfile` twice in the string, in both orders. */
async function legPQ2d3(rig) {
  for (const [label, first, second] of [['the absent file first, the rig\'s .pgpass second', rig.absentFile, rig.pgpass], ['the rig\'s .pgpass first, the absent file second', rig.pgpass, rig.absentFile]]) {
    const run = await pq2Run(rig, { build: (port) => byHand(rig, zShape(port, [['sslmode', 'disable']], [['passfile', first], ['passfile', second]])) });
    pq2Check('PQ2-d3', run, 'plain');
    recordPassword('PQ2-d3', `passfile written twice, ${label}`, run);
  }
}

/** PQ2-d4: `require_auth` and `sslcertmode`, each against an environment that says the opposite, each with a control that has no keyword. */
async function legPQ2d4(rig) {
  const authCases = [
    ['require_auth=scram-sha-256 in the string; PGREQUIREAUTH=password; the stored password in PGPASSWORD', [['require_auth', 'scram-sha-256']]],
    ['control: no require_auth keyword; PGREQUIREAUTH=password; the stored password in PGPASSWORD', []],
  ];
  for (const [label, keywords] of authCases) {
    const run = await pq2Run(rig, { build: (port) => byHand(rig, zShape(port, [['sslmode', 'disable'], ...keywords], absentThree(rig)), { password: PQ2_STORED_PASSWORD, over: { PGREQUIREAUTH: 'password' } }) });
    check(`(PQ2-d4) the client ended in time (${keywords.length > 0 ? 'require_auth' : 'control'})`, run.ended, shape(run));
    recordPassword('PQ2-d4', label, run);
  }
  const certCases = [
    ['sslcertmode=disable in the string; PGSSLCERTMODE=allow with PGSSLCERT and PGSSLKEY at the rig\'s marker files', [['sslcertmode', 'disable']]],
    ['control: no sslcertmode keyword; PGSSLCERTMODE=allow with PGSSLCERT and PGSSLKEY at the rig\'s marker files', []],
  ];
  for (const [label, keywords] of certCases) {
    const run = await pq2Run(rig, { tlsMaterial: rig.selfSignedTls, build: (port) => byHand(rig, zShape(port, [['sslmode', 'require'], ...keywords], []), { over: { ...markerEnv(rig), PGSSLCERTMODE: 'allow' } }) });
    check(`(PQ2-d4) the client ended in time (${keywords.length > 0 ? 'sslcertmode' : 'control'})`, run.ended, shape(run));
    recordCertificate('PQ2-d4', label, run);
  }
}

/** PQ2-e: the stored URI whole with the key `passfile` spelled four other ways. */
async function legPQ2e(rig) {
  const enc = encodeURIComponent;
  const uri = (port, query) => `postgresql://pdprobe@127.0.0.1:${port}/pdprobe?${query}`;
  const cases = [
    ['%70assfile (the first letter percent-encoded)', (port) => uri(port, `%70assfile=${enc(rig.pgpass)}`)],
    ['PASSFILE (capital letters)', (port) => uri(port, `PASSFILE=${enc(rig.pgpass)}`)],
    ['passfile twice, the absent file first and the rig\'s .pgpass second', (port) => uri(port, `passfile=${enc(rig.absentFile)}&passfile=${enc(rig.pgpass)}`)],
    ['passfile twice, the rig\'s .pgpass first and the absent file second', (port) => uri(port, `passfile=${enc(rig.pgpass)}&passfile=${enc(rig.absentFile)}`)],
  ];
  for (const [label, uriOf] of cases) {
    const run = await pq2Run(rig, { build: viaBuilder(rig, uriOf) });
    check(`(PQ2-e) the client ended in time (${label})`, run.ended, shape(run));
    recordPassword('PQ2-e', `the stored URI whole through buildDbQueryLaunch, the key spelled ${label}`, run);
  }
}

/** PQ2-f: `sslmode=verify-full` against a server certificate a marker CA signed: the CA file, no CA file, and a revocation list. */
async function legPQ2f(rig) {
  const root = path.join(rig.home, '.postgresql', 'root.crt');
  const crl = path.join(rig.home, '.postgresql', 'root.crl');
  const cases = [
    ['with the CA in the rig home\'s .postgresql/root.crt', () => fs.copyFileSync(rig.ca.cert, root)],
    ['without root.crt', () => fs.rmSync(root, { force: true })],
    ['with root.crt and a root.crl that revokes the server\'s certificate', () => {
      rig.ca.revoke();
      fs.copyFileSync(rig.ca.cert, root);
      fs.copyFileSync(rig.ca.crl, crl);
    }],
  ];
  console.log('note (PQ2-f): psql asks again for a password after "no password supplied", so a second start-up in the list is its retry on a new connection');
  const read = [];
  try {
    for (const [label, arrange] of cases) {
      arrange();
      const run = await pq2Run(rig, { tlsMaterial: rig.caTls, build: viaBuilder(rig, (port) => `postgresql://pdprobe@127.0.0.1:${port}/pdprobe?sslmode=verify-full`) });
      check(`(PQ2-f) the client ended in time and asked for TLS (${label})`, run.ended && run.state.sslRequests >= 1, shape(run));
      const connected = run.state.secured >= 1 && run.state.startups >= 1;
      recordCertificate('PQ2-f', `sslmode=verify-full through buildDbQueryLaunch, ${label}: the connection ${connected ? 'WAS made' : 'was NOT made'}`, run, ` the server read ${JSON.stringify(run.state.kinds)} after the handshake;`);
      read.push({ connected, run });
    }
  } finally {
    fs.rmSync(root, { force: true });
    fs.rmSync(crl, { force: true });
  }
  if (!read[0].connected || read.some(({ run }) => run.state.peer?.offered || run.state.kinds.some((kind) => kind !== 'startup'))) {
    stop('PQ2-f', 'with the CA in root.crt the connection was not made, or a client certificate was offered, or the server read more than the handshake and the start-up message');
  }
}

/** PQ2-g, -h: the shape Z2 will write, with every marker file in the rig home; and a database name that looks like a connection string. */
async function legPQ2gh(rig) {
  const g = await pq2Run(rig, { build: (port) => byHand(rig, keywordString([['host', '127.0.0.1'], ['port', String(port)], ['dbname', 'pdprobe'], ['user', 'pdprobe'], ['sslmode', 'disable']]), { password: PQ2_STORED_PASSWORD }) });
  pq2Check('PQ2-g', g, 'plain');
  recordPassword('PQ2-g', 'host, port, dbname, user and sslmode in one keyword string after --; the stored password in PGPASSWORD; every marker file in the rig home', g);
  if (labelled(g.state.password) !== 'the stored password') {
    stop('PQ2-g', 'the server did not receive the stored password and nothing else');
  }
  const named = await pq2Run(rig, { build: (port) => byHand(rig, keywordString([['host', '127.0.0.1'], ['port', String(port)], ['dbname', 'service=s1'], ['user', 'pdprobe'], ['sslmode', 'disable']]), { password: PQ2_STORED_PASSWORD }) });
  pq2Check('PQ2-h', named, 'plain');
  recordPassword('PQ2-h', 'PQ2-g with the database name service=s1', named);
  console.log(`record (PQ2-h) the database name the server read in the start-up message: ${JSON.stringify(named.state.params?.database ?? null)} (the leg wrote "service=s1")`);
  if (named.state.params?.database !== 'service=s1' || labelled(named.state.password) !== 'the stored password') {
    stop('PQ2-h', 'a database name that looks like a connection string was read as one');
  }
  const uri = await pq2Run(rig, {
    second: true,
    build: (port, otherPort) => byHand(rig, keywordString([['host', '127.0.0.1'], ['port', String(port)], ['dbname', `postgresql://127.0.0.1:${otherPort}/other`], ['user', 'pdprobe'], ['sslmode', 'disable']]), { password: PQ2_STORED_PASSWORD }),
  });
  check('(PQ2-h) the client ended in time and reached one of the two fake servers', uri.ended && uri.state.startups + uri.other.startups >= 1, shape(uri));
  const where = uri.other.startups > 0 ? 'the OTHER server (named inside the database name)' : 'the named host';
  console.log(`record (PQ2-h) PQ2-g with a database name that begins postgresql:// and names another host: the client reached ${where}; the named host read the database name ${JSON.stringify(uri.state.params?.database ?? null)}; the other server read ${JSON.stringify(uri.other.params?.database ?? null)}; the password messages: named host ${labelled(uri.state.password)}, other server ${labelled(uri.other.password)}; psql said ${said(uri)}`);
  if (uri.other.startups > 0) {
    stop('PQ2-h', 'a database name that begins postgresql:// sent the client to another host');
  }
}

/** All of PQ2, after the client's version. */
async function legPQ2(scope, exe, dir, product, version) {
  console.log(`record (PQ2) psql --version: ${version}`);
  const rig = pq2Rig(scope, dir, product);
  rig.exe = exe;
  check('(PQ2) the path given as the absent file does not exist', !fs.existsSync(rig.absentFile), rig.absentFile);
  for (const leg of [legPQ2ab, legPQ2c, legPQ2d1, legPQ2d2, legPQ2d3, legPQ2d4, legPQ2e, legPQ2f, legPQ2gh]) {
    await leg(rig);
  }
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
    await legPQ2(scope, exe, dir, product, version);
  }
  console.log(failures === 0 ? '\nall bridged psql checks passed' : `\n${failures} check(s) failed`);
  return failures === 0 ? 0 : 1;
}

harnessScope.run(main);
