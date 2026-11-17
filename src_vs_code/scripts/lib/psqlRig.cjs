// The rig of the bridged `psql` harness (E1.6, the spec §S6.14 Y0 and §S6.15 Z0, Z5): the fake servers, the run of one `psql` against one of them, the
// throwaway certificates, and the words a log line may use for a password message (never its text). `bridged-psql-itest.cjs` has the legs of PD2, PD3 and (r);
// `lib/psqlProbeLegs.cjs` has PQ2 and (s).
const fs = require('fs');
const path = require('path');
const net = require('node:net');
const tls = require('node:tls');
const childProcess = require('node:child_process');
const { execFileSync } = childProcess;
const { launch, endChild } = require('../itestSshd.cjs');

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

const SPAWNERS = ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'];

/**
 * Runs `action` and answers how many processes ANYTHING in this node process asked `child_process` to start while it ran: the harness's own and the product's. The seven
 * starters are replaced on the shared module object for the duration (the product reads them at call time), so a builder that launched anything would be counted;
 * (s) asserts that a refused entry starts none, and proves the observer sees a start before it trusts a zero.
 */
function spawnsDuring(action) {
  const original = Object.fromEntries(SPAWNERS.map((name) => [name, childProcess[name]]));
  let count = 0;
  for (const name of SPAWNERS) {
    childProcess[name] = function counted(...args) {
      count += 1;
      return original[name].apply(this, args);
    };
  }
  try {
    action();
  } finally {
    Object.assign(childProcess, original);
  }
  return count;
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

/** A throwaway self-signed certificate and its key, made by `openssl` into `folder`: `{ key, cert }` as file names. */
function throwawayCertificate(folder, name, commonName) {
  const key = path.join(folder, `${name}.key`);
  const cert = path.join(folder, `${name}.crt`);
  // The PATH's openssl is the tool that makes the rig's own throwaway material.
  execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-days', '1', '-subj', `/CN=${commonName}`, '-keyout', key, '-out', cert], { stdio: 'pipe' }); // NOSONAR
  fs.chmodSync(key, 0o600);
  return { key, cert };
}

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

module.exports = {
  PD2_PASSWORD_MARKER, PD3_MARKER_CN, PQ2_SECOND_CN, PQ2_SERVICE_PASSWORD_MARKER, PQ2_SERVICE_PASSFILE_MARKER, PQ2_STORED_PASSWORD,
  holdsMarker, described, labelled, isMarker, said, shape, keywordString, versionOf, endedWithin, psqlRun, spawnsDuring, throwawayCertificate, throwawayCa,
};
